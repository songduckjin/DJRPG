# 작업 로그

## 2026-11-19 — 자동전투 추격 후 공격 멈칫(사거리 경계 데드존) 수정

- **제보**: 자동 사냥 중 캐릭터가 때리다가 멈추는 현상. `src/game/world.ts` `update`에서 적 추격 정지 거리(`stop = 89`)와 공격 사거리(`distance < 90`)가 1px 어긋나 있었다. 적이 89~90 구간에 있거나 넉백으로 경계에 걸친 프레임에는 `pursuing`이 참으로 남아 `activeMove`가 0이 아니고, `action()`의 "수동 이동 중이면 공격 취소" 규칙(`activeMove > .05`) 때문에 사거리 안인데도 공격이 씹혔다.
- **수정**: 적(`drop` 아님)이면 `distance < 90`에서 추격을 **즉시** 끊고(`pursuing = false`) 그 프레임부터 서서 공격한다. 사거리 경계 90은 추격 쪽에 두어(`distance < 90` 아니면 추격) 정확히 90에서도 붙어 들어가 공격한다. 드랍 추격 정지 거리(60/20)·`action()`의 이동 차단·쿨다운·저장/API 계약은 그대로다.
- 테스트: `tests/world-movement.test.mjs`에 회귀 검사 2건 추가 — ① 89.9·89.5·89·85.2·40에서 추격 상태로 시작해도 사거리 안이면 서서 그 프레임에 공격(걷기 0, 피해 발생) ② 89.5 경계에 6초 고정해도 쿨다운마다 계속 공격(8회 이상)하고 한 번도 걷기 시작하지 않음. 수정 전 코드에서 ①이 실패하는 것을 확인했다.
- 검증: `tsc --noEmit`, 전체 `node --test tests/*.test.mjs`, `npm run build`, `git diff --check` 통과. PNG·스크린샷 확인은 이미지 입력 제한으로 하지 않았다.

## 2026-11-19 — 캐릭터 외형 3부위(갑옷·투구·무기)·무기 크기 원복 (실기 후속)

- **제보 2건**: 실기 화면에서 ① 문장(`offhand`)이 캐릭터 밖으로 튀어나와 보임 ② 두손검이 작아 보임. ①은 문장·장갑·신발 코스튬 레이어가 캐릭터에 붙어 그려진 결과였고, ②는 작업 143/144의 무기 70% 축소 보정 때문이었다.
- `src/game/render/costumeHero.ts`: `costumeSlotDrawOrder`(6부위)를 `costumeAppearanceSlots = ['armor','helmet','weapon']`로 바꿔 `planHeroCostume()`이 갑옷·투구·무기 3부위만 계획한다. 문장·장갑·신발은 착용·스탯·`내 정보` 10칸 슬롯·코덱스·Save·매니페스트 계약과 아틀라스 PNG를 그대로 두고 **그림 레이어만** 없다. 외형을 그리지 않는 부위는 `planCostume()`을 호출하지 않아 매핑 밖 이름이어도 폴백을 만들지 않는다.
- 무기 `if (definition.slot === 'weapon')` 70% 축소 블록을 제거해 매니페스트 `fit`(없으면 1배)만 쓴다. 축소 보정식이 `(1 - scale)` 항이라 손 소켓 접점은 1배에서도 같은 좌표다(검만 커진다).
- 테스트: `tests/costume-field-render.test.mjs`에서 6부위 기대 단언을 3부위 기대로 바꾸고, 회귀 검사 2건(문장·장갑·신발 착용/미매핑 이름이어도 레이어·폴백 없음, 무기 `scale`·`offset`·`rotation` 원복)을 추가했다. `tests/equipped-detail.test.mjs`의 문장·신발 레이어 기대도 "없음"으로 바꿨다. 아틀라스 실패 목록은 실제로 쓰는 3페이지로 정리했다.
- 문서: `docs/COSTUME_SYSTEM.md` v2.0(§7.9 신설, §7.7 축소 항목에 원복 표시), `docs/CODE_MAP.md`(캐릭터 외형 행·`costumeHero.ts` 항목).
- 검증: `tsc --noEmit`, 전체 `node --test tests/*.test.mjs` **380건**, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과. PNG·스크린샷 확인은 이미지 입력 제한(2026-11-19 17:45까지) 때문에 하지 않았고 화면 검수는 사용자 몫이다.

## 2026-11-19 — 서리의 가죽두건 혼합 장비 레이어 (작업 145 후속)

- **운영 화면 후속**: PR #89의 전신 시안은 `서리의 가죽두건 + 낡은 두손검` 단일 조합에서만 적용된다. 운영 화면에서 문장·신발 등 다른 장비를 함께 착용한 상태가 확인돼 전신 대체 조건을 벗어나면 v3 금속 투구가 그대로 보였다. `codex/145-frost-hood-layered-fix`에서 아이템 원본의 천 두건만 머리 위치에 배치하는 **두건 전용 레이어**를 추가했다.
- `scripts/build-costume-atlas.py --pilot-145-overlay`: 아이템 원본 아이콘(`item-art/helmet_0.png`)의 천 두건만 잘라 남/여 × (갑옷 위 / 맨몸 위) 머리 기준점에 얹은 v5 페이지 4장(`public/assets/costume/v5/atlas/frost-hood-{armor,body}-{male,female}.png`)을 생성한다. v3 배포물·매니페스트와 `COSTUME_ASSET_VERSION`(3), v4 전신 페이지는 바꾸지 않았다.
- `src/game/render/costumeHero.ts` `planHeroCostume()`: 혼합 장비에서는 투구 레이어만 `frost-hood-*` 페이지(variant 0, `assetVersion: 5`)로 바꾼다. 갑옷·문장·무기·신발 레이어와 레이어 순서, 전신 v4 경로, 장비창 공용 계획은 그대로이며 공격 방향은 기존 v3 정책(좌우 반전)을 따른다.
- 테스트·검증 도구: `tests/costume-field-render.test.mjs`에 갑옷+두건, `tests/equipped-detail.test.mjs`에 갑옷·문장·신발+두건(필드 계획 = 장비창 계획) 검사 2건을 추가했고, `scripts/verify-item-art.mjs`가 v5 페이지 4장의 존재와 2048×2048 RGBA 규격을 검사한다.
- 검증: `npx tsc --noEmit`, 관련 테스트 **66건**, 전체 `npm test` **379건**, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과. Save/API·`src/game/store.ts`·`server/**` 무변경.
- PR #92로 반영했다. 실제 운영 필드·장비창 화면(얼굴 가림·손잡이 접점)은 사용자 검수 전이므로 작업 145는 `[-]`를 유지한다.
- **병합·배포 실측**: PR #92를 `7fc83660fdb0e3cdf219edf724511ffee306ab5f`로 스쿼시 병합했다. 운영 `https://djrpg.pages.dev/version.json` = `7fc83660fdb0`, v5 아틀라스 4장(`frost-hood-{armor,body}-{male,female}.png`)·v4 전신 1장·v3 매니페스트가 200으로 응답하고, 배포 번들에 `frost-hood-`·`pilot-frost-leather-hood-overlay` 코드가 포함된 것을 확인했다. 화면 캡처는 이미지 입력 제한으로 하지 않았고 실제 필드·장비창 검수는 사용자 몫으로 남긴다.

