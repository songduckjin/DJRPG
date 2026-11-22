# SHOP_ECONOMY — 상점 · 다이아 · 재화 밸런스

> **책임**: 다이아 충전 상품·결제 승인·원장, 슬롯/편의 권한 판매, 금화·다이아의 소유와 이동(계정 공용 금화, 계정 다이아 지갑), 재화 상한. 아이템 가격·거래소 시세는 `docs/MARKET.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 상점·결제 서버 | `server/endpoints/shop.mjs`·`functions/api/shop.js`·`api/shop.mjs` |
| 지갑·주문·원장·권한 표 | `server/database.mjs`(`djrpg_shop_wallets`·`_orders`·`_ledger`·`_entitlements`·`_requests`) |
| 상점 화면 | `src/ui/modals/shopModal.ts`·`src/styles/modals.css`(상점 블록)·`public/assets/shop/*` |
| 금화 표시 | `src/ui/currency.ts`·`src/ui/hud.ts` |
| 금화 공유·상한 | `server/database.mjs`(`shared_gold`)·`server/save-guard.mjs`(`clampSaveProgress`)·`docs/SYNC_SAVE.md` |

## 불변 규칙

- **화폐는 계정 단위**: 금화는 `djrpg_account_profiles.shared_gold`로 캐릭터가 공유하고, 다이아는 계정 지갑(`djrpg_shop_wallets`)이다. 세이브의 `gold`는 표시·검증용 사본이다.
- **다이아 충전은 서버 승인만**: 주문 생성 → 토스페이먼츠 서버 승인 → 원장 기록. `TOSS_CLIENT_KEY`는 주문 응답으로만 공개하고 `TOSS_SECRET_KEY`는 승인에만 쓴다. **클라이언트가 지급을 확정하지 않는다.**
- **중복 지급 방지**: `djrpg_shop_requests`의 요청 ID로 한 번만 처리. 같은 요청 재전송은 이전 결과를 돌려준다.
- **원장이 유일한 근거**: 재화 변동은 `djrpg_shop_ledger`(`source_type`·`source_id`·`diamonds_delta`)에 남긴다. 지갑 값만 고치는 경로를 만들지 않는다.
- **권한 상품**: `all_idle_30d`(전 슬롯 방치 30일, 다이아 **1,500**)는 `djrpg_shop_entitlements`에 만료 시각으로 부여·연장한다. 캐릭터 슬롯 추가는 `max_slots`(기본 3, **최대 8**)를 올린다 — 8칸이면 상점이 `available: false`(화면 `최대 슬롯`)로 잠근다. 이미 9칸을 산 계정은 9칸을 그대로 쓰고 더 살 수만 없다.
- **판매하지 않는 것**: 전 슬롯 방치·광고 제거는 상점 **목록에만** 표시하고 실제 판매하지 않는다(현재 정책).
- **가격·상품 정의는 서버 상수**: 다이아 8종·패키지 구성은 `shop.mjs`/`shopModal.ts`가 같은 ID를 쓴다. 한쪽만 고치면 `shop` 테스트가 실패한다.
- **상한**: 금화 ≤9,000,000,000,000. 저장 시 `clampSaveProgress`가 자른다. 다이아 잔액은 음수가 될 수 없다(`INSUFFICIENT_DIAMONDS`).
- **게스트**: 결제·슬롯 구매 불가(비밀번호 계정만).

## 금지

- 클라이언트에서 다이아·금화·권한을 직접 올리기.
- 결제 승인 전에 지급하거나, 승인 뒤 원장 없이 지갑만 바꾸기.
- 상품 ID·가격을 서버와 화면에 따로 적기.
- 유료 플랜(Cloudflare) 전제 기능을 이 영역에 넣기.

## 테스트

`node --test tests/shop.test.mjs tests/characters.test.mjs tests/functions-adapter.test.mjs tests/save-guard.test.mjs tests/modal-ui.test.mjs`

## 관련 매뉴얼

`docs/MARKET.md` · `docs/INVENTORY_GEAR.md` · `docs/AUTH_CHARACTER.md` · `docs/SYNC_SAVE.md` · `docs/QUEST_ATTENDANCE.md`
