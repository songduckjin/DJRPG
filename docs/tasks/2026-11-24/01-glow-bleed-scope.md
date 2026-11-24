# [코덱스 지시서 4] 투구·갑옷 발광이 몸·얼굴로 번지는 범위 수정

> 2026-11-24 덕진 님 PC Codex 전용 상세 작업지시서. 공통 실행 규칙은 `AGENTS.md`, 등록·진행 현황은 `docs/TASK.md`를 따른다.

사용자 지시(2026-11-24 10:02 KST): **"투구랑 갑옷이랑 발광 하는효과 범위가 이상해"** → 되물음에 **"몸까지 번져"**.

즉 증상은 **발광이 약한 것이 아니라 넓은 것**이다. 유니크·전설 투구·갑옷이 빛날 때 그 빛이 파츠 실루엣 밖으로 새어 **몸통·목·얼굴·머리카락까지 등급색으로 물든다.** 등급색·세기·파형은 손대지 말고 **범위만** 파츠 안쪽으로 좁힌다.

## 지금 상태(확인함, `origin/main` `1327b5e` 기준)

발광은 두 화면이 각자 그린다 — ① 전투 필드 `src/game/render/entities.ts` + `src/game/render/gearGlow.ts`, ② 내 정보(장비창) `src/ui/equipmentPortrait.ts` + `src/styles/modals/equip.css`. 번짐 원인이 화면마다 다르고, **다섯 곳**이 확인됐다.

### A. 장비창 CSS — 발광 레이어 전체에 7px `drop-shadow`
- `src/styles/modals/equip.css:63` `.showcase-glow-layer { … filter: saturate(1.3) brightness(1.08) drop-shadow(0 0 7px var(--gear-color, #ff7a00)); … }`
- 발광 레이어 PNG는 이미 마스크로 잘려 있지만, **drop-shadow는 그 PNG의 알파(파츠 실루엣)를 따라 사방 7px로 퍼진다** → 마스크로 막은 몸·얼굴 위에 등급색 후광이 그대로 얹힌다. 마스크를 아무리 정교하게 잘라도 이 7px은 남는다.
- 투구·갑옷·무기 세 레이어가 같은 규칙을 쓰고, `equipModal.ts:410`이 `image.dataset.glowSlot = layer.slot`(`'armor' | 'helmet' | 'weapon'`)을 이미 넣고 있어 **부위별로 다르게 줄 수 있다**.

### B. 장비창 캔버스 — `shadowBlur` 후광에 4px 하한
- `src/ui/equipmentPortrait.ts:465` `const ARMOR_GLOW_AURA = .3;` · `:449` `const HELMET_GLOW_AURA = .35;` · `:483` `paintPatch(…, mask?, aura = 1)`
- `:525` `context.shadowBlur = Math.max(4, Math.round(width * .045 * aura));` — **하한이 4px**이라 `.3`·`.35`로 낮춰도 4px 이상 번진다. `aura > 0`인 한 번짐은 0이 되지 않는다.
- 호출부: 갑옷 `:562`(`ARMOR_GLOW_AURA`) · 전사 투구 `:583`(`HELMET_GLOW_AURA`) · 궁수 투구 `:609-610`(`HELMET_GLOW_AURA`) · **마법사 투구 `:621-622`는 `aura`를 넘기지 않아 기본값 1** → 초상화 폭 300px 기준 약 13px 후광. 지금 가장 크게 번지는 자리다.
- 무기(활 `:597` · 지팡이 `:637` · 대검 `:653`)는 기본값 1 그대로다.

### C. 장비창 마법사 투구 마스크가 픽셀 마스크가 아니라 원형 근사
- 전사·궁수 투구는 **PNG 마스크**(`helmetGlowMaskPath` · `archerHelmGlowMaskPath`, `public/assets/pilot-25d/{helmets_glow,archer_helms_glow}/…`)로 픽셀 단위로 자른다.
- 마법사만 `src/game/render/mageHelmets.ts:179` `mageHelmGlowMaskCanvas(gender)` = `:164` `mageHelmGlowAlpha()`로 **절차적으로** 굽는다 — 얼굴 중심 반경 `inner 22/20 → outer 36/34` smoothstep + 목선 `fadeStart 84 → fadeEnd 108/106` 선형 감쇠뿐이고, **그 밖은 전부 255**다.
- 마법사 파츠 PNG(362×406)에는 모자와 함께 **머리카락·목·어깨 덮개**가 들어 있어, 원형 밖 영역이 전부 발광한다. (주석의 "얼굴·목·어깨·머리카락 제외"와 실제 식이 어긋난다.)
- 여기에 B의 `aura = 1` 후광이 겹쳐 몸까지 번진다.

