# DJRPG CODE_MAP — 도메인 인덱스

> **이 파일은 얇은 인덱스다.** 설명·규칙·함정은 각 도메인 매뉴얼에 있다. 작업은 **자기 도메인 폴더 + 도메인 매뉴얼 1개**만 읽고 시작한다.
> 과거의 통합 레퍼런스(파일별 상세·증상 색인·설계 블록 전문)는 `docs/archive/2026-11/CODE_MAP-full.md`에 그대로 보관돼 있다 — 필요할 때만 그 파일에서 검색한다.

## 도메인 → 매뉴얼 → 입구 파일

| 도메인 | 매뉴얼 | 폴더·입구 파일 | 대표 테스트 |
|---|---|---|---|
| 일반 필드 전투·방치 오프라인·필드 보스 | `docs/FIELD_OFFLINE.md` | `src/game/world.ts`·`combat/engine.ts`·`combat/bounds.ts`(아레나·필드·넉백 경계)·`loot.ts`·`offline.ts`·`arena.ts`·`bossLoot.ts`·`ui/hud.ts` | `world-movement`·`field-loot`·`elite-mob`·`knockback-bounds`·`offline*`·`floor-cap` |
| 끝없는 던전·서버 리플레이·던전 순위 | `docs/DUNGEON.md` | `src/ui/dungeonBattle.ts`·`dungeonField.ts`·`dungeonLobby.ts`·`src/game/dungeonLive.ts`·`server/dungeon*.mjs` | `dungeon-battle`·`dungeon-verify`·`dungeon-record`·`dungeon-ranking` |
| 무한 방어전·무한 스테이지·방어전 순위 | `docs/DEFENSE.md` | `src/game/dungeon/defenseBattle.ts`·`defenseProgress.ts`·`src/game/defenseLive.ts`·`src/ui/defenseField.ts`·`src/ui/modals/defenseLobby.ts`·`server/defense*.mjs` | `defense-battle`·`defense-verify`·`defense-save-cap`·`defense-ranking` |
| 월드 보스·랭킹·전광판·폴링 예산 | `docs/WORLDBOSS_RANKING.md` | `src/game/worldBoss*.ts`·`src/ui/worldBoss*.ts`·`server/world-boss.mjs`·`legendBoard.ts`·`legendBar.ts` | `world-boss-*`·`legend-board` |
| 여정·데일리 퀘스트·업적·(향후) 출석 | `docs/QUEST_ATTENDANCE.md` | `server/journey-state.mjs`·`journey.mjs`·`src/game/journey.ts`·`ui/modals/utilityModal.ts` | `journey*`·`achievements` |
| 입문 안내(첫 무기→방어구→첫 스킬) | `docs/TUTORIAL.md` | `src/game/tutorial.ts`·`ui/hud.ts`(안내 띠)·`ui/modals/equipModal.ts`(안내 줄) | `tutorial-skill-gear` |
| 장비·가방 40칸·추가옵션·분해·강화 | `docs/INVENTORY_GEAR.md` | `src/game/items.ts`·`extraOptions.ts`·`bagCapacity.ts`·`inventory.ts`·`ui/modals/equipModal.ts` | `inventory`·`bag-*`·`item-plus`·`extra-options`·`auto-salvage` |
| 스킬·스킬북 합성·도감 | `docs/SKILLS_CODEX.md` | `src/game/skills.ts`·`loadout.ts`·`skillSynth.ts`·`codex.ts`·`server/skill-ids.mjs` | `skill-*`·`skillbook-*`·`codex` |
| 여정(우편·보상) 전용 입구 `/api/journey` — 거래소 잠금과 분리(작업 260) | `docs/MAIL_WAREHOUSE.md` › 전용 입구 | `server/endpoints/journey.mjs`·`server/journey-requests.mjs`(표 `djrpg_journey_requests`)·`server/journey.mjs`·`api/journey.mjs`·`functions/api/journey.js`·`src/game/journey.ts`·`src/game/sync.ts`(`pendingJourney`) | `journey`·`journey-ui`·`journey-endpoint`·`journey-split`·`sync` |
| 우편함·공용창고 | `docs/MAIL_WAREHOUSE.md` | `server/journey*.mjs`·`server/endpoints/warehouse.mjs`·`ui/modals/warehouseModal.ts`·`utilityModal.ts` | `warehouse-grid`·`journey*`·`bag-limit-recovery` |
| 거래소 | `docs/MARKET.md` | `src/game/market.ts`·`ui/modals/marketModal.ts`·`server/market.mjs`·`server/endpoints/market.mjs` | `market*`·`multi-character-market` |
| 상점·다이아·재화 | `docs/SHOP_ECONOMY.md` | `server/endpoints/shop.mjs`·`ui/modals/shopModal.ts`·`server/database.mjs`(shop 표) | `shop`·`characters` |
| 계정·로그인·캐릭터·점검 모드 | `docs/AUTH_CHARACTER.md` | `src/ui/login.ts`·`ui/modals/charactersModal.ts`·`server/endpoints/account.mjs`·`auth.mjs`·`maintenance.ts` | `characters`·`register-flow`·`legacy-login`·`maintenance-*` |
| 세이브·동기화·재접속·무결성 가드 | `docs/SYNC_SAVE.md` | `src/game/sync.ts`·`ui/reconnect.ts`·`server/database.mjs`·`server/save-guard.mjs` | `sync`·`reconnect`·`save-guard`·`concurrency` |
| 외형·코스튬·파츠 렌더 | `docs/COSTUME_SYSTEM.md` | `src/game/render/**`·`ui/equipmentPortrait.ts`·`scripts/build-costume-atlas.py` | `costume-*`·`hero-*`·`*-render` |
| 3D → 2.5D 에셋 생성 | `docs/BLENDER_25D_PIPELINE.md` | `scripts/blender/render_25d_costume.py`·`docs/references/**` | `python3 scripts/blender/render_25d_costume.py --selftest` |
| DB 스키마·이관·운영 | `docs/TURSO_DB_GUIDE.md` | `server/database.mjs`(schema)·`scripts/migrate-turso-db.mjs`·`server/*-schema.mjs` | `migrate-turso-db`·`functions-adapter` |
| 배포·점검·동시 접속 | `AGENTS.md`(배포·점검 정책)·`docs/SCALE_100.md` | `public/maintenance.json`·`server/metrics.mjs`·`scripts/load-test-100.mjs` | `maintenance-policy`·`concurrency` |

