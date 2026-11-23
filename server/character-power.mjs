/**
 * 캐릭터 선택 카드의 전투력 — 서버가 **세이브 원문**에서 직접 계산한다(백로그 11·B안).
 *
 * `characters` 응답은 다른 슬롯의 세이브를 통째로 내려보내지 않는다(이름·직업·레벨·층·장비 이름만 —
 * `server/endpoints/account.mjs` `portraitEquipment`). 그래서 지금 접속 중이 아닌 캐릭터의 전투력은
 * 화면에서 계산할 방법이 없다. 서버가 슬롯마다 세이브를 `parseSave`로 정규화한 뒤 클라이언트와
 * **같은 두 함수**(`items.ts` `totalStats` → `power.ts` `combatPower`)를 그대로 불러 계산한다.
 *
 * 식을 여기에 다시 적지 않는 것이 핵심이다 — 화면(HUD·내 정보·상세 스탯·층 권장값)과 카드가
 * 서로 다른 숫자를 말할 자리가 없다. `tests/character-select-power.test.mjs`가 서버 값과
 * 클라이언트 `combatPower(totalStats(save))`의 패리티를 고정한다.
 *
 * **import는 동적**이다. `src/game/store.ts`는 같은 폴더 모듈을 확장자 없이 import 하므로, 이 모듈을
 * 정적으로 import 하는 테스트·스크립트가 엔드포인트를 링크하는 시점(= 훅 등록 전)에 끌려 들어오면
 * 해석에 실패한다. 계산기는 요청이 처음 필요로 할 때 한 번만 불러오고 이후 재사용한다.
 */
let reader;

/** 계산기를 한 번만 불러온다 — 이후 `characters` 요청은 이 약속을 그대로 쓴다. */
async function load() {
  reader ??= Promise.all([
    import('../src/game/store.ts'),
    import('../src/game/items.ts'),
    import('../src/game/power.ts')
  ]).then(([store, items, power]) => ({ parseSave: store.parseSave, totalStats: items.totalStats, combatPower: power.combatPower }));
  return reader;
}

/** 세이브(정규화 전 원문) 한 건의 전투력 — 손상된 세이브면 던진다. */
export async function characterPower(save) {
  const api = await load();
  return api.combatPower(api.totalStats(api.parseSave(save)));
}

/**
 * `characters` 응답이 쓸 계산기 — `save => 전투력`(읽지 못한 세이브는 `undefined`).
 *
 * 저장본 하나가 깨졌다고 캐릭터 목록 전체가 500이 되면 그 계정은 캐릭터를 바꿀 수 없다.
 * 깨진 슬롯만 전투력을 비우고 나머지 카드는 그대로 그린다(화면은 배지에서 숫자만 뺀다).
 */
export async function characterPowerReader() {
  const api = await load();
  return save => {
    try { return api.combatPower(api.totalStats(api.parseSave(save))); }
    catch { return undefined; }
  };
}
