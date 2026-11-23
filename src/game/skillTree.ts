/**
 * 4단계 스킬 트리 — 데이터·판정·투자/초기화 (2026-11-22 송덕진 님 확정 스펙, 파트 A).
 *
 * 화면(`ui/modals/skillModal.ts`·`ui/skillTreeView.ts`)은 이 파일이 정한 값만 DOM으로 옮긴다.
 * 전투는 예전처럼 `skills.ts`의 레벨 식(`skillDamageScale` 등)을 그대로 쓰고, 여기서는 **어느 스킬을
 * 언제 열고 얼마를 들이는가**만 정한다.
 *
 * ## 확장형 구조
 * 노드 수를 코드에 박지 않는다. 직업별 액티브 순서(`skillOrderFor`)와 패시브 순서(`passiveOrderFor`)를
 * 읽어 `TIER_PLAN`(티어·자리)에 차례로 앉힌다. 스킬을 더하면 `skills.ts`의 순서 배열에 한 칸을 더하면
 * 되고, 계획보다 많은 스킬은 마지막 티어(4) 뒤에 덧붙는다. 각 노드는 `tier`·`prerequisites`(선행 스킬과
 * 요구 레벨)·`minInvestedSp`(누적 투자 SP)를 스스로 들고 있어, 트리를 바꿀 때 이 파일의 표만 고치면 된다.
 *
 * ## 배치 (3-3-3-2)
 * | 티어 | 자리 0 | 자리 1 | 자리 2 |
 * |---|---|---|---|
 * | 1 | 액티브 1 | 액티브 2 | 패시브 1 |
 * | 2 | 액티브 3 | 액티브 4 | 패시브 2 |
 * | 3 | 액티브 5 | 액티브 6 | 패시브 3 |
 * | 4 (궁극) | 액티브 7 | 액티브 8 | — |
 *
 * 자리(lane)가 곧 세로 줄기다: 2티어는 같은 자리 1티어를, 3티어는 같은 자리 2티어를, 4티어 궁극은
 * 같은 자리 3티어를 요구한다. 그래서 액티브 줄기 두 개와 패시브 줄기 하나가 위에서 아래로 이어진다.
 */
import {
  MAX_SKILL_LEVEL, fireBoltCount, passiveOrderFor, passives, skillDamageScale, skillDuration, skillOrderFor, skillRange, skills,
  type Job, type PassiveId, type SkillId, type SkillLevelId
} from './skills';
import { iceArrowSlow, multiShotPattern, skillArea } from './battle/skillAreas';
import { spLedger } from './skillPoints';
import { normalizeQuickSlots, skillCastScale } from './loadout';

export type SkillTier = 1 | 2 | 3 | 4;

/** 선행 조건 하나 — `id` 스킬이 `level` 이상이어야 한다. */
export type SkillRequirement = { id: SkillLevelId; level: number };

export type SkillTreeNode = {
  id: SkillLevelId;
  tier: SkillTier;
  /** 같은 티어 안의 가로 자리(0부터) — 연결선과 화면 배치가 이 값을 쓴다. */
  lane: number;
  prerequisites: readonly SkillRequirement[];
  /** 이 스킬을 열려면 트리에 누적 투자해야 하는 SP(`spSpent`). */
  minInvestedSp: number;
  /** 4티어 궁극 스킬인가 — 화면이 금빛 테두리와 `궁극` 표시를 붙인다. */
  ultimate: boolean;
  passive: boolean;
};

/** 티어마다 놓는 스킬 수 — 기본 11종(3-3-3-2). */
export const TIER_SHAPE: readonly number[] = [3, 3, 3, 2];

/** 티어 진입 조건 — 앞 티어 같은 자리 스킬의 요구 레벨과 누적 투자 SP. */
export const TIER_GATE: Record<SkillTier, { minInvestedSp: number; prerequisiteLevel: number }> = {
  1: { minInvestedSp: 0, prerequisiteLevel: 0 },
  2: { minInvestedSp: 3, prerequisiteLevel: 1 },
  3: { minInvestedSp: 12, prerequisiteLevel: 2 },
  4: { minInvestedSp: 36, prerequisiteLevel: 3 }
};

