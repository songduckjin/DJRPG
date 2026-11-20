## 작업 200 — 궁수 전용 투구 10종 외형 (남녀 서기·걷기·사격)

궁수(`job === 'archer'`)가 투구를 쓰면 전사 판금 투구 대신 **궁수 전용 투구·모자 10종**(가죽 두건 ~ 신궁의 황금 왕관)이 나옵니다. 서기 1프레임 + 걷기 4프레임 + 사격 4프레임 전부에서 목·어깨에 붙어 움직입니다.

### 구조
- **파츠 20장** `public/assets/pilot-25d/archer_helms/{male,female}_{0..9}_v1.png`
  - 승인 시안(`downloads/archer_helm_preview/`)을 기본 원본과 같은 캔버스 변환(높이 337·발끝 y=353·중심 x=181)으로 362px 서기 셀에 옮긴 뒤 **머리 영역 다각형만** 오려 낸 전체 셀 PNG(256색, 장당 5KB·합계 164KB).
  - 파츠에 투구뿐 아니라 얼굴·머리카락(여성 포니테일·옆 땋은 머리)까지 들어 있어 오픈페이스(서클릿·왕관)도 얼굴이 겹치지 않습니다.
- **머리 없는 본체 12장** `public/assets/pilot-25d/archer_headless/{,nobow}/archer_{성별}_{동작}_v1.png`
  - 같은 다각형을 본체에서 지운 판(합계 436KB). 파츠와 구멍이 **같은 도형**이라 목·칼라 이음매가 남지 않습니다.
  - 파츠가 로딩되기 전에는 머리 있는 시트로 그려 머리가 빈 채로 보이지 않습니다.
- **자세 표** `src/game/render/archerHelmets.ts` `archerHelmFrames`
  - 걷기·사격은 인물이 작게 그려져 서기 얼굴을 각 프레임에서 템플릿 매칭(TM_CCOEFF_NORMED)해 배율·좌상단을 쟀습니다 — 남 걷기 0.90~0.93 / 사격 0.66~0.72, 여 걷기 0.92~0.93 / 사격 0.65~0.70.
  - 파츠 앵커는 좌상단(0,0)·회전 없음(사격의 고개 숙임은 그림에 이미 들어 있음).
- **조합**: 활 1번 이상이면 기본 활 지운 `nobow` 본체의 머리 없는 판을 사용 → 활·투구 동시 착용 OK. 갑옷 10종(`archer_armors`)과도 같은 셀 좌표계입니다.
- **장비창**: 같은 시트·같은 좌표로 합성(`equipmentPortraitArcherHelm`), 캐시 키에 투구 경로 포함.

### 변경 파일
`src/game/render/archerHelmets.ts`(신규), `src/game/render/entities.ts`(`syncArcherHelmet`·`drawHero`), `src/game/render.ts`(`archerHeadlessFrame`·`prefetchArcherHeadless`·파츠 프리로드), `src/ui/equipmentPortrait.ts`, `scripts/build-archer-helm-parts.py`(신규), `scripts/preview-archer-helms.py`(신규), `scripts/verify-item-art.mjs`, `tests/archer-helm-render.test.mjs`(신규), `tests/archer.test.mjs`(외형 규칙 갱신), `docs/{TASK,WORKLOG,QUICK_PATCH,CODE_MAP}.md`, 에셋 `archer_helms/**`·`archer_headless/**`.

`store.ts`·`server/**`·`world.ts`·`baseItems.helmet` 순서·전사 투구 파이프라인은 변경 없음. 능력치·세이브·API 계약 무변경.

### 검증
- `npx tsc --noEmit` 통과
- `node --test tests/archer-helm-render.test.mjs` **10/10** (파츠 규격·머리 지움·자세 표·drawHero 분기·장비창)
- `node --test tests/archer.test.mjs` **15/15**, 투구/활/검/갑옷/장비창 관련 **70/70**
- 전체 `npm test` **570/573** — 실패 3건은 `origin/main`(953c52f) 워크트리에서 동일 재현되는 기존 실패(`costume-field-render` 2·`market` schema 1)
- `node scripts/verify-item-art.mjs` (투구 파츠 20장·머리 없는 시트 12장 규격 검사 추가), `npm run build`, `git diff --check`

### 검수 이미지
- `downloads/djrpg_archer_helms_preview_v1.png` — 남녀 × 10종 서기
- `downloads/djrpg_archer_helms_motion_v1.png` — 남녀 × 대표 3종 × 걷기·사격 4프레임
- `downloads/djrpg_archer_helms_ingame_v1.png` — 남녀 × 대표 5종 × 서기·걷기·사격 실게임 배율(390×844)

머리카락 비침·이중 머리·목 이음매 없음을 육안 확인했습니다. 브라우저 실기 화면은 미확인(이 환경의 로컬 루프백 차단) — 폰에서 확인은 사용자 몫입니다.
