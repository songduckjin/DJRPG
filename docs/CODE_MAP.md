# DJRPG CODE_MAP — 작업 영역 → 파일 → 테스트

> **읽는 법**: ① 아래 §1 표에서 작업 영역(또는 §2 증상 키워드)을 찾는다 → ② `핵심 파일`만 `rg -n`·부분 읽기 → ③ `관련 테스트`만 실행. **전체 트리 탐색 금지, 이 문서 전수 읽기 금지** — 필요한 행과 §3의 해당 항목만 본다.
> **자주 고치는 작업이면 `docs/QUICK_PATCH.md` §1 표가 먼저다**(수정 파일·금지 영역·단건 테스트가 한 줄에 있다). 설계 판단·변경 범위는 §3.5.

## 1. 기능·증상별 바로가기

| 작업 영역 | 핵심 파일 | 연관 파일 | 관련 테스트 |
|---|---|---|---|
| 월드보스 소개·전용필드·순위/보상시안 | `src/ui/modals/worldBossModal.ts`, `src/ui/worldBossField.ts`, `src/game/worldBossRehearsal.ts` | `worldBossPreview.ts`, `worldBossPresentation.ts`, `interface.ts`, `main.ts` Ticker수명, `styles/world-boss.css`, `public/assets/world-boss/*` | `world-boss-preview`, `world-boss-field`, `modal-ui`, `modal-interaction`, `hero-motion`, `appearance` |
| 전투·이동·층·보스·AI | `src/game/world.ts` | `arena.ts`, `facing.ts`, `bagCapacity.ts`, `store.ts`(`floorKillTarget`) | `world-movement`, `arena`, `facing` |
| 스킬·스킬북·쿨타임·버프 | `src/game/skills.ts`, `src/game/loadout.ts` | `world.ts`(`cooldowns`·`action`), `skillProgress.ts`, `ui/skillBooks.ts`, `ui/skillLoadout.ts`, `ui/modals/skillModal.ts`, `ui/skillFeedback.ts` | `skill-progression`, `loadout`, `skill-ui`, `skill-feedback`, `skillbook-art` |
| 아이템·등급·드랍·스탯·장비 슬롯 | `src/game/items.ts` | `inventory.ts`, `itemComparison.ts`, `bagCapacity.ts`, `codex.ts`, `ui/modals/equipModal.ts` | `inventory`, `codex`, `ring-restore`, `item-protection-ui`, `equipped-detail` |
| 캐릭터 외형·성별·스프라이트 | `src/game/appearance.ts` | `src/game/render.ts`(`paths`/`animationPaths`/`attackSheets`/`walkSheets`), `render/entities.ts`, `render/heroMotion.ts`, `store.ts`(`Gender`) | `appearance`, `hero-motion`, `hero-art`, `hero-weapon-render` |
| 화면 렌더링·필드·배경·VFX·조명 | `src/game/render.ts`(`GameView`) | `render/field.ts`, `render/vfx.ts`, `render/entities.ts`, `wasteland.ts`, `ambientScene.ts`, `ambientMotion.ts` | `wasteland`, `ambient-motion`, `hero-weapon-render` |
| 오프라인 보상·경험치·레벨업 | `src/game/offline.ts`, `src/game/store.ts`(`addExperience`·`expToNext`) | `ui/modals/offlineModal.ts`, `server/endpoints/account.mjs`(`offlineSeconds`) | `offline` |
| 로그인·회원가입·게스트·캐릭터 선택/생성 | `src/ui/login.ts`, `server/endpoints/account.mjs` | `ui/modals/charactersModal.ts`, `server/auth.mjs`, `api/account.mjs`, `functions/api/account.js` | `characters`, `functions-adapter` |
| 다른 기기 로그인으로 접속이 해제됨(`SESSION_REPLACED`) | `database.mjs` `assertSession`/`assignSession`, `auth.mjs` `tokenPayload` | `endpoints/account.mjs`, `sync.ts` `endSession`/`onSessionEnded`, `main.ts` | `functions-adapter`, `sync` |
| 서버 저장·동기화·충돌(`SAVE_CONFLICT`/`ITEM_CONFLICT`) | `src/game/sync.ts`, `server/database.mjs` | `server/endpoints/account.mjs`, `server/http.mjs`, `src/game/store.ts`(`parseSave`) | `sync`, `functions-adapter`, `characters`, `market` |
| 구버전 클라이언트 차단·최신 버전 강제(426 `VERSION_OUTDATED`) | `server/app-version.mjs`, `src/game/appVersion.ts` | `server/http.mjs`(`versionGuard`), `server/endpoints/{account,market,warehouse}.mjs`, `src/ui/login.ts`, `src/game/sync.ts`, `src/game/{market,journey}.ts`, `public/_headers`, `scripts/generate-version.mjs`, `vite.config.ts` | `app-version` |
| 거래소·시세·여정(journey) | `server/market.mjs`, `server/journey.mjs` | `server/endpoints/market.mjs`, `journey-state.mjs`, `market-events.mjs`, `src/game/market.ts`, `src/game/journey.ts`, `ui/modals/marketModal.ts`, `ui/modals/utilityModal.ts`, `api/market*.mjs`, `functions/api/market*.js` | `market`, `market-actions`, `market-connection`, `journey`, `journey-ui` |
| 계정 창고(warehouse) | `server/endpoints/warehouse.mjs` | `ui/modals/charactersModal.ts`(`loadWarehouse`·`renderWarehouse`·`moveItem`), `sync.ts`(`transferWarehouse`), `api/warehouse.mjs`, `functions/api/warehouse.js` | `characters` |
| UI HUD·모달·스타일 CSS | `src/ui/interface.ts`, `src/ui/hud.ts` | `ui/modals/*`, `bagDetail.ts`, `equippedDetail.ts`, `modalInteraction.ts`, `modalClose.ts`, `modalDefaults.ts`, `src/styles/*.css` | `modal-ui`, `modal-interaction`, `bag-hover`, `equipment-badge`, `journey-ui`, `equipped-detail` |
| Cloudflare Pages Functions·Vercel 어댑터·DB 스키마 | `server/database.mjs`(`schema`), `functions/api/*.js` | `api/*.mjs`, `server/node-adapter.mjs`, `database-config.mjs`, `env.mjs`, `wrangler.toml`, `vercel.json`, `public/_headers` | `functions-adapter`, `characters`, `market` |

