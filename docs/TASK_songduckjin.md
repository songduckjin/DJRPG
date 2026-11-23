# DJRPG 개인 작업지시서 — songduckjin

> 담당 GitHub ID: `songduckjin`
> 적용 대상: 해당 ID를 사용하는 작업자의 PC 및 Codex
> 규칙: 본 파일은 지정된 작업자만 수정한다. 상대 작업자의 개인 작업지시서는 수정하지 않는다.
> 이 문서는 `songduckjin` 담당자의 **진행 중·대기 작업만** 둔다. `[x]` 완료 작업의 상세·검증 결과는 `docs/archive/2026-11/TASK_songduckjin-history.md`에 보존한다.

## 진행 중 작업

### [-] [작업 146] Turso 공용 DB에서 DJRPG 전용 DB 이관
- **브랜치**: `codex/146-turso-db-isolation` · **상태**: `[-]` · **위험 등급**: 높음
- **범위**: `docs/TURSO_DB_GUIDE.md`에 따라 `puzzle-mates`의 DJRPG 데이터만 백업·복사하고 Cloudflare Pages 운영 비밀 변수를 전용 DB로 전환한다. 퍼즐 메이츠 테이블과 코스튬 코드는 수정하지 않는다.
- **확인 사항**: 실제 원본 DB에는 가이드의 14개 외에 `djrpg_boss_{days,attempts,scores,rewards}` 4개 테이블이 있다. 이관 스크립트·검증·가이드를 18개 테이블로 보정한 후 진행한다. 세션 만료·게스트 복구 불가·복사 이후 저장 차이 위험을 이관 전 확인한다.
- **수정 예정**: `scripts/migrate-turso-db.mjs`, `tests/migrate-turso-db.test.mjs`, `server/{database,market-connection,world-boss,world-boss-schema}.mjs`, `tests/functions-adapter.test.mjs`, `docs/TURSO_DB_GUIDE.md`, `docs/CODE_MAP.md`, `docs/QUICK_PATCH.md`, `docs/TASK.md`, 이 작업 기록. 기존 `TURSO_AUTH_TOKEN`은 세션 서명에 유지하고 새 `TURSO_DATABASE_AUTH_TOKEN`만 DB 접속에 사용해 41개 게스트 세션을 보존한다. 실제 DB 키·토큰·세이브 내용은 커밋·로그에 넣지 않는다.

