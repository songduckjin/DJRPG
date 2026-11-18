# 코스튬 도구 비교 (작업 138)

2026-11-18 측정. 저장소 `pnpm-lock.yaml`이 해석하는 PixiJS는 **8.23.0**이며 `package.json`·lockfile·PixiJS 버전은 이 작업에서 변경하지 않았다. 아래 수치는 **[실측]**과 **[추정]**·**[미측정]**을 구분해 적는다. 실측 환경은 저장소 루트 `vite` 개발 서버 + Chromium 159(Headless, WebGL2/ANGLE **SwiftShader 소프트웨어 렌더러**)이다. 실기 모바일 GPU 수치는 아니다.

## 1. 정량 비교 (Spine / DragonBones / 자체 PixiJS 레이어)

| 항목 | Spine (`@esotericsoftware/spine-pixi-v8` 4.3.13) | DragonBones | 자체 PixiJS 레이어 |
|---|---|---|---|
| PixiJS 8 호환 | **충족** — peerDependency `pixi.js ^8.16.0`, 현행 8.23.0 통과. `@esotericsoftware/spine-canvas` 4.3.13 동반 설치 | **미충족** — npm `dragonbones-pixi` 5.6.0은 `@types/pixi.js ^4.6.2`(PixiJS 4 세대) 의존. PixiJS 8 어댑터 패키지 없음 | 해당 없음(현행 의존성 그대로) |
| npm 배포물 크기(unpacked) | 4.39MB + `spine-core` 6.07MB = **10.46MB** | `dragonbones.js` 5.7.4 **1.00MB**(코어만, Pixi 어댑터 제외) | 패키지 추가 없음 |
| 프로덕션 번들 증가량 (esbuild 0.25, `--minify`, ESM, es2022) | **+201,318 B raw / +57,939 B gzip** (806,426 / 235,189 − 베이스 605,108 / 177,250) | **+222,422 B raw / +47,015 B gzip** — 단 PixiJS 8 렌더러가 없어 이 값은 어댑터를 직접 작성하기 전의 하한 | **+0 B** (PixiJS는 이미 게임 번들에 포함) + 뷰어 자체 코드 6,779 B raw / 3,221 B gzip + SVG 3,360 B |
| 라이선스 | Spine Runtimes License(`LicenseRef-LICENSE`). Editor 라이선스 필요 — Essential 정가 $99(프로모 $69) / Professional $449($379), 연매출 $500,000 이상은 Enterprise 필수 | MIT | 기존 PixiJS 의존성 범위 |
| 캐릭터 1기당 Draw Call | 아틀라스 1페이지 기준 1~2 **[추정]** — Spine 아틀라스는 페이지 단위로 배치된다. 대조 구현 미측정 | 아틀라스 1페이지 기준 1~2 **[추정]**, 어댑터 미구현 | **1회/프레임 [실측]** — 장면 전체 `drawElements` 계수, 3초 180프레임 = 180회(스프라이트 10개, 아틀라스 미적용) |
| 데스크톱 FPS (1280×960) | 미측정 | 미측정 | **60.0fps [실측]** 평균 16.67ms · p95 16.7ms · 최악 16.8ms |
| 모바일 뷰포트 FPS (390×844, DPR 2, 캔버스 704×840) | 미측정 | 미측정 | **24.9fps [실측, 소프트웨어 GL]** 평균 40.1ms · p95 50.1ms · 최악 50.1ms — SwiftShader CPU 래스터 결과라 실기 GPU 판정에 쓰지 않는다 |
| 런타임 메모리(JS 힙) | 미측정 | 미측정 | **+5.98MB [실측]** `about:blank` 1.11MB → 뷰어 7.09MB(CDP `Runtime.getHeapUsage`), 텍스처 10장(SVG→캔버스, 장당 100×136 이하) |
| 제작 도구 | Spine Editor(리깅·스킨·이벤트) 필요, 에셋은 Spine 내보내기 산출물 | DragonBones Pro/에디터 + PixiJS 8 어댑터 직접 구현 | 없음 — 코드와 프레임 시트로 조립 |

