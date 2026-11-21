/**
 * 상세 스탯 — LV 배지를 눌렀을 때 열리는 `상세 스탯` 창의 **숫자 전부**(`src/ui/modals/statsModal.ts`가
 * 그리기만 한다). 화면과 계산을 갈라 두면 같은 값을 테스트가 직접 확인할 수 있다.
 *
 * 여기 있는 값은 전투가 실제로 쓰는 값과 같은 출처에서 온다:
 *   · 공격·방어·최대 체력·치명·공속 → `totalStats(save)`(레벨 기본값 + 장비 + 패시브 + 추가옵션)
 *   · 피흡·회피·체력 회복·추가 데미지 → `effectiveExtraOptions(save.equipment)`(상한 적용값)
 *   · 치명타 확률 상한·치명타 피해 배수 → `src/game/battle/formulas.ts`
 *   · 전투력 → `combatPower`(`src/game/power.ts`, 내 정보 창과 같은 식)
 *
 * **없는 값은 넣지 않는다.** 스킬 쿨타임 감소(CDR)·스탯 포인트처럼 이 베이스(main + #304)에 아직
 * 없는 규칙은 줄을 만들지 않는다 — 0이라고 적으면 "그런 시스템이 있는데 0"으로 읽히기 때문이다.
 * (`save.skillPoints`는 세이브에 남아 있지만 스킬 레벨은 **같은 스킬북 중복**으로만 올라가고 이 값을
 * 쓰는 곳이 없다 — 화면에 띄우면 올릴 방법이 없는 숫자가 된다.) CDR·% 방어는 밸런스 v2(#307)에서
 * 생기면 여기에 한 줄씩 더한다.
 */
import { totalStats } from './items';
import type { Save } from './store';
import { effectiveExtraOptions } from './extraOptions';
import { CRIT_CHANCE_CAP, CRIT_DAMAGE_SCALE } from './battle/formulas';
import { combatPower } from './power';

/** 방어력 1점이 한 타에서 깎는 피해 — `enemyHitDamage`가 `방어력 × 0.2`를 뺀다. */
export const DEFENSE_DAMAGE_SCALE = .2;

/** 추가옵션 %가 붙는 상한 — `effectiveExtraOptions`와 같은 값을 안내 문구에 쓴다. */
const EXTRA_CAPS = { lifesteal: 15, evasion: 30, regen: 12 } as const;

export type StatSheetRowKey =
  | 'attack' | 'defense' | 'health'
  | 'critChance' | 'critDamage' | 'attackSpeed' | 'attacksPerSecond'
  | 'lifesteal' | 'evasion' | 'regen' | 'bonusDamage';

export type StatSheetRow = { key: StatSheetRowKey; label: string; value: string; note?: string };
export type StatSheetGroup = { key: 'battle' | 'chance' | 'survival'; title: string; rows: StatSheetRow[] };

export type StatSheet = {
  /** 전투력 — HUD·내 정보 창과 같은 숫자 */
  power: number;
  level: number;
  currentHp: number;
  maxHp: number;
  groups: StatSheetGroup[];
};

const count = (value: number): string => Math.round(value).toLocaleString('ko-KR');
/** 확률·% 값 — 소수 한 자리까지만(정수면 정수로). */
const percent = (value: number): string => `${Math.round(value * 10) / 10}%`;

/**
 * 초당 공격 횟수 — 평타 간격 `attackInterval`(engine의 `cooldowns.attack`)을 공격속도 %로 나눈다.
 * 공격속도 0%면 0.48초에 한 번(약 2.08회), 24%면 0.387초에 한 번(약 2.58회)이다.
 */
export function attacksPerSecond(speed: number, attackInterval: number): number {
  const interval = attackInterval / (1 + Math.max(0, speed) / 100);
  return interval > 0 ? 1 / interval : 0;
}

/**
 * 상세 스탯 한 벌.
 *
 * @param options.currentHp       지금 체력(창을 연 순간의 `world.player.hp`)
 * @param options.attackInterval  평타 기본 간격(초) — 초당 공격을 셀 때만 쓴다
 */
export function statSheet(save: Save, options: { currentHp: number; attackInterval: number }): StatSheet {
  const stats = totalStats(save);
  const extras = effectiveExtraOptions(save.equipment);
  const critChance = Math.min(CRIT_CHANCE_CAP, Math.max(0, stats.crit));
  const aps = attacksPerSecond(stats.speed, options.attackInterval);
  const flatDefense = Math.round(stats.defense * DEFENSE_DAMAGE_SCALE);
  const maxHp = Math.round(stats.health);
  const currentHp = Math.max(0, Math.min(maxHp, Math.round(options.currentHp)));

  return {
    power: combatPower(stats),
    level: save.level,
    currentHp,
    maxHp,
    groups: [
      {
        key: 'battle', title: '전투',
        rows: [
          { key: 'attack', label: '공격력', value: count(stats.attack) },
          { key: 'defense', label: '방어력', value: count(stats.defense), note: `1타당 피해 -${count(flatDefense)}` },
          { key: 'health', label: '최대 체력', value: count(maxHp) }
        ]
      },
      {
        key: 'chance', title: '치명·속도',
        rows: [
          { key: 'critChance', label: '치명타 확률', value: percent(critChance), note: stats.crit > CRIT_CHANCE_CAP ? `상한 ${CRIT_CHANCE_CAP}%` : undefined },
          { key: 'critDamage', label: '치명타 피해', value: percent(CRIT_DAMAGE_SCALE * 100) },
          { key: 'attackSpeed', label: '공격속도', value: percent(stats.speed), note: `초당 ${aps.toFixed(2)}회` }
        ]
      },
      {
        key: 'survival', title: '생존·부가',
        rows: [
          { key: 'lifesteal', label: '생명력 흡수', value: percent(extras.lifestealPct), note: extras.lifestealPct >= EXTRA_CAPS.lifesteal ? `상한 ${EXTRA_CAPS.lifesteal}%` : undefined },
          { key: 'evasion', label: '회피', value: percent(extras.evasionPct), note: extras.evasionPct >= EXTRA_CAPS.evasion ? `상한 ${EXTRA_CAPS.evasion}%` : undefined },
          { key: 'regen', label: '체력 회복', value: `${percent(extras.regenPct)}/5초`, note: extras.regenPct >= EXTRA_CAPS.regen ? `상한 ${EXTRA_CAPS.regen}%` : undefined },
          { key: 'bonusDamage', label: '추가 피해', value: percent(extras.bonusDmgPct) }
        ]
      }
    ]
  };
}