### [superseded] [작업 145] 서리의 가죽두건 코스튬 단일 완성 사례
- **2026-11-19 운영 화면 후속**: PR #89 배포 후 사용자 사진에서 매직 두건·두손검과 함께 문장·신발 등 다른 장비를 착용한 상태가 확인됐다. 기존 전신 시안은 다른 장비가 있으면 적용되지 않아 금속 투구가 계속 보인다. 사용자의 실제 장비 조합에서도 두건만 교체되도록 `codex/145-frost-hood-layered-fix`에서 두건 전용 레이어와 버전 분리 아틀라스를 추가한다. 수정 예정: `scripts/build-costume-atlas.py`, `src/game/render/costumeHero.ts`, `public/assets/costume/v5/atlas/*`, `tests/costume-field-render.test.mjs`, 관련 문서. 기존 v3·v4 배포 에셋은 유지하고, 필드·장비창 실화면 확인 전 완료 처리하지 않는다.
- **후속 구현·검증**: 아이템 원본 천 두건을 기존 남녀 머리 위치에 맞춘 v5 페이지 4장을 생성하고, 혼합 장비에서는 투구 페이지만 교체했다. 기존 전신 v4 조합과 다른 장비 그림은 유지한다. 갑옷 위 남녀 정지·걷기·공격 프레임 합성 진단에서 위치를 확인했다. 타입 검사, 관련 테스트 66건·전체 379건, 아트 검증(v5 4종), `npm run build`, `git diff --check` 통과. PR #92(`7fc8366`) 병합 후 운영 `version.json`에서 `7fc83660fdb0`과 v5 아틀라스 4장 200 응답을 확인했다. 운영 실제 화면 검수는 계속 대기다.
- **대체 결정(2026-11-19)**: 사용자는 부분 두건 코스튬 실기 검수 대신 전사 전체 외형을 새 AI 시안으로 교체하기로 결정했다. `[작업 149]`에서 필드·장비창 모두 새 남녀 시트를 쓰며, 착용 슬롯·능력치·Save는 유지되고 그림만 고정 갑옷·대검이 된다. 본 작업의 추가 실기 검수는 종료하며, 기존 v3/v4/v5 코드·에셋은 별도 참조 정리 전까지 보존한다.
- **담당자**: `songduckjin` · **브랜치**: `codex/145-frost-hood-layered-fix`(전신 시안은 `codex/145-frost-hood-pilot`) · **위험 등급**: 중 · **상태**: `[superseded]`
- **목표/범위**: 전체 장비를 확장하지 않고 `서리의 가죽두건` 한 조합만 완성 사례로 제작한다. 장착 아이템 그림과 동일한 천 두건 실루엣을 남/여 각각 idle·walk·attack에 반영하고, 필드·장비창에서 동일한 그림을 검수한다. 남/여 × 앞·뒤·좌·우 방향 공격 그림을 준비해 전방향 적을 향하게 한다. 2026-11-19 사용자 요청에 따라 이 파일럿만 먼저 병합·배포하고 실제 화면은 사용자가 함께 검수한다.
- **사전 원인**: `서리의`는 매직 등급 접두사이고 이름 정규화 후 `가죽 두건` 끝부분 매칭으로 `helmet-t0`에 이미 연결된다. v3 생성물은 `helmet-<gender>` / `helmet-body-<gender>`의 공유 셀 규약이므로 아이템 아이콘의 천 두건 형태를 보장하지 않는다. `world.ts`는 각도 `player.facing`을 보유하지만 `render/entities.ts`의 공격 셀 선택은 4프레임 공용 시트와 `player.facingSide` 좌우 반전만 사용하므로 화면 앞·뒤 방향 공격을 표현할 수 없다.
- **방향 정책**: `player.facing`을 등각 화면 축으로 투영해 남/여 각각 그린 좌/우/뒤/앞 공격 키 포즈 4장 중 하나를 고른다. idle/walk는 오른쪽 그림을 좌우 반전하는 현행 정책을 유지한다. 기본 공격·스킬 공격은 방향별 한 키 포즈를 공격 창 동안 유지한다.
- **수정 파일**: `scripts/build-costume-atlas.py`(`--pilot-145`·`--pilot-145-overlay`), `src/game/render/{heroMotion,costumeHero,entities}.ts`, `src/ui/equipmentPortrait.ts`, `public/assets/costume/pilot145/source/**`, `public/assets/costume/v4/atlas/pilot-hood-{male,female}.png`, `public/assets/costume/v5/atlas/frost-hood-{armor,body}-{male,female}.png`, `tests/{hero-motion,costume-field-render,equipped-detail}.test.mjs`, `scripts/verify-item-art.mjs`, `docs/COSTUME_SYSTEM.md`, `docs/CODE_MAP.md`, `docs/QUICK_PATCH.md`, `docs/TASK.md`, 본 작업 기록.
- **금지**: 다른 54개 코스튬·아이템 이름/UUID/Save/API·`src/game/store.ts`·DB 변경, v3 운영 에셋 교체, main 직접 커밋. v4는 두 페이지뿐이므로 기존 v3 에셋과 함께 배포한다. 실제 화면 미검수는 완료로 표시하지 않는다.
- **검수 표**: 기준 아이템 아이콘 / 제작 프레임 / 실제 필드 화면 / 실제 장비창 화면을 한 시트에 배치한다. 남녀 각각 idle·walk·공격(좌/우/앞/뒤)을 표기하고 얼굴 가림·손잡이/무기 위치·필드 방향을 검사한다. 합성 목업은 실제 앱 캡처와 명확히 구분한다.
- **검증**: `node node_modules/typescript/bin/tsc --noEmit`; `node --test tests/hero-motion.test.mjs tests/costume-field-render.test.mjs tests/equipped-detail.test.mjs`; `node scripts/verify-item-art.mjs`; `git diff --check` 통과. 사용자 허용 후 로컬 Vite에서 게스트 시작을 눌렀으나 `/api/account`가 HTML을 반환해 실제 필드 진입에 실패했다. 로컬 Pages Functions/Turso 설정이 없고 서버 계정은 생성되지 않았다. 실제 필드/장비창 화면, 얼굴 가림, 공격 중 손잡이 접점은 배포 후 검수 대기다.
- **완료 기준**: 서리의 가죽두건이 기존 투구 색변형·폴백이 아닌 구별되는 천 두건 그림으로 양 성별에 적용되고, 좌/우/앞/뒤 적에 대한 공격 자세가 방향 정책에 맞으며, 실제 화면 네 영역 비교 시트를 남긴다. 이 한 조합 결과를 사용자에게 보여준 뒤 나머지 장비 확대 여부를 결정한다.

