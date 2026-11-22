/**
 * 아이템 소유권·가방 규칙 (작업 260 — `server/database.mjs` 5분할).
 *
 * 규칙은 종전과 같다. 여기서 지키는 계약:
 *  - 가방 40칸: **모든 아이템 1개 = 1칸**(파트 B — 스킬북 폐지로 직업 예외가 사라졌다).
 *  - 이미 서버 세이브가 들고 있는 수까지는 인정한다(`bagCapacityLimit`, 작업 246) — 넘친 계정이
 *    `400 INVALID_SAVE`로 영구 잠기면 거래소·우편이 통째로 막히던 사고(`#20869`)의 재발 방지다.
 *  - 아이템 소유는 두 표(`djrpg_item_owners` 위치·`djrpg_character_item_owners` 슬롯)의 미러다.
 *    어긋나면 `409 ITEM_CONFLICT` — 통합은 후속 단계(PR-6)다.
 */
import { ApiError, fail } from './errors.mjs';
import { validateSave } from './save.mjs';
import { itemWithinBounds, rewardBudget, secondaryStatCeiling } from '../save-guard.mjs';
import { extraOptionsWithin, normalizeExtraOptions } from '../extra-options.mjs';
import { statBookValid } from '../stat-books.mjs';
import { bagSlotCount } from '../core/rewardGrant.mjs';

export const itemsOf = save => [...(save.bag ?? []), ...Object.values(save.equipment ?? {}).filter(Boolean)];

/** 가방 40칸 — `src/game/bagCapacity.ts`와 같은 규칙(모든 아이템 1개 = 1칸, 파트 B). */
export const EQUIPMENT_BAG_LIMIT = 40;
/** 가방 40칸에 세는 수. 배열이 아니면 0. 규칙은 `server/core/rewardGrant.mjs` 한 곳에 있다. */
export const countedBagItems = (bag, job) => bagSlotCount({ bag: Array.isArray(bag) ? bag : [], job });

/**
 * 이 세이브에 허용하는 가방 상한(작업 246).
 *
 * 서버는 보상(우편·일일·주간·업적 스킬북)과 거래 수령에서 **칸 검사 없이** 아이템을 넣는다. 그래서 서버
 * 세이브 자체가 40칸을 넘는 경우가 생기는데, 저장까지 40칸으로 막으면 그 뒤로 클라이언트의 모든 `save`가
 * `400 INVALID_SAVE`("가방 또는 장비 데이터가 올바르지 않습니다.")로 거절되고, `sync.flush()`가 실패해
 * **거래소·우편 수령 전체가 영구히 잠긴다**(사용자 제보 `#20869`·`#20887`·`#20915`).
 *
 * 그래서 상한은 **이미 서버 세이브가 들고 있는 수**까지 인정하고, 클라이언트가 그 위로 더 넣는 것만 거절한다.
 * 넘친 계정은 아이템을 잃지 않고 저장이 풀리며, 분해·판매로 40칸 아래로 내려오면 종전 규칙으로 돌아간다.
 */
export const bagCapacityLimit = save => Math.max(EQUIPMENT_BAG_LIMIT, countedBagItems(save?.bag, save?.job));

// Fetch both persisted and incoming inventory owners alongside the trade's other reads.
export function inventoryOwnerQuery(id, incoming) {
  const bag = Array.isArray(incoming?.bag) ? incoming.bag : [];
  const equipment = incoming?.equipment && typeof incoming.equipment === 'object' ? Object.values(incoming.equipment) : [];
  if (incoming !== undefined) validateSave(incoming);
  // 가방 40칸은 **장비·타직업 스킬북·보물 주머니**를 세고 내 직업 스킬북은 세지 않는다(작업 253·248).
  // 최종 판정은 `before`를 아는 `reconcileItems` 한 곳에서 한다(작업 246) — 이 함수는 트랜잭션의 첫 배치에서
  // 서버 세이브를 읽기 전에 불리므로, 여기서는 장비 칸 수만 본다. 넘친 가방을 400으로 막으면 서버가 스스로
  // 만든 초과분 때문에 거래·우편이 영구히 잠긴다.
  if (equipment.length > 10) fail(400, 'INVALID_SAVE', '가방 또는 장비 데이터가 올바르지 않습니다.');
  const ids = [...bag, ...equipment].map(item => item?.id).filter(value => typeof value === 'string');
  return { sql: `SELECT o.*, m.slot AS character_slot FROM djrpg_item_owners o LEFT JOIN djrpg_character_item_owners m ON m.item_id=o.item_id WHERE o.item_id IN (
    SELECT json_extract(j.value,'$.id') FROM djrpg_characters c, json_each(c.save_json,'$.bag') j WHERE c.account_id=?
    UNION SELECT json_extract(j.value,'$.id') FROM djrpg_characters c, json_each(c.save_json,'$.equipment') j WHERE c.account_id=?
    UNION SELECT value FROM json_each(?)
  )`, args: [id, id, JSON.stringify(ids)] };
}

