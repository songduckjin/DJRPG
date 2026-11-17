## 2026-11-17 · 작업 94 · songduckjin
- 캐릭터 3슬롯 선택·생성 UI와 계정 공용 골드·창고, 캐릭터별 세이브/아이템 귀속 구현.
- 기존 단일 세이브를 슬롯 1로 비파괴 이전하고 거래소의 계정별 상태를 유지.
- `api/`, `server/`, `src/ui/`, `src/game/sync.ts`, `src/styles/`, `tests/characters.test.mjs` 변경.
- 타입 검사·168개 테스트·프로덕션 빌드·diff 검사 통과. 응답 유실과 5xx 이후 창고 이동을 같은 요청 ID로 재확인한다. PR #24 검토·운영 DB 백업 대기.
