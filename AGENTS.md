# DJRPG 작업 규칙 (Codex)

Vite + TypeScript + PixiJS 기반 모바일 2.5D RPG. 이 파일은 **항상 필요한 규칙만** 둔다. 작업별 상세는 링크된 문서만 읽는다.

## 컨텍스트 로딩 — 필요한 것만 읽기
1. `docs/TASK.md`에서 담당 작업의 상태와 상세 지시서 링크만 확인한다. 링크된 작업 파일만 연다.
2. 증상으로 찾을 때 `docs/QUICK_PATCH.md` → `docs/CODE_MAP.md` → 해당 도메인 매뉴얼 **1개** → 핵심 파일 순서로 읽는다.
3. `docs/WORKLOG.md`는 최근 기록만 제공한다. 과거 이력은 `rg`/정확한 작업 번호로 검색해 필요한 구간만 읽는다. `TASK-history`, `WORKLOG-history`, `TASK_ARCHIVE` 전체 읽기는 금지한다.
4. 전체 저장소 탐색 대신 도메인 매뉴얼의 핵심 파일만 확인한다。

## 변경·아키텍처 규칙
- **한 PR = 한 도메인.** 다른 도메인 파일은 계약(함수 시그니처·응답 코드)만 확인한다. 도메인 경계를 넘으면 PR 본문에 이유를 적고 관련 매뉴얼을 갱신한다.
- SRP를 지킨다. 판정·상수·규칙은 한 곳에만 두고, 쪼갤 수 있는 로직은 순수 도메인 모듈로 분리한다. 계층 방향은 `src/ui` → `src/game` → `src/game/sync.ts` → `/api` → `server/*`다(예외: `sync.ts` → `ui/login.ts`).
- 구조 개선 순서와 상세 설계는 `docs/ARCHITECTURE.md`를 따른다.
- `api/*.mjs`(Vercel·테스트 어댑터)와 `functions/api/*.js`(Cloudflare 어댑터)는 삭제하지 않는다.
- 공용 계약 `server/`, `functions/api/`, `src/game/{store,items,world}.ts` 변경 시 기존 API·응답·오류 코드·테스트 계약을 유지한다. 세이브는 Turso DB 전용이며 로컬 세이브 저장 금지, 세이브 형식은 전방 호환을 유지한다.
- 비밀키·DB 토큰·`.env*`는 커밋·로그·번들에 넣지 않는다. 배포 대상은 Cloudflare Pages `djrpg`만이며 Vercel 재배포는 금지한다。

## 직업·외형·에셋
- 직업은 전사·궁수·마법사 3종. 외형·모션·장비·스킬 변경은 남/여를 함께 반영하고 `gender` 분기를 확인한다.
- 외형·코스튬은 `docs/COSTUME_SYSTEM.md`, Blender 2.5D 파이프라인은 `docs/BLENDER_25D_PIPELINE.md`를 단일 기준으로 삼는다. 매니페스트·아틀라스를 손으로 수정하지 말고 지정 빌더를 사용한다. Save·아이템 UUID·소유권·능력치·DB/API 계약은 외형 작업에서 변경하지 않는다。

## 협업·작업 번호
1. 착수 전 `gh pr list -R songduckjin/DJRPG --state open` 등으로 열린 PR과 동일 주제·파일을 확인한다. 같은 기능이면 새 작업을 만들지 말고 기존 PR에 합류하거나 중단 보고한다.
2. `main` 직접 커밋·푸시 금지. 작업별 브랜치와 PR을 사용하고 다른 작업자의 브랜치·미완료 커밋을 덮어쓰지 않는다.
3. 작업 번호는 PR 단계에서 선점하지 않는다. `main` 병합 또는 일괄 문서 정리 시 확정한다. 새 작업은 `TASK.md`에 `[-]`로 등록하고, 검증 전 `[x]`로 마감하지 않는다.

## 배포·검증
- 게임 코드·게임 API·`src/game/**`·`src/ui/**`·`public/assets/**` 변경은 **점검 ON → 배포 → 운영 정상화 확인 → 점검 OFF** 순서다. `public/maintenance.json`에 예상 완료 시각(`eta`)을 반드시 둔다. `/`·`version.json`·`/maintenance.json`·`/api/account` 정상 JSON·게스트 로그인/저장·Cloudflare Pages 성공을 확인한 뒤에만 점검을 끈다. 실패하면 점검을 유지한다.
- 게임에 영향 없는 문서·관리자 포털 전용 변경은 점검 없이 배포할 수 있으나, 배포 후 정상화 확인은 동일하게 한다. 영향 여부가 불명확하면 점검을 사용한다.
- 기본 검증은 `npx tsc --noEmit` + 해당 도메인 매뉴얼의 테스트만 실행한다. 전체 `npm test`·빌드는 공용 계약 수정 또는 사용자 요청 시에만 한다. 이미지 변경 시 `node scripts/verify-item-art.mjs`도 실행한다.
- 실행하지 않은 테스트·실브라우저 확인을 통과했다고 기록하지 않는다. 검증 실패는 `origin/main` 기준선과 비교해 신규 실패 여부를 구분한다.