## 2026-11-19 — 코스튬 동작 싱크·캐시 제한 (작업 144)

- **실기 후속 수정**: 무기 레이어의 104px 검이 머리 위까지 돌출되던 문제를 공용 외형 계획에서 70% 축소·손 소켓 유지로 보정했다. `낡은 투구`는 v3의 열린 얼굴 공용 투구로 그려지던 문제를 확인하고, 정확한 닫힌 바이저가 있는 통합 본체·초상화로 폴백시켰다. 기존 PNG·Save/API 계약은 변경하지 않았다.
- 후속 검증: 남/여 정지 셀 합성 비교, TypeScript 검사, 관련 Node 테스트 **86건**, 아틀라스 검증, diff 검사를 통과했다. 모바일 실기 재확인은 남아 있다.
- 설계·구현 불일치 수정: `spin` 시 본체가 360° 도는 동작을 제거하고, 필드 코스튬·기존 바디 폴백 모두 회전값 0으로 통일했다. 스킬 프레임·회오리·잔상 연출은 유지한다.
- 필드 아틀라스 캐시를 현재 계획에 필요한 최대 6페이지로 제한했다. 장비 계획 변경 시 코스튬 스프라이트와 잔상을 먼저 해제하고, 파생 셀 텍스처와 이전 Pixi Assets 페이지를 unload한다. 로딩 중인 페이지도 상한에 포함하고, unload 완료 전 다음 페이지를 요청하지 않는다.
- 장비 미리보기는 디코딩 아틀라스 이미지 LRU 2장을 유지하고, 합성 중인 페이지는 축출하지 않는다. dataURL LRU 24개는 그대로 유지한다.
- 1872×1936 RGBA 페이지 기준 약 13.83 MiB, 최대 6페이지 약 82.97 MiB로 산정했다. 실제 모바일 FPS·GPU 메모리는 측정하지 않았다.
- 검증: TypeScript `--noEmit`, 관련 Node 테스트 **70건**, `node scripts/verify-item-art.mjs`, `git diff --check` 통과.

## 2026-11-19 — 코스튬 아틀라스 v3 (작업 143)

- 덕진 님 폰 실기에서 잡힌 v2 버그 3건을 근본 수정하고 `COSTUME_ASSET_VERSION = 3`으로 배포 경로를 올렸다. `/assets/costume/v3/`에 아틀라스 **70장**(23MB, 1872×1936 = 셀 `234×242` 8×8)과 매니페스트 55종을 커밋하고, 참조 0을 확인한 `public/assets/costume/v2/`(60장·39MB)를 삭제했다.
- **갑옷 + 본체 겹침**: `src/game/render/costumeHero.ts` `planHeroCostume()`이 갑옷 착용 시 본체 파츠(`torso`·`arms`·`legs`)를 **전부** 뺀다. v2는 `torso`만 빼서 공격 프레임에서 맨몸 팔·다리가 갑옷 밖으로 나왔다.
- **투구**: 생성기가 얼굴 상관으로 찾은 머리 창 안에서만 차이를 떠 몸통·어깨·다리 파편을 없애고, 투구 한 벌 스프라이트를 프레임별 머리 기준점에 `(dx, dy)`로 얹는다. 갑옷을 입지 않은 조합용 `helmet-body-<성별>` 페이지 10장을 추가하고 렌더러가 갑옷 유무로 페이지를 고른다.
- **공격 모션**: `clean_fragments()`가 크롭 경계의 이웃 포즈 조각(잘린 발·칼끝)을 지운다(셀 변환 뒤 한 번 더). `cast`는 공격 포즈만 써서 무기가 중간에 사라지지 않게 했고, `gloves`는 손 주변 상자만 남겨 가죽 갑주가 배에 붙던 문제를 없앴다.
- **검수 도구 신규**: `scripts/costume-contact-sheet.py` — 배포본 아틀라스를 게임과 같은 순서로 합성한 접촉 시트(`--only verify`·`helmets`·`motions`). 남/여 × (맨몸 / 맨몸+낡은 투구 / 갑옷+투구) × (idle / walk / attack)에서 파편·겹침·머리 어긋남 0건을 눈으로 확인했다.
- 검증: `npx tsc --noEmit`, `node scripts/verify-item-art.mjs`, 전체 `npm test` **360건**, `npm run build`, `git diff --check` 통과. 문서: `docs/COSTUME_SYSTEM.md` v1.5(§7.5 신설), `docs/CODE_MAP.md`·`docs/QUICK_PATCH.md`·`AGENTS.md` 경로 갱신.

## 2026-11-18 · 작업 142 코스튬 실물 아틀라스 v2 · 레거시 정리

- 담당자 `songduckjin`의 작업지시에 따라 `[작업 139]`~`[작업 141]`의 코스튬 파이프라인에 **실물 에셋**을 붙였다. `/assets/costume/v2/manifest.json`(55종)과 아틀라스 60장(총 39MB, 1872×1936 = 셀 `234×242` 8×8)을 커밋하고 `COSTUME_ASSET_VERSION = 2`로 올려 v1 SPA fallback HTML 캐시를 우회했다.
- 새 그림을 그리지 않고 `public/assets/`의 기존 2.5D 프리렌더 시트를 재료로 썼다. 생성기 `scripts/build-costume-atlas.py`가 본체 높이 190px·실루엣 중심 x·발끝 피벗으로 시트를 정규화해 맨몸/갑옷/투구 시트가 걷기 프레임에서 10px 이내로 겹치게 만들고, 그 위에 장비 레이어를 원본 그대로 앉혔다. 색 변형은 `appearance.ts` 팔레트 색조를 휘도 램프로 입히되 피부·외곽선·하이라이트는 보존한다.
- 장비 페이지 이름을 `<부위>-<성별>`로 바꿨다(갑옷 레이어가 전신 그림이라 남/여 혼용 불가). `docs/COSTUME_SYSTEM.md` v1.4 §7.2·§7.4에 규격·제작 방식·남은 한계를 남겼다.
- 참조 0을 확인한 구형 걷기 시트 5장과 `icons/nav_status_v2.png`만 삭제했다. `warrior_equipped_*` 8장(폴백 참조)·통합 바디 시트(필드 폴백)·`tools/costume-viewer/`(138 프로토타입)는 근거와 함께 유지 목록으로 보고한다.
- 검증: `npx tsc --noEmit`, `node scripts/verify-item-art.mjs`(아틀라스 검증 추가), 전체 `npm test` 355건, `npm run build`, `git diff --check` 통과.

## 2026-11-18 · fks3997 작업164 월드보스 처치 연출
- 검을 꽂고 무릎꿇어 주저앉는 8프레임/접점보정·먼지/돌을 추가했다. 서버 공유HP 0 때만 한 번, “보스를 처치하였습니다.” 문구 뒤 결과창으로 이어지고 토벌후 재도전은 차단한다.
- 새 팝업 기본 도전탭/내부탭전환 유지. tsc·부분56테스트·아트75/착용50·diff 통과, 실기 미실행. Pages 배포 결과는 PR에 기록한다.

