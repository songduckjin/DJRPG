import { parseSave, type Save } from './store';
import { accountRequest, clearToken, type Session } from '../ui/login';
import { isNetworkOffline } from '../ui/reconnect';
import { apiHeaders, isOutdatedResponse, OUTDATED_MESSAGE, reloadForNewVersion } from './appVersion';

const sessionErrorCodes = ['SESSION_REPLACED', 'INVALID_TOKEN', 'UNAUTHORIZED'];
const conflictErrorCodes = ['ITEM_CONFLICT', 'CHARACTER_CONFLICT'];
/** 서버가 거래 트랜잭션에 들어가기 전에 거절한 코드 — `pendingMarket`을 남기지 않는다(작업 226). */
const transactionSkippedCodes = ['DB_UNAVAILABLE', 'DB_NOT_CONFIGURED'];
/**
 * 서버가 **세이브 자체**를 거절한 코드(400). 같은 세이브를 다시 보내도 결과가 같으므로 재시도로는 풀리지 않고,
 * 그대로 두면 `sync.flush()`가 계속 실패해 거래소·우편 수령이 영구히 잠긴다. 서버가 들고 있는 최신 세이브로
 * 화면을 맞춰 교착에서 벗어난다(작업 246 — 가방 40칸 초과로 저장이 막혀 우편함을 못 받던 제보 `#20869`).
 */
const saveRejectedCodes = ['INVALID_SAVE', 'INVALID_ITEM', 'INVALID_GOLD'];
const conflictReloadWindow = 10_000;
const conflictReloadMessage = '데이터 동기화가 어긋났습니다. 새로고침해 주세요.';
/**
 * 창고 이동 한 번의 요청(작업 258).
 *
 * 화면 세이브(`progress`)를 함께 실어 보내므로 서버는 **저장 1 + 이동 1**을 한 트랜잭션에서 끝낸다 —
 * 사냥 중(보낼 변경이 있는 상태)에도 저장 요청을 따로 왕복하지 않는다. 같은 `requestId`로 다시 보내면
 * 서버가 이미 처리한 요청이면 저장된 응답을 그대로 돌려주므로(멱등), 응답을 잃어도 두 번 옮기지 않는다.
 */
type WarehouseRequest = { action: 'deposit' | 'withdraw'; itemIds: string[]; requestId: string; revision: number; progress: Save };
/** 결과를 확인하지 못한 창고 이동을 다시 확인하는 간격 — 첫 확인은 짧게, 뒤로 갈수록 늘린다(합계 약 11.6초). */
const warehouseSettleDelays = [800, 1_600, 3_200, 6_000];
const errorCode = (error: unknown): string => error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code ?? '') : '';
const errorStatus = (error: unknown): number => error instanceof Error && 'status' in error ? Number((error as Error & { status?: unknown }).status) : 0;
const errorExpectedVersion = (error: unknown): unknown => error instanceof Error && 'expected' in error ? (error as Error & { expected?: unknown }).expected : undefined;

export type SyncResult = { journey?: import('./journey').JourneyData; ok: boolean; save: Save; revision: number; message?: string; effect?: { listing?: { id: string; state: string; soldAt?: number; quantity?: number; mine?: boolean }; deliveries: import('./market').Delivery[]; claimedId?: string; claimedIds?: string[] }; /** 창고 이동 뒤 창고 목록(작업 225) — 있으면 `list`를 다시 부르지 않고 이 값으로 그리드를 다시 그린다. */ items?: import('./items').Item[]; moved?: string[] };
/** 자동 저장 간격 — 변경이 있을 때만, 마지막 저장에서 이만큼 지난 뒤에 보낸다(작업 209).
 *  무료 Cloudflare Functions 한도(10만 건/일)를 넘기지 않도록 작업 245에서 간격을 늘렸다: 화면을 보고 있을 때
 *  10초, 앱을 내려 두었을 때(탭 숨김) 45초. 숨김으로 바뀌는 순간 `main.ts`가 한 번 저장하므로
 *  기기 화면을 끄기 전 진행은 그대로 남는다. */
