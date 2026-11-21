/**
 * 세이브 검증·쓰기 (작업 260 — `server/database.mjs` 5분할).
 *
 * 옮긴 것이 목적이므로 규칙은 한 줄도 바뀌지 않았다. `writeSave`는 다음을 한 트랜잭션 안에서 한다.
 *  ① 진행 클램프(`clampSaveProgress` — 서버 시계·층·직업 기반 상한, 거부하지 않고 자른다)
 *  ② 누적 통계 최대값 보존(`bossKills`·`playSeconds`·`salvageCount`)
 *  ③ 던전 최고층을 검증된 기록(`djrpg_dungeon_records`)과 대조
 *  ④ 도감 합집합(`부위:번호:등급` 810칸)
 *  ⑤ 금화는 `djrpg_account_profiles.shared_gold`로 분리
 *  ⑥ 여정 장부(`journeyOperation`) — `skipJourney`면 생략
 *  ⑦ revision 증가 + `djrpg_save_versions` + `djrpg_accounts.updated_at`
 *
 * 시그니처·에러 코드(`INVALID_SAVE`·`INVALID_GOLD`·`CHARACTER_CONFLICT`)는 계약이라 그대로다.
 */
import { fail } from './errors.mjs';
import { clampSaveProgress, elapsedSince } from '../save-guard.mjs';
import { journeyState, journeyOperation } from '../journey-state.mjs';

/** 메인 사냥의 마지막 층 — `src/game/store.ts`의 `MAX_FLOOR`와 같은 값이다(작업 204). */
export const MAX_FLOOR = 20;

export function validateSave(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save) || save.version !== 1 || JSON.stringify(save).length > 1_000_000) fail(400, 'INVALID_SAVE', '저장 데이터 형식이 올바르지 않습니다.');
}