### [-] [작업 136] 통합 내 정보(장비·스탯) UI 개편 및 4티어 장비창 초상화 교체
- **등록자**: `songduckjin` · **실행 담당자**: `songduckjin`(`codex` 실행 가능) · **등록일**: 2026-11-18 · **브랜치**: `task/136-unified-equip-ui` · **위험 등급**: 중 · **상태**: `[-]` 등록
- **선행 조건(갱신 2026-11-18)**: `[작업 135]`는 PR #71로 main에 병합됐다. PR #72는 현재 Draft로 열려 있다. 내 정보 UI 레이아웃 변경은 재사용 후보로 보존하되, 장비 초상화는 `docs/COSTUME_SYSTEM.md`의 공용 외형 계획과 프로토타입 결과를 기준으로 재검토한다. PR #72는 사용자 검토 전 병합하지 않는다.
- **선반영 에셋(이 등록 PR에 포함 · 코드는 미변경)**: 남/여 2·3·4티어 장비창 전신 초상화 6장.

  | 파일 | 크기(px) | 용량 |
  |---|---|---|
  | `public/assets/warrior_equipped_t2_male.png` | 286×720 | 51KB |
  | `public/assets/warrior_equipped_t3_male.png` | 289×720 | 52KB |
  | `public/assets/warrior_equipped_t4_male.png` | 284×720 | 68KB |
  | `public/assets/warrior_equipped_t2_female.png` | 321×720 | 60KB |
  | `public/assets/warrior_equipped_t3_female.png` | 321×720 | 55KB |
  | `public/assets/warrior_equipped_t4_female.png` | 324×720 | 77KB |

  - 기존 `warrior_equipped_starter_{male,female}.png`은 RGBA(투명 배경, 알파 0~255) 799×1967·839×1874에 1.8MB·2.0MB다. 새 6장도 **투명 배경 + 부드러운 알파 가장자리**로 맞췄고(생성 원본의 순수 검은 배경만 알파 0으로 제거, 갑주 내부 어두운 면적은 보존), 장비창 표시 크기(높이 약 300px·레티나 2배)에 맞춰 **높이 720px**(비율 유지)로 줄인 뒤 256색 팔레트 PNG(tRNS 알파 테이블)로 경량화했다. 6장 합계 355KB(1MB 미만).
  - 파일 안 그림의 세로 채움 비율은 starter 0.95 / 남 2~4티어 0.93~0.95로 같아, `renderEquipmentPortrait`가 캔버스(312×768)에 꽉 채워 그리는 현재 방식에서 티어 간 캐릭터 크기가 튀지 않는다.
