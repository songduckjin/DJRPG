# DJRPG 작업 규칙 (Codex)

Vite + TypeScript + PixiJS 모바일 2.5D 다크 판타지 RPG. 수정 전 이 규칙을 적용한다.

## 프로젝트 구조
- `src/game/`: `world.ts`(전투), `store.ts`(저장), `items.ts`(아이템), `render/`
- `src/ui/`: HUD(`hud.ts`)·모달(`modals/`)·연결(`interface.ts`) · `src/styles/`: CSS
- `server/`,`functions/api/`: Cloudflare Pages Functions API · `api/`: 테스트·Vercel 호환 어댑터(삭제 금지)
- `public/assets/`: 에셋 · `tests/`: 회귀 테스트
- 영역별 핵심 파일·관련 테스트 색인: **`docs/CODE_MAP.md` §1 표**(작업 전 필수)

## 2인 협업 선점 규칙
1. `git pull` 후 `docs/TASK.md` 진행 현황 확인(개인 상세 `docs/TASK_<GitHub ID>.md`).
2. 시작 전 `docs/TASK.md`에 `[-]`(번호·브랜치·수정 파일)를 등록해 바로 푸시한다.
3. 다른 `[-]` 작업과 기능·수정 파일이 겹치면 **즉시 중단해 보고**한다.
4. 완료는 검증 통과 후에만 `[x]`. `main` 직접 커밋·푸시 금지, 브랜치+PR 병합.

## 공용 파일·호환성
- `server/`, `functions/api/`, `src/game/store.ts`, `src/game/items.ts`, `src/game/world.ts` 등 공용 모듈 수정 시 기존 API·응답·에러 코드·테스트 계약 유지.
- 저장은 Turso DB 전용. **로컬(브라우저) 세이브 저장 금지**, 기존 세이브 형식 전방 호환 유지.
- 운영 배포는 Cloudflare Pages(`djrpg`)만, Vercel 재시도 금지. `.env*`·API 키·DB 토큰은 커밋·로그·번들 금지.

## 성별·직업 교차 동기화
- 외형·모션·전투·장비·스킬 수정 시 남/여 **및 전 직업**에 동시 반영한다.
- 완료 전 `rg`로 `gender`·직업 분기를 교차 점검. 직업 예외는 명시적 분기만.

## 검증 & 토큰 절약
- `npm run check && npm test && npm run build` 통과 후 완료 처리. 미실행·실패 검증을 성공으로 기록하지 않는다.
- **작업 전 `docs/CODE_MAP.md` §1에서 해당 작업 영역만 찾아, 지정된 핵심 파일과 관련 테스트만 연다. 전체 코드 탐색·`CODE_MAP.md` 전수 읽기 금지.** `rg`는 지정 파일 안에서만 쓰고 전체 트리·과거 로그 통독은 금지.
- 브라우저 실기·Playwright·Computer Use는 요청 시에만 실행.
