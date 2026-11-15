# DJRPG Project Working Map & Codex Policy

Read this map first, then only the files relevant to the request. Use `rg` for targeted searches; avoid dumping the whole source tree. This is a Vite + TypeScript + PixiJS 2.5D dark fantasy idle RPG, designed to be packaged later as an Android / iOS app via Capacitor.

## Architecture Overview

- Entry & wiring: `src/main.ts`
- Game loop, isometric/2.5D scene, lighting, particles: `src/game/`
- Idle combat, waves, loot drops (beams), stats, progression: `src/game/`
- HUD overlay (HP/MP orbs, skill slots, inventory/auto-salvage): `src/ui/`, `src/styles/`
- Local save (with clean interface for future cloud sync): `src/game/store.ts`

## Product Constraints

- Theme: Dark fantasy 2.5D quarter-view (Diablo 2 / Red Stone inspired) with gothic dungeon floor tiles, dynamic torch/skill lighting, and loot drop beams (common/magic/rare/legendary).
- Mobile-first viewport (`100dvh`, `user-scalable=no`, `touch-action: none` on canvas) so it runs smoothly in mobile browsers and Capacitor WebView.
- Keep art/sprite loaders decoupled from game logic so procedural placeholder graphics can later be swapped cleanly for AI-generated 2.5D spritesheets.

## 코덱스 작업 정책 (Codex Task Workflow Policy)

본 프로젝트의 코드 수정·구현은 **OpenAI Codex**가 수행하며, 아래 정책을 엄격히 준수합니다.

1. **최신 브랜치 기준 작업**:
   - 작업 시작 전 `main` 브랜치 최신 상태를 확인합니다(`git pull`).
2. **지시서(`docs/TASK.md`) 우선 확인 및 이행**:
   - 코드를 수정하기 전 반드시 `docs/TASK.md`를 먼저 확인합니다.
   - 이미 등록된 `[ ]` 작업이 있다면 중복 등록하지 않고 즉시 해당 요구사항을 이행합니다.
3. **무결성 검증**:
   - 코드 수정 후 반드시 타입 체크 및 프로덕션 빌드(`npm run build`, 테스트 스크립트가 있으면 `npm test` 포함)가 통과하는지 확인합니다.
4. **토큰 절약 절대 수칙 (Token Efficiency Policy)**:
   - **헤드리스 브라우저 및 화면 제어 금지**: Playwright, Puppeteer, 브라우저 실기 조작, Computer Use 도구는 일절 실행하지 않습니다. 실제 화면과 플레이 감각은 사용자가 모바일에서 직접 확인합니다.
   - **과거 일지 통독 금지**: 작업 시작 시 `docs/WORKLOG.md`는 최상단 최신 1개 기록만 참고하며, 과거 전체 이력을 읽지 않습니다.
   - **간결한 기록**: 작업 완료 시 변경 파일과 검증 결과를 `docs/WORKLOG.md` 상단에 **5줄 이내**로 간결히 기록합니다.
   - **불필요한 전체 파일 탐색 금지**: `rg`로 필요한 위치만 찾아 읽습니다.
5. **작업 완료 체크**:
   - 빌드·테스트가 모두 통과한 항목만 `docs/TASK.md`에서 `[x]`로 표시합니다. 실패한 항목은 `[ ]`와 원인을 남깁니다.