## 2. 증상 한 줄 색인

| 증상·검색어 | 먼저 볼 파일 |
| 보상·업적 수령 후 재조회/중복저장 지연 | `server/journey.mjs`, `src/game/journey.ts`, `interface.ts` journey.onChange (저장 재호출 금지) |
|---|---|
| 적이 안 다가옴·이동 속도·몹 체력·피해량 | `world.ts` `enemyMoveSpeed`/`enemyMaxHp`/`enemyHitDamage`/`update` |
| 공격·스킬이 안 나감, 이동 중 공격 | `world.ts` `action`(이동 중 차단), `update`(자동전투) |
| 보스가 안 나옴, 층 클리어 | `world.ts` `bossPending`·`floorKillTarget`, `store.ts` |
| 층 이동·최고층 | `world.ts` `travelToFloor`, `ui/modals/floorModal.ts` |
| 쿨타임·버프(레이지)·광폭 | `world.ts` `cooldowns`·`cooldown[kind]`, `skills.ts` `skillDuration` |
| 스킬 슬롯 비어 있음·퀵슬롯 | `loadout.ts`, `ui/skillLoadout.ts`, `ui/hud.ts` |
| 스킬북 사용·레벨업 비용 | `store.ts` `useSkillBook`, `skillProgress.ts`, `skills.ts` `skillUpgradeCost` |
| 가방 40칸·드랍 못 주움 | `bagCapacity.ts`, `world.ts` 드랍 루프, `store.ts` `parseSave` |
| 드랍률·등급·아이템 능력치 | `items.ts` `equipmentDropChance`/`rollItem`/`totalStats` |
| 외형·스프라이트·투구·갑옷 조합 | `appearance.ts` `heroAppearance`, `render.ts` `paths` |
| 그림을 바꿨는데 화면이 그대로(캐시) | `render.ts`/`appearance.ts`의 `?v=`, `scripts/verify-item-art.mjs` |
| 서버 저장 충돌(409 `SAVE_CONFLICT`) | `database.mjs` `assertRevision`, `sync.ts` `handleError` |
| 아이템 소유권 충돌(`ITEM_CONFLICT`) | `database.mjs` `reconcileItems`·`identity`·`sameItemBody`(이름만 다르면 서버 이름으로 정리), `items.ts` `migrateItem`(저장 이름 보존), `warehouse.mjs` |
| `ITEM_CONFLICT`/`CHARACTER_CONFLICT` 토스트 무한 반복 | `sync.ts` `handleError`·`reloadLatest`·`stopConflictLoop`(`conflictReloadWindow`) |
| 옛 번들이 그대로 뜨고 426·새로고침이 반복됨 | `server/app-version.mjs`, `src/game/appVersion.ts`(`reloadForNewVersion`), `public/_headers`, `scripts/generate-version.mjs` |
| 로그인·토큰 만료·게스트 | `ui/login.ts`, `endpoints/account.mjs`, `auth.mjs` `tokenPayload`/`tokenFor` |
| 거래소 빈 목록·시세·수수료 | `server/market.mjs` `snapshot`/`mutate`/`recentPrice`/`rules`, `src/game/market.ts` |
| 우편·일일/주간·업적 보상 | `journey.mjs`, `journey-state.mjs`, `ui/modals/utilityModal.ts` |
| 창고 보관·인출 | `endpoints/warehouse.mjs`, `ui/modals/charactersModal.ts` |
| 버튼 눌러도 반응 없음·모달 다시 그려짐 | `ui/modalInteraction.ts`(`ModalRenderGate`), `ui/interface.ts` `renderModal` |

## 3. 폴더·파일별 레퍼런스