- **목표**: 하단 내비게이션의 `내 상태`·`장비` 두 탭을 **`내 정보` 한 탭**으로 합쳐 모바일에서 한 화면에 장비·스탯·가방이 모두 보이게 하고(세로 공간 절약), 장비창 중앙 미리보기를 종이인형 5부위 덧그리기에서 **티어별 전신 일러스트 + 팔레트 스왑**으로 바꿔 실제 착용 티어가 그림으로 드러나게 한다. 성별은 캐릭터 생성 시 고른 값으로 고정한다.
- **사용자 결정(2026-11-18)**: ① `내 상태` 탭 제거, `장비` 탭을 `내 정보`로 통합(하단 탭 3개: 내 정보·스킬·거래소) ② 성별 변경 기능 제거(생성 시 선택 고정) ③ 2·3·4티어 전신 초상화를 장비창에 적용, 갑옷·투구 팔레트 스왑은 [작업 135] 결과 재사용.
- **배경·근거(현재 코드)**:
  - `src/ui/interface.ts` 38행 `Modal` 유니온에 `'status'`와 `'equipment'`가 따로 있고, 82행 `.bottom-nav`가 `status`·`equipment`·`skills`·`market` **4버튼**을 그린다. 197행 제목 표가 `status:'내 상태'`, `equipment:'장비'`로 갈라져 있고, 191행이 `.status-modal` 클래스를, 216행이 `this.renderCharacter(dialog)`를 호출한다. 199~204행의 도감 버튼은 `equipment`↔`codex` 전용이다.
  - `src/ui/modals/statusModal.ts`(23줄)는 요약 바(`.character-overview`: LV·층·경험치·골드·강화석) + `.character-stats` 5칸(공격·방어·체력·치명·공속) + `.gender-switch`(성별 변경 버튼, `save.gender`를 직접 바꾼다)로 구성된다. 이 함수는 `interface.ts` 한 곳에서만 쓰인다.
  - 같은 성별 변경 버튼이 `src/ui/modals/accountModal.ts` 24~31행(`.account-gender`)에도 있어 `save.gender`를 똑같이 바꾼다. **성별 고정 목표를 위해서는 이 버튼도 함께 없애야 한다**(아래 구현 항목 1-3).
  - `src/ui/modals/equipModal.ts` `renderEquipment`(150~190행)는 `.equipment-showcase`를 5칸(좌: 무기·투구·갑옷·장갑·부츠)·중앙 초상화(`.showcase-hero` > `.showcase-figure` > `.showcase-body` img, `renderEquipmentPortrait`의 312×768 dataURL)·5칸(우: 문장·목걸이·벨트·반지1·반지2)로 3열 배치하고, 아래에 `.showcase-stats`(전투력·공격·방어·HP)와 `.modal-hint`를 둔다. 슬롯 칸은 `data-equipped-slot`·`.equipment-slot.<rarity>`·`.slot-part`(슬롯명)·`.slot-meta > b`(이름)를 갖고 `showEquippedDetail`로 상세 팝업을 연다.
  - `src/ui/equipmentPortrait.ts`는 `fit` 좌표 표(성별 × 10슬롯)와 `wearableEquipmentImage` 프레임 합성으로 종이인형을 그린다(112행 캔버스 312×768, 5부위 + 장신구 아이콘 덧그리기). `starterFrames`로 5부위가 모두 스타터면 `/assets/warrior_equipped_starter_{gender}.png`를 쓰고, 아니면 `heroAppearance(bodySave).portrait`(갑옷·투구를 벗긴 맨몸 시트) 위에 부위를 덧그린다.
  - 스탯 이름은 `items.ts` 33~37행 `slotNames`(두손검·문장·투구·갑옷·목걸이·장갑·벨트·신발·반지 1·반지 2)와 `statNames`(공격·방어·체력·치명·공속)를 쓴다. 전투력은 `equipModal.ts`의 `Math.round(attack*3 + defense*2 + health*.2 + crit*2 + speed*2)`, 경험치는 `expToNext(level)`·`MAX_LEVEL`(`store.ts`), 현재 HP는 `world.player.hp`다.
  - 스타일은 `src/styles.css`가 아니라 **`src/styles/modals.css`**(`main.css`가 `hud`→`modals` 순으로 import)에 있다: `.equipment-modal .modal-bag`(flex 1·min-height 0·overflow hidden), `.showcase-side`, `.showcase-stats`, `.character-stats`, `.gender-switch`, `.status-modal …`(253~261행), 하단 탭은 `src/styles/hud.css` `.bottom-nav`(31~34·53~61행).
