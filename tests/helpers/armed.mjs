/**
 * 테스트용 장착 무기(작업 216).
 *
 * 아이템 id는 기본으로 매번 새로 만든다 — 같은 프로세스에서 여러 테스트 파일이 공유 DB를 쓰면
 * 같은 id가 다른 계정 소유로 잡혀 `ITEM_CONFLICT`가 난다.
 *
 * 무기가 없으면 평타·공격 스킬이 막히므로(의도된 규칙), 전투·던전·월드보스 리플레이 테스트의
 * 세이브는 실제 플레이어처럼 무기를 찬 상태로 만든다.
 */
export const testWeapon = (id = `test-weapon-${crypto.randomUUID().slice(0, 8)}`) => ({ id, name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } });
export const withWeapon = (save, id) => ({ ...save, equipment: { ...(save?.equipment ?? {}), weapon: testWeapon(id) } });
