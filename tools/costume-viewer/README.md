# 작업 138 최소 뷰어

`pnpm exec vite --host 127.0.0.1`을 저장소 루트에서 실행한 뒤 `/tools/costume-viewer/`로 연다. 운영 게임과 분리된 Vite 페이지이며 `src/`, Save, API를 사용하지 않는다.

본체는 **머리**, **몸통**, **양팔**, **다리** 파츠이고, 갑옷 1종과 한 손 검/대검 SVG를 각각 재사용한다. 프레임 슬라이더, 걷기 8프레임 재생, 좌우 반전, 발·손 앵커 표시, 본체/장비/보조 레이어 토글을 제공한다. 베기·회전·내려찍기·발동 자세는 자세 및 이펙트 동기화 확인용 초기 템플릿이다.

## 가림 방식 토글

`가림 방식` 선택으로 **파츠 숨김(`hide`)** 과 **파츠 교체(`replace`)** 를 화면에서 바로 비교한다.

- `hide`: 갑옷·투구를 입으면 해당 본체 파츠를 `visible=false`로 끄고 장비 파츠를 별도 레이어로 덧그린다(`model.ts` `partPlan`). 몸통을 숨기면 갑옷 판이 덮지 못한 어깨·옆구리에 틈이 보인다 — 덧그리는 파츠가 숨긴 면적을 전부 메워야 한다는 증거다.
- `replace`: 본체 파츠는 그대로 두고 텍스처만 `head_helmed`·`torso_armored`로 교체한다. 레이어가 늘지 않고 틈이 없다.

두 방식의 화면 차이·정량 수치·도구 비교 결론은 [TOOL_COMPARISON.md](./TOOL_COMPARISON.md)에 기록한다.

## 에셋

`assets/`의 SVG는 프로토타입 전용이다.

| 파일 | 용도 |
|---|---|
| `head.svg` / `head_helmed.svg` | 맨머리 / 투구 쓴 머리(교체 방식) |
| `torso.svg` / `torso_armored.svg` | 맨몸 몸통 / 갑옷 몸통(교체 방식) |
| `helmet.svg` / `armor.svg` | 숨김 방식의 장비 레이어 |
| `arm.svg`, `legs.svg`, `sword.svg`, `greatsword.svg` | 팔·다리·무기 |

세 영역(머리 포함 몸통)만으로는 투구 가림을 숨김 방식으로 처리할 수 없어 머리를 분리했다. 운영 렌더러는 이 분리를 `docs/COSTUME_SYSTEM.md` v1.1에서 확정한다.

## 검증

`pnpm exec tsc --noEmit -p tools/costume-viewer/tsconfig.json`(또는 루트 `tsc --noEmit`)과 `node --test tools/costume-viewer/model.test.mjs`로 정적 모델·가림 규칙을 검증한다. 화면·모바일 성능·아트 품질은 별도 실기 확인이 필요하다. 2026-11-18에는 Vite + Chromium(WebGL2)로 화면·레이어 토글·가림 방식·FPS·Draw Call·힙을 실측했고, 수치는 `TOOL_COMPARISON.md` §1에 있다.
