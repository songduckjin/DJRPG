# [작업 210] 보물 주머니 4단계 개봉 모션·투명 배경 + 보상 아이콘 · 월드보스 하루 3회 복구 · 보스 업적 정예 제외 · 로그아웃 안전장치

- 담당자: fks3997
- 브랜치: `work/210-pouch-smooth-open` (기준 `preview/gravel-background-fks3997` `6799108`)
- `main` 병합: **안 함**(미리보기 확인용)

## 요청(사용자 지시)

1. `#4368`·`#4385` — 보물 주머니 닫힘/열림 그림의 어두운 `#171315` 배경을 지워 투명 배경으로.
2. `#4404` "당연히 부드럽게 열어야지" — 2장이 아니라 **4단계 스무스 애니메이션**
   (닫힘 → 끈 헐거워짐 → 끈 풀리고 빛이 새어 나옴 → 활짝 열리고 빛 폭발),
   네 장을 미리 로드해 전환 깜빡임 0, `[한 번 더 열기]`는 다시 1단계부터.
3. `#4461` "보물주머니 보상주는거 이미지로 넣어줘" — 일일·주간·업적·우편함 보상 칸에 주머니 그림.
4. `#4445` "월드보스 3번 치게 해야지" — 하루 1회로 줄였던 월드보스 도전을 **3회**로 복구.
5. `#4475`·`#4486` "보스가 아니잖아. 월드 3번 치는 거 각 카운팅, 던전이나 메인 스테이지 보스까지만이야"
   — `bossKills`(보스 처치 업적)에서 **필드 정예 몹 제외**.
6. `#4347` 후속 — 서버 저장 실패로 로그아웃에 갇히지 않게 확인 후 나갈 수 있는 길.

## 에셋 (`public/assets/icons/`)

네 장 모두 512×512 RGBA PNG(투명 배경). `/assets/*`는 immutable 캐시라 파일 이름에 `_v2`.

| 단계 | 파일 | 원본 |
|---|---|---|
| 1 닫힘 | `treasure_pouch_v2.png` | `downloads/pouch-option1-leather.png` |
| 2 끈 헐거워짐 | `treasure_pouch_step2_v2.png` | `downloads/pouch-step2-loosening.png` |
| 3 빛이 새어 나옴 | `treasure_pouch_step3_v2.png` | `downloads/pouch-step3-peeking.png` |
| 4 활짝 열림 | `treasure_pouch_open_v2.png` | `downloads/pouch-open-leather.png` |

배경 제거(`work/pouch_alpha.py`, 작업 기록용 스크립트·저장소 미포함):

- 배경색은 테두리 20px의 중앙값(그림마다 18~23 사이로 조금씩 다르다).
- 테두리에서 **4-연결 flood fill**로 "확실한 배경"(색 거리 ≤ 6)만 외곽으로 몰아낸다 —
  주머니 안쪽의 어두운 그림자(배경색과 비슷해도 실루엣 안)는 지켜진다.
- 외곽에 닿은 12px 경계 띠에서 **색 거리 × 밝기**로 부드러운 알파 — 계단·검은 테두리 없이,
  빛 폭발 주변의 어두운 열기는 눌려 사라지고 빛줄기·반짝임은 알파 1로 남는다.
- 네 장의 **몸통 폭·아래끝·가로 중심을 1단계에 맞춰** 스케일·이동(3단계는 0.898배)해
  그림이 바뀔 때 주머니가 튀지 않고 제자리에서 열리는 것처럼 보인다.
- premultiply → 축소 → unpremultiply로 검은 테두리 번짐을 막았다.

기존 `treasure_pouch.png`(배경 포함)는 다른 참조가 깨지지 않게 남겨 둔다(코드 참조 0).

## 코드

- `src/ui/pouchArt.ts` — `POUCH_FRAME_URLS`(4), `pouchFrameUrl`, `setPouchFrame`, `preloadPouchFrames`,
  가방 아이콘은 1단계(`POUCH_ICON_URL`).
- `src/ui/modals/pouchModal.ts` — `POUCH_FRAME_AT = [0, 200, 420, 640]`, `POUCH_RESULT_MS = 900`,
  `POUCH_OPEN_MS = 950`(기존 0.8~1.0초 유지). 창을 열 때 네 장을 미리 받고, `[열기]`마다 1단계로
  되돌린 뒤 타이머로 2·3·4단계를 갈아 끼운다. 세이브 차감은 누르는 즉시 한 번, 연출 중 버튼 잠금.
  `prefers-reduced-motion`이면 곧바로 4단계·결과.
- `src/styles/modals.css` — `pouch-shake`(0~0.20초) · `pouch-burst`(0.20~0.90초) · `pouch-glow`(0.42초~) ·
  `pouch-flash`(0.64초 섬광) · `pouch-reveal`(0.90초 결과) · `@media (prefers-reduced-motion)`.
  투명 PNG라 `img.pouch-art`는 `box-shadow` 대신 `drop-shadow`(사각 상자 그림자 제거).
  `.pouch-reward-icon`(19px) — 금화 아이콘과 같은 인라인 크기.