function itemValid(item) {
  // 'pouch' = 무작위 보물 주머니(작업 207), 'statbook' = 영구 스탯북(파트 B) — 장비와 같은 이름·등급·stats 형식의
  // 소모품이다. 스킬북(`skillbook`)은 폐지되어 더 이상 저장을 받지 않는다 — 남은 세이브는 클라이언트
  // `migrateItem`이 버리고, 소유 기록만 `consumed`로 정리된다.
  const slots = ['weapon','offhand','helmet','armor','necklace','gloves','belt','boots','ring1','ring2','statbook','pouch'];
  return item && (item.locked === undefined || typeof item.locked === 'boolean') && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 && typeof item.name === 'string' && item.name.length <= 100 && slots.includes(item.slot) && ['common','magic','rare','epic','unique','legendary'].includes(item.rarity) && item.stats && typeof item.stats === 'object' && !Array.isArray(item.stats) && Object.entries(item.stats).every(([key, value]) => ['attack','defense','health','crit','speed','cdr'].includes(key) && Number.isFinite(value) && value >= 0 && value <= 100000) && (item.slot !== 'statbook' || statBookValid(item)) && (item.slot !== 'pouch' || item.kind === 'pouch')
    // 추가옵션(작업 238): 에픽 1·유니크 2·전설 3개, 허용 키 10종·키별 1~3% 정수만.
    && extraOptionsWithin(item)
    // 2차 스탯 척도 버전(밸런스 v2) — 2만 허용한다(옛 값은 클라이언트가 2로 바꿔 보낸다).
    && (item.sec === undefined || item.sec === 2);
}
const ringSlot = item => typeof item?.slot === 'string' && item.slot.startsWith('ring') ? 'ring' : item?.slot;
const itemStats = ['attack','defense','health','crit','speed','cdr'];
// 강화 단계(`plus`, 작업 201)는 **표시 전용**이다. 능력치는 이미 각 스탯에 8%씩 반영되어 stats에 들어 있으므로
// identity·sameItemBody는 plus를 보지 않는다 — 옛 장비가 로드 때 보수적으로 역산한 plus를 얻어도, 값이 없는
// 클라이언트가 plus: 0을 보내도 409 ITEM_CONFLICT가 나지 않는다(이름·스탯·등급 검사는 그대로).
const normalizePlus = item => {
  if (item && item.plus !== undefined) {
    const plus = Math.floor(Number(item.plus));
    item.plus = Number.isFinite(plus) ? Math.min(7, Math.max(0, plus)) : 0;
  }
  return item;
};
const identity = item => JSON.stringify([item.name, ringSlot(item), item.rarity, item.kind ?? 'equipment', item.skillId ?? '', ...itemStats.map(key => item.stats?.[key] ?? 0)]);
// 이름만 다른 같은 아이템인지(구버전 클라이언트가 저장 이름을 마이그레이션하며 바꾼 경우) 판정한다.
// stats·rarity·slot·kind·skillId가 달라지면 거짓이므로 능력치·등급 변조 차단은 그대로 유지된다.
const sameItemBody = (a, b) => Boolean(a && b) && a.id === b.id && ringSlot(a) === ringSlot(b) && a.rarity === b.rarity && (a.kind ?? 'equipment') === (b.kind ?? 'equipment') && (a.skillId ?? '') === (b.skillId ?? '') && itemStats.every(key => (a.stats?.[key] ?? 0) === (b.stats?.[key] ?? 0));
// 2차 스탯(치명·공속·쿨감)은 밸런스 v2에서 생성식이 바뀌었다. 저장된 옛 장비(sec<2)는 클라이언트가 새 척도로
// 한 번만 바꿔 보낼 수 있고, 그 값이 서버가 아는 상한 안이면 받아들여 서버 사본을 새 값으로 바꾼다.
// 이후로는 `sec:2` 사본과 정확히 같아야 하므로 변조는 계속 409로 막힌다.
const legacySecondaryMatch = (stored, item) => {
  if (!stored || item?.sec !== 2 || (stored.sec ?? 1) >= 2) return false;
  if (ringSlot(stored) !== ringSlot(item) || stored.rarity !== item.rarity) return false;
  if ((stored.kind ?? 'equipment') !== (item.kind ?? 'equipment') || (stored.skillId ?? '') !== (item.skillId ?? '')) return false;
  if (stored.name !== item.name) return false;
  for (const key of ['attack', 'defense', 'health']) if ((stored.stats?.[key] ?? 0) !== (item.stats?.[key] ?? 0)) return false;
  const ceiling = secondaryStatCeiling(item);
  if (!ceiling) return false;
  return ['crit', 'speed', 'cdr'].every(key => {
    const value = item.stats?.[key] ?? 0;
    return value >= 0 && value <= ceiling[key];
  });
};
// 소유권 테이블의 사본이 깨졌을 수 있으므로 해석 실패는 예외가 아니라 '불일치'로 다룬다.
const ownerItem = owner => { try { const value = JSON.parse(owner.item_json); return value && typeof value === 'object' ? value : undefined; } catch { return undefined; } };

