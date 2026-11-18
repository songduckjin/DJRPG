# DJRPG 작업 지시서 (TASK.md)

> 이 문서에는 **공개 진행 현황과 미완료 작업만** 둔다. 개인 상세는 `docs/TASK_<GitHub ID>.md`, 완료 이력은 `docs/TASK_ARCHIVE.md`, 작업·PR·배포 기록은 `docs/WORKLOG.md`를 본다.
> 새 작업은 시작 전 `[-]`로 등록해 푸시하고, 다른 `[-]` 작업과 기능·파일이 겹치면 중단 보고한다. 검증 통과 후에만 `[x]`로 마감하고 아카이브로 옮긴다.

## 진행 현황

| 작업 | 담당자 | 브랜치 | 수정 예정 파일 / 영향 영역 | 위험 등급 | 상태 |
|---|---|---|---|---|---|
| 162 월드보스 실전 활성화 | fks3997 | feature/world-boss-live-fks3997 | server/world-boss*.mjs, server/endpoints/world-boss.mjs, functions/api/world-boss.js, src/game/worldBossLive.ts, src/ui/worldBoss{Preview,Field,Result}.ts, src/ui/modals/worldBossModal.ts, src/main.ts, tests/world-boss-live.test.mjs, 문서 / 공유HP·3회·순위·우편보상 | 상 | [-] |
| 161 크롬 필드 mesh 렌더 오류 | fks3997 | fix/chrome-mesh-pipe-fks3997 | src/game/pixiSetup.ts 신규, src/main.ts, 문서 / MeshPipe 초기등록 | 상 | [-] |
| 136 통합 내 정보(장비·스탯) UI 개편 및 4티어 장비창 초상화 교체 | songduckjin (`codex` 실행) | `task/136-unified-equip-ui` | `src/ui/interface.ts`, `src/ui/modals/equipModal.ts`, `src/ui/modals/statusModal.ts`(삭제), `src/ui/modals/accountModal.ts`, `src/ui/equipmentPortrait.ts`, `src/styles/modals.css`, `src/styles/hud.css` / 하단 내비 3탭·통합 내 정보 모달·장비창 티어 초상화 | 중 | [-] |
| 140 본 게임 필드 렌더러 독립형 코스튬 전환 | songduckjin | `task/140-costume-field-renderer` (대기) | `src/game/render/entities.ts`, `src/game/render.ts`, `src/game/render/heroMotion.ts`, `src/game/render/heroScale.ts`, `src/game/render/heroSockets.ts`, `AGENTS.md`, `docs/CODE_MAP.md`, `docs/QUICK_PATCH.md` / 필드 캐릭터 렌더 전환 | 상 | [ ] |
| 141 장비창(내 정보) 공용 외형 연동 | songduckjin | `task/141-costume-ui-sync` (대기) | `src/ui/equipmentPortrait.ts`, `src/ui/modals/equipModal.ts`(필요 시), `tests/equipped-detail.test.mjs` / 장비창 미리보기를 공용 코스튬 외형 계획으로 통합 | 중 | [ ] |
| 142 코스튬 에셋 양산·아틀라스 패킹 및 레거시 리소스 정리 | songduckjin | `task/142-costume-atlas-cleanup` (대기) | `public/assets/**`(코스튬 아틀라스·매니페스트), `tools/costume-viewer/**` 임시 에셋, 구형 통합 바디 시트·미사용 레거시 코드(참조 0 확인 후 삭제) | 중 | [ ] |

> 2026-11-18: `[작업 139]`을 검증·PR #76 병합으로 마감하고 완료 이력을 `docs/TASK_ARCHIVE.md`로 옮겼다. `src/game/costume/**`(매니페스트 로더·검증·캐시, 고유 이름 75종 매핑(55 `costumeId` + 20 `none`), 폴백 4경로, 캐시 버스터, 스킬 8종 템플릿)와 `tests/costume-manifest.test.mjs` 14건, `docs/COSTUME_SYSTEM.md` v1.1을 반영했다. 게임 화면·Save/DB/API는 무변경(렌더러 미연결)이며, 다음 착수 대상은 `[작업 140]`(필드 렌더러 전환)이다.
> 2026-11-18: `[작업 137]`은 PR #73으로 main에 병합되어 완료 이력을 docs/TASK_ARCHIVE.md로 옮겼다.
> 2026-11-18: 코스튬 후속 로드맵 `[작업 139]`~`[작업 142]`를 `[ ]`로 등록했다. 순서는 138(도구 비교·뷰어 프로토타입) → 139(스펙 v1.1·매니페스트·아이템 매핑) → 140(필드 렌더러 전환) → 141(장비창 공용 외형 연동) → 142(에셋 양산·아틀라스·레거시 정리)이며, 각 작업은 선행 작업 머지 후 `origin/main` 기준으로 착수한다.
> 2026-11-18: `[작업 138]`을 검증·PR #74 병합으로 마감하고 완료 이력을 `docs/TASK_ARCHIVE.md`로 옮겼다. 가림 방식(파츠 숨김 vs 교체) 모델·화면 토글·단위 테스트를 추가하고, 도구 3종 정량 비교(번들·Draw Call·FPS·힙)와 브라우저 실측(콘솔 오류 0건)을 기록했다. 결론과 수치는 `tools/costume-viewer/TOOL_COMPARISON.md`에 있다. 다음 착수 대상은 `[작업 139]`이며 `origin/main` 기준으로 시작한다.
> 2026-11-18: `[작업 136]`은 UI 레이아웃(`내 정보` 3탭)만 선머지 가능하며, 최종 초상화 공용화는 `[작업 141]`에서 통합한다.
> 2026-11-18: `[작업 135]`는 PR #71로 main에 병합되어 완료 이력을 `docs/TASK_ARCHIVE.md`로 옮겼다. 기존 통합 바디·팔레트 구현은 현행 구현 이력이며 신규 코스튬 정책과 구분한다.
> 2026-11-18: `[작업 136]`(통합 내 정보(장비·스탯) UI 개편 및 4티어 장비창 초상화 교체)를 `[-]`로 등록했다. 남/여 2·3·4티어 장비창 전신 초상화 6장(`public/assets/warrior_equipped_t{2,3,4}_{male,female}.png`, 높이 720px·256색 팔레트 PNG, 합계 355KB)을 함께 넣었고 `.ts`/`.css` 코드는 건드리지 않았다. 착수는 `[작업 135]` 코드 머지 후 `origin/main` 기준.
> 2026-11-18: `[작업 135]`(갑옷·투구 10종 외형 차별화 — 4티어 실루엣 + 팔레트 스왑, 피부톤 보존 틴트)를 `[-]`로 등록했다.
> 2026-11-17: `[작업 61] 단일 기기 로그인 강제`를 검증·PR 병합으로 마감하고 `docs/TASK_ARCHIVE.md`로 옮겼다.
