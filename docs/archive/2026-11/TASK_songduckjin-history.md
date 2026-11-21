# songduckjin 개인 작업지시서 이력 (아카이브)

> `docs/TASK_songduckjin.md`에서 분리한 과거 완료 작업 16건(2026-11-21 문서 정리).

### [x] [작업 135] 갑옷·투구 10종 외형 차별화 (4티어 실루엣 + 팔레트 스왑)
- **완료 결과(2026-11-18)**: 기존 통합 바디 시트에 갑옷·투구 4티어 팔레트 변형과 피부·얼굴·머리카락 보존 틴트 캐시를 적용했다. PR #71이 `e933a22fc2f1e58af6bc2ebab3648f1176c015cb`로 main에 병합됐다. 신규 독립형 코스튬 시스템은 이 구현을 새 제작 정책으로 복제하지 않고 별도 프로토타입 후 전환한다.
- **등록자**: `songduckjin` · **실행 담당자**: `songduckjin`(`codex` 실행 가능) · **등록일**: 2026-11-18 · **브랜치**: `task/135-armor-tier-palette` · **위험 등급**: 중 · **상태**: `[x]` 완료
- **선행 조건**: `[작업 134]`(`task/134-field-gear-action`, PR #66 → #68로 마감, `origin/main` = `c0e3b03`)가 끝난 상태에서 **`origin/main` 기준으로 착수**한다. 134가 같은 파일(`src/game/appearance.ts`, `src/game/render/entities.ts`)을 고쳤으므로 반드시 최신 `main`에서 `task/135-armor-tier-palette`를 따고, 134의 검 없는 시트·무기 소켓 계약을 그대로 위에 얹는다. 이 등록 문서는 `docs/135-armor-tier-palette` 브랜치 PR로 올렸고 코드는 건드리지 않았다.
- **직접 수정**: `src/game/appearance.ts`, `src/game/render/entities.ts`, `src/game/render/gearTint.ts`(신규 — 틴트 캐시 헬퍼), `tests/appearance.test.mjs`, `docs/CODE_MAP.md`(§3·§4 마감 시), `docs/TASK.md`. **간접 영향**: `src/game/render.ts`(티어 시트 키를 경로 표에 넣을 때), `src/game/render/heroScale.ts`(1·3·4티어 전용 시트를 실제로 추가할 때 `heroBodyPx` 실측값), `src/game/items.ts`(`baseItemIndex`를 재사용하려면 **export 추가만** — 동작·시그니처 변경 금지). **건드리지 않음**: `src/ui/equipmentPortrait.ts`·`src/ui/modals/equipModal.ts`([작업 133] 장비창 미리보기), `src/game/store.ts`(세이브 형식), `server/**`, `public/assets/wearable/*`(장비창 착용 아트 시트), `public/assets/item-art/*`(장비창·도감 아이콘 시트).
- **목표**: 인게임 필드에서 갑옷·투구를 착용하면 지금은 `armored` / `femaleArmoredHelm` 같은 **티어 1종 시트로만** 보인다(장비창은 [작업 133]으로 10종이 이미 구분됨). 실무 게임사 방식대로 **티어당 통합 바디 시트 1장(1 경갑·2 기본 판금·3 상급·4 전설 / 1 경투구·2 철·사슬 헬름·3 상급·4 전설 왕관) + 티어 안 10종의 팔레트 스왑**으로 종류를 구분해, 10종을 다 입어도 필드 실루엣과 색이 눈에 띄게 달라지게 한다. 시트를 10장 더 그리지 않으므로 에셋·로딩 비용은 그대로다.
- **사용자 결정(2026-11-18)**: 갑옷을 티어 실루엣 + 티어 내 팔레트 스왑으로 나누기로 확정. 이어서 **"근대 투구도 마찬가지야"** — 투구 10종도 같은 방식(티어 실루엣 + 팔레트 스왑)으로 함께 처리한다. 갑옷만 입었을 때·투구만 썼을 때·둘 다일 때 모두 색으로 구분돼야 한다. **티어 수는 3티어에서 4티어(1~4)로 확장 확정** — 1=초반 장비(가죽·징박힌 / 가죽 두건·철제 바시넷), 2=기본 판금(사슬·강철), 3=상급(미스릴·흑요석·용), 4=전설(성기사·패왕 / 발키리·불멸). **색감 변형 시 피부·얼굴·머리카락은 절대 보존**한다(아래 품질 가드).
- **품질 가드(2026-11-18 추가)**: 색감 변형은 **피부·얼굴·머리카락을 보존**해야 한다. 시트 전체 `source-atop` 틴트만 쓰지 말고 캐시 생성 시점에 `getImageData`로 피부톤 픽셀을 판정해 원본을 유지하고, 갑옷·투구의 무채색·금속·어두운 픽셀에만 목표 팔레트 색조를 입힌다(아래 틴트 캐시 1~3).
- **배경·근거(현재 코드)**:
  - `src/game/items.ts` `baseItems.armor`·`baseItems.helmet`은 각 10종이고, `baseItemIndex`가 이름을 NFKC 정규화·공백 제거 후 완전일치/`endsWith`로 대조한다. 레거시 `'낡은 투구'`는 `'심연의 뿔투구'`(index 7)로 매핑된다.
  - `src/game/appearance.ts` `heroAppearance(save)`는 갑옷·투구 **유무**만 보고(`armed`/`armored`/`femaleHelmet`/`oldHelmet`) 시트 키를 고른다. 갑옷·투구의 **종류**는 시트에 반영되지 않는다(장비창은 `wearableEquipmentImage` 프레임으로 10종 구분).
  - `drawHero`(`render/entities.ts`)는 `heroAppearance`가 고른 Pixi `Texture`를 그대로 쓰고, 무기는 `syncWeapon`→`heroSockets.ts` 소켓으로 따로 그린다. 텍스처는 `render.ts`가 키 단위로 1번 로드해 공유하므로 **공유 텍스처를 직접 칠하면 다른 캐릭터·다른 상태까지 물든다** → 키 단위 파생 텍스처 캐시가 필요하다.
  - 공격 시트(`*Attack`)에는 검·검기가 함께 그려져 있어, 바디 전체 틴트를 그대로 걸면 검 색까지 바뀐다(검기 색은 `render/vfx.ts` 담당). 틴트 강도를 프레임 종류별로 달리해야 한다.
- **설계 스펙**:
  - **티어 분류(갑옷 `armorTier`: `1 | 2 | 3 | 4`)**:
    - 1티어(초반 경갑) = `'가죽 조끼'`, `'징박힌 갑옷'`
    - 2티어(사슬·강철 — **기존 판금 시트의 기본 티어**) = `'사슬 갑옷'`, `'강철 브레스트플레이트'`, `'하프 플레이트'`
    - 3티어(상급 중갑·용갑주) = `'미스릴 아머'`, `'흑요석 갑주'`, `'드래곤 메일'`
    - 4티어(최상급 전설) = `'성기사 풀플레이트'`, `'패왕의 전갑'`
  - **티어 분류(투구 `helmetTier`: `1 | 2 | 3 | 4`)** — 사용자 확정(2026-11-18): 3티어안을 **4티어**로 확장:
    - 1티어(초반 경투구) = `'가죽 두건'`, `'철제 바시넷'`
    - 2티어(사슬·강철 헬름 — 기존 시트 기본 티어) = `'사슬 코이프'`, `'기사 헬름'`, `'바이저 투구'`
    - 3티어(상급 투구) = `'미스릴 그레이트헬름'`, `'용린 투구'`, `'심연의 뿔투구'`
    - 4티어(전설 왕관) = `'발키리 크라운'`, `'불멸의 왕관'`
    - 레거시 `'낡은 투구'`는 3티어(`'심연의 뿔투구'`와 같은 팔레트 키 `abyss`)로 두되, 시트는 기존 `*OldHelm` 분기(`heroAppearance`의 `oldHelmet`)를 그대로 유지한다.
  - **팔레트 표(갑옷)** — 키는 슬롯 안에서 유일해야 한다:

    | 갑옷 | 티어 | `armorPalette` 키 | 톤(예시 RGB) |
    |---|---|---|---|
    | 가죽 조끼 | 1 | `leather` | 갈색 `#8a5a32` |
    | 징박힌 갑옷 | 1 | `studded` | 짙은 황갈 `#6f5a24` |
    | 사슬 갑옷 | 2 | `chain` | 은회색 `#8d949c` |
    | 강철 브레스트플레이트 | 2 | `steel` | 기준(무변형, 원본 유지) |
    | 하프 플레이트 | 2 | `blueSteel` | 청강 `#5d7fa6` |
    | 미스릴 아머 | 3 | `mithril` | 은백청 `#b9d3e6` |
    | 흑요석 갑주 | 3 | `obsidian` | 암흑보라 `#3a2b52` |
    | 드래곤 메일 | 3 | `dragon` | 진홍 `#8f1f22` |
    | 성기사 풀플레이트 | 4 | `paladin` | 황금 `#c9a63a` |
    | 패왕의 전갑 | 4 | `overlord` | 자주금 `#5e2a6b` |
  - **팔레트 표(투구)**:

    | 투구 | 티어 | `helmetPalette` 키 | 톤(예시 RGB) |
    |---|---|---|---|
    | 가죽 두건 | 1 | `leather` | 갈색 `#8a5a32` |
    | 철제 바시넷 | 1 | `iron` | 철회색 `#7d7f83` |
    | 사슬 코이프 | 2 | `chain` | 은회색 `#8d949c` |
    | 기사 헬름 | 2 | `steel` | 기준(무변형) |
    | 바이저 투구 | 2 | `blueSteel` | 청강 `#5d7fa6` |
    | 미스릴 그레이트헬름 | 3 | `mithril` | 은백청 `#b9d3e6` |
    | 용린 투구 | 3 | `dragonScale` | 진녹 `#2f6b45` |
    | 심연의 뿔투구 | 3 | `abyss` | 암흑보라 `#33265a` |
    | 발키리 크라운 | 4 | `valkyrie` | 백금 `#dfe6ee` (채도 ↓·명도 ↑) |
    | 불멸의 왕관 | 4 | `immortal` | 황금 `#d4af37` |
    | (레거시) 낡은 투구 | 3 | `abyss` | 심연의 뿔투구와 동일, 시트는 `*OldHelm` 유지 |

  - **헬퍼 시그니처(`src/game/appearance.ts`)**:
    ```ts
    export type GearTier = 1 | 2 | 3 | 4;
    export type GearPalette = { key: string; tint: number; saturation: number; lightness: number; strength: number };
    export function armorTier(armor?: EquipmentItem): GearTier | null;
    export function armorPalette(armor?: EquipmentItem): GearPalette | null;
    export function helmetTier(helmet?: EquipmentItem): GearTier | null;
    export function helmetPalette(helmet?: EquipmentItem): GearPalette | null;
    ```
    - 판정은 **아이템 이름 → `baseItems[slot]` 인덱스**로만 한다(등급·스탯·id로 추측 금지). `items.ts` `baseItemIndex`와 같은 정규화 규칙(NFKC·공백 제거·`endsWith`)을 쓰고, 중복 구현 대신 `baseItemIndex`를 export해 재사용하는 편을 권장한다. 접두사가 붙은 이름(예: `무결의 강철 브레스트플레이트`)·공백 없는 이름도 같은 키가 나와야 한다. 슬롯이 비면 `null`.
    - `heroAppearance(save)` 반환값에 **`armorTier`·`armorPalette`·`helmetTier`·`helmetPalette`를 추가**한다(기존 `idle`/`walk`/`attack`/`portrait`/`helmetIntegrated`/`helmet` 키는 이름·의미·값 모두 불변).
  - **티어 시트 확장·폴백(`appearance.ts` + `render.ts`)**: 시트 선택은 지금의 2티어 판금 시트 id를 그대로 기준으로 두고, `sheetFor(tier, baseId)` 같은 매핑 함수 1곳을 거치게 한다. 매핑에 해당 티어 시트가 없으면(지금은 1·3·4티어 전부) **`baseId`(2티어 판금 시트)를 그대로 반환**해 에러 없이 동작하고 색감만 다르게 입힌다. 1·3·4티어 전용 시트를 나중에 추가할 때는 이 표에 경로를 넣고 `heroScale.ts` `heroBodyPx`에 실측 높이를 넣는 것으로 끝나게 한다(`render.ts`의 `animationPaths`/`attackSheets`/`walkSheets` 로더는 표를 읽기만 한다).
  - **틴트 캐시(`src/game/render/gearTint.ts` 신규)**:
    - `tintedGearTexture(sourceKey, armorKey, helmetKey)` → 캐시된 Pixi `Texture`. 키 문자열은 `` `${sourceKey}|${armorKey ?? '-'}|${helmetKey ?? '-'}` ``.
    - 생성은 **오프스크린 캔버스 1회(캐시 생성 시점에만)** — `getImageData`로 픽셀을 직접 판정해 목표 팔레트를 입힌다. 시트 전체에 단순 `source-atop` 색칠만 덮으면 얼굴·피부까지 붉거나 파랗게 물들어 퀄리티가 망가지므로, **피부·얼굴·머리카락 보호 품질 가드를 반드시 넣는다**:
      1. **피부톤 픽셀은 원본 그대로 유지** — 따뜻한 살구·피부색 범위(예: `R > G > B`, `R - B > 18`, 밝기 60~245, Hue 약 10~45°, 채도 0.12~0.55)에 드는 픽셀은 **색조를 전혀 입히지 않고 원본 RGB·알파를 복사**한다. 머리카락(어두운 갈색·금발)과 눈·입 선도 같은 규칙으로 보존한다.
      2. **팔레트는 금속·가죽 픽셀에만 입힌다** — 갑주·투구의 무채색(회색 금속)·어두운 픽셀·이미 팔레트 색상 쪽인 픽셀에만 목표 색조를 섞어 넣고(`amount = strength × 금속도 가중치`), 하이라이트(밝기 245 초과)와 외곽선(밝기 25 미만)은 원본을 유지한다.
      3. 그 결과 머리 밴드 안의 **얼굴·목 피부**는 투구 팔레트도 입지 않고, 목표 색조는 갑옷·투구의 금속·가죽 면적에만 적용된다(피부 보존은 머리 밴드 분리 합성보다 우선).
    - 픽셀 작업은 캐시 항목을 **처음 만들 때 1회**뿐이며, 갑옷·투구를 바꾸거나 시트 키가 바뀔 때만 해당 키가 생성된다(모션마다 1회 → 프레임 드롭 없음). `getImageData`는 같은 오리진의 `public/assets` 시트라 CORS taint 없이 동작한다.
    - **매 프레임 픽셀 루프 금지**: `Map`에 캐시하고 이후에는 캐시된 텍스처를 `drawImage`/Sprite에 그대로 쓴다. 캐시 상한(예: 64개, LRU)을 두고 전투 중 텍스처 재생성으로 프레임이 튀지 않게 한다.
    - **머리·몸 분리 합성**: 갑옷과 투구는 같은 바디 시트에 함께 그려져 있으므로, 한 장에 두 팔레트를 입히려면 **머리 밴드(프레임 상단 약 22%, `gearTint.ts`의 시트별 상수)** 는 `helmetPalette`, 나머지 영역은 `armorPalette`로 1회 합성한다. 이렇게 해야 ① 갑옷만 → 몸 전체가 갑옷 톤 ② 투구만 → 머리 밴드만 투구 톤 ③ 둘 다 → 몸은 갑옷 톤 + 머리는 투구 톤으로 **세 경우 모두 색이 구분**된다. 머리 밴드 비율은 시트별 상수로 두고 테스트에서 `0 < headBand < .4`를 검사한다.
    - **공격 시트**: 검·검기가 시트에 그려져 있으므로 `strength`를 서기·걷기의 약 60%로 낮춰 검 색 변화를 최소화한다(검기 색은 `vfx.ts` 담당이므로 이중 표현 금지).
    - `entities.ts`는 `this.hero.texture`에 원본 대신 `tintedGearTexture(...)` 결과를 넣고, `heroScale`·`anchor`·그림자 반경·무기 소켓(`syncWeapon`)·`heroBodyHeight` 계산은 **원본 텍스처 기준 그대로** 유지한다(틴트 텍스처는 크기가 같다). 잔상(`updateAfterimages`)은 이미 `this.hero.texture`를 복제하므로 자동으로 같은 색을 쓴다.
  - **불변 계약**:
    1. 세이브 형식·`store.ts` 변경 없음 — 팔레트는 아이템 이름에서 파생하고 세이브에 저장하지 않는다.
    2. 장비창(`ui/equipmentPortrait.ts`)·착용 아트 시트(`public/assets/wearable/*`)·도감 아이콘(`item-art/*`)은 손대지 않는다. 2D 아이콘 덧그리기 금지도 그대로다(티어 시트 + 색만).
    3. 남/여 동시 반영 — `appearance.ts`의 성별 분기와 `hero-motion` 조합 루프를 함께 통과시킨다.
    4. 다직업 구조 유지 — 새 직업 추가 시 필요한 것은 `appearance.ts` 시트·팔레트 표와 `heroSockets.ts` 소켓 표뿐이고 `entities.ts`는 수정하지 않는다.
    5. 무기 등급 색(`vfx.ts`)·무기 소켓 좌표는 변경하지 않는다.
- **테스트(`tests/appearance.test.mjs`)**:
  1. 갑옷 10종이 `armorTier` **1/1/2/2/2/3/3/3/4/4**로 정확히 분류된다(1~4 각 티어가 최소 1종 이상, 2티어가 3종).
  2. 갑옷 10종의 `armorPalette.key`가 **서로 다른 10개**다.
  3. 투구 10종이 `helmetTier` **1/1/2/2/2/3/3/3/4/4**로 분류되고, `helmetPalette.key`가 서로 다른 10개다.
  4. 레거시 `'낡은 투구'`가 3티어이며 `helmetPalette.key === 'abyss'`(심연의 뿔투구와 동일), `heroAppearance`의 `idle`은 기존 `*OldHelm` 시트를 유지한다.
  5. 슬롯이 비면 `armorTier`/`armorPalette`/`helmetTier`/`helmetPalette`가 모두 `null`이다.
  6. 접두사·공백 없는 이름(`무결의강철브레스트플레이트`)도 같은 팔레트 키를 돌려준다.
  7. 성별 × 투구 × 갑옷 루프에서 `heroAppearance`가 네 필드를 모두 채우고, 기존 `idle`/`walk`/`attack`/`portrait`/`helmetIntegrated` 값은 [작업 134] 이전과 같다.
  8. `gearTint`의 머리 밴드 상수가 `0 < headBand < .4`이고, (갑옷만 / 투구만 / 둘 다) 세 경우의 캐시 키가 서로 다르다(캔버스가 없는 Node 환경에서는 순수 함수 부분만 검사).
  9. **피부 보존 판정 함수**(`isSkinPixel(r,g,b)` 같은 순수 함수로 분리)가 살구·피부톤 표본에서 `true`(원본 유지), 강철 회색·흑요석 보라·황금 표본에서 `false`(팔레트 적용)를 돌려준다. 실제 이미지 픽셀 검사는 캔버스가 있는 브라우저 실기·요청 시에만.
- **검증**: `pnpm exec tsc --noEmit`, `node --test tests/appearance.test.mjs tests/hero-motion.test.mjs tests/hero-weapon-render.test.mjs`, `git diff --check`. 에셋(시트 PNG)을 추가·교체하면 `node scripts/verify-item-art.mjs`와 캐시 버스터(`?v=N`)도 함께. 전체 `npm test`·`npm run build`는 공용 계약을 건드리지 않았으므로 실행하지 않는다. 브라우저·Playwright 실기는 요청 시에만.
- **완료 기준**: 필드에서 갑옷 10종이 4가지 실루엣(1 경갑·2 기본 판금·3 상급 중갑·4 전설)과 서로 다른 색으로, 투구 10종이 4가지 실루엣(1 경투구·2 철·사슬 헬름·3 상급·4 전설 왕관)과 서로 다른 색으로 보인다. **얼굴·피부·머리카락은 원래 색을 유지**하고 갑옷·투구 면적만 팔레트 색을 띤다. 갑옷만·투구만·둘 다 착용한 세 경우 모두 구분되고, 갑옷과 투구를 같이 입으면 몸과 머리의 갑주 색이 각각의 팔레트를 따른다. 남/여 동일하고 서기·걷기 8프레임·공격 4프레임에서 색이 유지되며 프레임마다 새 텍스처를 만들지 않는다(`(텍스처 키 + 갑옷 팔레트 키 + 투구 팔레트 키)` 캐시). 장비창·도감·아트 시트와 무기 소켓·검기 색은 변하지 않는다. 타입 검사·해당 테스트·`git diff --check` 통과 후 PR 병합.
- **동시 작업 확인**: 등록 시점 `origin/main` = `c0e3b03`(PR #68로 `[작업 134]` 마감·아카이브). `docs/TASK.md`의 다른 `[-]` 작업은 이 `[작업 135]` 하나뿐이라 파일 충돌이 없다. 번호 135는 등록 시점에 `docs/`·원격 브랜치 어디에도 없음을 확인했다.

### [x] [작업 129] 장착 장비 착용형 아트 제작
- **담당자**: `songduckjin`
- **브랜치**: `codex/129-wearable-gear-assets`
- **목표**: 검·투구·갑옷·장갑·신발 기본형 10종씩 착용용 투명 아트를 제작해 캐릭터 몸에 맞게 표시하고, 장비창의 공백 없는 이름도 정확한 아이템 그림에 연결한다.
- **직접 수정 예정**: `public/assets/wearable/`, `src/game/items.ts`, `src/game/render.ts`, `src/game/render/entities.ts`, `scripts/verify-item-art.mjs`, 렌더·아이템 매핑 테스트. **간접 영향**: 장비창·장비 도감의 이미지 조회.
- **위험·충돌**: 주의(공용 아이템 표시·캐릭터 렌더링). 세이브·API 데이터 계약은 변경하지 않는다. 공개 진행 작업과 겹치는 기능은 없다.
- **완료 기준**: 50개 착용 아트가 슬롯별 프레임으로 검증되고, `낡은가죽두건`과 띄어쓴 이름 모두 같은 고유 프레임을 표시한다. 장비가 아이콘처럼 캐릭터 밖에 떠 보이지 않고, idle·이동·공격에서 본체에 부착된다. 타입 검사·테스트·빌드·diff 통과, PR 병합 및 Cloudflare Pages Production 확인.
- **완료**: 무기·투구·갑옷·장갑·신발 10종씩 투명 착용 프레임 50개를 생성하고 남녀 idle·이동·공격 렌더에 연결했다. 공백 없는 `낡은가죽두건` 이름을 인벤토리 및 착용 프레임에서 정규화한다. `pnpm run check`, 전체 258개 테스트, 프로덕션 빌드, `git diff --check` 통과. PR #54가 `efec6056dca698d17988c522830c6a790fb16ee4`로 main에 병합됐고 Cloudflare Pages Production `version.json`과 다섯 아트 이미지 HTTP 200을 확인했다. 화면 실기 확인은 별도다.

### [x] [작업 128] 장착 장비별 캐릭터 외형 적용
- **담당자**: `songduckjin`
- **브랜치**: `codex/128-equipped-gear-appearance`
- **목표**: 투구·갑옷·장갑·신발·검 장착 시 각 슬롯의 실제 장비 아트가 캐릭터에 반영되고, 남녀 및 공격 프레임에서도 장착 외형이 유지되게 한다.
- **직접 수정**: `src/game/render/entities.ts`, `tests/hero-weapon-render.test.mjs`, 공개·개인 작업 기록. **간접 영향**: Pixi 장비 레이어, `equipmentImage()`의 기존 아이템 아트 시트.
- **위험·충돌**: 주의(공용 캐릭터 렌더링). `public/assets/item-art/`에 다섯 슬롯의 기존 투명 장비 이미지가 있어 새 이미지 생성은 필요하지 않다. 공통 레이어 경로를 남녀 idle·walk·attack에서 교차 검증한다.
- **완료**: 각 슬롯의 실제 이미지 경로/프레임이 렌더링되고 아이템 교체 시 장비 레이어가 교체된다. 공격 프레임에도 장비가 유지된다. 남녀 렌더 회귀·타입 검사·256개 테스트·빌드 통과. PR #52 `a5db0e2` 병합, Cloudflare Production `version.json`에서 `a5db0e25387a`와 새 번들 HTTP 200 확인.

### [x] [작업 127] 공격 시트 옆 칸 잔상 제거
- **담당자**: `songduckjin`
- **브랜치**: `fix/attack-sheet-slicing`
- **목표**: 공격 모션에서 옆 프레임의 칼끝·발끝 조각이 캐릭터 옆에 남지 않게 한다. 4프레임 공격 시트는 포즈마다 서로 침범하지 않는 같은 폭의 칸으로 다시 패킹하고, 1포즈 단독 이미지는 4등분하지 않는다.
- **직접 수정**: `public/assets/warrior_{female_armored,female_armored_helm,female_armored_oldhelm,female_helm,female_oldhelm,male_helm}_attack.png`, `src/game/render.ts`, `src/game/render/entities.ts`, `tests/hero-art.test.mjs`, `tests/hero-weapon-render.test.mjs`. **간접 영향**: 공격 프레임 폭(높이 290 유지), 영웅 그림자 크기, 부팅 로딩 목록.
- **위험·충돌**: 주의(에셋). 시트 높이 290과 `heroScale.ts`의 포즈별 `heroBodyPx`는 그대로여서 캐릭터 크기는 변하지 않는다.
- **완료 기준**: 4칸 경계 알파 픽셀 0, 프레임별 옆 칸 조각 없음, 타입 검사·테스트·빌드 통과 후 PR 병합 및 Cloudflare Production 확인.

### [x] [작업 126] 접근 중 공격 피해 시점 보정
- **담당자**: `songduckjin`
- **브랜치**: `codex/126-stop-attacking-while-moving`
- **목표**: 자동 추격 중 캐릭터가 걷기 모션인 동안 공격·장착 스킬의 피해가 먼저 들어가지 않도록 한다. 추격을 멈춘 뒤 공격 모션과 피해가 함께 발생해야 한다.
- **직접 수정**: `src/game/world.ts`, `tests/world-movement.test.mjs`, 공개·개인 작업 기록. **간접 영향**: 자동 전투의 이동·공격 호출 순서, 수동 공격 입력.
- **위험·충돌**: 주의(전투 루프). 접근 상태의 공격 입력을 막되, 정지 상태 타격·피해량·쿨다운 동작과 아이템 추적은 유지한다. 공개 현황상 진행 중 겹치는 작업은 없다.
- **완료 기준**: 추격 중에는 HP·공격 효과·쿨다운이 변하지 않고, 접근을 멈춘 뒤 공격과 스킬이 정상 타격한다. 타입 검사·테스트·빌드 통과 후 PR 병합 및 Cloudflare Production 확인.

### [x] [작업 123] 기본 공격 검기 제거
- **담당자**: `songduckjin`
- **브랜치**: `codex/123-basic-attack-vfx`
- **목표**: 기본 공격의 빨간 검기와 기본 공격에만 딸린 발밑 연출을 제거하고, 무기 휘두름·피격 표시·공격 판정·스킬 이펙트는 유지한다.
- **직접 수정**: `src/game/render/vfx.ts`, `src/game/render/field.ts`, 공개·개인 작업 기록. **간접 영향**: `src/game/world.ts`의 `slash` 효과, `src/game/render/entities.ts`의 공격 모션, `src/ui/skillFeedback.ts`의 공격 피드백, `fxSlash`를 공유하는 `slash2` 스킬.
- **위험·충돌**: 주의(공용 렌더링). 진행 중인 다른 담당자의 렌더링 작업이나 열린 PR 없음. `slash` 효과 자체는 남겨 모션·피드백을 보존한다. 남녀·직업 분기 모두 동일한 렌더링 경로를 사용한다.
- **완료 기준**: 기본 공격은 검기·발밑 룬이 보이지 않고 `slash2` 등 스킬 연출은 유지한다. 타입 검사·테스트·빌드를 통과한 PR을 병합해 Cloudflare Production을 확인한다.

### [x] [작업 122] 레벨 배지로 캐릭터 선택
- **담당자**: `songduckjin`
- **브랜치**: `codex/122-level-character`
- **목표**: 다른 UI와 겹치는 우측 검 버튼을 제거하고 좌상단 레벨 배지로 캐릭터 선택창을 연다. 계정 정보는 기존 설정 메뉴에서 연다.
- **직접 수정**: `src/ui/hud.ts`, `src/ui/interface.ts`, `src/styles/hud.css`, 공개·개인 작업 기록. **간접 영향**: 캐릭터 선택창 진입, 계정 정보 진입, 모바일 HUD 터치 영역.
- **위험·충돌**: 주의(UI 연결). 공개 현황에서 다른 담당자의 HUD 작업은 완료 상태이고 열린 PR은 없다. DB·API·세이브 형식은 그대로 둔다.
- **완료 기준**: 레벨 배지의 접근성 이름과 클릭 동작을 캐릭터 선택으로 바꾸고 검 버튼을 제거한다. 타입 검사·테스트·빌드를 통과한 PR을 병합해 Cloudflare Production을 확인한다.

### [x] [작업 121] Cloudflare 단일 배포 정책
- **담당자**: `songduckjin`
- **브랜치**: `codex/121-cloudflare-only`
- **목표**: 이중 배포를 끝내고 GitHub `main`의 검증 버전을 Cloudflare Pages `djrpg`에만 운영 배포한다.
- **직접 수정**: `AGENTS.md`, 공개 작업·배포 기록, 이 작업지시서와 개인 작업 기록. **간접 영향**: 모든 후속 PR의 배포 검사, Cloudflare Production/Preview, Vercel Git 연결 및 기존 계정 로그인.
- **위험·호환성**: 핵심 공통 배포 정책. DB·API·세이브 형식은 변경하지 않는다. 기존 계정의 Cloudflare 로그인은 Vercel 경유 검증에서 오류가 나며, Vercel 삭제 후 이 경로는 사용할 수 없다. 사용자는 새 계정 사용을 선택했다. 기존 아이디는 DB에 남아 있으므로 새 아이디로 가입한다.
- **충돌·완료 기준**: 공개 현황과 열린 PR에서 이 정책 파일의 동시 수정은 확인되지 않았다. 정책 변경을 PR로 병합하고 Cloudflare Production을 확인한다. Vercel 자동 배포 연결 종료는 별도 외부 설정 결과로 기록한다.

### [x] [작업 119] Cloudflare Pages 운영 전환
- **담당자**: `songduckjin`
- **브랜치**: `task/119-cloudflare-pages`
- **목표**: 기존 API·세이브 계약을 보존하면서 Cloudflare Pages Functions로 전환한다.
- **직접 영향**: `functions/api/*`, `server/*` API 코어, `api/*` 어댑터, `wrangler.toml`, `package.json`, `pnpm-workspace.yaml`, 배포 기록 및 회귀 테스트. **간접 영향**: GitHub 빌드, Turso 연결, 로그인·저장·거래소·창고 요청.
- **위험·완료 기준**: 핵심 공통. `docs/TASK.md`의 공개 영향·호환성 계획에 따라 진행하며 타입 검사·테스트·빌드, Pages 실제 배포와 API 스모크를 완료한 뒤 상태를 갱신한다.

### [x] [작업 94] 캐릭터 선택·슬롯 및 신규 캐릭터 생성
- **담당자**: `songduckjin`
- **등록일**: 2026-11-17
- **브랜치**: `task/94-character-selection`
- **상태**: 최신 main 통합 후 타입 검사·208개 테스트·프로덕션 빌드·diff 검사 통과. 운영 DB 백업 사본 검증 완료, PR #24 병합·Production 배포 대기.

#### 목표
게임 화면 우측에 캐릭터 선택 아이콘을 추가하고, 클릭하면 캐릭터 선택 팝업에서 캐릭터 슬롯 3개를 보여준다. 빈 슬롯을 선택하면 신규 캐릭터 생성 화면으로 이동한다. 슬롯이 3개를 초과하는 경우 추가 슬롯은 좌우 슬라이드/스와이프 방식으로 탐색한다.

#### 작업 내용
1. **현행 구조 조사 및 영향 분석(우선 수행)**
   - `AGENTS.md`를 먼저 읽고, 기존 로그인·캐릭터 초기 생성·계정 조회/저장·세이브 직렬화/복원·동기화 흐름을 필요한 범위만 조사한다.
   - 현재 계정당 캐릭터가 하나인지, 다중 캐릭터 또는 캐릭터 생성 화면이 이미 존재하는지 확인한다.
   - 직접 수정 후보, 간접 영향 파일, DB/API/세이브 데이터 계약, 기존 사용자 데이터 마이그레이션 영향을 목록화한다.
   - 진행 중인 작업 및 PR과 파일·기능 의존성 충돌을 확인한다. 특히 작업 90·91·92 및 열린 PR #20·#23은 임의 수정하지 않는다.
2. **캐릭터 선택 UI**
   - 게임 화면 우측의 기존 HUD/메뉴와 겹치지 않는 위치에 캐릭터 선택 아이콘을 추가한다. 모바일 safe-area와 터치 영역을 고려한다.
   - 아이콘 클릭 시 기존 다크 판타지 UI와 일관된 캐릭터 선택 팝업을 표시한다.
   - 첫 화면에는 슬롯 3개를 표시하고, 각 슬롯은 캐릭터 초상/이름/직업 등 실제 데이터로 확인 가능한 정보를 표시한다. 현재 선택된 캐릭터는 명확히 강조한다.
   - 슬롯이 3개를 초과할 수 있는 구조라면 페이지 단위 좌우 슬라이드/스와이프를 지원한다. 아직 슬롯 최대 개수가 정해져 있지 않다면 임의로 무제한/유료 확장 등을 가정하지 말고 설정 가능하게 설계안을 제시한다.
   - 기존 캐릭터 슬롯을 선택하면 해당 캐릭터의 독립된 진행 데이터를 불러오도록 설계한다.
3. **빈 슬롯 및 신규 캐릭터 생성**
   - 빈 슬롯을 누르면 신규 캐릭터 생성 화면으로 이동한다.
   - 기존 캐릭터 생성/초기화 UI가 있으면 재사용 가능성을 우선 검토한다. 없다면 현재 게임에서 지원하는 직업·성별·외형 선택 범위를 조사해 화면 구성안을 제시한다. 지원하지 않는 직업/옵션을 임의로 추가하지 않는다.
   - 생성 완료 후 해당 슬롯에 캐릭터를 등록하고 선택 상태로 진입하는 흐름을 설계한다.
4. **데이터 및 하위 호환성 보호**
   - 기존 단일 캐릭터 계정은 기존 캐릭터를 슬롯 1로 보존하는 비파괴 마이그레이션을 기본 원칙으로 한다.
   - 캐릭터별 데이터는 레벨·경험치·층/진행도·인벤토리·장비·스킬·퀘스트·캐릭터별 설정 등으로 분리하고, 캐릭터 전환 시 서로 섞이거나 덮어쓰이지 않도록 독립 저장 경계를 설계한다.
   - **골드는 계정 공용 자산**으로 관리한다. 어느 캐릭터로 접속하더라도 동일한 골드 잔액을 조회·사용하며, 캐릭터별 SaveData에 골드를 중복 저장하지 않도록 현행 구조와 마이그레이션 방안을 분석한다.
   - **공용창고는 계정 단위**로 관리한다. 모든 캐릭터가 동일한 보관함을 조회하고 아이템을 넣거나 꺼낼 수 있어야 한다. 캐릭터 인벤토리와 공용창고 간 이동은 서버 측에서 원자적으로 처리해 중복 복제·유실을 방지한다.
   - **거래소는 캐릭터를 바꾸어도 동일한 거래소 데이터와 상태를 조회**하도록 한다. 거래소의 기존 공개 범위(게임 전체/계정 범위)는 현행 구현을 조사해 유지하고, 범위 변경이 필요하면 별도 설계·승인을 받는다.
   - 공용 골드·창고·거래소 변경은 동시 요청, 저장 충돌, 중복 요청 및 캐릭터 전환 중 상태 일관성을 고려한다. 캐릭터 삭제 시 계정 공용 자산은 삭제되지 않도록 한다.
   - DB 스키마, API 요청/응답, 계정 식별, 세이브 포맷/동기화 등 핵심 데이터 계약을 변경해야 한다면 코드 수정 전에 변경안·마이그레이션·롤백·하위 호환성 계획을 보고하고 사용자 명시 승인을 기다린다. 승인 전에는 해당 계약을 변경하는 코드나 마이그레이션을 작성·적용하지 않는다.
5. **기록 및 검증**
   - 영향 분석 결과와 제안하는 데이터 모델/화면 흐름을 먼저 보고한다.
   - 승인된 범위만 구현하고 관련 단위/통합 테스트를 추가한다.
   - `pnpm run check`, `pnpm test`, `pnpm run build`, `git diff --check`를 실행한다.
   - 브라우저 실기 조작, Playwright/헤드리스 브라우저, Computer Use는 별도 요청 없이는 실행하지 않는다.
   - 완료 후 개인 작업 기록은 `docs/WORKLOG_songduckjin.md`에 남기고 공개 진행 현황은 `docs/TASK.md`에서 갱신한다.

#### 완료 기준
- 우측 캐릭터 선택 아이콘과 3개 슬롯 팝업이 기존 HUD와 충돌 없이 동작한다.
- 슬롯 3개 초과 시 좌우 슬라이드/스와이프 탐색이 가능하다(최대 슬롯 정책이 승인된 경우).
- 빈 슬롯에서 신규 캐릭터 생성 화면으로 진입하고, 생성 후 해당 캐릭터를 선택할 수 있다.
- 캐릭터 전환 시 각 캐릭터의 저장 데이터가 독립적으로 유지되고 기존 계정 데이터가 보존된다.
- 타입 검사·테스트·프로덕션 빌드·diff 검사를 통과한다.
- 핵심 데이터 계약 변경은 사용자 승인 이후에만 진행한다.

### [x] [작업 144] 코스튬 동작 싱크 및 아틀라스 캐시 제한
- **담당자**: `songduckjin` · **브랜치**: `codex/144-costume-sync-perf` · **위험 등급**: 중 · **상태**: `[x]` 구현·검증 완료, PR #87
- **추가 범위(2026-11-19 실기 보고)**: 무기가 머리 위까지 돌출되는 크기와 `낡은 투구`의 다른 모양·열린 얼굴을 수정한다. 원인 조사 결과 v3 PNG 재생성 없이 공용 외형 계획·기존 통합 본체 폴백으로 해결할 수 있어 수정 파일을 `src/game/appearance.ts`, `src/game/render/costumeHero.ts`, `src/ui/equipmentPortrait.ts`, 관련 테스트·문서로 좁혔다. v3 에셋과 매핑·Save 계약은 유지한다.
- **목표**: 코스튬 설계의 스킬 회전 규칙과 실제 렌더링을 일치시키고, 필드·장비창 아틀라스 이미지 캐시의 메모리 증가를 제한한다.
- **수정 예정 파일**: `src/game/render/heroMotion.ts`, `src/game/render/entities.ts`, `src/game/render/costumeHero.ts`, `src/ui/equipmentPortrait.ts`, `tests/hero-motion.test.mjs`, `tests/costume-field-render.test.mjs`, `tests/equipped-detail.test.mjs`, `docs/COSTUME_SYSTEM.md`, `docs/CODE_MAP.md`, `docs/QUICK_PATCH.md`, `docs/TASK.md`, `docs/TASK_songduckjin.md`, `docs/WORKLOG.md`, `docs/TASK_ARCHIVE.md`.
- **구현 항목**:
  1. `spin` 스킬은 본체를 360° 회전시키지 않고 회오리·잔상 이펙트로 표현한다. 필드 코스튬·기존 바디 폴백 양쪽에서 본체 회전이 없는지 테스트한다.
  2. 필드 아틀라스 텍스처·셀 캐시에 상한을 두고, 현재 장비에 필요한 페이지는 고정한 채 오래된 페이지를 안전하게 해제한다. 사용 중인 스프라이트의 텍스처를 먼저 분리하고 Pixi 자산 캐시와 GPU 리소스까지 해제한다.
  3. 장비창 아틀라스 이미지 캐시에도 상한을 둔다. 현재 합성 중인 페이지가 축출되지 않도록 하고 초상화 결과 LRU(24)는 유지한다.
  4. 페이지 수·RGBA 텍스처의 상한 메모리를 산출해 기록한다. 실제 모바일 FPS·GPU 메모리를 측정하지 않았다면 실측값으로 기재하지 않는다.
- **금지**: `world.ts`, Save·DB/API, 코스튬 아틀라스·매니페스트 에셋, 아이템 매핑 변경. 사용자 요청 없이 브라우저 실기·Playwright·Computer Use를 실행하지 않는다.
- **검증**: `node node_modules/typescript/bin/tsc --noEmit`, `node --test tests/hero-motion.test.mjs tests/costume-field-render.test.mjs tests/costume-manifest.test.mjs tests/equipped-detail.test.mjs`, `node scripts/verify-item-art.mjs`, `git diff --check`.
- **완료 기준**: 스킬 회전 정책과 두 필드 렌더 경로가 일치하고, 페이지 캐시가 명시된 상한을 넘지 않으며, 축출된 GPU 텍스처를 보유한 참조가 없다. 관련 회귀 검증과 메모리 상한 근거를 기록한다.
- **검증 결과**: `tsc --noEmit`, 관련 Node 테스트 86건, `verify-item-art.mjs`, `git diff --check` 통과. 메모리 산정은 6×1872×1936 RGBA = 약 82.97 MiB이며, 모바일 FPS/GPU 메모리 실측은 하지 않았다. PR #87: https://github.com/songduckjin/DJRPG/pull/87.
- **실기 보고 후 최종 검증**: 무기 70% 축소·손잡이 고정, `낡은 투구` 닫힌 바이저 폴백, 기존 페이지 해제를 추가했다. TypeScript 검사·관련 Node 테스트 86건·아트 검증·diff 검사를 통과했고 정지 셀 전후 합성을 확인했다. 수정 후 모바일 실기 화면은 아직 확인하지 않았다.

### [x] [작업 138] 코스튬 도구 비교 및 최소 뷰어 프로토타입
- **담당자**: `songduckjin` · **브랜치**: `task/138-costume-prototype` · **위험 등급**: 중 · **상태**: `[x]` 완료(PR #74) · **착수**: 2026-11-18(작업 137 PR #73 병합 후 `origin/main` 기준)
- **완료 결과(2026-11-18)**: `tools/costume-viewer/` 독립 뷰어에 본체 파츠(머리·몸통·양팔·다리)·갑옷·투구·무기 2종을 조립했고, 걷기 8프레임·프레임 이동·좌우 반전·앵커 표시·레이어 토글을 화면에서 확인했다. **가림 방식(파츠 숨김 vs 파츠 교체)** 을 `model.ts` `partPlan`·`coverModeNote`와 화면 토글로 구현하고 단위 테스트 5건을 추가했다(기존 3건 + 5건 = 8건 통과). **정량 비교**는 3종(Spine 4.3.13 · DragonBones · 자체 PixiJS 레이어)의 npm 크기·esbuild 번들 증가·Draw Call·데스크톱/모바일 뷰포트 FPS·JS 힙을 실측·추정·미측정으로 구분해 `TOOL_COMPARISON.md` §1에 남겼다. 결론은 **자체 PixiJS 레이어 + 파츠 교체 채택**, Spine 보류(Editor 라이선스·스켈레탈 재제작), DragonBones 미채택(PixiJS 8 어댑터 없음).
- **검증 결과**: 루트·뷰어 `tsc --noEmit` 통과, `node --test tools/costume-viewer/model.test.mjs` 8건 통과, `node scripts/verify-item-art.mjs` 통과, `git diff --check` 통과. Vite + Chromium(WebGL2) 실측에서 콘솔 오류 0건·페이지 오류 0건, 프레임 0~7 렌더(고유 화면 5종 — 4포즈 주기 반복), 자동 재생·무기 전환·좌우 반전·본체/보조/가림 토글이 모두 화면 변화로 확인됐다.
- **남긴 제약**: 모바일 실기 미측정(모바일 뷰포트 24.9fps는 SwiftShader 소프트웨어 GL이라 실기 판정에 쓰지 않는다). Spine 대조 구현이 없어 Spine·DragonBones의 FPS·Draw Call·메모리는 미측정이다. 로컬 루프백 주소는 `browser_*` 도구가 차단해 같은 Chromium 엔진을 Playwright로 구동해 실측했다.
- **목표**: 본체 파츠와 장비 1종의 걷기 8프레임을 실제 화면에서 검증하고 스켈레탈 도구와 자체 PixiJS 레이어 방식 중 적합한 구조를 결정한다.
- **수정 파일**: `tools/costume-viewer/**`(신규 — `model.ts`·`main.ts`·`model.test.mjs`·`index.html`·`tsconfig.json`·`README.md`·`TOOL_COMPARISON.md`·`assets/*.svg` 10장), `docs/COSTUME_SYSTEM.md`(§4·§5 실측 근거 1줄씩), `docs/CODE_MAP.md`·`docs/TASK.md`·`docs/TASK_songduckjin.md`·`docs/TASK_ARCHIVE.md`·`docs/WORKLOG.md`. 게임 코드(`src/**`)·Save/API·기존 운영 에셋은 변경하지 않았다.
- **1단계 — 도구 비교(결과)**: Spine 공식 PixiJS v8 런타임은 peer `pixi.js ^8.16.0`으로 현행 8.23.0과 호환되나 Editor 라이선스(Essential 정가 $99)와 스켈레탈 재제작이 필요하다. DragonBones는 PixiJS 8 어댑터가 없다(`dragonbones-pixi` 5.6.0은 PixiJS 4 타입 의존). 자체 PixiJS 레이어는 추가 번들 0B·장면 전체 Draw Call 1회/프레임·데스크톱 60fps로 확인됐다. 선택 전후로 `package.json`·lockfile·PixiJS 버전은 변경하지 않았다.
- **2단계 — 최소 뷰어(결과)**: 본체를 머리 포함 몸통/팔/다리로 시작했으나 가림 검증에서 머리 분리가 필요해 **머리/몸통/양팔/다리 4파츠**로 나눴다. 무기 이미지 1장을 hand_main 앵커에 부착하고 걷기 8프레임 재생·수동 프레임 이동·좌우 반전·앵커 표시·본체/장비/보조 레이어 On/Off를 지원한다. 피벗은 발바닥 중앙 `(0,0)`이고 최대 동작 캔버스는 한 손 검 183×213px·대검 234×242px로 측정됐다. 투구·갑옷을 입힌 상태에서 가림 방식을 두 모드로 전환해 비교했다: 숨김은 몸통 파츠가 사라져 어깨·옆구리에 틈이 생겼고, 교체는 실루엣이 유지됐다.
- **3단계 — 제작량 검증(결과)**: 한 손 검·대검 공격 자세를 같은 갑옷 이미지로 비교해 자세별 회전·손 위치 차이만 있음을 확인했다(프레임 재사용은 미검증). 투구·망토·신발의 attach·Z-order는 뷰어 레이어 순서로 확인했다. 네 스킬 템플릿(베기·회전·내려찍기·발동 자세)은 자세·이펙트 동기화용 초기 템플릿이며 실제 스킬 아트가 아니다.
- **금지 범위(준수)**: `src/game/render/**`, `src/game/appearance.ts`, `src/game/store.ts`, `server/**`, `src/ui/**`, 기존 운영 에셋 삭제·대체, Save/API 변경 — 모두 건드리지 않았다. 실제 게임 렌더러 전환은 `[작업 140]`으로 넘긴다.
- **PR #72 연계**: UI 레이아웃 변경은 재사용 후보로 보존하고, 기존 초상화 구현을 최종 외형 계획으로 고정하지 않았다.
- **완료 기준(충족)**: 도구 비교표·선택 근거, 걷기 8프레임 앵커 검증, **가림 방식 검증 결과**, 갑옷 재사용 조합, 제작량 계산, v1.1 변경 목록을 `TOOL_COMPARISON.md`에 남겼고 정량 수치를 표로 기록했다.

### [x] [작업 139] 코스튬 스펙 v1.1 확정 및 런타임 매니페스트·아이템 매핑 구현
- **담당자**: `songduckjin` · **브랜치**: `task/139-costume-manifest` · **위험 등급**: 중 · **상태**: `[x]` 검증 완료
- **완료 결과(2026-11-18)**: `src/game/costume/**`(신규 — `mapping.ts`·`manifest.ts`·`skillMotion.ts`·`index.ts`)에 매니페스트 타입·스키마 검증·1회 로드 캐시, `baseItems` 고유 이름 75종 매핑(55종 `costumeId`·20종 명시적 `"none"`), 폴백 4경로, 캐시 버스터 URL, 액티브 8종 스킬 템플릿 매핑을 구현하고 `tests/costume-manifest.test.mjs` 14건으로 고정했다. `docs/COSTUME_SYSTEM.md`를 v1.1로 확정(파츠 교체·자체 PixiJS 레이어·피벗 `(0,0)`·캔버스 후보·§3.3 매핑표·§7.1 런타임 계약)했고 매니페스트 필드는 §7 7개에서 늘리지 않았다. 게임 화면·Save·DB/API·`render/**`·`ui/**`·`store.ts` 무변경. `npx tsc --noEmit`, 테스트 14건, `git diff --check` 통과. **PR #76**(`task/139-costume-manifest`).
- **선행 조건**: `[작업 138]`(PR #74, `task/138-costume-prototype`)이 검증·병합되어 도구 비교표와 v1.1 변경 목록이 확정된 뒤 `origin/main` 기준으로 착수한다. 139는 138이 만든 뷰어 결과를 게임 런타임 데이터 계층으로 옮기는 단계이며 `tools/costume-viewer/**`는 게임 코드가 아니다.
- **목표**: 138 결과를 `docs/COSTUME_SYSTEM.md` v1.1로 확정하고, 게임 런타임에서 `items.ts`의 장비 이름을 `costumeId`로 매핑하는 계층과 매니페스트 로더·폴백을 신규 `src/game/costume/**`에 구현한다. **이 작업에서는 게임 화면이 바뀌지 않는다**(렌더러 미연결).
- **수정 예정 파일**: `src/game/costume/**`(신규 — 매니페스트 타입·로더·아이템↔`costumeId` 매핑·폴백), `tests/costume-manifest.test.mjs`(신규), `docs/COSTUME_SYSTEM.md`(v1.1), `docs/CODE_MAP.md`·`docs/QUICK_PATCH.md`(신규 모듈 1줄씩). **건드리지 않음**: `src/game/render/**`, `src/game/render.ts`, `src/game/appearance.ts`, `src/game/store.ts`, `server/**`, `src/ui/**`, `public/assets/**`, `src/game/items.ts`(아래 export 추가 예외 외).
- **구현 항목**:
  1. **v1.1 확정**: 138에서 실측으로 확인된 사실(캔버스 크기·발 피벗 보정값·가림 방식·도구 선택)만 반영한다. 확인되지 않은 필드는 늘리지 않는다(`COSTUME_SYSTEM.md` §7 매니페스트 초기 범위 유지).
  2. **아이템 이름 → `costumeId` 매핑**: `items.ts` `baseItems`의 고유 장비 이름 **75종**(10개 슬롯, `ring1`·`ring2`는 같은 5종을 공유하므로 중복 제외)을 매핑표로 만든다. 대조 규칙은 `baseItemIndex`와 같은 **NFKC 정규화 + 공백·제로폭 문자 제거 + 완전일치/`endsWith`** 를 재사용하고, 레거시 `'낡은 투구'` → `'심연의 뿔투구'` 같은 예외를 표에 명시한다. `items.ts`는 **export 추가만** 허용하고 기존 시그니처·동작을 바꾸지 않는다.
  3. **매니페스트 로더**: 매니페스트 JSON을 1회 로드 → 검증(`schemaVersion`·`costumeId`·`slot`·`animMode`·`anchor` 필수) → 메모리 캐시. Pixi·DOM에 의존하지 않는 순수 모듈로 두어 Node 테스트에서 검증한다.
  4. **폴백 4경로**: ① 매니페스트 없음 ② JSON 파싱 실패 ③ `costumeId` 미매핑 ④ 아틀라스 로드 실패 — 네 경우 모두 본체가 사라지지 않고 기본 외형으로 그려져야 한다(§8 안전장치). ④는 렌더러 연결 전이라 계약(반환 타입·폴백 플래그)만 정의한다.
  5. **캐시 버스터**: 매니페스트·아틀라스 URL을 한 상수에서 만들고 버전 경로 또는 `?v=N`을 붙인다. `public/_headers`가 `/assets/*`를 `immutable`로 고정하므로 기존 URL 재사용은 금지(§6.2·§8).
  6. **스킬 모션 템플릿 매핑표 확정**: `skills.ts`의 액티브 스킬 8종(`skills` 레코드 키 전체 — `slash2`·`spin`·`crushing`·`slam`·`warcry`·`power`·`destroy`·`hell`)을 4대 템플릿에 매핑해 v1.1 표로 확정한다. 아래는 잠정안이며 138 뷰어 확인 결과와 `skillDuration`을 근거로 139에서 확정한다. 패시브 3종(`mastery`·`body`·`instinct`)은 모션이 없어 매핑에서 제외한다.

     | 스킬 ID | 스킬명 | 잠정 템플릿 | 근거 |
     |---|---|---|---|
     | `slash2` | 휘두르기 | 베기 | 전방 1회 휘두름 |
     | `power` | 파워 스트라이크 | 베기 | 좁은 전방 1격 |
     | `destroy` | 디스트로이 스윙 | 베기 | 전방 검기 발사(발사 자세) |
     | `spin` | 드래곤 트위스터 | 회전 | 회오리·잔상 중심(본체 360° 회전 없음) |
     | `crushing` | 딜레이 크러싱 | 내려찍기 | 지연 폭발을 예고하는 내려찍기 |
     | `slam` | 와일드 스탬프 | 내려찍기 | 지면 강타·균열 |
     | `warcry` | 블러드 레이지 | 발동 자세 | 6초 버프 발동 |
     | `hell` | 헬 파이어 소드 | 발동 자세 | 대검 폭발 발동 |

     - 4종으로 표현되지 않는 스킬이 확인되면 템플릿을 늘리지 말고 먼저 보고한다(§3.3).
- **검증**: `npx tsc --noEmit`, `node --test tests/costume-manifest.test.mjs`(75종 매핑 완전성·이름 대조 예외·폴백 4경로·매니페스트 검증 실패 처리·캐시 버스터 URL·스킬 8종 매핑표), `git diff --check`, `git diff --stat`으로 `render/**`·`ui/**`·`store.ts` 무변경 확인. 전체 `npm test`·`npm run build`는 렌더·UI 계약을 건드리지 않으므로 실행하지 않는다.
- **완료 기준**: `COSTUME_SYSTEM.md`가 v1.1로 갱신되고 §7 범위 안에서만 필드가 늘어 있다. `src/game/costume/**`가 매니페스트 로드·검증·폴백·아이템 매핑을 제공하고 75종 전부가 `costumeId` 또는 "코스튬 없음"으로 명시된다. 스킬 8종 매핑표가 문서에 남고 4종 템플릿으로 덮인다. 게임 화면·Save·DB/API는 변하지 않는다.
- **동시 작업 확인**: 등록 시점(2026-11-18, `main` = `6402d79`) `docs/TASK.md`의 다른 작업은 `[작업 136]`(PR #72 Draft)과 `[작업 138]`(PR #74 Draft)이며, 139~142는 순차 진행이라 파일이 겹치지 않는다.

### [x] [작업 140] 본 게임 필드 렌더러 독립형 코스튬 전환
- **담당자**: `songduckjin` · **브랜치**: `task/140-costume-field-renderer` · **위험 등급**: 상 · **상태**: `[x]` 검증 완료
- **완료 결과(2026-11-18)**: `src/game/render/costumeHero.ts`(신규)가 `planCostume()`·`resolveSkillMotion()`을 소비해 본체 3파츠 + 장비 레이어(파츠 교체·`zOrder`·`anchor`/`fit`)를 그리고, `entities.ts` `drawHero`가 **코스튬 모드 → 기존 통합 바디·무기 소켓 폴백** 순서로 그린다. 매니페스트·아틀라스가 없는 지금은 매 프레임 폴백하며 캐릭터가 사라지지 않는다. 모션은 대기·걷기 8프레임·기본 공격·스킬 4템플릿(`slash`/`spin`/`smash`/`cast`)이고, 공격 속도는 월드 쿨다운의 역수(상한 3배)로 시각 재생 배율에만 쓴다. 그림자(`costumeBodyPx` 기준)·잔상(레이어 전체 복제)·피격 tint는 두 경로가 같은 값을 쓴다. 남/여 동일 경로. **PR #79**(`task/140-costume-field-renderer`).
- **검증**: `npx tsc --noEmit`, `node --test tests/costume-field-render.test.mjs`(신규 16건) + `tests/costume-manifest.test.mjs tests/appearance.test.mjs tests/hero-motion.test.mjs tests/hero-art.test.mjs tests/hero-weapon-render.test.mjs`, 전체 `node --test tests/*.test.mjs` **303건 통과**, `node scripts/verify-item-art.mjs`, `git diff --check`. `git diff --stat`로 `src/game/world.ts`·`store.ts`·`server/**`·`src/ui/**`·몬스터·NPC 렌더 경로 무변경 확인.
- **대표 장면 기록(1회)**: 로컬 Vite + Chromium(SwiftShader 소프트웨어 GL), 412×892 DPR1, 자동사냥 3층. 폴백(남/여) = 캐릭터·그림자 정상 표시, 화면 전체 draw call 7~9/프레임, 콘솔 오류 1건(개발 서버가 없는 매니페스트 경로에 SPA fallback HTML을 줘 `manifest-parse` → 폴백). 코스튬 모드(합성 아틀라스 주입) = 레이어 8개·통합 바디 숨김·드로우 콜 동일(7)·콘솔 오류 0건. FPS는 소프트웨어 GL이라 절대값이 의미 없고(5.2~5.4), 폴백/코스튬이 같았다.
- **새 계약**: 아틀라스 셀 `234×242`·8×8=64칸/페이지·변형당 32칸(페이지당 변형 2개)·프레임 슬롯 표는 `docs/COSTUME_SYSTEM.md` §7.2. 142는 이 규약으로 팩킹한다.
- **선행 조건**: `[작업 139]` 완료(매니페스트·아이템 매핑 모듈이 main에 있음). 140은 실제 플레이 화면을 바꾸는 첫 작업이므로 139의 매니페스트 계약을 그대로 소비하고 계약을 바꾸지 않는다.
- **목표**: `src/game/render/entities.ts`, `src/game/render.ts`, `src/game/render/heroMotion.ts`, `src/game/render/heroScale.ts`, `src/game/render/heroSockets.ts`를 독립형 코스튬 렌더러로 전환해 실제 게임 필드에 적용한다.
- **수정 예정 파일**: 위 5개 파일, `AGENTS.md`, `docs/CODE_MAP.md`, `docs/QUICK_PATCH.md`, `tests/hero-motion.test.mjs`, `tests/hero-weapon-render.test.mjs`, `tests/hero-art.test.mjs`, `tests/appearance.test.mjs`. **건드리지 않음**: `src/game/world.ts`(상태 값 소비만), `src/game/store.ts`, `server/**`, `src/ui/**`([작업 141] 영역), 몬스터·NPC 렌더 경로.
- **핵심 요구**:
  1. `world.ts` 상태(대기·걷기·기본 공격·스킬 4종)를 코스튬 렌더러의 모션 선택에 1:1로 연결한다.
  2. 공격 속도 배율에 따른 시각 재생 배율을 적용하되 전투 판정·월드 위치는 렌더러가 바꾸지 않는다(§3.3).
  3. 그림자 반경(`heroBodyHeight` 기준), 잔상(`updateAfterimages`), 피격 연출을 기존과 호환되게 유지한다.
  4. 남/여 동시 검증 — 두 성별이 같은 코드 경로를 통과한다.
  5. 에셋·매니페스트 로드 실패 시 기본 본체 폴백(§8). 캐릭터가 사라지는 프레임이 없어야 한다.
  6. 몬스터·NPC 렌더링은 현행 유지.
  7. `AGENTS.md`·`CODE_MAP.md`·`QUICK_PATCH.md`에 신규 렌더 경로와 파일 위치를 갱신한다.
- **검증**: `npx tsc --noEmit`, `node --test tests/appearance.test.mjs tests/hero-motion.test.mjs tests/hero-art.test.mjs tests/hero-weapon-render.test.mjs`, `node scripts/verify-item-art.mjs`, `git diff --check`. 모바일 실기 FPS·Draw Call 측정은 142에서 최종 프로파일링하되, 이 작업에서도 대표 장면 1회를 기록한다.
- **완료 기준**: 필드 캐릭터가 독립형 코스튬 렌더러로 그려지고 대기·걷기 8프레임·기본 공격·스킬 4종이 모두 재생된다. 공격 속도 배율·그림자·잔상·피격 연출이 기존과 같게 동작하고 남/여 모두 확인된다. 로드 실패 시 기본 본체로 폴백한다. 몬스터·NPC 화면은 변하지 않는다. 타입 검사·관련 테스트·이미지 검증·diff 검사 통과 후 PR 병합.

### [x] [작업 141] 장비창(내 정보) 공용 외형 연동
- **담당자**: `songduckjin` · **브랜치**: `task/141-costume-ui-sync` · **위험 등급**: 중 · **상태**: `[x]` 검증 완료
- **완료 결과(2026-11-18)**: `src/ui/equipmentPortrait.ts`가 필드와 **같은 공용 계획** `planHeroCostume()`(작업 140)을 소비해 본체 3파츠 + 장비 레이어를 **idle 0프레임**으로 합성한다. UI 전용 `fit` 좌표 표·`wearableEquipmentImage` 5부위 덧그리기·`tightFrame` 픽셀 스캔·`starter` 분기는 코드에서 모두 제거했다. 필드와 미리보기의 차이는 정지 1프레임뿐이라는 근거를 모듈 주석과 `docs/COSTUME_SYSTEM.md` §7.3에 남겼다.
- **136 UI 통합**: PR #72(`task/136-unified-equip-ui`, Draft)는 **직접 병합하지 않고** 그 브랜치를 141에 병합해 `내 정보` 3탭 통합·`statusModal.ts` 제거·`accountModal.ts` 성별 고정·요약 6스탯+5×2 장비 10칸+가방 레이아웃·`modals.css`/`hud.css` 개편·`tests/equipment-info.test.mjs`를 가져왔다. 충돌은 최신 `main`(월드보스 진입 버튼·`worldBoss` 모달) 쪽 UI를 유지하며 해소했다. 136의 초상화 팔레트 틴트는 `src/game/render/gearTint.ts` 수정을 요구하므로 **가져오지 않았고**(140 계약 유지), 티어 초상화는 폴백 전용으로 남겼다.
- **폴백**: 매니페스트 없음/파싱 실패/`costumeId` 미매핑/아틀라스 페이지·셀 실패 → 136의 티어별 전신 초상화(`warrior_equipped_{starter|t2|t3|t4}_{gender}.png`, 갑옷+투구일 때) 또는 `heroAppearance().portrait`로 표시한다. 매니페스트 실패는 세션 동안 재요청하지 않고, 실패한 아틀라스 페이지도 1회만 기록한다.
- **캐시**: dataURL LRU **24** 유지, 합성 중 동일 요청 1회, 매 렌더 픽셀 스캔 없음.
- **에셋 결론(문서)**: `warrior_equipped_t{2,3,4}_{male,female}.png` 6장은 **폴백 자산으로 유지**하고, 실물 아틀라스가 동작하는 것을 142에서 확인한 뒤 참조 0 검사를 거쳐 142의 삭제 후보로 정리한다(`docs/COSTUME_SYSTEM.md` §7.3).
- **검증**: `npx tsc --noEmit` 통과, `node --test tests/equipped-detail.test.mjs tests/appearance.test.mjs tests/modal-ui.test.mjs tests/costume-manifest.test.mjs tests/costume-field-render.test.mjs tests/equipment-info.test.mjs` **71건 통과**, 전체 `tests/*.test.mjs` **338건 통과**(회귀 없음), `git diff --check` 통과, `git diff --stat`으로 `src/game/render/**`·`src/game/store.ts`·`server/**` 무변경 확인.
- **선행 조건(당시)**: `[작업 140]` 완료. **PR #72(`[작업 136]`)** 처리와 연계 — 136의 UI 레이아웃 개편이 main에 미병합이었으므로 136 레이아웃을 통합한 뒤 연동했다(136 PR 자체는 병합하지 않음).
- **목표**: `src/ui/equipmentPortrait.ts`를 필드와 **동일한 공용 코스튬 외형 계획**으로 통합하고 임시·종이인형 경로를 제거한다.
- **수정 예정 파일**: `src/ui/equipmentPortrait.ts`, `src/ui/modals/equipModal.ts`(필요 시), `tests/equipped-detail.test.mjs`, `docs/CODE_MAP.md`·`docs/QUICK_PATCH.md`. **건드리지 않음**: `src/game/render/**`(140 계약 유지), `src/game/store.ts`, `server/**`.
- **구현 항목**:
  1. 장비창 미리보기가 필드와 같은 외형 계획(매니페스트·`costumeId`·파츠 정의)을 조회해 그린다. 별도 `fit` 좌표 표·`wearableEquipmentImage` 덧그리기 같은 임시 경로는 제거한다.
  2. 필드와 미리보기의 차이는 **정지 1프레임**뿐이며, 다른 점은 코드에 주석으로 근거를 남긴다.
  3. 136이 남긴 티어별 전신 초상화 에셋(`public/assets/warrior_equipped_t{2,3,4}_{male,female}.png`)을 계속 쓸지 공용 외형 계획으로 대체할지 결론을 문서에 남긴다. 대체하면 그 에셋은 142의 정리 후보에 넣는다.
  4. 캐시: 새 경로도 기존 LRU 상한을 지키고 매 렌더 `getImageData`를 하지 않는다.
- **검증**: `npx tsc --noEmit`, `node --test tests/equipped-detail.test.mjs tests/appearance.test.mjs tests/modal-ui.test.mjs`, `git diff --check`.
- **완료 기준**: 장비창 중앙 미리보기가 필드와 같은 공용 외형 계획을 쓰고 임시·종이인형 경로가 코드에 남아 있지 않다. 착용 장비를 바꾸면 미리보기가 즉시 바뀌고, 136의 장비 상세 팝업·가방 동작은 그대로다. 남/여 모두 확인된다.

### [x] [작업 142] 코스튬 에셋 양산·아틀라스 패킹 및 레거시 리소스 정리
- **담당자**: `songduckjin` · **브랜치**: `task/142-costume-atlas-cleanup` · **위험 등급**: 중 · **상태**: `[x]` 완료
- **완료 결과(2026-11-18)**: `public/assets/costume/v2/`에 매니페스트 55종과 아틀라스 60장(총 39MB, 페이지 1872×1936 = 셀 `234×242` 8×8)을 배포하고 `COSTUME_ASSET_VERSION = 2`로 올렸다. 생성기 `scripts/build-costume-atlas.py`(Python 3.12·Pillow)가 기존 2.5D 시트를 본체 높이 190px·실루엣 중심 x·발끝 피벗으로 정규화해 30프레임 × 55변형 × 남/여를 패킹한다. 장비 페이지도 성별 접미사(`armor-male`…)를 쓴다(갑옷이 전신 그림이라 남/여 혼용 불가). 참조 0을 확인해 구형 걷기 시트 5장(`walk8_armored`·`walk8_armored_nohelm`·`walk8_female_armored_{helm,nohelm,oldhelm}`)과 `icons/nav_status_v2.png`를 삭제했고, 폴백 참조가 남은 `warrior_equipped_*` 8장·통합 바디 시트·`heroSockets.ts`·`tools/costume-viewer/`는 유지 목록으로 남겼다. 검증: `npx tsc --noEmit`, `node scripts/verify-item-art.mjs`, 전체 `npm test` 355건, `npm run build`, `git diff --check` 통과. 상세 제작 규칙·남은 한계는 `docs/COSTUME_SYSTEM.md` v1.4 §7.4.
- **선행 조건**: `[작업 141]` 완료(2026-11-18). 140·141이 공용 외형 계획으로 실제 동작하는 상태에서만 레거시를 지운다(§2·§8: 참조 검사 없는 삭제 금지).
- **정리 후보(2026-11-18, 141 결론)**: 136의 티어별 전신 초상화 `public/assets/warrior_equipped_t{2,3,4}_{male,female}.png` 6장(각 720px, 합계 355KB)은 지금은 장비창 **폴백 자산**이다. 실물 아틀라스·매니페스트가 배포되어 141 미리보기가 코스튬 합성으로 그려지는 것을 확인한 뒤, `src/`·`tests/`·`scripts/` 참조 0을 검사해 삭제 후보로 처리한다. 실물 확인 전에는 삭제하지 않는다(삭제하면 미리보기 폴백이 빈 화면이 된다).
- **필수(2026-11-18 추가, 작업 140 실측)**: 140 배포분이 없는 매니페스트 경로 요청으로 `/assets/costume/v1/manifest.json`에 SPA fallback HTML을 `200 immutable`로 받아 사용자 브라우저에 **v1 URL이 캐시**됐다. 첫 실물 에셋은 `COSTUME_ASSET_VERSION`을 **2**로 올려 `/assets/costume/v2/...`로 배포하고, `/version.json`과 함께 매니페스트·아틀라스 HTTP 200(content-type `application/json`·`image/png`)을 확인한다.
- **목표**: 실물 코스튬 에셋 양산 → 아틀라스 패킹 → 모바일 실기 GPU/메모리 프로파일링 → 전체 참조 검사 → 구형 통합 바디 시트·`tools/costume-viewer` 임시 에셋·미사용 레거시 코드를 **안전하게** 삭제.
- **수정 예정 파일**: `public/assets/**`(코스튬 아틀라스 PNG·매니페스트 JSON 신규/교체), `tools/costume-viewer/**`(임시 에셋 정리), 레거시 코드(참조 0 확인 후), `scripts/verify-item-art.mjs`(아틀라스 검증 추가 시), `docs/CODE_MAP.md`·`docs/QUICK_PATCH.md`·`docs/TASK_ARCHIVE.md`.
- **작업 내용**:
  1. **실물 에셋 양산**: 138·139에서 확정한 규격(캔버스·피벗·extrude)으로 본체 3영역 + 무기 계열 2종 + 갑옷·투구 대표분을 만든다. 제작 도구·버전·원본을 기록한다(§6.3).
  2. **아틀라스 패킹**: 2048×2048 목표, 1~2px extrude, 같은 캐릭터가 함께 쓰는 리소스를 한 아틀라스로 묶는다. 4096은 실기 상한 측정 후에만.
  3. **캐시 버스터**: 아틀라스 PNG와 매니페스트 JSON 모두 버전 경로 또는 `?v=N`으로 무효화한다(`public/_headers` `/assets/*` `immutable`, §6.2·§8). 배포 후 `/version.json`·아틀라스 HTTP 200을 확인한다.
  4. **실기 프로파일링**: 대상 모바일에서 대표 전투 장면의 FPS·캐릭터 1기당 Draw Call·텍스처 메모리·번들 증가량을 기록하고 이 작업의 완료 조건으로 남긴다.
  5. **참조 검사 후 삭제**: 구형 통합 바디 시트, `tools/costume-viewer` 임시 SVG, 미사용 레거시 코드를 후보 목록으로 만들어 `src/`·`tests/`·`scripts/`·`public/` 전체에서 참조 0을 확인한 뒤 삭제한다. 참조가 남은 항목은 삭제하지 않고 목록만 보고한다.
- **검증**: `npx tsc --noEmit`, `node scripts/verify-item-art.mjs`, **전체** `npm test`·`npm run build`(에셋·레거시 대량 정리 후 최종 회귀 확인), `git diff --check`.
- **완료 기준**: 아틀라스·매니페스트가 버전 URL로 배포되고 실기 FPS·메모리·Draw Call 수치가 기록된다. 삭제한 모든 파일·코드에 대해 참조 0 근거가 남고, 전체 테스트·프로덕션 빌드가 통과한다. 남은 미사용 후보는 목록으로 보고한다.