export async function reconcileItems(tx, id, before, after, options = {}) {
  const next = itemsOf(after), previous = itemsOf(before), ids = new Set();
  // 가방 40칸은 **장비·타직업 스킬북·보물 주머니** 1개 = 1칸으로 센다(작업 253 — 내 직업 스킬북은 세지 않는다).
  // 이미 40개를 넘긴 세이브(예전 규칙에서 받아 둔 스킬북·주머니)는 저장을 거부하면 게임이
  // 통째로 잠기므로 **지금 개수 이하를 유지하는 저장은 허용**하고, 늘리는 저장만 막는다.
  // 새로 만들어지는 아이템(소유 기록 없는 id)의 상한 — 마지막 저장 이후 서버가 아는 시간과 층으로 정한다.
  const guard = rewardBudget(before, options.elapsedSeconds);
  const mintFloor = Math.max(1, Number(before?.maxFloor ?? before?.floor ?? 1) || 1) + guard.bosses;
  let minted = 0;
  // 상한은 **이미 서버가 들고 있는 수**(`max(40, 현재 칸)`)까지 — 서버가 보상으로 넣어 준 초과분을 저장에서
  // 막지 않고, 클라이언트가 그 위로 더 넣는 것만 거절한다(작업 246·248, 가방은 모든 아이템을 센다).
  const bagLimit = bagCapacityLimit(before);
  if (!Array.isArray(after.bag) || !after.equipment || typeof after.equipment !== 'object' || Object.values(after.equipment).length > 10) fail(400, 'INVALID_SAVE', '가방 또는 장비 데이터가 올바르지 않습니다.');
  if (countedBagItems(after.bag, after.job) > bagLimit) fail(400, 'INVALID_SAVE', `가방이 ${bagLimit}칸까지입니다. 장비·스킬북·보물 주머니를 분해하거나 거래소에 올려 자리를 비워 주세요.`);
  const previousValid = previous.filter(itemValid);
  const previousById = new Map(previousValid.map(item => [item.id, item]));
  const allIds = [...new Set([...previousValid, ...next].map(item => item?.id).filter(id => typeof id === 'string'))];
  const owned = options.owned ?? (allIds.length ? (await tx.execute({ sql: `SELECT * FROM djrpg_item_owners WHERE item_id IN (${allIds.map(() => '?').join(',')})`, args: allIds })).rows : []);
  const owners = new Map(owned.map(owner => [owner.item_id, owner]));
  const slot = Number(options.slot ?? 1);
  const mapped = options.owned ? options.owned.filter(row => row.character_slot !== null && row.character_slot !== undefined).map(row => ({ item_id: row.item_id, slot: row.character_slot }))
    : allIds.length ? (await tx.execute({ sql: `SELECT item_id,slot FROM djrpg_character_item_owners WHERE account_id=? AND item_id IN (${allIds.map(() => '?').join(',')})`, args: [id, ...allIds] })).rows : [];
  const slotsByItem = new Map(mapped.map(row => [row.item_id, Number(row.slot)]));
  const writes = [];
  for (const item of next) {
    normalizePlus(item);
    // 추가옵션(작업 238)은 `id`에서 다시 계산해 덮어쓴다 — 클라이언트가 보낸 값을 믿지 않는다.
    normalizeExtraOptions(item);
    if (!itemValid(item) || ids.has(item.id)) fail(400, 'INVALID_ITEM', '중복되었거나 잘못된 아이템입니다.');
    ids.add(item.id);
    const owner = owners.get(item.id);
    if (owner) {
      const stored = ownerItem(owner);
      if (String(owner.account_id).toLowerCase() !== id.toLowerCase()) fail(409, 'ITEM_CONFLICT', '다른 계정 소유의 아이템입니다. 최신 데이터를 다시 불러오세요.');
      if (owner.location !== 'inventory') fail(409, 'ITEM_CONFLICT', '창고·거래 중이거나 이미 소모된 아이템입니다. 최신 데이터를 다시 불러오세요.');
      if (!stored || identity(stored) !== identity(item)) {
        // 2차 스탯 척도 마이그레이션(밸런스 v2) — 옛 장비의 치명·공속을 새 척도로 바꾼 한 번의 저장을 받는다.
        if (legacySecondaryMatch(stored, item)) {
          writes.push({ sql: 'UPDATE djrpg_item_owners SET item_json=? WHERE item_id=?', args: [JSON.stringify(item), item.id] });
        } else {
          // latest.save(before)에 같은 id가 같은 능력치로 이미 있고 이름만 달라졌다면,
          // 구버전 클라이언트의 아이템 이름 마이그레이션으로 보고 서버 세이브 이름으로 되돌려 통과시킨다.
          const known = previousById.get(item.id);
          if (!known || !sameItemBody(known, item)) fail(409, 'ITEM_CONFLICT', '아이템 정보가 서버 기록과 다릅니다. 최신 데이터를 다시 불러오세요.');
          if (item.name !== known.name) item.name = known.name;
          if (!stored || stored.name !== item.name || (item.sec ?? 0) !== (stored.sec ?? 0)) writes.push({ sql: 'UPDATE djrpg_item_owners SET item_json=? WHERE item_id=?', args: [JSON.stringify(item), item.id] });
        }
      }
    }
    if (!owner && !previousById.has(item.id)) {
      // 서버 기록에 없는, **이번에 처음 보이는** 아이템. 개수와 능력치를 드롭 공식 상한으로 제한한다.
      // 이미 저장돼 있던 아이템(`previousById`)은 예전에 받아들인 것이므로 소유 기록만 채우고 넘긴다
      // — 그러지 않으면 이 경계를 처음 배포한 날 기존 계정의 가방이 통째로 거부된다.
      if (++minted > guard.items) fail(400, 'INVALID_ITEM', '아이템 생성이 서버 허용 범위를 넘었습니다.');
      if (!itemWithinBounds(item, mintFloor)) fail(400, 'INVALID_ITEM', '아이템 능력치가 서버 기록과 다릅니다. 최신 데이터를 다시 불러오세요.');
    }
    if (slotsByItem.has(item.id) && slotsByItem.get(item.id) !== slot) fail(409, 'ITEM_CONFLICT', '다른 캐릭터가 가진 아이템입니다. 그 캐릭터로 접속해 사용하세요.');
    if (owner && !slotsByItem.has(item.id) && slot !== 1) fail(409, 'ITEM_CONFLICT', '기존 아이템의 소유 캐릭터를 확인할 수 없습니다. 1번 캐릭터로 한 번 저장한 뒤 다시 시도하세요.');
    if (!slotsByItem.has(item.id)) writes.push({ sql: 'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,?)', args: [item.id, id, slot] });
  }
  // Include removed legacy items, preventing resurrection after consumption.
  const unregistered = new Map([...previousValid, ...next].filter(item => !owners.has(item.id)).map(item => [item.id, item]));
  for (const item of unregistered.values()) writes.push({ sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, id, ids.has(item.id) ? 'inventory' : 'consumed', JSON.stringify(item)] });
  for (const item of previousValid) if (!ids.has(item.id) && owners.has(item.id)) writes.push({ sql: "UPDATE djrpg_item_owners SET location='consumed' WHERE item_id=? AND account_id=? AND location='inventory'", args: [item.id, id] });
  if (options.operations) options.operations.push(...writes);
  else if (writes.length) await tx.batch(writes);
}