- **구현 항목 1 — 통합 '내 정보' 모달**
  1. **탭 정리(`interface.ts`)**: `Modal` 유니온에서 `'status'`를 빼고, `renderCharacter` import·`renderCharacter` 위임 메서드·216행 호출·191행 `status-modal` 클래스 토글·197행 제목 표 항목을 제거한다. `.bottom-nav`는 `equipment`(라벨·title·aria-label **`내 정보`**, 아이콘은 기존 `nav_equipment_v2.png` 유지)·`skills`·`market` **3버튼**이 된다. 199행 도감 버튼 분기는 `equipment`(=내 정보)에서 그대로 동작해야 한다. `src/ui/modals/statusModal.ts`는 삭제한다(`interface.ts` 외 import 없음). `styles/modals.css`의 `.status-modal …`·`.gender-switch` 규칙도 함께 정리한다.
  2. **모달 제목**: `equipment` 모달의 `<h2>`를 `'내 정보'`로 바꾼다(도감 버튼·장비/도감 토글 유지).
  3. **성별 고정**: `statusModal`은 삭제로 끝나고, `accountModal.ts`의 `.account-gender` 성별 변경 블록도 제거해 `save.gender`를 바꾸는 UI를 남기지 않는다(서버 저장 형식·`save.gender` 필드 자체는 불변, 캐릭터 생성 `charactersModal`의 성별 선택은 유지).
  4. **상단 레이아웃(모바일 컴팩트)**: `.equipment-showcase`를 좌우 5칸 3열 구조에서 **상단 2분할**로 바꾼다 — 왼쪽은 초상화(`.showcase-hero`/`.showcase-figure`/`.showcase-body` 재사용, 현재보다 낮은 컴팩트 높이, 성별 전환 버튼 없음), 오른쪽은 ①요약 바(`LV · 층 · EXP % · 강화석`) ②**6칸 스탯 그리드**(2열×3행: `전투력`·`HP`·`공격력`·`방어력`·`치명타`·`공격속도`). HP는 `현재/최대`(`Math.ceil(world.player.hp)`/`stats.health`)로 표시하고, EXP는 `%`(MAX면 `MAX`)로 표시한다. 요약 바의 골드 강조(`goldMarkup`)는 기존 `renderCharacter`와 같은 방식을 유지한다.
  5. **장비 10칸 그리드**: **5열 × 2줄 정사각 아이콘**으로 배치하고 각 칸 아래에 슬롯명 라벨을 둔다. 1행 `weapon`(두손검)·`helmet`(투구)·`armor`(갑옷)·`gloves`(장갑)·`boots`(신발), 2행 `offhand`(문장)·`necklace`(목걸이)·`belt`(벨트)·`ring1`(반지 1)·`ring2`(반지 2). 등급 테두리(`.equipment-slot.<rarity>`), 슬롯명 라벨(`.slot-part`), 탭/호버 시 `showEquippedDetail` 상세 팝업, `data-equipped-slot`, `aria-expanded`, `pointerenter`/`focus` 바인딩은 **현재 그대로 유지**한다(테스트·`equippedDetail` 계약). 좁은 화면에서 5열이 깨지지 않도록 정사각 `aspect-ratio`·`min-width: 0`·아이콘 `width: 100%` 기준으로 잡는다. 긴 장비 이름은 그리드에서 숨기고 상세 팝업으로 넘긴다(`wrapEquipmentName`은 팝업 쪽에서 계속 사용).
  6. **가방 영역 확대**: 하단 `.modal-bag` 높이를 넓혀 모바일에서 더 많은 가방 줄이 한 화면에 보이게 한다(상단 블록 고정 높이 축소 + `.modal-bag` `flex: 1` 유지, `@media (max-height: 750px)`의 `min-height: 220px`·sticky footer 규칙 재확인). 가방 필터·정렬·분해·자동 장착 동작은 불변.
