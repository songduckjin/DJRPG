# TUTORIAL — 입문 안내(첫 무기 · 방어구 · 첫 스킬)

> **책임**: 새 캐릭터가 첫 무기를 줍고 장착한 뒤 **방어구를 챙기고 첫 액티브 스킬을 빈 퀵슬롯에 장착**하도록
> 화면 위 안내 띠와 강조(`tutorial-target`)로 이끈다. 스킬 정의·퀵슬롯 규칙은 `docs/SKILLS_CODEX.md`,
> 장비·가방 규칙은 `docs/INVENTORY_GEAR.md`, 확정 드랍·완화 수치는 `docs/FIELD_OFFLINE.md`가 기준이다.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 단계·문구·강조 대상 판정(단일 기준) | `src/game/tutorial.ts` (`tutorialGuide`·`pendingGearSlots`·`objectParticle`·`OPENING_LEVEL`) |
| 무기 장착 → 3단계 전환 | `src/game/items.ts` (`advanceTutorialOnEquip`) — `autoEquipBest`·장비창 `[장착]`이 함께 쓴다 |
| 안내 띠·하단 메뉴 강조·빈 원 강조 | `src/ui/hud.ts` (`renderStatus`) |
| 장비 창 안의 안내 줄·빈 칸·가방 칸 강조 | `src/ui/modals/equipModal.ts` (`renderInventory`·`renderEquipment`) |
| 강조 스타일 | `src/styles/hud.css`(`.tutorial`·`.tutorial-target`)·`src/styles/modals/equip.css`(`.tutorial-note`) |
| 테스트 | `tests/tutorial-skill-gear.test.mjs` |

## 단계

| 단계 | 조건 | 안내 문구 | 끝나는 순간 |
|---|---|---|---|
| `kill` | `save.tutorial === 0` | 자동 사냥이 시작되었습니다. 첫 해골전사를 처치하세요. | 첫 처치(코드가 `tutorial = 1`) |
| `loot` | `tutorial === 1` | `{직업 시작 무기}`이(가) 떨어졌습니다. 잠시 뒤 자동으로 획득됩니다! | 무기를 주움(`tutorial = 2`) |
| `weapon` | `tutorial === 2` | 하단 갑옷 아이콘을 눌러 가방의 `{직업 시작 무기}`을 장착하세요. | 무기 칸이 차면 `tutorial = 3` |
| `gear` | `tutorial === 3` + 가방에 내 직업 투구·갑옷이 있고 그 칸이 빔 + `level ≤ OPENING_LEVEL` | 하단 갑옷 아이콘을 눌러 가방의 투구·갑옷을 장착하세요. | 그 칸에 장비가 들어오면 다음 단계 |
| `skill` | `tutorial === 3` + 위 조건 없음 + 퀵슬롯이 비었고 장착할 수 있는 액티브 스킬이 있음 + `level ≤ OPENING_LEVEL` | 스킬 아이콘 또는 빈 슬롯을 눌러 첫 스킬을 장착하세요 | 퀵슬롯 3칸 중 하나라도 차면 안내가 사라진다 |

## 불변 규칙

- **저장 형식은 그대로**: 세이브 `tutorial`은 예전처럼 `0~3`만 쓴다(서버 `server/save-guard.mjs`가 3에서 자른다).
  3 이후의 방어구·스킬 안내는 새 값을 저장하지 않고 **지금 상태에서 계산**한다 — 그래서 공용 계약(세이브·API)이 바뀌지 않는다.
- **완료 판정은 상태**: 장비를 끼거나 퀵슬롯에 스킬이 들어오는 순간 스스로 끝난다. 저장값을 따로 올리지 않는다. 그래서 **그 칸을 다시 비우거나(장비 해제·스킬 전체 해제) 입문 구간(`level ≤ OPENING_LEVEL`)이면 다시 뜰 수 있다** — 저장된 '봤음' 표식이 없기 때문이고, 입문 구간을 지나면 뜨지 않는다.
- **막다른 안내 금지**: 습득한 액티브 스킬이 없으면 스킬 안내를 띄우지 않고, 다른 직업 전용 방어구는 안내하지 않는다.
- **입문 구간에서만**: `level > OPENING_LEVEL(10)`이면 3단계 이후 안내를 띄우지 않는다(옛 세이브 재안내 방지).
- **화면을 막지 않는다**: 안내는 문구와 `tutorial-target` 강조뿐이다 — 입력·전투·저장·창 열림을 막지 않는다.
- **문구는 한 곳**: 문장·조사(`objectParticle`)·강조 대상은 `src/game/tutorial.ts`만 정한다. 화면은 그대로 그린다.
- **무기 장착 전환은 직업 공통**: `advanceTutorialOnEquip`이 `tutorial === 2 && equipment.weapon`으로 판정한다(예전엔 `낡은 두손검`만 넘어갔다).

## 테스트

`node --test tests/tutorial-skill-gear.test.mjs`
