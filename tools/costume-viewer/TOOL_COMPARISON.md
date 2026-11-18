# 코스튬 도구 비교 (작업 138)

2026-11-18 조사. 현행 `pnpm-lock.yaml`의 PixiJS 해석 버전은 8.23.0이다. `package.json`과 lockfile은 변경하지 않았다.

| 항목 | Spine 공식 PixiJS v8 | DragonBonesJS | 자체 PixiJS 레이어 |
|---|---|---|---|
| PixiJS 8 호환 | 공식 런타임 `@esotericsoftware/spine-pixi-v8`, PixiJS 8.16 이상 요구. 현행 8.23.0은 버전 조건 충족 | 공식 저장소에 Pixi 예제가 있지만 PixiJS 8 호환 증거를 확인하지 못함. 구 `Pixi/4.x` 구현은 `PIXI.ticker.shared` 사용 | 현행 PixiJS 8.23.0의 `Container`·`Sprite`·`Assets`로 별도 뷰어 구성 |
| 본·슬롯·스킨·이벤트 | 런타임에서 공식 지원. Editor와 런타임의 메이저·마이너 버전 일치 필요 | 런타임에 리깅 기능이 있으나 v8 어댑터 검증 필요 | 손 앵커, 레이어 순서, 프레임 및 이벤트를 직접 관리 |
| 제작 시간 | 리깅·에디터 학습 및 에셋 변환 필요. 실제 시간 미측정 | v8 이식 필요성 불명. 실제 시간 미측정 | 이 뷰어에서 3 본체 이미지와 1 갑옷·2 무기를 바로 조립. 실제 제작 시간 미측정 |
| 런타임 크기·성능 | 패키지 미설치, 실측 전 | 패키지 미설치, 실측 전 | 기존 Pixi 의존성 사용. 모바일 실측 전 |
| 라이선스 | Spine Editor 라이선스와 런타임 재배포 조건 확인 필요 | 저장소 MIT | 기존 PixiJS 의존성 범위 |

**현재 선택:** 이 최소 뷰어는 자체 PixiJS 레이어로 진행한다. 기존 의존성만으로 3영역·손 앵커·Z-order를 확인할 수 있고, 아직 Spine Editor/런타임 버전 및 라이선스 보유 여부가 확정되지 않았다. 이는 운영 렌더러의 최종 선택이 아니다. Spine을 도입할 경우 동일 에셋을 공식 런타임으로 구성해 장비 교체 시간, 파일 크기, FPS, 메모리를 비교해야 한다. DragonBones는 PixiJS 8 호환이 증명될 때까지 채택하지 않는다.

## 프레임·앵커 검증 범위

- `model.ts`는 걷기 8포즈의 손 좌표와 발 피벗 `(0,0)`을 정의한다. 한 손 검과 대검은 같은 갑옷 이미지를 사용하고, 대검의 손 위치·회전 및 내려찍기 자세만 바꾼다.
- `estimateCanvas`는 무기 도달 범위를 포함하는 최소 후보 캔버스를 계산한다. 실제 SVG 알파 경계와 모바일 화면에서의 잘림은 시각 확인 전이다.
- 투구·망토·신발을 별도 레이어로 두었다. 망토는 몸통 뒤, 투구는 몸통 앞, 신발은 다리 앞이다. 본체·장비·보조 레이어를 각각 끄고 가림 순서를 확인할 수 있다.
- 베기/회전/내려찍기/발동 자세 4종은 초기 동기화 템플릿이며 실제 스킬 아트 프레임이 아니다. 회전은 본체 360도 회전 없이 이펙트를 표시한다.
- 동일 갑옷 이미지의 한 손 검/대검 공용 사용은 뷰어 모델에서 확인된다. **프레임형 갑옷 아트가 공격 자세까지 재사용되는지는 미검증**이다.

## 제작량 민감도

본체는 무기 2계열 × (대기 1 + 걷기 8 + 기본 공격 4 + 스킬 17) = 60프레임/성별로 추정한다. 갑옷 1종을 두 계열에 완전 재사용하면 30프레임/성별, 계열별 분리하면 60프레임/성별이다. 정지 부착형으로 충분하면 갑옷은 1장/성별이다. 실제 재사용 여부는 갑옷 프레임 원본을 그려 공격 자세에 적용한 후 결정한다.

## v1.1 반영 대기

실제 8프레임 이미지의 발 접지 흔들림, 무기별 갑옷 가림, 스킬 타격 이벤트, Spine 대조 구현, 모바일 FPS·메모리, 에셋 제작 시간을 측정해야 한다. 수치가 없는 상태에서 `docs/COSTUME_SYSTEM.md`의 가설을 확정하지 않는다.

## 근거

- [Spine PixiJS 런타임](https://us.esotericsoftware.com/spine-pixi)
- [Spine Editor 구매 및 라이선스](https://esotericsoftware.com/spine-purchase?lang=en), [Spine Runtimes License](https://en.esotericsoftware.com/spine-runtimes-license)
- [DragonBonesJS 저장소](https://github.com/DragonBones/DragonBonesJS), [구 Pixi 구현](https://github.com/DragonBones/DragonBonesJS/blob/master/Pixi/4.x/src/dragonBones/pixi/PixiFactory.ts)
- [PixiJS Container](https://pixijs.com/8.x/guides/components/scene-objects/container), [Sprite](https://pixijs.com/8.x/guides/components/scene-objects/sprite), [성능 가이드](https://pixijs.com/8.x/guides/concepts/performance-tips)