### `src/game/` — 게임 규칙·상태 (UI 없음)
- `world.ts` (268) — 전투 루프·적 스폰/AI·층 이동·보스·드랍 획득·자동전투. `World`(`travelToFloor`,`action`,`nearest`,`damage`,`kill`,`update`), `cooldowns`, `enemyMoveSpeed`/`enemyMaxHp`/`enemyHitDamage`, 타입 `Enemy`/`Drop`/`Effect`/`Action`.
- `store.ts` (129) — 세이브 스키마·파싱·성장. `Save`, `Gender`, `MAX_LEVEL=30`, `freshSave`, `parseSave`, `readLegacySave`/`clearLegacySave`, `expToNext`, `floorKillTarget`, `addExperience`, `skillLevel`, `useSkillBook`. `items.ts`의 API를 재수출(배럴).
- `items.ts` (169) — 등급·슬롯·기본형 목록·드랍·분해·자동장착. `rarityOrder`/`rarityRanks`/`rarityTiers`/`rarityScales`/`rarityPrefixes`/`salvageGold`/`salvageStones`, `slots`/`slotNames`/`rarityNames`/`statNames`, `baseItems`, `isSkillBook`, `isZweihander`, `equipmentImage`, `migrateItem`, `rollItem`, `rollSkillBook`, `equipmentDropChance`, `skillBookDropChance`, `totalStats`, `itemPower`, `autoEquipBest`, `salvageByRarity`.
- `skills.ts` (53) — 스킬·패시브 정의와 스케일. `skills`, `passives`, `skillOrder`/`passiveOrder`, `MAX_SKILL_LEVEL=30`, `skillUpgradeCost`, `skillRange`, `skillDuration`, `skillDamageScale`, `dragonOrbitFactor`, `dragonRise`, `canLearn`.
- `loadout.ts` (25) — 퀵슬롯 3칸 정규화·장착/해제. `QuickSlots`, `normalizeQuickSlots`, `availableSkills`, `equipSkill`, `unequipSkill`.
- `skillProgress.ts` (15) — 스킬북 비용·업그레이드 가능 판정. `skillBookCost`, `skillBookStatus`, `hasSkillUpgrade`.
- `inventory.ts` (21) — 자동장착 가능 여부·분해 계획/실행. `canAutoEquip`, `salvagePlan`, `salvageItems`.
- `itemComparison.ts` (14) — 장착 아이템 대비 스탯 비교(툴팁/구매 비교). `compareEquipment`.
- `bagCapacity.ts` (4) — 가방 40칸 규칙(스킬북 제외). `EQUIPMENT_BAG_LIMIT`, `equipmentCount`, `canStoreItem`.
- `appearance.ts` (46) — 성별·투구·갑옷·무기 조합 → idle/walk/attack/portrait 키. `heroAppearance`, `unequipItem`. **직업 분기 없음(전사 단일)**.
- `arena.ts` (25) — 아이소메트릭 투영·이동 경계·스폰 위치. `arenaLimits`, `projectArenaPoint`, `clampArenaPoint`, `arenaEdgePoint`, `spawnArenaEnemy`.
- `facing.ts` (6) — 좌향 원본 몬스터 스프라이트 방향 계산. `enemyFacing`.
- `offline.ts` (43) — 오프라인 사냥 정산(최대 12시간). `applyOfflineRewards`, 타입 `OfflineReward`.
- `codex.ts` (74) — 장비 도감 75종·발견 기록·등급 변형. `codexEntries`, `equipmentCodexKey`, `normalizeCollection`, `discoverEquipment`, `codexOwnership`, `codexVariantName`, `firstDropFloor`, `codexOptions`, `filterCodex`, `codexVariants`, `codexSlotNames`.
- `sync.ts` (251) — 서버 저장 큐·재시도·충돌·거래/창고 락. `SaveSync`(`queueSave`,`flush`,`handleError`,`mutate`,`reset`,`transferWarehouse`,`onSessionEnded`), 내부 `endSession`(401 → 토큰 삭제·저장 중단)·`reloadLatest`(`ITEM_CONFLICT`/`CHARACTER_CONFLICT` → 최신 세이브 재로드, 10초 내 재충돌은 `stopConflictLoop`로 중단)·`stopForOutdatedVersion`(426 → 저장 중단·새로고침), 타입 `SyncResult`.
- `appVersion.ts` (44) — 배포 버전 상수·API 버전 헤더·구버전 응답 복구. `APP_VERSION`(`__APP_VERSION__`), `apiHeaders`, `isOutdatedResponse`, `reloadForNewVersion`(한 번만 자동 새로고침), `clearVersionReloadMark`.
- `market.ts` (123) — 거래소 클라이언트 상태·목록/탭/시세. `Market`, 타입 `Listing`/`Delivery`/`MarketData`/`MarketView`.
- `journey.ts` (39) — 우편·일일/주간/업적 클라이언트. `Journey`(`load`,`act`,`ready`), 타입 `JourneyTask`/`Mail`/`JourneyData`.
- `preferences.ts` (4) — 기기 설정(흔들림·절전·이펙트). `preferences`, `savePreferences` — **localStorage 예외 허용 항목**.
- `bootProgress.ts` (18) — 에셋 로딩 진행률. `createBootProgress`.
- `render.ts` (208) — PixiJS 뷰·에셋 경로·draw 진입점. `GameView`(`mount`,`draw`, hero/enemy/vfx 위임 메서드), `paths`/`animationPaths`/`attackSheets`/`walkSheets`, `renderAssetPaths`, `Art`. `walkSheets`는 가로/세로 비가 2.5 초과면 4포즈 1줄(세로 290), 아니면 8포즈 4×2로 자른다.
- `render/entities.ts` (168) — 히어로·적·시체·잔상 그리기(장비는 전용 스프라이트 시트가 담당, 2D 아이콘 덧그리기 없음). `drawHero`, `updateAfterimages`, `updateCorpses`, `drawEntities`.
- `render/field.ts` (54) — 룬·지형·먼지·조명·비네트. `drawRunes`, `drawTerrain`, `drawDust`, `drawLighting`, `drawVignette`.
- `render/vfx.ts` (160) — 스킬 이펙트·드래곤·타격·데미지 라벨·드랍. `drawSkillVfx`, `drawDragon`, `drawHit`, `updateDamageLabels`, `drawDeath`, `drawDrops`, `drawEffects`.
- `render/heroMotion.ts` (19) — idle/walk/attack 모드·프레임 선택. `heroAnimationMode`, `heroMotion`(몸통 변형 없음, 회전은 `spin`만).
- `render/heroScale.ts` (36) — 아트별 실측 몸통(머리~발) 높이 표와 스케일. `heroBodyFraction`, `heroBodyPx`, `heroBodyHeight`, `heroScale`. **시트별 1개 값**(프레임별 아님)이라 칼을 쳐든 프레임에서도 몸 크기가 변하지 않는다. PNG를 바꾸면 표도 다시 잰다.
- `wasteland.ts` (34) — 배경 씬 크기·화염 앵커·레이아웃·마운트. `wastelandScene`, `wastelandFireAnchors`, `wastelandLayout`, `mountWasteland`, `placeWasteland`.
- `ambientScene.ts` (58) / `ambientMotion.ts` (67) — 풀·불 앰비언트 변형. `mountAmbientScene` / `ambientInfluence`, `ambientOffset`, `AmbientDeformation`, `fireFlicker`, `fireEmbers`, `grassPatches`.

