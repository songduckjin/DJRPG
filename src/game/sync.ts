import { parseSave, type Save } from './store';
import { accountRequest, type Session } from '../ui/login';

export type SyncResult = { ok: boolean; save: Save; revision: number; message?: string; effect?: { listing?: { id: string; state: string; soldAt?: number }; deliveries: import('./market').Delivery[]; claimedId?: string; claimedIds?: string[] } };
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
    if (error instanceof Error && 'code' in error && error.code === 'SAVE_CONFLICT') {
      this.conflicted = true; this.onPause(true);
      const overlay = document.createElement('div'); overlay.className = 'sync-conflict';
      const note = document.createElement('p'); note.textContent = '다른 탭이나 기기에서 진행 상황이 변경되었습니다. 최신 데이터를 불러와야 계속할 수 있습니다.';
      const button = document.createElement('button'); button.textContent = '최신 진행 상황 불러오기'; button.onclick = () => location.reload();
      overlay.append(note, button); document.body.appendChild(overlay);
    }
    this.onStatus('저장 실패'); this.onMessage(error instanceof Error ? error.message : String(error));
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
          response = await fetch('/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.session.token}` }, body: JSON.stringify({ action: this.pendingMarket!.action, ...this.pendingMarket!.data, requestId: this.pendingMarket!.requestId, revision: this.pendingMarket!.revision, progress: this.pendingMarket!.progress, characterSlot: this.session.characterSlot }) });
          const body = await response.json();
          if (!response.ok) {
            if (response.status >= 500) throw new Error(body.error || '서버 응답을 확인 중입니다.');
            this.pendingMarket = undefined;
            throw Object.assign(new Error(body.error || '거래 요청 실패'), { code: body.code, status: response.status });
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
      if (error instanceof Error && 'code' in error && error.code === 'SAVE_CONFLICT') this.handleError(error);
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
          const response = await fetch('/api/warehouse', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.session.token}` }, body: JSON.stringify({ ...this.pendingWarehouse, characterSlot: this.session.characterSlot }), signal: controller.signal });
          const body = await response.json();
          if (!response.ok) {
            if (response.status >= 500) throw new Error(body.error || '창고 이동 결과를 확인 중입니다.');
            throw Object.assign(new Error(body.error || '창고 요청 실패'), { status: response.status, code: body.code });
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