## 2026-11-18 · fks3997 작업163 월드보스 입장 지연
- 저장 확인을 입장연출/에셋 로딩 중에 처리하고 새 전투 DB 쓰기·조회 왕복을 줄였다. 저장 무한대기 방지·취소/재시도 안전성, 기존 도전/보상 계약을 유지했다.
- 최신 main 작업141(장비창 공용 외형·내 정보 통합)을 보존 통합했다. tsc·부분64테스트·diff 통과, Pages 배포 결과는 PR에 기록한다.

## 2026-11-18 · 작업 141 장비창(내 정보) 공용 외형 연동 · 136 UI 레이아웃 통합

- 담당자 `songduckjin`의 작업지시에 따라 `src/ui/equipmentPortrait.ts`를 필드와 같은 공용 계획(`planHeroCostume`, 작업 140)으로 다시 연결했다. 미리보기는 **idle 0프레임**만 그리며, `fit` 좌표 표·`wearableEquipmentImage` 덧그리기·`tightFrame` 픽셀 스캔·`starter` 분기를 제거했다.
- PR #72(`[작업 136]`, Draft)는 직접 병합하지 않고, 그 브랜치를 141에 병합해 UI 레이아웃(`내 정보` 3탭·`statusModal.ts` 삭제·계정 성별 고정·요약+6스탯+장비 10칸+가방)과 `tests/equipment-info.test.mjs`를 통합했다. 최신 `main`의 월드보스 진입 버튼·`worldBoss` 모달과 충돌은 `main` 쪽을 유지하며 해소했다.
- 매니페스트·아틀라스가 없거나 셀이 페이지 밖이면 `warrior_equipped_{starter|t2|t3|t4}_{gender}.png` 전신 초상화로 폴백한다(빈 화면 없음). 매니페스트 실패는 세션 동안 재요청하지 않고, 실패 페이지는 1회만 기록한다. dataURL 캐시는 LRU 24를 유지한다.
- 136의 티어 초상화 6장은 폴백 자산으로 유지하고 142의 참조 0 검사 후 삭제 후보로 넘긴다(`docs/COSTUME_SYSTEM.md` v1.3 §7.3).
- 검증: `npx tsc --noEmit`, 관련 6개 테스트 파일 71건, 전체 `tests/*.test.mjs` 338건, `git diff --check` 통과. `src/game/render/**`·`src/game/store.ts`·`server/**` 무변경 확인.

## 2026-11-18 · fks3997 작업161/162 통합 배포 준비
- 크롬 GPU 미지원 Canvas mesh 경로 복구를 실기 확인했다. 월드보스를 서버 공유HP 1,000만·하루3회·서버전투재현·실순위·참여/순위/막타/공동처치 우편보상으로 활성화했다.
- 다른 작업자 작업140 렌더러 전환을 보존 통합했다. tsc·관련89테스트·Functions컴파일·diff 통과. PR78 핫픽스는 실전 활성화와 묶는 통합 PR로 대체하고, Cloudflare Pages 배포 상태는 해당 PR에 기록한다.

## 2026-11-18 · 작업 139 코스튬 스펙 v1.1 · 런타임 매니페스트·75종 매핑

- 담당자 `songduckjin`의 작업지시에 따라 `src/game/costume/**`(신규, Pixi·DOM 비의존)에 코스튬 런타임 데이터 계층을 구현했다. 매니페스트 타입·스키마 검증·1회 로드 캐시, `items.ts` 고유 장비 이름 **75종** 매핑(55 `costumeId` + 20 명시적 `"none"`), 폴백 4경로(`bodyFallback`+`reason`), 캐시 버스터 URL, 액티브 8종 스킬 템플릿 매핑.
- `docs/COSTUME_SYSTEM.md`를 v1.1로 확정했다 — 파츠 교체 가림·자체 PixiJS 레이어 채택·피벗 `(0,0)`·최대 동작 캔버스 후보(한 손 검 183×213 / 대검 234×242, `estimateCanvas` 계산값)·§3.3 스킬 매핑표·§7.1 런타임 계약. 매니페스트 필드는 §7 7개 그대로다.
- 검증: `npx tsc --noEmit`, `node --test tests/costume-manifest.test.mjs` 14건, `git diff --check` 통과. `render/**`·`appearance.ts`·`store.ts`·`items.ts`·`ui/**`·`server/**`·`public/assets/**` 무변경 확인. 전체 `npm test`·`npm run build`는 실행하지 않았다(공용 계약 무변경).
- PR #76을 `main`에 스쿼시 병합하고 Production `/version.json` 반영을 확인했다. 게임 화면·Save/DB/API는 변하지 않았으며 렌더러 연결은 `[작업 140]`에서 한다.

## 2026-11-18 · 작업 134 필드 통합 바디 및 무기 소켓

- 담당자 `songduckjin`의 작업지시에 따라 남녀 검 없는 서기·걷기 시트 10장으로 갑옷·투구 통합 몸체를 복구하고, 직업·성별·8프레임별 무기 소켓과 공격 시 검 중복 방지, 장착 무기 등급별 검기 색을 적용했다.
- `pnpm exec tsc --noEmit`, 관련 테스트 76개, `node scripts/verify-item-art.mjs`, `git diff --check` 통과. PR #66이 `272c4619924603565a0b765a65ca0026078bb904`로 main에 병합됐다. Cloudflare Pages Production `/version.json`에서 `272c46199246` 확인. 모바일 실기 미확인.

## 2026-11-18 · 작업 133 장비창 완성 착용 이미지
- 사진 속 장비 조합의 남녀 완성 착용 이미지를 제작하고 장비창의 DOM 레이어를 한 장의 렌더링 이미지로 교체했다. 다른 조합은 10개 장비 슬롯의 착용 파츠와 장신구를 몸에 맞춰 그려 메모리에 캐시한다.
- `pnpm exec tsc --noEmit`, `node --test tests/equipped-detail.test.mjs`(8개), `node scripts/verify-item-art.mjs`, `git diff --check` 통과. PR #62가 `84a1dd0cd5917bd396f3d9ee9f68ee4acafe4854`로 main에 병합. Production `/version.json` `84a1dd0cd591`, 남녀 이미지 HTTP 200 확인. 모바일 실기 화면 미확인.

## 2026-11-18 · 작업 132 장비창 착용 미리보기 합성 위치 수정
- 실제 장착한 투구·갑옷·검의 크기와 몸 기준 위치를 조정하고, 장갑·신발의 좌우 아트를 분리해 배치했다. 남녀 공통.
- `pnpm exec tsc --noEmit`, `node --test tests/equipped-detail.test.mjs`(7개), `git diff --check` 통과. PR #60이 `d0389150a528a96a489c50688ebc37750b7468a2`로 main에 병합됐다. Cloudflare Pages Production `/version.json`에서 `d0389150a528` 확인. 모바일 실기 화면 미확인.