### `src/ui/` — HUD·모달·입력
- `interface.ts` (241) — UI 상태·모달 라우팅의 중심. `Interface`(`open`,`renderModal`,`message`,`setSaveStatus`,`showOfflineReward`, 렌더 위임 메서드), `Modal`, `BagFilter`.
- `hud.ts` (66) — 상단 HUD·퀵슬롯·가방 배지. `renderStatus`, `tick`, `renderBagBadge`.
- `login.ts` (71) — 로그인/가입/게스트 화면·API 호출. `openLogin`, `accountRequest`(모든 요청에 `X-App-Version`, 426이면 새로고침), `Session`, `clearToken`.
- `boot.ts` (46) — 부팅 오버레이. `createBootOverlay`.
- `currency.ts` (7) — 금화 아이콘/문자열. `coinMarkup`, `goldMarkup`, `goldNode`.
- `bagDetail.ts` (91) — 가방 아이템 툴팁 위치·핀·해제. `showBagDetail`, `dismissBagDetail`, `positionBagDetail`, `deferBagDismiss`, `bagDetailPinned`.
- `equippedDetail.ts` (75) — 장착 슬롯 툴팁. `showEquippedDetail`, `dismissEquippedDetail`, `positionEquippedDetail`, `deferEquippedDismiss`.
- `modalInteraction.ts` (33) — 누른 요소 유지·재렌더 지연(`ModalRenderGate`). `bindModalInteraction`.
- `modalClose.ts` (12) / `modalDefaults.ts` (14) — 닫기 바인딩 / 모달 열 때 보기 상태 초기화. `bindModalClose` / `resetModalDefaults`.
- `itemOrder.ts` (15) — 스킬/판매 목록 정렬. `orderedSkills`, `filterSaleItems`.
- `skillArtwork.ts` (27) / `skillBookArt.ts` (12) / `skillbookBag.ts` (15) — 스킬 아이콘·스킬북 표지·스택. `applySkillArtwork`,`setSkillIcon`,`setPassiveSkillIcon` / `createSkillBookArt` / `skillbookName`,`skillbookStacks`.
- `skillBooks.ts` (48) — 스킬북 보유/업그레이드 UI. `renderSkillUpgrade`, `markSkillUpgrade`, `renderSkillBooks`.
- `skillFeedback.ts` (47) — 스킬 발동 하이라이트 1회 보장. `SkillFeedback.collect`.
- `skillLoadout.ts` (37) — 퀵슬롯 배치/선택. `chooseSkill`, `pressSkillSlot`, `cancelSkillSelection`.
- `modals/` — `interface.ts` `renderModal`이 라우팅:
  `accountModal.ts` 계정정보 `renderAccount` · `charactersModal.ts` 캐릭터 선택/생성·창고 `loadCharacters`,`renderCharacters`,`renderCreateCharacter`,`loadWarehouse`,`renderWarehouse` · `codexModal.ts` 도감 `renderCodex` · `equipModal.ts` 장비/가방/분해 `renderEquipment`,`renderInventory`,`itemDetail`,`salvage`,`salvageValue`,`iconPath` · `floorModal.ts` 층 선택 `renderFloor` · `marketModal.ts` 거래소 `renderMarket`,`updateMarketLive` · `offlineModal.ts` 정산 `renderOffline` · `salvageModal.ts` 분해 확인 `requestSalvage`,`finishSalvage`,`renderSalvage` · `skillModal.ts` 스킬 `renderSkills` · `statusModal.ts` 내 상태 `renderCharacter` · `utilityModal.ts` 설정/우편/보상/업적 `renderSettings`,`renderUtility`,`updateUtilityBadges`,`orderedAchievements`.