export async function writeSave(tx, row, save, operations = [], preserveCollection = true, credits = {}) {
  // 서버 검증 경계(작업 209): 마지막 저장 이후 **서버 시계로 흐른 시간**과 층·직업 규칙으로 계산한 상한만
  // 인정한다. 정상 플레이 값은 상한 아래라 그대로 통과하고, 넘치는 값만 잘라 낸다(거부하지 않는다).
  // 거래소 판매대금·우편 보상처럼 서버가 같은 트랜잭션에서 더해 준 몫은 `credits`로 넘겨 상한에 더한다.
  // 캐릭터 전환 직후에는 방치 시간이 `idle_claim_${slot}`에 옮겨지고 `updated_at`이 전환 시각으로 덮이므로,
  // 그 초를 함께 인정한다(`credits.idleSeconds`, 작업 252) — 방치 보상의 금화·경험치가 잘리지 않게 한다.
  const { clamped } = clampSaveProgress(row.save, save, {
    elapsedSeconds: elapsedSince(row.character_updated_at) + Math.max(0, Math.min(43_200, Number(credits.idleSeconds) || 0)),
    goldCredit: credits.goldCredit,
    stoneCredit: credits.stoneCredit,
    dungeonFloorCap: row.dungeon_record_floor
  });
  // `salvageCount`(작업 207)도 누적 통계다 — 줄지 않게 하고, 옛 클라이언트가 값을 빼고 보내도 잃지 않는다.
  for (const field of ['bossKills','playSeconds','salvageCount']) {
    if (save[field] !== undefined && (typeof save[field] !== 'number' || !Number.isFinite(save[field]) || save[field] < 0)) fail(400,'INVALID_SAVE','활동 통계 형식이 올바르지 않습니다.');
    save[field] = preserveCollection ? Math.max(row.save[field] ?? 0, save[field] ?? 0) : save[field] ?? 0;
  }
  // 던전 최고 클리어 층은 순위의 근거다: 0~10의 정수만 받고, 저장된 기록보다 낮아지지 않게 한다
  // (src/game/store.ts의 DUNGEON_MAX_FLOOR). 클리어 시각은 그 층을 처음 기록한 값을 남긴다.
  const previousFloor = Number.isInteger(row.save.dungeonFloor) ? Math.min(10, Math.max(0, row.save.dungeonFloor)) : 0;
  const incomingFloor = save.dungeonFloor === undefined ? previousFloor : save.dungeonFloor;
  if (!Number.isInteger(incomingFloor) || incomingFloor < 0 || incomingFloor > 10) fail(400, 'INVALID_SAVE', '던전 진행 기록 형식이 올바르지 않습니다.');
  const previousAt = Number(row.save.dungeonClearAt) > 0 ? Math.floor(Number(row.save.dungeonClearAt)) : 0;
  const incomingAt = Number(save.dungeonClearAt) > 0 ? Math.floor(Number(save.dungeonClearAt)) : 0;
  save.dungeonFloor = preserveCollection ? Math.max(previousFloor, incomingFloor) : incomingFloor;
  save.dungeonClearAt = save.dungeonFloor === 0 ? 0
    : save.dungeonFloor > incomingFloor ? previousAt
    : previousAt && incomingAt ? Math.min(previousAt, incomingAt)
    : previousAt || incomingAt;
  save.accountId = row.id; save.lastActiveAt = Date.now();
  // 메인 층 상한(작업 204): 1~20의 정수만 저장한다. 21층 이상에 있던 예전 세이브는 20층으로 보정하고
  // 최고 층도 20층을 넘지 않는다 — 장비·아이템·처치 기록은 그대로 둔다.
  const previousMainFloor = Number.isInteger(row.save.floor) ? row.save.floor : 1;
  save.floor = Math.max(1, Math.min(MAX_FLOOR, Number.isInteger(save.floor) ? save.floor : previousMainFloor));
  save.maxFloor = Math.max(save.floor, Math.min(MAX_FLOOR, Number.isInteger(save.maxFloor) ? save.maxFloor : save.floor));
  // 보스 재도전 기록(작업 223): 0~20의 정수만 저장한다. 옛 클라이언트가 값을 빼고 보내도 0으로 두고,
  // 최고 도달 층과 다른 값(아래층 기록)은 의미가 없으므로 0으로 정리한다 — 거부하지 않는다.
  save.bossRetryFloor = Number.isInteger(save.bossRetryFloor) && save.bossRetryFloor > 0 && save.bossRetryFloor <= save.maxFloor
    ? save.bossRetryFloor : 0;
  // Older clients may omit discovery history; never erase already-recorded entries.
  const previousCollection = preserveCollection && Array.isArray(row.save.equipmentCollection) ? row.save.equipmentCollection : [];
  const incomingCollection = Array.isArray(save.equipmentCollection) ? save.equipmentCollection : [];
  // 발견 기록은 **등급별 한 칸**(`부위:번호:등급`)이다(작업 208) — 옛 `부위:번호` 키는 버린다.
  // 무기·투구·갑옷은 전사 0~9 · 궁수 10~19 · 마법사 20~29라 번호가 두 자리까지 온다(작업 249). 135종 × 6등급 = 810칸.
  save.equipmentCollection = [...new Set([...previousCollection, ...incomingCollection].filter(key => typeof key === 'string' && /^(weapon|offhand|helmet|armor|necklace|gloves|belt|boots|ring):\d{1,2}:(common|magic|rare|epic|unique|legendary)$/.test(key)))].slice(0, 810);
  if (!Number.isSafeInteger(save.gold) || save.gold < 0 || save.gold > 9_000_000_000_000) fail(400, 'INVALID_GOLD', '금화 값이 올바르지 않습니다.');
  if (Number(row.slot) < 1 || Number(row.slot) > Number(row.max_slots ?? 3)) fail(409, 'CHARACTER_CONFLICT', '현재 캐릭터를 다시 불러오세요.');
  if (!row.skipJourney) operations = [...operations, journeyOperation(row.id, await journeyState(tx, row, save))];
  const revision = row.revision + 1;
  const characterSave = structuredClone(save);
  delete characterSave.gold;
  await tx.batch([...operations,
    { sql: 'UPDATE djrpg_characters SET save_json=?,updated_at=? WHERE account_id=? AND slot=?', args: [JSON.stringify(characterSave), new Date().toISOString(), row.id, row.slot] },
    { sql: 'UPDATE djrpg_account_profiles SET shared_gold=? WHERE account_id=?', args: [save.gold, row.id] },
    { sql: 'UPDATE djrpg_accounts SET updated_at=? WHERE id=?', args: [new Date().toISOString(), row.id] },
    { sql: 'INSERT INTO djrpg_save_versions VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision', args: [row.id, revision] }
  ]);
  return { save, revision, clamped };
}
