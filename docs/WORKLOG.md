## 2026-11-16 · 작업 73
- 거래소 구매가격 안내 줄 제거·착용 장비 이미지/이름/등급 추가. 소유권 읽기/쓰기를 거래 배치에 합쳐 장비 변경 거래 DB 배치 4→2회.
- `sync.ts`, `main.ts`: 사냥 변경 저장을 1초 단위로 묶고 거래가 대기 저장을 흡수, 화면 이탈 명시 저장 유지. 금화 2.5D 시안 생성·수정(아이콘 교체 미적용).
- 검증: 중복 거래·소유권·실패 롤백·DB 왕복·저장 병합 포함 109건, 타입 검사·빌드·diff 검사 통과. 작업 74의 보행/속도 변경 유지, 실기 지연 미측정.

## 2026-11-16 · 작업 74
- `src/game/world.ts`: 몬스터 접근 속도 상한 적용(일반 최대 64, 보스 28).
- `src/game/render/entities.ts`, `heroMotion.ts`: 이동 중 보행 프레임을 공격 이미지보다 우선 표시.
- `tests/hero-motion.test.mjs`, `world-movement.test.mjs`: 남녀 장비 조합·고층 속도 검사.
- 검증: `pnpm run check`, `pnpm test` 104건, `pnpm run build` 통과.

## 2026-11-16 · 작업 72
- `src/game/loadout.ts`, `src/ui/modals/skillModal.ts`: 장착 스킬 해제 버튼·슬롯 초기화·오류 안내 추가.
- `tests/loadout.test.mjs`, `skill-ui.test.mjs`: 해제·재장착·저장 복원·버튼 저장 호출 검사.
- 검증: 최신 main 통합 후 `pnpm run check`, `pnpm test` 95건, `pnpm run build` 통과.

## 2026-11-16 · 작업 70
- 도감 부위 버튼 제거·6등급 오름차순 정렬·등급 수 안내 수정. 거래소 현재/구매/증감 비교표 및 조건 초기화 전체 너비 적용.
- 팝업 재진입 시 필터·선택·스크롤 기본값 복원, 가방 상세를 배열 밖 오버레이로 표시·선택 강조·바깥 클릭 닫기.
- 검증: 비교·정렬·팝업 복원·오래된 응답 차단·오버레이 위치 포함 테스트 92건, 타입 검사·빌드·diff 검사 통과. 브라우저 실기 미실행.

## 2026-11-16 · 작업 71
- `src/game/render/entities.ts`, `heroMotion.ts`: 무기 없는 스킬의 캐릭터 회전·눌림·앵커 왜곡 제거, 돌진·VFX 유지.
- `tests/hero-motion.test.mjs`: 남녀 투구 단독·무기 착용 스킬 동작 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 84건, `pnpm run build` 통과.

## 2026-11-16 · 작업 68
- `src/game/items.ts`, `codex.ts`, `inventory.ts`: 6등급 드랍·스탯·도감·분해 공통 규칙 적용.
- `server/database.mjs`, `market.mjs`, 장비·도감·거래소 스타일·필드 VFX: 새 등급 저장·검색·색상 적용.
- `tests/codex.test.mjs`, `market.test.mjs`: 6등급 생성·저장 호환·거래소 검증.
- 검증: `pnpm run check`, `pnpm test` 82건, `pnpm run build` 통과.

## 2026-11-16 · 작업 69
- `src/game/appearance.ts`, `src/game/render/entities.ts`: 무기 없는 공격·스킬에서 검 공격 시트 대신 현재 장비 외형 유지.
- `tests/appearance.test.mjs`: 남녀·투구·갑옷 무기 없는 조합과 무기 착용 공격 분기 확인.
- 검증: `pnpm run check`, `pnpm test`, `pnpm run build` 통과.

## 2026-11-16 · 작업 67
- `public/assets/wasteland-scene.png`, `src/game/wasteland.ts`, `render/field.ts`, `main.ts`: 선택한 세로 배경 적용, 기존 무작위 장식 제거, 모닥불 3곳에 화면 비례 조명 정렬.
- `src/ui/modals/equipModal.ts`, `codexModal.ts`, `interface.ts`, `src/game/codex.ts`, 관련 스타일: 스킬북 버튼 테마·장비 문구·부위 탭·중앙 등급 필터·등급별 테두리.
- 검증: 배경 크기/조명 정렬·등급 필터 포함 66건, 타입 검사·빌드·`git diff --check` 통과. 진행 중인 작업 66 파일은 수정하지 않음.