**측정 절차(재현용):** ① 번들은 `/workspace` 밖 임시 디렉터리에서 `npm i pixi.js@8.23.0 @esotericsoftware/spine-pixi-v8@4.3.13 dragonbones.js@5.7.4` 후 같은 엔트리(Application + Sprite + 라이브러리 import)를 esbuild로 묶어 `gzip -9`로 측정했다. ② 뷰어는 `vite`로 띄우고 Chromium에서 `WebGL2RenderingContext.prototype.draw*`를 계수, `requestAnimationFrame` 간격으로 FPS를 계산했다. ③ 힙은 CDP `Runtime.getHeapUsage`로 `about:blank`와 뷰어 로드 후를 비교했다. ④ 로컬 루프백 주소는 `browser_*` 도구 정책상 열 수 없어 같은 Chromium 엔진을 Playwright로 직접 구동했다.

## 2. 가림 방식 검증 — 파츠 숨김 vs 파츠 교체

뷰어는 본체를 **머리 / 몸통 / 양팔 / 다리** 파츠로 나누고 `model.ts`의 `partPlan(gear, mode)`가 표시 표를 만든다. 화면 상단 `가림 방식` 선택으로 두 방식을 즉시 바꿔 볼 수 있다.

| 구분 | 파츠 숨김(`hide`) | 파츠 교체(`replace`) |
|---|---|---|
| 투구 착용 | 머리 파츠 `visible=false` + 투구 레이어 덧그림 | 머리 파츠 텍스처를 `head_helmed`로 교체(별도 레이어 없음) |
| 갑옷 착용 | 몸통 파츠 `visible=false` + 갑옷 레이어 덧그림 | 몸통 파츠 텍스처를 `torso_armored`로 교체 |
| 화면 결과 | **몸통이 사라지고 갑옷 판만 남아 어깨·옆구리에 틈이 생긴다.** 숨긴 파츠가 덮던 면적을 덧그리는 파츠가 전부 메워야 한다 | 실루엣이 이어지고 틈·겹침이 없다(어깨·목까지 한 파츠) |
| 파츠/레이어 수 | 본체 4 + 장비 2 = 최대 6 레이어, Z-order 규칙 필요 | 본체 4(변형 텍스처), 레이어 추가 없음 |
| 프레임 제작량 | 장비 파츠를 프레임별로 제작(갑옷·투구 × 동작 프레임) | 입은 상태 본체 파츠를 프레임별로 제작(갑옷·투구 조합 수만큼) |
| 현재 게임과의 관계 | [작업 134]에서 걷어낸 2D 덧그리기와 같은 계열 | [작업 134]·[작업 135]의 통합 바디 시트와 같은 계열 |

- 실측 증거: `downloads/costume-viewer-cover-hide.png`(숨김 — 몸통 소실로 틈 발생), `downloads/costume-viewer-cover-replace.png`(교체 — 실루엣 유지), `downloads/cv-compare-strip.png`(맨몸·투구 숨김·투구 교체·둘 다 숨김·둘 다 교체 5단 비교), `downloads/cv-st-*.png`(상태별 원본 컷).
- 두 모드 모두 파츠 수·Z-order·틈 위험이 다르고, **숨김 모드는 '머리 포함 몸통' 통짜 파츠로는 성립하지 않는다**(투구를 위해 몸통째로 숨겨야 한다). `docs/COSTUME_SYSTEM.md` §4의 3영역 분리는 교체 방식과만 맞는다.
- 결론: **파츠 교체(통합 파츠 변형) 방식을 채택**한다. [작업 134]의 통합 바디 시트 계약과 같고, 틈·Z-order 위험이 없으며, 변형 텍스처만 늘면 된다.

## 3. 프레임·앵커 검증 범위

