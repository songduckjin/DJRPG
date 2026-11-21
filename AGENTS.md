# DJRPG 작업 규칙 (Codex)

Vite+TS+PixiJS 모바일 2.5D 다크 판타지 RPG. 수정 전 이 규칙 적용.

## 프로젝트 구조
- `src/game/`: `world.ts`(전투)·`store.ts`(저장)·`items.ts`(아이템)·`render/`(읽기 전용) / `src/ui/`: HUD·모달·`interface.ts` / `src/styles/`·`public/assets/`: CSS·에셋
- `server/`,`functions/api/`: Cloudflare Pages Functions API · `api/`: Vercel·테스트 어댑터(삭제 금지)
- 색인: 자주 고치는 작업은 **`docs/QUICK_PATCH.md` §1**, 그 외는 **`docs/CODE_MAP.md` §1**(작업 전 필수).

## 2인 선점 규칙
1. `git pull` 후 `docs/TASK.md` 확인(상세 `docs/TASK_<ID>.md`).
2. 시작 전 `docs/TASK.md`에 `[-]`(번호·브랜치·수정 파일)를 등록해 바로 푸시한다.
3. 다른 `[-]` 작업과 기능·수정 파일이 겹치면 **즉시 중단해 보고**한다.
4. 완료는 검증 통과 후에만 `[x]`. `main` 직접 커밋·푸시 금지, 브랜치+PR 병합.

## 공용 파일·호환성
- 공용 계약 `server/`, `functions/api/`, `src/game/{store,items,world}.ts` 수정 시 기존 API·응답·에러 코드·테스트 계약 유지.
- 저장은 Turso DB 전용. **로컬 세이브 저장 금지**, 세이브 형식 전방 호환 유지.
- 배포는 Cloudflare Pages(`djrpg`)만, Vercel 재시도 금지. `.env*`·키·DB 토큰 커밋·로그·번들 금지.

## 성별 동기화
- 외형·모션·장비·스킬 수정은 남/여 동시 반영, `rg`로 `gender` 분기 점검. 직업은 전사 단일.

## 캐릭터 외형·코스튬 규칙
- 코스튬 정책의 단일 기준은 `docs/COSTUME_SYSTEM.md`다. 작업 전 `docs/QUICK_PATCH.md` → `docs/CODE_MAP.md` → 해당 작업지시서 순서로 필요한 범위만 확인한다.
- **필드 렌더 경로(작업 140)**: `src/game/render/costumeHero.ts`(계획·아틀라스·레이어 스프라이트) → `render/entities.ts` `drawHero` → 실패 시 기존 통합 바디·무기 소켓 폴백. 모션·재생 배율은 `render/heroMotion.ts`, 본체 높이는 `render/heroScale.ts` `costumeBodyPx`, 소켓 표(`heroSockets.ts`)는 **폴백 전용**이다. 아틀라스 셀·페이지 배치는 `docs/COSTUME_SYSTEM.md` §7.2가 기준이며, 바꿀 때는 `costumeHero.ts` 한 곳만 고친다. **실물 아틀라스는 `scripts/build-costume-atlas.py`로만 만든다**(손으로 매니페스트·PNG를 고치지 않는다). 장비 페이지 이름은 `<부위>-<성별>`이고, 배포 에셋은 `public/assets/costume/v3/**`(매니페스트 55종·아틀라스 70장, `COSTUME_ASSET_VERSION = 3`)다. 투구는 갑옷 착용 여부에 따라 페이지가 다르다(`helmet-<성별>`·`helmet-body-<성별>`, §7.5). 에셋을 바꾸면 `COSTUME_ASSET_VERSION`을 올려 새 URL로 배포한다(§6.2 immutable).
- 코스튬 레이어 경로는 **전부 아니면 전무**다. 매니페스트·아틀라스·`costumeId` 중 하나라도 빠지면 부분 합성하지 말고 통합 바디로 폴백해야 한다(캐릭터가 사라지거나 404가 반복되면 규칙 위반).
- 현재 `appearance.ts`·`render.ts`·`render/entities.ts`는 전환 대상인 기존 통합 바디 구현이다. 이를 신규 코스튬의 제작 규격으로 확대 해석하지 않는다.
- 초기 프로토타입은 본체(머리 포함 몸통/팔/다리)와 장비 부착을 검증한다. 작업지시서에 적힌 파일만 수정하고 `src/game/render/**`·`store.ts`·`server/**`·기존 에셋은 별도 작업 등록과 승인 전 변경·삭제하지 않는다.
- Save·아이템 UUID·소유권·능력치·DB/API 계약은 외형 작업에서 변경하지 않는다. **필드와 장비창(내 정보) 미리보기는 같은 공용 계획(`planHeroCostume`)을 쓴다**([작업 141]). 미리보기 차이는 정지 1프레임(idle 0)뿐이며, UI 전용 `fit` 좌표 표·`wearableEquipmentImage` 덧그리기·픽셀 스캔을 다시 넣지 않는다. 매니페스트·아틀라스 실패 시 `warrior_equipped_t*` 전신 초상화로 폴백하고 매니페스트 실패는 세션 동안 재요청하지 않는다(`docs/COSTUME_SYSTEM.md` §7.3).
- 기존 외형 리소스는 신규 전환 및 전체 참조 검사 전까지 유지한다. 새 직업·몬스터·NPC 적용은 별도 범위로 등록한다.