- **구현 항목 2 — 4티어 장비창 초상화(`ui/equipmentPortrait.ts`)**
  1. **종이인형 제거**: `fit` 좌표 표와 `wearableEquipmentImage` 5부위(무기·투구·갑옷·장갑·부츠) 프레임 합성, `starterFrames` 판정을 제거한다. 장신구(문장·목걸이·벨트·반지 1·2) 아이콘 오버레이는 **선택 사항**이며, 남길 경우 새 전신 초상화와 같은 비율(starter와 동일)이므로 기존 좌표를 그대로 쓴다. 무기·갑옷·투구는 그림에 이미 그려져 있으므로 **절대 덧그리지 않는다**.
  2. **착용 상태별 그림 선택** — `armorTier`/`helmetTier`(135)로 분기한다.
     - 갑옷 + 투구 **둘 다**: 갑옷 티어에 따라 `1`→`/assets/warrior_equipped_starter_{gender}.png`, `2`→`/assets/warrior_equipped_t2_{gender}.png`, `3`→`/assets/warrior_equipped_t3_{gender}.png`, `4`→`/assets/warrior_equipped_t4_{gender}.png`를 고르고, 상단 투구 밴드는 `helmetPalette`, 몸통 갑옷은 `armorPalette`로 스왑한다.
     - **투구만**(갑옷 없음): `heroAppearance(save).portrait`의 투구 + 맨몸 초상화(`warrior_{gender}_{armed ? 'sword' : 'base'}_helm.png`) + 투구 팔레트 스왑.
     - **갑옷만**(투구 없음): `warrior_armored_nohelm.png` / `warrior_female_armored_nohelm.png` + 갑옷 팔레트 스왑.
     - **둘 다 없음**: `heroAppearance(save).portrait`의 맨몸/무기 초상화를 그대로 쓴다(스왑 없음).
     - 무기는 장비창에서 별도 표시하지 않는다(전신 그림의 검 사용). `armed` 판정은 `heroAppearance`가 이미 돌려주는 값을 따른다.
  3. **팔레트 스왑 재사용(135)**: `gearTint.ts`의 **피부톤 보존 판정 + 머리 밴드/몸통 2팔레트 합성**을 캔버스 레벨 함수(예: `tintPortraitCanvas(source, armorKey, helmetKey)`)로 재사용한다. 135가 Pixi `Texture` 캐시만 노출한다면, `gearTint.ts`에 캔버스 함수를 **추가만** 하고(135의 텍스처 캐시·키 규칙 불변) 여기서 호출한다. 136에서 픽셀 판정 로직을 복제하지 않는다.
  4. **캐시**: 키는 `` `${basePath}|${armorPaletteKey ?? '-'}|${helmetPaletteKey ?? '-'}` ``로 하고, 장비창 dataURL `Map`(상한 24, 기존 LRU 유지)에 1회만 만들어 담는다. 매 렌더 `getImageData` 금지.
  5. **계약 유지**: `equipmentPortraitPlan(save)`은 `{ base, parts, key, starter }` 형태를 유지하되 `base`가 티어별 전신 경로가 되고 `parts`는 장신구만 담는다(빈 배열 허용). `renderEquipmentPortrait(save)`는 312×768 캔버스·`imageSmoothingQuality='high'`·`tightFrame` 기준 배치를 유지하고, 합성 결과의 `toDataURL()`을 돌려준다. 이미지 로딩 실패 시 `console.error` 후 `base` 원본으로 폴백한다(현재 `equipModal`의 `.catch` 동작 유지).