- `src/ui/modals/utilityModal.ts` — `pouchReward`가 주머니 그림 + `보물 주머니 N개`.
- `server/world-boss.mjs` — `WORLD_BOSS_DAILY_ATTEMPTS = 3`(안내 문구·`remaining`·`maxAttempts`가 이 값 하나를 본다),
  `src/ui/modals/worldBossModal.ts`·`src/game/worldBossLive.ts`·`src/ui/interface.ts`의 표기·기본값 3.
  일일/주간 미션 `월드보스 도전`은 종전대로 **1회 참여**로 달성.
- `src/game/world.ts` `kill` — `if (enemy.boss) this.save.bossKills++;`(정예 제외).
  던전 5·10층 보스(`ui/dungeonField.ts`)·월드보스 도전 종료(`ui/worldBossField.ts`)는 종전대로 1회씩.
- `src/main.ts` — `game-logout`에서 `flush()`가 `false`면
  `confirm('서버 저장에 실패했습니다. 저장되지 않은 상태로 로그아웃할까요?')`로 확인하고,
  확인하면 `clearToken(); location.reload();`, 취소하면 로그인 상태 유지.

## 7. 미리보기 전용 테스트 우편 (`#4580`·`#4589`)

사용자가 미리보기에서 이미 주머니를 다 열어 4단계 모션을 확인할 주머니가 없어 추가했다.

- `server/season.mjs`: `isProductionHost(request, env)`(`djrpg.pages.dev` + `DJRPG_PRODUCTION_HOSTS`)를 빼고
  `seasonArmed`가 그 함수를 쓴다. `isPreviewHost(request, env)` = 호스트에 `preview`가 들어 있고 **운영 호스트가 아닐 때**만 true.
- `server/journey-state.mjs`: `PREVIEW_POUCH_MAIL_ID = 'preview-pouch-test-1'`,
  `grantPreviewPouchMail(state, now, preview)`(계정당 1회 — `state.notices` 기록, `pouches: 1`·금화·스킬북 0·만료 없음),
  `stripPreviewPouchMail(state)`(운영 호스트에서 남아 있는 그 우편 삭제).
  `advanceJourney(..., preview)`가 `preview`면 지급, 아니면 삭제 — **운영(`djrpg.pages.dev`)에서는 지급도 표시도 없다.**
- `server/journey.mjs`의 `snapshot`/`mutate`가 `{ preview }` 옵션을 받고, `server/endpoints/market.mjs`가
  `isPreviewHost(request, env)`로 판정해 넘긴다(클라이언트는 부팅·30초마다 `journey-list`를 부른다).
- 운영 배포 전 제거 지시가 오면 `grantPreviewPouchMail` 호출 한 줄만 빼면 된다(지급 이력이 남아 이미 받은 계정에 다시 붙지 않는다).

## 8. `⚔ 보스 도전` · 아래층 보스 없음 (`#4566`·`#4599`)

- `World.bossFloor()` = `save.floor >= save.maxFloor` — **보스는 최고 도달 층에서만** 나온다.
  아래층(`save.floor < save.maxFloor`)에서는 `floorKills`가 목표에 닿아도 `bossPending`을 예약하지 않고
  `floorKills`만 0으로 돌려 일반·정예 사냥을 계속한다. 스폰도 `bossFloor()`를 다시 확인한다.
- `World.bossRetryReady` = 최고 도달 층 + 자동 등반 꺼짐 + `floor < MAX_FLOOR`.
  패배(`p.hp <= 0`)하면 자동 등반이 꺼지므로 그 순간 true가 된다.
- `World.challengeBoss()` — 자동 등반을 다시 켜고, 기존 몹을 정리한 뒤 `bossPending = true`·`spawnTimer = 0`으로
  그 층 보스를 바로 소환한다. 또 지면 다시 버튼이 살아나 몇 번이든 재도전할 수 있고, 이겨 다음 층으로 올라가면 사라진다.
- `src/ui/hud.ts`의 `.status-main`(층 버튼 옆)에 `⚔ 보스 도전` 버튼, `styles/hud.css`에 금빛 테두리·은은한 맥동
  (`prefers-reduced-motion`이면 정지).
- `src/game/offline.ts` — 아래층 오프라인 정산은 보스 몫(보스 처치·보스 금화·보스 드롭) 없이
  `floorKills = (floorKills + kills) % target`으로만 돈다(접속 사냥과 같은 규칙).

## 9. 타직업 스킬북은 가방으로, 40칸은 장비와 함께 (`#4617`)

- `src/game/bagCapacity.ts`의 `countedInBag(item, job)`이 **장비 + 다른 직업 전용 스킬북**을 40칸에 세고,
  내 직업 스킬북·보물 주머니는 빼다. `equipmentCount(items, job)`·`canStoreItem(items, item, job)`이 같은 규칙을 쓴다.
  `server/skill-ids.mjs`의 `skillBookJobOf`·`countedInBag`이 서버 판본이고 `tests/bag-job-books.test.mjs`가 둘을 대조한다.