## 배포·점검 정책 (필수)
배포는 **점검 모드 ON → 배포 → 정상화 확인 → 점검 모드 OFF** 순서로만 한다. 점검 스위치는 `public/maintenance.json` 하나다(서버·DB 호출 없음).
1. **점검을 켠다**: `public/maintenance.json`을 `{ "active": true, "eta": "2026-11-21T16:30:00+09:00", "message": "" }`로 바꾼 **점검 켜기 PR**(`ops/maintenance-on-<날짜>`, 이 파일 하나만)을 먼저 `main`에 병합한다. 배포되면 접속 중인 플레이어는 20초 안에 로그인 화면으로 돌아가 **`점검 진행 중입니다` + 예상 완료 시간** 모달을 보고, 그동안 로그인·게스트 입장이 막힌다. **`eta`(예상 완료 시간) 없는 점검은 열지 않는다** — ISO 시각(`2026-11-21T16:30:00+09:00`)이나 "오후 4시 30분쯤"처럼 적는다.
2. **배포한다**: 점검이 켜진 것을 확인한 뒤 기능 브랜치를 `main`에 병합·배포한다(점검 중에는 다른 병합을 하지 않는다).
3. **전수 정상화 확인**(모두 통과해야 한다): 운영 `version.json`의 `commit`이 병합 커밋인지, `/` 200, `/maintenance.json`이 방금 올린 파일인지, `/api/account`가 정상 JSON(401 또는 성공 — 405·HTML 아님)인지, 게스트 로그인 → 저장 200 스모크, Cloudflare Pages·`deploy` 체크 SUCCESS.
4. **점검을 끈다**: 3번을 모두 통과한 뒤에만 `ops/maintenance-off-<날짜>` PR로 `active:false`를 병합해 연다. 하나라도 실패하면 **점검을 켜 둔 채** 보고한다.
- 저장소 기본값은 `active:false`(열린 상태)이고, 점검 파일을 읽지 못하거나 형식이 깨져도 열린 상태로 둔다. 코드·환경변수로 점검을 끄지 않는다. 서버에서도 함께 막아야 하면 Pages 환경변수 `DJRPG_MAINTENANCE=1`(계정 API가 `503 MAINTENANCE`)을 쓴다.

## 매뉴얼 갱신
- 새 파일·기능·API·증상 추가나 책임 변경 시 완료 전 `docs/CODE_MAP.md` 해당 영역을 같은 형식으로 갱신(`§6`).
- 같은 영역을 반복해 고쳤으면 `docs/QUICK_PATCH.md` §1 표에 1줄(수정 파일·금지·단건 테스트)을 추가한다.

## 검증 (부분 테스트)
- **자주 고치는 작업은 `docs/QUICK_PATCH.md` §1 표부터.** 없으면 `CODE_MAP.md` §1로 영역만 찾아 핵심 파일·관련 테스트만 연다. 전체 탐색·전수 읽기 금지, `rg`는 지정 파일만.
- **부분 검증**: `npx tsc --noEmit` + 매핑 테스트만 `node --test tests/<해당>.test.mjs`. 이미지 추가·수정 시 `node scripts/verify-item-art.mjs`.
- **전체 `npm test`·`npm run build`는 공용 계약**(`server/database.mjs`·`server/http.mjs`·`vite.config.ts`·`package.json`·`store.ts`) **수정 또는 사용자 요청 시에만.**
- 미실행·실패 검증을 성공으로 기록 금지. 브라우저 실기·Playwright·Computer Use는 요청 시에만.
