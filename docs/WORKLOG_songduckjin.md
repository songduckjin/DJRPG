## 2026-11-20 · 작업 157 · songduckjin
- 사용자가 고른 확정 시안 두 장을 게임에 넣었다. 1번 `slash2`(휘두르기)는 `render/vfx.ts`의 코드 선 2줄(`effects.arc` 두 겹)을 지우고 검정 배경 add 스프라이트 2장으로 바꿨다 — `public/assets/fx_slash2.png`(은빛 검기 fan 512×199·48KB), `fx_slash2_ground.png`(황금빛 지면 충격파·파편 384×131·33KB, 256색 PNG). 검기는 `screenAngle`로 회전하고 지면 충격파는 회전 0으로 눕혀(세로 .62) 발밑에서 전방 34%로 번진다. 폭은 진행도에 따라 .9→1.16배, 밝기는 `sin(πt)`.
- 무기 등급 연동은 유지하되 색을 덮지 않게 **폭 +8px(등급당)·12% 틴트**(`slashTint`)만 반영했고, 맨손은 순백이다.
- 2번 `spin`(드래곤 트위스터)은 `fx_dragon_head.png`(160×138)·`fx_dragon_body.png`(128×57)를 **짙은 파란 청룡**으로 교체했다. `/assets/*`가 `immutable` 1년 캐시라 같은 파일명 교체가 기존 이용자에게 남지 않도록 두 경로에 `?v=2`를 붙였다.
- `drawDragon` 회전을 `age·2π/1.1 + p²·2π` → **`age·2π/2.4 + p²·0.8π`** 로 늦춰(한 바퀴 2.4초) 묵직하게 선회하다 144°만 더 돌아 상승한다. 확정 시안의 바닥 회오리에 맞춰 발밑에 파란 지면광+링 2겹(fade 연동)을 남기고, 몸통은 접선 방향으로 길게·방사 방향 1.25배로 그려 마디 이음매를 붙였다.
- 스킬 수치·사거리·판정(`skills.ts`·`world.ts`)과 Save/DB/API는 무변경. `tests/hero-weapon-render.test.mjs`에 새 계약 2건(검기·충격파 스프라이트/청룡 2.4초·지면광)을 넣었다.
- 검증: `npx tsc --noEmit`, `node --test tests/hero-weapon-render.test.mjs` 6/6, 전체 `npm test` 474건 중 472 통과(`costume-field-render` 2건은 종전부터 같은 실패), `npm run build`, `node scripts/verify-item-art.mjs`, `git diff --check`. 에셋·구도는 `read_file`로 직접 확인하고, 실게임 배율(390×844) 합성 검수 이미지 `downloads/djrpg_skill_1_slash2_ingame_v3.png`·`downloads/djrpg_skill_2_spin_blue_ingame_v3.png`를 남겼다.
- [PR #118](https://github.com/songduckjin/DJRPG/pull/118) 스쿼시 병합 `eef4e9d5251d`, 운영 `version.json` `eef4e9d5251d`(`builtAt 2026-11-20T01:17:18Z`). 새 에셋 4장 HTTP 200(`fx_slash2` 48335B·`fx_slash2_ground` 32754B·`fx_dragon_head?v=2` 12153B·`fx_dragon_body?v=2` 6197B, 원격 sha256 = 로컬), 머리 그림 픽셀 평균 RGB 35/105/189(파랑) 확인, 배포 번들 `index-QOXkJ41J.js`에 네 경로와 `Math.PI*2/2.4` 포함. 브라우저 실기·Playwright는 미실행(프로젝트 규칙), 폰 화면 확인은 사용자 몫.

## 2026-11-18 · 작업 129 · songduckjin
- 부위별 10종씩 무기·투구·갑옷·장갑·신발 착용 아트를 생성해 총 50프레임을 캐릭터 장비 레이어로 연결했다. 남녀 idle·이동·공격 포즈를 각각 반영했다.
- 공백 제거 및 유니코드 정규화로 `낡은가죽두건` 이름을 인벤토리 그림과 착용 프레임에 매핑했다.
- `pnpm run check`, 전체 258개 테스트, `pnpm run build`, `git diff --check` 통과. PR #54 병합 커밋 `efec6056dca698d17988c522830c6a790fb16ee4`; Cloudflare Pages Production 버전 및 5개 이미지 HTTP 200을 확인했다. 실기 화면 확인은 별도로 필요하다.

## 2026-11-18 · 작업 127 · songduckjin
- 공격 시트 6장을 포즈 단위로 분리(서로 닿은 포즈는 지오데식 분할)해 262~286px 동일 폭 칸으로 다시 패킹했다. 칸 폭을 포즈마다 필요한 만큼만 넓혀 칼끝·발끝이 옆 칸을 넘지 않고, 몸통 중심을 칸 가운데에 맞춰 프레임 사이 좌우 흔들림도 줄었다. 시트 높이는 290px 그대로다.
- `src/game/render.ts`: 공격 시트를 종횡비 2.2 초과(4포즈 한 줄)일 때만 4등분하고, 쓰이지 않던 1포즈 단독 공격 텍스처 3장을 로딩 목록에서 뺐다. 이미지 교체에 맞춰 공격 시트 경로에 `?v=3` 캐시 버스터를 붙였다.
- `src/game/render/entities.ts`: 그림자를 프레임 폭이 아니라 그려진 몸 높이 기준으로 바꿔, 넓어진 칸 때문에 공격할 때 그림자가 커지지 않게 했다.
- 테스트: 시트별 4칸 균등 폭과 경계 알파 0을 확인하는 검사(PNG 알파 디코더 포함), 기본 공격은 잔상을 남기지 않는지 확인하는 검사를 추가했다. `npx tsc --noEmit`, 255개 테스트, `npm run build` 통과.
- PR #49 병합 `ded1077bc43f`. Cloudflare Production `djrpg.pages.dev/version.json`이 `ded1077bc43f`를 응답하고, `/assets/warrior_*_attack.png?v=3`이 새 시트(1048~1144×290, 38~54KB)를 반환하며 `index-9Nc_GnDh.js`에 `width/height>2.2?4:1` 가드와 `?v=3`이 포함된 것을 확인했다. 옆 칸 잔상은 폰 화면 실기 미확인(서버·에셋·번들 기준 검증).

## 2026-11-17 · 작업 126 · songduckjin
- 자동 추격 중 이동 벡터가 있는 동안 기본 공격·피해 스킬의 발동을 막고, 대검 휘두르기 피해를 궤적이 나타나기 시작하는 0.12초 뒤에 적용했다. 정지 후 기본 공격과 스킬 타격을 회귀 테스트로 확인했다.
- `pnpm run check`, 219개 테스트, `pnpm run build`, `git diff --check` 통과. PR #38 병합 `62bfd7a7984eca831ed0268ebf5328f1776b6811`; Cloudflare Production HTTP 200, `index-hRFmeS2r.js`에서 이동 가드와 `nextHit:.12` 확인. 화면 실기는 미확인.

## 2026-11-17 · 작업 123 · songduckjin
- 기본 공격 `slash`의 검기 이미지와 발밑 룬만 렌더링에서 제외했다. 공격 모션·타격 판정·피격 표시와 `slash2` 스킬은 유지한다. 남녀·직업별 분기가 없는 공용 경로다.
- 타입 검사·213개 테스트·프로덕션 빌드·diff 검사 통과. 모바일 화면 실기는 미확인이다.

## 2026-11-17 · 작업 122 · songduckjin
- 겹치는 우측 캐릭터 선택 버튼을 제거하고 레벨 배지를 캐릭터 선택 진입점으로 변경했다. 계정 정보는 설정에서 열 수 있다.
- 타입 검사·213개 테스트·프로덕션 빌드·diff 검사 통과. 모바일 화면 실기는 미확인이다.

## 2026-11-17 · 작업 121 · songduckjin
- 사용자가 Cloudflare에서만 작업·배포하고 Vercel의 이중 배포를 끝내도록 정책 변경을 요청했다. 신규 임시 계정으로 가입·로그인·저장·불러오기·창고 조회·거래소 조회를 운영 Pages에서 확인했다.
- `AGENTS.md`에 Cloudflare 단일 운영 배포와 Vercel 배포 재시도 금지를 명시하고, 공개 작업·배포 이력을 갱신했다. Vercel 프로젝트의 GitHub 연결을 해제하고 미연결 상태를 확인했다. 프로젝트 자체는 남아 있다.

## 2026-11-17 · 작업 119 · songduckjin
- Cloudflare 로그인 계정과 GitHub 연결 계정의 `songduckjin`을 확인했다. 기존 `djrpg` Worker의 GitHub 빌드는 pnpm 9가 루트 패키지 목록을 찾지 못해 설치에서 실패했다.
- Pages 전환 브랜치에서 최신 `main` 통합 후 타입 검사·213개 테스트·프로덕션 빌드 통과. `pnpm-workspace.yaml`에 루트 패키지를 명시했고 Pages 프로젝트 연결·운영 API 검증은 진행 중이다.
- Pages 프로젝트를 GitHub `main`에 연결해 정적 첫 배포를 확인했다. Functions는 PR #32 반영 전이라 미배포이며, Vercel 검사 실패로 PR 병합이 자동 승인 검토에서 거절돼 운영 전환은 보류했다.
- Preview 빌드에 Pages Functions 4개가 등록됐고, Production/Preview에 Turso DB URL·토큰을 암호화 비밀로 저장했다. 비밀 반영 재배포 후 Preview의 405 메서드 응답과 운영 DB의 존재하지 않는 계정 조회 401을 확인했다. 실제 계정 변경을 수반하는 스모크는 Vercel 신형 해시 운영 반영 전까지 보류한다.

## 2026-11-17 · 작업 94 · songduckjin
- 캐릭터 3슬롯 선택·생성 UI와 계정 공용 골드·창고, 캐릭터별 세이브/아이템 귀속 구현.
- 기존 단일 세이브를 슬롯 1로 비파괴 이전하고 거래소의 계정별 상태를 유지.
- `api/`, `server/`, `src/ui/`, `src/game/sync.ts`, `src/styles/`, `tests/characters.test.mjs` 변경.
- 타입 검사·168개 테스트·프로덕션 빌드·diff 검사 통과. 응답 유실과 5xx 이후 창고 이동을 같은 요청 ID로 재확인한다. PR #24 검토·운영 DB 백업 대기.
- 최신 main의 보상·우편함·장비 가방 용량 변경을 통합했다. 보상 요청의 슬롯 검증과 보상 아이템의 캐릭터 귀속을 추가했고, 타입 검사·197개 테스트·프로덕션 빌드·diff 검사를 통과했다.
- 운영 Turso DB의 읽기 전용 사본을 `.backups/`에 생성하고 전체 테이블 행 수·무결성·외래 키를 확인했다. 복원 모의 검사는 사용자 요청에 따라 제외하고, 배포 후 기존 계정의 슬롯 1 조회를 확인한다.
- 최신 main `0b07420` 통합 후 테스트 임시 DB 닫기 경합을 보정했다. 타입 검사·208개 테스트·프로덕션 빌드·diff 검사 통과. Vercel Preview는 빌드 횟수 제한으로 실패해 재시도 필요.
