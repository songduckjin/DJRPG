# DJRPG CODE_MAP — 작업 영역 → 파일 → 테스트

> **읽는 법**: ① 아래 §1 표에서 작업 영역(또는 §2 증상 키워드)을 찾는다 → ② `핵심 파일`만 `rg -n`·부분 읽기 → ③ `관련 테스트`만 실행. **전체 트리 탐색 금지, 이 문서 전수 읽기 금지** — 필요한 행과 §3의 해당 항목만 본다.
> **자주 고치는 작업이면 `docs/QUICK_PATCH.md` §1 표가 먼저다**(수정 파일·금지 영역·단건 테스트가 한 줄에 있다). 설계 판단·변경 범위는 §3.5.

## 1. 기능·증상별 바로가기

| 작업 영역 | 핵심 파일 | 연관 파일 | 관련 테스트 |
|---|---|---|---|
| 월드보스 실전·공유HP·순위·우편보상 | `server/world-boss.mjs`, `server/endpoints/world-boss.mjs`, `src/game/worldBossLive.ts` | `functions/api/world-boss.js`, `worldBossField.ts`, `worldBossModal.ts`, `worldBossResult.ts`, `main.ts` | `world-boss-live`, `world-boss-preview`, `world-boss-field`, `journey` |
| 크롬 GPU 미지원 mesh 렌더 오류 | `src/game/pixiSetup.ts` | `src/main.ts` 초기등록·Canvas quad 폴백 | `pixi-setup`, `hero-motion`, `world-boss-field` |
| 월드보스 소개·전용필드·순위/보상 | `src/ui/modals/worldBossModal.ts`, `src/ui/worldBossField.ts`, `src/game/worldBossRehearsal.ts` | `worldBossPreview.ts`, `worldBossPresentation.ts`, `worldBossDefeat.ts`, `interface.ts`, `main.ts` Ticker수명, `styles/world-boss.css`, `public/assets/world-boss/*` | `world-boss-preview`, `world-boss-field`, `modal-ui`, `modal-interaction`, `hero-motion`, `appearance` |
| 전투·이동·층·보스·AI | `src/game/world.ts` | `arena.ts`, `facing.ts`, `bagCapacity.ts`, `store.ts`(`floorKillTarget`) | `world-movement`, `arena`, `facing` |
| 내 정보·장비창 착용 미리보기 | `ui/equipmentPortrait.ts`(`equipmentPortraitPlan`·`renderEquipmentPortrait` — `planHeroCostume` 공용 계획을 **idle 0프레임**으로 합성), `ui/modals/equipModal.ts`(요약·6스탯·10칸) | `ui/interface.ts`(3탭 라우팅), `ui/modals/accountModal.ts`(성별 고정), `game/costume/manifest.ts`(매니페스트 1회 로드), `game/render/costumeHero.ts`(계획·셀 규약 **소비만**), `styles/modals.css`, `styles/hud.css`, `assets/warrior_equipped_starter|t2|t3|t4_{male,female}.png`(폴백, 작업 142 유지) | `equipment-info`, `equipped-detail`, `modal-ui`, `costume-manifest`, `costume-field-render`, `costume-atlas` |
| 스킬·스킬북·쿨타임·버프 | `src/game/skills.ts`, `src/game/loadout.ts` | `world.ts`(`cooldowns`·`action`), `skillProgress.ts`, `ui/skillBooks.ts`, `ui/skillLoadout.ts`, `ui/modals/skillModal.ts`, `ui/skillFeedback.ts` | `skill-progression`, `loadout`, `skill-ui`, `skill-feedback`, `skillbook-art` |
| 아이템·등급·드랍·스탯·장비 슬롯 | `src/game/items.ts` | `inventory.ts`, `itemComparison.ts`, `bagCapacity.ts`, `codex.ts`, `ui/modals/equipModal.ts` | `inventory`, `codex`, `ring-restore`, `item-protection-ui`, `equipped-detail` |
| 캐릭터 외형·코스튬·애니메이션 | 설계 기준: `docs/COSTUME_SYSTEM.md`(v1.8); 실행 지시: `docs/TASK_songduckjin.md`; **아틀라스 생성기: `scripts/build-costume-atlas.py`** | 필드: `render/entities.ts`(`drawHero`)·`render/costumeHero.ts`(공용 계획·무기 크기·낡은 투구 폴백·캐시·작업 145 단일 전신/4방향 공격)·`render/heroMotion.ts`(모션/화면 방향)·`render/heroScale.ts`(배율)·`render/heroSockets.ts`(폴백 무기 소켓); 통합 바디: `appearance.ts`, `render.ts`, `render/gearTint.ts`; 코스튬 데이터: `costume/**`; 배포 에셋: `public/assets/costume/v3/**`, 격리된 작업 145 시안 `v4/atlas/pilot-hood-*`; 미리보기: `ui/equipmentPortrait.ts`; 뷰어: `tools/costume-viewer/` | `appearance`, `hero-motion`, `hero-weapon-render`, `equipped-detail`, `costume-field-render`, `costume-manifest`, `costume-atlas` |
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
| Turso DB 분리·이관(공용 DB → DJRPG 전용 `djrpg`) | `scripts/migrate-turso-db.mjs`, `docs/TURSO_DB_GUIDE.md` | `server/database.mjs`(`schema()`·별도 DB 접속 토큰), `server/market-connection.mjs`(접속 캐시), `server/world-boss-schema.mjs`(`worldBossSchema()`), `scripts/backup-turso.mjs`(이관 전 백업) | `migrate-turso-db`, `functions-adapter` |

