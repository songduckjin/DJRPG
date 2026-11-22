# INVENTORY_GEAR — 장비 · 가방 40칸 · 추가옵션 · 분해 · 강화

> **책임**: 아이템 생성·등급·스탯·강화 단계, 장비 슬롯과 가방(40칸) 규칙, 추가옵션, 자동 장착·업그레이드 판정, 자동/수동 분해. 스킬북 종류·도감은 `docs/SKILLS_CODEX.md`, 저장·무결성은 `docs/SYNC_SAVE.md`, 화면 외형은 `docs/COSTUME_SYSTEM.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 아이템 정의·드롭·등급·강화 | `src/game/items.ts` |
| 추가옵션 | `src/game/extraOptions.ts` · 서버 사본 `server/extra-options.mjs` |
| 가방 40칸 규칙 | `src/game/bagCapacity.ts` · 서버 사본 `server/skill-ids.mjs`(`countedInBag`) |
| 자동 장착·분해·보호 | `src/game/inventory.ts`(`salvagePlan`·`salvageUpgrades`·`autoSalvageBlock`·`autoSalvageRecovered`·`sweepBagOnFull`) |
| 장비 비교·표시 | `src/game/itemComparison.ts`·`src/ui/itemName.ts`·`src/ui/upgradeBadge.ts`·`src/ui/plusBadge.ts`·`src/ui/rarityBadge.ts` |
| 장비창·가방·분해 UI | `src/ui/modals/equipModal.ts`·`src/ui/modals/salvageModal.ts`·`src/ui/salvageConfirm.ts`·`src/ui/salvageProtection.ts`·`src/ui/equippedDetail.ts`·`src/ui/salvagePlus.ts` |
| 칸 정렬·묶음 | `src/ui/bagStacks.ts`(`bagStacks`·`compareBagItems`) |
| 서버 검증 | `server/database.mjs`(`reconcileItems`·`itemValid`)·`server/save-guard.mjs`(`itemWithinBounds`) |

## 불변 규칙

- **장비 슬롯 10칸**: 무기·보조무기·투구·갑옷·목걸이·장갑·벨트·신발·반지1·반지2.
- **첫 장비 장착 안내**: 첫 무기를 낀 뒤 가방의 투구·갑옷을 끼도록 이끄는 입문 안내(안내 띠·가방 머리줄 한 줄·칸 강조)는 `docs/TUTORIAL.md`가 단일 기준이다. 문구·강조 판정은 `src/game/tutorial.ts`만 정한다.
- **가방 40칸**(`EQUIPMENT_BAG_LIMIT`, 주머니 스택형 최종): **장비 1개 = 1칸**, **보물 주머니는 수량과 상관없이 1칸**(1개든 999개든), **영구 스탯북은 종류(공격·방어·체력)당 1칸** — 화면의 `×N` 묶음과 같은 셈이다. 수량 상한은 없다(주머니를 몇 개든 한 칸에 쌓는다). 판정은 클라 `src/game/bagCapacity.ts`(`bagSlotState`·`itemSlotNeed`)와 서버 `server/core/rewardGrant.mjs`(`bagSlotState`·`itemSlotNeed`·`bagSlotCount`) 두 곳뿐이고 같은 규칙이다.
- 그래서 **이미 주머니를 한 개라도 들고 있으면 가방이 40/40이어도 주머니 우편·드롭을 받고**, 주머니가 하나도 없으면 빈 칸 1칸로 30개짜리 우편을 통째로 받는다(예전 '1개=1칸' 규칙에서 30칸을 요구해 `BAG_FULL`로 막히던 문제).
- **40칸은 수령 경로마다 막는다**: 창고 `withdraw`·거래소 `claim`·여정 `journey-claim`이 `BAG_FULL`. 저장은 이미 넘긴 세이브를 "현재 개수 이하 유지"만 허용.
- **보물 주머니 개봉(1개·한 번에)**: `src/game/pouch.ts`(`openPouch`·확률표) · 집계 `src/game/pouchBatch.ts`(`openPouches`·`summarizePouchResults`) · 화면 `src/ui/modals/pouchModal.ts`(1개 연출 1.55초) · `src/ui/pouchBatch.ts`(요약 패널). 가방에서 주머니를 누르면 개봉 창이 바로 열리고, 보유 2개 이상이면 **`전부 열기 (N개)`** 가 함께 선다 — 연출 없이 **보유 주머니를 모두** 까고 금화·장비·영구 스탯북 합계, 등급별 수량, `×N` 목록을 한 장으로 보여 준다(`보물 주머니 N개 → 금화 … · 장비 …개` 토스트 1줄, 전설은 전광판). 한 번에 열기 규칙은 ① 1개 열기(`openPouch`)를 반복해 확률·지급·가방 자리 규칙이 1개 열기와 **같다** ② 주머니는 수량 무관 한 칸이라 열어도 그 칸이 비지 않는다 — 결과가 장비·새 종류 스탯북인데 가방이 40칸이면 **그 자리에서 멈추고 주머니를 남긴다**(넘치는 결과를 잃지 않게, 저장이 40칸을 넘어 거부되는 일도 막는다). 금화는 칸을 쓰지 않아 언제나 열린다. 한 번에 여는 수는 `POUCH_BATCH_LIMIT`(40)까지만 — 서버 아이템 생성 상한(40 + 초당 0.5개)을 한 저장에 넘기지 않기 위해서다 ③ 금화는 한 저장에 몰리므로 서버가 소모된 주머니 수로 상한을 더한다(`docs/SYNC_SAVE.md`).
- **강화 `+1~+7`**: `maxPlusFor(floor)`가 10층마다 한 단계 열고 `rollPlus`(가중치 `0.6^k`, 보스 ×`1.2^k`)로 뽑는다. `applyPlus`가 단계당 8%를 스탯에 곱하고 `plus`를 함께 적는다(0도 명시). `item.name`은 **절대 바꾸지 않는다** — 서버 `identity`가 이름을 포함한다.
- **추가옵션**: 에픽 1·유니크 2·전설 3개, 9종 키, 1~3%. 값은 아이템 `id` 해시 시드로 결정되므로 **이미 지급된 장비도 DB 수정 없이** 같은 값이 붙는다. 상한: 회피 30%·체력회복 12%/5초·피흡 15%. 서버 `normalizeExtraOptions`가 id로 다시 계산해 클라이언트 조작값을 덮어쓴다.
- **직업 배율(작업 255)**: `jobMastery` — 전사 방어 1.12·체력 1.10, 궁수 치명 1.15·공속 1.38, 마법사 공격 1.38. **장비 몫에만** 곱한다(레벨·기본 스탯에는 곱하지 않는다). 티어 계수는 단계당 3.5%.
- **드롭률**: 접속 일반 0.39%·보스 4%, 방치 일반 0.30%·보스 4% (전 층 고정). 장비:스킬북 = 70:30. 등급 컷만 깊이에 따라 오른다.
- **직업 판정**: `itemJob` = ①`EquipmentItem.job` 표식 ②이름 목록. **옛 세이브의 전사용 이름은 표식이 없어 공용**으로 남긴다(갑자기 `INVALID_SAVE`가 되면 안 된다). `canWield`가 무기·투구·갑옷을 함께 본다.
- **업그레이드 판정은 한 곳**: `isUpgradeForHero(save,item)` — ①장비 ②`canWield` ③`itemPower` 비교(반지는 약한 칸 또는 빈 칸). 가방·창고·거래소·상세가 모두 이 판정을 쓴다.
- **다운그레이드 판정도 한 곳**: `isDowngradeForHero(save,item)` — 같은 세 조건의 반대편(반지는 **약한 쪽**보다 약할 때, 같은 값이면 어느 화살표도 아니다). 가방·공용창고가 초록 위 화살표(`.upgrade-arrow`, 우측 상단)와 배타적으로 빨간 아래 화살표(`.downgrade-arrow`, 같은 자리·같은 크기 7~9px, PNG `/assets/icons/downgrade-arrow-slim.png` = 초록 셰브론 180° 회전·적색)를 붙인다. 거래소에는 달지 않는다(매물이 대부분 빨개져 목록이 지저분해진다).
- **장비창 정렬**: 부위 이름(`.slot-part`)은 아이콘과 같은 중심에 서고 `+N`만 `bottom: 13px`로 이름 줄 위에 올라간다. 중간 요약(레벨·층·경험치·금화)은 6칸 스탯 표와 **같은 2열·3px 간격·6px 안쪽 여백**을 쓰고, 테두리는 `outline`(레이아웃 폭 무영향)이라 열이 한 줄로 선다.
- **일괄 분해 확인 팝업(B안 내역형)**: 가방 아래 `[일괄 분해]`로 **2개 이상**을 지우기 직전에 한 번 더 묻는다(`src/ui/salvageConfirm.ts` `openSalvageConfirm`). 순서는 **더 좋은 장비 보호 팝업(작업 197) → 빈 장착칸 경고 → 이 팝업**이며, 보호 제외·경고 확인 뒤 **남은 실제 대상**으로 다시 계산해 보여 준다(`salvageModal.ts` `confirmSalvage` — 모든 경로의 마지막 단계). 내용: 강화석 아이콘 + `일괄 분해` + `기준 {등급명} 이하 · 장비 N개` / `총 N개의 아이템이 분해됩니다. 분해하시겠습니까?` / **등급별 내역**(실제 대상 등급만, `salvageBreakdown`, 0개 등급은 빠짐) / **예상 획득** `강화석 +X`·`금화 +Y`(`salvageReward`, 보상표는 `salvageGold`·`salvageStones`와 같은 곳) / 안내 1줄 `잠긴 장비 · 기준({등급명})보다 높은 등급은 제외됩니다.` / `[취소]`·`[분해하기]`. **1개 단품 분해**와 **자동 분해**(접속·방치·던전 백그라운드)는 이 팝업을 거치지 않는다. 화면은 `.salvage-protect` 오버레이 위 `.bulk-confirm-*`(분해 보호 팝업과 같은 어두운 카드).
- **자동 분해**: 설정 등급·`+N` 상한(41층부터)·잠금·스킬북·주머니·더 좋은 장비는 보호. 접속·방치·던전 모두 `autoSalvageRecovered`를 지난다. 분해 보상은 `salvageGold`·`salvageStones`.
- **칸 순서**: 부위 순 → 주머니 → 스킬북 → 기타, 같은 부위는 `itemPower` 내림차순 → 등급 → `plus` → 이름. 가방과 공용창고가 같은 비교자를 쓴다.
- **아이템 칸 배지 자리(네 모서리, 하나도 겹치지 않는다)**: 왼쪽 위 = **등급 배지** `L`·`U`·`E`(`src/ui/rarityBadge.ts` — 전설·유니크·에픽 **장비만**, 일반·매직·레어·스킬북·주머니는 없음), 오른쪽 위 = 추천 화살표(없으면 잠금), 왼쪽 아래 = `+N`(강화), 오른쪽 아래 = `×N`(스킬북·주머니) 또는 잠금. 그래서 **직업 배지**(`job-badge`)는 좁은 칸(가방·공용창고·거래소 판매 등록 칸, 30~40px)에서 오른쪽 아래로 비키고 한 글자(`전`·`궁`·`법`, `jobShortNames`)가 된다 — 전체 이름은 `title`·`aria-label`·상세 패널이 밝힌다. 등급 배지가 없는 넓은 거래소 카드에서는 직업 배지가 그대로 `전사`이고, 등급 배지가 붙는 카드에서만 등급 배지 **아래로 쌓인다**(`top: 15px`). 잠금 배지와 자리가 겹치는 칸(추천 대상 + 잠김)에서는 상태인 **잠금을 남기고 직업 배지를 감춘다**(가방 `.bag-item.has-upgrade:has(.bag-lock-badge)`, 거래소 `.market-pick:has(.lock-icon)`). 장착 10칸(92px)에는 직업 배지가 없고 등급 배지만 왼쪽 위에 붙는다.

## 금지

- `item.name`·`identity`·`sameItemBody` 계약 변경, `plus`를 동일성에 넣기.
- 새 드롭에 `plus: 0`을 빠뜨리기(로드에서 역산되어 단계가 튄다).
- 10층 이하 드롭에 강화 부여, `itemPower`에 `plus` 이중 반영.
- 40칸 규칙을 화면에서만 계산하고 서버를 고치지 않기(저장이 409로 막힌다).

## 테스트

`node --test tests/inventory.test.mjs tests/bag-capacity.test.mjs tests/bag-job-books.test.mjs tests/bag-stack-order.test.mjs tests/bag-limit-recovery.test.mjs tests/item-plus.test.mjs tests/plus-badge.test.mjs tests/upgrade-badge.test.mjs tests/rarity-badge.test.mjs tests/extra-options.test.mjs tests/auto-salvage.test.mjs tests/salvage-plus.test.mjs tests/salvage-rarity.test.mjs tests/salvage-protection.test.mjs tests/salvage-confirm.test.mjs tests/item-drop-jobs.test.mjs tests/equipment-info.test.mjs tests/job-gear.test.mjs tests/treasure-pouch.test.mjs tests/pouch-open-all.test.mjs`

## 관련 매뉴얼

`docs/SKILLS_CODEX.md` · `docs/SYNC_SAVE.md` · `docs/MARKET.md` · `docs/MAIL_WAREHOUSE.md` · `docs/COSTUME_SYSTEM.md`