### D. 전투 필드 — 마법사 투구는 마스크가 **아예 없다**
- `src/game/render/entities.ts:302-304` `syncMageHelmet`이 `view.heroHelmetGlowMaskPath = undefined;`로 둔다(주석 "마법사 파츠는 발광 마스크 PNG가 없다"). 전사(`:134`)·궁수(`:264`)는 경로를 넣는다.
- 그래서 `:835` `syncGearGlow(this, 'helmet', …)`에 마스크가 `undefined`로 들어가고, `:491` `glow.mask = null` → **파츠 전체가 multiply+add 두 겹으로 물든다.** 마법사 유니크·전설 모자에서 얼굴·머리카락·어깨가 함께 빛나는 직접 원인이다.
- `mageHelmets.ts:202` `mageHelmGlowMaskTexture(gender)`는 **export돼 있는데 `src/`에서 쓰는 곳이 0**이다(테스트가 이름만 확인). 필드 연결이 빠진 채 남은 죽은 코드다.

### E. 마스크·발광 텍스처의 필터 — 반투명 1px 테두리
- `src/game/render.ts:530`(갑옷 마스크 시트) · `:612`(투구 마스크)가 마스크 텍스처를 **`scaleMode = 'linear'`**로 올린다. 알파가 0/255인 이진 마스크를 선형 보간하면 실루엣 경계 1텍셀에 0~255 사이 알파가 생기고, 그 반투명 픽셀만큼 **마스크 밖으로 발광이 샌다**(add 겹은 밝기라 눈에 잘 띈다).
- `gearGlow.ts:122` `GLOW_TEXTURE_DIVISOR = 3` — 발광 텍스처를 1/3로 구워 3배 확대(`:132-133`, entities `ratio = width / glowTexture.width`)하므로 가장자리가 최대 3px 부드럽게 퍼진다. 마스크가 그 퍼짐을 자르지 못하는 지점이 생긴다.

## 요구사항

1. **장비창 후광을 끈다(투구·갑옷).** `paintPatch`의 `shadowBlur` 경로를 투구·갑옷에 대해 **완전히 0**으로 만든다 — `aura = 0`이면 `shadowColor`·`shadowBlur`를 아예 걸지 않고, `Math.max(4, …)` 하한을 없애 `aura > 0`일 때만 후광을 건다. 마법사 투구 호출(`:621-622`)에도 `0`을 **명시적으로** 넘긴다(기본값에 기대지 않는다). `ARMOR_GLOW_AURA`·`HELMET_GLOW_AURA` 상수는 0으로 두거나 없앤다. **무기(활·지팡이·대검)의 후광은 그대로 둔다** — 사용자 지시는 투구·갑옷 두 부위뿐이다.
2. **장비창 CSS `drop-shadow`를 부위별로 좁힌다.** 투구·갑옷 레이어는 `drop-shadow` 없이 `mix-blend-mode: screen` + `brightness`만 남기고, 무기 레이어만 기존 7px 후광을 유지한다(`.showcase-glow-layer[data-glow-slot="armor"]`, `[data-glow-slot="helmet"]` 규칙). 등급색 숨쉬기 애니메이션(`gear-rarity-pulse`)·`prefers-reduced-motion` 처리는 그대로 둔다.
3. **마법사 투구 마스크를 픽셀 마스크로 바꾼다(전투·장비창 공통).** 원형 근사(`mageHelmGlowAlpha`)로는 머리카락·어깨를 뺄 수 없다. 가장 확실한 방법은 `scripts/build-armor-glow-masks.py`와 같은 방식으로 **`public/assets/pilot-25d/mage_helms_glow/` PNG를 굽는 것** — 파츠 PNG ∩ (같은 시트의 `mage_headless/` 판에서 머리가 사라진 자리 제외) ∩ (`mage_nostaff/` 판에서 지팡이가 사라진 자리 제외) ∩ (따뜻한 살색 제외), 목선 아래 페이드. 남/여 · 등급 파츠 전수. PNG를 굽는 쪽이 파일·캐시 관례(`helmetGlowMaskPath`)와도 맞는다.
   - PNG를 새로 굽지 않기로 판단하면, 최소한 ㉠ 마스크 알파에 **파츠 PNG의 알파를 곱해** 파츠 밖을 0으로 만들고 ㉡ 얼굴 원(`outer 36/34`)을 실측으로 넓혀 머리카락·목·어깨를 덮게 한다. 어느 쪽이든 `mageHelmGlowAlpha`의 주석과 식이 어긋난 상태로 남기지 않는다.
