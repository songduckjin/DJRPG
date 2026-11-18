# DJRPG 작업 지시서 (TASK.md)

> 이 문서에는 **공개 진행 현황과 미완료 작업만** 둔다. 개인 상세는 `docs/TASK_<GitHub ID>.md`, 완료 이력은 `docs/TASK_ARCHIVE.md`, 작업·PR·배포 기록은 `docs/WORKLOG.md`를 본다.
> 새 작업은 시작 전 `[-]`로 등록해 푸시하고, 다른 `[-]` 작업과 기능·파일이 겹치면 중단 보고한다. 검증 통과 후에만 `[x]`로 마감하고 아카이브로 옮긴다.

## 진행 현황

| 작업 | 담당자 | 브랜치 | 수정 예정 파일 / 영향 영역 | 위험 등급 | 상태 |
|---|---|---|---|---|---|
| 129 · 장착 장비 착용형 아트 제작 | songduckjin | `codex/129-wearable-gear-assets` | `public/assets/wearable/`, `src/game/items.ts`, `src/game/render.ts`, `src/game/render/entities.ts`, `scripts/verify-item-art.mjs`, 렌더·아이템 매핑 테스트 / 장비창·공격 모션 | 주의(공용 아이템 표시·캐릭터 렌더링) | [-] 다섯 부위별 착용 아트와 이름 매핑 제작 |

> 2026-11-17: `[작업 61] 단일 기기 로그인 강제`를 검증·PR 병합으로 마감하고 `docs/TASK_ARCHIVE.md`로 옮겼다.