### `src/styles/`
- `main.css` — `base`→`boot`→`hud`→`modals`→`login`→`market`→`codex` 순 import. `base.css`(폰트·리셋), `hud.css`(`.top-hud`,`.floor-button`), `modals.css`(장비·가방·분해 공통), `login.css`(로그인·캐릭터 선택), `market.css`(`.market-*`), `codex.css`(`.codex-*`,`#codex`), `boot.css`(`.boot-*`).

### `server/` — API 코어 (프레임워크 비의존, 테스트가 직접 import)
- `database.mjs` (154) — libsql 래퍼·스키마·트랜잭션·세이브/아이템 계약. `ApiError`, `fail`, `client`, `schema`, `transaction`, `account`, `decodeAccount`, `assertRevision`, `assertSession`/`assertSessionId`/`assignSession`(단일 세션), `inventoryOwnerQuery`, `reconcileItems`, `writeSave`, `validateSave`. 내부 `identity(item)`(이름·슬롯(반지 정규화)·등급·kind·skillId·5스탯).
- `auth.mjs` (49) — HMAC 토큰(비밀키 `TURSO_AUTH_TOKEN`)·비번 해시. `sign`, `tokenFor`(`{id,sid,exp}`), `tokenPayload`, `tokenId`, `hashPassword`, `needsPasswordUpgrade`, `verifyPassword`.
- `http.mjs` (16) — 응답/본문/에러. `json`, `readBody`, `versionGuard`(다른 `X-App-Version` → 426 `VERSION_OUTDATED`), `errorResponse`.
- `app-version.mjs` (18) / `version.generated.mjs` (3) — 배포 버전 식별자. `APP_VERSION`, `OUTDATED_MESSAGE`, `requestVersion`, `versionMismatch` / `BUILD_VERSION`(빌드 시 `scripts/generate-version.mjs`가 덮어씀, 저장소 값은 `dev`).
- `env.mjs` (5) / `database-config.mjs` (4) — 런타임 env·DB 클라이언트 팩토리. `runtimeEnv`,`setRuntimeEnv`,`envValue` / `configureDatabase`,`databaseFactory`.
- `node-adapter.mjs` (17) — Vercel Node req/res ↔ Fetch. `toRequest`, `sendNode`.
- `legacy-auth.mjs` (26) — 구 Vercel 비번 검증 위임. `verifyLegacyViaVercel`.
- `market.mjs` (194) — 거래소 규칙·등록/구매/취소/수령·시세. `rules`(fee .05, 30건, 72h), `expire`, `snapshot`, `mutate`, `recentPrice`.
- `market-connection.mjs` (17) — DB 연결 1회 초기화 재사용. `connectionProvider`, `marketConnection`.
- `market-events.mjs` (4) — 공개 변경 카운터. `latestSeq`.
- `journey-state.mjs` (60) — 일일 05:00 KST/주간 월요일 경계·보상. `periods`, `advanceJourney`, `journeyState`, `journeyOperation`, `journeyView`, `dailyTasks`, `weeklyTasks`, `completionRewards`.
- `journey.mjs` (62) — 우편·보상 수령/읽음/삭제. `snapshot`, `mutate`.
- `endpoints/account.mjs` (123) — `register`/`guest`/`login`/`load`/`characters`/`selectCharacter`/`createCharacter`/`save`/`reset`. 캐릭터 슬롯 1~3, 골드 공유.
- `endpoints/market.mjs` (27) — `list`/`recent-price`/`journey-list`/`journey-*`/그 외 mutate.
- `endpoints/market-events.mjs` (42) — SSE 45초 스트림.
- `endpoints/warehouse.mjs` (63) — `list`/`deposit`/`withdraw`, 창고 40칸.

### `api/` · `functions/api/` · `scripts/` · `tests/`
- `api/{account,market,market-events,warehouse}.mjs` — **Vercel(Node) 어댑터, 테스트가 직접 import하므로 삭제 금지.** `account.mjs`는 `tokenId` 재수출, `market-events.mjs`는 `config.maxDuration=60`.
- `functions/api/{account,market,market-events,warehouse}.js` — Cloudflare Pages `onRequest` → `server/endpoints/*` 호출.
- `scripts/verify-item-art.mjs` — `items.ts` 기본형 목록 ↔ `public/assets/item-art/{slot}_{index}.png`(870×290 PNG, 5개 단위) 검증. `npm run check`에 포함.
- `scripts/generate-version.mjs` — `npm run build` 첫 단계. `CF_PAGES_COMMIT_SHA`(없으면 `git rev-parse`·타임스탬프)로 `server/version.generated.mjs`와 `public/version.json`을 기록해 클라이언트 `__APP_VERSION__`과 Functions `APP_VERSION`을 같은 값으로 묶는다.
- `scripts/backup-turso.mjs` — Turso → `.backups/*.sqlite` 덤프(stdin으로 `{url,authToken}`).
- `tests/ts-loader.mjs` — `.ts`를 node:test에서 import하게 하는 로더. 각 테스트 첫 줄 `import './ts-loader.mjs'`.
- 테스트는 `node --test tests/<이름>.test.mjs` 단건 실행 가능.

