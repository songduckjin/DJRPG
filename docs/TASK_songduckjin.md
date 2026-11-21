# DJRPG 개인 작업지시서 — songduckjin

> 담당 GitHub ID: `songduckjin`
> 적용 대상: 해당 ID를 사용하는 작업자의 PC 및 Codex
> 규칙: 본 파일은 지정된 작업자만 수정한다. 상대 작업자의 개인 작업지시서는 수정하지 않는다.
> 2026-11-18: `[작업 137]`은 PR #73(`6402d79`)으로 main에 병합되어 완료 이력을 `docs/TASK_ARCHIVE.md`로 옮겼다. 이 문서에는 후속 작업 138~149와 개인 작업 이력을 둔다.

## 진행 중 작업

### [x] [작업 159] 궁수 스타터 가죽 튜닉 시트 교체·재배포
- **담당자**: `songduckjin` · **브랜치**: `feat/159-archer-starter-leather-sheets` · **위험 등급**: 낮음 · **상태**: `[x]`
- **배경**: 작업 157의 궁수 기본 시트는 후드 망토 + 견갑 차림이었다. 사용자가 승인한 스타터 시안(`downloads/archer_preview/{male,female}_starter.png`, 민소매 가죽 조끼 + 크림 셔츠, 후드·견갑·망토 없음)으로 기본 외형을 교체한다.
- **제작**: `images --edit`로 승인 원본에서 걷기·활 사격 4프레임 가로 스트립(`{male,female}_starter_{walk,attack}.png`)을 만들고, `scripts/build-archer-sheets.py` 입력을 `{}_starter{,_walk,_attack}.png`로 바꿔 `public/assets/pilot-25d/archer_{male,female}_{idle,walk,attack}_v1.png` 6장을 재생성(서기 `362×362`, 걷기·공격 `1448×362` 4셀, 256색 PNG, 검정 배경 키잉·발끝 정렬).
- **캐시 무효화**: `/assets/*`가 `immutable`이라 `src/game/render.ts`(6경로)·`src/ui/equipmentPortrait.ts`·`src/ui/modals/charactersModal.ts`의 궁수 시트 URL에 `?v=2`. `tests/archer.test.mjs`는 기대값을 새 URL로 고치고, 궁수 시트 참조에 버전 쿼리가 빠지면 실패하는 감시 테스트를 추가했다.
- **불변**: `heroBodyPx`(남녀 337/300/268·270)·전투 수치·스킬·Save/DB/API 계약, 장비 오버레이 미적용 규칙(작업 157) 그대로.
- **검증**: `tsc --noEmit`, `tests/archer.test.mjs` 14/14, 전체 488건 중 486 통과(`costume-field-render` 2건은 `origin/main` `86ac44e` 워크트리에서도 동일 실패), `verify-item-art`(궁수 시트 6장), `npm run build`, 배포 번들 6경로 `?v=2` 확인.
- **검수 이미지**: `downloads/djrpg_archer_starter_ingame_v2.png` — `scripts/preview-archer-field.py`를 남녀 4패널(걷기·사격)로 확장하고 `heroBodyPx`로 배율을 맞춰 합성했다. 브라우저 실기 확인은 미실시(사용자 몫).
- **머지·배포(완료)**: [PR #124](https://github.com/songduckjin/DJRPG/pull/124) 스쿼시 병합 `4ba39fdb63b7`. Pages production 성공(Workers Builds는 `main`과 같은 기존 실패), 운영 `version.json` `4ba39fdb63b7`(`builtAt 2026-11-20T02:29:42Z`), `?v=2` 시트 6장 전부 HTTP 200·원격 sha256=로컬, 배포 번들 `index-j5_2NUhd.js`에 6경로 `?v=2` 포함.
- **남은 것**: 사용자 실기 화면(걷기·사격 모션, 장비창·캐릭터 카드 썸네일) 확인.

### [x] [작업 198] 마법사 직업 추가 — 기본 시트·지팡이 10종·원거리 마법탄·스킬 8+3 뼈대
- **담당자**: `songduckjin` · **브랜치**: `feat/198-mage-job` · **위험 등급**: 보통 · **상태**: `[x]` 코드·검증 완료(운영 배포는 PR 머지 후 기록)
- **범위**: 세 번째 직업 `mage`(마법사). 캐릭터·장비·원거리 평타 뼈대만 잡고, 전용 스킬 연출·방어구/모자 외형은 추후 시안 확인 후 고도화한다(사용자 결정).
- **수정**: `game/skills.ts`(`Job`·`mageSkillOrder`·`magePassiveOrder`), `game/items.ts`(`staffBases`·`slotNameFor`·`usesBaseSheetOnly`), `game/store.ts`(`parseSave` job 정규화), `game/world.ts`(`mageAttackRange` 240·마법 구슬 평타·스킬 8종 판정), `game/render/vfx.ts`(`drawMagicBolt`·`drawBurst`·`drawNova`·`drawWard`), `render/entities.ts`·`render.ts`·`render/heroScale.ts`(마법사 시트 경로·배율), `ui/{login,skillArtwork,hud,equipmentPortrait}.ts`·`ui/modals/{charactersModal,skillModal,accountModal}.ts`, `server/endpoints/account.mjs`(`jobOf`·`jobs`), 에셋 12장 + 빌더 3개, `tests/mage.test.mjs`(신규 13건), `scripts/verify-item-art.mjs`.
- **검증**: `npx tsc --noEmit`, `tests/mage.test.mjs` 13/13, 전체 500건 중 498 통과(`costume-field-render` 2건은 `origin/main` 워크트리에서 동일 재현), 아트 검증, `npm run build`, `git diff --check`. 실기 화면은 미실행(브라우저 loopback 차단) — 합성 검수 이미지 `downloads/djrpg_mage_ingame_v1.png`.
- **번호 정정**: 159가 궁수 스타터 가죽 튜닉(PR #124)으로 먼저 병합돼 **198**로 재등록(브랜치 `feat/198-mage-job`, PR #128).
- **머지·배포**: [PR #128](https://github.com/songduckjin/DJRPG/pull/128) 스쿼시 병합 `bc0a2617470c`, 운영 `version.json` `bc0a2617470c`(`builtAt 2026-11-20T03:23:31Z`)·새 에셋 10장 HTTP 200(원격 sha256=로컬)·배포 번들에 마법사 경로/스킬 확인.
- **남은 것**: 사용자 실기 확인(마법 구슬·스킬 8종 연출, 생성 UI 3버튼), 추후 마법사 전용 스킬 연출·갑옷/모자 외형 시안.

### [x] [작업 150] 평타 1마리 제한·평타 ×1.6·걷기/공격 몸 크기 보정
- **담당자**: `songduckjin` · **브랜치**: `fix/150-basic-attack-single-target` · **위험 등급**: 중 · **상태**: `[x]` 완료(실기 확인은 사용자 몫)
- **제보(2026-11-19 실기)**: ① 평타가 반경 90px·부채꼴 안의 모든 적을 동시에 때림 ② 대검을 휘두르거나 걸을 때 캐릭터가 작아짐. 후속 지시: 한 마리만 때리는 만큼 “한방한방이 쌔야 돼”.
- **수정**: `src/game/world.ts` — `damage()`에 `maxTargets`(기본 `Infinity`, 가까운 순) 추가, 평타만 `maxTargets=1`이고 피해는 `basicAttackPower = 1.6`배. 스킬 7종 광역 판정·쿨다운·서버 계약 무변경. `src/game/render/heroScale.ts` — pilot walk 335→300(4칸 평균 293~307), attack 335→270(내려찍는 칸 평균, 머리 위 검 프레임은 이상치), idle 335 유지.
- **테스트**: `tests/world-movement.test.mjs` 5건(단일 대상·처치·스킬 광역·×1.6 피해·두 방 합계), `tests/hero-art.test.mjs` 2건(남녀 pilot 시트 알파 실측 대조·상태별 보정값).
- **검증**: `npx tsc --noEmit`, `node --test tests/*.test.mjs` 389건 중 387 통과(`costume-field-render` 2건은 `17facd5` `main`에서도 실패하는 기존 실패), `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과.
- **머지·배포(완료)**: [PR #103](https://github.com/songduckjin/DJRPG/pull/103) 스쿼시 병합 `11e99459be5b`. Pages 체크 통과(Workers Builds는 `main` 기존 실패), 운영 `version.json` `11e99459be5b`·`builtAt 2026-11-19T11:08:32Z`, `/`·pilot 시트 HTTP 200 확인.
- **남은 것**: 사용자 실기 화면 확인(평타 대상·타격감, 걷기/공격 체격), `costume-field-render` 기존 실패 2건은 별도 작업.

### [x] [작업 147] 3D→2.5D Blender 자동 렌더 파이프라인 가이드·스크립트·레퍼런스 시안
- **담당자**: `songduckjin` · **브랜치**: `task/147-blender-25d-pipeline` · **위험 등급**: 낮음 · **상태**: `[x]` 완료
- **완료 결과(2026-11-19)**: [PR #99](https://github.com/songduckjin/DJRPG/pull/99)가 머지 `d8110470a99c97a6ae38fa85b0d47e8eccdad22b`로 병합됐고 Cloudflare Pages 운영 `version.json`에서 `d8110470a99c`를 확인했다. `scripts/blender/render_25d_costume.py`(1026줄) + `docs/BLENDER_25D_PIPELINE.md` + `docs/references/` 시안 2장(484KB·372KB)을 넣었다. 자체 점검 `--selftest` 6/6, `--help`·`--print-spec`·`--dry-run` 동작, 합성 셀 아틀라스 패킹·슬롯 좌표(0·9·8 → col0row0·col1row1·col0row1)·매니페스트 출력 확인, `tsc --noEmit`, 전체 `node --test` 382건, `verify-item-art`, `npm run build`, `git diff --check` 통과. **실제 Blender 렌더는 이 환경에 Blender가 없어 미실행**이며 PC 몫이다(가이드 §1.2 자체 점검 → §5 실행). 배포 매니페스트·`COSTUME_ASSET_VERSION` 6 상승은 렌더 결과가 나온 뒤 별도 작업.
- **목표/범위**: 확정된 2.5D 대검 포즈 시안을 기준으로 3D 모델을 Blender CLI에서 자동 렌더해 기존 코스튬 셀 규약으로 뽑는 파이프라인을 만든다. 실행 스크립트, 실행 가이드, 레퍼런스 시안, 작업 기록을 남기고 런타임 코드는 건드리지 않는다.
- **확정 포즈 스펙**: ① 서기(`idle`) — 양손을 오른쪽 허리 옆에 모아 대검 자루를 잡고 가드·날이 허벅지 앞을 지나 등 뒤 대각선 아래로 끌리듯 뻗음 ② 걷기(`walk`) — 걷는 동안에도 왼손이 풀리지 않고 양손이 오른쪽에 모인 채 무거운 검을 뒤쪽 아래로 끌며 전진 ③ 공격(`attack`) — 등 뒤에서 끌어올리기(Wind-up) → 머리 위 번쩍 듦(Apex) → 앞쪽 아래 세로 원호(Mid-swing) → 전장을 앞바닥까지 길게 뻗어 내리침(Impact), 피니시에서 검 길이가 파묻혀 짧아지지 않음.
- **신규 파일**: `scripts/blender/render_25d_costume.py`(`--input/--out/--actions/--parts/--cell-width/--cell-height/--camera-pitch/--camera-yaw/--dry-run/--help`, `.blend`/`.glb`/`.fbx` 로드, 발끝 정렬·본체 190px 정규화, 파츠 분리 렌더·Holdout, 선택적 아틀라스 패킹), `docs/BLENDER_25D_PIPELINE.md`, `docs/references/{djrpg_25d_3poses_preview_v2,djrpg_attack_4frames_v2}.png`(1024px 이하·양자화 PNG).
- **수정 파일**: `docs/{CODE_MAP,QUICK_PATCH,WORKLOG}.md`, `docs/TASK.md`, 본 작업 기록.
- **금지**: `src/**`·`public/assets/**`·`server/**`·Save/API 변경 금지. `docs/references/`는 문서용 참고 이미지이며 번들·런타임에 포함하지 않는다(`public/assets/**`에 넣지 않음).
- **검증**: `python3 -m py_compile scripts/blender/render_25d_costume.py`, `--help`/`--dry-run` 동작, `npx tsc --noEmit`, `node --test tests/*.test.mjs`, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check`.

### [-] [작업 146] Turso 공용 DB에서 DJRPG 전용 DB 이관
- **브랜치**: `codex/146-turso-db-isolation` · **상태**: `[-]` · **위험 등급**: 높음
- **범위**: `docs/TURSO_DB_GUIDE.md`에 따라 `puzzle-mates`의 DJRPG 데이터만 백업·복사하고 Cloudflare Pages 운영 비밀 변수를 전용 DB로 전환한다. 퍼즐 메이츠 테이블과 코스튬 코드는 수정하지 않는다.
- **확인 사항**: 실제 원본 DB에는 가이드의 14개 외에 `djrpg_boss_{days,attempts,scores,rewards}` 4개 테이블이 있다. 이관 스크립트·검증·가이드를 18개 테이블로 보정한 후 진행한다. 세션 만료·게스트 복구 불가·복사 이후 저장 차이 위험을 이관 전 확인한다.
- **수정 예정**: `scripts/migrate-turso-db.mjs`, `tests/migrate-turso-db.test.mjs`, `server/{database,market-connection,world-boss,world-boss-schema}.mjs`, `tests/functions-adapter.test.mjs`, `docs/TURSO_DB_GUIDE.md`, `docs/CODE_MAP.md`, `docs/QUICK_PATCH.md`, `docs/TASK.md`, 이 작업 기록. 기존 `TURSO_AUTH_TOKEN`은 세션 서명에 유지하고 새 `TURSO_DATABASE_AUTH_TOKEN`만 DB 접속에 사용해 41개 게스트 세션을 보존한다. 실제 DB 키·토큰·세이브 내용은 커밋·로그에 넣지 않는다.

### [superseded] [작업 145] 서리의 가죽두건 코스튬 단일 완성 사례
- **2026-11-19 운영 화면 후속**: PR #89 배포 후 사용자 사진에서 매직 두건·두손검과 함께 문장·신발 등 다른 장비를 착용한 상태가 확인됐다. 기존 전신 시안은 다른 장비가 있으면 적용되지 않아 금속 투구가 계속 보인다. 사용자의 실제 장비 조합에서도 두건만 교체되도록 `codex/145-frost-hood-layered-fix`에서 두건 전용 레이어와 버전 분리 아틀라스를 추가한다. 수정 예정: `scripts/build-costume-atlas.py`, `src/game/render/costumeHero.ts`, `public/assets/costume/v5/atlas/*`, `tests/costume-field-render.test.mjs`, 관련 문서. 기존 v3·v4 배포 에셋은 유지하고, 필드·장비창 실화면 확인 전 완료 처리하지 않는다.
- **후속 구현·검증**: 아이템 원본 천 두건을 기존 남녀 머리 위치에 맞춘 v5 페이지 4장을 생성하고, 혼합 장비에서는 투구 페이지만 교체했다. 기존 전신 v4 조합과 다른 장비 그림은 유지한다. 갑옷 위 남녀 정지·걷기·공격 프레임 합성 진단에서 위치를 확인했다. 타입 검사, 관련 테스트 66건·전체 379건, 아트 검증(v5 4종), `npm run build`, `git diff --check` 통과. PR #92(`7fc8366`) 병합 후 운영 `version.json`에서 `7fc83660fdb0`과 v5 아틀라스 4장 200 응답을 확인했다. 운영 실제 화면 검수는 계속 대기다.
- **대체 결정(2026-11-19)**: 사용자는 부분 두건 코스튬 실기 검수 대신 전사 전체 외형을 새 AI 시안으로 교체하기로 결정했다. `[작업 149]`에서 필드·장비창 모두 새 남녀 시트를 쓰며, 착용 슬롯·능력치·Save는 유지되고 그림만 고정 갑옷·대검이 된다. 본 작업의 추가 실기 검수는 종료하며, 기존 v3/v4/v5 코드·에셋은 별도 참조 정리 전까지 보존한다.
- **담당자**: `songduckjin` · **브랜치**: `codex/145-frost-hood-layered-fix`(전신 시안은 `codex/145-frost-hood-pilot`) · **위험 등급**: 중 · **상태**: `[superseded]`
- **목표/범위**: 전체 장비를 확장하지 않고 `서리의 가죽두건` 한 조합만 완성 사례로 제작한다. 장착 아이템 그림과 동일한 천 두건 실루엣을 남/여 각각 idle·walk·attack에 반영하고, 필드·장비창에서 동일한 그림을 검수한다. 남/여 × 앞·뒤·좌·우 방향 공격 그림을 준비해 전방향 적을 향하게 한다. 2026-11-19 사용자 요청에 따라 이 파일럿만 먼저 병합·배포하고 실제 화면은 사용자가 함께 검수한다.
- **사전 원인**: `서리의`는 매직 등급 접두사이고 이름 정규화 후 `가죽 두건` 끝부분 매칭으로 `helmet-t0`에 이미 연결된다. v3 생성물은 `helmet-<gender>` / `helmet-body-<gender>`의 공유 셀 규약이므로 아이템 아이콘의 천 두건 형태를 보장하지 않는다. `world.ts`는 각도 `player.facing`을 보유하지만 `render/entities.ts`의 공격 셀 선택은 4프레임 공용 시트와 `player.facingSide` 좌우 반전만 사용하므로 화면 앞·뒤 방향 공격을 표현할 수 없다.
- **방향 정책**: `player.facing`을 등각 화면 축으로 투영해 남/여 각각 그린 좌/우/뒤/앞 공격 키 포즈 4장 중 하나를 고른다. idle/walk는 오른쪽 그림을 좌우 반전하는 현행 정책을 유지한다. 기본 공격·스킬 공격은 방향별 한 키 포즈를 공격 창 동안 유지한다.
- **수정 파일**: `scripts/build-costume-atlas.py`(`--pilot-145`·`--pilot-145-overlay`), `src/game/render/{heroMotion,costumeHero,entities}.ts`, `src/ui/equipmentPortrait.ts`, `public/assets/costume/pilot145/source/**`, `public/assets/costume/v4/atlas/pilot-hood-{male,female}.png`, `public/assets/costume/v5/atlas/frost-hood-{armor,body}-{male,female}.png`, `tests/{hero-motion,costume-field-render,equipped-detail}.test.mjs`, `scripts/verify-item-art.mjs`, `docs/COSTUME_SYSTEM.md`, `docs/CODE_MAP.md`, `docs/QUICK_PATCH.md`, `docs/TASK.md`, 본 작업 기록.
- **금지**: 다른 54개 코스튬·아이템 이름/UUID/Save/API·`src/game/store.ts`·DB 변경, v3 운영 에셋 교체, main 직접 커밋. v4는 두 페이지뿐이므로 기존 v3 에셋과 함께 배포한다. 실제 화면 미검수는 완료로 표시하지 않는다.
- **검수 표**: 기준 아이템 아이콘 / 제작 프레임 / 실제 필드 화면 / 실제 장비창 화면을 한 시트에 배치한다. 남녀 각각 idle·walk·공격(좌/우/앞/뒤)을 표기하고 얼굴 가림·손잡이/무기 위치·필드 방향을 검사한다. 합성 목업은 실제 앱 캡처와 명확히 구분한다.
- **검증**: `node node_modules/typescript/bin/tsc --noEmit`; `node --test tests/hero-motion.test.mjs tests/costume-field-render.test.mjs tests/equipped-detail.test.mjs`; `node scripts/verify-item-art.mjs`; `git diff --check` 통과. 사용자 허용 후 로컬 Vite에서 게스트 시작을 눌렀으나 `/api/account`가 HTML을 반환해 실제 필드 진입에 실패했다. 로컬 Pages Functions/Turso 설정이 없고 서버 계정은 생성되지 않았다. 실제 필드/장비창 화면, 얼굴 가림, 공격 중 손잡이 접점은 배포 후 검수 대기다.
- **완료 기준**: 서리의 가죽두건이 기존 투구 색변형·폴백이 아닌 구별되는 천 두건 그림으로 양 성별에 적용되고, 좌/우/앞/뒤 적에 대한 공격 자세가 방향 정책에 맞으며, 실제 화면 네 영역 비교 시트를 남긴다. 이 한 조합 결과를 사용자에게 보여준 뒤 나머지 장비 확대 여부를 결정한다.

### [x] [작업 149] AI 시안 기반 전사 외형 전체 교체
- **담당자**: `songduckjin` · **등록일**: 2026-11-19 · **브랜치**: `codex/149-ai-pilot-warrior-sprites` · **위험 등급**: 중 · **상태**: `[x]` 완료 · **PR**: #101
- **결정**: 사용자는 앞서 만든 서기·걷기·4단계 내려찍기 시안으로 실제 게임 전사 외형을 교체하기로 했다. 새 그림은 고정 갑옷·대검을 포함하므로 착용 아이템의 슬롯·능력치·저장은 유지하되 화면상 갑옷·투구·무기 모습은 고정된다. 남녀 스프라이트는 함께 적용한다.
- **수정 파일**: `src/game/render.ts`, `src/game/render/entities.ts`, `src/game/render/heroScale.ts`, `src/ui/equipmentPortrait.ts`, `public/assets/pilot-25d/**`, `docs/references/djrpg_pilot_*_v1_sheet.png`, `tests/{hero-art,hero-weapon-render,equipped-detail}.test.mjs`, `docs/{COSTUME_SYSTEM,CODE_MAP,QUICK_PATCH,TASK,TASK_songduckjin,WORKLOG}.md`.
- **금지**: `src/game/store.ts`, Save/API/DB, 전사 외 몬스터/NPC, 배포 전 사용자 확인 없이 production deploy. 기존 코스튬 v3·v4·v5 배포 파일은 삭제하지 않는다.
- **검증**: `npx tsc --noEmit`; `node --test tests/appearance.test.mjs tests/hero-art.test.mjs tests/hero-motion.test.mjs tests/hero-weapon-render.test.mjs tests/equipped-detail.test.mjs`; 신규 PNG 투명도·시트 분할 확인; `git diff --check`.
- **완료 기준**: 남녀 각각 idle·walk·attack 시트가 투명 배경과 4칸 프레임 규약을 지키고, 필드·장비창이 같은 새 외형을 보여준다. 화면에서 두 번 그려지는 무기·레거시 코스튬 덧그리기가 없다.
- **완료 결과(2026-11-19)**: [PR #101](https://github.com/songduckjin/DJRPG/pull/101)이 `9e9d736883e0`으로 병합됐다. 운영 Pages `/version.json`도 같은 SHA이며 남녀 idle·walk·attack 에셋 6개 모두 HTTP 200이다. TypeScript, 관련 테스트 86건, 프로덕션 빌드와 diff 검사가 통과했다. Pages 자동 배포가 완료됐고, 로컬 Wrangler 배포는 `CLOUDFLARE_API_TOKEN`이 없어 실행되지 않았다. 별도 `Workers Builds: djrpg` 체크는 실패했지만 Pages 체크와 운영 Pages 제공은 성공했다.

### [x] [작업 134] 필드 캐릭터 통합 바디 복구 및 무기 소켓·액션 자연화
- **등록자·담당자**: `songduckjin` · **등록일**: 2026-11-18 · **브랜치**: `task/134-field-gear-action` · **위험 등급**: 중 · **상태**: `[x]` 완료
- **완료 결과**: 남녀 갑옷·투구 상태별 검 없는 서기·걷기 시트 10장, 직업·성별별 무기 소켓, 공격 시 소켓 검 숨김, 등급별 검기 색을 적용했다. 타입 검사·관련 테스트 76개·이미지 검증·diff 검사 통과. PR #66이 `272c4619924603565a0b765a65ca0026078bb904`로 병합됐고 Cloudflare Pages Production `/version.json`에서 `272c46199246`을 확인했다. 모바일 실기는 미확인.
- **직접 수정**: `src/game/render/entities.ts`, `src/game/render/heroSockets.ts`(신규), `src/game/render/heroScale.ts`, `src/game/render/vfx.ts`, `src/game/render.ts`, `public/assets/*swordless.png`(남녀 서기·걷기 10장 신규), `tests/hero-weapon-render.test.mjs`, `tests/hero-art.test.mjs`, `docs/CODE_MAP.md`·`docs/QUICK_PATCH.md`. **간접 영향**: `src/game/appearance.ts`(`heroAppearance`의 갑옷·투구 분기), `tests/appearance.test.mjs`, `tests/hero-motion.test.mjs`, `tests/equipped-detail.test.mjs`. **건드리지 않음**: `src/ui/equipmentPortrait.ts`·`src/ui/modals/equipModal.ts`(장비창 미리보기, [작업 133] 영역), `src/game/store.ts`(세이브 형식), `server/**`.
- **목표**: PR #61에서 필드 캐릭터(`entities.ts`)에 적용한 5부위 2D 아이콘 덧그리기를 걷어내, 갑옷·투구 통합 바디 시트의 자연스러운 어깨·체형·공격 액션을 복구한다. 무기는 프레임별 소켓 데이터(`heroSockets.ts`)로 분리해 서기·걷기·공격 전환이 매끄럽게 이어지게 하고, 무기 등급·종류의 차이는 덧그리기 대신 검기 이펙트로 남긴다.
- **추가 사용자 결정(2026-11-18)**: 기존 통합 서기·걷기 시트에도 검이 이미 있어 소켓 무기와 중복된다. 남녀 갑옷·투구 상태별 **검 없는 시트부터 새로 제작**하고, 서기·걷기에는 소켓 검 한 자루만 표시한다. 무갑옷 상태는 기존 검 없는 base 시트를 사용한다. 공격 시트의 검은 유지하고 소켓 검을 숨긴다.
- **배경·근거(현재 코드)**:
  - `drawHero`는 `bodySave = { ...save, equipment: { ...save.equipment, helmet: undefined, armor: undefined } }`로 갑옷·투구를 벗긴 시트를 고른 뒤 `syncGear`에서 5부위(`visibleGearSlots`)를 모두 덧그린다(`gearPose`·`attackGearPoses`·`idleWeaponPoses`·`attackWeaponPoses`가 `entities.ts`에 하드코딩). 그 결과 몸통·어깨가 아이콘과 겹치고 공격 프레임에서 칼이 2자루로 보인다.
  - `appearance.ts`의 `idle`·`walk`·`attack`은 이미 갑옷·투구를 포함한 통합 시트를 고르고, `attack` 시트(`attackSheets`·`animationPaths`)에는 검이 그려져 있다. 즉 통합 시트로 돌아가면 갑옷·투구는 추가 작업 없이 맞는다.
  - 사용자 지시(2026-11-18): "이거는 규칙으로 해놔야대 다른 직업나왔을때도 고려해야돼" — 장비창/필드 분리와 다직업 구조를 `AGENTS.md`·`CODE_MAP.md` §4에 규칙으로 먼저 못박았고, 이 작업은 그 규칙의 첫 구현이다.
  - 번호 주의: 등록 시점 `main`(`84a1dd0`)에 fks3997의 `[작업 133]`(장비창 실제 착용 캐릭터 이미지, `task/133-equipped-character-art`)이 이미 `[-]`로 선점돼 있어 이 작업은 **134**로 등록했다. 파일은 겹치지 않는다(그쪽은 `ui/`·`public/assets/warrior_equipped*`, 이쪽은 `render/`).
- **불변 계약**:
  1. 장비창 중앙 미리보기(`ui/equipmentPortrait.ts` 단일 합성 초상화, [작업 133])는 정지 프리뷰라 그대로 두고 이번 작업에서 손대지 않는다(필드와 코드 경로가 다르다).
  2. 세이브 형식·`store.ts` 변경 없음: `classId`를 세이브에 넣지 않는다(전방 호환 필드 도입은 별도 작업). `heroSockets.ts`의 직업 판별은 `heroClass(save)` 한 곳을 거치고, 지금은 항상 `'warrior'`를 돌려준다.
  3. 남/여 동시 반영(양쪽 소켓·시트 루프 검증).
- **구현 항목**:
  1. **`entities.ts` 바디 복구**: 실제 `save`의 `heroAppearance`가 갑옷·투구·공격 시트를 고른다. 서기·걷기는 검 없는 갑옷 통합 시트 또는 무갑옷 base 시트를 고른다. `syncGear`에서 `helmet`·`armor`·`gloves`·`boots` 덧그리기를 제거하고 무기만 남긴다. `gearPose`·`attackGearPoses`의 장비 좌표는 제거하고, 몸 기준 `heroBodyHeight`·`heroScale` 계산을 유지한다. 그림자 반경은 기존처럼 `heroBodyHeight` 기준을 쓴다.
  2. **`heroSockets.ts` 신규 분리(다직업 구조)**: `entities.ts`의 무기 포즈 좌표를 옮겨 **처음부터 직업 × 성별 표**로 정의한다.
     ```ts
     // src/game/render/heroSockets.ts
     import type { Gender, Save } from '../store';
     export type ClassId = 'warrior';                       // 직업 추가 시 여기에만 늘린다
     export type WeaponSocket = { u: number; v: number; size: number; rotation: number; zOrder: number };
     export type WeaponMotionSockets = { idle: WeaponSocket; walk: readonly WeaponSocket[] }; // walk = 8프레임
     export type WeaponSocketTable = Record<ClassId, Record<Gender, WeaponMotionSockets>>;
     export const weaponSockets: WeaponSocketTable = { warrior: { male: {…}, female: {…} } };
     export function heroClass(save: Pick<Save,'gender'>): ClassId;             // 지금은 'warrior' 고정
     export function weaponSocket(classId: ClassId, gender: Gender, motion: 'idle' | 'walk', frame: number): WeaponSocket;
     ```
     - `walk` 8프레임은 상하 바운스·발 디딤 보정을 값으로 담는다(계산식이 아니라 데이터). `frame`은 `0..7`로 정규화하고, `motion`이 `idle`이면 `idle` 소켓, `walk`면 `walk[frame]`을 준다.
     - `entities.ts`는 `weaponSocket(heroClass(save), save.gender, moving ? 'walk' : 'idle', walkingFrame)`만 호출하고 좌표 상수를 갖지 않는다. 무기 앵커(`.18`/`.82`)와 `zOrder`(무기 레이어 순서)도 소켓 표에서 읽는다.
     - 새 직업 추가 시 필요한 것은 `appearance.ts`의 시트 분기 + `weaponSockets`의 `classId` 항목 + 그 직업 바디 실측 `heroScale.ts` `heroBodyPx`뿐이며, `entities.ts`는 수정하지 않는다.
  3. **공격(`attack`) 자연화·칼 중복 방지**: `animation === 'attack'`(=`appearance.attack` 시트 사용 구간)에서는 무기 스프라이트를 `visible = false`(또는 `alpha 0`)로 두어 2자루 겹침을 없앤다. 공격 종료·걷기·서기로 돌아오면 소켓 위치로 즉시 복귀하며, 프레임 전환에서 깜빡이지 않도록 `syncGear`에서 스프라이트를 파괴·재생성하지 말고 표시만 바꾼다. 무기 교체 시에는 기존처럼 텍스처 키 교체 경로를 유지한다.
  4. **검기 색으로 무기 차이 표현(`vfx.ts`)**: `drawSkillVfx`의 `slash2`(부채꼴 2겹 아크) 색을 장착 무기 등급 색으로 바꾼다 — 파일 안의 `rarityColors`(지금은 드랍 글로우용)를 그대로 재사용하고, `weaponSlashColor(world)` 같은 작은 헬퍼로 `save.equipment.weapon?.rarity ?? 'common'`을 읽는다(무기 없으면 기존 흰색 유지). 기본 공격 `slash`는 [작업 123]으로 이펙트를 그리지 않으므로 되살리지 않는다. 등급에 따라 선 굵기·잔상 알파를 조금씩 달리해 교체감을 준다. `drawSkillVfx`는 `effect`만 받으므로 `world`(또는 `weaponColor`)를 인자로 넘기는 시그니처 변경은 `render.ts` 호출부 1곳만 고친다.
  5. **성별 교차 동기화 + 부분 검증 + 매뉴얼**: 남/여 모두 같은 경로로 통과시키고 `tests/hero-weapon-render.test.mjs`를 새 계약에 맞게 고친다(무기 1개만 남고, `heroGear` 키는 `['weapon']`, 공격 프레임에서는 무기 미표시, idle·walk 8프레임에서 좌표가 유한값). 통과 후 `docs/CODE_MAP.md` §1 '캐릭터 외형·성별·스프라이트' 행 연관 파일과 §3 `render/` 항목에 `heroSockets.ts` 1줄씩 추가한다.
- **검증 (부분 테스트)**: `pnpm exec tsc --noEmit`, `node --test tests/appearance.test.mjs tests/hero-motion.test.mjs tests/hero-art.test.mjs tests/hero-weapon-render.test.mjs tests/equipped-detail.test.mjs`, `node scripts/verify-item-art.mjs`, `git diff --check`. 전체 `npm test`·`npm run build`는 공용 계약(`store.ts` 등)을 건드리지 않았으므로 실행하지 않는다. 브라우저·Playwright 실기는 요청 시에만.
- **완료 기준**: 필드 캐릭터가 검 없는 장착 갑옷·투구 통합 서기·걷기 시트(어깨·체형 정상)로 그려지고, 장갑·부츠·갑옷·투구 아이콘이 몸 위에 덧그려지지 않는다. 무기는 서기·걷기 8프레임에서 손 위치를 따라가고 공격 4프레임에서는 공격 시트의 한 자루만 보인다. 검기 색이 장착 무기 등급을 반영한다. 남/여 모두 동일. `heroSockets.ts`가 `Record<ClassId, Record<Gender, …>>` 표로 존재하고 `entities.ts`에 무기 좌표 하드코딩이 없다. 새 시트의 8칸 경계와 본체 높이 검증 후 PR 병합.
- **동시 작업 확인**: 등록 시점(2026-11-18, `main` = `84a1dd0`) `docs/TASK.md`의 다른 `[-]` 작업은 fks3997의 `[작업 133]`(장비창 미리보기, `ui/`·`public/assets/warrior_equipped*`) 하나이며 수정 파일이 겹치지 않는다. 번호는 134로 올려 잡았다.

### [-] [작업 136] 통합 내 정보(장비·스탯) UI 개편 및 4티어 장비창 초상화 교체
- **등록자**: `songduckjin` · **실행 담당자**: `songduckjin`(`codex` 실행 가능) · **등록일**: 2026-11-18 · **브랜치**: `task/136-unified-equip-ui` · **위험 등급**: 중 · **상태**: `[-]` 등록
- **선행 조건(갱신 2026-11-18)**: `[작업 135]`는 PR #71로 main에 병합됐다. PR #72는 현재 Draft로 열려 있다. 내 정보 UI 레이아웃 변경은 재사용 후보로 보존하되, 장비 초상화는 `docs/COSTUME_SYSTEM.md`의 공용 외형 계획과 프로토타입 결과를 기준으로 재검토한다. PR #72는 사용자 검토 전 병합하지 않는다.
- **선반영 에셋(이 등록 PR에 포함 · 코드는 미변경)**: 남/여 2·3·4티어 장비창 전신 초상화 6장.

  | 파일 | 크기(px) | 용량 |
  |---|---|---|
  | `public/assets/warrior_equipped_t2_male.png` | 286×720 | 51KB |
  | `public/assets/warrior_equipped_t3_male.png` | 289×720 | 52KB |
  | `public/assets/warrior_equipped_t4_male.png` | 284×720 | 68KB |
  | `public/assets/warrior_equipped_t2_female.png` | 321×720 | 60KB |
  | `public/assets/warrior_equipped_t3_female.png` | 321×720 | 55KB |
  | `public/assets/warrior_equipped_t4_female.png` | 324×720 | 77KB |

  - 기존 `warrior_equipped_starter_{male,female}.png`은 RGBA(투명 배경, 알파 0~255) 799×1967·839×1874에 1.8MB·2.0MB다. 새 6장도 **투명 배경 + 부드러운 알파 가장자리**로 맞췄고(생성 원본의 순수 검은 배경만 알파 0으로 제거, 갑주 내부 어두운 면적은 보존), 장비창 표시 크기(높이 약 300px·레티나 2배)에 맞춰 **높이 720px**(비율 유지)로 줄인 뒤 256색 팔레트 PNG(tRNS 알파 테이블)로 경량화했다. 6장 합계 355KB(1MB 미만).
  - 파일 안 그림의 세로 채움 비율은 starter 0.95 / 남 2~4티어 0.93~0.95로 같아, `renderEquipmentPortrait`가 캔버스(312×768)에 꽉 채워 그리는 현재 방식에서 티어 간 캐릭터 크기가 튀지 않는다.
- **목표**: 하단 내비게이션의 `내 상태`·`장비` 두 탭을 **`내 정보` 한 탭**으로 합쳐 모바일에서 한 화면에 장비·스탯·가방이 모두 보이게 하고(세로 공간 절약), 장비창 중앙 미리보기를 종이인형 5부위 덧그리기에서 **티어별 전신 일러스트 + 팔레트 스왑**으로 바꿔 실제 착용 티어가 그림으로 드러나게 한다. 성별은 캐릭터 생성 시 고른 값으로 고정한다.
- **사용자 결정(2026-11-18)**: ① `내 상태` 탭 제거, `장비` 탭을 `내 정보`로 통합(하단 탭 3개: 내 정보·스킬·거래소) ② 성별 변경 기능 제거(생성 시 선택 고정) ③ 2·3·4티어 전신 초상화를 장비창에 적용, 갑옷·투구 팔레트 스왑은 [작업 135] 결과 재사용.
- **배경·근거(현재 코드)**:
  - `src/ui/interface.ts` 38행 `Modal` 유니온에 `'status'`와 `'equipment'`가 따로 있고, 82행 `.bottom-nav`가 `status`·`equipment`·`skills`·`market` **4버튼**을 그린다. 197행 제목 표가 `status:'내 상태'`, `equipment:'장비'`로 갈라져 있고, 191행이 `.status-modal` 클래스를, 216행이 `this.renderCharacter(dialog)`를 호출한다. 199~204행의 도감 버튼은 `equipment`↔`codex` 전용이다.
  - `src/ui/modals/statusModal.ts`(23줄)는 요약 바(`.character-overview`: LV·층·경험치·골드·강화석) + `.character-stats` 5칸(공격·방어·체력·치명·공속) + `.gender-switch`(성별 변경 버튼, `save.gender`를 직접 바꾼다)로 구성된다. 이 함수는 `interface.ts` 한 곳에서만 쓰인다.
  - 같은 성별 변경 버튼이 `src/ui/modals/accountModal.ts` 24~31행(`.account-gender`)에도 있어 `save.gender`를 똑같이 바꾼다. **성별 고정 목표를 위해서는 이 버튼도 함께 없애야 한다**(아래 구현 항목 1-3).
  - `src/ui/modals/equipModal.ts` `renderEquipment`(150~190행)는 `.equipment-showcase`를 5칸(좌: 무기·투구·갑옷·장갑·부츠)·중앙 초상화(`.showcase-hero` > `.showcase-figure` > `.showcase-body` img, `renderEquipmentPortrait`의 312×768 dataURL)·5칸(우: 문장·목걸이·벨트·반지1·반지2)로 3열 배치하고, 아래에 `.showcase-stats`(전투력·공격·방어·HP)와 `.modal-hint`를 둔다. 슬롯 칸은 `data-equipped-slot`·`.equipment-slot.<rarity>`·`.slot-part`(슬롯명)·`.slot-meta > b`(이름)를 갖고 `showEquippedDetail`로 상세 팝업을 연다.
  - `src/ui/equipmentPortrait.ts`는 `fit` 좌표 표(성별 × 10슬롯)와 `wearableEquipmentImage` 프레임 합성으로 종이인형을 그린다(112행 캔버스 312×768, 5부위 + 장신구 아이콘 덧그리기). `starterFrames`로 5부위가 모두 스타터면 `/assets/warrior_equipped_starter_{gender}.png`를 쓰고, 아니면 `heroAppearance(bodySave).portrait`(갑옷·투구를 벗긴 맨몸 시트) 위에 부위를 덧그린다.
  - 스탯 이름은 `items.ts` 33~37행 `slotNames`(두손검·문장·투구·갑옷·목걸이·장갑·벨트·신발·반지 1·반지 2)와 `statNames`(공격·방어·체력·치명·공속)를 쓴다. 전투력은 `equipModal.ts`의 `Math.round(attack*3 + defense*2 + health*.2 + crit*2 + speed*2)`, 경험치는 `expToNext(level)`·`MAX_LEVEL`(`store.ts`), 현재 HP는 `world.player.hp`다.
  - 스타일은 `src/styles.css`가 아니라 **`src/styles/modals.css`**(`main.css`가 `hud`→`modals` 순으로 import)에 있다: `.equipment-modal .modal-bag`(flex 1·min-height 0·overflow hidden), `.showcase-side`, `.showcase-stats`, `.character-stats`, `.gender-switch`, `.status-modal …`(253~261행), 하단 탭은 `src/styles/hud.css` `.bottom-nav`(31~34·53~61행).
- **구현 항목 1 — 통합 '내 정보' 모달**
  1. **탭 정리(`interface.ts`)**: `Modal` 유니온에서 `'status'`를 빼고, `renderCharacter` import·`renderCharacter` 위임 메서드·216행 호출·191행 `status-modal` 클래스 토글·197행 제목 표 항목을 제거한다. `.bottom-nav`는 `equipment`(라벨·title·aria-label **`내 정보`**, 아이콘은 기존 `nav_equipment_v2.png` 유지)·`skills`·`market` **3버튼**이 된다. 199행 도감 버튼 분기는 `equipment`(=내 정보)에서 그대로 동작해야 한다. `src/ui/modals/statusModal.ts`는 삭제한다(`interface.ts` 외 import 없음). `styles/modals.css`의 `.status-modal …`·`.gender-switch` 규칙도 함께 정리한다.
  2. **모달 제목**: `equipment` 모달의 `<h2>`를 `'내 정보'`로 바꾼다(도감 버튼·장비/도감 토글 유지).
  3. **성별 고정**: `statusModal`은 삭제로 끝나고, `accountModal.ts`의 `.account-gender` 성별 변경 블록도 제거해 `save.gender`를 바꾸는 UI를 남기지 않는다(서버 저장 형식·`save.gender` 필드 자체는 불변, 캐릭터 생성 `charactersModal`의 성별 선택은 유지).
  4. **상단 레이아웃(모바일 컴팩트)**: `.equipment-showcase`를 좌우 5칸 3열 구조에서 **상단 2분할**로 바꾼다 — 왼쪽은 초상화(`.showcase-hero`/`.showcase-figure`/`.showcase-body` 재사용, 현재보다 낮은 컴팩트 높이, 성별 전환 버튼 없음), 오른쪽은 ①요약 바(`LV · 층 · EXP % · 강화석`) ②**6칸 스탯 그리드**(2열×3행: `전투력`·`HP`·`공격력`·`방어력`·`치명타`·`공격속도`). HP는 `현재/최대`(`Math.ceil(world.player.hp)`/`stats.health`)로 표시하고, EXP는 `%`(MAX면 `MAX`)로 표시한다. 요약 바의 골드 강조(`goldMarkup`)는 기존 `renderCharacter`와 같은 방식을 유지한다.
  5. **장비 10칸 그리드**: **5열 × 2줄 정사각 아이콘**으로 배치하고 각 칸 아래에 슬롯명 라벨을 둔다. 1행 `weapon`(두손검)·`helmet`(투구)·`armor`(갑옷)·`gloves`(장갑)·`boots`(신발), 2행 `offhand`(문장)·`necklace`(목걸이)·`belt`(벨트)·`ring1`(반지 1)·`ring2`(반지 2). 등급 테두리(`.equipment-slot.<rarity>`), 슬롯명 라벨(`.slot-part`), 탭/호버 시 `showEquippedDetail` 상세 팝업, `data-equipped-slot`, `aria-expanded`, `pointerenter`/`focus` 바인딩은 **현재 그대로 유지**한다(테스트·`equippedDetail` 계약). 좁은 화면에서 5열이 깨지지 않도록 정사각 `aspect-ratio`·`min-width: 0`·아이콘 `width: 100%` 기준으로 잡는다. 긴 장비 이름은 그리드에서 숨기고 상세 팝업으로 넘긴다(`wrapEquipmentName`은 팝업 쪽에서 계속 사용).
  6. **가방 영역 확대**: 하단 `.modal-bag` 높이를 넓혀 모바일에서 더 많은 가방 줄이 한 화면에 보이게 한다(상단 블록 고정 높이 축소 + `.modal-bag` `flex: 1` 유지, `@media (max-height: 750px)`의 `min-height: 220px`·sticky footer 규칙 재확인). 가방 필터·정렬·분해·자동 장착 동작은 불변.
- **구현 항목 2 — 4티어 장비창 초상화(`ui/equipmentPortrait.ts`)**
  1. **종이인형 제거**: `fit` 좌표 표와 `wearableEquipmentImage` 5부위(무기·투구·갑옷·장갑·부츠) 프레임 합성, `starterFrames` 판정을 제거한다. 장신구(문장·목걸이·벨트·반지 1·2) 아이콘 오버레이는 **선택 사항**이며, 남길 경우 새 전신 초상화와 같은 비율(starter와 동일)이므로 기존 좌표를 그대로 쓴다. 무기·갑옷·투구는 그림에 이미 그려져 있으므로 **절대 덧그리지 않는다**.
  2. **착용 상태별 그림 선택** — `armorTier`/`helmetTier`(135)로 분기한다.
     - 갑옷 + 투구 **둘 다**: 갑옷 티어에 따라 `1`→`/assets/warrior_equipped_starter_{gender}.png`, `2`→`/assets/warrior_equipped_t2_{gender}.png`, `3`→`/assets/warrior_equipped_t3_{gender}.png`, `4`→`/assets/warrior_equipped_t4_{gender}.png`를 고르고, 상단 투구 밴드는 `helmetPalette`, 몸통 갑옷은 `armorPalette`로 스왑한다.
     - **투구만**(갑옷 없음): `heroAppearance(save).portrait`의 투구 + 맨몸 초상화(`warrior_{gender}_{armed ? 'sword' : 'base'}_helm.png`) + 투구 팔레트 스왑.
     - **갑옷만**(투구 없음): `warrior_armored_nohelm.png` / `warrior_female_armored_nohelm.png` + 갑옷 팔레트 스왑.
     - **둘 다 없음**: `heroAppearance(save).portrait`의 맨몸/무기 초상화를 그대로 쓴다(스왑 없음).
     - 무기는 장비창에서 별도 표시하지 않는다(전신 그림의 검 사용). `armed` 판정은 `heroAppearance`가 이미 돌려주는 값을 따른다.
  3. **팔레트 스왑 재사용(135)**: `gearTint.ts`의 **피부톤 보존 판정 + 머리 밴드/몸통 2팔레트 합성**을 캔버스 레벨 함수(예: `tintPortraitCanvas(source, armorKey, helmetKey)`)로 재사용한다. 135가 Pixi `Texture` 캐시만 노출한다면, `gearTint.ts`에 캔버스 함수를 **추가만** 하고(135의 텍스처 캐시·키 규칙 불변) 여기서 호출한다. 136에서 픽셀 판정 로직을 복제하지 않는다.
  4. **캐시**: 키는 `` `${basePath}|${armorPaletteKey ?? '-'}|${helmetPaletteKey ?? '-'}` ``로 하고, 장비창 dataURL `Map`(상한 24, 기존 LRU 유지)에 1회만 만들어 담는다. 매 렌더 `getImageData` 금지.
  5. **계약 유지**: `equipmentPortraitPlan(save)`은 `{ base, parts, key, starter }` 형태를 유지하되 `base`가 티어별 전신 경로가 되고 `parts`는 장신구만 담는다(빈 배열 허용). `renderEquipmentPortrait(save)`는 312×768 캔버스·`imageSmoothingQuality='high'`·`tightFrame` 기준 배치를 유지하고, 합성 결과의 `toDataURL()`을 돌려준다. 이미지 로딩 실패 시 `console.error` 후 `base` 원본으로 폴백한다(현재 `equipModal`의 `.catch` 동작 유지).
- **테스트**
  - `tests/equipped-detail.test.mjs`: 현재 `preview.base === '/assets/warrior_equipped_starter_...'`와 5부위 `parts` 목록을 단정한다. **새 계약으로 갱신**한다 — 남/여 × (갑옷 티어 1~4 × 투구 유무)에서 `base`가 `warrior_equipped_starter|t2|t3|t4_{gender}.png`로 정확히 매핑되고, `parts`에 `weapon`·`armor`·`helmet`·`gloves`·`boots`가 **없으며**, 투구만/갑옷만/둘 다 없음은 `heroAppearance` 경로를 쓴다. 6장 PNG가 `PNG` 시그니처와 높이 720·폭 256 초과를 만족하는지도 함께 검사한다.
  - `tests/appearance.test.mjs`·`tests/hero-motion.test.mjs`는 [작업 135] 결과 기준으로 통과해야 한다(이 작업에서 135 계약을 깨지 않는다).
  - 새 테스트(예: `tests/equipment-info.test.mjs`)로 ① 하단 탭이 3개이고 `status` 항목이 없음 ② `renderCharacter`·`gender-switch`·`account-gender` 참조가 `src/`에 남아 있지 않음(소스 문자열 검사) ③ 6칸 스탯 라벨 목록 ④ 10슬롯 순서(1행/2행) 상수 검사를 둔다.
- **검증**: `pnpm exec tsc --noEmit`, `node --test tests/equipped-detail.test.mjs tests/appearance.test.mjs tests/hero-motion.test.mjs tests/modal-ui.test.mjs`, `git diff --check`. 에셋을 교체하면 `node scripts/verify-item-art.mjs`와 캐시 버스터(`?v=N`)도 함께. 브라우저·Playwright 실기(모바일 세로 화면에서 5열 그리드·가방 줄 수·상세 팝업)는 **요청 시에만** 한다.
- **완료 기준**: 하단 내비게이션이 `내 정보 · 스킬 · 거래소` 3탭이고 `내 정보` 한 화면에 초상화·요약·6스탯·장비 10칸(5×2)·가방이 모바일 세로 화면에서 스크롤 없이 들어간다. 성별을 바꾸는 UI가 없고 캐릭터 생성 시 고른 성별이 유지된다. 장비창 초상화는 착용 갑옷 티어(1~4)에 따라 다른 전신 일러스트를 보여 주고, 투구만·갑옷만·둘 다·둘 다 없음 네 경우가 서로 구분되며, 갑옷·투구 팔레트 색이 135의 팔레트 표를 따르고 **얼굴·피부·머리카락은 원본 색**을 유지한다. 무기·갑옷·투구 2D 아이콘 덧그리기는 남아 있지 않고, 장비 상세 팝업·도감 버튼·가방 동작은 이전과 같다. 타입 검사·해당 테스트·`git diff --check` 통과 후 PR 병합.
- **동시 작업 확인**: 등록 시점 `origin/main` = `3f20949`. `docs/TASK.md`의 다른 `[-]` 작업은 `[작업 135]` 하나이고, 135는 `appearance.ts`·`render/entities.ts`·`render/gearTint.ts`(신규)·`tests/appearance.test.mjs`를, 136은 `ui/`·`styles/`·`ui/equipmentPortrait.ts`를 만져 **파일이 겹치지 않는다**(135 머지 후 착수라 순서도 안전). 번호 136은 등록 시점 `docs/`·원격 브랜치 어디에도 없음을 확인했다.

## 다음 작업 대기

## 작업 등록 양식

새 작업은 아래 형식으로 등록한다. 실제 작업을 시작하기 전에 상태를 `[-]`로 변경한다.

```md

## [ ] [작업 번호] 작업 제목
- 담당자: songduckjin
- 등록일:
- 상태: 대기
- 수정 예정 파일:
- 목표:
- 작업 내용:
- 완료 기준:
```

## 상태 표기

- `[ ]`: 대기
- `[-]`: 진행 중
- `[x]`: 검증 완료

## 아카이브
- 이전 완료 작업 상세: `docs/archive/2026-11/TASK_songduckjin-history.md`
