/**
 * 상세 스탯 — LV 배지를 눌렀을 때 열리는 `상세 스탯` 창의 **숫자 전부**(`src/ui/modals/statsModal.ts`가
 * 그리기만 한다). 화면과 계산을 갈라 두면 같은 값을 테스트가 직접 확인할 수 있다.
 *
 * 여기 있는 값은 전투가 실제로 쓰는 값과 같은 출처에서 온다:
 *   · 공격·방어·최대 체력·치명·공속 → `totalStats(save)`(레벨 기본값 + 장비 + 패시브 + 추가옵션)
 *   · 피흡·회피·체력 회복·추가 데미지 → `effectiveExtraOptions(save.equipment)`(상한 적용값)
 *   · 치명타 확률 상한·치명타 피해 배수(기본 180% + 장비 `치명타 피해량`) → `src/game/battle/formulas.ts`
 *   · 전투력 → `combatPower`(`src/game/power.ts`, 내 정보 창과 같은 식)
 *
 * **없는 값은 넣지 않는다.** 스탯 포인트처럼 쓰는 곳이 없는 값은 줄을 만들지 않는다 — 0이라고 적으면
 * "그런 시스템이 있는데 0"으로 읽히기 때문이다(`save.skillPoints`는 스킬 레벨이 **같은 스킬북 중복**으로만
 * 올라가 이 값을 쓰지 않는다). 밸런스 v2(#307)가 만든 **스킬 쿨타임 감소**와 **% 피해 감소**는 여기서
 * 전투와 같은 식으로 계산해 한 줄씩 보여 준다(`SKILL_CDR_CAP`·`damageReduction`).
 */
import { CDR_CAP, totalStats } from './items';
import type { Save } from './store';
import { effectiveExtraOptions, EXTRA_CRIT_DMG_CAP } from './extraOptions';
import { CRIT_CHANCE_CAP, critDamageScale, damageReduction } from './battle/formulas';
import { combatPower } from './power';

/** 추가옵션 %가 붙는 상한 — `effectiveExtraOptions`와 같은 값을 안내 문구에 쓴다. */
const EXTRA_CAPS = { lifesteal: 15, evasion: 30, regen: 12 } as const;

export type StatSheetRowKey =
  | 'attack' | 'defense' | 'health'
  | 'critChance' | 'critDamage' | 'attackSpeed' | 'attacksPerSecond' | 'cdr'
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
  // 방어는 **% 피해 감소**로 보여 준다(밸런스 v2) — 예전 `방어 × 0.2`는 20층에서 피해를 1로 만드는 식이었다.
  const reduction = damageReduction(stats.defense, save.floor);
  const reductionText = `피해 감소 ${percent(reduction * 100)}`;
  const cdr = Math.min(CDR_CAP, Math.max(0, Math.round(stats.cdr)));
  // 치명타 피해(백로그 2번): 기본 180%에 장비 `치명타 피해량`을 더한다(가산 상한 +15% → 195%).
  const critBonus = Math.min(EXTRA_CRIT_DMG_CAP, Math.max(0, extras.critDmgPct));
  const critDamageText = critBonus > 0 ? `장비 +${critBonus}%${extras.critDmgPct >= EXTRA_CRIT_DMG_CAP ? ` · 상한` : ''}` : undefined;
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
          { key: 'defense', label: '방어력', value: count(stats.defense), note: `${reductionText} · ${save.floor}층 기준` },
          { key: 'health', label: '최대 체력', value: count(maxHp) }
        ]
      },
      {
        key: 'chance', title: '치명·속도',
        rows: [
          { key: 'critChance', label: '치명타 확률', value: percent(critChance), note: stats.crit > CRIT_CHANCE_CAP ? `상한 ${CRIT_CHANCE_CAP}%` : undefined },
          { key: 'critDamage', label: '치명타 피해', value: percent(critDamageScale(extras.critDmgPct) * 100), note: critDamageText },
          { key: 'attackSpeed', label: '공격속도', value: percent(stats.speed), note: `초당 ${aps.toFixed(2)}회` },
          { key: 'cdr', label: '스킬 쿨타임 감소', value: percent(cdr), note: cdr >= CDR_CAP ? `상한 ${CDR_CAP}%` : undefined }
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