## 2. 증상 한 줄 색인

| 증상·검색어 | 먼저 볼 파일 |
| 월드보스 실전 연결 대기 | `worldBossLive.ts` prepare 선행·12초 제한, `worldBossField.ts` 연출 중 저장, `server/world-boss.mjs` 새 전투 읽기/쓰기 재사용 |
| 크롬 필드가 빈색·validateRenderable undefined | `pixiSetup.ts` CanvasMeshFallbackPipe·main 선등록 |
| 보상·업적 수령 후 재조회/중복저장 지연 | `server/journey.mjs`, `src/game/journey.ts`, `interface.ts` journey.onChange (저장 재호출 금지) |
|---|---|
| 적이 안 다가옴·이동 속도·몹 체력·피해량 | `world.ts` `enemyMoveSpeed`/`enemyMaxHp`/`enemyHitDamage`/`update` |
| 추격 중 공격이 끊기거나 적과 겹침 | `world.ts` `update`(적 추격 정지 거리=기본 공격 범위), `action`(수동 이동 중 차단) |
| 보스가 안 나옴, 층 클리어 | `world.ts` `bossPending`·`floorKillTarget`, `store.ts` |
| 층 이동·최고층 | `world.ts` `travelToFloor`, `ui/modals/floorModal.ts` |
| 쿨타임·버프(레이지)·광폭 | `world.ts` `cooldowns`·`cooldown[kind]`, `skills.ts` `skillDuration` |
| 스킬 슬롯 비어 있음·퀵슬롯 | `loadout.ts`, `ui/skillLoadout.ts`, `ui/hud.ts` |
| 스킬북 사용·레벨업 비용 | `store.ts` `useSkillBook`, `skillProgress.ts`, `skills.ts` `skillUpgradeCost` |
| 가방 40칸·드랍 못 주움 | `bagCapacity.ts`, `world.ts` 드랍 루프, `store.ts` `parseSave` |
| 드랍률·등급·아이템 능력치 | `items.ts` `equipmentDropChance`/`rollItem`/`totalStats` |
| 외형·스프라이트·투구·갑옷 조합 | `appearance.ts` `heroAppearance`, `render.ts` `paths` |
| 그림을 바꿨는데 화면이 그대로(캐시) | `render.ts`/`appearance.ts`의 `?v=`, `scripts/verify-item-art.mjs` |
| 코스튬 제작 방식·앵커·Z-order·스킬 모션 기준을 찾음 | `docs/COSTUME_SYSTEM.md` 및 `docs/TASK_songduckjin.md` 작업 139~142 |
| 아이템이 어떤 코스튬으로 그려지는지·매니페스트 로드 실패 폴백 | `src/game/costume/mapping.ts`(`lookupCostume`·`costumeMapping`), `src/game/costume/manifest.ts`(`planCostume`·`bodyFallback`·`reason`), `docs/COSTUME_SYSTEM.md` §7.1, `tests/costume-manifest.test.mjs` |
| 캐릭터가 코스튬 레이어로 안 그려지고 기존 본체로 보임(폴백) | `src/game/render/costumeHero.ts`(`planHeroCostume`·`renderCostumeHero`·`ensureCostumeAtlas`·`costumeLayerTexture`), `view.costume.status`/`reason`, `docs/COSTUME_SYSTEM.md` §7.2의 아틀라스 배치 규약, `tests/costume-field-render.test.mjs` |
| 공격이 빨라졌는데 캐릭터 모션이 그대로 느림 | `src/game/render/heroMotion.ts`(`costumePlaybackRate`·`costumeFrameIndex`), 폴백 경로는 `entities.ts` `drawHero`(attackPose 기반 프레임) |
| 내 정보 미리보기가 필드와 다르거나 빈 화면 | `ui/equipmentPortrait.ts` `equipmentPortraitPlan`·`renderEquipmentPortrait`(공용 `planHeroCostume` 소비·idle 0프레임·`warrior_equipped_t*` 폴백)·`ui/modals/equipModal.ts`·`styles/modals.css` |
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
- `appearance.ts` (94) — 성별·투구·갑옷·무기 조합 → idle/walk/attack/portrait 키. `heroAppearance`, `unequipItem`; 갑옷·투구 티어와 팔레트는 `items.ts` 기본 이름 인덱스로 파생한다. **직업 분기 없음(전사 단일)**.
- `arena.ts` (25) — 아이소메트릭 투영·이동 경계·스폰 위치. `arenaLimits`, `projectArenaPoint`, `clampArenaPoint`, `arenaEdgePoint`, `spawnArenaEnemy`.
- `facing.ts` (6) — 좌향 원본 몬스터 스프라이트 방향 계산. `enemyFacing`.
- `offline.ts` (43) — 오프라인 사냥 정산(최대 12시간). `applyOfflineRewards`, 타입 `OfflineReward`.
- `codex.ts` (74) — 장비 도감 75종·발견 기록·등급 변형. `codexEntries`, `equipmentCodexKey`, `normalizeCollection`, `discoverEquipment`, `codexOwnership`, `codexVariantName`, `firstDropFloor`, `codexOptions`, `filterCodex`, `codexVariants`, `codexSlotNames`.
- `costume/` (작업 139, 신규 / 작업 143에서 `COSTUME_ASSET_VERSION = 3`으로 실물 배포) — 코스튬 런타임 데이터 계층(Pixi·DOM 비의존 — 렌더러 연결은 `render/costumeHero.ts`, 작업 140). `mapping.ts`(`costumeMapping` 75종·`lookupCostume`·`costumeIdFor`·`legacyCostumeAliases`·`costumeFieldVisible`·`costumeSlotGroup`), `manifest.ts`(`loadCostumeManifest`·`validateCostumeManifest`·`planCostume`·`costumeAtlasLoadResult`·`costumeManifestUrl`/`costumeAtlasUrl`·`COSTUME_ASSET_VERSION`·`COSTUME_MANIFEST_SCHEMA_VERSION`), `skillMotion.ts`(`skillMotionTemplates` — 액티브 8종 → `slash`/`spin`/`smash`/`cast`). 기준 문서: `docs/COSTUME_SYSTEM.md` §7.1(계약)·§7.2(필드 렌더러). `skillMotion.ts`는 `resolveSkillMotion(이펙트 종류)`도 제공해 월드 이벤트 → 모션 템플릿을 잇는다.
- `sync.ts` (251) — 서버 저장 큐·재시도·충돌·거래/창고 락. `SaveSync`(`queueSave`,`flush`,`handleError`,`mutate`,`reset`,`transferWarehouse`,`onSessionEnded`), 내부 `endSession`(401 → 토큰 삭제·저장 중단)·`reloadLatest`(`ITEM_CONFLICT`/`CHARACTER_CONFLICT` → 최신 세이브 재로드, 10초 내 재충돌은 `stopConflictLoop`로 중단)·`stopForOutdatedVersion`(426 → 저장 중단·새로고침), 타입 `SyncResult`.
- `appVersion.ts` (44) — 배포 버전 상수·API 버전 헤더·구버전 응답 복구. `APP_VERSION`(`__APP_VERSION__`), `apiHeaders`, `isOutdatedResponse`, `reloadForNewVersion`(한 번만 자동 새로고침), `clearVersionReloadMark`.
- `market.ts` (123) — 거래소 클라이언트 상태·목록/탭/시세. `Market`, 타입 `Listing`/`Delivery`/`MarketData`/`MarketView`.
- `journey.ts` (39) — 우편·일일/주간/업적 클라이언트. `Journey`(`load`,`act`,`ready`), 타입 `JourneyTask`/`Mail`/`JourneyData`.
- `preferences.ts` (4) — 기기 설정(흔들림·절전·이펙트). `preferences`, `savePreferences` — **localStorage 예외 허용 항목**.
- `bootProgress.ts` (18) — 에셋 로딩 진행률. `createBootProgress`.
- `render.ts` (208) — PixiJS 뷰·에셋 경로·draw 진입점. `GameView`(`mount`,`draw`, hero/enemy/vfx 위임 메서드), `paths`/`animationPaths`/`attackSheets`/`walkSheets`, `renderAssetPaths`, `Art`. `walkSheets`는 가로/세로 비가 2.5 초과면 4포즈 1줄(세로 290), 아니면 8포즈 4×2로 자른다.
- `render/entities.ts` — 히어로·적·시체·잔상 그리기. `drawHero`, `activeSkillMotion`, `updateAfterimages`, `updateCorpses`, `drawEntities`. `drawHero`는 **코스튬 레이어 경로 → 폴백(통합 바디 + 무기 소켓) 경로** 순서로 시도하고, 모션·프레임·재생 배율은 `heroMotion.ts`, 본체 배율·그림자 반지는 두 경로가 같은 식을 쓴다. 잔상은 코스튬 모드에서 보이는 레이어를 모두 복제한다.
- `render/costumeHero.ts` (작업 140, 신규) — 독립형 코스튬 필드 렌더러. `planHeroCostume`(본체 3파츠 + 장비 레이어·파츠 교체·zOrder). **장비 레이어 페이지 이름은 `<부위>-<성별>`이다**(작업 142 — 갑옷이 전신 그림이라 남/여를 섞을 수 없다). `costumeLayerAnchor`/`costumeAtlasPageName`/`costumeLayerCell`(아틀라스 배치 규약), `beginCostumeHero`·`applyCostumeHeroRuntime`·`ensureCostumeAtlas`·`costumeLayerTexture`(현재 계획 최대 6페이지, 이전 Pixi 자산·셀 캐시 해제), `renderCostumeHero`·`hideCostumeHero`·`costumeGhostSources`. 계획 변경 때 스프라이트와 잔상을 해제하고, 페이지 로드 실패는 폴백을 알린다. 규약: `docs/COSTUME_SYSTEM.md` §7.2·§7.6.
- `render/gearTint.ts` — 필드 통합 바디의 피부톤·갈색/금발 머리 보존 팔레트 합성, 머리 밴드·공격 틴트, 파생 텍스처 캐시. 브라우저 캔버스가 없는 Node 환경에서는 원본 텍스처로 폴백한다.
- `render/heroSockets.ts` — 직업 × 성별 무기 손 소켓 표(`heroClass`, `weaponSocket`, `socketMotion`). **폴백(기존 통합 바디) 경로 전용**이며, 코스튬 모드의 무기 위치는 매니페스트 `anchor`/`fit`을 쓴다.
- `render/field.ts` (54) — 룬·지형·먼지·조명·비네트. `drawRunes`, `drawTerrain`, `drawDust`, `drawLighting`, `drawVignette`.
- `render/vfx.ts` (160) — 스킬 이펙트·드래곤·타격·데미지 라벨·드랍. `drawSkillVfx`, `drawDragon`, `drawHit`, `updateDamageLabels`, `drawDeath`, `drawDrops`, `drawEffects`.
- `render/heroMotion.ts` — 모드·프레임 선택과 코스튬 모션 계약. 폴백: `heroAnimationMode`, `heroMotion`(몸통 변형 없음, 회전값 0; `spin`은 VFX·잔상으로 표시). 코스튬: `HeroCostumeMotion`, `costumeMotionOrder`/`costumeMotionFrames`/`costumeMotionSlot`(아틀라스 프레임 슬롯), `heroCostumeMotion`(월드 상태→모션), `costumePlaybackRate`(공격 쿨다운의 역수, 상한 3), `costumeFrameIndex`.
- `render/heroScale.ts` — 아트별 실측 몸통(머리~발) 높이 표와 스케일. `heroBodyFraction`, `heroBodyPx`, `heroBodyHeight`, `heroScale`, 코스튬 모드용 `costumeBodyPx`(잠정 190)·`costumeScale`. **시트별 1개 값**(프레임별 아님)이라 칼을 쳐든 프레임에서도 몸 크기가 변하지 않는다. PNG를 바꾸면 표도 다시 잰다.
- `wasteland.ts` (34) — 배경 씬 크기·화염 앵커·레이아웃·마운트. `wastelandScene`, `wastelandFireAnchors`, `wastelandLayout`, `mountWasteland`, `placeWasteland`.
- `ambientScene.ts` (58) / `ambientMotion.ts` (67) — 풀·불 앰비언트 변형. `mountAmbientScene` / `ambientInfluence`, `ambientOffset`, `AmbientDeformation`, `fireFlicker`, `fireEmbers`, `grassPatches`.

