# DJRPG 개인 작업지시서 — songduckjin

> 담당 GitHub ID: `songduckjin`
> 적용 대상: 해당 ID를 사용하는 작업자의 PC 및 Codex
> 규칙: 본 파일은 지정된 작업자만 수정한다. 상대 작업자의 개인 작업지시서는 수정하지 않는다.

## 진행 중 작업

### [-] [작업 134] 필드 캐릭터 통합 바디 복구 및 무기 소켓·액션 자연화
- **등록자**: `songduckjin` · **실행 담당자**: `fks3997`(사용자 위임) · **등록일**: 2026-11-18 · **브랜치**: `task/134-field-gear-action` · **위험 등급**: 중 · **상태**: `[-]` 착수
- **직접 수정 예정**: `src/game/render/entities.ts`, `src/game/render/heroSockets.ts`(신규), `src/game/render/vfx.ts`, `tests/hero-weapon-render.test.mjs`, `docs/CODE_MAP.md` §1·§3(각 1줄). **간접 영향**: `src/game/appearance.ts`(`heroAppearance`가 실제 장착 갑옷·투구로 고르는 시트), `tests/appearance.test.mjs`, `tests/equipped-detail.test.mjs`. **건드리지 않음**: `src/ui/equipmentPortrait.ts`·`src/ui/modals/equipModal.ts`(장비창 미리보기, [작업 133] 영역), `src/game/store.ts`(세이브 형식), `server/**`.
- **목표**: PR #61에서 필드 캐릭터(`entities.ts`)에 적용한 5부위 2D 아이콘 덧그리기를 걷어내, 갑옷·투구 통합 바디 시트의 자연스러운 어깨·체형·공격 액션을 복구한다. 무기는 프레임별 소켓 데이터(`heroSockets.ts`)로 분리해 서기·걷기·공격 전환이 매끄럽게 이어지게 하고, 무기 등급·종류의 차이는 덧그리기 대신 검기 이펙트로 남긴다.
- **배경·근거(현재 코드)**:
  - `drawHero`는 `bodySave = { ...save, equipment: { ...save.equipment, helmet: undefined, armor: undefined } }`로 갑옷·투구를 벗긴 시트를 고른 뒤 `syncGear`에서 5부위(`visibleGearSlots`)를 모두 덧그린다(`gearPose`·`attackGearPoses`·`idleWeaponPoses`·`attackWeaponPoses`가 `entities.ts`에 하드코딩). 그 결과 몸통·어깨가 아이콘과 겹치고 공격 프레임에서 칼이 2자루로 보인다.
  - `appearance.ts`의 `idle`·`walk`·`attack`은 이미 갑옷·투구를 포함한 통합 시트를 고르고, `attack` 시트(`attackSheets`·`animationPaths`)에는 검이 그려져 있다. 즉 통합 시트로 돌아가면 갑옷·투구는 추가 작업 없이 맞는다.
  - 사용자 지시(2026-11-18): "이거는 규칙으로 해놔야대 다른 직업나왔을때도 고려해야돼" — 장비창/필드 분리와 다직업 구조를 `AGENTS.md`·`CODE_MAP.md` §4에 규칙으로 먼저 못박았고, 이 작업은 그 규칙의 첫 구현이다.
  - 번호 주의: 등록 시점 `main`(`84a1dd0`)에 fks3997의 `[작업 133]`(장비창 실제 착용 캐릭터 이미지, `task/133-equipped-character-art`)이 이미 `[-]`로 선점돼 있어 이 작업은 **134**로 등록했다. 파일은 겹치지 않는다(그쪽은 `ui/`·`public/assets/warrior_equipped*`, 이쪽은 `render/`).
- **불변 계약**:
  1. 장비창 중앙 미리보기(`ui/equipmentPortrait.ts` 단일 합성 초상화, [작업 133])는 정지 프리뷰라 그대로 두고 이번 작업에서 손대지 않는다(필드와 코드 경로가 다르다).
  2. 세이브 형식·`store.ts` 변경 없음: `classId`를 세이브에 넣지 않는다(전방 호환 필드 도입은 별도 작업). `heroSockets.ts`의 직업 판별은 `heroClass(save)` 한 곳을 거치고, 지금은 항상 `'warrior'`를 돌려준다.
  3. 남/여 동시 반영(양쪽 소켓·시트 루프 검증).
