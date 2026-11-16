# DJRPG Project Working Map & Codex Policy

Read this map first, then only the files relevant to the request. Use `rg` for targeted searches; avoid dumping the whole source tree. This is a Vite + TypeScript + PixiJS 2.5D dark fantasy idle RPG, designed to run on mobile web first and later be packaged as an Android / iOS app via Capacitor.

## Where to change things

- Entry & wiring: `src/main.ts` (only mounts scene/UI and coordinates loop)
- Field lighting, terrain and particles: `src/game/render/field.ts`; actors and animation: `src/game/render/entities.ts`; skill VFX and drops: `src/game/render/vfx.ts`; canvas setup and draw order: `src/game/render.ts`
- Idle combat AI, enemy waves, boss spawn and progression: `src/game/world.ts`
- Save migration and progression state: `src/game/store.ts`; item tables, drops, stats and salvage: `src/game/items.ts`; offline reward calculation: `src/game/offline.ts`
- HUD and controls: `src/ui/hud.ts`; equipment, skill, status, floor and account dialogs: `src/ui/modals/`; UI wiring: `src/ui/interface.ts`
- Styles: `src/styles/base.css`, `hud.css`, `modals.css`, `login.css` imported by `main.css`
- Static assets / future AI-generated 2.5D spritesheets & tilesets: `public/assets/`

## Product & Concept Constraints (DJRPG)

- **Visual & Genre**: Dark fantasy 2.5D quarter-view idle RPG (Diablo 2 / Red Stone inspired). Gothic isometric dungeon floor, flickering torchlight & dark vignette, high-contrast skill flashes, and vertical loot beams by rarity (Common: white, Magic: blue, Rare: yellow, Legendary: orange).
- **Core Idle Loop**: Auto-move, auto-target, auto-attack & 4 auto-cooldown skills (also tappable manually). Defeating normal waves fills the boss gauge to summon the floor boss; clearing advances to deeper floors.
- **Idle QoL Essentials**: Design inventory and drops with rarity-based **auto-salvage / auto-equip** and **offline reward calculation** (elapsed time → gold/EXP/loot) in mind.
- **Classic HUD**: Bottom-left crimson HP orb, bottom-right sapphire MP/CP orb, bottom-center 4-skill bar, top compact floor/kill/gold/level bar.
- **Mobile & App Ready**: Full-screen mobile-first layout (`100dvh`, `viewport-fit=cover`, `user-scalable=no`, `touch-action: none` on game canvas) so it works identically in mobile Safari/Chrome and Capacitor WebView.
- **Decoupled Art Pipeline**: Keep game logic cleanly separated from rendering/sprite loading so initial procedural shapes/graphics can be replaced with AI-generated 2.5D spritesheets without rewriting combat or progression.
- **Save Compatibility**: Preserve existing player progress, level, gold, equipment, and floor data through forward migrations (`localStorage` first, structured behind `store.ts` for future Turso/cloud sync).

## 코덱스 작업 정책 (Codex Task Workflow Policy)

본 프로젝트의 모든 코드 수정, 기능 구현, 배포 관리는 **OpenAI Codex(클라우드 및 로컬 에이전트)**가 수행하며 아래 6대 정책을 엄격히 준수합니다.

1. **작업 시작 전 최신화 (`git pull`)**:
   - 매 작업 시작 전 반드시 `main` 브랜치의 최신 커밋과 지시서를 반영합니다.
2. **지시서(`docs/TASK.md`) 우선 확인 및 이행**:
   - 코드를 수정하기 전 반드시 `docs/TASK.md`의 진행 중인 `[ ]` 작업을 먼저 확인합니다.
   - 이미 등록된 `[ ]` 작업이 있다면 중복 등록하지 않고 즉시 해당 요구사항을 이행합니다.
   - 사용자가 Codex 창에서 직접 새 지시를 내린 경우에만 날짜·목표·완료 기준을 적어 `docs/TASK.md`에 `[ ]` 항목으로 선등록한 뒤 구현합니다.
3. **명확한 예외 및 상태 처리 (무음 실패 금지)**:
   - 저장 실패, 재화/마나 부족, 조건 미달 등의 예외 상황은 조용히 무시하거나 모호한 에러로 덮지 않고, 사용자에게 원인이 드러나도록 안전하게 처리합니다.
4. **무결성 검증**:
   - 코드 수정 후 반드시 TypeScript 타입 검사 및 프로덕션 빌드(`npm run build`, 테스트 스크립트가 있는 경우 `npm test` 또는 `npm run check` 포함)가 에러 없이 통과하는지 확인합니다.
5. **GitHub 반영 및 배포 확인 (토큰 최적화)**:
   - 검증 통과 후 변경 사항을 커밋·푸시(클라우드 Codex 환경에서는 PR 생성/반영 포함)하여 Vercel Production 자동 배포가 정상 빌드되는 상태를 유지합니다.
   - **토큰 절약 절대 수칙**: 브라우저 실기 조작, Playwright/Puppeteer 등 헤드리스 브라우저 실행, 데스크톱 Computer Use 도구는 일절 실행하지 않습니다. 실제 화면·프레임·터치감 확인은 사용자가 폰에서 직접 수행합니다.
6. **작업 완료 체크 및 기록**:
   - 빌드·테스트 검증이 모두 통과한 항목만 `docs/TASK.md`에서 `[x]`로 완료 표시합니다.
   - 실패하거나 미검증된 항목은 절대 `[x]`로 바꾸지 않고 `[ ]` 상태와 원인을 유지합니다.

## 클라우드 개발 · 보안 · 인프라 정책

