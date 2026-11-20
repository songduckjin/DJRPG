# [작업 203] 41층 도달 이후 자동 분해 `+단계` 필터(`+N까지`)

- **목표**: 41층에 닿은 뒤로는 자동 분해가 등급만 보고 지우지 않고, 플레이어가 고른 `+N까지` 단계까지만 지운다. 그보다 높은 단계는 지금 낀 장비보다 약해도 경매장에 팔 수 있게 가방에 남긴다.
- **범위**: `docs/QUICK_PATCH.md`의 작업 203 행에 등록한 파일과 관련 테스트. `docs/TASK.md` 등록 → 미리보기 푸시 → (사용자 확인 후) `main` 병합·운영 배포.
- **사용자 확정 스펙** (11-20 대화):
  - 41층부터 활성화, `save.maxFloor < 41`이면 예전과 완전히 동일(등급 기준만, 필터도 안 보임 — 그 아래는 내 장착템보다 강한 템이 이미 `autoSalvageBlock`의 `upgrade`로 보호된다).
  - 표기는 `+0까지` ~ `+7까지`("까지로표기하자"), 기본값 `+4까지`.
  - `+4까지`를 고르면 `+0 ~ +4`가 자동 분해 대상이고 `+5 ~ +7`은 보관("보호가아니고 저거선택하면 +4까지 삭제인거야").
  - 선택값은 기기 저장(`localStorage` `djrpg-auto-salvage-plus`, 범위 0~7).
- **동작**:
  - `inventory.ts` `autoSalvageBlock(save, item, maxRarity, maxPlus?)` — `save.maxFloor >= 41`이고 `plusOf(item) > maxPlus`이면 `'plus'`로 남긴다. `autoSalvageRecovered`도 같은 인자를 받아 같은 규칙을 쓴다.
  - `world.ts` — `autoSalvagePlus` 훅(UI가 매 회수마다 최신값을 준다)을 `sweeps`와 회수 지점에 넘긴다. 가방이 가득 차도 상한 안의 장비는 회수되고, 상한 위 장비는 바닥에 남는다.
  - `ui/salvagePlus.ts`(신규) — 저장·라벨·41층 게이트. 장비창 가방 하단(`equipModal`)과 설정 '사냥'(`utilityModal`)에 같은 값의 `select.salvage-plus`가 41층 이상에서만 보인다.
  - 일괄 분해(`salvagePlan`/`salvageItems`)는 플레이어가 직접 고른 목록이므로 `maxPlus`를 적용하지 않는다. 오프라인 정산(`offline.ts`)도 그대로 자동 분해 없음.
- **계약**: Save/서버 형식 무변경(선택값은 기기 저장이며 `store.ts` `clearLegacySave`가 세이브 초기화 때 함께 지운다). `autoSalvageBlock`은 기존 3인자 호출 그대로 동작(선택 인자).
- **검증**: `npx tsc --noEmit`, `npx vite build`, 신규 `tests/salvage-plus.test.mjs` 11/11, 관련 회귀(`auto-salvage`·`salvage-rarity`·`salvage-protection`·`item-plus`·`modal-ui`·`item-protection-ui`) 51 통과, 전체 `tests/*.test.mjs` 601건 중 554 통과(실패 47건은 모두 sparse 체크아웃에 `public/assets/**` 이미지가 없어 생기는 기존 실패 — `api/**`·`functions/**`를 채운 뒤 `characters`·`dungeon-ranking`·`functions-adapter`·`market` 42건은 전부 통과).
