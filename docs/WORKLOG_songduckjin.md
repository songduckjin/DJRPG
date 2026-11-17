## 2026-11-17 · 작업 121 · songduckjin
- 사용자가 Cloudflare에서만 작업·배포하고 Vercel의 이중 배포를 끝내도록 정책 변경을 요청했다. 신규 임시 계정으로 가입·로그인·저장·불러오기·창고 조회·거래소 조회를 운영 Pages에서 확인했다.
- `AGENTS.md`에 Cloudflare 단일 운영 배포와 Vercel 배포 재시도 금지를 명시하고, 공개 작업·배포 이력을 갱신했다. Vercel 프로젝트의 GitHub 연결을 해제하고 미연결 상태를 확인했다. 프로젝트 자체는 남아 있다.

## 2026-11-17 · 작업 119 · songduckjin
- Cloudflare 로그인 계정과 GitHub 연결 계정의 `songduckjin`을 확인했다. 기존 `djrpg` Worker의 GitHub 빌드는 pnpm 9가 루트 패키지 목록을 찾지 못해 설치에서 실패했다.
- Pages 전환 브랜치에서 최신 `main` 통합 후 타입 검사·213개 테스트·프로덕션 빌드 통과. `pnpm-workspace.yaml`에 루트 패키지를 명시했고 Pages 프로젝트 연결·운영 API 검증은 진행 중이다.
- Pages 프로젝트를 GitHub `main`에 연결해 정적 첫 배포를 확인했다. Functions는 PR #32 반영 전이라 미배포이며, Vercel 검사 실패로 PR 병합이 자동 승인 검토에서 거절돼 운영 전환은 보류했다.
- Preview 빌드에 Pages Functions 4개가 등록됐고, Production/Preview에 Turso DB URL·토큰을 암호화 비밀로 저장했다. 비밀 반영 재배포 후 Preview의 405 메서드 응답과 운영 DB의 존재하지 않는 계정 조회 401을 확인했다. 실제 계정 변경을 수반하는 스모크는 Vercel 신형 해시 운영 반영 전까지 보류한다.

## 2026-11-17 · 작업 94 · songduckjin
- 캐릭터 3슬롯 선택·생성 UI와 계정 공용 골드·창고, 캐릭터별 세이브/아이템 귀속 구현.
- 기존 단일 세이브를 슬롯 1로 비파괴 이전하고 거래소의 계정별 상태를 유지.
- `api/`, `server/`, `src/ui/`, `src/game/sync.ts`, `src/styles/`, `tests/characters.test.mjs` 변경.
- 타입 검사·168개 테스트·프로덕션 빌드·diff 검사 통과. 응답 유실과 5xx 이후 창고 이동을 같은 요청 ID로 재확인한다. PR #24 검토·운영 DB 백업 대기.
- 최신 main의 보상·우편함·장비 가방 용량 변경을 통합했다. 보상 요청의 슬롯 검증과 보상 아이템의 캐릭터 귀속을 추가했고, 타입 검사·197개 테스트·프로덕션 빌드·diff 검사를 통과했다.
- 운영 Turso DB의 읽기 전용 사본을 `.backups/`에 생성하고 전체 테이블 행 수·무결성·외래 키를 확인했다. 복원 모의 검사는 사용자 요청에 따라 제외하고, 배포 후 기존 계정의 슬롯 1 조회를 확인한다.
- 최신 main `0b07420` 통합 후 테스트 임시 DB 닫기 경합을 보정했다. 타입 검사·208개 테스트·프로덕션 빌드·diff 검사 통과. Vercel Preview는 빌드 횟수 제한으로 실패해 재시도 필요.
