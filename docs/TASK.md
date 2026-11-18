# DJRPG 작업 지시서 (TASK.md)

> 이 문서에는 **공개 진행 현황과 미완료 작업만** 둔다. 개인 상세는 `docs/TASK_<GitHub ID>.md`, 완료 이력은 `docs/TASK_ARCHIVE.md`, 작업·PR·배포 기록은 `docs/WORKLOG.md`를 본다.
> 새 작업은 시작 전 `[-]`로 등록해 푸시하고, 다른 `[-]` 작업과 기능·파일이 겹치면 중단 보고한다. 검증 통과 후에만 `[x]`로 마감하고 아카이브로 옮긴다.

## 진행 현황

| 작업 | 담당자 | 브랜치 | 수정 예정 파일 / 영향 영역 | 위험 등급 | 상태 |
|---|---|---|---|---|---|
| 133 장비창 실제 착용 캐릭터 이미지 | fks3997 | `task/133-equipped-character-art` | `public/assets/warrior_equipped*.png`, `src/ui/equipmentPortrait.ts`, `src/ui/modals/equipModal.ts`, `src/styles/modals.css`, `tests/equipped-detail.test.mjs` | 중 | [-] |
| 134 필드 캐릭터 통합 바디 복구 및 무기 소켓·액션 자연화 | codex | `task/134-field-gear-action` | `src/game/render/entities.ts`, `src/game/render/heroSockets.ts`(신규), `src/game/render/vfx.ts`, `tests/hero-weapon-render.test.mjs` / 필드 캐릭터 외형·무기 렌더링 | 중 | [-] |

> 2026-11-17: `[작업 61] 단일 기기 로그인 강제`를 검증·PR 병합으로 마감하고 `docs/TASK_ARCHIVE.md`로 옮겼다.