## 2026-11-16 · 작업 66
- `public/assets/warrior_female_helm_attack.png`, `warrior_female_oldhelm_attack.png`, `warrior_male_helm_attack.png`: 투구 단독 착용 공격 시트를 보행 2행에서 공격 1행 4프레임으로 교체.
- `src/game/render.ts`: 교체 이미지 캐시 갱신; 기존 `src/game/appearance.ts`의 남녀 투구 단독 외형 연결 확인.
- `tests/hero-art.test.mjs`: 공격 시트 6종의 4×1 비율 검사 추가.
- 검증: `pnpm run check`, `pnpm test` 68건, `pnpm run build` 통과.

## 2026-11-16 · 작업 65
- `public/assets/warrior_male_*_helm.png`, `walk8_male_*_helm.png`, `warrior_male_helm_attack.png`: 남성 투구 단독 정지·보행·공격 이미지 5개 생성.
- `src/game/appearance.ts`, `src/game/render.ts`, `src/game/render/entities.ts`: 남성 갑옷·투구 독립 조합 외형 연결, 여성 분기 유지.
- `tests/appearance.test.mjs`: 남녀 투구 단독·갑옷 동시·개별 해제 회귀 검사.
- 검증: 최신 main 통합 후 `pnpm run check`, `pnpm test` 62건, `pnpm run build`, 성별 분기 `rg`, `git diff --check` 통과.

## 2026-11-16 · PR #4 최신 main 통합 및 배포 검증
- `docs/TASK.md`, `WORKLOG.md`, `src/styles/modals.css`: 충돌 해결, 본 작업 번호 61~64로 정리; 외부 남녀 투구·회화형 메뉴·잔상 수정 유지.
- 검증: 성별 분기 확인, 회귀 62건, `pnpm run check`, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 64
- `src/game/codex.ts`, `src/ui/modals/codexModal.ts`, `src/styles/codex.css`, `interface.ts`: 장비 제목 옆 도감, 기본 장비 75종·검색·부위/발견/보유 필터·그림·등급별 등장 층/옵션 상세·고정 닫기 행.
- `src/game/store.ts`, `api/account.mjs`, `server/database.mjs`: 현재 가방/착용 장비 발견 이관, 분해/판매 후 발견 기록 유지, 이전 클라이언트 저장 시 이력 보존 및 명시적 초기화 처리.
- 검증: 실제 드랍식 대조를 포함한 회귀 58건, `pnpm run check`, `pnpm run build`, `git diff --check` 통과. 브라우저 실기 검증 미실행.

## 2026-11-16 · 작업 61~63
- `src/game/inventory.ts`, `src/ui/modals/salvageModal.ts`, `equipModal.ts`: 기본 일반 분해·빈 장착 부위 분해 확인/취소·가능한 자동 장착 활성화.
- `src/game/loadout.ts`, `store.ts`, `world.ts`, `src/ui/skillLoadout.ts`, `hud.ts`, `skillModal.ts`: 빈 슬롯 저장 호환, 필드 +/빨간 알림·스킬 장착/교체 선택 효과, 슬롯 번호 버튼 제거.
- `src/game/facing.ts`, `render/entities.ts`, `src/styles/`, `src/ui/interface.ts`: 몬스터/보스 원본 왼쪽 시선 보정, 스킬·거래소 닫기 행과 거래소 탭 고정.
- 검증: 회귀 49건, `pnpm run check`, `pnpm run build`, `git diff --check` 통과; 브라우저 실기 검증 미실행.

## 2026-11-16 · 작업 60
- `src/game/appearance.ts`: 남성 갑옷+투구에 기존 일체형 정지·보행·공격·초상화 연결, 여성 분기 유지.
- `src/game/render/entities.ts`, `src/ui/modals/equipModal.ts`, `src/styles/modals.css`: 남녀 투구 2D 덧그리기 제거.
- `tests/appearance.test.mjs`: 남녀 갑옷·투구 조합과 남성 무갑옷 동작 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 34건, `pnpm run build`, 성별 분기 `rg`, `git diff --check` 통과.

