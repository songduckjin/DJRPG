# [작업 194] Windows 테스트 임시 DB 잠금 정리

- **증상**: 전체 테스트에서 `tests/migrate-turso-db.test.mjs`, `tests/world-boss-live.test.mjs`, 일부 캐릭터 테스트가 Windows `EBUSY`로 임시 SQLite 파일을 지우지 못해 실패한다.
- **목표**: 실제 DB 연결 누수를 찾고, 파일이 필요 없는 테스트는 메모리 DB를 쓴다. 파일 DB가 필요한 이관 테스트는 연결 종료와 임시 디렉터리 정리를 신뢰성 있게 처리한다. 테스트 의미는 유지한다.
- **범위**: `tests/{migrate-turso-db,world-boss-live,characters}.test.mjs`, 필요 시 `tests/helpers/temp-db.mjs`, `docs/{CODE_MAP,QUICK_PATCH,TASK_194}.md`.
- **겹침 확인**: 작업 146은 PR #91, 작업 193은 PR #126으로 병합됐다. 진행 중인 다른 작업과 수정 파일이 겹치지 않는다.
- **검증**: 영향 테스트를 Windows에서 반복 실행한다. 공용 계약 파일은 수정하지 않는다.
