import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { jobs, skillOrderFor, passiveOrderFor, skills, passives, MAX_SKILL_LEVEL } = await import('../src/game/skills.ts');
const {
  buildSkillTree, investSkillPoint, resetSkillTree, skillNodeFor, skillNodeStatus, skillTreeEdges, skillTreeFor,
  skillValueRows, TIER_SHAPE, TIER_GATE, skillsResetIsFree
} = await import('../src/game/skillTree.ts');
const { spLedger, spSpent, spTotal, SP_PER_LEVEL } = await import('../src/game/skillPoints.ts');

/** 4단계 스킬 트리(2026-11-22 송덕진 님 확정 스펙, 파트 A) — 데이터 구조·SP 회계·투자·초기화. */

const rank = (save, id) => save.skillLevels?.[id] ?? (learned(save, id) ? 1 : 0);
const learned = (save, id) => save.learned.includes(id) || save.passives.includes(id);

/** 열려 있는 아무 스킬에 1pt — 게이트를 채울 때 쓴다(무한 루프 없이 실패를 바로 드러낸다). */
function investAny(save) {
  for (const node of skillTreeFor('warrior')) if (investSkillPoint(save, node.id).ok) return true;
  return false;
}
function pump(save, target) {
  let guard = 0;
  while (spLedger(save).spent < target) {
    assert(investAny(save), `누적 ${spLedger(save).spent}pt에서 더 투자할 곳이 없다`);
    assert((guard += 1) < 200, '투자 루프가 멈추지 않는다');
  }
}
function investTo(save, id, level) {
  while (rank(save, id) < level) assert.equal(investSkillPoint(save, id).ok, true, `${id} Lv.${level}`);
}

// ── 구조 ─────────────────────────────────────────────────────────────────────

test('직업마다 11개 스킬이 3-3-3-2 네 티어에 한 번씩 앉고, 4티어는 궁극 두 개다', () => {
  assert.deepEqual([...TIER_SHAPE], [3, 3, 3, 2], '기본 배치 3-3-3-2');
  for (const job of jobs) {
    const nodes = skillTreeFor(job);
    assert.equal(nodes.length, 11, `${job} 노드 11개`);
    assert.deepEqual([1, 2, 3, 4].map(tier => nodes.filter(node => node.tier === tier).length), [3, 3, 3, 2]);
    // 직업의 액티브 8 + 패시브 3이 빠짐없이 한 번씩.
    const expected = [...skillOrderFor(job), ...passiveOrderFor(job)].sort();
    assert.deepEqual(nodes.map(node => node.id).sort(), expected);
    assert.deepEqual(nodes.filter(node => node.ultimate).map(node => node.id).sort(), [...skillOrderFor(job)].slice(-2).sort(), '궁극 = 마지막 액티브 2개');
    // 각 티어의 자리(lane)는 0부터 빈틈없이 — 연결선이 이 값을 쓴다.
    for (const tier of [1, 2, 3, 4]) assert.deepEqual(nodes.filter(node => node.tier === tier).map(node => node.lane), Array.from({ length: TIER_SHAPE[tier - 1] }, (_, lane) => lane));
  }
});

test('노드는 티어·선행 스킬·누적 투자 SP를 스스로 들고 있다(2→3→4 티어로 이어지는 줄기)', () => {
  const nodes = skillTreeFor('warrior');
  const t1 = nodes.filter(node => node.tier === 1);
  for (const node of t1) { assert.deepEqual(node.prerequisites, []); assert.equal(node.minInvestedSp, 0); }
  for (const node of nodes.filter(node => node.tier > 1)) {
    const parent = nodes.find(other => other.tier === node.tier - 1 && other.lane === node.lane);
    assert.deepEqual(node.prerequisites, [{ id: parent.id, level: TIER_GATE[node.tier].prerequisiteLevel }]);
    assert.equal(node.minInvestedSp, TIER_GATE[node.tier].minInvestedSp);
  }
  // 연결선 8개 = 2·3티어 각 3 + 4티어 2.
  const edges = skillTreeEdges('warrior');
  assert.equal(edges.length, 8);
  for (const edge of edges) {
    assert(edge.fromY < edge.toY, '위에서 아래로만');
    assert.equal(edge.ultimate, skillTreeFor('warrior').find(node => node.id === edge.to).ultimate);
  }
});