- `src/styles/world-boss.css` — 보스버튼70px원형/62px얼굴·280도금색없는붉은단일체력링/하단80도갭·안쪽하단3회·고해상도얼굴크롭, 모션감소대응.
- `src/ui/worldBossPreview.ts` — 메모리 전용60초모션연습·4×2고해상도5시트(일반8/내려찍기24프레임·1.8초가속/충격시점공유)프레임선택·발기준정렬/복귀완급·idle0재개·RAF수명관리. `bossPose`·`framePosition`·`frameSheet`·`preloadBossSheets`·`WorldBossPreview`
- `src/ui/modals/worldBossModal.ts` — 월드보스팝업/무헤더·상단투명상반신/고해상도전투형얼굴·어깨검/앞손정지상반신·뒤구름·허리띠절반가림/손앞층·이름옆나가기·하단정보창/도전·상위10+내순위한눈·보상시안, 공유상태미연동명시. `renderWorldBoss`
- `src/styles/world-boss.css` — HD원본얼굴/뿔직접크롭·58px무테진입버튼·후광분리(얼굴블러없음)·아래체력/3회시안표시·팝업·범위예고·충격파, 본체/이펙트분리.
- `server/journey.mjs` — 수령검증/소유권/수령기록배치원자저장·성공응답선택적journey목록. 구클라이언트호환.

- `src/game/worldBossPattern.ts` — 기본5초/광역15·30·45타격·1초예고·광역후2초대기·모션/피해/효과공통시간표. `bossAttacks`·`activeBossAttack`·`bossHitsBetween`
- `src/game/worldBossRehearsal.ts` — 복제Save전용World·실제메인장착자동공격/스킬·수동회피0.45초/쿨4초·단일보스고정·60초/전투불능종료. 실제저장콜백없음·엔진접촉피해차단/시간표피해만. `WorldBossRehearsal`
- `src/ui/worldBossIntro.ts` — 고정경기장2.7초기본→포효→기본·시작글자1.1초완전퇴장후전투/시간분리, 스킵·카메라연출없음. `WorldBossIntro`
- `src/ui/worldBossWeather.ts` — 깃발천정규좌표/변형·뒤구름이동좌표(색마스크mesh, 돌/봉고정·모션감소). `bannerOffset`·`cloudCenter`
- `src/ui/worldBossImpact.ts` — 착지돌탄도/그림자·먼지확산/소멸의결정적입자상태. `slamParticles`
- `src/ui/worldBossField.ts` — 고정경기장짧은포효·별도전체GameView필드·고해상도보스텍스처·기본필드정지/복귀·Pixi내부흑요석제단/보스뒤하늘구름·탄도돌조각/그림자/확산먼지충격·프레임색감보정/공격분리조각제거·중앙보스·하단시간/딜/보스적색·내청록체력/수동회피·로딩/종료1회결과렌더·ticker정지/재도전·나가기. `openWorldBossField`·`pauseMainForBoss`
- `src/ui/worldBossResult.ts` — 종료전용결과/상위10→직전9명+내행하강·기존유저행밀림/명시적예시·하단재도전/나가기. `renderBossResult`·`resultRankWindow`
- `src/ui/worldBossPresentation.ts` — 상위10/내순위·1/2~3/4~10/11~50/51~100/101이하보상구간선택. 미연동시가짜순위금지. `topTen`·`myRewardTier`

## 3.5 설계자 블록 — 레이어·소유권·시퀀스·영향 경계

### 레이어 의존성 & 상태 소유권
- **단방향**: `ui/` → `src/game/` 규칙 → `sync.ts` → `server/endpoints/` → `server/database.mjs`. `server/*.mjs`는 `src/`를 import하지 않고, `src/`는 `server/*.mjs`를 직접 부르지 않는다(경계는 `/api/*` HTTP + `api/`·`functions/api/` 어댑터).
- **예외는 1곳**: `src/game/sync.ts` → `src/ui/login.ts`(`accountRequest`·`Session`·`clearToken`). 로그인·저장 계약을 공유하므로 두 파일은 함께 본다.
- **`render/`는 읽기 전용 뷰**: `world`·`save`를 읽어 그리기만 한다. 상태 변경·저장 트리거 금지 — 바뀌는 것은 뷰 로컬 데이터(`afterimages`·`corpses`·`ghosts`·`ghostEmissions`, `render/field.ts` 파티클)뿐이다.
- **상태 소유권**: `world.ts` = 휘발성 전투 상태(`enemies`·`effects`·`drops`·`cooldown`·`bossPending`·`player.hp`)로 **저장되지 않는다**. `store.ts` = 세이브 스키마·성장 계산(`Save`·`Gender`·`parseSave`·`expToNext`·`floorKillTarget`·`useSkillBook`)으로 **Turso에 남는 것만**. `world.ts`가 `save`를 직접 고치고(층·골드·가방·레벨·`floorKills`) `world.onChange` → `Interface.onSave` → `sync.queueSave()`가 유일한 저장 트리거다.

