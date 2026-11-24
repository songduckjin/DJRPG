/**
 * 무한 방어전 순위의 서버 사본 (2026-11-24).
 *
 * 기록의 근거는 클라이언트가 보낸 스테이지가 아니라 **서버가 검증한 submit**이다. 판을 시작할 때 서버가
 * `runId`·`seed`·시작 시각을 발급하고(`begin`), 판이 끝나면 그 시드로 돌린 결과 요약(스테이지·처치 수·스텝·
 * 남은 체력·digest)을 `submit`에 실어 보낸다. 서버는 같은 시드·같은 고정 스텝으로 다시 돌려 대조하고,
 * 세이브의 `defenseStage`도 그 기록(+1)까지만 저장한다(`server/defense.mjs`·`server/save-guard.mjs`).
 */
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from './appVersion';
import type { SaveSync } from './sync';
import type { DefenseBattleSummary } from './dungeon/defenseBattle';

export type DefenseRecord = {
  rank?: number; name: string; job?: string; level?: number;
  bestStage: number; reachedAt: number; mine?: boolean; verified?: boolean;
};
export type DefenseStanding = { top: DefenseRecord[]; mine?: DefenseRecord; total: number };
export type DefenseData = { standing: DefenseStanding; guest: boolean; recorded: number; now: number; verified?: boolean };
/** `start`가 돌려주는 도전 한 건 — 서버가 정한 판 번호·시드·시작 시각. */
export type DefenseStart = { runId: string; seed: number; startedAt: number; now: number };
/** 서버 순위를 이만큼은 그대로 쓴다(탭을 열 때마다 다시 부르지 않는다). */
const freshSeconds = 10;
/** 마지막 판의 요약을 담아 두는 세션 키 — 새로고침 뒤 전송이 실패한 기록을 다시 보낼 수 있게. */
const runKey = 'djrpg.defense.run';

export class DefenseLive {
  data?: DefenseData;
  error = '';
  loading = false;
  loadedAt = 0;
  /** 지금 진행 중인 판 — `submit`이 이 `runId`를 싣는다. */
  run?: { runId: string; seed: number; startedAt: number; stage?: number; summary?: DefenseBattleSummary };
  private loadPromise?: Promise<void>;
  constructor(readonly sync: SaveSync) {
    try {
      const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(runKey);
      const saved = raw ? JSON.parse(raw) as { runId?: unknown; seed?: unknown; startedAt?: unknown; stage?: unknown; summary?: DefenseBattleSummary } | null : null;
      if (saved && typeof saved.runId === 'string' && Number.isFinite(Number(saved.seed))) {
        this.run = {
          runId: saved.runId, seed: Number(saved.seed) >>> 0, startedAt: Number(saved.startedAt) || 0,
          stage: Number(saved.stage) || undefined, summary: saved.summary
        };
      }
    } catch { /* 저장이 깨졌으면 새 판으로 시작한다 */ }
  }
  get guest(): boolean { return this.sync.session.guest; }
  get fresh(): boolean { return !!this.data && Date.now() - this.loadedAt < freshSeconds * 1000; }
  private async request(action: string, extra: Record<string, unknown> = {}): Promise<DefenseData> {
    const response = await fetch('/api/defense', {
      method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${this.sync.session.token}` }),
      body: JSON.stringify({ action, ...extra }), signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) {
      if (isOutdatedResponse(response.status, data.code, data.expected)) reloadForNewVersion();
      throw Object.assign(new Error(data.error ?? '방어전 순위에 연결하지 못했습니다.'), { code: data.code, status: response.status });
    }
    if (action !== 'start') { this.data = data; this.loadedAt = Date.now(); this.error = ''; }
    return data;
  }
  /** 판을 시작할 때 서버에서 판 번호·시드·시작 시각을 받는다. 게스트·실패면 `undefined`(그 판은 순위에 오르지 않는다). */
  begin(): Promise<DefenseStart | undefined> {
    if (this.guest) return Promise.resolve(undefined);
    return this.request('start').then(data => {
      const start = data as unknown as Partial<DefenseStart>;
      const seed = Number(start.seed);
      const run = {
        runId: typeof start.runId === 'string' ? start.runId : '',
        seed: Number.isFinite(seed) ? seed >>> 0 : 0,
        startedAt: Number.isFinite(Number(start.startedAt)) ? Number(start.startedAt) : Date.now()
      };
      this.run = run;
      this.persist();
      return { ...run, now: Number(start.now) || Date.now() };
    }, () => undefined);
  }
  /** 판이 끝난 뒤 그 판의 요약을 기억해 둔다 — 전송이 실패하면 순위 탭에서 다시 보낼 수 있다. */
  rememberRun(stage: number, summary: DefenseBattleSummary): void {
    if (!this.run) return;
    this.run = { ...this.run, stage, summary };
    this.persist();
  }
  /** 서버 순위를 불러온다. 실패는 `error`로 남겨 화면은 안내만 한다. */
  load(force = false): Promise<void> {
    if (!force && this.fresh) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.loading = true;
    this.loadPromise = this.request('list').then(() => {}, error => {
      this.error = error instanceof Error ? error.message : String(error);
    }).finally(() => { this.loading = false; this.loadPromise = undefined; });
    return this.loadPromise;
  }
  /** 판 결과를 서버에 제출한다. 저장(세이브 flush) → 검증 → 기록 upsert. */
  async submit(stage?: number, summary?: DefenseBattleSummary): Promise<void> {
    if (this.guest) return;
    if (this.loading) await this.loadPromise;
    const run = this.run;
    const targetStage = stage ?? run?.stage;
    const targetSummary = summary ?? (run?.stage === targetStage ? run?.summary : undefined);
    if (!run?.runId || !targetStage || !targetSummary) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // 방어전은 submit이 세이브의 스테이지를 읽지 않으므로 **먼저 제출**(검증된 기록) → 저장 순서가 안전하다.
        // 먼저 저장하면 낡은 기록 때문에 세이브의 스테이지가 1로 잘린다(`src/game/defenseProgress.ts`).
        await this.request('submit', { runId: run.runId, stage: targetStage, summary: targetSummary });
        await this.sync.flush();
        return;
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code ?? '') : '';
        this.error = error instanceof Error ? error.message : String(error);
        if (code !== 'DEFENSE_TOO_FAST' && code !== 'DEFENSE_NOT_STARTED') return;
        if (code === 'DEFENSE_NOT_STARTED') await this.begin();
        await new Promise(resolve => setTimeout(resolve, code === 'DEFENSE_NOT_STARTED' ? 2000 : 12000));
      }
    }
  }
  private persist(): void {
    try {
      if (typeof sessionStorage === 'undefined' || !this.run) return;
      sessionStorage.setItem(runKey, JSON.stringify(this.run));
    } catch { /* 저장이 막혀도 판은 계속된다 */ }
  }
}
export function mountDefenseLive(ui: { defense: { live?: DefenseLive }; market: { sync: SaveSync } }): void {
  ui.defense.live = new DefenseLive(ui.market.sync);
}