### `src/ui/` — HUD·모달·입력
- `interface.ts` — UI 상태·**3탭** 모달 라우팅의 중심. `Interface`(`open`,`renderModal`,`message`,`setSaveStatus`,`showOfflineReward`, 렌더 위임 메서드), `Modal`, `BagFilter`. 하단 내비는 `내 정보`(=`equipment`)·`스킬`·`거래소` 3개이고, `equipment` 모달이 요약·6스탯·10칸 장비·가방을 함께 담는다([작업 141]에서 `statusModal` 제거).
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
- `equipmentPortrait.ts` — 내 정보 미리보기. `equipmentPortraitPlan`(공용 `planHeroCostume` 소비, 실패 시 티어 전신 초상화 폴백), `renderEquipmentPortrait`(idle 0프레임 합성·dataURL LRU 24·디코딩 아틀라스 이미지 LRU 2·매니페스트 1회 로드), `equipmentFallbackPortrait`.
- `modals/` — `interface.ts` `renderModal`이 라우팅:
  `accountModal.ts` 계정정보(캐릭터 생성 뒤 성별 변경 없음) `renderAccount` · `charactersModal.ts` 캐릭터 선택/생성·창고 `loadCharacters`,`renderCharacters`,`renderCreateCharacter`,`loadWarehouse`,`renderWarehouse` · `codexModal.ts` 도감 `renderCodex` · `equipModal.ts` 내 정보·장비/가방/분해 `renderEquipment`,`renderInventory`,`itemDetail`,`salvage`,`salvageValue`,`iconPath`, `equipmentInfoSlots`·`equipmentInfoStats` · `floorModal.ts` 층 선택 `renderFloor` · `marketModal.ts` 거래소 `renderMarket`,`updateMarketLive` · `offlineModal.ts` 정산 `renderOffline` · `salvageModal.ts` 분해 확인 `requestSalvage`,`finishSalvage`,`renderSalvage` · `skillModal.ts` 스킬 `renderSkills` · `utilityModal.ts` 설정/우편/보상/업적 `renderSettings`,`renderUtility`,`updateUtilityBadges`,`orderedAchievements`.

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
- `scripts/verify-item-art.mjs` — `items.ts` 기본형 목록 ↔ `public/assets/item-art/{slot}_{index}.png`(870×290 PNG, 5개 단위) 검증 + **코스튬 아틀라스 v2 검증**(매니페스트 55종·`COSTUME_ASSET_VERSION` 일치·모든 변형 페이지가 셀 `234×242` 격자 PNG). `npm run check`에 포함.
- `scripts/build-costume-atlas.py` (작업 142 신규 / 143 수정) — 코스튬 아틀라스 v3 생성기(Python 3.12 · Pillow, 선택적 OpenCV 가속). `public/assets/`의 기존 2.5D 시트를 본체 높이 190px·발끝 피벗으로 정규화하고, v3에서 **투구 = 머리 창 안의 차이만**(얼굴 NCC 기준), **크롭 경계 파편 제거**(`clean_fragments`), **맨몸용 투구 페이지**(`helmet-body-*`)를 더해 30프레임 × 65변형 × 남/여를 `public/assets/costume/v3/atlas/*.png` 70장과 `manifest.json`으로 패킹한다. `--preview`는 접촉 시트, `--heads`는 프레임별 머리 기준점 진단을 출력한다. 제작 규칙·한계: `docs/COSTUME_SYSTEM.md` §7.4·§7.5.
- `scripts/costume-contact-sheet.py` (작업 143, 신규) — **배포본 아틀라스**를 `costumeHero.ts`와 같은 규칙으로 합성해 검수용 접촉 시트를 만든다(`--only verify`·`helmets`·`motions`·`contact`). 생성기 중간 산출물이 아니라 실제 배포 PNG를 읽으므로 화면에 나갈 그림을 눈으로 확인할 수 있다.
- `scripts/generate-version.mjs` — `npm run build` 첫 단계. `CF_PAGES_COMMIT_SHA`(없으면 `git rev-parse`·타임스탬프)로 `server/version.generated.mjs`와 `public/version.json`을 기록해 클라이언트 `__APP_VERSION__`과 Functions `APP_VERSION`을 같은 값으로 묶는다.
- `scripts/backup-turso.mjs` — Turso → `.backups/*.sqlite` 덤프(stdin으로 `{url,authToken}`).
- `scripts/migrate-turso-db.mjs` — 공용 Turso DB(`puzzle-mates`) → DJRPG 전용 DB 이관. `djrpg_*` 18개 테이블만 소스 읽기 전용 트랜잭션으로 청크 복사하고, 타겟은 `schema()`·`worldBossSchema()`로 초기화, 복사 후 테이블별 `COUNT(*)` 일치·`djrpg_market_events` `sqlite_sequence`를 검증한다. 목록 밖 `djrpg_*` 테이블 발견 시 중단한다. `--dry-run`(행 수·게스트 계정 수만)·`--force`(타겟 비우고 재복사)·`--chunk-size=N`. `server/database.mjs`는 새 `TURSO_DATABASE_AUTH_TOKEN`을 DB 접속에 우선 사용하고 기존 `TURSO_AUTH_TOKEN`은 세션 서명 키로 유지한다. 운영 절차·부작용·롤백은 `docs/TURSO_DB_GUIDE.md`.
- `tests/ts-loader.mjs` — `.ts`를 node:test에서 import하게 하는 로더. 각 테스트 첫 줄 `import './ts-loader.mjs'`.
- 테스트는 `node --test tests/<이름>.test.mjs` 단건 실행 가능.

