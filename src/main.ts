import './game/pixiSetup';
import {mountWorldBossLive} from './game/worldBossLive';
import {mountDungeonLive} from './game/dungeonLive';
import { preferences } from './game/preferences';
import { mountWasteland } from './game/wasteland';
import { GameView } from './game/render';
import { clearLegacySave, parseSave, readLegacySave } from './game/store';
import { applyOfflineRewards } from './game/offline';
import { wireDomainEvents } from './game/domainWiring';
import { readAutoSalvage } from './ui/autoSalvage';
import { readSalvagePlus } from './ui/salvagePlus';
import { readSalvageRarity } from './ui/salvageRarity';
import { World } from './game/world';
import { Interface } from './ui/interface';
import { clearToken, openLogin } from './ui/login';
import { MAINTENANCE_EVENT, MaintenanceWatch, type MaintenanceState } from './game/maintenance';
import { showMaintenancePopup, type MaintenancePopup } from './ui/maintenance';
import './styles/main.css';
import { SaveSync } from './game/sync';
import { createBootOverlay } from './ui/boot';
import { ReconnectNotice } from './ui/reconnect';

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
    // 도메인 신호(작업 256) — 화면·도감이 사건을 듣도록 앱 시작 때 한 번 등록한다.
    wireDomainEvents();
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
    // 방치 정산도 자동 분해를 따른다(작업 254). 화면(Interface)이 아직 없으므로, 기기에 저장된
    // 스위치·등급 기준·`+N까지` 상한을 그대로 읽어 넘긴다.
    const offlineReward = applyOfflineRewards(save, session.offlineSeconds ?? 0, {
      autoSalvage: readAutoSalvage() ? readSalvageRarity() : undefined,
      autoSalvagePlus: readSalvagePlus(),
    });
    const world = new World(save);
    const sync = new SaveSync(save, session);
    function flush(): Promise<boolean> { return sync.flush(); }
    const ui = new Interface(appRoot, world, () => { sync.queueSave(); }, session, async () => {
      try { await sync.reset(); } catch (error) { ui.message(`데이터 초기화 실패: ${String(error)}`); }
    }, sync);
    mountWorldBossLive(ui);
    mountDungeonLive(ui);
    boot.attach();
    sync.onStatus = state => ui.setSaveStatus(state);
    sync.onMessage = message => ui.message(message);
    /**
     * 재접속 안내(작업 251) — 창을 내렸다가 돌아올 때 요청이 끊기면 "서버에 연결할 수 없습니다" 대신
     * `게임에 접속 중입니다…`를 띄운다. 3초마다 저장을 다시 보내고, 다시 붙으면 안내가 저절로 사라진다.
     * 20초가 지나도 안 붙을 때만 '다시 시도' 버튼이 있는 상태 확인 안내로 바뀐다.
     */
    const reconnect = new ReconnectNotice({ onRetry: () => { void sync.flushIfDirty(); } });
    sync.onNetwork = state => { if (state === 'recovered') reconnect.recovered(); else reconnect.show(); };
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
    // 로그아웃(작업 210, #4347 후속): 저장이 실패해도 유저가 이 화면에 갇히지 않게 한 번 확인하고 나갈 길을 준다.
    window.addEventListener('game-logout', async () => {
      const ok = await flush();
      if (!ok && !confirm('서버 저장에 실패했습니다. 저장되지 않은 상태로 로그아웃할까요?')) return;
      clearToken(); location.reload();
    });
    gameUi = ui;
    if (pendingMessage) ui.message(pendingMessage);
    if (offlineReward) ui.showOfflineReward(offlineReward);
    // 방치 정산·기존 세이브 이전으로 세이브가 바뀌었으니 **변경 표시를 남기고** 저장한다(작업 255).
    // `flush()`는 dirty와 무관하게 스냅샷을 보내므로 지금도 저장되지만, 표시가 없으면 이 저장이
    // 시작 전에 건너뛰였을 때(`locked`·`pendingWarehouse` 등) `transferWarehouse`가 `dirty`를 보고
    // flush를 생략해 **서버에 없는 보상이 응답 세이브에 덮인다**. 표시를 남기면 그 경우에도 먼저 저장한다.
    if (legacyKey || offlineReward) { sync.markDirty(); void flush(); }
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

    // 배포 점검(작업 256): 20초마다·탭이 돌아올 때 `maintenance.json`을 다시 읽는다. 점검이 켜지면
    // ① 전투를 멈추고 ② 저장을 시도한 뒤(최대 3초) ③ 로그인 화면으로 돌아간다. 로그인 화면이 같은
    // "점검 진행 중입니다 + 예상 시간" 모달로 다시 막으므로, 접속 중인 플레이어는 화면이 바뀌어도
    // 이유를 바로 알 수 있다(예전에는 사냥 화면에서 그대로 플레이됐다).
    let leavingForMaintenance = false;
    let maintenancePopup: MaintenancePopup | null = null;
    const applyMaintenance = (state: MaintenanceState) => {
      if (!state.active) return;
      maintenancePopup?.remove(); maintenancePopup = null;
      maintenancePopup = showMaintenancePopup(document.body, state, () => { void recheckMaintenance(); });
      if (leavingForMaintenance) return;
      leavingForMaintenance = true;
      world.paused = true;
      try { view.app.ticker.stop(); } catch { /* 이미 멈춤 */ }
      const flushed = Promise.race([sync.flush().catch(() => false), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000))]);
      void flushed.then(() => { maintenancePopup?.note('로그인 화면으로 이동합니다…'); setTimeout(() => location.reload(), 1200); });
    };
    const recheckMaintenance = async () => {
      const state = await watch.check();
      if (!state) { maintenancePopup?.busy(false); maintenancePopup?.note('점검 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
      if (state.active) applyMaintenance(state); else maintenancePopup?.busy(false);
    };
    const watch = new MaintenanceWatch({ onMaintenance: applyMaintenance });
    watch.start();
    // API가 503 점검을 돌려주면 곧바로 점검 파일을 다시 확인한다 — 정적 파일이 먼저 열려 있어도 20초를 기다리지 않는다.
    window.addEventListener(MAINTENANCE_EVENT, () => { void recheckMaintenance(); });

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
    // 창을 내릴 때 한 번 저장하고, **다시 올리면 곧바로 다시 보낸다**(작업 251) — 숨김 상태에서 끊긴 저장이
    // 10초 자동 저장 간격을 기다리지 않고 돌아오자마자 재연결된다.
    document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(); else void sync.flushIfDirty(); });
    window.addEventListener('online', () => { void sync.flushIfDirty(); });
    // 변경이 있을 때만 보낸다 — 예전에는 진행이 없어도 5초(작업 245 이전)마다 저장 요청이 나갔다.
    // 작업 245: 무료 Functions 한도 때문에 확인 간격을 10초로 늘렸다(실제 전송 간격은 `SaveSync.queueSave`).
    setInterval(() => { void sync.flushIfDirty(); }, 10000);

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