const autosaveMinDelay = 1_000;
const autosaveMaxDelay = 10_000;
const autosaveHiddenDelay = 45_000;
export class SaveSync {
  revision: number;
  active?: Promise<boolean>;
  private pendingSave?: { save: Save; revision: number; requestId: string };
  /** 마지막 저장 실패 이유 — 저장 때문에 거래가 막힐 때 진짜 원인을 함께 보여 주기 위해서다(작업 246). */
  private lastSaveError = '';
  /** 세이브에 아직 서버로 못 보낸 변경이 있는지. 변경이 없으면 flush가 네트워크를 쓰지 않는다(작업 209). */
  private dirty = false;
  /** 변경 일련번호 — 저장을 시작한 시점과 비교해 "저장 중에 또 바뀌었는지"를 안다. */
  private changeSeq = 0;
  private lastSaveAt = 0;
  pending = false;
  locked = false;
  conflicted = false;
  pendingMarket?: { action: string; data: Record<string, unknown>; requestId: string; revision: number; progress: Save };
  /** 지금 보내고 있는 창고 이동 — 보내는 동안만 채워 두고 `finally`에서 반드시 비운다(작업 258). */
  pendingWarehouse?: WarehouseRequest;
  /** 결과를 확인하지 못한 이동을 같은 `requestId`로 다시 확인하는 중인가 — 화면은 잠그지 않는다. */
  warehouseSettling = false;
  private warehouseSettleTimer?: ReturnType<typeof setTimeout>;
  private preparingMarket = false;
  onStatus: (status: string) => void = () => {};
  onMessage: (message: string) => void = () => {};
  onPause: (paused: boolean) => void = () => {};
  onSaved: () => void = () => {};
  onWarehouseRecovered: () => void = () => {};
  onSessionEnded: (message: string) => void = () => {};
  /**
   * 연결이 끊겼다/다시 붙었다(작업 251).
   *
   * 창을 내렸다가 돌아온 직후처럼 요청이 끊긴 것뿐인데 "서버에 연결할 수 없습니다"를 빨갛게 띄우면
   * 고장으로 읽힌다. 끊김은 오류 문구 대신 `게임에 접속 중입니다…` 안내로 알리고(`connecting`),
   * 다음 저장이 성공하면 안내를 내린다(`recovered`).
   */
  onNetwork: (state: 'connecting' | 'recovered') => void = () => {};
  private reloadingConflict = false;
  private conflictReloadAt = 0;
  private conflictStopped = false;
  private sessionEnded = false;
  /** 캐릭터 전환 중인가 — 전환하는 동안에는 예약 저장을 걸지 않고 사냥을 멈춘다(작업 239). */
  private switching = false;
  /** 지금 연결이 끊겨 재접속 안내를 띄운 상태인가(작업 251). */
  private offline = false;
  constructor(public save: Save, public session: Session) { this.revision = session.revision; }
  private autosaveTimer?: ReturnType<typeof setTimeout>;
  queueSave(): void {
    this.markDirty();
    // 전환하는 동안 걸린 예약 저장은 전환 응답의 revision과 엇갈린다 — 전환 뒤 첫 변경에서 다시 건다(작업 239).
    if (this.switching) return;
    if (this.autosaveTimer !== undefined) return;
    // 바로 1초 뒤가 아니라, 마지막 저장에서 5초가 지난 시점까지 기다린다 — 사냥 중에는 처치마다 변경이
    // 생기므로 이 간격이 없으면 1초에 한 번씩 저장 요청이 나간다.
    const ceiling = typeof document !== 'undefined' && document.hidden ? autosaveHiddenDelay : autosaveMaxDelay;
    const wait = Math.max(autosaveMinDelay, Math.min(ceiling, this.lastSaveAt + ceiling - Date.now()));
    this.autosaveTimer = setTimeout(() => { this.autosaveTimer = undefined; void this.flush(); }, wait);
  }
  /**
   * 거래(구매·등록·취소·수령·창고)가 진행 중이거나 결과를 확인하지 못한 요청이 남아 있는가(작업 239).
   *
   * 이런 요청이 떠 있는 채로 캐릭터를 바꾸면 ① 그 응답의 `save`·`revision`이 **옛 캐릭터의 것**이라 새
   * 캐릭터의 화면 세이브를 덮어쓰고 ② `pendingMarket`이 옛 revision·옛 진행 세이브를 안고 남아 다음
   * 재확인이 409로 끝난다. 그래서 전환 전에 이 값으로 막고, 전환 응답을 받은 뒤에는 `resetForCharacterSwitch`로
   * 쓸모없어진 대기 상태를 버린다.
   */
  get trading(): boolean { return this.locked || this.preparingMarket || !!this.pendingMarket || !!this.pendingWarehouse || this.warehouseSettling; }
  /** 캐릭터 전환 시작 — 사냥을 멈추고 예약 저장을 취소해 저장·revision이 전환 경계를 넘지 않게 한다. */
  beginSwitch(): void {
    this.switching = true;
    this.cancelQueuedSave();
    this.onPause(true);
  }
  /** 전환 응답을 화면에 반영한 뒤 사냥을 다시 돌린다(거래 대기·동기화 잠금이 남아 있으면 풀지 않는다). */
  endSwitch(): void {
    this.switching = false;
    if (!this.conflicted && !this.locked && !this.pendingMarket && !this.pendingWarehouse && !this.warehouseSettling) this.onPause(false);
  }
  /**
   * 캐릭터가 바뀌었으니 **이전 캐릭터의** 거래 대기·저장 스냅샷·변경 표시를 버린다(작업 239).
   *
   * 전환 응답이 새 세이브·revision을 이미 들고 오므로, 남아 있던 진행 세이브를 그대로 두면 다음 저장이나
   * '거래 결과 다시 확인'이 옛 캐릭터의 진행도·옛 revision을 새 캐릭터 자리로 보내 409가 난다.
   */
  resetForCharacterSwitch(): void {
    this.cancelQueuedSave();
    // 결과를 확인하던 창고 이동도 버린다 — 옛 캐릭터의 revision·진행 세이브로 재확인하면 409가 난다(작업 258).
    if (this.warehouseSettleTimer !== undefined) clearTimeout(this.warehouseSettleTimer);
    this.warehouseSettleTimer = undefined; this.warehouseSettling = false;
    this.pendingMarket = undefined; this.pendingWarehouse = undefined;
    this.pendingSave = undefined; this.pending = false; this.preparingMarket = false;
    this.dirty = false;
  }
  /** 세이브가 바뀌었다고 표시한다. 저장은 `queueSave`·`flush`가 맡는다. */
  markDirty(): void { this.dirty = true; this.changeSeq++; }
  /** 보낼 변경이 없으면 아무것도 하지 않는다 — 5초마다 빈 저장을 보내지 않기 위한 입구. */
  flushIfDirty(): Promise<boolean> {
    if (!this.dirty && !this.pendingSave && !this.pending) return Promise.resolve(true);
    return this.flush();
  }
  private cancelQueuedSave(): void {
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
  }
  flush(): Promise<boolean> {
    this.cancelQueuedSave();
    // 결과를 확인하지 못한 창고 이동이 있으면 그 확인이 끝날 때까지 저장을 미룬다 — 그 사이 저장이 revision을
    // 올리면 재확인이 409로 끝나기 때문이다. 화면(사냥)은 멈추지 않으므로 진행은 그대로 쌓인다(작업 258).
    if (this.locked || this.conflicted || this.pendingMarket || this.pendingWarehouse || this.warehouseSettling) return Promise.resolve(false);
    this.pending = true;
    if (this.active) return this.active;
    this.active = (async () => {
      while (this.pending && !this.locked) {
        this.pending = false; this.onStatus('저장 중');
        try {
          const recovering = !!this.pendingSave;
          // 저장을 시작한 시점의 변경 번호. 응답을 받은 뒤 번호가 그대로면 이 스냅샷이 최신이다.
          const seq = this.changeSeq;
          this.pendingSave ??= { save: structuredClone(this.save), revision: this.revision, requestId: crypto.randomUUID() };
          const request = this.pendingSave;
          const result = await accountRequest<SyncResult>('save', { ...request, characterSlot: this.session.characterSlot }, this.session.token);
          if (!result.ok || !Number.isSafeInteger(result.revision)) throw new Error('서버가 저장 완료를 확인하지 않았습니다.');
          this.revision = result.revision; this.pendingSave = undefined;
          this.lastSaveError = '';
          this.lastSaveAt = Date.now();
          this.reportOnline();
          // 저장을 보낸 뒤에 또 바뀌었으면 dirty를 남겨 다음 차례에 다시 보낸다.
          if (this.changeSeq === seq) this.dirty = false;
          this.pending ||= recovering || this.dirty;
          this.onStatus('저장됨'); this.onSaved();
        } catch (error) { this.pending = true; this.lastSaveError = error instanceof Error && error.message ? error.message : String(error); if (isNetworkOffline(error)) { this.reportOffline(); return false; } this.handleError(error); return false; }
      }
      return true;
    })().finally(() => { this.active = undefined; });
    return this.active;
  }
  handleError(error: unknown): void {
    // 끊김은 오류가 아니다 — 안내만 띄우고 다음 저장 때 다시 보낸다(작업 251).
    if (isNetworkOffline(error)) { this.reportOffline(); return; }
    const code = errorCode(error);
    if (isOutdatedResponse(errorStatus(error), code, errorExpectedVersion(error))) { this.stopForOutdatedVersion(); return; }
    if (code === 'SAVE_CONFLICT') {
      this.conflicted = true; this.onPause(true);
      const overlay = document.createElement('div'); overlay.className = 'sync-conflict';
      const note = document.createElement('p'); note.textContent = '다른 탭이나 기기에서 진행 상황이 변경되었습니다. 최신 데이터를 불러와야 계속할 수 있습니다.';
      const button = document.createElement('button'); button.textContent = '최신 진행 상황 불러오기'; button.onclick = () => location.reload();
      overlay.append(note, button); document.body.appendChild(overlay);
    } else if (errorStatus(error) === 401 || sessionErrorCodes.includes(code)) {
      // 기기당 하나의 세션만 유지하므로, 이 기기의 토큰이 밀려났으면 저장을 멈추고 로그인으로 돌아간다.
      this.endSession(error instanceof Error && error.message ? error.message : '다시 로그인하세요.');
      return;
    } else if (conflictErrorCodes.includes(code)) {
      // 방금 최신 세이브를 다시 불러왔는데 또 충돌했다면 world가 옛 상태를 들고 있다는 뜻이므로,
      // 같은 재로드를 반복하지 않고 저장을 멈춘 뒤 새로고침만 안내한다(토스트 무한 반복 차단).
      if (this.conflictReloadAt && Date.now() - this.conflictReloadAt < conflictReloadWindow) { this.stopConflictLoop(); return; }
      void this.reloadLatest();
      return;
    } else if (errorStatus(error) === 400 && saveRejectedCodes.includes(code)) {
      // 서버가 세이브 자체를 거절했다(가방 40칸 초과 등) — 같은 세이브를 다시 보내도 계속 400이므로, 서버가
      // 들고 있는 최신 세이브로 화면을 맞춰 교착에서 벗어난다. 한 번 재동기화한 뒤 또 거절되면 반복하지 않고
      // 새로고침만 안내한다(작업 246).
      if (this.conflictReloadAt && Date.now() - this.conflictReloadAt < conflictReloadWindow) { this.stopConflictLoop(); return; }
      void this.reloadLatest();
      return;
    }
    this.onStatus('저장 실패'); this.onMessage(error instanceof Error ? error.message : String(error));
  }
  /** 연결이 끊겼다 — 재접속 안내를 띄우게 하고, 거래 버튼은 잠그지 않는다(다시 보내면 풀린다). */
  private reportOffline(): void {
    this.offline = true;
    this.onNetwork('connecting');
    this.onStatus('연결 중');
  }
  /** 저장·거래가 서버에 닿았다 — 재접속 안내를 내리게 한다. */
  private reportOnline(): void {
    if (!this.offline) return;
    this.offline = false;
    this.onNetwork('recovered');
  }
  private endSession(message: string): void {
    if (this.sessionEnded) return;
    this.sessionEnded = true; this.conflicted = true;
    this.cancelQueuedSave();
    this.pending = false; this.pendingSave = undefined;
    this.onPause(true); this.onStatus('로그인 필요');
    clearToken();
    this.onMessage(message); this.onSessionEnded(message);
  }
  // 구버전 번들은 저장을 멈추고 새 번들을 받아온다(새로고침이 반복되면 캐시된 화면으로 보고 안내만 남긴다).
  private stopForOutdatedVersion(): void {
    this.conflicted = true;
    this.cancelQueuedSave();
    this.pending = false; this.pendingSave = undefined;
    this.onPause(true); this.onStatus('업데이트 필요');
    this.onMessage(OUTDATED_MESSAGE);
    reloadForNewVersion();
  }
  private stopConflictLoop(): void {
    if (this.conflictStopped) return;
    this.conflictStopped = true;
    this.conflicted = true;
    this.cancelQueuedSave();
    this.pending = false; this.pendingSave = undefined;
    this.onPause(true); this.onStatus('동기화 필요');
    this.onMessage(conflictReloadMessage);
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function' || document.querySelector('.sync-conflict')) return;
    const overlay = document.createElement('div'); overlay.className = 'sync-conflict';
    const note = document.createElement('p'); note.textContent = conflictReloadMessage;
    const button = document.createElement('button'); button.textContent = '최신 진행 상황 불러오기'; button.onclick = () => location.reload();
    overlay.append(note, button); document.body.appendChild(overlay);
  }
  // ITEM_CONFLICT・CHARACTER_CONFLICT는 같은 저장을 다시 보내면 계속 실패하므로, 서버 최신 세이브를 받아 화면을 맞춘다.
  // `quiet`면 안내 문구를 띄우지 않는다 — 창고 이동 결과를 확인하지 못해 조용히 다시 맞추는 자리(작업 258).
  private async reloadLatest(quiet = false): Promise<void> {
    if (this.reloadingConflict) return;
    this.reloadingConflict = true;
    this.conflictReloadAt = Date.now();
    this.cancelQueuedSave();
    this.pending = false; this.pendingSave = undefined;
    this.onPause(true); this.onStatus('최신 저장 불러오는 중');
    try {
      const latest = await accountRequest<Session>('load', {}, this.session.token);
      const verified = parseSave(latest.save, this.session.accountId);
      Object.assign(this.save, verified);
      this.dirty = false;
      this.revision = latest.revision;
      if (Number.isInteger(latest.characterSlot)) this.session.characterSlot = latest.characterSlot;
      this.pendingMarket = undefined; this.pendingWarehouse = undefined;
      this.lastSaveError = '';
      this.onSaved(); this.onStatus('저장됨');
      if (!quiet) this.onMessage('서버의 최신 진행 상황과 달라 자동으로 다시 불러왔습니다.');
      if (!this.conflicted && !this.pendingMarket && !this.pendingWarehouse) this.onPause(false);
    } catch (error) { this.handleError(error); }
    finally { this.reloadingConflict = false; }
  }
  /** 저장이 막혀 거래를 시작하지 못할 때의 안내 — 서버가 알려 준 실제 이유를 함께 보여 준다(작업 246). */
  private saveBlockedMessage(base: string): string {
    return this.lastSaveError ? `${base} (${this.lastSaveError})` : base;
  }
  async mutate(action: string, data: Record<string, unknown>, requestId: string): Promise<SyncResult> {
    if (this.locked || this.conflicted || this.preparingMarket || this.pendingWarehouse) throw new Error('다른 요청을 처리 중입니다.');
    if (this.warehouseSettling) throw new Error('창고 상태를 다시 확인하는 중입니다. 잠시 후 다시 시도하세요.');
    this.preparingMarket = true;
    this.cancelQueuedSave();
    this.onPause(true);
    // 이 응답이 어느 캐릭터의 것인지 기억한다 — 기다리는 사이 다른 탭·다른 기기에서 캐릭터가 바뀌면
    // 서버 응답의 세이브·revision은 **보내지 않은 캐릭터의 것**이라 화면 세이브를 덮으면 안 된다(작업 239).
    const slotAtStart = this.session.characterSlot;
    try {
      if (this.pendingMarket && this.pendingMarket.requestId !== requestId) throw new Error('이전 거래의 결과를 먼저 확인해야 합니다. 거래 결과 다시 확인을 눌러주세요.');
      if (!this.pendingMarket) {
        // Let the active save finish before locking; its loop may contain another pending snapshot.
        if (this.active) await this.active;
        if (this.conflicted) throw new Error('최신 진행 상황을 다시 불러와야 거래할 수 있습니다.');
        if (this.pendingSave) {
          if (!await this.flush()) throw new Error(this.saveBlockedMessage('이전 저장 결과를 확인해야 거래할 수 있습니다.'));
        }
        if (this.conflicted) throw new Error('최신 진행 상황을 다시 불러와야 거래할 수 있습니다.');
        this.locked = true;
        this.pendingMarket = { action, data, requestId, revision: this.revision, progress: structuredClone(this.save) };
      }
      this.locked = true;
      let result: SyncResult | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        let response: Response;
        try {
          response = await fetch('/api/market', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${this.session.token}` }), body: JSON.stringify({ action: this.pendingMarket!.action, ...this.pendingMarket!.data, requestId: this.pendingMarket!.requestId, revision: this.pendingMarket!.revision, progress: this.pendingMarket!.progress, characterSlot: this.session.characterSlot }) });
          const body = await response.json();
          if (!response.ok) {
            // `503 DB_UNAVAILABLE`(서버 `errorResponse`의 기본 5xx)와 `DB_NOT_CONFIGURED`는 DB 연결·설정 단계에서
            // 거절돼 거래 트랜잭션이 시작되지 않은 응답이다. 이때도 `pendingMarket`을 남기면 서버가 회복될 때까지
            // 거래소 수령·우편 모두 받기가 함께 잠기고 '다시 확인'도 같은 503만 반복한다(작업 226).
            // 응답 유실·코드 없는 5xx는 결과를 알 수 없으므로 지금처럼 남겨 같은 requestId로 멱등 재확인한다.
            if (response.status >= 500 && transactionSkippedCodes.includes(body.code)) {
              this.pendingMarket = undefined;
              throw Object.assign(new Error(body.error || '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.'), { code: body.code, status: response.status });
            }
            if (response.status >= 500) throw new Error(body.error || '서버 응답을 확인 중입니다.');
            this.pendingMarket = undefined;
            throw Object.assign(new Error(body.error || '거래 요청 실패'), { code: body.code, status: response.status, expected: body.expected });
          }
          result = body as SyncResult; break;
        } catch (error) {
          if (isNetworkOffline(error)) this.reportOffline();
          if (error instanceof Error && 'status' in error) throw error;
          if (attempt === 2) throw new Error('연결이 끊겨 거래 결과를 확인 중입니다. 거래 결과 다시 확인을 눌러주세요.');
        }
      }
      if (!result) throw new Error('거래 결과를 확인하지 못했습니다.');
      if (this.session.characterSlot !== slotAtStart) {
        // 캐릭터가 바뀌었으니 거래 대기만 풀고, 옛 캐릭터의 세이브·revision으로 화면을 덮지 않는다.
        this.pendingMarket = undefined;
        this.onMessage('캐릭터가 바뀌어 이전 거래 결과를 화면에 반영하지 않았습니다. 거래소를 다시 열어 확인하세요.');
        return result as SyncResult;
      }
      const verifiedSave = parseSave(result.save, this.session.accountId);
      this.pendingMarket = undefined;
      this.revision = result.revision;
      Object.assign(this.save, verifiedSave);
      this.pending = false; this.pendingSave = undefined; this.dirty = false; this.lastSaveAt = Date.now(); this.onSaved();
      this.reportOnline();
      this.onStatus('저장됨'); return result as SyncResult;
    } catch (error) {
      const code = errorCode(error);
      if (code === 'SAVE_CONFLICT' || conflictErrorCodes.includes(code) || isOutdatedResponse(errorStatus(error), code, errorExpectedVersion(error)) || sessionErrorCodes.includes(code) || errorStatus(error) === 401) this.handleError(error);
      else this.onMessage(error instanceof Error ? error.message : String(error));
      throw error;
    }
    finally { this.preparingMarket = false; this.locked = false; if (!this.conflicted && !this.pendingMarket) this.onPause(false); }
  }
  async reset(): Promise<void> {
    this.onPause(true);
    try {
      if (!await this.flush()) throw new Error('저장 실패로 초기화를 중단했습니다.');
      this.locked = true;
      await accountRequest('reset', { revision: this.revision, characterSlot: this.session.characterSlot }, this.session.token); location.reload();
    } finally { this.locked = false; if (!this.conflicted && !this.pendingMarket) this.onPause(false); }
  }
  /**
   * 창고 이동(작업 225 → 250 → 258). 문자열 하나면 단건, 배열이면 한 요청으로 여러 개를 옮긴다(서버 `itemIds`).
   *
   * **요청 한 번 = 저장 + 이동**(작업 258). 화면 세이브를 `progress`로 함께 실어 보내므로 사냥 중(보낼 변경이
   * 있는 상태)에도 저장(`/api/account`)을 따로 왕복하지 않는다. 서버는 그 세이브를 거래소와 같은 규칙으로 검증하고
   * (`reconcileItems`) 이동과 저장을 한 트랜잭션에서 끝낸다 — 예전에는 저장 왕복 1 + 창고 왕복 1이었다.
   *
   * **멈춘 화면을 만들지 않는다**(작업 258). 예전에는 응답을 잃으면 `pendingWarehouse`가 남아 `onPause(true)`가
   * 풀리지 않고(사냥이 통째로 멈춤) 다음 이동이 "이전 창고 이동 결과를 확인 중입니다."로 막혔으며, 복구 타이머가
   * 같은 요청을 계속 다시 보냈다. 지금은 보내는 동안만 잠그고 `finally`에서 **반드시** 풀며, 결과를 모르는
   * 실패는 화면 밖(`scheduleWarehouseSettle`)에서 **같은 `requestId`로** 다시 확인한다(서버 멱등 기록 덕분에
   * 두 번 옮겨지지 않는다). 확인이 끝나면 옮긴 아이템만 화면 세이브에 반영하고 revision만 맞춘다 — 그 사이
   * 사냥한 진행을 서버 세이브로 덮지 않는다.
   */
  async transferWarehouse(action: 'deposit' | 'withdraw', itemIds: string | string[]): Promise<SyncResult> {
    const ids = [...new Set(Array.isArray(itemIds) ? itemIds : [itemIds])];
    const slotAtStart = this.session.characterSlot;
    if (!ids.length) throw new Error('옮길 아이템이 없습니다.');
    if (this.locked || this.conflicted || this.preparingMarket || this.pendingMarket) throw new Error('다른 요청을 처리 중입니다.');
    // 같은 아이템을 두 번 보내지 않도록 보내는 동안만 막는다(작업 258 — 결과를 확인하는 동안은 화면을 열어 둔다).
    if (this.pendingWarehouse) throw new Error('창고 이동을 처리 중입니다. 잠시 후 다시 시도하세요.');
    if (this.warehouseSettling) throw new Error('창고 상태를 다시 확인하는 중입니다. 잠시 후 다시 시도하세요.');
    // 진행 중인 저장이 있으면 그 응답의 revision만 먼저 확정한다. 보낼 변경 자체는 `progress`에 실려
    // 이동과 같은 트랜잭션에서 저장되므로 저장 요청을 한 번 더 보내지 않는다.
    if (this.active) await this.active;
    if (this.conflicted) throw new Error('최신 진행 상황을 다시 불러와야 거래할 수 있습니다.');
    const request: WarehouseRequest = { action, itemIds: ids, requestId: crypto.randomUUID(), revision: this.revision, progress: structuredClone(this.save) };
    this.pendingWarehouse = request;
    this.locked = true; this.onPause(true);
    try {
      const result = await this.sendWarehouse(request);
      if (this.session.characterSlot !== slotAtStart) {
        // 캐릭터가 바뀐 뒤 도착한 창고 응답 — 옛 캐릭터의 세이브로 새 캐릭터의 화면을 덮지 않는다(작업 239).
        return result;
      }
      this.applyWarehouseResult(result, action, true);
      return result;
    } catch (error) {
      // 4xx는 서버가 트랜잭션을 되돌린 **확정** 결과이고, 타임아웃·네트워크·5xx는 결과를 모른다. 모르는 경우만
      // 같은 `requestId`로 조용히 다시 확인한다 — 화면은 잠그지 않는다(작업 258).
      if (!(error instanceof Error && 'status' in error)) this.scheduleWarehouseSettle(request);
      this.handleError(error); throw error;
    } finally {
      this.pendingWarehouse = undefined;
      this.locked = false;
      if (!this.conflicted) this.onPause(false);
    }
  }
  /** `/api/warehouse` 한 번 — 응답을 받은 실패는 `status`를 실어 던지고, 못 받은 실패는 그냥 던진다. */
  private async sendWarehouse(request: WarehouseRequest, timeoutMs = 6_000, attempts = 2): Promise<SyncResult> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // 한 개는 예전 그대로 `itemId`로 보낸다(구서버 호환) — 여러 개일 때만 `itemIds` 배열(작업 225).
        const target = request.itemIds.length === 1 ? { itemId: request.itemIds[0] } : { itemIds: request.itemIds };
        const response = await fetch('/api/warehouse', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${this.session.token}` }), body: JSON.stringify({ action: request.action, ...target, requestId: request.requestId, revision: request.revision, progress: request.progress, characterSlot: this.session.characterSlot }), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) {
          // 5xx는 서버가 트랜잭션을 시작했는지 알 수 없다 — 결과 미확인으로 다루고 같은 `requestId`로 다시 확인한다.
          if (response.status >= 500) throw new Error(body.error || '창고 이동 결과를 확인 중입니다.');
          throw Object.assign(new Error(body.error || '창고 요청 실패'), { status: response.status, code: body.code, expected: body.expected });
        }
        if (!Number.isSafeInteger(body.revision)) throw new Error('창고 응답이 올바르지 않습니다.');
        return body as SyncResult;
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        // 연결이 끊긴 것이라면 재접속 안내를 띄운다(작업 251) — 결과는 아래에서 같은 `requestId`로 다시 확인한다.
        if (isNetworkOffline(error)) this.reportOffline();
        if (attempt === attempts - 1) throw new Error('창고 이동 결과를 확인하지 못했습니다. 잠시 후 자동으로 다시 확인합니다.');
      } finally { clearTimeout(timer); }
    }
    throw new Error('창고 이동 결과를 확인하지 못했습니다. 잠시 후 자동으로 다시 확인합니다.');
  }
  /**
   * 응답을 반영한다. `replace`면 화면 세이브를 서버 세이브로 통째로 갈아 끼우고(게임이 잠겨 있던 정상 경로),
   * 아니면 **옮긴 아이템만** 화면 세이브에 적용한다 — 화면 밖에서 결과를 확인하는 동안 사냥한 진행을 지키기 위해서다.
   */
  private applyWarehouseResult(result: SyncResult, action: 'deposit' | 'withdraw', replace: boolean): void {
    const verified = parseSave(result.save, this.session.accountId);
    this.revision = result.revision;
    if (replace) {
      Object.assign(this.save, verified);
      this.pending = false; this.pendingSave = undefined; this.dirty = false; this.lastSaveAt = Date.now();
    } else {
      const moved = new Set(result.moved ?? []);
      const bag = this.save.bag.filter(item => !moved.has(item.id));
      if (action === 'withdraw') {
        const have = new Set(bag.map(item => item.id));
        for (const item of verified.bag) if (moved.has(item.id) && !have.has(item.id)) bag.push(item);
      }
      this.save.bag.splice(0, this.save.bag.length, ...bag);
      this.lastSaveAt = Date.now();
      this.queueSave();
    }
    this.reportOnline();
    this.onSaved(); this.onStatus('저장됨');
  }
  /**
   * 결과를 확인하지 못한 이동을 **화면 밖에서** 같은 `requestId`로 다시 확인한다(작업 258).
   * 사냥은 계속 돌고(`onPause`를 건드리지 않는다), 확인이 끝날 때까지 새 이동·저장만 잠깐 미룬다.
   */
  private scheduleWarehouseSettle(request: WarehouseRequest): void {
    if (this.warehouseSettling) return;
    this.warehouseSettling = true;
    const slot = this.session.characterSlot;
    let round = 0;
    const giveUp = (): void => {
      this.warehouseSettling = false;
      this.onMessage('창고 이동 결과를 확인하지 못했습니다. 창고를 다시 열어 확인해 주세요.');
      // revision이 어긋난 채로 두면 다음 저장이 409로 막힌다 — 서버 기준으로 조용히 다시 맞춘다.
      void this.reloadLatest(true).then(() => this.onWarehouseRecovered(), () => {});
    };
    const tick = async (): Promise<void> => {
      this.warehouseSettleTimer = undefined;
      if (this.conflicted || this.session.characterSlot !== slot) { this.warehouseSettling = false; return; }
      try {
        const result = await this.sendWarehouse(request, 6_000, 1);
        this.applyWarehouseResult(result, request.action, false);
        this.warehouseSettling = false;
        // 창고를 열어 두었으면 서버가 준 목록으로 다시 그린다(이동이 실제로 반영됐는지 눈으로 확인된다).
        this.onWarehouseRecovered();
        return;
      } catch (error) {
        const status = errorStatus(error), code = errorCode(error);
        if (status && status < 500) {
          // 거절(4xx)은 확정 결과다. 화면과 서버가 어긋난 경우만 조용히 최신 세이브로 맞춘다.
          this.warehouseSettling = false;
          if (code === 'SAVE_CONFLICT' || conflictErrorCodes.includes(code) || saveRejectedCodes.includes(code)) void this.reloadLatest(true).then(() => this.onWarehouseRecovered(), () => {});
          return;
        }
        if (round >= warehouseSettleDelays.length) { giveUp(); return; }
        this.warehouseSettleTimer = setTimeout(tick, warehouseSettleDelays[round++]);
      }
    };
    this.warehouseSettleTimer = setTimeout(tick, warehouseSettleDelays[round++]);
  }
}