- `src/styles/world-boss.css` — 보스버튼70px원형/62px얼굴·280도금색없는붉은단일체력링/하단80도갭·안쪽하단3회·고해상도얼굴크롭, 모션감소대응.
- `src/ui/worldBossPreview.ts` — 메모리 전용60초모션연습·4×2고해상도5시트+2×1복귀시트(전투42프레임/내려찍기26·반기립연결2장/공유타격시간표)혼합격자프레임선택·실측발기준정렬/복귀완급·idle0재개·RAF수명관리. `bossPose`·`framePosition`·`frameSheet`·`preloadBossSheets`·`WorldBossPreview`
- `src/ui/modals/worldBossModal.ts` — 월드보스팝업/무헤더·상단투명상반신/고해상도전투형얼굴·어깨검/앞손정지상반신·뒤구름·허리띠절반가림/손앞층·이름옆나가기·하단정보창/도전·상위10+내순위한눈·보상시안, 공유상태미연동명시. `renderWorldBoss`
- `src/styles/world-boss.css` — HD원본얼굴/뿔직접크롭·58px무테진입버튼·후광분리(얼굴블러없음)·아래체력/3회시안표시·팝업·범위예고·충격파, 본체/이펙트분리.
- `server/journey.mjs` — 수령검증/소유권/수령기록배치원자저장·성공응답선택적journey목록. 구클라이언트호환.

