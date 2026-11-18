# 작업 138 최소 뷰어

`pnpm exec vite --host 127.0.0.1`을 저장소 루트에서 실행한 뒤 `/tools/costume-viewer/`로 연다. 운영 게임과 분리된 Vite 페이지이며 `src/`, Save, API를 사용하지 않는다.

본체는 몸통(머리 포함), 양팔, 다리의 세 이미지다. 갑옷 1종과 한 손 검/대검 SVG를 각각 재사용한다. 프레임 슬라이더, 걷기 8프레임 재생, 좌우 반전, 발·손 앵커 표시, 본체/장비/보조 레이어 토글을 제공한다. 베기·회전·내려찍기·발동 자세는 자세 및 이펙트 동기화 확인용 초기 템플릿이다.

`pnpm exec tsc --noEmit -p tools/costume-viewer/tsconfig.json`과 `node --test tools/costume-viewer/model.test.mjs`로 정적 모델을 검증한다. 실제 화면·모바일 성능·아트 품질은 별도 실기 확인이 필요하다.

도구 비교와 미확정 항목은 [TOOL_COMPARISON.md](./TOOL_COMPARISON.md)에 기록한다.