test('스킬을 더하면 코드를 고치지 않고 마지막 티어 뒤에 붙는다(확장형 구조)', () => {
  const tree = buildSkillTree([...skillOrderFor('warrior'), 'futureSkill'], passiveOrderFor('warrior'));
  assert.equal(tree.length, 12, '11 + 추가 1');
  const extra = tree.at(-1);
  assert.equal(extra.id, 'futureSkill');
  assert.equal(extra.tier, 4);
  assert.equal(extra.lane, 2, '4티어 자리 다음');
  assert.equal(extra.ultimate, true);
  // 패시브를 더해도 같은 규칙으로 붙는다.
  const withPassive = buildSkillTree(skillOrderFor('warrior'), [...passiveOrderFor('warrior'), 'futurePassive']);
  assert.equal(withPassive.at(-1).passive, true);
  // 직업 트리는 한 번 만든 표를 다시 쓴다(같은 배열).
  assert.equal(skillTreeFor('mage'), skillTreeFor('mage'));
});

// ── SP 회계 ──────────────────────────────────────────────────────────────────

test('레벨당 SP 3, Lv.1은 0 — 만렙 30의 총량은 88pt다', () => {
  assert.equal(SP_PER_LEVEL, 3);
  assert.equal(spTotal(1), 1, '첫 스킬 1랭크(무료 지급)를 상쇄하는 몫');
  assert.equal(spTotal(2), 4);
  assert.equal(spTotal(30), 88);
  const save = freshSave('male', 'warrior');
  assert.deepEqual(spLedger(save), { total: 1, spent: 1, available: 0 }, 'Lv.1은 쓸 수 있는 SP가 0');
  save.level = 30;
  assert.equal(spLedger(save).available, 87, '만렙에서 87pt를 쓸 수 있다');
  assert(87 >= 87 && 87 <= 90, '스펙의 87~90pt 범위');
});

test('쓴 SP는 습득한 스킬의 랭크 합이고, 랭크는 Lv.10에서 멈춘다', () => {
  const save = freshSave('male', 'warrior');
  save.level = 30;
  save.learned = ['slash2', 'slam'];
  save.passives = ['mastery'];
  save.skillLevels = { slash2: 4, slam: 1, mastery: 30 };
  assert.equal(spSpent(save), 4 + 1 + MAX_SKILL_LEVEL, '랭크 30은 상한 10으로 센다');
  assert.equal(spLedger(save).available, 88 - 15);
});

// ── 투자 ─────────────────────────────────────────────────────────────────────

test('SP가 없으면(Lv.1) 투자할 수 없고, 레벨이 오르면 1티어부터 열린다', () => {
  const save = freshSave('male', 'warrior');
  assert.equal(investSkillPoint(save, 'slam').ok, false, 'Lv.1은 SP 0');
  assert.equal(learned(save, 'slam'), false);

  save.level = 5; // 총 13pt · 이미 1pt 사용 → 12pt
  const result = investSkillPoint(save, 'slam');
  assert.equal(result.ok, true);
  assert.equal(save.skillLevels.slam, 1);
  assert.equal(spLedger(save).available, 11);
  assert.equal(save.skillPoints, 11, '저장 필드도 같은 장부를 가리킨다');
  assert.equal(rank(save, 'slam'), 1);
});

