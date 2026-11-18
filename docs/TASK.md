# DJRPG 작업 지시서 (TASK.md)

> 이 문서에는 **공개 진행 현황과 미완료 작업만** 둔다. 개인 상세는 `docs/TASK_<GitHub ID>.md`, 완료 이력은 `docs/TASK_ARCHIVE.md`, 작업·PR·배포 기록은 `docs/WORKLOG.md`를 본다.
> 새 작업은 시작 전 `[-]`로 등록해 푸시하고, 다른 `[-]` 작업과 기능·파일이 겹치면 중단 보고한다. 검증 통과 후에만 `[x]`로 마감하고 아카이브로 옮긴다.

## 진행 현황

| 작업 | 담당자 | 브랜치 | 수정 예정 파일 / 영향 영역 | 위험 등급 | 상태 |
|---|---|---|---|---|---|
| 155 시작글자 퇴장 후 전투 | fks3997 | feature/world-boss-preview-fks3997 | src/ui/worldBossIntro.ts, src/ui/worldBossField.ts, 입장테스트·문서 / 전투 시작 게이트 | 낮음 | [-] |
| 135 갑옷·투구 10종 외형 차별화 (4티어 실루엣 + 팔레트 스왑) | songduckjin (`codex` 실행) | `task/135-armor-tier-palette` | `src/game/appearance.ts`, `src/game/render/entities.ts`, `src/game/render/gearTint.ts`(신규), `tests/appearance.test.mjs` / 필드 갑옷·투구 외형(티어 시트 + 팔레트 스왑) | 중 | [-] |
| 136 통합 내 정보(장비·스탯) UI 개편 및 4티어 장비창 초상화 교체 | songduckjin (`codex` 실행) | `task/136-unified-equip-ui` | `src/ui/interface.ts`, `src/ui/modals/equipModal.ts`, `src/ui/modals/statusModal.ts`(삭제), `src/ui/modals/accountModal.ts`, `src/ui/equipmentPortrait.ts`, `src/styles/modals.css`, `src/styles/hud.css` / 하단 내비 3탭·통합 내 정보 모달·장비창 티어 초상화 | 중 | [-] |

> 2026-11-18: `[작업 136]`(통합 내 정보(장비·스탯) UI 개편 및 4티어 장비창 초상화 교체)를 `[-]`로 등록했다. 남/여 2·3·4티어 장비창 전신 초상화 6장(`public/assets/warrior_equipped_t{2,3,4}_{male,female}.png`, 높이 720px·256색 팔레트 PNG, 합계 355KB)을 함께 넣었고 `.ts`/`.css` 코드는 건드리지 않았다. 착수는 `[작업 135]` 코드 머지 후 `origin/main` 기준.
> 2026-11-18: `[작업 135]`(갑옷·투구 10종 외형 차별화 — 4티어 실루엣 + 팔레트 스왑, 피부톤 보존 틴트)를 `[-]`로 등록했다.
> 2026-11-17: `[작업 61] 단일 기기 로그인 강제`를 검증·PR 병합으로 마감하고 `docs/TASK_ARCHIVE.md`로 옮겼다.