// load 한 번으로 409 ITEM_CONFLICT 교착에서 빠져나오도록, 다음 save의 reconcileItems가 거부할 조합만 골라 정리한다.
// 소유자가 다른 계정·다른 위치(창고/거래/소모)·다른 캐릭터 슬롯이면 제거하고, 소유자만 다르게 기록된 같은 아이템은 서버 사본으로 복원한다.
const repairedSave = async (tx, row) => {
  const save = row.save;
  if (!save || typeof save !== 'object' || !Array.isArray(save.bag) || !save.equipment || typeof save.equipment !== 'object') return undefined;
  const slot = Number(row.slot ?? 1), account = String(row.id).toLowerCase();
  const equipment = Object.values(save.equipment).filter(Boolean);
  const ids = [...new Set([...save.bag, ...equipment].map(item => item?.id).filter(id => typeof id === 'string'))];
  if (!ids.length) return undefined;
  const placeholders = ids.map(() => '?').join(',');
  const owners = new Map((await tx.execute({ sql: `SELECT * FROM djrpg_item_owners WHERE item_id IN (${placeholders})`, args: ids })).rows.map(owner => [owner.item_id, owner]));
  const slotsByItem = new Map((await tx.execute({ sql: `SELECT item_id,slot FROM djrpg_character_item_owners WHERE account_id=? AND item_id IN (${placeholders})`, args: [row.id, ...ids] })).rows.map(entry => [entry.item_id, Number(entry.slot)]));
  const seen = new Set();
  // 'keep' | 'drop' | { item } — 복원할 서버 사본
  const decide = item => {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) return 'drop';
    seen.add(item.id);
    const owner = owners.get(item.id), mappedSlot = slotsByItem.get(item.id);
    if (!owner) return mappedSlot !== undefined && mappedSlot !== slot ? 'drop' : 'keep';
    if (String(owner.account_id ?? '').toLowerCase() !== account || owner.location !== 'inventory') return 'drop';
    if (mappedSlot !== undefined ? mappedSlot !== slot : slot !== 1) return 'drop';
    let known;
    try { known = JSON.parse(owner.item_json); } catch { return 'drop'; }
    if (!itemValid(known) || known.id !== item.id) return 'drop';
    return identity(known) === identity(item) ? 'keep' : { item: known };
  };
  let changed = false;
  const bag = [];
  for (const item of save.bag) {
    const decision = decide(item);
    if (decision === 'drop') { changed = true; continue; }
    if (decision !== 'keep') { changed = true; bag.push(decision.item); continue; }
    bag.push(item);
  }
  const equipmentSave = {};
  for (const [key, item] of Object.entries(save.equipment)) {
    if (!item) { equipmentSave[key] = item; continue; }
    const decision = decide(item);
    if (decision === 'drop') { changed = true; continue; }
    if (decision !== 'keep') { changed = true; equipmentSave[key] = decision.item; continue; }
    equipmentSave[key] = item;
  }
  return changed ? { ...save, bag, equipment: equipmentSave } : undefined;
};

// 정리된 세이브는 캐릭터 저장소에도 반영하되, 진행이 아닌 복구이므로 revision·updated_at은 그대로 둔다.
export async function healStaleLoadItems(tx, row) {
  let healed;
  try { healed = await repairedSave(tx, row); } catch (error) { if (error instanceof ApiError) throw error; return row.save; }
  if (!healed) return row.save;
  const characterSave = { ...healed };
  delete characterSave.gold;
  await tx.execute({ sql: 'UPDATE djrpg_characters SET save_json=? WHERE account_id=? AND slot=? AND save_json=?', args: [JSON.stringify(characterSave), row.id, Number(row.slot ?? 1), row.character_json] });
  return healed;
}
