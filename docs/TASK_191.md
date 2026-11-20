# [작업 191] 슬롯별 방치 시작·자동등반 사망 중단

- **목표**: 생성된 캐릭터 슬롯마다 방치 버튼을 제공해 해당 캐릭터를 선택하고 자동 사냥을 시작한다. 보스 처치 후 자동으로 다음 층에 진입하며, 사망하면 자동등반을 중단한다.
- **방치 버튼**: 슬롯 버튼은 기존 캐릭터 선택 동작을 이용한다. 현재 선택된 슬롯을 누르면 현재 사냥을 유지한다. 광고/결제 연동 및 30분 방치 정산은 후속 작업이며 이번에는 구현하지 않는다.
- **범위**: `src/game/world.ts`, `src/ui/modals/charactersModal.ts`, `src/styles/modals.css`, `tests/world-movement.test.mjs`, `tests/modal-ui.test.mjs`, `docs/CODE_MAP.md`, `docs/QUICK_PATCH.md`.
- **계약**: `Save` 형식·API·DB·오프라인 보상 공식은 변경하지 않는다. 자동 전투 재생성/부활은 기존 흐름을 유지하되, 사망 시 `autoClimb`만 꺼서 다음 보스 처치 뒤 층이 오르지 않게 한다. 미생성 슬롯에는 방치 버튼을 표시하지 않는다.
- **겹침 확인**: 현재 `[-]` 작업 146(DB 이관) 및 157(스킬 이펙트)과 기능·수정 파일이 겹치지 않는다.
- **검증**: `pnpm exec tsc --noEmit`, `node --test tests/world-movement.test.mjs tests/modal-ui.test.mjs`, `git diff --check`.
