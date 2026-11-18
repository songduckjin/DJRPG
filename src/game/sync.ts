import { parseSave, type Save } from './store';
import { accountRequest, clearToken, type Session } from '../ui/login';
import { apiHeaders, isOutdatedResponse, OUTDATED_MESSAGE, reloadForNewVersion } from './appVersion';

const sessionErrorCodes = ['SESSION_REPLACED', 'INVALID_TOKEN', 'UNAUTHORIZED'];
const conflictErrorCodes = ['ITEM_CONFLICT', 'CHARACTER_CONFLICT'];
const conflictReloadWindow = 10_000;
const conflictReloadMessage = '데이터 동기화가 어긋났습니다. 새로고침해 주세요.';
const errorCode = (error: unknown): string => error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code ?? '') : '';
const errorStatus = (error: unknown): number => error instanceof Error && 'status' in error ? Number((error as Error & { status?: unknown }).status) : 0;
const errorExpectedVersion = (error: unknown): unknown => error instanceof Error && 'expected' in error ? (error as Error & { expected?: unknown }).expected : undefined;

export type SyncResult = { journey?: import('./journey').JourneyData; ok: boolean; save: Save; revision: number; message?: string; effect?: { listing?: { id: string; state: string; soldAt?: number }; deliveries: import('./market').Delivery[]; claimedId?: string; claimedIds?: string[] } };
export class SaveSync {
  revision: number;
  active?: Promise<boolean>;
  private pendingSave?: { save: Save; revision: number; requestId: string };
  pending = false;
  locked = false;
  conflicted = false;
  pendingMarket?: { action: string; data: Record<string, unknown>; requestId: string; revision: number; progress: Save };
  pendingWarehouse?: { action: 'deposit' | 'withdraw'; itemId: string; requestId: string; revision: number };
  private warehouseRecoveryTimer?: ReturnType<typeof setTimeout>;
  private warehouseRecoveryDelay = 2000;
  private preparingMarket = false;
  onStatus: (status: string) => void = () => {};
  onMessage: (message: string) => void = () => {};
  onPause: (paused: boolean) => void = () => {};
  onSaved: () => void = () => {};
  onWarehouseRecovered: () => void = () => {};
  onSessionEnded: (message: string) => void = () => {};
  private reloadingConflict = false;
  private conflictReloadAt = 0;
  private conflictStopped = false;
  private sessionEnded = false;
  constructor(public save: Save, public session: Session) { this.revision = session.revision; }
  private autosaveTimer?: ReturnType<typeof setTimeout>;
  queueSave(): void {
    if (this.autosaveTimer !== undefined) return;
    this.autosaveTimer = setTimeout(() => { this.autosaveTimer = undefined; void this.flush(); }, 1000);
  }
  private cancelQueuedSave(): void {
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
  }
  flush(): Promise<boolean> {
    this.cancelQueuedSave();
    if (this.locked || this.conflicted || this.pendingMarket || this.pendingWarehouse) return Promise.resolve(false);
    this.pending = true;
    if (this.active) return this.active;
    this.active = (async () => {
      while (this.pending && !this.locked) {
        this.pending = false; this.onStatus('저장 중');
        try {
          const recovering = !!this.pendingSave;
          this.pendingSave ??= { save: structuredClone(this.save), revision: this.revision, requestId: crypto.randomUUID() };
          const result = await accountRequest<SyncResult>('save', { ...this.pendingSave, characterSlot: this.session.characterSlot }, this.session.token);
          if (!result.ok || !Number.isSafeInteger(result.revision)) throw new Error('서버가 저장 완료를 확인하지 않았습니다.');
          this.revision = result.revision; this.pendingSave = undefined; this.pending ||= recovering; this.onStatus('저장됨'); this.onSaved();
        } catch (error) { this.pending = true; this.handleError(error); return false; }
      }
      return true;
    })().finally(() => { this.active = undefined; });
    return this.active;
  }
  handleError(error: unknown): void {
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
    }
    this.onStatus('저장 실패'); this.onMessage(error instanceof Error ? error.message : String(error));
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
  private async reloadLatest(): Promise<void> {
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
      this.revision = latest.revision;
      if (Number.isInteger(latest.characterSlot)) this.session.characterSlot = latest.characterSlot;
      this.pendingMarket = undefined; this.pendingWarehouse = undefined;
      this.onSaved(); this.onStatus('저장됨');
      this.onMessage('서버의 최신 진행 상황과 달라 자동으로 다시 불러왔습니다.');
      if (!this.conflicted && !this.pendingMarket && !this.pendingWarehouse) this.onPause(false);
    } catch (error) { this.handleError(error); }
    finally { this.reloadingConflict = false; }
  }
  async mutate(action: string, data: Record<string, unknown>, requestId: string): Promise<SyncResult> {
    if (this.locked || this.conflicted || this.preparingMarket || this.pendingWarehouse) throw new Error('다른 요청을 처리 중입니다.');
    this.preparingMarket = true;
    this.cancelQueuedSave();
    this.onPause(true);
    try {
      if (this.pendingMarket && this.pendingMarket.requestId !== requestId) throw new Error('이전 거래의 결과를 먼저 확인해야 합니다. 거래 결과 다시 확인을 눌러주세요.');
      if (!this.pendingMarket) {
        // Let the active save finish before locking; its loop may contain another pending snapshot.
        if (this.active) await this.active;
        if (this.conflicted) throw new Error('최신 진행 상황을 다시 불러와야 거래할 수 있습니다.');
        if (this.pendingSave) {
          if (!await this.flush()) throw new Error('이전 저장 결과를 확인해야 거래할 수 있습니다.');
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
            if (response.status >= 500) throw new Error(body.error || '서버 응답을 확인 중입니다.');
            this.pendingMarket = undefined;
            throw Object.assign(new Error(body.error || '거래 요청 실패'), { code: body.code, status: response.status, expected: body.expected });
          }
          result = body as SyncResult; break;
        } catch (error) {
          if (error instanceof Error && 'status' in error) throw error;
          if (attempt === 2) throw new Error('연결이 끊겨 거래 결과를 확인 중입니다. 거래 결과 다시 확인을 눌러주세요.');
        }
      }
      if (!result) throw new Error('거래 결과를 확인하지 못했습니다.');
      const verifiedSave = parseSave(result.save, this.session.accountId);
      this.pendingMarket = undefined;
      this.revision = result.revision;
      Object.assign(this.save, verifiedSave);
      this.pending = false; this.pendingSave = undefined; this.onSaved();
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
  async transferWarehouse(action: 'deposit' | 'withdraw', itemId: string): Promise<SyncResult> {
    if (this.locked || this.conflicted || this.pendingMarket || this.preparingMarket) throw new Error('다른 요청을 처리 중입니다.');
    if (this.pendingWarehouse && (this.pendingWarehouse.action !== action || this.pendingWarehouse.itemId !== itemId)) throw new Error('이전 창고 이동 결과를 확인 중입니다.');
    if (!this.pendingWarehouse) {
      if (!await this.flush()) throw new Error('저장 결과를 확인한 뒤 다시 시도하세요.');
      this.pendingWarehouse = { action, itemId, requestId: crypto.randomUUID(), revision: this.revision };
    }
    this.locked = true; this.onPause(true);
    try {
      let result: SyncResult | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          const response = await fetch('/api/warehouse', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${this.session.token}` }), body: JSON.stringify({ ...this.pendingWarehouse, characterSlot: this.session.characterSlot }), signal: controller.signal });
          const body = await response.json();
          if (!response.ok) {
            if (response.status >= 500) throw new Error(body.error || '창고 이동 결과를 확인 중입니다.');
            throw Object.assign(new Error(body.error || '창고 요청 실패'), { status: response.status, code: body.code, expected: body.expected });
          }
          result = body as SyncResult; break;
        } catch (error) {
          if (error instanceof Error && 'status' in error) throw error;
          if (attempt === 2) throw new Error('창고 이동 결과를 자동으로 다시 확인하고 있습니다. 확인 후 전투를 재개합니다.');
        } finally { clearTimeout(timeout); }
      }
      if (!result || !Number.isSafeInteger(result.revision)) throw new Error('창고 응답이 올바르지 않습니다.');
      const verifiedSave = parseSave(result.save, this.session.accountId);
      this.pendingWarehouse = undefined;
      if (this.warehouseRecoveryTimer) clearTimeout(this.warehouseRecoveryTimer);
      this.warehouseRecoveryTimer = undefined; this.warehouseRecoveryDelay = 2000;
      this.revision = result.revision;
      Object.assign(this.save, verifiedSave);
      this.onSaved(); this.onStatus('저장됨');
      return result;
    } catch (error) {
      if (error instanceof Error && 'status' in error) this.pendingWarehouse = undefined;
      else this.scheduleWarehouseRecovery();
      this.handleError(error); throw error;
    }
    finally { this.locked = false; if (!this.conflicted && !this.pendingWarehouse) this.onPause(false); }
  }
  private scheduleWarehouseRecovery(): void {
    if (!this.pendingWarehouse || this.warehouseRecoveryTimer) return;
    const delay = this.warehouseRecoveryDelay;
    this.warehouseRecoveryDelay = Math.min(30_000, delay * 2);
    this.warehouseRecoveryTimer = setTimeout(() => {
      this.warehouseRecoveryTimer = undefined;
      const pending = this.pendingWarehouse;
      if (pending) void this.transferWarehouse(pending.action, pending.itemId).then(() => this.onWarehouseRecovered()).catch(() => {});
    }, delay);
  }
}
