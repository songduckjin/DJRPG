# 작업 227 — 2.5D 캐릭터·장비 시트 알파 복원 (반투명으로 뒤가 비치던 문제)

- 담당: songduckjin · 브랜치 `fix/227-pilot-alpha`
- 증상(사용자 제보): 황야 배경 위에 선 캐릭터가 서 있거나 움직일 때 **몸통 뒤로 바닥 타일이 비쳐** 보였다. 전사·궁수·마법사와 착용 갑옷·로브·투구·무기 파츠 모두.

## 1. 원인

코드(`entities.ts` 등)의 `alpha` 값이 아니라 **시트 PNG 자체의 알파 채널**이었다. AI 프리렌더 시트가 배경을 지울 때 실루엣 전체를 부드럽게 깎아, 몸 안쪽까지 `0 < a < 255`로 남아 있었다.

| 시트 | 수정 전 반투명 비율 | 중앙값 알파 |
|---|---|---|
| `mage_male_idle_v1.png` | 56.4% | 198/255 |
| `mage_male_walk_v1.png` | 54.2% | 194/255 |
| `mage_male_attack_v1.png` | 59.6% | 177/255 |
| `archer_male_idle_v1.png` | 45.1% | 237/255 |
| `mage_female_idle_v1.png` | 42.2% | 244/255 |
| `archer_female_idle_v1.png` | 39.1% | 246/255 |
| `warrior_male_idle_v1.png` | 15.1% | 255/255 |
| `warrior_male_walk_v1.png` | 0.4% | 248/255 |

(반투명 비율 = `alpha > 0` 픽셀 중 `10 < alpha < 245`의 비율)

## 2. 수정 규칙 — `scripts/restore-pilot-alpha.py`

1. 완전 투명 배경(`alpha == 0`)에서 **유클리드 거리 2px 초과**인 내부 픽셀 중 `alpha >= 30`인 픽셀을 `alpha = 255`로 복원한다.
2. 외곽 1~2px 안티엘리어싱은 **그대로 둔다**(계단 현상·검은/흰 테두리 없음). 내부에서도 `alpha < 30`인 먼지·그림자 점은 건드리지 않는다.
3. **RGB는 손대지 않는다** — 시트는 premultiply가 아닌 straight alpha였다. 황야 타일(`wasteland-ground.png`) 위에 게임 배율(본체 = 화면 높이 9.35% → 800px 화면에서 0.222배)로 before/after를 합성해 확인했다(`downloads/djrpg_alpha_fix_compare_v1.png`). `rgb / (alpha/255)`로 밝히는 보정은 오히려 그림이 뜨고 번져서 쓰지 않았다.
4. **이펙트 제외**: `public/assets/fx_*`(블러드 레이지 오라·불꽃·회오리 등)는 대상 폴더가 아니며 알파를 덮지 않았다. `tests/pilot-alpha.test.mjs`가 `fx_rage_glow_v1`·`fx_blood_rage`·`fx_hell_fire`·`fx_rage_flame_v1`에 반투명 번짐이 남아 있는지 검사한다.
5. **저장 형식 유지**: 인덱스(P) PNG는 256색 팔레트로 다시 저장한다. 복원 후 팔레트 항목이 256개를 넘는 시트만 이미지 색을 256색 옥트리로 줄인다(최대 채널 오차 22, 평균 0.1~0.35 — 게임 배율에서 육안 차이 없음). RGBA 시트(전사·마법사 걷기/공격 등 31장)는 RGBA로 저장한다.
   - 파일 총량 **42.2MB → 41.3MB**(RGBA로 다시 저장하면 55MB가 되므로 팔레트를 유지했다).
6. **멱등**: 이미 255인 픽셀은 그대로라 여러 번 돌려도 결과가 같다.

## 3. 대상

`public/assets/pilot-25d/**` 중 알파가 바뀐 **267장** (전체 797장 중 나머지는 이미 불투명).
본체·머리 없음·무기/활/지팡이 지운 판·갑옷(전신·머리 없음·무기 지움)·투구 파츠 정면 13 + 공격 80·궁수/마법사 투구 파츠·대검·활·지팡이 파츠.

## 4. 캐시 무효화 — `src/game/render/pilotAssets.ts`

`/assets/*`는 `public/_headers`가 1년 `immutable`이다. 작업 222까지는 서기(`idle`)에만 `?v=2`를 붙였지만, 이번에는 걷기·공격·파츠까지 전부 다시 구웠으므로 **모든 pilot-25d 경로**에 버전을 붙인다.

- `PILOT_ASSET_VERSION = 3` 하나가 기준. 다음에 같은 파일명으로 다시 구우면 이 값만 올린다.
- `pilotSheet(path)` — URL 하나에 버전을 붙인다(기존 `?v=N`은 교체).
- `pilotSheets(table)` — 경로 표(투구 정면 13 + 공격 80)를 한 번에 버전 처리한다.
- 적용: `render.ts`(`paths.pilot*`·`attackSheets`·`walkSheets`)·`armors.ts`·`weapons.ts`·`bows.ts`·`staffs.ts`·`robes.ts`·`archerArmors.ts`·`helmets.ts`·`mageHelmets.ts`·`archerHelmets.ts`·`ui/equipmentPortrait.ts`.

## 5. 검증

- `npx tsc --noEmit` 통과, `npm run build`(tsc·`verify-item-art`·Vite) 통과.
- `node --test tests/*.test.mjs` — 아래 「전체 테스트」 참고(남은 실패는 변경 전 `main`과 같은 `costume-field-render` 2·`skillbook-server` 1).
- 신규 `tests/pilot-alpha.test.mjs` 31건: 대표 시트 30장의 **내부 반투명 < 1.5%·불투명 중앙값 ≥ 250**, 이펙트 4장 반투명 유지, 부위 파츠(투구·마법사/궁수 투구·활·지팡이·대검 10종) 내부 반투명 < 2%.
- `tests/weapon-render.test.mjs`: pilot-25d URL이 동작과 무관하게 모두 `?v=PILOT_ASSET_VERSION`을 달고, 부팅 프리로드에 버전 없는 pilot 경로가 없음을 검사.
- 배포 후: `version.json` 반영·대표 에셋 `?v=3` HTTP 200·바이트 크기 변화 확인(운영 실측은 WORKLOG 참고).

## 6. 남은 것

- 모바일 실기 화면 확인은 사용자 몫(시트가 황야 위에서 불투명하게 보이는지).
- 남은 반투명(대표 시트 13~32%)은 **외곽 1~2px 안티엘리어싱 + 먼지·그림자 점**이다 — 의도적으로 남긴 부분이며, 게임 배율(0.22배)에서 배경 비침으로 보이지 않는다.