## 2026-11-18 · 작업 131 장비창 실제 착용 아이템 미리보기
- 장비창 중앙에 실제 장착한 무기·투구·갑옷·장갑·신발 착용 아트를 표시하고, 기본 본체 성별과 장비 프레임 비율을 유지했다.
- `pnpm exec tsc --noEmit`, `node --test tests/equipped-detail.test.mjs`(7개), `git diff --check` 통과. PR #58이 `39d8cd400cd712e05864f5551891722effa8483c`로 main에 병합됐다. Production `/version.json`은 `39d8cd400cd7`; 착용 아트 5개 파일 모두 HTTP 200 `image/png`.

## 2026-11-18 · 작업 130 전투 추격 중 공격 멈춤 수정
- 자동전투가 기본 공격 사거리 안에서도 추격을 계속해 이동 중 공격 차단에 걸리던 불일치를 수정했다. 적 추격 정지 거리를 89로 조정했으며 드랍 추격과 수동 이동 제약은 유지했다.
- `pnpm exec tsc --noEmit`, 전투·아레나 테스트 9개, `git diff --check` 통과. PR #56이 `90631fcf103c8e93090db63069f354e27923e0eb`로 main에 병합됐다. Pages Preview 배포 성공.

## 2026-11-18 · 작업 129 장착 장비 착용형 아트 제작 · Production 배포
- 검·투구·갑옷·장갑·신발 고유 착용 아트 50프레임을 생성하고, 남녀 idle·이동·공격 중 캐릭터 몸에 부착되도록 렌더링했다. 공백 없는 `낡은가죽두건`도 장비창과 착용 모습에서 정확한 프레임으로 연결된다.
- `pnpm run check`, 258개 테스트, `pnpm run build`, `git diff --check` 통과. PR #54 (`f77b3bc`)를 main 커밋 `efec6056dca698d17988c522830c6a790fb16ee4`로 병합했다. Cloudflare Pages Production의 `/version.json`에서 `efec6056dca6`, 다섯 착용 아트의 HTTP 200 `image/png` 응답을 확인했다.
- Cloudflare Pages Preview는 성공했다. 별도 `Workers Builds: djrpg` 검사는 실패했으나 운영 대상인 Pages Production 배포에는 영향이 없었다. 브라우저·모바일 화면 실기는 미확인이다.

## 2026-11-18 · 작업 128 장착 장비별 캐릭터 외형 적용
- 투구·갑옷·장갑·신발·검의 기존 아이템 아트를 캐릭터 레이어에 연결해 남녀 idle·이동·공격 모션에 유지했다. 별도 이미지 생성은 필요하지 않았다.
- 타입 검사, 256개 테스트, 프로덕션 빌드, `git diff --check` 통과. PR #52를 `a5db0e25387abbb6ef3b94d6c613fa936413d3f7`로 main에 병합했다.
- Cloudflare Pages Production이 `version.json` `a5db0e25387a`와 새 JS 번들을 HTTP 200으로 제공하는 것을 확인했다. 화면 실기 확인은 별도다.

## 2026-11-17 · 작업 62 최신 버전 강제 + 충돌 무한 재로드 차단 배포 결과
- PR #42가 `4491196`으로 main에 병합됐고 Cloudflare Pages Production이 새 `index-Nm1Sohin.js`와 `version.json`(`449119655a16`)을 제공하는 것을 확인했다. `/`와 `/index.html`은 `Cache-Control: no-store, max-age=0`.
- 운영 API 실측: `account`·`market`·`warehouse` 모두 다른 `X-App-Version` 헤더에 `426 VERSION_OUTDATED`(`expected: 449119655a16`), 현재 버전 헤더와 헤더 없는 호출은 `401 INVALID_TOKEN`으로 통과해 인증 단계까지 진행됐다. 브라우저로 `djrpg.pages.dev` 접속 시 로그인 화면까지 정상 부팅(콘솔 오류 없음).

## 2026-11-17 · 작업 61 배포 결과
- PR #40이 `aea1858`로 main에 병합됐다. Cloudflare Pages Production이 새 `index-B134k4CR.js`를 제공하고 새 클라이언트 문구를 포함하는 것을 확인했다.
- 운영 `djrpg.pages.dev`의 `/api/account`·`/api/market`·`/api/warehouse`가 토큰 없이 `401 INVALID_TOKEN`을 반환해 서버 배포와 `session_id` 스키마 마이그레이션이 완료됐음을 확인했다.

## 2026-11-17 · 작업 61 · 단일 기기 로그인 강제 + ITEM/CHARACTER 충돌 자동 복구
- 서버: `djrpg_accounts.session_id` 마이그레이션, `login`/`register`/`guest`마다 새 `sid` 발급→토큰 `{id,sid,exp}`, account·market·warehouse에서 불일치·구 토큰 `401 SESSION_REPLACED`. 편집: `server/database.mjs`, `auth.mjs`, `endpoints/{account,market,warehouse}.mjs`.
- 클라이언트: 401이면 토큰 삭제·저장 정지·안내 후 로그인 복귀, `ITEM_CONFLICT`/`CHARACTER_CONFLICT`이면 최신 세이브 재로드. 편집: `src/game/sync.ts`, `src/main.ts`, `src/ui/login.ts`.
- 테스트: 단일 세션 교체·구 스키마 마이그레이션·충돌 자동 복구·세션 만료 회귀 추가(223건). `npm run check`, `npm test`, `npm run build`, `git diff --check` 통과. 브라우저 실기 미실행.

## 2026-11-17 · 작업 123 · 대검베기 휘두르기 변경
- 대검베기를 단일 흰색 궤적의 `휘두르기`로 변경하고, 2회 타격을 합산 위력 2.15배의 단일 타격으로 정리했다. 발밑 룬을 제거했다.
- `pnpm run check`, 218개 테스트, `pnpm run build`, `git diff --check` 통과. PR #36이 `8811a302a8c91e8ee2e986c3c4c93c40762ffbfa`로 main에 병합됐다. Cloudflare Production에서 HTTP 200과 새 `index-Bm7w5dto.js`, `휘두르기` 문구를 확인했다.

## 2026-11-17 · 작업 123 기본 공격 검기 제거
- `world.action('attack')`의 `slash` 효과는 공격 모션·피드백용으로 유지하고, 렌더러에서 기본 공격 검기 이미지와 발밑 룬만 그리지 않도록 변경했다. 성별·직업별 분기가 없는 공용 효과 경로를 수정했다.
- `pnpm run check`, 213개 테스트, `pnpm run build`, `git diff --check` 통과. 화면 실기는 미확인이다.

## 2026-11-17 · 작업 122 Cloudflare Production 결과
- PR #34 병합 `e82777e8549059ec9d6c4a554b998119b78f354e` 후 `https://djrpg.pages.dev`가 새 `index-DAHH0fS6.js` 번들을 제공하는 것을 확인했다. 화면에서의 겹침 해소는 모바일 실기 미확인이다.

