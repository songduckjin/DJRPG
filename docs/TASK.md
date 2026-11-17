# DJRPG 작업 지시서 (TASK.md)

> 이 문서에는 **공개 진행 현황과 미완료 작업만** 둔다. 개인 상세는 `docs/TASK_<GitHub ID>.md`, 완료 이력은 `docs/TASK_ARCHIVE.md`, 작업·PR·배포 기록은 `docs/WORKLOG.md`를 본다.
> 새 작업은 시작 전 `[-]`로 등록해 푸시하고, 다른 `[-]` 작업과 기능·파일이 겹치면 중단 보고한다. 검증 통과 후에만 `[x]`로 마감하고 아카이브로 옮긴다.

## 진행 현황

| 작업 | 담당자 | 브랜치 | 수정 예정 파일 / 영향 영역 | 위험 등급 | 상태 |
|---|---|---|---|---|---|
| 61 · 단일 기기 로그인 강제 | 미배정 | — | `server/database.mjs`, `api/account.mjs`, `api/market.mjs`, `api/market-events.mjs`, `src/game/sync.ts`, `src/ui/login.ts` / 세션 토큰 계약 | 핵심 공통 | [ ] 미착수 |

---

## [ ] [작업 61] 단일 기기 로그인 강제 (새 기기 로그인 시 기존 기기 자동 접속 해제)
- **등록일**: 2026-11-16 · **담당자**: 미배정(착수 전 배정 필요)
- **목표**: 같은 계정으로 새 기기·새 탭에서 로그인하면 서버가 기존 세션 토큰을 즉시 무효화해, 이전 기기가 저장 충돌 없이 자동 접속 해제되게 한다.
- **작업 내용**
  1. `djrpg_accounts`에 `session_id TEXT` 추가(기존 DB는 `ALTER TABLE ... ADD COLUMN` 예외 처리). `login`·`register`·`guest` 성공마다 새 `sessionId`를 저장하고 토큰 페이로드에 `{ id, sid, exp }`를 넣는다.
  2. 인증 API(`session`·`save`·`logout`·거래소·이벤트 스트림)에서 토큰 `sid`가 DB `session_id`와 다르면 `401 { code: 'SESSION_REPLACED', error: '다른 기기에서 로그인되어 접속이 해제되었습니다.' }`. `logout`은 `session_id`를 비운다.
  3. 클라이언트(`sync.ts`, `login.ts`)는 `401`(`SESSION_REPLACED`/`UNAUTHORIZED`)에서 자동저장·재연결 루프를 멈추고 토큰을 지운 뒤 로그인 화면에 안내 문구를 띄운다.
- **완료 기준**: 단일 세션 회귀 테스트 추가·통과, `npm run check`·`npm test`·`npm run build` 통과, `docs/WORKLOG.md` 상단 5줄 이내 기록. 브라우저 실기 테스트는 실행하지 않는다.
- **원문**: 압축 전 전체 지시는 정리 직전 커밋 `262408e`의 `docs/TASK.md`에 있다.
