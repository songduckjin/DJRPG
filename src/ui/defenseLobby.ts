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
import { DEFENSE_MAX_STAGE, defenseBossStage, defenseDescentSpeed, defenseEliteWave, defenseRewardFloor, defenseSpawnSeconds, defenseStageEnemyCount } from '../game/dungeon/defenseBattle';
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
  /** 최고 도달 웨이브(0 = 기록 없음). */
  bestStage = 0;
  reachedAt = 0;
  /** 서버에서 받은 최근 순위 — 순위 탭이 그대로 그린다. */
  records: DefenseRanking[] = [];
  live?: DefenseLive;
  /** 지금 도전할 웨이브 = 최고 + 1(최고 기록 다음 웨이브부터 다시). 무한 모드라 상한은 표시용이다. */
  get nextStage(): number { return Math.min(DEFENSE_MAX_STAGE, this.bestStage + 1); }
  get status(): DefenseLobbyStatus {
    const wave = this.nextStage;
    const boss = defenseBossStage(wave), elite = defenseEliteWave(wave);
    return {
      headline: this.bestStage > 0 ? `최고 ${this.bestStage} 웨이브` : '아직 기록이 없습니다',
      detail: boss
        ? `${wave} 웨이브는 보스 웨이브 — 보스 1 + 호위 6마리.`
        : `${wave} 웨이브는 ${elite ? '정예' : '일반'} 웨이브 ${defenseStageEnemyCount(wave)}마리.`,
      button: this.bestStage > 0 ? '다시 도전' : '도전하기',
      bossEvery: 5
    };
  }
  /** 지금 웨이브가 보스 웨이브인가(로비 안내용). */
  get bossStage(): boolean { return defenseBossStage(this.nextStage); }
  /** 지금 웨이브가 정예 웨이브인가. */
  get eliteWave(): boolean { return defenseEliteWave(this.nextStage); }
  /** 이번 웨이브의 몹 수·추격 속도·스폰 간격·보상 층 — 로비 구성 카드가 쓴다. */
  get nextWaveSpec(): { mobs: number; speed: number; spawn: number; rewardFloor: number } {
    const wave = this.nextStage;
    return { mobs: defenseStageEnemyCount(wave), speed: Math.round(defenseDescentSpeed(wave)), spawn: defenseSpawnSeconds(wave), rewardFloor: defenseRewardFloor(wave) };
  }
  load(save: Pick<Save, 'defenseStage' | 'defenseStageAt'>): void {
    this.bestStage = defenseReachedStage(save);
    this.reachedAt = defenseReachedAt(save);
  }
  /** 서버 순위를 로비 상태에 옮겨 적는다. */
  syncStanding(records?: DefenseRecord[]): void { this.records = records ? records.slice() : []; }
  /** 판이 끝난 뒤 최고 웨이브를 세이브와 로비 상태에 함께 적는다. 세이브가 바뀌었으면 true. */
  record(save: Save, stage: number, now = Date.now()): boolean {
    const changed = recordDefenseRun(save, stage, now);
    this.load(save);
    return changed;
  }
}