- `src/game/worldBossPattern.ts` — 기본3초/광역15·30·45타격·1초예고·광역후2초대기·모션/피해/효과공통시간표. `bossAttacks`·`activeBossAttack`·`bossHitsBetween`
- `src/game/worldBossRehearsal.ts` — 복제Save전용World·실제메인장착자동공격/스킬·수동회피0.45초/쿨4초·단일보스고정·60초/전투불능종료. 실제저장콜백없음·엔진접촉피해차단/시간표피해만. `WorldBossRehearsal`
- `src/ui/worldBossIntro.ts` — 고정경기장2.7초기본→포효→기본·포효후idle호흡지속·시작글자1.1초완전퇴장후전투/호흡위상유지·시간분리, 스킵·카메라연출없음. `WorldBossIntro`
- `src/ui/worldBossFooting.ts` — idle/복귀/연결프레임양발접점실측·하체mesh접점고정+동일idle부츠레이어/정강이경계mask(상체불변). `bossFootContacts`·`plantedBossVertex`·`plantedBossShift`
- `src/ui/worldBossWeather.ts` — 깃발천정규좌표/변형·뒤구름이동좌표(색마스크mesh, 돌/봉고정·모션감소). `bannerOffset`·`cloudCenter`
- `src/ui/worldBossImpact.ts` — 착지돌탄도/그림자·먼지확산/소멸의결정적입자상태. `slamParticles`
- `src/game/pixiSetup.ts` — 필드 pipe 선등록·Canvas GPU 미지원시 mesh를 texture/bounds quad로 표시(WebGL mesh 유지). `CanvasMeshFallbackPipe`
- `server/world-boss.mjs` — 공유HP 1,000만·KST05 초기화·계정3회·고정장비 서버전투재현·회피서버시간검증·실순위·참여/순위/막타/공동 우편 멱등지급. `worldBossOperation`·`replayBoss`; `worldBossSchema`는 `server/world-boss-schema.mjs`에서 가져와 재수출한다. (새 입장 0피해 쓰기/재조회 생략·순위 단일 쿼리)
- `server/world-boss-schema.mjs` — 월드보스 Turso 4테이블·인덱스의 단일 DDL. 서버 실행과 DB 이관 스크립트가 같은 `worldBossSchema()`를 사용한다.
- `server/endpoints/world-boss.mjs`, `functions/api/world-boss.js` — 인증/세션/버전 확인 POST `/api/world-boss` (list/start/tick/dodge/finish), 기존 Save·아이템·보상수령 계약 보존. `worldBossEndpoint`
- `src/game/worldBossLive.ts` — 메인5초/전투2초 공유상태·순위 동기화·실전시 에셋/입장연출 중 prepare 저장선행(12초 제한)·서버 start 전 취소·단일 저장 재사용·게스트연습 구분. `WorldBossLive`·`mountWorldBossLive`
- `src/ui/worldBossDefeat.ts` — 서버 공유HP 0에서만 한 번 시작하는 검꽂기/무릎꿇기/주저앉기 8프레임·검접점 보정·먼지 타이밍·처치문구(2.25초)·결과 대기(3.6초). `WorldBossDefeat`·`defeatFrameOffset`
- `src/ui/worldBossField.ts` — 고정경기장짧은포효·별도전체GameView필드·고해상도보스텍스처·기본필드정지/복귀·Pixi내부흑요석제단/보스뒤하늘구름·탄도돌조각/그림자/확산먼지충격·프레임색감보정/공격분리조각제거·중앙보스·하단시간/딜/보스적색·내청록체력/수동회피·처치시트 background preload/처치연출 뒤 결과·실전API/서버결과와 게스트연습 분리·로딩/종료1회결과렌더·ticker정지/재도전·나가기. `openWorldBossField`·`pauseMainForBoss`
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
- **Turso 전용**: 세이브는 `djrpg_accounts`/`djrpg_characters`(+`_profiles`,`_item_owners`,`_save_versions`,`_save_requests`). **DJRPG는 전용 DB(`djrpg`)를 쓴다** — 퍼즐 메이츠의 공용 DB(`puzzle-mates`)와 테이블을 섞지 않는다(`docs/TURSO_DB_GUIDE.md`). **브라우저 localStorage 세이브 금지** — 허용되는 localStorage는 `djrpg.auth.token`(로그인 토큰)과 `djrpg_preferences`(기기 설정)뿐. `.env*`·`TURSO_*`는 커밋·로그·번들 금지.
- **성별 교차 동기화(현행 구현)**: 기존 `appearance.ts`의 idle/walk/attack/portrait는 남/여 × 투구 유무 × 갑옷 × 무기 조합을 분기하고 `render.ts`의 대응 시트를 사용한다. 기존 외형 코드 수정 시 `tests/appearance.test.mjs`와 `hero-motion`을 확인한다. 신규 코스튬의 성별 공용화·분리 규칙 및 직업 확장 범위는 `docs/COSTUME_SYSTEM.md`와 해당 TASK에서 결정하며, 기존 통합 바디 분기 표를 신규 설계의 선결 조건으로 복제하지 않는다.
- **현행 외형 구현(전환 대상)**: `appearance.ts`의 통합 바디 시트 선택, `render/entities.ts`의 무기 소켓, `render/gearTint.ts`의 4티어 팔레트는 기존 구현을 설명한다. 신규 장비 제작 시 이 방식을 새 정책으로 복제하지 않는다. **[작업 141·144] 미리보기 계약**: `ui/equipmentPortrait.ts`는 필드와 같은 `planHeroCostume()` 계획을 **idle 0프레임**으로만 그리고, 결과 dataURL LRU 24개와 디코딩 아틀라스 이미지 LRU 2장을 유지한다. 매니페스트·아틀라스가 없거나 셀 밖이면 `warrior_equipped_{starter|t2|t3|t4}_{gender}.png` 전신 초상화로 폴백하며, 매니페스트 실패는 세션 동안 다시 요청하지 않는다. **[작업 142·144] 실물 아틀라스**: `v3` 배포본이 있으므로 필드·미리보기가 실제 코스튬 레이어로 그려진다. 필드 캐시는 현재 계획 최대 6페이지를 유지하고 이전 Pixi 자산을 해제한다. 통합 바디 폴백 코드와 그 시트는 **계속 유지**한다(참조가 남음 — 삭제 금지). 상세: `docs/COSTUME_SYSTEM.md` §7.6.
- **코스튬 정책**: 본체 분리·attach/frames·스킬 모션·도구 비교·캐시 한도는 `docs/COSTUME_SYSTEM.md`가 단일 기준이다. 실제 수정 파일과 범위는 `docs/TASK_songduckjin.md` 작업 138~144 및 `docs/TASK.md`에서 확인한다.
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