## 2026-11-17 · 작업121~125 통합 배포
- 사용자요청: 캐릭터중복검제거·가방등급순·거래소등록후조회제거/만료범위축소·모바일닫기터치전달방지·캐릭터버튼업적아래통합.
- 최신main e82777e의Cloudflare전환·레벨배지캐릭터진입보존. 타입검사·218개테스트·빌드·diff통과.
- PR통합후Cloudflare Pages운영배포와실제번들확인예정. 폰실기는배포후사용자확인필요.

## 2026-11-17 · PR #31 운영 배포 성공
- 사용자 재시도 요청: PR #31 병합 `6e5b913b7c7d1994662cba3c59eb13eaf7e58bdc`, Vercel Production success 확인.
- 운영 `https://djrpg.vercel.app/`가 새 `index-7bpUNZAJ.js`·`index-CGx-HJ2q.css` 제공 확인. 이전 PR #30 수정과 장비배지 수정 모두 포함.
- 최신캐릭터/공용창고변경보존, 타입검사·209개테스트·빌드통과. 성공기록은추가자동빌드방지를위해로컬보관.
## 2026-11-17 · 작업 122 레벨 배지 캐릭터 선택
- 우측 검 버튼이 편의 메뉴와 겹쳐 이를 제거하고 좌상단 레벨 배지 클릭을 캐릭터 선택으로 연결했다. 계정 정보는 기존 설정 메뉴에서 계속 접근할 수 있다. HUD·UI 연결·스타일만 수정하며 데이터 계약은 변경하지 않는다.
- `pnpm run check`, 213개 테스트, `pnpm run build`, `git diff --check` 통과. 화면 실기 확인은 별도로 진행하지 않았다.

## 2026-11-17 · 작업 121 Cloudflare Production 완료
- 정책 PR #33 병합 `4e4c60878565f4599dbc682c60876f7c520780a5`의 Cloudflare Pages Production 배포 `77e184d4-532e-4999-a74a-6fe886c1366b`가 success였다. Vercel Git 연결은 해제 상태다.

## 2026-11-17 · 작업 121 Cloudflare 단일 배포 정책
- 사용자 요청으로 이중 배포를 중단하고 Cloudflare Pages `djrpg`만 운영 배포 대상으로 정했다. `AGENTS.md`의 배포 보호·인프라 규칙을 갱신한다. 기존 Vercel API·설정 파일은 이번 정책 변경에서 수정하지 않는다.
- 운영 `https://djrpg.pages.dev`에서 임시 신규 계정의 가입·로그인과 저장/불러오기·창고 목록·거래소 목록을 모두 HTTP 200으로 확인했다. 기존 계정 로그인은 서버 불안정 오류가 나며 사용자가 새 계정 사용을 선택했다. Vercel 프로젝트의 GitHub 연결을 해제하고 미연결 상태를 확인해 이후 자동 이중 배포를 중단했다. 프로젝트 자체는 남아 있다.

## 2026-11-17 · 작업 119 Cloudflare Production 결과
- PR #32가 `496819ceb55019470981db31858e993bee76527c`로 `main`에 병합됐고 Cloudflare Pages Production에서 Functions 4개 배포가 성공했다. 운영 API의 메서드 검사 405·존재하지 않는 계정 401, 임시 계정의 가입·로그인·저장·불러오기·창고·거래 조회 200을 확인했다.
- Vercel Production의 동일 병합 배포는 `upgradeToPro=build-rate-limit`으로 실패했다. 기존 계정의 Cloudflare 로그인도 오류가 나 사용자 선택에 따라 새 계정 사용으로 전환한다. Vercel 자동 배포 연결은 남아 있다.

## 2026-11-17 · 작업 119 Cloudflare 연결 확인
- Cloudflare 계정의 기존 `djrpg`는 Pages가 아닌 Worker이며, GitHub `main` 최신 빌드가 pnpm 9의 `packages field missing or empty`로 설치 단계에서 실패했다.
- Pages 전환 브랜치에 `pnpm-workspace.yaml` 루트 패키지 선언을 추가했다. 최신 `main` 통합 후 타입 검사·213개 테스트·프로덕션 빌드 통과; Pages 배포·운영 API 검증은 진행 중이다.
- Cloudflare Pages `djrpg`를 GitHub `main`에 연결하고 `pnpm run build`→`dist`, `NODE_VERSION=24`로 첫 정적 배포에 성공했다. 현재 `main`에는 Pages Functions가 없어 API 전환은 아직 안 됐다. PR #32는 Vercel 빌드 횟수 제한 검사 실패와 병합 불가 상태로 자동 승인 검토에서 병합 거절됐다.
- Pages Preview `task/119-cloudflare-pages`의 빌드·Functions 4개 라우팅 성공. Vercel 운영 DB URL·토큰을 Cloudflare Production/Preview에 암호화 비밀로 등록하고 Preview를 다시 배포했다. `/api/account` GET은 405, 존재하지 않는 계정 로그인은 Turso 조회 후 401 `INVALID_CREDENTIALS` 확인. 실제 계정 로그인·저장·거래·창고와 `main` Functions 배포는 아직 검증하지 않았다.

## 2026-11-17 · 작업 119 Cloudflare Pages 전환 진행
- `origin/main` 5912052에서 작업 브랜치를 시작해 Pages Functions 4개와 공통 API 코어를 연결하고 Vercel 어댑터·설정은 유지했다.
- DB 스키마·JSON·토큰 형식은 유지. 타입 검사·212개 테스트·프로덕션 빌드·Wrangler 번들 통과, 로컬 라우팅 200/405/503 확인.
- 사용자가 무료 플랜을 선택했다. 새 scrypt 비용(2048)은 로컬 Wrangler에서 계산 3~4ms·검증 3~5ms; 기존 계정은 Vercel 서명 로그인으로 1회 검증 후 재해시한다. Vercel 신형 해시 배포와 Cloudflare 계정 연결 전 Production 전환은 보류한다.

## 2026-11-17 · 작업120 배포 재시도
- 최신main5912052의캐릭터선택/공용창고및Cloudflare전환등록보존. 장비배지우상단·미확인장비만집계패치추가.
- 타입검사·209개테스트·빌드·diff통과. PR통합후 Vercel운영상태와번들확인예정.

## 2026-11-17 · PR #24 Preview 검사 제한
- 작업 94 브랜치의 로컬 타입 검사·208개 테스트·프로덕션 빌드·diff 통과. 운영 DB 읽기 전용 사본 검증 완료.
- PR Preview의 Vercel 상태는 `failure` / `upgradeToPro=build-rate-limit`(24시간 재시도 안내). Production 배포와 구분하며, 병합·운영 반영은 별도 확인한다.

## 2026-11-17 · 작업106~118 통합 배포
- 사용자 배포 요청: 보상 완료보너스·8메뉴 정렬·내상태 압축·스킬/스킬북 그림·장착그룹/행압축·장비8글자/가방10열·장착설명잠금·거래소 연결재사용/조회취소 통합.
- 검증 코드 `b661c62`: 타입검사·205개 테스트·프로덕션빌드·diff 통과. 최신 main a87ce48 이후 다른 작업자 변경 없음.
- 기존 계정/아이템/DB·API 형식 유지. PR 통합 후 Vercel Production 상태와 운영 HTML 번들 확인 예정.

