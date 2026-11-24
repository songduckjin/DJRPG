import './game/pixiSetup';
import {mountWorldBossLive} from './game/worldBossLive';
import {mountDungeonLive} from './game/dungeonLive';
import {mountDefenseLive} from './game/defenseLive';
import { preferences } from './game/preferences';
import { mountWasteland } from './game/wasteland';
import { GameView } from './game/render';
import { clearLegacySave, parseSave, readLegacySave } from './game/store';
import { applyOfflineRewards } from './game/offline';
import { acceptedItems, BACKGROUND_MIN_SECONDS, BACKGROUND_SAVE_FAILED_NOTICE, BACKGROUND_WORLD_BOSS_NOTICE, backgroundNeedsPopup, backgroundSettleSeconds, backgroundToast } from './game/background';
import { wireDomainEvents } from './game/domainWiring';
import { readAutoSalvage } from './ui/autoSalvage';
import { readSalvagePlus } from './ui/salvagePlus';
import { readSalvageRarity } from './ui/salvageRarity';
import { World } from './game/world';
import { Interface } from './ui/interface';
import { clearToken, openLogin, accountRequest, type Session } from './ui/login';
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
    const sync = new SaveSync(save, session);
    // 방치 보상은 서버가 수락한 뒤에만 화면에 공개한다. 저장 충돌·응답 유실 상태에서
    // 미확정 아이템을 먼저 보여 주면 재접속 때 다른 드롭으로 바뀐 것처럼 보인다.
    if (legacyKey || offlineReward) {
      sync.markDirty();
      if (!await sync.flush()) {
        boot.fail(sync.conflicted
          ? '진행 상황이 다른 곳에서 변경되었습니다. 새로고침하여 최신 데이터를 불러와 주세요.'
          : '방치 보상을 서버에 저장하지 못했습니다. 연결을 확인한 뒤 새로고침해 주세요.');
        return;
      }
      if (legacyKey) { clearLegacySave(legacyKey); legacyKey = undefined; pendingMessage = '기존 진행 상황을 서버로 이전했습니다.'; }
      if (offlineReward) {
        const accepted = new Set(save.bag.map(item => item.id));
        offlineReward.items = offlineReward.items.filter(item => accepted.has(item.id));
        if (sync.lastSaveClamped.length) offlineReward.adjusted = true;
      }
    }
    const world = new World(save);
    function flush(): Promise<boolean> { return sync.flush(); }
    const ui = new Interface(appRoot, world, () => { sync.queueSave(); }, session, async () => {
      try { await sync.reset(); } catch (error) { ui.message(`데이터 초기화 실패: ${String(error)}`); }
    }, sync);
    mountWorldBossLive(ui);
    mountDungeonLive(ui);
    mountDefenseLive(ui);
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
    /**
     * 자리 비움 정산(작업 261) — 탭을 내려 둔 시간을 방치와 같은 규칙으로 **한 번** 정산한다.
     *
     * 덕진 님 확정 기준(2026-11-24): 60초 미만은 그대로 복귀, 60~179초는 토스트 한 줄, 180초 이상이나
     * 놓치면 아쉬운 결과(유니크·전설·레벨업·층 상승·자동 분해)는 기존 방치 정산 팝업.
     *
     * 한 바퀴: 숨김 진입에서 **한 번 저장**(서버 `updated_at` = 숨김 시각) → 숨김 동안 예약 저장 없음 →
     * 복귀에서 `load` 1회로 서버 경과·revision·슬롯 확인 → `min(서버 경과, 숨김초, 12시간)`만큼 기존
     * `applyOfflineRewards()`를 그대로 한 번 → 필드 재구성 → `markDirty()` + `flush()`(서버 시각이 지금으로
     * 이동해 같은 구간은 다시 정산되지 않는다) → 토스트나 팝업.
     *
     * 정산 저장이 실패하면 보상은 메모리에만 남고 서버는 옛 `updated_at`을 들고 있으므로, 새로고침 뒤
     * 다음 접속이 같은 구간을 **한 번** 정산한다 — 두 번 주지 않는다.
     */
    let hiddenAt = 0;
    let settling = false;
    /** 정산 중에 다시 숨겼다 돌아온 구간(ms) — 정산이 끝난 뒤 이어서 정산한다(보이는 시간을 섞지 않는다). */
    let pendingHideMs = 0;
    /** 숨김 시작 시각을 한 번만 기록하고, 그 순간부터 예약 저장을 멈춘다. */
    const rememberHidden = (): void => {
      if (!hiddenAt) hiddenAt = performance.now();
      sync.setHidden(true);
    };
    async function settleBackground(measuredMs?: number): Promise<void> {
      if (settling) return;
      if (measuredMs === undefined && !hiddenAt) { sync.setHidden(false); void sync.flushIfDirty(); return; }
      const hiddenMs = measuredMs ?? (performance.now() - hiddenAt);
      hiddenAt = 0;
      settling = true;
      const paused = world.paused;
      try {
        const hiddenSeconds = Math.floor(hiddenMs / 1000);
        if (hiddenSeconds < BACKGROUND_MIN_SECONDS) { void sync.flushIfDirty(); return; }
        // 결과를 확인하지 못한 요청·세션 복구 중이면 정산하지 않는다 — 그 흐름이 revision을 확정한 뒤
        // 다음 접속(또는 다음 숨김)이 그 구간을 방치 정산으로 처리한다.
        if (sync.conflicted || sync.locked) { void sync.flushIfDirty(); return; }
        // 월드보스는 서버 60초 시계가 계속 흘러 복귀 시 서버 결과로 도전이 마감된다 — 필드 정산을 하지 않는다.
        if (ui.worldBossField) { ui.message(BACKGROUND_WORLD_BOSS_NOTICE); void sync.flushIfDirty(); return; }
        // 끝없는 던전은 전투를 그대로 이어 간다(던전 시계는 서버 `startedAt` 기준이라 일시정지가 이득이 되지 않는다).
        if (appRoot.querySelector('.dungeon-field')) { void sync.flushIfDirty(); return; }
        world.paused = true;
        // ⑤ 서버 경과·revision·슬롯 확인 — 8초를 넘기거나 실패해도 정산을 막지 않는다(로컬 숨김초로 진행).
        const claim = await Promise.race([
          accountRequest<Session>('load', {}, sync.session.token),
          new Promise<undefined>(resolve => { setTimeout(() => resolve(undefined), 8000); }),
        ]).catch(() => undefined);
        if (claim && claim.characterSlot !== sync.session.characterSlot) { void sync.flushIfDirty(); return; }
        if (claim && claim.revision !== sync.revision) {
          // 로컬에 아직 못 보낸 진행이 있으면 서버 세이브로 덮지 않는다(덮으면 그 진행이 사라진다).
          if (sync.unsaved) { void sync.flushIfDirty(); return; }
          Object.assign(world.save, parseSave(claim.save, sync.session.accountId));
          sync.revision = claim.revision;
        }
        const seconds = backgroundSettleSeconds(hiddenSeconds, claim?.offlineSeconds);
        if (seconds < BACKGROUND_MIN_SECONDS) { world.resetField(); return; }
        const reward = applyOfflineRewards(world.save, seconds, {
          autoSalvage: ui.autoSalvage ? ui.salvageRarity : undefined,
          autoSalvagePlus: ui.salvagePlus,
        });
        if (!reward) return;
        sync.markDirty();
        // **서버가 수락한 뒤에만 보여 준다**(2026-11-24 오프라인 저장 오류 사고 뒤 규칙 — 시작·캐릭터 전환 정산과 같다).
        // 저장 충돌·조정으로 사라진 아이템을 먼저 보여 주면, 다음 접속에 다른 결과가 나온 것처럼 보인다.
        const saved = await sync.flush();
        world.resetField();
        if (!saved) {
          // 보상은 메모리에 남아 다음 저장에 실린다 — 서버는 옛 `updated_at`을 들고 있으므로 새로고침해도
          // 다음 접속이 같은 구간을 **한 번** 정산한다(중복 없음).
          ui.message(BACKGROUND_SAVE_FAILED_NOTICE);
          return;
        }
        // 서버 응답 세이브가 기준이다 — 가방에 실제로 남은 아이템만 보여 주고, 상한 조정이 있었으면 알린다.
        reward.items = acceptedItems(reward.items, world.save.bag);
        if (sync.lastSaveClamped?.length) reward.adjusted = true;
        ui.renderStatus(); ui.renderBagBadge();
        if (backgroundNeedsPopup(seconds, reward)) ui.showOfflineReward(reward);
        else ui.message(backgroundToast(reward));
      } catch (error) {
        // 정산 자체가 실패해도 사냥은 그대로 돌아간다 — 다음 저장·재접속이 진행을 보존한다.
        console.warn('자리 비움 정산을 마치지 못했습니다.', error);
      } finally {
        settling = false; world.paused = paused;
        // 정산 저장이 나갈 때까지 숨김 상태를 유지한다 — 그 사이 자동 저장이 먼저 성공하면 서버의
        // `updated_at`이 밀려 정산분이 저장 상한(`elapsedSince`)에 잘린다. 정산 저장은 명시적인
        // `flush()`다. 정산 중에 다시 숨겼다 돌아왔다면(아래 `pendingHideMs`) 그 구간을 이어서 정산한다.
        sync.setHidden(!!hiddenAt || pendingHideMs > 0);
        if (pendingHideMs > 0) { const ms = pendingHideMs; pendingHideMs = 0; void settleBackground(ms); }
        else if (!hiddenAt) void sync.flushIfDirty();
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        rememberHidden();
        // 숨김 진입에서 한 번만 저장한다(응답을 기다려 화면을 붙잡지 않는다).
        void Promise.race([flush(), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000))]);
      } else if (settling) {
        // 정산 중에 돌아왔다 — 지금 구간을 재 두었다가 정산이 끝나면 이어서 정산한다.
        if (hiddenAt) { pendingHideMs = performance.now() - hiddenAt; hiddenAt = 0; }
      } else void settleBackground();
    });
    // bfcache 복귀도 같은 정산 경로를 쓴다. `pagehide`는 탭을 닫는 경우에도 오므로 저장만 한다(정산 없음).
    window.addEventListener('pagehide', () => { rememberHidden(); void flush(); });
    window.addEventListener('pageshow', event => { if ((event as PageTransitionEvent).persisted) void settleBackground(); });
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