- **스킬 창**(`src/ui/skillBooks.ts`): 내 직업 책만 카드로 보여 주고, 아래에 "다른 직업 전용 스킬북은 가방에서 확인"
  안내 한 줄(`.skill-book-hint`)을 붙인다.
- **가방**(`src/ui/modals/equipModal.ts`): 다른 직업 책을 직업 배지와 함께 보여 주고(`내 직업만 보기`가 켜지면 숨김),
  상세에는 "다른 직업 전용 스킬북 · {직업} 캐릭터만 사용할 수 있습니다. 경매장 판매/공용창고 보관 가능."만 적고
  사용 버튼을 두지 않는다. 아래 칸 표기는 `가방 N/40`(장비 + 다른 직업 책).
- 40칸 검사를 쓰는 모든 곳이 `save.job`을 넘긴다 — `world.ts` 드롭 루프·`offline.ts`·`dungeonRewards.ts`·`pouch.ts`·
  `appearance.ts`(장비 해제)·`inventory.ts` `bagEquipmentCount`/`sweepBagOnFull`, 서버는 `database.mjs` `reconcileItems`와
  `market.mjs` 수령함 받기.

## 10. 몹 한 마리당 아이템 1개 — 장비 70% · 스킬북 30% (`#4628`·`#4639`·`#4649`)

- `src/game/items.ts`: `itemDropChance(floor, boss)` — **일반(정예 포함) 1층 0.20% → 20층 0.80%**,
  **보스 1층 3.0% → 20층 12.0%**에서 멈춘다. `SKILLBOOK_DROP_SHARE = .3`·`rollItemKind()`가 당첨된 1개의 종류를 70:30으로 가른다.
  `equipmentDropChance`·`skillBookDropChance`는 같은 값의 70%·30%(던전·보스战利品이 쓰는 비율 호환).
- `world.ts` `kill`·`offline.ts`: 확률 드롭은 **한 번만** 굴리고 당첨되면 1개만 떨어진다(첫 확정 무기는 그대로).
- 던전·던전 보스의 5개战利品은 종전 구조 그대로이고 종류 비율만 70:30이 된다.

## 검증

- `npx tsc --noEmit` 통과.
- `node --test tests/treasure-pouch.test.mjs` **14/14** — 4장 규격(512·RGBA)·경로·단계 함수,
  `POUCH_FRAME_AT`/`POUCH_RESULT_MS`와 CSS 지연 일치, `[열기]` 뒤 0.26초에 2단계·0.48초에 3단계·
  0.70초에 4단계로 바뀌고 `[한 번 더 열기]`는 1단계로 돌아가는 것까지 실제 타이머로 확인.
- `node --test tests/world-boss-live.test.mjs` **14/14** — 하루 3회(1회 사용 시 `remaining 2`,
  2회 1, 3회 0, 4회 `BOSS_LIMIT`, 다음 날 3회 복구).
- `node --test tests/achievements.test.mjs` **9/9** — 필드 일반·정예는 `bossKills` 0, 사냥터 보스는 +1.
- `node --test tests/journey-ui.test.mjs` **13/13** — 보상 칸의 `pouch-reward-icon`(19px)과 문구.
- `node --test tests/world-boss-preview.test.mjs` **7/7** — 안내 문구 "계정당 하루 3회".
- `node --test tests/world-movement.test.mjs` **16/16** — 최고 층 패배 뒤 `bossRetryReady`, `challengeBoss()`가 자동 등반을 켜고
  기존 몹을 정리한 뒤 보스를 소환, 다시 패배하면 다시 도전 가능, 보스를 이기면 다음 층·버튼 사라짐, 아래층은 목표를 채워도 보스 없음.
- `node --test tests/offline.test.mjs` — 아래층 오프라인 정산에 보스 몫 없음.
- `node --test tests/journey.test.mjs` **15/15** — `isPreviewHost`/`isProductionHost` 판정, 미리보기 우편 계정당 1회,
  운영 호스트에서는 지급하지 않고 남아 있으면 지운다, `journey` 목록에만 내려온다.
- `node --test tests/bag-job-books.test.mjs` **5/5** — 40칸 셈(장비+타직업 책, 내 책·주머니 제외)·가득 찬 가방 드롭·
  서버/클라이언트 규칙 일치·가방 화면(배지·안내·사용 버튼 없음·`내 직업만 보기`)·스킬 창 필터.
- `node --test tests/offline.test.mjs` **5/5** — 70:30 단일 롤·드롭률 곡선(0.20/0.80·3/12%)·분포 30%.
- `node --test tests/elite-mob.test.mjs`·`tests/field-loot.test.mjs`·`tests/dungeon-battle.test.mjs`·`tests/balance-196.test.mjs` 통과
  (한 마리당 1개 계약으로 갱신).
- `npx vite build` 통과(기존 Pixi dynamic-import·500KB 경고만).
- 실기(모바일) 모션 확인은 사용자 몫이다.
