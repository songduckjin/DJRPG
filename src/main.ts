import './game/pixiSetup';
import { preferences } from './game/preferences';
import { mountWasteland } from './game/wasteland';
import { GameView } from './game/render';
import { clearLegacySave, parseSave, readLegacySave } from './game/store';
import { applyOfflineRewards } from './game/offline';
import { World } from './game/world';
import { Interface } from './ui/interface';
import { clearToken, openLogin } from './ui/login';
import './styles/main.css';
import { SaveSync } from './game/sync';
import { createBootOverlay } from './ui/boot';

const root = document.getElementById('app');
if (!root) throw new Error('앱 루트 요소가 없습니다.');
const appRoot = root;
const boot = createBootOverlay(appRoot);
let booting = true;
let pendingMessage = '';
let gameUi: Interface | undefined;
window.addEventListener('game-message', (event: Event) => {
  pendingMessage = (event as CustomEvent<string>).detail;
  gameUi?.message(pendingMessage);
});
window.addEventListener('error', event => { if (booting) boot.fail(event.error ?? event.message); });
window.addEventListener('unhandledrejection', event => { if (booting) boot.fail(event.reason); });

async function start(): Promise<void> {
  try {
    const session = await openLogin(appRoot);
    boot.show();
    const save = parseSave(session.save, session.accountId);
    let legacyKey: string | undefined;
    if (session.guest || session.newAccount) {
      try {
        const legacy = readLegacySave(session.guest ? undefined : session.loginId);
        if (legacy) { Object.assign(save, parseSave(legacy.save, session.accountId)); legacyKey = legacy.key; }
      } catch (error) { pendingMessage = `기존 진행 상황을 읽지 못했습니다: ${String(error)}`; }
    }
    const offlineReward = applyOfflineRewards(save, session.offlineSeconds ?? 0);
    const world = new World(save);
    const sync = new SaveSync(save, session);
    function flush(): Promise<boolean> { return sync.flush(); }
    const ui = new Interface(appRoot, world, () => { sync.queueSave(); }, session, async () => {
      try { await sync.reset(); } catch (error) { ui.message(`데이터 초기화 실패: ${String(error)}`); }
    }, sync);
    boot.attach();
    sync.onStatus = state => ui.setSaveStatus(state);
    sync.onMessage = message => ui.message(message);
    sync.onPause = paused => { world.paused = paused; appRoot.classList.toggle('sync-busy', paused); };
    sync.onSaved = () => { if (legacyKey) { clearLegacySave(legacyKey); legacyKey = undefined; ui.message('기존 진행 상황을 서버로 이전했습니다.'); } };
    // 다른 기기 로그인으로 이 기기 세션이 끝나면 토큰이 이미 지워졌으므로, 알린 뒤 로그인 화면으로 돌아간다.
    sync.onSessionEnded = message => {
      const overlay = document.createElement('div'); overlay.className = 'sync-conflict';
      const note = document.createElement('p'); note.textContent = message;
      const button = document.createElement('button'); button.textContent = '로그인 화면으로'; button.onclick = () => location.reload();
      overlay.append(note, button); document.body.appendChild(overlay);
      setTimeout(() => location.reload(), 8000);
    };
    window.addEventListener('game-logout', async () => { const ok = await flush(); if (ok) { clearToken(); location.reload(); } });
    gameUi = ui;
    if (pendingMessage) ui.message(pendingMessage);
    if (offlineReward) ui.showOfflineReward(offlineReward);
    if (legacyKey || offlineReward) void flush();
    const view = new GameView();
    let renderTotal = 0;
    await view.mount(ui.canvasHost, (loaded, total) => {
      renderTotal = total;
      boot.update(loaded, total + 1);
    });
    await mountWasteland(view, () => boot.update(renderTotal + 1, renderTotal + 1));
    if (boot.failed) return;
    ui.suspendMainField = () => {
      const running=view.app.ticker.started;view.app.ticker.stop();
      return () => {if(running)view.app.ticker.start();};
    };

    window.addEventListener('keydown', e => {
      if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes((e.target as HTMLElement)?.tagName) || world.paused) return;
      const key = e.key.toLowerCase();
      if (key === ' ') e.preventDefault();
      if (e.repeat || ui.openModal) return;
      if (key === ' ') world.action('attack');
      if (key === '1') ui.pressSkillSlot(0);
      if (key === '2') ui.pressSkillSlot(1);
      if (key === '3') ui.pressSkillSlot(2);
    });
    window.addEventListener('blur', () => { world.attackHeld = false; void flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(); });
    setInterval(() => { void flush(); }, 5000);

    let previous = performance.now(), time = 0;
    view.app.ticker.add(() => {
      const maxFPS = preferences.powerSaving ? 30 : 60;
      if (view.app.ticker.maxFPS !== maxFPS) view.app.ticker.maxFPS = maxFPS;
      const now = performance.now(), dt = Math.min(.05, (now - previous) / 1000); previous = now; time += dt;
      world.update(dt);
      view.draw(world, time); ui.tick();
    });
    if (await boot.complete()) booting = false;
  } catch (error) { boot.fail(error); }
}

void start();