### 핵심 시퀀스 4종
**① 로그인·세션(`sid` + `X-App-Version`)**
`login`/`register`/`guest` → `endpoints/account.mjs` → `assignSession`(새 `sid`를 `djrpg_accounts.session_id`에 덮어씀) → `tokenFor({id,sid,exp})` → 클라 `localStorage djrpg.auth.token` → 이후 모든 요청은 `apiHeaders()`로 `Authorization` + `X-App-Version`(= `__APP_VERSION__`) → 서버 `versionGuard`(다르면 426) → `tokenPayload` → `assertSession`(불일치·`sid` 없는 구 토큰 401 `SESSION_REPLACED`).

**② 자동사냥 저장(`queueSave` → `flush` → `writeSave`)**
처치·층 이동이 `save`를 바꿈 → `world.onChange` → `Interface.onSave` → `queueSave()`(1초 디바운스) → `flush()`(`pendingSave`·같은 `requestId`로 재확인, 저장 중 재요청은 `pending` 루프로 합침) → `/api/account {action:'save'}` → `assertRevision` → `reconcileItems` → `writeSave`(revision+1, `gold`는 `shared_gold`, `equipmentCollection` 합집합, `bossKills`/`playSeconds` 최대값) → 응답 `revision`을 `sync.revision`에 반영하고 `onSaved`.

**③ 거래·창고(`mutate` → `flush` 선행 → `reconcileItems`)**
`Market.act` → `sync.mutate(action,data,requestId)` → `active` 저장 완료 대기 후 밀린 `pendingSave`는 `flush()`로 먼저 확정(실패하면 거래 중단) → `locked=true` + `pendingMarket` 고정 → `/api/market`(네트워크 오류는 **같은 `requestId`로 3회**) → `market.mutate`가 `assertRevision` → 아이템 변동 시 `reconcileItems`(소유자·캐릭터 슬롯·`identity`) → `writeSave` → 응답 `save`를 `parseSave` 후 `Object.assign(this.save)`, `locked=false`. 창고는 `transferWarehouse`가 같은 순서로 `/api/warehouse`(10초 타임아웃, `pendingWarehouse` 복구 타이머 2초).

**④ 충돌·버전 오류 복구(`sync.handleError`)**
`401`(`SESSION_REPLACED`·`INVALID_TOKEN`·`UNAUTHORIZED`) → `endSession`: 저장 중단·토큰 삭제·`onSessionEnded` 안내 후 로그인 복귀. `409 SAVE_CONFLICT` → `conflicted=true`·일시정지·새로고침 안내(자동 재저장 금지). `409 ITEM_CONFLICT`/`CHARACTER_CONFLICT` → `reloadLatest`로 최신 세이브 재로드, 10초 안 재충돌이면 `stopConflictLoop`(반복 중단). `426 VERSION_OUTDATED` → `stopForOutdatedVersion` → `reloadForNewVersion`(번들당 1회 새로고침, 캐시면 안내만).

### 변경 영향 경계 (Blast Radius)
- **공용 계약 파일**(`server/database.mjs`, `server/http.mjs`, `vite.config.ts`, `package.json`, `src/game/store.ts`)을 고쳤을 때만 전체 영향 확인 = `npm run check && npm test && npm run build`. `reconcileItems`·`writeSave`·`assertSession`처럼 여러 엔드포인트가 함께 쓰는 계약은 호출부(`account`·`market`·`warehouse`) 테스트까지 같이 통과시킨다.
- 그 외 변경은 `docs/QUICK_PATCH.md`/§1이 지정한 모듈과 **1:1로 매핑된 테스트만** 건드린다. 다른 영역 파일을 "확인만" 하려고 열지 않는다(§4 계약 위반 여부는 문서로 판단).

## 4. 자주 걸리는 함정 · 불변 계약

