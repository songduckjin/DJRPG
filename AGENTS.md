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

## 외형·다직업 규칙
- 인게임 필드 캐릭터는 **장비창(5부위 개별 프리뷰)과 분리**한다. 필드는 **직업·성별·티어별 통합 바디 시트(갑옷·투구 포함) + 무기 소켓**(`src/game/render/heroSockets.ts`)만 쓰고, 장갑·부츠·갑옷·투구 2D 아이콘을 필드 캐릭터 위에 덧그리지 않는다. 장비창 `equipmentShowcase`의 5부위 미리보기는 그 규칙의 예외로 그대로 유지한다(정지 프리뷰).
- `appearance.ts`·`heroSockets.ts`는 **다직업 확장(`classId × gender`)**을 전제로 둔다: 직업별 바디 시트와 소켓 데이터 표만 추가하면 `render/entities.ts` 렌더러 수정 없이 새 직업이 동작해야 한다(소켓 표 타입 `Record<ClassId, Record<Gender, …>>`, `ClassId`는 현재 `'warrior'`). 직업을 늘릴 때는 남/여를 함께 넣는다.

## 매뉴얼 갱신
- 새 파일·기능·API·증상 추가나 책임 변경 시 완료 전 `docs/CODE_MAP.md` 해당 영역을 같은 형식으로 갱신(`§6`).
- 같은 영역을 반복해 고쳤으면 `docs/QUICK_PATCH.md` §1 표에 1줄(수정 파일·금지·단건 테스트)을 추가한다.

## 검증 (부분 테스트)
- **자주 고치는 작업은 `docs/QUICK_PATCH.md` §1 표부터.** 없으면 `CODE_MAP.md` §1로 영역만 찾아 핵심 파일·관련 테스트만 연다. 전체 탐색·전수 읽기 금지, `rg`는 지정 파일만.
- **부분 검증**: `npx tsc --noEmit` + 매핑 테스트만 `node --test tests/<해당>.test.mjs`. 이미지 추가·수정 시 `node scripts/verify-item-art.mjs`.
- **전체 `npm test`·`npm run build`는 공용 계약**(`server/database.mjs`·`server/http.mjs`·`vite.config.ts`·`package.json`·`store.ts`) **수정 또는 사용자 요청 시에만.**
- 미실행·실패 검증을 성공으로 기록 금지. 브라우저 실기·Playwright·Computer Use는 요청 시에만.