4. **전투 필드 마법사를 전사·궁수와 같은 규칙으로 맞춘다.** `syncMageHelmet`이 `heroHelmetGlowMaskPath = undefined`로 두지 말고, 실제 마스크를 `heroHelmetGlowMaskPath`/`heroHelmetGlowMaskTexture` 경로로 넘겨 `syncGearGlow(this, 'helmet', …, { mask })`로 자르게 한다. **마스크가 아직 로딩 전이면 그 프레임 발광을 숨긴다**(`helmetGlowReady`와 같은 규칙 — 마스크 없이 그리면 예전 문제로 돌아간다). 쓰이지 않던 `mageHelmGlowMaskTexture`는 실제 연결부로 쓰거나 제거한다.
5. **마스크 경계가 새지 않게 한다.** 마스크 텍스처는 `scaleMode = 'nearest'`, 또는 알파를 하드 임계(`> 0.5 → 1`, 그 외 `0`)로 눌러 굽는다. 필요하면 마스크를 1px 침식한다. 반대로 **파츠 안쪽은 부드럽게 남겨도 된다** — 목선 페이드·얼굴 경계 감쇠는 지금 느낌을 유지한다.
6. **바꾸지 않는 것**: 등급색·세기·파형(`gearGlowTones`·`gearGlowAmount`), 겹 구성 weight(0.42/0.58/0.45), `gearGlowLayersFor`의 `scale <= 1` 2겹 규칙, 서버 계약. 이번 작업은 **범위**만 좁힌다 — 발광을 약하게 만들지 말고 **파츠 안쪽은 지금 밝기 그대로** 둔다.

## 검증

- `npx tsc --noEmit` 통과, `node --test tests/*.test.mjs`(`npm test`) 통과(체크아웃에 `public/assets/**`가 없어 실패하는 건은 `origin/main` 기준선과 **실패 이름 차집합 0**으로 보고).
- **신규 `tests/glow-bleed-scope.test.mjs`**: ㉠ 투구·갑옷 `paintPatch` 호출의 `aura`가 0이고 `Math.max(4, …)` 하한이 없다 ㉡ 마법사 투구 호출도 0을 명시한다 ㉢ 무기는 후광 기본값 유지 ㉣ `equip.css`에서 투구·갑옷 레이어에 `drop-shadow`가 없고 무기에만 있다 ㉤ `syncMageHelmet`이 마스크 경로/텍스처를 넣는다 ㉥ 마스크 텍스처가 `nearest`이거나 임계 처리된다 ㉦ 마법사 마스크가 파츠 알파와 교집합이다(PNG를 굽는 경우 파일 존재·크기·투명 영역 검사). **고치기 전 코드에서 이 테스트가 실패함을 먼저 확인**한다.
- 기존 `tests/{gear-glow-mask,armor-glow-mask,gear-rarity-glow,character-portrait}.test.mjs` 중 `HELMET_GLOW_AURA` 배율·"후광을 줄인다"를 단언하는 건(예: `gear-glow-mask.test.mjs:230-237`, `gear-rarity-glow.test.mjs:123`)을 **0 = 후광 없음** 계약으로 교체한다.
- **육안 기준(합격선)**: 유니크·전설 투구·갑옷을 입고 ① 전투 필드 ② 내 정보를 390×844에서 캡처했을 때, 발광 on/off 프레임의 **피부색 영역(얼굴·목·맨팔·손) 평균 ΔRGB < 2/255**, 파츠 실루엣 밖 번짐 **2px 이내**. 파츠 안쪽 밝기는 수정 전과 같아야 한다(어두워지면 실패).
- **전수 확인**: 전사·궁수·마법사 × 남/여 × 등급(유니크·전설) × 동작(서기·걷기·공격)에서 투구·갑옷 발광 캡처. 특히 마법사 남/여(가장 많이 번지던 자리)와 갑옷 0번(스타터 시트)을 반드시 넣는다. 캡처는 PR 본문에 첨부.
- 완료 뒤 `docs/WORKLOG.md`에 원인 5곳(A~E)과 실제 수정·수치를 남기고, `docs/TASK.md` 진행 현황 행을 `[x]`로 마감한다.