- `model.ts`는 걷기 8포즈의 손 좌표와 발 피벗 `(0,0)`을 정의한다. 한 손 검과 대검은 같은 갑옷 이미지를 사용하고, 대검의 손 위치·회전 및 내려찍기 자세만 바꾼다.
- 화면 실측: 프레임 0~7이 모두 렌더되고, 서로 다른 화면은 **5종**이었다. `sin/cos` 기반 4포즈 주기의 반복이라 8프레임 중 고유 포즈는 4개이며, 실제 아트 8프레임은 별도 제작이 필요하다. 자동 재생은 60fps ticker에서 110ms 간격으로 순환한다(프레임 5→7→0 확인).
- `estimateCanvas`는 무기 도달 범위를 포함하는 최소 후보 캔버스를 계산한다 — 한 손 검 183×213px, 대검 234×242px. 실제 SVG 알파 경계와 실기 화면 잘림은 미확인이다.
- 투구·망토·신발을 별도 레이어로 두었다(망토 몸통 뒤, 투구 머리 위, 신발 다리 앞). 본체·장비·보조 레이어를 각각 끄고 가림 순서를 확인할 수 있다(토글 3종 모두 화면이 바뀌는 것 실측).
- 베기/회전/내려찍기/발동 자세 4종은 초기 동기화 템플릿이며 실제 스킬 아트 프레임이 아니다. 회전은 본체 360도 회전 없이 이펙트를 표시한다.
- 동일 갑옷 이미지의 한 손 검/대검 공용 사용은 뷰어 모델에서 확인된다. **프레임형 갑옷 아트가 공격 자세까지 재사용되는지는 미검증**이다.

## 4. 제작량 민감도

본체는 무기 2계열 × (대기 1 + 걷기 8 + 기본 공격 4 + 스킬 17) = 60프레임/성별로 추정한다. 갑옷 1종을 두 계열에 완전 재사용하면 30프레임/성별, 계열별 분리하면 60프레임/성별이다. 파츠 교체 방식에서 갑옷·투구 조합 변형은 조합 수(갑옷 n × 투구 m)만큼 늘어나므로, 코스튬은 **티어·재질 단위로 묶어 변형 수를 제한**한다. 실제 재사용 여부는 갑옷 프레임 원본을 그려 공격 자세에 적용한 후 결정한다.

## 5. 결론(추천안)

**1차 채택: 자체 PixiJS 레이어 + 파츠 교체 방식.** 근거 — ① 추가 번들 0B(현행 의존성 사용)로 Spine 대비 gzip 58KB를 아킨다. ② 장면 전체 Draw Call 1회/프레임, 데스크톱 60fps로 현재 요구(캐릭터 1기 + 몬스터 다수)에 여유가 있다. ③ 파츠 교체는 [작업 134]·[작업 135]의 통합 바디 시트·팔레트 계약과 그대로 이어지고, 숨김 방식에서 확인된 틈·Z-order 위험이 없다. ④ Editor 의존이 없어 프레임 아트 파이프라인을 유지할 수 있다.

**Spine은 보류(재검토 조건부):** 리깅·스킨·이벤트 기능은 목표에 더 맞지만 Editor 라이선스 비용이 들고(Essential 정가 $99), 지금의 프레임 시트 자산을 스켈레탈로 다시 만들어야 한다. 도입을 검토할 때는 이 표의 빈칸(실기 모바일 FPS·Draw Call·메모리)을 같은 장면의 Spine 대조 구현으로 채운 뒤 판단한다.

**DragonBones는 채택하지 않는다:** PixiJS 8 어댑터가 없고(5.6.0은 PixiJS 4 타입 의존), 채택 시 어댑터를 직접 유지해야 한다. 이는 자체 레이어의 비용보다 크다.

## 6. v1.1 반영 대기

실제 8프레임 이미지의 발 접지 흔들림, 무기별 갑옷 가림, 스킬 타격 이벤트, Spine 대조 구현, **실기 모바일 FPS·메모리**, 에셋 제작 시간, 그리고 이번 실측으로 확정된 **가림 방식(파츠 교체)** 과 **머리 분리 필요성**을 `docs/COSTUME_SYSTEM.md` v1.1에 반영한다. 수치가 없는 항목은 가설로 남긴다.

## 근거

- [Spine PixiJS 런타임](https://us.esotericsoftware.com/spine-pixi)
- [Spine Editor 구매 및 라이선스](https://esotericsoftware.com/spine-purchase?lang=en), [Spine Runtimes License](https://en.esotericsoftware.com/spine-runtimes-license)
- [DragonBonesJS 저장소](https://github.com/DragonBones/DragonBonesJS), [구 Pixi 구현](https://github.com/DragonBones/DragonBonesJS/blob/master/Pixi/4.x/src/dragonBones/pixi/PixiFactory.ts), npm `dragonbones-pixi@5.6.0`
- [PixiJS Container](https://pixijs.com/8.x/guides/components/scene-objects/container), [Sprite](https://pixijs.com/8.x/guides/components/scene-objects/sprite), [성능 가이드](https://pixijs.com/8.x/guides/concepts/performance-tips)