## 2026-11-17 · PR #29 운영 배포 성공
- 작업97~105 통합 커밋 `a87ce48fcfff34a6a76b4ede23d27b03f7bab100`, Vercel Production `success` 확인.
- 운영 `https://djrpg.vercel.app/`에서 새 `index-Dv66x0H3.js`·`index-TVsjYXcg.css` 제공 확인. 모아둔 수정 전체 운영 반영.
- 타입 검사·194개 테스트·빌드 통과 코드와 동일. 불필요한 빌드를 줄이기 위해 결과 문서는 로컬 브랜치에 보관.

## 2026-11-17 · 작업 94 운영 DB 백업
- Production Turso 전체 DB 읽기 전용 사본을 Git 제외된 `.backups/`에 생성. 23개 테이블의 원본·사본 행 수, SQLite 무결성·외래 키 확인(계정 3개).
- 사용자가 복원 모의 검사 대신 기존 세이브의 슬롯 1 읽기 확인을 선택. PR #24 병합·Production 배포 후 결과를 별도 기록한다.

## 2026-11-17 · 작업 106 · 협업 승인 자동화 정책
- 사용자 지시로 겹침 작업·핵심 데이터 계약·PR 병합의 사전 승인 대기를 자동 승인으로 변경. 영향 분석·공개 기록·필수 검사·운영 백업 확인은 유지.
- 작업 94 브랜치의 PR #24에 반영 예정. Production 배포 여부는 운영 백업 확인 후 기록.

## 2026-11-17 · 작업 97~105 통합 배포
- 사용자 요청으로 모아둔 장비/가방/거래소/팝업/스킬 표시 수정 통합. 기존 검증 코드 변경 없이 배포.
- 타입 검사·194개 테스트·프로덕션 빌드·diff 통과 버전 `2d897d6`. 원본 아이템/반지 ID·기존 계정 유지, 스킬북 제외 장비40개.
- 원격업로드 1회 후 PR 병합·Vercel Production과 운영 HTML 번들 확인 예정. 브라우저 실기는 미실행.

## 2026-11-17 · 운영 배포 성공
- 사용자 재시도 요청의 PR #28 병합 `84b6570352a48be6fe8426885d91243053f84f46`, Vercel Production `success` 확인.
- `https://djrpg.vercel.app/` HTML이 새 `index-8ETSGQ1o.js`·`index-DIOsXhTy.css`를 제공함을 확인. 작업92~96 운영 반영 완료.
- 게임 코드 추가 변경 없음. 성공 기록은 불필요한 자동 빌드를 줄이기 위해 로컬 문서 브랜치에 보관.

## 2026-11-17 · 작업 96 배포 실패
- 설정·우편·일일/주간 보상·업적 PR #26 병합 완료: `700b8dba3846c301c2ed32e8d4337c0c57932755`. 타입 검사·176개 테스트·빌드 통과.
- Vercel Production `failure` / `upgradeToPro=build-rate-limit`. 운영 HTML은 이전 `index-Dp1RK6nj.js`·`index-Dr2zcSfL.css` 유지, 새 `index-8ETSGQ1o.js` 미반영.
- 작업 93~96 코드는 main에 모두 준비됨. 사용자 재시도 요청으로 이 기록을 PR 반영해 동일 게임 코드의 운영 배포를 재시도함.

## 2026-11-17 · 작업 93~95 통합 배포 시도
- 사용자 배포 요청으로 거래소 30개·한도 안내, 장비창 정렬, 스킬30레벨·책 강화/스킬창 이동·빨간점 통합 반영.
- 검증 버전 `e75ed58`: 타입 검사·165개 테스트·프로덕션 빌드·diff 통과. 코드 변경 없이 업로드·PR 통합/운영 빌드 시도.
- 기존 PR #21 장비·가방 수정 포함. 새 설정·우편함·보상·업적 기능은 기획 단계로 제외. 배포 결과는 PR의 Vercel 상태와 운영 번들로 확인.

## 2026-11-17 · PR #21 운영 배포 실패
- 사용자 배포 요청으로 PR #21 병합 완료: `c6c07296b482666fc8f1396d2e159f1e3c2ee97c`.
- 타입 검사·158개 테스트·빌드 통과 버전이나, Vercel Production도 `failure` / `upgradeToPro=build-rate-limit`으로 배포 차단.
- 운영 HTML은 이전 번들 `index-Dp1RK6nj.js` / `index-Dr2zcSfL.css` 유지. 제한 해제 후 위 검증 버전 재배포 필요.

## 2026-11-17 · 작업 91 · fks3997
- 장착 칸 그림 27→44px, 왼쪽 위 부위·오른쪽 이름, 기존 등급 테두리 유지. 작은 화면은 장비창 스크롤 제공.
- 호버/포커스/터치 상세, 바깥 클릭 종료, 명시적 장착 해제. 가방 가득 참·잠금 보존 회귀 검증.
- 타입 검사·145개 테스트·빌드·diff 검사 통과. 브라우저 실기 미실행, PR 검토 대기.

## 2026-11-17 · 작업 90
- `src/game/world.ts`, `src/game/items.ts`: 층 상승 몹 정리·드랍 보존, 보통 난이도 체력/피해·드랍 곡선 조정.
- `src/game/offline.ts`, `src/ui/modals/offlineModal.ts`: 스킬북·보스 보상 및 아이템 안내 반영.
- `src/game/sync.ts`, 관련 테스트: 진행 중 저장 완료 후 거래 스냅샷·요청, 저장 실패 시 거래 차단 검증.
- 검증: `pnpm run check`, 151개 테스트, `pnpm run build` 통과.

## 2026-11-17 · 작업 89
- `ambientMotion.ts`: 축소된 화면에서 거의 보이지 않던 풀 좌우 흔들림 강도·주기 보정. 320px 화면 메시 풀 끝 왕복 약 1~1.5px→3.7~6px, 뿌리/불 효과 유지.
- `tests/ambient-motion.test.mjs`: 실제 정점의 모바일 화면 변위·큰 변형의 삼각형 뒤집힘 방지 회귀 추가.
- 검증: 타입 검사·143개 테스트·빌드·diff 검사 통과. 브라우저 실기 미실행.

## 2026-11-17 · 작업 88
- `src/main.ts`, `src/ui/boot.ts`, `src/styles/boot.css`: 로그인 후 로딩 오버레이와 초기화 오류·새로고침 표시.
- `src/game/render.ts`, `src/game/wasteland.ts`, `src/game/bootProgress.ts`: 고유 텍스처별 진행률과 배경 로딩 완료 집계.
- `tests/boot-progress.test.mjs`: 중복 로드·완료 수·100% 도달 검증. `pnpm run check`, 141개 테스트, `pnpm run build` 통과.

