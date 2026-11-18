# DJRPG 작업 지시서 (TASK.md)

> 이 문서에는 **공개 진행 현황과 미완료 작업만** 둔다. 개인 상세는 `docs/TASK_<GitHub ID>.md`, 완료 이력은 `docs/TASK_ARCHIVE.md`, 작업·PR·배포 기록은 `docs/WORKLOG.md`를 본다.
> 새 작업은 시작 전 `[-]`로 등록해 푸시하고, 다른 `[-]` 작업과 기능·파일이 겹치면 중단 보고한다. 검증 통과 후에만 `[x]`로 마감하고 아카이브로 옮긴다.

## 진행 현황

| 작업 | 담당자 | 브랜치 | 수정 예정 파일 / 영향 영역 | 위험 등급 | 상태 |
|---|---|---|---|---|---|
| 128 · 장착 장비별 캐릭터 외형 적용 | songduckjin | `codex/128-equipped-gear-appearance` | `src/game/render/entities.ts`, `tests/hero-weapon-render.test.mjs`, 작업·배포 기록 / 투구·갑옷·장갑·신발·검 장착 및 공격 모션 외형 | 주의(공용 캐릭터 렌더링) | [-] 기존 슬롯별 아트 연결 및 공격 상태 외형 확인 |

> 2026-11-17: `[작업 61] 단일 기기 로그인 강제`를 검증·PR 병합으로 마감하고 `docs/TASK_ARCHIVE.md`로 옮겼다.