- **PC 미의존 클라우드 운영**: 소스코드는 GitHub `songduckjin/DJRPG` (`main`)에서 관리하며, ChatGPT 클라우드 Codex와 Vercel 자동 배포를 통해 PC 전원 없이도 개발·테스트가 가능해야 합니다.
- **모바일 앱 확장성**: 추후 Capacitor를 통해 Android(APK/AAB) 및 iOS 앱으로 패키징하므로, 특정 브라우저 전용 API에 과도하게 묶이지 않고 표준 WebGL/Canvas/LocalStorage 인터페이스를 유지합니다.
- **보안 비밀 엄수**: `.env*`, API 키, DB 토큰, 서명 키 등 민감 정보는 절대 로그, 커밋, 클라이언트 번들에 포함하지 않습니다.

## 코덱스 작업 기록 및 토큰 절약 정책 (Codex Token Efficiency Policy)

- **과거 일지 통독 금지**: 매 작업 시작 시 `docs/WORKLOG.md`의 최상단 최신 1개 기록만 참고하며, 과거 전체 일지나 아카이브 폴더를 절대 통독하지 않습니다.
- **간결한 기록**: 작업 완료 시 변경 파일과 검증 결과만 `docs/WORKLOG.md` 상단에 **5줄 이내**로 간결히 기록합니다.
- **최소 탐색 원칙**: `rg`로 관련 파일과 라인만 찾아 읽고, 전체 소스 트리를 한꺼번에 읽지 않습니다.
- **모듈 경계 유지**: 새 거래소·직업·보스 등의 기능은 해당 `src/ui/modals/` 또는 `src/game/` 도메인 모듈에 배치하고, 기존 오케스트레이터 파일을 비대화하지 않습니다.
- **불필요한 도구 호출 금지**: 헤드리스 브라우저나 화면 제어 도구를 실행하지 않습니다. 타입 체크·빌드 통과와 Git 반영으로 코드 작업은 완료됩니다.

## 성별 · 직업 교차 동기화 필수 정책 (Cross-Gender & Cross-Class Parity Policy)

캐릭터 외형·모션·전투·시스템을 수정할 때 특정 성별이나 직업만 수정하고 나머지를 누락하는 회귀를 막기 위해 아래 규칙을 **필수 체크 항목**으로 준수합니다.

1. **남/여 성별 동시 반영**:
   - 남자 캐릭터의 스프라이트, 좌우 시선(`facingSide`), 앵커(`anchor`), 보행/공격 프레임, 갑옷·투구·무기 착용 외형 분기, 장비창 초상화, 스킬 연출을 추가·수정할 때는 **반드시 여자 캐릭터(및 모든 성별 분기)에도 동일하게 반영**합니다.
   - 에셋을 교체·반전·캐시 버스팅할 때도 남자/여자/갑옷/무투구 전 세트를 함께 점검합니다.
2. **전 직업 공통 동기화**:
   - 추후 신규 직업(마법사, 궁수 등)이 추가된 이후에도 이동·전투·루팅·장비 10슬롯·스킬·상태/계정 UI·세이브/DB·거래소 등 공통 시스템을 고칠 때는 **모든 직업에 동일하게 적용되는지** 반드시 확인합니다.
   - 직업 전용 예외가 필요한 경우에만 명시적 분기를 두고, 그 외에는 성별·직업 공통 규칙으로 처리합니다.
3. **완료 전 교차 체크 (`rg`)**:
   - 캐릭터/직업 관련 수정 완료 전 `gender`·직업 분기(`entities.ts`, `render.ts`, `equipModal.ts`, `store.ts` 등)를 `rg`로 확인하여 빠진 성별·직업이 없는지 검증한 뒤 완료 처리합니다.

## 2인 협업 · 작업 선점 및 충돌 방지 정책 (Concurrent Work & Conflict Check Policy)

여러 작업자(및 각자의 Codex)가 동시에 개발할 때 작업 중복과 파일 충돌을 막기 위해 아래 순서를 **필수**로 지킵니다.

1. **`docs/TASK.md` 선확인 및 진행 중(`[-]`) 선등록**:
   - 작업을 시작하기 전 반드시 `git pull` 후 `docs/TASK.md` 전체 상태(`[ ]` 대기, `[-]` 진행 중, `[x]` 완료)를 먼저 확인합니다.
   - 기존 `[ ]` 작업을 맡거나 사용자가 새로 지시한 작업을 등록할 때는, **코드 수정을 시작하기 전에** `docs/TASK.md`에서 해당 항목을 **`[-]` (진행 중 · 담당자/수정 예정 파일 명시)** 상태로 먼저 변경·등록하여 `main`에 즉시 커밋·푸시합니다.
2. **진행 중(`[-]`) 작업과의 겹침 여부 확인**:
   - 새 명령이나 다음 작업을 시작하기 전, `docs/TASK.md`에 이미 **`[-]` (진행 중)**로 표시된 다른 작업이 있는지 반드시 확인합니다.
   - 내가 하려는 작업의 기능, 도메인, 또는 **수정 예정 파일이 이미 진행 중인 `[-]` 작업과 겹친다면 즉시 코드를 수정하지 말고**, 사용자에게 *"현재 `[작업 N]`이 진행 중이며 [파일/기능]이 겹칩니다. 대기할지, 병합 후 진행할지 확인해 주세요."*라고 먼저 보고합니다.
3. **완료 후 `[x]` 전환**:
   - 검증(타입 검사·테스트·빌드)이 모두 끝난 뒤에만 `[-]`를 `[x]`로 바꾸고 `docs/WORKLOG.md`에 기록합니다.
