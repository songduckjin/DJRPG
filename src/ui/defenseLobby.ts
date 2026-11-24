/**
 * 무한 방어전 로비 상태 (2026-11-24).
 *
 * 진입은 기존 던전 모달의 첫 화면을 **던전 허브**로 확장해 두 카드 중 하나를 고른다 — `mode`가 그 상태다
 * (`hub` → `endless`(기존 끝없는 던전) / `defense`(무한 방어전)). 화면은 `ui/modals/defenseLobby.ts`가 그린다.
 *
 * 진행은 계정 세이브가 소유한다(`defenseStage`·`defenseStageAt`) — 새로고침·재접속 뒤에도 이 값에서 이어 간다.
 */
import type { DefenseLive, DefenseRecord } from '../game/defenseLive';
import { defenseReachedAt, defenseReachedStage, recordDefenseRun } from '../game/defenseProgress';
import { DEFENSE_MAX_STAGE, defenseBossStage, defenseStageEnemyCount, defenseWaveKills } from '../game/dungeon/defenseBattle';
import type { Save } from '../game/store';

export type DungeonMode = 'hub' | 'endless' | 'defense';
export type DefenseRanking = DefenseRecord;
export { DEFENSE_MAX_STAGE };

/** 방어전 로비가 그리는 한 줄 — 최고 기록과 지금 들어갈 판의 안내. */
export type DefenseLobbyStatus = {
  headline: string;
  detail: string;
  button: string;
  /** 5스테이지마다 보스라는 안내. */
  bossEvery: number;
};

export function defenseRankings(records: DefenseRanking[]): DefenseRanking[] {
  return records.filter(row => row.bestStage > 0).slice().sort((a, b) => b.bestStage - a.bestStage || a.reachedAt - b.reachedAt);
}

export class DefenseLobby {
  tab: 'challenge' | 'ranking' = 'challenge';
  /** 최고 도달 스테이지(0 = 기록 없음). */
  bestStage = 0;
  reachedAt = 0;
  /** 서버에서 받은 최근 순위 — 순위 탭이 그대로 그린다. */
  records: DefenseRanking[] = [];
  live?: DefenseLive;
  /** 지금 도전할 스테이지 = 최고 + 1(최고 기록 다음 스테이지부터 다시). 무한 모드라 상한은 표시용이다. */
  get nextStage(): number { return Math.min(DEFENSE_MAX_STAGE, this.bestStage + 1); }
  get status(): DefenseLobbyStatus {
    const stage = this.nextStage;
    return {
      headline: this.bestStage > 0 ? `최고 ${this.bestStage} 스테이지` : '아직 기록이 없습니다',
      detail: stage % 5 === 0
        ? `${stage} 스테이지는 보스가 나옵니다. 웨이브 3개를 막으면 다음 스테이지로 넘어갑니다.`
        : `웨이브 ${defenseWaveKills(stage)}마리 × 3 = 스테이지 1. ${stage} 스테이지 적 ${defenseStageEnemyCount(stage)}마리.`,
      button: this.bestStage > 0 ? '다시 도전' : '도전하기',
      bossEvery: 5
    };
  }
  /** 지금 스테이지가 보스 스테이지인가(로비 안내용). */
  get bossStage(): boolean { return defenseBossStage(this.nextStage); }
  load(save: Pick<Save, 'defenseStage' | 'defenseStageAt'>): void {
    this.bestStage = defenseReachedStage(save);
    this.reachedAt = defenseReachedAt(save);
  }
  /** 서버 순위를 로비 상태에 옮겨 적는다. */
  syncStanding(records?: DefenseRecord[]): void { this.records = records ? records.slice() : []; }
  /** 판이 끝난 뒤 최고 스테이지를 세이브와 로비 상태에 함께 적는다. 세이브가 바뀌었으면 true. */
  record(save: Save, stage: number, now = Date.now()): boolean {
    const changed = recordDefenseRun(save, stage, now);
    this.load(save);
    return changed;
  }
}