test('2티어는 같은 줄기 1티어 Lv.1과 누적 3pt, 3티어는 12pt·Lv.2, 궁극은 36pt·Lv.3을 요구한다', () => {
  const save = freshSave('male', 'warrior');
  save.level = 30; // 87pt
  const warcry = skillNodeFor('warrior', 'warcry');
  assert.equal(skillNodeStatus(save, warcry).open, false, '누적 1pt로는 2티어가 안 열린다');
  assert.match(skillNodeStatus(save, warcry).reason, /누적 투자 SP 3/);

  pump(save, 3);
  assert.equal(skillNodeStatus(save, warcry).open, true, '3pt를 채우면 2티어가 열린다');
  assert.equal(investSkillPoint(save, 'warcry').ok, true);

  const destroy = skillNodeFor('warrior', 'destroy');
  assert.equal(skillNodeStatus(save, destroy).open, false, '2티어 같은 자리 스킬이 Lv.2여야 한다');
  assert.match(skillNodeStatus(save, destroy).reason, /선행 스킬: 블러드 레이지 Lv\.2/);
  assert.equal(investSkillPoint(save, 'warcry').ok, true);
  assert.equal(skillNodeStatus(save, destroy).requirements[0].met, true);
  assert.equal(skillNodeStatus(save, destroy).open, false, '아직 누적 12pt가 아니다');

  pump(save, 12);
  assert.equal(skillNodeStatus(save, destroy).open, true, '12pt + 선행 Lv.2면 3티어가 열린다');
  assert.equal(investSkillPoint(save, 'destroy').ok, true);

  const crushing = skillNodeFor('warrior', 'crushing');
  assert.equal(skillNodeStatus(save, crushing).open, false, '궁극은 아직');
  pump(save, TIER_GATE[4].minInvestedSp);
  assert.equal(skillNodeStatus(save, crushing).spMet, true, '36pt를 채웠다');
  assert.equal(skillNodeStatus(save, crushing).requirements[0].need, 3);
  assert.equal(skillNodeStatus(save, crushing).open, false, '3티어 같은 자리 스킬이 Lv.3이어야 한다');
  investTo(save, 'destroy', 3);
  assert.equal(skillNodeStatus(save, crushing).open, true, '36pt + destroy Lv.3이면 궁극이 열린다');
  assert.equal(investSkillPoint(save, 'crushing').ok, true);
  assert.equal(save.skillPoints, spLedger(save).available);
});

test('모든 스킬은 Lv.10이 끝이고 그 위로는 SP가 남아도 오르지 않는다', () => {
  assert.equal(MAX_SKILL_LEVEL, 10);
  const save = freshSave('male', 'warrior');
  save.level = 30;
  save.skillLevels = { slash2: 10 };
  const status = skillNodeStatus(save, skillNodeFor('warrior', 'slash2'));
  assert.equal(status.maxed, true);
  assert.equal(status.canInvest, false);
  assert.equal(investSkillPoint(save, 'slash2').ok, false);
  assert.equal(save.skillLevels.slash2, 10);
  // 11종을 모두 Lv.10으로 올리면 110pt — 만렙 88pt로는 다 올릴 수 없다(빌드 선택).
  assert.equal(11 * MAX_SKILL_LEVEL, 110);
});

test('다른 직업의 스킬과 모르는 ID는 투자할 수 없다', () => {
  const save = freshSave('male', 'warrior');
  save.level = 10;
  assert.equal(investSkillPoint(save, 'doubleShot').ok, false);
  assert.equal(investSkillPoint(save, 'nope').ok, false);
  assert.equal(save.learned.includes('doubleShot'), false);
});

// ── 초기화 ───────────────────────────────────────────────────────────────────