## 2026-11-17 · 에셋 경량화
- `public/assets/`: 104개 파일 재인코딩(RGBA→256색 팔레트 + 시트 등분 유지 축소)로 71.69MB → 3.80MB(94.7% 절감).
- 미사용 36개 파일 삭제(개별 프레임 walk/attack, `item-locks` v1·v2, `nav_*` v1, `dungeon_tile.jpg`, `fx_dragon_twister.png`).
- `scripts/verify-item-art.mjs`: item-art 시트 규격 2172x724 → 870x290(5칸 유지).
- 검증: `npm test` 139건, `npm run build` 통과. 파일명·확장자·치수 의존 코드 변경 없음.

## 2026-11-17 · 작업 87
- `src/game/wasteland.ts`, `src/game/render.ts`, `src/game/render/field.ts`, `src/game/ambientScene.ts`: 이동에 따른 황야 배경 이동과 모닥불 조명·불티 정렬.
- `tests/wasteland.test.mjs`, `tests/ambient-motion.test.mjs`: 화면 경계·배경 효과 동기화 검증.
- 검증: `pnpm run check`, 139개 테스트, `pnpm run build` 통과. Vercel 배포 `success`로 작업 85 배포 보류도 해소.

## 2026-11-16 · 작업 86
- `src/game/world.ts`: 적/드랍 추적 시작·정지 거리 분리, 목표 전환·층 이동 시 추적 상태 초기화.
- `tests/world-movement.test.mjs`: 가까운 적·짧은 넉백 제자리걸음 방지와 먼 드랍 수집 검사.
- 검증: 최신 main 통합 후 `pnpm run check`, `pnpm test` 138건, `pnpm run build` 통과.

## 2026-11-16 · 작업 85
- 배포 보류: PR #17 병합 후 Vercel 빌드 횟수 제한(24시간 후 재시도). Production에 새 효과 미반영, 제한 해제 후 재배포 필요.
- `wasteland.ts`, `ambientMotion.ts`, `ambientScene.ts`: 원본 배경 픽셀을 재사용하는 국소 풀/불꽃 변형·불티·빛 일렁임, 30Hz 갱신·감소 모션·리사이즈/정리 지원.
- 검증: 고정 영역/뿌리·변위 한계·프레임 독립성·실제 Pixi 레이어/리사이즈/중복 방지/정리 포함 136건, 타입 검사·빌드·diff 검사 통과.
- 작업 75의 카메라·이동 경계 변경 통합, 진행 중 작업 86 파일 수정 없음. 브라우저 실기 미실행.

## 2026-11-16 · 작업 75
- `src/game/arena.ts`, `render.ts`, `render/entities.ts`: 고정 아레나 투영과 캐릭터·룬·비네팅·오라 위치 동기화.
- `src/game/world.ts`: 플레이어·몬스터 경계 제한, 가장자리 스폰 및 넉백 보정.
- `tests/arena.test.mjs`, `world-movement.test.mjs`: 화면 이동·경계·속도 검사.
- 검증: 최신 main 통합 후 `pnpm run check`, `pnpm test` 130건, `pnpm run build` 통과.

## 2026-11-16 · 작업 84
- `hud.css`: 원 크기·큰 원 위치 유지, 인접 원 테두리 간격 17.6~18.5px로 통일해 작은 원을 큰 원에 가깝게 이동.
- `modals.css`: 가방 max-content 행·칸 최소 64px·5px 간격·필터 축소 방지·세로 스크롤/스크롤바 여백 적용.
- 검증: 간격 계산·타입 검사·127개 테스트·빌드·diff 검사 통과. 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 83
- `equipModal.ts`, `modals.css`: 가방 잠긴 장비 우측 상단에 작은 자물쇠 배지, 잠금 해제 시 제거·그리드 배열 유지.
- `hud.css`: 부채꼴 영역 160→180px·작은 스킬 중심 간격 확대, 기본 공격 위치와 좁은 화면 메뉴 분리 유지.
- 검증: 잠금/해제·품목 수 유지 포함 127건, 타입 검사·빌드·diff 검사 통과. 사용자 확인에 따라 몬스터 수정 제외, 작업 75 파일·브라우저 실기 미실행.

## 2026-11-16 · 작업 82
- `hud.css`, UI HUD/interface·skillArtwork·field-skills 에셋: 기본 공격 80px·스킬 50px 부채꼴, 좁은 화면 메뉴 위로 이동, 빈 슬롯·알림·선택 흐름 유지.
- `skillFeedback.ts`: 전투 효과를 읽어 자동/수동 실제 발동만 윤곽·문양 강조, 기본 공격 약한 강조, 재발동 교체·감소 모션 지원. 월드/렌더 수정 없음.
- 검증: 자동/수동·잘못된 재사용·지속효과 중복 방지·빈 슬롯·감소 모션 포함 126건, 타입 검사·빌드·diff 검사 통과. 브라우저 실기 미실행.

## 2026-11-16 · 작업 81
- `hud.css`: 승인된 기존 저울 이미지·42px 크기 유지, 거래소만 불투명 표시와 흐린 그림자 제거. 사용자가 거절한 새 형태는 적용하지 않음.
- 검증: 타입 검사·119개 테스트·빌드·diff 검사 통과. 나머지 메뉴/작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 80
- `src/ui/interface.ts`, `public/assets/icons/nav_*_v2.png`: 승인한 상태/장비/스킬/거래소 4개 아이콘을 128×128·같은 여백으로 적용, 새 경로로 캐시 갱신.
- 검증: 선택 원본과 파일 일치·128×128 RGBA·타입 검사·119개 테스트·빌드·diff 검사 통과. 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 79
- `modals.css`, `item-locks-v3.png`: 소수점 CSS 그림자 제거, 잠긴 상태 연속 금빛 테두리를 이미지에 포함·표면 정리, 설명 아이콘 30→34px·새 캐시 경로 적용.
- 검증: 타입 검사·119개 테스트·빌드·diff 검사 통과. PNG RGBA·투명 이미지 확인, 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 78
- `src/styles/modals.css`: 잠긴 자물쇠 이미지 실루엣에 얇은 금빛 윤곽 적용, 열린 상태·글자·버튼 배경 유지.
- 검증: 타입 검사·119개 테스트·빌드·diff 검사 통과. 진행 중 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 77
- `src/styles/modals.css`: 자물쇠 버튼 기본/잠금 상태 배경·테두리 제거, 기존 터치 영역·키보드 포커스 유지.
- `public/assets/icons/item-locks-v2.png`: 정상 U자 고리를 더 높이 들어 옆으로 돌린 열린 상태로 교체, 새 경로로 캐시 갱신.
- 검증: 타입 검사·기존 119개 테스트·빌드·diff 검사 통과. 진행 중 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 76
- 마지막 금화·어두운 청동 2.5D 잠금/열림 아이콘 적용, 금화 단위·재화 UI 통일, 대검 베기 아래 장착 슬롯순 정렬, 판매 분류/등급 필터·등급색, 매물 검색 필터 단순화·선택 옵션 내림차순 추가.
- 장비 잠금 저장/복원·모든 분해 경로 제외·판매 해제 확인 및 서버 원자적 등록, 설명 내용 너비로 축소, 닫기 누르는 순간 처리·44px 터치 영역.
- 검증: 잠금 복원/분해/취소·승인/중복 등록·필터/정렬/설명 위치/닫기 포함 119건, 타입 검사·빌드·diff 검사 통과. 작업 75 파일 수정·브라우저 실기 미실행.

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