/** 기본 배치표 — 액티브 8종과 패시브 3종을 티어·자리에 앉힌다. */
const TIER_PLAN: readonly { tier: SkillTier; lane: number; kind: 'active' | 'passive'; index: number }[] = [
  { tier: 1, lane: 0, kind: 'active', index: 0 },
  { tier: 1, lane: 1, kind: 'active', index: 1 },
  { tier: 1, lane: 2, kind: 'passive', index: 0 },
  { tier: 2, lane: 0, kind: 'active', index: 2 },
  { tier: 2, lane: 1, kind: 'active', index: 3 },
  { tier: 2, lane: 2, kind: 'passive', index: 1 },
  { tier: 3, lane: 0, kind: 'active', index: 4 },
  { tier: 3, lane: 1, kind: 'active', index: 5 },
  { tier: 3, lane: 2, kind: 'passive', index: 2 },
  { tier: 4, lane: 0, kind: 'active', index: 6 },
  { tier: 4, lane: 1, kind: 'active', index: 7 }
];

const treeCache = new Map<Job, readonly SkillTreeNode[]>();

/**
 * 그 직업의 스킬 트리 — 11개 노드를 티어·자리 순서대로 돌려준다.
 * 같은 직업은 한 번 만든 표를 다시 쓴다(화면을 다시 그릴 때마다 만들지 않는다).
 */
export function skillTreeFor(job: Job): readonly SkillTreeNode[] {
  const cached = treeCache.get(job);
  if (cached) return cached;
  const nodes = buildSkillTree(skillOrderFor(job), passiveOrderFor(job));
  treeCache.set(job, nodes);
  return nodes;
}

/**
 * 스킬 순서 배열 두 개로 트리를 만든다 — 직업에 매이지 않는 순수 함수다.
 * `TIER_PLAN`(3-3-3-2)을 차례로 채우고, 남는 스킬은 마지막 티어 뒤에 덧붙인다(스킬 추가 대비).
 */
export function buildSkillTree(actives: readonly SkillLevelId[], passivesOfJob: readonly SkillLevelId[]): readonly SkillTreeNode[] {
  const nodes: SkillTreeNode[] = [];
  for (const slot of TIER_PLAN) {
    const id = slot.kind === 'active' ? actives[slot.index] : passivesOfJob[slot.index];
    if (!id) continue;
    nodes.push(makeNode(nodes, { id, tier: slot.tier, lane: slot.lane, passive: slot.kind === 'passive' }));
  }
  // 계획보다 많은 스킬(향후 추가분)은 마지막 티어 뒤에 붙인다 — 개수를 코드에 박지 않는다.
  const placed = new Set(nodes.map(node => node.id));
  const extra = [...actives, ...passivesOfJob].filter(id => !placed.has(id));
  extra.forEach((id, index) => {
    const passive = (passivesOfJob as readonly string[]).includes(id);
    nodes.push(makeNode(nodes, { id, tier: 4, lane: TIER_SHAPE[3] + index, passive }));
  });
  return nodes;
}

function makeNode(placed: readonly SkillTreeNode[], spec: { id: SkillLevelId; tier: SkillTier; lane: number; passive: boolean }): SkillTreeNode {
  const gate = TIER_GATE[spec.tier];
  // 같은 자리의 앞 티어 스킬이 선행이다(1티어는 선행 없음).
  const parent = spec.tier > 1
    ? placed.find(node => node.tier === spec.tier - 1 && node.lane === spec.lane)
    : undefined;
  return {
    id: spec.id,
    tier: spec.tier,
    lane: spec.lane,
    prerequisites: parent ? [{ id: parent.id, level: gate.prerequisiteLevel }] : [],
    minInvestedSp: gate.minInvestedSp,
    ultimate: spec.tier === 4,
    passive: spec.passive
  };
}