test('초기화는 무료이고 투자한 SP를 전액 돌려주며, 첫 스킬 1랭크와 장착 정합성만 남긴다', () => {
  assert.equal(skillsResetIsFree(), true);
  const save = freshSave('male', 'warrior');
  save.level = 20; // 총 58pt
  const before = spLedger(save).available;
  assert.equal(before, spTotal(20) - 1);
  for (const id of ['slash2', 'slam', 'mastery', 'warcry']) investSkillPoint(save, id);
  investSkillPoint(save, 'slash2');
  save.quickSlots = ['slash2', 'slam', null];
  const spent = spLedger(save).spent;
  assert(spent > 1);

  const result = resetSkillTree(save);
  assert.equal(result.ok, true);
  assert.equal(result.refunded, spent - 1, '첫 스킬의 무료 1랭크만 남는다');
  assert.deepEqual(save.learned, ['slash2']);
  assert.deepEqual(save.passives, []);
  assert.deepEqual(save.skillLevels, { slash2: 1 });
  assert.deepEqual(save.quickSlots, ['slash2', null, null], '사라진 스킬은 장착 원에서도 빠진다');
  assert.equal(spLedger(save).available, spTotal(20) - 1, '총량 − 남은 첫 랭크 1');
  assert.equal(save.skillPoints, spLedger(save).available);
  // 초기화 뒤에는 1티어부터 다시 열린다.
  assert.equal(skillNodeStatus(save, skillNodeFor('warrior', 'warcry')).open, false);
});

// ── 서버 검증·저장 ───────────────────────────────────────────────────────────

test('서버는 레벨·랭크로 계산한 SP 상한을 넘는 skillPoints를 잘라 낸다', async () => {
  const { clampSaveProgress } = await import('../server/save-guard.mjs');
  const previous = { version: 1, level: 30, exp: 0, gold: 0, kills: 0, bossKills: 0, playSeconds: 0, stones: 0, skillPoints: 0, skillLevels: {}, learned: [], passives: [] };
  const next = { ...previous, level: 30, skillPoints: 999, learned: ['slash2', 'slam'], skillLevels: { slash2: 5, slam: 2 } };
  const { clamped } = clampSaveProgress(previous, next, { elapsedSeconds: 1 });
  assert(clamped.includes('skillPoints'));
  assert.equal(next.skillPoints, 88 - 7, '만렙 88pt − 쓴 7랭크');
});

test('세이브를 읽을 때 skillPoints는 장부 상한을 넘지 못한다', () => {
  const save = freshSave('male', 'warrior');
  save.level = 5;
  save.skillPoints = 999;
  const parsed = parseSave(JSON.parse(JSON.stringify(save)));
  assert.equal(parsed.skillPoints, 12, 'Lv.5 13pt − 첫 스킬 1랭크');
  // 예전 세이브(스킬북으로 랭크를 올리던 시절)는 쓴 랭크가 더 많아도 0에서 멈춘다.
  const legacy = freshSave('male', 'warrior');
  legacy.level = 5; legacy.learned = ['slash2', 'slam', 'power', 'hell', 'crushing'];
  legacy.skillLevels = { slash2: 10, slam: 10, power: 5, hell: 3, crushing: 2 };
  legacy.skillPoints = 20;
  assert.equal(parseSave(JSON.parse(JSON.stringify(legacy))).skillPoints, 0);
});

// ── 현재/다음 수치 ───────────────────────────────────────────────────────────

test('상세 패널의 현재/다음 수치는 레벨에 따라 오르고, 패시브는 실제 능력치 식을 쓴다', () => {
  const current = skillValueRows('hell', 3), next = skillValueRows('hell', 4);
  assert.deepEqual(current.map(row => row.label), ['위력', '사거리']);
  assert.notEqual(current[0].value, next[0].value, '위력이 오른다');
  const buff = skillValueRows('warcry', 3);
  assert.deepEqual(buff.map(row => row.label), ['공격 버프', '지속']);
  assert.equal(buff[1].value, '6.4초');
  // 강인한 육체 = HP·방어 (15 + 2·(랭크-1))% — `items.ts` `totalStats`와 같은 식.
  assert.deepEqual(skillValueRows('body', 3), [{ label: 'HP·방어력', value: '+19%' }]);
  assert.deepEqual(skillValueRows('instinct', 3), [{ label: '치명타', value: '+5.8%' }, { label: '공격속도', value: '+6.7%' }]);
  assert.equal(skills.hell.name, '회전참격');
  assert.equal(passives.instinct.icon, '◈');
});