## 2026-11-16 · 작업 59
- `public/assets/*oldhelm*.png`: 낡은 투구 아이콘과 같은 검은 뿔투구를 착용한 여성 정지·보행·공격 이미지 8개 생성.
- `src/game/appearance.ts`, `src/game/render.ts`, `src/game/render/entities.ts`: `낡은 투구` 장착 시에만 전용 외형 선택, 다른 투구·해제 시 기존 외형 복귀.
- `tests/appearance.test.mjs`: 갑옷·평상복·무기 유무 및 투구 교체·해제 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 33건, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 58
- `public/assets/warrior_female_*_helm*.png`, `walk8_female_*_helm.png`: 여성 평상복·갑옷의 투구 착용 정지·보행·공격 일체형 이미지 8개 생성.
- `src/game/appearance.ts`, `src/game/render.ts`, `src/game/render/entities.ts`, `src/ui/modals/equipModal.ts`: 여성 투구 착용 시 일체형 이미지 선택, 투구 아이콘 중복 표시 제거.
- `src/styles/modals.css`, `tests/appearance.test.mjs`: 이전 여성 투구 겹침 스타일 제거 및 착용·해제 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 32건, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 57
- `src/game/appearance.ts`, `src/game/render/entities.ts`: 여성 갑옷 정지·보행·공격 자세별 머리 위치에 투구 그림 배치.
- `src/ui/modals/equipModal.ts`, `src/styles/modals.css`: 장비창 초상화와 투구를 같은 크기 기준으로 겹쳐 표시.
- `tests/appearance.test.mjs`: 여성 투구 위치·갑옷 해제 후 투구 유지 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 32건, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 54·55
- `server/`, `src/game/market.ts`, `sync.ts`, `api/market-events.mjs`: 저장+거래 단일 요청·DB 배치·읽기 조회·스키마 재사용, 응답 즉시 상태/수령함 반영 및 1초 스트림·2초 조회.
- `src/game/appearance.ts`, `render/entities.ts`, `src/ui/modals/equipModal.ts`: 몸체와 투구 외형 분리, 갑옷·투구 독립 해제와 저장 유지.
- `public/assets/wasteland-*.png`, `src/game/render.ts`, `render/field.ts`: 시안 1번의 황야 바닥·회화 장식 6종 적용, 장식 스프라이트 재사용.
- 검증: 회귀 30건, `pnpm run check`, `pnpm run build`, `git diff --check` 통과; 운영 체감 지연·모바일 화면은 미측정.

