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
- `npx vite build` 통과(기존 Pixi dynamic-import·500KB 경고만).
- 실기(모바일) 모션 확인은 사용자 몫이다.