- **테스트**
  - `tests/equipped-detail.test.mjs`: 현재 `preview.base === '/assets/warrior_equipped_starter_...'`와 5부위 `parts` 목록을 단정한다. **새 계약으로 갱신**한다 — 남/여 × (갑옷 티어 1~4 × 투구 유무)에서 `base`가 `warrior_equipped_starter|t2|t3|t4_{gender}.png`로 정확히 매핑되고, `parts`에 `weapon`·`armor`·`helmet`·`gloves`·`boots`가 **없으며**, 투구만/갑옷만/둘 다 없음은 `heroAppearance` 경로를 쓴다. 6장 PNG가 `PNG` 시그니처와 높이 720·폭 256 초과를 만족하는지도 함께 검사한다.
  - `tests/appearance.test.mjs`·`tests/hero-motion.test.mjs`는 [작업 135] 결과 기준으로 통과해야 한다(이 작업에서 135 계약을 깨지 않는다).
  - 새 테스트(예: `tests/equipment-info.test.mjs`)로 ① 하단 탭이 3개이고 `status` 항목이 없음 ② `renderCharacter`·`gender-switch`·`account-gender` 참조가 `src/`에 남아 있지 않음(소스 문자열 검사) ③ 6칸 스탯 라벨 목록 ④ 10슬롯 순서(1행/2행) 상수 검사를 둔다.
- **검증**: `pnpm exec tsc --noEmit`, `node --test tests/equipped-detail.test.mjs tests/appearance.test.mjs tests/hero-motion.test.mjs tests/modal-ui.test.mjs`, `git diff --check`. 에셋을 교체하면 `node scripts/verify-item-art.mjs`와 캐시 버스터(`?v=N`)도 함께. 브라우저·Playwright 실기(모바일 세로 화면에서 5열 그리드·가방 줄 수·상세 팝업)는 **요청 시에만** 한다.
- **완료 기준**: 하단 내비게이션이 `내 정보 · 스킬 · 거래소` 3탭이고 `내 정보` 한 화면에 초상화·요약·6스탯·장비 10칸(5×2)·가방이 모바일 세로 화면에서 스크롤 없이 들어간다. 성별을 바꾸는 UI가 없고 캐릭터 생성 시 고른 성별이 유지된다. 장비창 초상화는 착용 갑옷 티어(1~4)에 따라 다른 전신 일러스트를 보여 주고, 투구만·갑옷만·둘 다·둘 다 없음 네 경우가 서로 구분되며, 갑옷·투구 팔레트 색이 135의 팔레트 표를 따르고 **얼굴·피부·머리카락은 원본 색**을 유지한다. 무기·갑옷·투구 2D 아이콘 덧그리기는 남아 있지 않고, 장비 상세 팝업·도감 버튼·가방 동작은 이전과 같다. 타입 검사·해당 테스트·`git diff --check` 통과 후 PR 병합.
- **동시 작업 확인**: 등록 시점 `origin/main` = `3f20949`. `docs/TASK.md`의 다른 `[-]` 작업은 `[작업 135]` 하나이고, 135는 `appearance.ts`·`render/entities.ts`·`render/gearTint.ts`(신규)·`tests/appearance.test.mjs`를, 136은 `ui/`·`styles/`·`ui/equipmentPortrait.ts`를 만져 **파일이 겹치지 않는다**(135 머지 후 착수라 순서도 안전). 번호 136은 등록 시점 `docs/`·원격 브랜치 어디에도 없음을 확인했다.

## 다음 작업 대기

## 작업 등록 양식

새 작업은 아래 형식으로 등록한다. 실제 작업을 시작하기 전에 상태를 `[-]`로 변경한다.

```md

## [ ] [작업 번호] 작업 제목
- 담당자: songduckjin
- 등록일:
- 상태: 대기
- 수정 예정 파일:
- 목표:
- 작업 내용:
- 완료 기준:
```

## 상태 표기

- `[ ]`: 대기
- `[-]`: 진행 중
- `[x]`: 검증 완료

## 아카이브
- 이전 완료 작업 상세: `docs/archive/2026-11/TASK_songduckjin-history.md`