# 2026-11-18 작업 137·138

- 작업 137 문서 PR #73을 `6402d79c3fa014fb419815606fcd022dd1b411a3`로 main에 병합했다. Cloudflare Pages Preview 성공, 별도 Workers 빌드는 기존 `[previews]` 설정 누락으로 실패했다.
- 작업 138을 `task/138-costume-prototype`에 등록하고 독립 뷰어를 시작했다. 도구 비교와 제작량 가정은 `tools/costume-viewer/TOOL_COMPARISON.md`에 기록한다. 화면 실기·모바일 성능은 아직 측정하지 않았다.
- 작업 138 마감: `tools/costume-viewer/`에 본체 파츠 4분할(머리·몸통·양팔·다리)·갑옷/투구 레이어·무기 2종과 **가림 방식(파츠 숨김/교체) 토글**을 구현했다. `model.ts` `partPlan`·`coverModeNote`와 단위 테스트 5건 추가(합계 8건 통과).
- 정량 비교 실측: 번들 증가(esbuild min+gzip) 자체 0B / Spine +57,939B / DragonBones +47,015B, Draw Call 장면 전체 1회/프레임, 데스크톱 1280×960 60.0fps, 모바일 뷰포트 390×844(DPR2) 24.9fps(SwiftShader 소프트웨어 GL), JS 힙 +5.98MB. 측정 환경·절차와 결론은 `tools/costume-viewer/TOOL_COMPARISON.md`.
- 화면 검증: Vite + Chromium(WebGL2)으로 프레임 0~7·자동 재생·무기·좌우 반전·레이어·가림 토글을 확인했고 콘솔·페이지 오류 0건이었다. 미리보기는 `downloads/costume-viewer-preview.png`.
- 검증: 루트·뷰어 `tsc --noEmit`, `node --test tools/costume-viewer/model.test.mjs` 8건, `node scripts/verify-item-art.mjs`, `git diff --check` 통과. PR #74를 Ready로 전환해 `main`에 스쿼시 병합했다(모바일 실기 미측정).

## 2026-11-18 · PR #51 운영배포 대상
- 사용자 요청으로 현재 월드보스 소개·전용 연습전·포효/결과/순위예시 UI와 보상·업적 수령 지연 개선을 운영 반영한다. 실공유HP/실순위/실보상은 미연동 연습전임을 유지한다.
- 최신 main b39d160의 다른 작업자 외형·코스튬 반영분을 보존하고 통합했다. 진행 중 UI 개편은 포함하지 않는다. 성능 개선 등 추가 기능 수정 없음.
- tsc·관련101테스트·장비75/착용50아트검사·운영빌드·diff 통과. Cloudflare Pages djrpg만 사용, 운영 https://djrpg.pages.dev/ .

# 2026-11-18 작업 140

- `src/game/render/costumeHero.ts`(신규)로 필드 캐릭터를 독립형 코스튬 레이어 렌더러에 연결했다. `planCostume()`·`resolveSkillMotion()`을 소비해 본체 3파츠 + 장비 레이어를 계획하고, 갑옷은 몸통 파츠를 교체(§4), 매니페스트 `zOrder`·`anchor`·`fit`을 반영한다. 아틀라스는 `COSTUME_ASSET_VERSION` 경로에서 1회 로드·셀 캐시.
- `render/entities.ts` `drawHero`는 코스튬 모드 → 기존 통합 바디·무기 소켓 폴백 순서로 그린다. 그림자·런지·피격 tint·광폭 오라는 두 경로가 공유하고, 잔상은 코스튬 모드에서 보이는 레이어를 모두 복제한다.
- 모션 계약: `HeroCostumeMotion`(idle1·walk8·attack4·slash4·spin6·smash4·cast3), `heroCostumeMotion()`·`costumeFrameIndex()`·`costumePlaybackRate()`(월드 쿨다운의 역수, 상한 3배)를 `render/heroMotion.ts`에, `costumeBodyPx`·`costumeScale()`을 `render/heroScale.ts`에 두었다. `heroSockets.ts` 소켓 표는 폴백 전용으로 명시.
- 아틀라스 배치 규약을 `docs/COSTUME_SYSTEM.md` v1.2 §7.2로 확정했다 — 셀 234×242, 페이지 2048² 64칸, 변형당 32칸(페이지당 변형 2개, 3번째부터 `-2` 페이지), 프레임 슬롯 표. 142가 이 규약으로 팩킹한다.
- 안전장치: 매니페스트 실패 시 아틀라스 요청 0회, 레이어 경로는 전부 아니면 전무(부분 실루엣·캐릭터 소실 없음), 실패 페이지는 1회 기록 후 재시도 없음.
- 대표 장면 1회: 로컬 Vite + Chromium(SwiftShader 소프트웨어 GL) 412×892 DPR1, 3층 자동사냥. 폴백 남/여는 캐릭터·그림자 정상 표시에 화면 전체 draw call 7~9/프레임(개발 서버가 없는 매니페스트 경로에 SPA fallback HTML을 주므로 콘솔 오류 1건 → `manifest-parse` → 폴백), 코스튬 모드(합성 아틀라스 주입)는 레이어 8개·통합 바디 숨김·draw call 7·콘솔 오류 0건이었다. FPS는 소프트웨어 GL이라 절대값이 의미 없고(5.2~5.4) 폴백/코스튬이 동일했다. 모바일 실기·GPU 메모리는 142에서 잰다.
- 검증: `npx tsc --noEmit`, `node --test tests/costume-field-render.test.mjs`(신규 16건) + `tests/costume-manifest.test.mjs tests/appearance.test.mjs tests/hero-motion.test.mjs tests/hero-art.test.mjs tests/hero-weapon-render.test.mjs`, 전체 `node --test tests/*.test.mjs` 303건, `node scripts/verify-item-art.mjs`, `git diff --check` 통과. `world.ts`·`store.ts`·`server/**`·`src/ui/**` 무변경.
- PR #79(`task/140-costume-field-renderer`).

- 배포 후 실측: 운영 `https://djrpg.pages.dev/version.json` = `3854ab354695`(머지 커밋). 게스트 시작 후 필드 장면에서 콘솔 오류 0건·4xx 0건·캐릭터 정상 표시를 확인했다. 다만 없는 `/assets/costume/v1/manifest.json` 요청이 SPA fallback으로 `200 text/html` + `immutable`을 받아 브라우저에 v1 URL이 캐시되므로, 첫 실물 에셋 배포(142)는 `COSTUME_ASSET_VERSION`을 2로 올려야 한다(문서: `docs/COSTUME_SYSTEM.md` §7.2 주의, `docs/TASK_songduckjin.md` 작업 142 필수 항목).
