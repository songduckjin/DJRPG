# DJRPG QUICK_PATCH — 자주 고치는 작업 바로가기

> **읽는 법**: ① §1 표에서 작업 1줄 찾기 → ② `수정할 파일`만 연다(`rg -n`은 그 파일 안에서만) → ③ `실행할 단건 테스트`만 돌린다 → ④ §3 3줄로 마감. 설계 배경·시퀀스는 `docs/CODE_MAP.md` §3.5, 이 표에 없는 작업만 `CODE_MAP.md` §1 표로 간다. **`CODE_MAP.md` 전수 읽기 금지.**
> **전체 `npm test`·`npm run build`는 공용 계약**(`server/database.mjs`, `server/http.mjs`, `vite.config.ts`, `package.json`, `src/game/store.ts`) **을 건드렸거나 사용자가 요청했을 때만** 실행한다.

## 1. 자주 손대는 작업 인덱스

| 작업 유형 | 수정할 파일 (딱 여기만) | 절대 건드리지 말 것 | 실행할 단건 테스트 |
|---|---|---|---|
| 전투 밸런스 / 몬스터 스탯 / 층 드랍률 | `src/game/world.ts` `enemyMoveSpeed`·`enemyMaxHp`·`enemyHitDamage`·`kill`(골드·드랍 판정), 층 드랍률은 `src/game/items.ts` `equipmentDropChance` | `src/game/sync.ts`, `server/**`, `store.ts` `floorKillTarget`·`parseSave` 계약, `drops.push` 이후 획득 흐름 | `node --test tests/world-movement.test.mjs tests/arena.test.mjs` |
| 자동전투 추격 후 공격 멈춤 | `src/game/world.ts` `update`(적 추격 정지 거리와 공격 범위), `tests/world-movement.test.mjs` | `action`의 수동 이동 차단·쿨다운, 드랍 추격 정지 거리, 저장/API 계약 | `node --test tests/world-movement.test.mjs tests/arena.test.mjs` |
| 스킬 수치 / 쿨타임 / 스킬북 드랍 | `src/game/skills.ts` `skills`·`passives` 표(`cooldown`·`power`·`range`·`level`), `skillDuration`·`skillDamageScale`·`skillUpgradeCost`, 스킬북 드랍은 `src/game/items.ts` `skillBookDropChance`·`rollSkillBook` | `loadout.ts` 3칸 규칙, `world.ts` `cooldowns` 키·`action` 차단 순서, `database.mjs` `itemValid`의 스킬 ID 목록 | `node --test tests/skill-progression.test.mjs tests/loadout.test.mjs tests/skill-feedback.test.mjs` |
| 무기·방어구·장신구·등급 추가/수치 조정 | `src/game/items.ts` `baseItems`·`rarityScales`·`rarityTiers`·`rarityPrefixes`·`rollItem`·`totalStats`·`salvageGold/Stones`, 아트 `public/assets/item-art/{slot}_{index}.png` | 기존 `baseItems` 항목 **순서**(아트 프레임 = 인덱스), `database.mjs` `identity`·`itemValid`의 슬롯·등급 목록(아이템 소유권 계약) | `node --test tests/inventory.test.mjs tests/codex.test.mjs tests/equipped-detail.test.mjs` + `node scripts/verify-item-art.mjs` |
| 캐릭터·몬스터 스프라이트 / 이미지 교체 (`?v=N` 포함) | `src/game/appearance.ts`(`heroAppearance`), `src/game/render.ts`(`paths`·`animationPaths`·`attackSheets`·`walkSheets`), `src/game/render/heroScale.ts`(`heroBodyPx` 실측 몸통 높이), `public/assets/*.png` | `store.ts` `Gender`·세이브 형식, 남/여 × 투구 × 갑옷 분기 삭제. **같은 경로 PNG를 바꾸면 `?v=` 숫자를 +1**( `/assets/*`는 `immutable`) | `node --test tests/appearance.test.mjs tests/hero-motion.test.mjs tests/hero-art.test.mjs tests/hero-weapon-render.test.mjs` |
| UI 텍스트·레이아웃·모달 스타일 조정 | `src/ui/**`(문구·DOM), `src/styles/*.css`, HUD 숫자는 `src/ui/hud.ts` | `interface.ts` `renderModal` 즉시 호출·`ModalRenderGate` 우회, `src/game/**` 규칙, `sync.ts` 상태 문구 계약(`onStatus` 문자열) | `node --test tests/modal-ui.test.mjs tests/modal-interaction.test.mjs tests/bag-hover.test.mjs` |
| 로그인·세션·버전 가드·저장 충돌 처리 | `src/ui/login.ts`, `src/game/sync.ts`, `src/game/appVersion.ts`, `server/auth.mjs`, `server/database.mjs`(`assertSession`·`assignSession`·`assertRevision`), `server/app-version.mjs`·`server/http.mjs`(`versionGuard`) | 에러 코드·상태값(`401` `SESSION_REPLACED`·`INVALID_TOKEN`, `409` `SAVE_CONFLICT`·`ITEM_CONFLICT`·`CHARACTER_CONFLICT`, `426` `VERSION_OUTDATED`), `sid`의 클라이언트 노출, localStorage는 `djrpg.auth.token`·`djrpg_preferences`만 | `node --test tests/app-version.test.mjs tests/sync.test.mjs tests/functions-adapter.test.mjs tests/characters.test.mjs` → **공용 계약 행: 추가로 `npm test`·`npm run build`** |
| 거래소·여정·창고 규칙 조정 | `server/market.mjs`(`rules`·`mutate`·`snapshot`·`recentPrice`), `server/journey.mjs`·`journey-state.mjs`, `server/endpoints/{market,warehouse}.mjs`, `src/game/market.ts`·`journey.ts`, `ui/modals/{marketModal,utilityModal,charactersModal}.ts` | `mutate` 앞 `flush()` 선행 순서, `requestId` 멱등(`*_requests` 테이블) 재확인 규칙, 가방 40칸·창고 40칸·장비 10칸 한도, `reconcileItems` → `writeSave` 순서 | `node --test tests/market.test.mjs tests/market-actions.test.mjs tests/journey.test.mjs tests/journey-ui.test.mjs tests/characters.test.mjs` |
| 그 외 영역(오프라인·도감·가방·필드 렌더 등) | `docs/CODE_MAP.md` §1 표의 해당 행 | 그 행의 `연관 파일`을 넘겨 수정하지 않는다 | 그 행의 `관련 테스트`만 `node --test tests/<이름>.test.mjs` |

## 2. 자주 건드는 패턴 자동 메뉴얼화 규칙

- 같은 파일·같은 증상을 이번 작업에서 **두 번째** 열었다면, 작업 완료 전에 위 표에 **1줄 추가**(`작업 유형` | `딱 그 파일` | `금지` | **실제로 통과시킨** 단건 테스트).
- 새 수정 레시피는 **실제로 통과시킨 명령만** 적는다. 추측한 테스트 파일명·전체 `npm test`는 표에 적지 않는다.
- 표에 행이 생기면 `docs/CODE_MAP.md` §1·§6도 같은 커밋에서 맞춘다(어긋나면 `CODE_MAP.md`가 기준).

## 3. 마무리 3줄

```bash
npx tsc --noEmit                                   # 항상
node --test tests/<매핑된 테스트>.test.mjs          # 표의 단건 테스트만
git diff --check                                   # 공백·충돌 마커
```