## 어댑터·공용 계약 (모든 도메인 공통)

- `api/*.mjs`(Vercel·테스트 어댑터, **삭제 금지**) · `functions/api/*.js`(Cloudflare Pages) → `server/endpoints/*.mjs` → `server/*.mjs`.
- 레이어 단방향: `src/ui` → `src/game` → `src/game/sync.ts` → `/api` → `server/*`. 예외는 `sync.ts` → `ui/login.ts` 하나.
- 공용 계약(`server/database.mjs`·`server/http.mjs`·`vite.config.ts`·`package.json`·`src/game/store.ts`) 수정 시에만 전체 검증.

## 검증

```bash
rg -n "<심볼>" <해당 도메인 폴더>     # 파일 특정
npx tsc --noEmit                       # 항상
node --test tests/<해당>.test.mjs      # 도메인 매뉴얼의 테스트 목록
npm run check && npm test && npm run build   # 공용 계약 수정·사용자 요청 시에만
```

## 갱신 규칙

- 새 파일·API·증상은 **해당 도메인 매뉴얼 한 곳**에 같은 형식(파일 — 책임. 심볼)으로 1줄 추가한다. 이 인덱스는 도메인 표에 행이 늘 때만 고친다.
- 도메인 경계가 바뀌면(기능 이동) 매뉴얼 머리의 책임 문장과 이 표를 함께 고친다.
- 작업 번호는 PR 단계에서 선점하지 않는다 — `AGENTS.md` §작업 번호 규칙.