- **`api/*.mjs` 삭제·이름 변경 금지**: `tests/characters.test.mjs`, `tests/market.test.mjs`, `tests/functions-adapter.test.mjs`가 직접 import. `api/account.mjs`의 `tokenId` 재수출도 계약.
- **`server/database.mjs` 계약**: `assertRevision`(불일치 → 409 `SAVE_CONFLICT`), `reconcileItems`(소유자·캐릭터 슬롯·`identity` 불일치 → 409 `ITEM_CONFLICT`; 삭제 아이템은 `consumed` 처리), `writeSave`(revision+1, `gold`는 `djrpg_account_profiles.shared_gold`로 분리, `bossKills`/`playSeconds`는 최대값 유지, `equipmentCollection`은 합집합 75개, 슬롯 1~3). 이 세 함수의 시그니처·에러 코드를 바꾸지 않는다.
- **단일 세션**: `login`·`register`·`guest` 성공마다 `assignSession`이 `djrpg_accounts.session_id`를 새 `sid`로 덮어쓰고 토큰은 `{id,sid,exp}`. `assertSession` 불일치 또는 `sid` 없는 구 토큰 → 401 `SESSION_REPLACED`(`다른 기기에서 로그인되어 접속이 해제되었습니다.`)를 account·market·warehouse 전 엔드포인트에서 반환한다. `session_id`가 NULL인 세션 열 도입 전 계정·모킹 행은 기존 동작을 유지하고, `session_id`는 클라이언트에 내려보내지 않는다.
- **Turso 전용**: 세이브는 `djrpg_accounts`/`djrpg_characters`(+`_profiles`,`_item_owners`,`_save_versions`,`_save_requests`). **브라우저 localStorage 세이브 금지** — 허용되는 localStorage는 `djrpg.auth.token`(로그인 토큰)과 `djrpg_preferences`(기기 설정)뿐. `.env*`·`TURSO_*`는 커밋·로그·번들 금지.
- **성별 교차 동기화**: `appearance.ts`의 idle/walk/attack/portrait는 남/여 × 투구 유무 × 갑옷 × 무기 조합을 모두 분기하고, `render.ts`의 `animationPaths`/`attackSheets`/`walkSheets`에 대응 시트가 있어야 한다. 외형 변경 시 `tests/appearance.test.mjs`의 성별×투구×갑옷 루프와 `hero-motion`을 함께 통과시키고, 새 아트는 `render/heroScale.ts`의 `heroBodyPx`에 실측 몸통(머리~발) 높이를 넣어야 한다(`hero-motion`의 조합 루프가 검사). 직업 분기는 없음(전사 단일).
- **이미지 교체 시 캐시 버스터**: `/assets/*`는 `Cache-Control: immutable`(`vercel.json`, `public/_headers`). 같은 경로의 PNG를 바꾸면 `render.ts`/`appearance.ts`의 URL에 `?v=N`을 올리고, 장비 아트는 `scripts/verify-item-art.mjs`(=`npm run check`)를 통과시킨다.
- **세이브 한도**: `save.version === 1`, JSON ≤1MB, 장비 가방 40칸(`EQUIPMENT_BAG_LIMIT`, 스킬북 제외), 장비 슬롯 10칸, 골드 ≤9,000,000,000,000. `store.ts` `parseSave`의 전방 호환(구 세이브 마이그레이션)을 깨지 않는다.
- **재시도 멱등성**: 저장은 `requestId` + `djrpg_save_requests`, 거래는 `djrpg_market_requests`, 창고는 `djrpg_warehouse_requests`로 재생한다. 결과가 불확실할 때 **새 requestId로 다시 보내지 말고 같은 requestId로 재확인**한다.
- **UI 재렌더**: 포인터/키 이벤트 처리 중 `renderModal`을 즉시 호출하면 누른 요소가 사라진다. `bindModalInteraction`/`ModalRenderGate`를 우회하지 않는다.
- **배포**: Cloudflare Pages(`wrangler.toml`, name `djrpg`, `nodejs_compat`)만. Vercel 파일은 호환·테스트용이며 재배포하지 않는다. 브라우저 실기 테스트는 요청 시에만.
- **버전 계약**: 모든 클라이언트 API 요청은 `X-App-Version`(= `__APP_VERSION__` = `server/version.generated.mjs`의 `BUILD_VERSION`, `scripts/generate-version.mjs`가 빌드 때 생성)을 보낸다. 헤더 없는 직접 호출은 통과, 배포본과 다른 헤더는 `server/http.mjs` `versionGuard`가 426 `VERSION_OUTDATED`로 막고 클라이언트는 저장을 멈춘다. `reloadForNewVersion`은 번들당 1회만 자동 새로고침하고, 캐시로 같은 번들이 돌아오면 안내 버튼만 띄운다. `/`·`/index.html`·`/version.json`은 `public/_headers`에서 `no-store`.

## 5. 검증·명령

```bash
rg -n "<심볼>" src server tests          # 파일 특정
npx tsc --noEmit                          # 항상(타입 검사)
node --test tests/world-movement.test.mjs # 해당 테스트만
npm run check && npm test && npm run build # 공용 계약 수정·사용자 요청 시에만
```

## 6. 갱신 규칙 (매뉴얼 유지)

- 새 파일·모듈·API 추가 → §1 표에 행 1개, §3에 같은 1줄 형식(`파일` (줄 수) — 책임. `심볼`)으로 함께 추가한다.
- 새 버그 패턴·계약 추가 → §2 증상 색인 또는 §4 불변 계약에 한 줄 반영하고, 책임이 바뀐 기존 줄은 고쳐 쓴다.
- 밀도 유지: 상단 색인(§1·§2)만으로 영역을 찾게 하고 산문 설명은 넣지 않는다(전수 읽기 불필요 상태 유지).
- **`docs/QUICK_PATCH.md` 연계**: 자주 고치는 작업 레시피를 이 문서(§1 행·§2 증상·§3.5 시퀀스)에 반영할 때 `QUICK_PATCH.md` §1 표에도 같은 1줄(수정 파일·금지·단건 테스트)을 추가하고, 반대도 같이 맞춘다. 두 문서가 어긋나면 이 문서가 기준이다.
