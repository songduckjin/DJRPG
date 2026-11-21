# [작업 199] Windows 테스트 임시 DB 잠금 정리

- **증상**: 전체 테스트에서 `tests/migrate-turso-db.test.mjs`, `tests/world-boss-live.test.mjs`, 일부 캐릭터 테스트가 Windows `EBUSY`로 임시 SQLite 파일을 지우지 못해 실패한다.
- **목표**: 실제 DB 연결 누수를 찾고, 파일이 필요 없는 테스트는 메모리 DB를 쓴다. 파일 DB가 필요한 이관 테스트는 연결 종료와 임시 디렉터리 정리를 신뢰성 있게 처리한다. 테스트 의미는 유지한다.
- **범위**: `tests/{migrate-turso-db,world-boss-live,characters,market}.test.mjs`, `tests/helpers/{temp-db,remove-temp-db}.mjs`, `docs/{CODE_MAP,QUICK_PATCH,TASK_199}.md`.
- **겹침 확인**: 작업 146은 PR #91, 작업 191·192는 PR #123, 작업 193은 PR #126으로 병합됐다. 진행 중인 다른 작업과 수정 파일이 겹치지 않는다.
- **검증**: 영향 테스트를 Windows에서 반복 실행한다. 공용 계약 파일은 수정하지 않는다.
- **처리**: 월드보스 테스트는 공유 메모리 DB로 전환한다. 이관·캐릭터 테스트처럼 파일 DB가 필요한 경우에는 Windows libsql 네이티브 핸들이 `close()` 직후 남을 수 있으므로, 잠긴 디렉터리만 테스트 프로세스 종료 후 별도 숨김 프로세스에서 재시도해 지운다. 임시 경로는 OS 임시 폴더의 허용된 접두사만 받는다.
- **전체 테스트 발견**: 작업 193의 `schema()`가 `execute()`로 세션 열을 확인하도록 바뀌었으므로 `market` 테스트의 배치 전용 모의 객체에 `execute()`를 추가하고, 신규 스키마 테스트 파일 DB를 메모리 DB로 교체한다.
- **검증 결과**: 최신 `main` 통합 후 TypeScript 검사와 관련 테스트 53/53 통과. 전체 테스트 563건 중 561건 통과, 기존 `costume-field-render` 남녀 2건만 실패. Windows 임시 DB 잠금과 `market` 스키마 모의 객체 오류는 재현되지 않았다.
