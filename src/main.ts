import { GameView } from './game/render';
import { clearLegacySave, parseSave, readLegacySave } from './game/store';
import { applyOfflineRewards } from './game/offline';
import { World } from './game/world';
import { Interface } from './ui/interface';
import { accountRequest, clearToken, openLogin } from './ui/login';
import './styles/main.css';

const root = document.getElementById('app');
if (!root) throw new Error('앱 루트 요소가 없습니다.');
const appRoot = root;
let pendingMessage = '';
let gameUi: Interface | undefined;
window.addEventListener('game-message', (event: Event) => {
  pendingMessage = (event as CustomEvent<string>).detail;
  gameUi?.message(pendingMessage);
});
const session = await openLogin(appRoot);
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
let resetting = false;
let pending = false;
let activeSave: Promise<boolean> | undefined;
let saveState: '저장됨' | '저장 중' | '저장 실패' = '저장됨';
const setSaveState = (state: typeof saveState) => { saveState = state; ui?.setSaveStatus(state); };
function flush(): Promise<boolean> {
  if (resetting) return Promise.resolve(false);
  pending = true;
  if (activeSave) return activeSave;
  activeSave = (async () => {
    while (pending) {
      pending = false; setSaveState('저장 중');
      try {
        const result = await accountRequest<{ ok: boolean }>('save', { save: structuredClone(save) }, session.token);
        if (result.ok !== true) throw new Error('서버가 저장 완료를 확인하지 않았습니다.');
        if (legacyKey) { clearLegacySave(legacyKey); legacyKey = undefined; ui.message('기존 진행 상황을 서버로 이전했습니다.'); }
        setSaveState('저장됨');
      } catch (error) { pending = true; setSaveState('저장 실패'); ui.message(`서버 저장 실패: ${String(error)}`); return false; }
    }
    return true;
  })().finally(() => { activeSave = undefined; });
  return activeSave;
}
const ui = new Interface(appRoot, world, () => { void flush(); }, session, async () => {
  resetting = true;
  try { if (activeSave) await activeSave; await accountRequest('reset', {}, session.token); location.reload(); }
  catch (error) { resetting = false; ui.message(`데이터 초기화 실패: ${String(error)}`); }
});
window.addEventListener('game-logout', async () => { const ok = await flush(); if (ok) { clearToken(); location.reload(); } });
gameUi = ui;
if (pendingMessage) ui.message(pendingMessage);
if (offlineReward) ui.showOfflineReward(offlineReward);
if (legacyKey || offlineReward) void flush();
const view = new GameView();
try { await view.mount(ui.canvasHost); }
catch (error) {
  const failure = document.createElement('div'); failure.className = 'load-error';
  failure.textContent = `그래픽 리소스를 불러오지 못했습니다. 새로고침 후 다시 시도하세요. (${String(error)})`;
  appRoot.appendChild(failure);
  throw error;
}

window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (key === ' ') e.preventDefault();
  if (e.repeat) return;
  if (key === ' ') world.action('attack');
  if (key === '1') world.action(save.quickSlots[0]);
  if (key === '2') world.action(save.quickSlots[1]);
  if (key === '3') world.action(save.quickSlots[2]);
});
window.addEventListener('blur', () => { world.attackHeld = false; void flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(); });
setInterval(() => { void flush(); }, 5000);

let previous = performance.now(), time = 0;
view.app.ticker.add(() => {
  const now = performance.now(), dt = Math.min(.05, (now - previous) / 1000); previous = now; time += dt;
  world.update(dt);
  view.draw(world, time); ui.tick();
});