- **구현 항목**:
  1. **`entities.ts` 바디 복구**: `drawHero`의 `bodySave` 우회를 없애고 `heroAppearance(save)`(실제 `save`)로 `idle`·`walk`·`attack` 시트를 고른다. `syncGear`에서 `helmet`·`armor`·`gloves`·`boots` 덧그리기를 제거하고 무기만 남긴다. `gearPose`·`attackGearPoses`·`walkAnchors` 중 장비 전용 상수는 함께 정리하고, 몸 기준 `heroBodyHeight`·`heroScale` 계산은 유지한다. 그림자 반경은 기존처럼 `heroBodyHeight` 기준을 쓴다.
  2. **`heroSockets.ts` 신규 분리(다직업 구조)**: `entities.ts`의 무기 포즈 좌표를 옮겨 **처음부터 직업 × 성별 표**로 정의한다.
     ```ts
     // src/game/render/heroSockets.ts
     import type { Gender, Save } from '../store';
     export type ClassId = 'warrior';                       // 직업 추가 시 여기에만 늘린다
     export type WeaponSocket = { u: number; v: number; size: number; rotation: number; zOrder: number };
     export type WeaponMotionSockets = { idle: WeaponSocket; walk: readonly WeaponSocket[] }; // walk = 8프레임
     export type WeaponSocketTable = Record<ClassId, Record<Gender, WeaponMotionSockets>>;
     export const weaponSockets: WeaponSocketTable = { warrior: { male: {…}, female: {…} } };
     export function heroClass(save: Pick<Save,'gender'>): ClassId;             // 지금은 'warrior' 고정
     export function weaponSocket(classId: ClassId, gender: Gender, motion: 'idle' | 'walk', frame: number): WeaponSocket;
     ```
     - `walk` 8프레임은 상하 바운스·발 디딤 보정을 값으로 담는다(계산식이 아니라 데이터). `frame`은 `0..7`로 정규화하고, `motion`이 `idle`이면 `idle` 소켓, `walk`면 `walk[frame]`을 준다.
     - `entities.ts`는 `weaponSocket(heroClass(save), save.gender, moving ? 'walk' : 'idle', walkingFrame)`만 호출하고 좌표 상수를 갖지 않는다. 무기 앵커(`.18`/`.82`)와 `zOrder`(무기 레이어 순서)도 소켓 표에서 읽는다.
     - 새 직업 추가 시 필요한 것은 `appearance.ts`의 시트 분기 + `weaponSockets`의 `classId` 항목 + 그 직업 바디 실측 `heroScale.ts` `heroBodyPx`뿐이며, `entities.ts`는 수정하지 않는다.
  3. **공격(`attack`) 자연화·칼 중복 방지**: `animation === 'attack'`(=`appearance.attack` 시트 사용 구간)에서는 무기 스프라이트를 `visible = false`(또는 `alpha 0`)로 두어 2자루 겹침을 없앤다. 공격 종료·걷기·서기로 돌아오면 소켓 위치로 즉시 복귀하며, 프레임 전환에서 깜빡이지 않도록 `syncGear`에서 스프라이트를 파괴·재생성하지 말고 표시만 바꾼다. 무기 교체 시에는 기존처럼 텍스처 키 교체 경로를 유지한다.
  4. **검기 색으로 무기 차이 표현(`vfx.ts`)**: `drawSkillVfx`의 `slash2`(부채꼴 2겹 아크) 색을 장착 무기 등급 색으로 바꾼다 — 파일 안의 `rarityColors`(지금은 드랍 글로우용)를 그대로 재사용하고, `weaponSlashColor(world)` 같은 작은 헬퍼로 `save.equipment.weapon?.rarity ?? 'common'`을 읽는다(무기 없으면 기존 흰색 유지). 기본 공격 `slash`는 [작업 123]으로 이펙트를 그리지 않으므로 되살리지 않는다. 등급에 따라 선 굵기·잔상 알파를 조금씩 달리해 교체감을 준다. `drawSkillVfx`는 `effect`만 받으므로 `world`(또는 `weaponColor`)를 인자로 넘기는 시그니처 변경은 `render.ts` 호출부 1곳만 고친다.
  5. **성별 교차 동기화 + 부분 검증 + 매뉴얼**: 남/여 모두 같은 경로로 통과시키고 `tests/hero-weapon-render.test.mjs`를 새 계약에 맞게 고친다(무기 1개만 남고, `heroGear` 키는 `['weapon']`, 공격 프레임에서는 무기 미표시, idle·walk 8프레임에서 좌표가 유한값). 통과 후 `docs/CODE_MAP.md` §1 '캐릭터 외형·성별·스프라이트' 행 연관 파일과 §3 `render/` 항목에 `heroSockets.ts` 1줄씩 추가한다.
- **검증 (부분 테스트)**: `npx tsc --noEmit`, `node --test tests/appearance.test.mjs`, `node --test tests/hero-weapon-render.test.mjs`, `node --test tests/equipped-detail.test.mjs`, `git diff --check`. 전체 `npm test`·`npm run build`는 공용 계약(`store.ts` 등)을 건드리지 않았으므로 실행하지 않는다. 브라우저·Playwright 실기는 요청 시에만.
- **완료 기준**: 필드 캐릭터가 장착 갑옷·투구 통합 시트(어깨·체형 정상)로 그려지고, 장갑·부츠·갑옷·투구 아이콘이 몸 위에 덧그려지지 않는다. 무기는 서기·걷기 8프레임에서 손 위치를 따라가고 공격 4프레임에서는 한 자루만 보인다. 검기 색이 장착 무기 등급을 반영한다. 남/여 모두 동일. `heroSockets.ts`가 `Record<ClassId, Record<Gender, …>>` 표로 존재하고 `entities.ts`에 무기 좌표 하드코딩이 없다. 위 검증 전부 통과 후 PR 병합.
- **동시 작업 확인**: 등록 시점(2026-11-18, `main` = `84a1dd0`) `docs/TASK.md`의 다른 `[-]` 작업은 fks3997의 `[작업 133]`(장비창 미리보기, `ui/`·`public/assets/warrior_equipped*`) 하나이며 수정 파일이 겹치지 않는다. 번호는 134로 올려 잡았다.

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
