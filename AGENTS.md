# DJRPG Project Working Map & Codex Policy

Read this map first, then only the files relevant to the request. Use `rg` for targeted searches; avoid dumping the whole source tree. This is a Vite + TypeScript + PixiJS 2.5D dark fantasy idle RPG, designed to run on mobile web first and later be packaged as an Android / iOS app via Capacitor.

## Where to change things

- Entry & wiring: `src/main.ts` (only mounts scene/UI and coordinates loop)
- 2.5D isometric map, torch/skill dynamic lighting, camera & particles: `src/game/`
- Idle combat AI, enemy waves, boss spawn, loot drop beams, stats: `src/game/`
- Save/load, offline idle reward calculation, inventory & auto-salvage: `src/game/store.ts`
- HUD overlay (HP/MP orbs, skill slots, top bar, inventory/settings): `src/ui/`, `src/styles/`
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
- **불필요한 도구 호출 금지**: 헤드리스 브라우저나 화면 제어 도구를 실행하지 않습니다. 타입 체크·빌드 통과와 Git 반영으로 코드 작업은 완료됩니다.