## 2026-11-16 · 작업 53
- `src/styles/hud.css`: 하단 메뉴 4개의 배경·아이콘 반투명 처리, 테두리·그림자 제거.
- `src/ui/interface.ts`: 거래소를 금빛 선 저울 아이콘으로 교체.
- 검증: `pnpm run check`, `pnpm test` 17건, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 52
- `server/`, `api/market*.mjs`, `api/account.mjs`: 공용 매물·검색·판매 기록·수령함, 원자적 거래·소유권 원장·revision·중복 요청 복구·실시간 변경 스트림.
- `src/game/market.ts`, `sync.ts`, `src/ui/modals/marketModal.ts`: 5개 거래소 탭, 필터·장비 비교·등록/구매/취소/수령·알림·재연결; 상단 체력바와 필드 위 금빛 메뉴 4개 적용.
- `tests/`, `docs/MARKET.md`: 17개 거래/동시 구매/가방 포화/충돌/응답 유실 테스트 통과; 기존 사냥 보상 신뢰 한계 기록; `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 51
- `public/assets/item-art/`: 붉은보석 분위기를 참고한 검·방어구·장신구 75종의 고유 회화 그림 15개 시트 제작.
- `src/game/items.ts`, `src/ui/modals/equipModal.ts`, `src/game/render/entities.ts`, `src/styles/modals.css`: 이름별 그림을 가방·장비창·전투 장착 외형에 연결.
- 도형식 SVG 에셋 150개와 생성 스크립트 제거; `scripts/verify-item-art.mjs`, `package.json`에 그림 누락 빌드 검사 추가.
- 검증: 75칸 투명도·내용, `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 50
- `public/assets/equipment/`, `scripts/generate-item-icons.mjs`: 장비 기본형 75종의 투명 전투용 SVG 이미지 생성.
- `src/game/items.ts`, `src/game/store.ts`, `src/ui/modals/equipModal.ts`: 장비 이미지 경로 공통화와 장비창 아이콘 연결 유지.
- `src/game/render.ts`, `src/game/render/entities.ts`: 공격·보행·정지 캐릭터에 착용 장비 이미지 합성 및 장비 교체 시 갱신.
- 검증: SVG 75개 XML 확인, 빌드 산출물 75개 포함, `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 49
- `public/assets/icons/items/`: 검 10종을 포함한 장비 기본형 75종 전용 SVG 아이콘 생성.
- `scripts/generate-item-icons.mjs`, `package.json`: 아이템 목록 기반 아이콘 재생성 명령 추가.
- `src/game/store.ts`, `src/ui/modals/equipModal.ts`: 가방·장비창에 이름별 아이콘 연결, 기존 아이템은 기본 아이콘으로 대체.
- 검증: SVG 75개 XML 확인, 빌드 산출물 75개 포함, `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 48
- `src/game/render/entities.ts`: 정지 상태 발 위치와 바닥 그림자 크기 보정.
- `public/assets/icons/`, `src/ui/modals/equipModal.ts`: 장비창 10개 슬롯과 특수 두손검 아이콘 파일·표시 경로 확인.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 47
- `public/assets/walk8_*.png`: 전사 외형 6종과 해골·보스의 투명 8프레임 보행 시트 제작.
- `src/game/render.ts`, `src/game/render/entities.ts`: 시트 프레임 로딩, 이동 거리 기반 보행 주기와 프레임별 발 위치 정렬 적용.
- 검증: 시트 8개 크기·투명도, `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 46
- `src/game/render.ts`, `src/game/render/entities.ts`: 전사·몬스터·잔상 앵커를 .97로 조정하고 그림자를 발밑에 정렬.
- 보행 바운스 제거; `slam`·`hell`의 점프 연출은 유지.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 45
- `src/game/world.ts`, `src/game/skills.ts`: MP 상태·소모 조건·스킬 비용 데이터 제거; 스킬은 쿨타임으로 발동.
- `src/ui/`, `src/styles/`: MP 구슬과 장비·스킬 설명의 마나 표시 제거.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 44
- `src/game/render.ts`: 사막 타일 URL 캐시 버스터 v2, 바닥 틴트 흰색·불투명도 1 고정.
- `src/game/render/field.ts`: 7겹 비네팅 각 겹의 불투명도를 .04에서 .015로 완화.
- 검증: `pnpm run build` 성공 (TypeScript 검사 포함).

## 2026-11-16 · 작업 42–43
- 조이스틱·AUTO 토글·키보드 이동을 제거하고 자동 추적·전투·루팅을 상시 활성화.
- 스킬북 드랍·가방 보관·사용을 추가하고 습득/강화를 스킬북으로 전환; 기존 스킬 세이브 호환 유지.
- 일괄 분해에서 스킬북 보호, 스킬북 전용 필터·아이콘 추가.
- 검증: `pnpm run check`, `pnpm run build` 성공 (TypeScript 0건).

## 2026-11-15 · 작업 41
- `src/game/items.ts`: 무기·방어구 슬롯별 10종, 장신구 계열별 5종 베이스와 층·등급별 Tier 스탯 보정 추가.
- `src/game/items.ts`: 새·기존 장비 이름 보존, 구형 쯔바이핸드 표기 호환 유지.
- 검증: 슬롯별 종류·상위 Tier 드랍·세이브 이름 검사, TypeScript 검사와 Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 40
- `src/game/world.ts`: 좌우 시선 판정을 아이소메트릭 화면 X(`dx - dy`)로 통일하고 자동 이동 시 실제 드랍/적 목표를 바라보도록 수정.
- 검증: 자동 이동·드랍 획득·수동 이동 시선 로직 검사, TypeScript 검사와 Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 39
- `src/game/store.ts`, `src/game/world.ts`, `src/game/items.ts`: 30레벨 상한·SP 지급/소모·구형 세이브 보정·층별 드랍률 적용.
- `api/account.mjs`, `src/game/offline.ts`, `src/main.ts`: 서버 경과 시간 기준 12시간 이내 오프라인 사냥 정산·즉시 저장.
- `src/ui/`, `src/styles/modals.css`, `AGENTS.md`: MAX/SP 표시와 오프라인 보상 팝업. 로직 검사·API 문법·TypeScript·Vite 빌드 통과.

## 2026-11-15 · 작업 38
- `src/ui/interface.ts`, `src/ui/hud.ts`, `src/ui/modals/`: HUD·장비·스킬·상태·층·계정 UI 분리.
- `src/game/render.ts`, `src/game/render/`, `src/game/store.ts`, `src/game/items.ts`: 렌더링·아이템 처리 모듈 분리 및 저장 형식 유지.
- `src/styles/`, `AGENTS.md`: 스타일 분리와 작업 지도 갱신. 이동 메서드·CSS 규칙 일치, TypeScript 검사·Vite 빌드 통과.

## 2026-11-15 · 작업 37
- `src/game/world.ts`, `src/game/render.ts`: 자동사냥 타깃·수동 이동 방향에 맞춰 캐릭터 좌우 반전 동기화, 4px 떨림 방지 및 정지 공격 시 타깃 응시.
- 검증: TypeScript 타입 검사(`tsc --noEmit`)와 Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 35·36
- `src/game/store.ts`, `src/game/world.ts`, `api/account.mjs`: 최고 층·자동 등반 저장과 호환 이관, 층 이동·반복 사냥, 쯔바이핸드 드랍·능력치 추가.
- `src/ui/interface.ts`, `src/styles/main.css`: 층 선택 팝업과 장비·가방 전용 아이콘 연결.
- 검증: 저장 이관·층 이동·잠금·반복·등반·구형 무기명 로직 검사, TypeScript 타입 검사와 Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 34
- `src/game/skills.ts`, `src/game/render.ts`, `src/game/world.ts`: 드래곤 중심 출발→확장→수축 승천 궤도와 단계별 타격 반경 동기화.
- `src/styles/main.css`: 하단 상태·장비·스킬 아이콘 테두리 제거 및 왼쪽 정렬.
- 검증: 궤도·타격 시점 로직 검사, `pnpm run check`와 `pnpm run build` 성공.

## 2026-11-15 · 작업 33
- `src/ui/interface.ts`, `src/styles/main.css`: 하단 3개 아이콘 메뉴 축소, 전투 맵 높이 확대, 층별 처치 진행도 표시.
- `src/game/store.ts`, `src/game/world.ts`, `api/account.mjs`: 느린 레벨 성장, 층별 처치 목표·적 강화·기존 세이브 이행.
- `src/game/skills.ts`, `src/game/render.ts`: 2단 내려치기, 딜레이 크러싱, 굵어진 용의 축소 나선·승천 연출.
- 검증: `pnpm run check`, `pnpm run build`, 성장·보스·지연 타격 로직 검증 통과.

## 2026-11-15 · 작업 32
- `api/account.mjs`, `package.json`, `pnpm-lock.yaml`, `vercel.json`: Turso 계정 API, 토큰 인증, 비밀번호 해시, 서버 저장/초기화.
- `src/game/store.ts`, `src/ui/login.ts`, `src/main.ts`, `src/ui/interface.ts`: 서버 전용 세이브, 5초·이벤트 저장, 기존 로컬 데이터 이전.
- 검증: API 가입·로그인·저장·불러오기·초기화·오류 응답, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 31
- `src/ui/login.ts`, `src/styles/main.css`: 로그인·회원가입·게스트 화면과 기기 내 비밀번호 해시 인증.
- `src/game/store.ts`, `src/main.ts`, `src/ui/interface.ts`: 계정별 세이브, 구버전 게스트 이전·로그아웃·계정별 초기화.
- 검증: 계정 분리·비밀번호·이전 사례, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 30
- `src/game/render.ts`, `index.html`, `src/main.ts`: 황야 바닥 원색·오브젝트·문구 적용, 비네팅 완화.
- `src/game/store.ts`: 누락·손상된 세이브 필드와 장비를 안전하게 정리해 기존 진행 데이터 유지.
- 검증: 구버전·손상 세이브 사례, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 29
- `src/game/render.ts`: 용 머리·몸통 텍스처로 궤도 비행, 레벨별 6~24마디·깊이·꼬리 흔들림 적용.
- `src/game/skills.ts`: 드래곤 트위스터 범위를 용 궤도에 맞게 확대.
- 검증: 이미지 파일, TypeScript 검사·Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 28
- `src/ui/interface.ts`: 분해 등급 네이티브 선택창을 저장 가능한 3단계 순환 버튼으로 교체.
- `src/styles/main.css`: 가방 그리드 내부 스크롤·푸터 고정 및 상단 토스트 배치.
- 검증: TypeScript 검사·Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 26·27
- `src/game/render.ts`: 바닥·오브젝트 밝기와 원형 시야 완화, 드래곤 트위스터 감속·지속 VFX.
- `src/game/store.ts`, `skills.ts`, `world.ts`, `src/ui/interface.ts`, `src/styles/main.css`: 스킬 레벨 저장·강화·전투 성장·표시.
- 검증: 기존 세이브 변환·주기 타격 확인, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 23~25
- `src/game/render.ts`: 투구 없는 갑옷 세트, 초대형 용 이펙트, 원형 시야·필드 오브젝트.
- `src/ui/interface.ts`, `src/styles/main.css`: 외형 분기, 아이템 아이콘과 장비·가방 레이아웃 개선.
- 검증: 9개 아이콘·8개 애니메이션 프레임 확인, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 17~22
- `src/game/render.ts`, `world.ts`: 전사·해골·보스 4프레임 보행/공격, 발 정렬·크기·런지·넉백 조정.
- `src/game/render.ts`, `skills.ts`, `src/ui/interface.ts`, `src/styles/main.css`: 스킬별 대형 VFX와 아이콘·색상 구분.
- 검증: 32개 프레임·3개 전용 VFX 파일 확인, TypeScript 검사·Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 15·16
- `src/styles/main.css`: 공격·스킬 버튼 축소 및 우측 하단 정렬, AUTO 버튼 위치 조정.
- `src/game/render.ts`: 4종 VFX 스프라이트 로드·가산 블렌딩·회전/확대/페이드 적용.
- 검증: TypeScript 타입 검사, Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 13·14
- `src/game/store.ts`: 장비 점수·10칸 자동 장착, 등급별 일괄 분해 및 보상 계산.
- `src/ui/interface.ts`, `src/styles/main.css`: 자동 장착 버튼과 분해 등급 선택·저장·결과 안내.
- 검증: TypeScript 타입 검사, Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 12
- `src/game/world.ts`: 일반 0.5%, 보스 12% 드랍률 적용; 튜토리얼 확정 드랍 유지.
- `src/game/store.ts`: 일반·보스별 희귀도 확률을 지시된 비중으로 조정.
- 검증: TypeScript 타입 검사, Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 11
- `src/game/world.ts`, `render.ts`: 공격 직후 0.22초간 남녀·갑옷별 두손검 공격 포즈 적용.
- `src/game/store.ts`, `src/ui/interface.ts`: 무기 등급별 이름과 튜토리얼 문구 통일, 기존 저장 장비 이름 변환.
- 검증: TypeScript 타입 검사, Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 10
- `src/game/skills.ts`, `store.ts`: 테스트 전체 해금 플래그, 7 액티브·3 패시브, 습득·퀵슬롯 저장 호환.
- `src/game/world.ts`, `render.ts`, `src/ui/interface.ts`: 신규 스킬 전투·이펙트, 3슬롯 장착/교체 및 AUTO 연계.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 9
- `src/game/store.ts`: 두손검·문장 장비 명칭과 상위 대검 계열 드랍 이름 정리.
- `src/game/world.ts`, `render.ts`, `src/ui/interface.ts`: 대검 베기·드래곤 트위스터·와일드 스탬프·블러드 레이지 적용.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 8
- `src/game/render.ts`, `src/ui/interface.ts`: 남녀 검 장착 스프라이트 적용, 막대기 검 제거.
- `src/game/render.ts`, `src/game/world.ts`: 잔상·교대 스윙·3중 검기·타격 스파크/숫자·걷기 탄성·사망 페이드 구현.
- 검증: `pnpm run check`, `pnpm run build` 성공; 신규 검 이미지 2종 빌드 포함 확인.

## 2026-11-15 · 작업 7
- `src/ui/interface.ts`, `src/styles/main.css`: 중앙 전사 쇼케이스와 좌우 10슬롯, 전투력·HP·MP 요약.
- 가방 전체/무기/방어구/장신구 필터, 정사각 슬롯, 장착 장비 비교·분해 유지.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 6
- `src/game/render.ts`: 화면 비율에 맞춘 캐릭터 스케일, 지형 장식·마법진·보스 이름/HP 바.
- `src/game/store.ts`, `world.ts`: 갑옷 전용 외형 전환·맨몸 검 표시, 일반 4%/보스 42% 드랍과 등급 희소화.
- `src/styles/main.css`: 하단 바와 HP/MP 프레임을 철제·금빛 스타일로 조정.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 5
- `src/ui/interface.ts`, `src/styles/main.css`: 전투 화면 확장, 좌측 LV 배지, 장비 팝업에 가방·분해 통합과 신규 아이템 배지.
- `src/game/render.ts`: 새 에셋 선형 보간, 전사·해골 크기 축소, 횃불 도형 제거 및 걷기·공격·스킬·피격·사망 연출.
- `src/game/world.ts`: 피격 넉백을 시간에 따라 이동시키고 사망 파티클 이벤트 추가.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 4
- `src/game/store.ts`, `world.ts`: 계정 이름·ID 저장 및 레벨당 `800 × level^2.1` 경험치 곡선 적용.
- `src/ui/interface.ts`, `src/styles/main.css`: 원형 LV 배지·경험치 링, 계정 팝업, 이름/성별 변경·초기화 확인.
- `src/main.ts`: 초기화 중 자동 저장 재생성 방지; 작업 3의 수동 이동 시 AUTO OFF 규칙 반영.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 3
- `src/game/render.ts`: 던전 타일·전사·해골 스프라이트와 그림자·방향/피격 모션 적용.
- `src/game/world.ts`, `store.ts`: 기본 ON 자동사냥, 드랍 우선 추적, 수동 이동 시 AUTO OFF, 설정 저장.
- `src/ui/interface.ts`, `src/styles/main.css`: 가방+하단 메뉴, 상태·10칸 장비·스킬 팝업 구현.
- 검증: `pnpm run check`, `pnpm run build` 성공; 6개 에셋 빌드 포함 확인.

## 2026-11-15 · 작업 2
- `vercel.json`에 Vite 빌드·`dist` 출력, SPA fallback, HTML/정적 자산 캐시 헤더 추가.
- 검증: `pnpm run build` 성공 (`tsc --noEmit && vite build`), JSON 구문 검사 통과.
- Vercel CLI·인증·프로젝트 연결이 없어 URL 미발급; `main` 푸시 후 Vercel Import 필요.

## 2026-11-15 · 작업 1
- Vite·TypeScript·PixiJS 초기화 및 세로형 전투/인벤토리 UI 구현.
- `src/game/`에 직접 이동, 4개 공격 동작, 적·보스, 빛기둥 드랍, 장비·저장 구현.
- `src/ui/`에 10칸 장비, 가방 비교·장착·분해, 튜토리얼 구현.
- 검증: `pnpm run build` 성공 (내부 `tsc --noEmit && vite build`); 브라우저 실기 검증 생략.
## 2026-11-16 · 작업 56
- `public/assets/warrior_female_armored_nohelm.png`, `walk8_female_armored_nohelm.png`, `warrior_female_armored_attack.png`: 여성 갑옷 정지·보행·공격 이미지 생성.
- `src/game/appearance.ts`, `src/game/render.ts`, `src/game/render/entities.ts`, `src/styles/modals.css`: 성별별 갑옷 외형 선택과 장비창 인물 중앙 정렬.
- `tests/appearance.test.mjs`, `tests/market.test.mjs`: 성별별 외형 회귀 검사와 Windows 임시 DB 잠금 정리 보강.
- 검증: `pnpm run check`, `pnpm test` 31건, `pnpm run build`, `git diff --check` 통과.
