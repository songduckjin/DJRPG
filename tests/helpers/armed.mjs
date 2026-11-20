/**
 * 테스트용 장착 무기(작업 216).
 *
 * 무기가 없으면 평타·공격 스킬이 막히므로(의도된 규칙), 전투·던전·월드보스 리플레이 테스트의
 * 세이브는 실제 플레이어처럼 무기를 찬 상태로 만든다.
 */
export const testWeapon = (id = 'test-weapon') => ({ id, name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } });
export const withWeapon = (save, id) => ({ ...save, equipment: { ...(save?.equipment ?? {}), weapon: testWeapon(id) } });