/** 이 직업 트리에서 그 스킬의 노드 — 다른 직업 스킬이면 `undefined`. */
export function skillNodeFor(job: Job, id: SkillLevelId): SkillTreeNode | undefined {
  return skillTreeFor(job).find(node => node.id === id);
}

/** 노드의 가로 위치(0~1)와 세로 위치(0~1, 티어 중심) — 연결선이 이 값을 쓴다. */
export function nodeAnchor(node: Pick<SkillTreeNode, 'tier' | 'lane'>): { x: number; y: number } {
  // 1~3티어는 3열, 4티어는 2열을 가운데로 모아 놓는다(`.skill-tier[data-tier="4"]`).
  const x = node.tier >= 4 ? 1 / 6 + (node.lane + .5) / 2 * (2 / 3) : (node.lane + .5) / TIER_SHAPE[0];
  return { x, y: (node.tier - .5) / TIER_SHAPE.length };
}

export type SkillTreeEdge = { from: SkillLevelId; to: SkillLevelId; fromX: number; fromY: number; toX: number; toY: number; ultimate: boolean };

/** 트리의 연결선 — 선행 조건 하나가 선 하나다. 화면은 이 목록으로 SVG `path`를 그린다. */
export function skillTreeEdges(job: Job): readonly SkillTreeEdge[] {
  const nodes = skillTreeFor(job), edges: SkillTreeEdge[] = [];
  for (const node of nodes) {
    const to = nodeAnchor(node);
    for (const requirement of node.prerequisites) {
      const parent = nodes.find(other => other.id === requirement.id);
      if (!parent) continue;
      const from = nodeAnchor(parent);
      edges.push({ from: parent.id, to: node.id, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, ultimate: node.ultimate });
    }
  }
  return edges;
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

/** 트리 계산에 필요한 세이브의 최소 모양(`Save` 전체를 요구하지 않는다). */
export type SkillTreeSave = {
  job?: Job;
  level?: number;
  learned?: SkillId[];
  passives?: PassiveId[];
  skillLevels?: Partial<Record<SkillLevelId, number>>;
  quickSlots?: [SkillId | null, SkillId | null, SkillId | null];
  skillPoints?: number;
};

export type SkillRequirementState = { id: SkillLevelId; name: string; have: number; need: number; met: boolean };

export type SkillNodeStatus = {
  node: SkillTreeNode;
  learned: boolean;
  level: number;
  maxed: boolean;
  /** 지금 트리에 투자된 SP와 이 노드가 요구하는 누적 SP. */
  spSpent: number;
  spNeed: number;
  spMet: boolean;
  requirements: SkillRequirementState[];
  /** 선행·누적 SP 조건을 모두 채웠는가(미습득이면 `열림`, 습득했으면 이미 지나온 자리다). */
  open: boolean;
  canInvest: boolean;
  /** 투자할 수 없을 때 그 이유(가능하면 빈 문자열). */
  reason: string;
};

export function skillNameOf(id: SkillLevelId): string {
  return (skills as Record<string, { name: string }>)[id]?.name ?? (passives as Record<string, { name: string }>)[id]?.name ?? id;
}

function rankOf(save: SkillTreeSave, id: SkillLevelId): number {
  const learned = [...(save.learned ?? []), ...(save.passives ?? [])].includes(id as never);
  if (!learned) return 0;
  const raw = save.skillLevels?.[id];
  const rank = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1;
  return Math.max(1, Math.min(MAX_SKILL_LEVEL, rank));
}

export function skillNodeStatus(save: SkillTreeSave, node: SkillTreeNode): SkillNodeStatus {
  const level = rankOf(save, node.id);
  const learned = level > 0;
  const ledger = spLedger(save);
  const requirements = node.prerequisites.map(requirement => {
    const have = rankOf(save, requirement.id);
    return { id: requirement.id, name: skillNameOf(requirement.id), have, need: requirement.level, met: have >= requirement.level };
  });
  const spMet = ledger.spent >= node.minInvestedSp;
  const open = spMet && requirements.every(requirement => requirement.met);
  const maxed = level >= MAX_SKILL_LEVEL;
  const canInvest = !maxed && ledger.available > 0 && (learned || open);
  const missing = requirements.filter(requirement => !requirement.met);
  const reason = maxed ? '최대 레벨입니다'
    : missing.length ? `선행 스킬: ${missing.map(item => `${item.name} Lv.${item.need}`).join(' · ')}`
      : !spMet ? `누적 투자 SP ${node.minInvestedSp} 필요 (지금 ${ledger.spent})`
        : ledger.available < 1 ? '스킬 포인트가 부족합니다'
          : '';
  return { node, learned, level, maxed, spSpent: ledger.spent, spNeed: node.minInvestedSp, spMet, requirements, open, canInvest, reason };
}

// ── 투자·초기화 ──────────────────────────────────────────────────────────────

/**
 * SP 1을 그 스킬에 넣는다 — 미습득이면 Lv.1로 습득, 이미 배웠으면 한 랭크 오른다.
 * 조건(선행·누적 SP·가용 SP·최대 레벨)은 `skillNodeStatus`가 정한 그대로다.
 */
export function investSkillPoint(save: SkillTreeSave, id: SkillLevelId): { ok: boolean; message: string } {
  const node = skillNodeFor(save.job ?? 'warrior', id);
  if (!node) return { ok: false, message: '이 직업의 스킬이 아닙니다.' };
  const status = skillNodeStatus(save, node);
  if (status.maxed) return { ok: false, message: `${skillNameOf(id)}은(는) 이미 최대 레벨입니다.` };
  if (!status.learned && !status.open) return { ok: false, message: status.reason || '아직 열리지 않은 스킬입니다.' };
  if (spLedger(save).available < 1) return { ok: false, message: '스킬 포인트가 부족합니다.' };
  save.skillLevels ??= {};
  if (!status.learned) {
    if (node.passive) (save.passives ??= []).push(id as PassiveId);
    else (save.learned ??= []).push(id as SkillId);
    save.skillLevels[id] = 1;
  } else {
    save.skillLevels[id] = status.level + 1;
  }
  save.skillPoints = spLedger(save).available;
  const name = skillNameOf(id);
  return { ok: true, message: `${name} Lv.${save.skillLevels[id]} — SP 1 투자` };
}

/**
 * 스킬 초기화(테스트 서버 기간 **무료**) — 투자한 SP를 전액 돌려준다.
 *
 * 첫 액티브 스킬의 무료 1랭크만 남기고 모든 랭크·습득을 되돌리며, 장착 원에서 사라진 스킬도 함께 뺀다.
 * 나중에 금화·다이아 비용을 붙일 때는 `skillsResetCost`(아래)에 값만 정하고 화면이 그 값을 안내하면 된다 —
 * 지금은 0이라 `초기화 (무료)`다.
 */
export function resetSkillTree(save: SkillTreeSave): { ok: boolean; refunded: number; message: string } {
  const job = save.job ?? 'warrior';
  const starter = skillOrderFor(job)[0];
  const before = spLedger(save);
  const keepStarter = rankOf(save, starter) > 0;
  save.learned = keepStarter ? [starter] : [];
  save.passives = [];
  save.skillLevels = keepStarter ? { [starter]: 1 } : {};
  save.quickSlots = normalizeQuickSlots(save.quickSlots, save.learned, job);
  const after = spLedger(save);
  save.skillPoints = after.available;
  const refunded = Math.max(0, before.spent - after.spent);
  return { ok: true, refunded, message: `스킬을 초기화했습니다 — SP ${refunded}pt를 돌려받았습니다.` };
}

/** 초기화 비용 — 테스트 서버 기간은 0(무료). 값이 생기면 `{ gold, diamond }`를 채운다. */
export const skillsResetCost: { gold: number; diamond: number } = { gold: 0, diamond: 0 };
export function skillsResetIsFree(): boolean { return skillsResetCost.gold === 0 && skillsResetCost.diamond === 0; }

// ── 상세 패널의 현재/다음 수치 ────────────────────────────────────────────────

export type SkillValueRow = { label: string; value: string };

/** 액티브·패시브가 실제로 오르는 값을 한 줄씩 — `현재`와 `다음 레벨` 두 열이 같은 함수를 쓴다. */
export function skillValueRows(id: SkillLevelId, level: number): SkillValueRow[] {
  const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
  if ((passives as Record<string, unknown>)[id]) return passiveValueRows(id as PassiveId, lv);
  const skill = (skills as Record<string, { cooldown: number }>)[id];
  if (!skill) return [];
  // 광폭 버프 3종은 공격 계수가 없다 — 공격 버프 %와 지속이 오른다(작업 216).
  if (id === 'warcry' || id === 'hawkEye' || id === 'arcaneShield') {
    return [
      { label: '공격 버프', value: `+${(20 + (lv - 1) * 1.5).toFixed(1)}%` },
      { label: '지속', value: `${skillDuration(id as SkillId, lv).toFixed(1)}초` }
    ];
  }
  if (id === 'multiShot') {
    const pattern = multiShotPattern(lv);
    return [
      { label: '위력', value: `× ${(.95 * skillDamageScale(lv)).toFixed(2)} · 적당 1회` },
      { label: '사거리', value: `${skillRange(id, lv)}` },
      { label: '화살·범위', value: `${pattern.count}발 · ${Math.round(pattern.halfArc * 2 * 180 / Math.PI)}°` }
    ];
  }
  if (id === 'iceArrow') {
    const slow = iceArrowSlow(lv);
    return [
      { label: '위력', value: `× ${(1.9 * skillDamageScale(lv)).toFixed(2)}` },
      { label: '폭발 반경', value: `${skillArea(id, lv).projectileRadius}` },
      { label: '둔화', value: `이동속도 ${Math.round(slow.speedScale * 100)}% · ${slow.duration.toFixed(1)}초` }
    ];
  }
  if (id === 'fireBolt') return [
    { label: '총 위력', value: `× ${(skillCastScale(id, lv) * skillDamageScale(lv)).toFixed(2)}` },
    { label: '화염구', value: `${fireBoltCount(lv)}발 · 단일 대상` },
    { label: '사거리', value: `${skillRange(id, lv)}` }
  ];
  if (id === 'arrowRain') {
    const area = skillArea(id, lv);
    return [
      { label: '총 위력', value: `× ${(skillCastScale(id, lv) * skillDamageScale(lv)).toFixed(2)}` },
      { label: '시전 거리', value: `${area.range}` },
      { label: '타격 반경', value: `${area.radius}` },
      { label: '지속', value: `${area.duration.toFixed(1)}초` }
    ];
  }
  return [
    { label: '위력', value: `× ${(skillCastScale(id as SkillId, lv) * skillDamageScale(lv)).toFixed(2)}` },
    { label: '사거리', value: `${skillRange(id as SkillId, lv)}` }
  ];
}

/** 패시브가 실제로 올리는 능력치 — `items.ts` `totalStats`의 식과 같은 값이다(밸런스 v2). */
export function passiveValueRows(id: PassiveId, level: number): SkillValueRow[] {
  const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(level)));
  const mastery = Math.round((15 + (lv - 1) * 2) * 10) / 10;
  const crit = Math.round((4 + (lv - 1) * .9) * 10) / 10;
  const speed = Math.round((6 + (lv - 1) * .35) * 10) / 10;
  switch (id) {
    case 'mastery': case 'bowMastery': case 'staffMastery': return [{ label: '공격력', value: `+${mastery}%` }];
    case 'body': return [{ label: 'HP·방어력', value: `+${mastery}%` }];
    case 'instinct': return [{ label: '치명타', value: `+${crit}%` }, { label: '공격속도', value: `+${speed}%` }];
    case 'swiftStep': case 'manaCircuit': return [{ label: '공격속도', value: `+${speed}%` }];
    case 'hawkSight': case 'arcaneSense': return [{ label: '치명타', value: `+${crit}%` }];
    default: return [];
  }
}
