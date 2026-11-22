import type { PouchResult } from './pouch';

/**
 * 보물 주머니 레전드 전광판 (작업 208, `#3965`).
 *
 * 정식 계정이 주머니에서 **레전드 장비**를 뽑으면 접속 중인 모두의 화면 위에 황금빛 띠 배너가
 * `🎉 {캐릭터명}님이 보물 주머니에서 [{아이템명}]을(를) 획득했습니다!` 를 5~6초 보여 준다.
 * 한 번 띄운 공지는 `id`로 기억해 다시 띄우지 않고, 여러 개가 겹치면 받은 순서대로 하나씩 보여 준다.
 */
export type LegendAnnouncement = { id: string; character: string; item: string; createdAt: number };
/** 배너 한 줄이 화면에 머무는 시간 — 5~6초(사용자 확정). */
export const LEGEND_BANNER_MS = 5500;
/** 서버가 내려주는 공지 창(5분)과 같은 값 — 이보다 오래된 줄은 받아도 띄우지 않는다. */
export const LEGEND_ANNOUNCEMENT_WINDOW_MS = 5 * 60_000;
/** 대기열이 길어지면 이만큼만 기억한다(오래된 소식이 화면을 붙잡지 않게). */
export const LEGEND_QUEUE_LIMIT = 5;

export function legendAnnouncementText(character: string, item: string): string {
  return `🎉 ${character}님이 보물 주머니에서 [${item}]을(를) 획득했습니다!`;
}
/** 주머니 결과가 전광판에 올릴 레전드 장비인가 — 금화·스탯북·다른 등급은 조용히 넘어간다. */
export function isLegendaryPouchResult(result: PouchResult | undefined): boolean {
  return !!result && result.kind === 'equipment' && result.item.rarity === 'legendary';
}
/** 서버 응답(또는 내 화면용 가짜 줄)을 안전한 공지 모양으로 다듬는다. 쓸 수 없으면 undefined. */
export function readLegendAnnouncement(value: unknown): LegendAnnouncement | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const character = typeof row.character === 'string' ? row.character.trim().slice(0, 24) : '';
  const item = typeof row.item === 'string' ? row.item.trim().slice(0, 60) : '';
  const createdAt = Number(row.createdAt);
  if (!id || !character || !item) return undefined;
  return { id, character, item, createdAt: Number.isFinite(createdAt) ? createdAt : 0 };
}

/** 전광판의 대기열 — 화면과 분리해 시험할 수 있는 순수 상태다. */
export class LegendBoard {
  readonly seen = new Set<string>();
  private pending: LegendAnnouncement[] = [];
  active?: LegendAnnouncement;
  activeUntil = 0;
  constructor(readonly duration = LEGEND_BANNER_MS) {}

  /** 받아 온 목록에서 아직 안 본 줄만 대기열에 넣는다. 돌려주는 값은 새로 넣은 수. */
  accept(rows: readonly unknown[], now = Date.now()): number {
    let added = 0;
    for (const raw of [...rows].sort((a, b) => (Number((a as LegendAnnouncement)?.createdAt) || 0) - (Number((b as LegendAnnouncement)?.createdAt) || 0))) {
      const row = readLegendAnnouncement(raw);
      if (!row || this.seen.has(row.id)) continue;
      // 오래된 공지(창 밖)는 기억만 하고 띄우지 않는다 — 새로 접속한 화면에 지난 소식이 밀려오지 않게.
      this.seen.add(row.id);
      if (row.createdAt > 0 && now - row.createdAt > LEGEND_ANNOUNCEMENT_WINDOW_MS) continue;
      this.pending.push(row); added++;
    }
    if (this.pending.length > LEGEND_QUEUE_LIMIT) this.pending = this.pending.slice(-LEGEND_QUEUE_LIMIT);
    return added;
  }

  /** 내가 뽑은 레전드(또는 게스트의 로컬 표시)를 바로 맨 앞에 세운다. 이미 본 id면 false. */
  show(row: LegendAnnouncement): boolean {
    if (this.seen.has(row.id)) return false;
    this.seen.add(row.id);
    this.pending.unshift(row);
    return true;
  }

  /** 지금 띄울 공지 — 시간이 끝났으면 다음 줄로 넘어간다. */
  current(now = Date.now()): LegendAnnouncement | undefined {
    if (this.active && now < this.activeUntil) return this.active;
    this.active = this.pending.shift();
    this.activeUntil = this.active ? now + this.duration : 0;
    return this.active;
  }

  get waiting(): number { return this.pending.length; }
}
