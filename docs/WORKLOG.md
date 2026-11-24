# DJRPG WORKLOG

> 최근 작업·PR·배포 기록만 둔다(최근 20건). 더 이전 기록은 `docs/archive/2026-11/WORKLOG-history.md`.
> 새 기록은 맨 위에 `## YYYY-MM-DD · <담당> 작업 <번호> — <제목>` 형식으로 추가하고, 오래된 항목은 아카이브로 옮긴다.

## 2026-11-24 · songduckjin 작업 280 — 전사 넉백 경계: 맞은 몹이 아레나 밖으로 밀려나지 않게

- **기준·브랜치**: 최신 `origin/main` `8ccb58d`에서 `fix/warrior-knockback-arena-bounds` — **[PR #354](https://github.com/songduckjin/DJRPG/pull/354)**. **머지·배포 보류**(사용자 지시: 모아서 배포).
- **증상**: 전사로 사냥할 때 맞은 몹이 아레나(`arenaLimits` 120/180) 밖으로 밀려나, 아레나 경계에 막힌 전사가 따라가지도 때리지도 못했다(사용자 제보 "몹이 맵 밖으로 밀려나면서 전사가 경계에 막힘").
- **원인**: `CombatEngine.tickEnemies`가 걸음과 넉백을 합친 자리를 `clampFieldPoint`(필드 스폰 경계 250/400)로만 잘랐다. 블러드 레이지의 40유닛 밀어내기도 같은 경계였다. 재현(수정 전, 10초·전사): 스킬 3종을 굴리면 몹이 u=250(필드 끝)까지 밀려 **600프레임 중 306~425프레임** 동안 전사 사거리(90) 밖이었다.
- **수정**: `src/game/combat/bounds.ts`에 `clampKnockbackPoint(from, to)`를 더했다. ① 아레나 안에 있던 몹: 밀린 자리를 `clampArenaPoint`로 잘라 **경계 위에서 멈춘다**(바깥 성분만 잘리므로 벽을 따라 미끄러진다). ② 아직 아레나 밖(필드 스폰 밴드)에서 걸어 들어오는 중인 몹: **더 바깥으로는 나가지 않고** 안쪽·옆으로 미는 몫만 받는다 — 멀리서 뜬 몹이 걸어 들어오는 동작(작업 230)은 그대로다. `tickEnemies`는 걸어온 자리(`walk`)를 기준으로 이 함수를 적용하고, `action('warcry')`의 밀어내기도 같은 함수를 쓴다. `arenaLimits`·`fieldSpawnLimits` 값, 스폰 위치, 플레이어 경계는 건드리지 않았다.
- **검증**: `npx tsc --noEmit`·`npx vite build` 통과. 신규 `tests/knockback-bounds.test.mjs` **7/7**(경계 클램프 단위 4건 + 전사 스킬·블러드 레이지·필드 진입 통합 3건, 수정 전 코드에서 통합 3건이 실제로 실패함을 확인). 전체 `node --test tests/*.test.mjs` **1,583건 중 1,431 통과·152 실패** — 실패 이름이 `origin/main` 기준선과 **차집합 0**(전부 이 sparse 체크아웃에 `public/assets/**`가 없어서 나는 기존 실패).
- **동작 대조(패리티)**: `tests/progress-parity.test.mjs`에서 값이 바뀐 것은 **60초 필드 사냥 두 판**뿐이다 — 몹이 서는 자리가 달라져 자동 부활 시점이 갈린 결과이고, 두 판 모두 60초 동안 **받은 피해 총량은 609로 같다**. 방치 12시간·던전 1층/5층·던전 정산 시나리오는 값도 던전 다이제스트(`e8530315`·`8735cda8`·`3ad8091c`)도 한 자리 바뀌지 않았다.
  - `field-boss-win`: `health` 113 → **128** (나머지 동일)
  - `field-boss-loss`: `kills` 62 → **61**, `floorKills` 62 → **61**, `gold` 1258 → **1242**, `exp` 1030 → **1020**, `health` 2 → **212**, `bag` 1 → **0**
- **남긴 것**: 보스도 여전히 필드 외곽에서 뜨고 아레나까지 걸어 들어온다(작업 230 계약) — 보스 스폰만 아레나 가장자리로 당기는 것은 이 PR 범위 밖이라 손대지 않았다. 인게임 실기 확인은 사용자 몫.
## 2026-11-24 · songduckjin 작업 280 — 방치 사냥 개선(생존 스탯·사망 손실·층간 형평성) + 「층 선택」 1안

- **기준·브랜치**: 최신 `origin/main` `1327b5e`(PR #349 머지 후)에서 `feat/offline-hunt-survival-rework`. 사양은 시안 `downloads/djrpg_offline_rework/proposal.md` + 대장님·송덕진 님 11/24 최종 확정(부활 5초·1~4층 면제·안 A·보스전/스킬 배율 동기화·UI 1안). **머지·배포 보류** — PR 링크·프리뷰 스크린샷을 송덕진 님 측에 먼저 공유한다.
- **변경**: ① `combat/engine.ts`에 `REVIVE_SECONDS = 5`·`reviveSeconds(층)`(1~4층 0초)·`reviveTimer`·`reviveHero`를 넣어 접속 사냥도 쓰러지면 5초를 기다린다(쓰러진 동안 추격·공격·피격 정지, 생성자는 체력 0 세이브를 만혈로 세운다). `fieldProgress.heroDown`이 패널티·재도전 규칙은 그대로 두고 부활 대기만 세운다. ② `offline.ts`에 `offlineDamagePerSecond`·`offlineHealPerSecond`·`offlineSurviveSeconds`·`offlineSurvivalUptime`·`offlineDeathsPerHour`·`killsPerHourAt`·`bestFarmFloor` 신설, `offlineKillsPerMinute(save, 층)`에 가동률을 곱하고, `offlineBossBattle`에 회피·피흡·회복을 넣었다. 사냥 중 사망은 `reward.fieldDeaths`로 세어 접속과 같은 10골드를 문다. ③ `skills.ts` `SKILL_HIT_POWER` 한 표로 엔진 `action()`·방치 DPS·`skillCastScale`(스킬 추천 순위)을 묶었다 — 11/23 개편 뒤 방치만 파워 스트라이크 ×4로 남아 있던 것을 ×5.5로 맞췄다(전사 표준 20층 DPS 약 +5%). ④ `killReward`에 `depthRewardScale`(15층 기준 1, 20층 2.21 = 몹 HP 비율) 적용 — 처치 수가 15~16층에서 정점이라 깊은 층이 시간당 금화·경험치에서 역전되던 문제(20층이 15층보다 −45%)를 전투·몹 HP 무변경으로 없앴다. ⑤ `floorModal` 1안 — 카드 둘째 줄을 `시간당 N 마리`로(카드 62→52px), `★ 최다`(가장 빠른 층)·`▼N%`(15% 이상 손해, 40%부터 붉게) 배지, 상단 `★ 추천`·초록 한 줄을 시간당 처치 기준으로. `여유/적정/위험`과 구간 머리의 `권장 X ~ Y`는 종전 그대로다.
- **검증**: `npx tsc --noEmit` 통과, `NODE_OPTIONS=--max-old-space-size=2048 npx vite build` 통과(`assets/index-CXowH2jg.js` 870.17kB). 신규 `tests/offline-survival-rework.test.mjs` 8건(부활 상수·생존 스탯 단조성·회복∞·저스펙<표준<풀·보스전 보완·스킬 표 동기화·층 보상 단조·층 선택 값). 갱신: `progress-parity`(필드 60초·방치 12시간 스냅샷 — 의도한 밸런스 변경 사유를 표 위에 적었다), `balance-v2`(20층 마리당 금화 10→23, 40층 64·78층 228, 방치 kpm에 가동률), `world-movement`(5층 부활 대기 5초 — 새 테스트 1건), `floor-power-modal`(카드 계약 1안), `offline`·`offline-climb`·`offline-auto-salvage`(사망 패널티 항), `combat-field-split`(서버 클로저 4,327줄 상한 근거). 전체 `node --test`: **1,590건 중 1,502 통과, 실패 88건은 모두 기준선과 같은 이름**(sparse 체크아웃에 `public/assets/**`가 없어 생기는 기존 실패) — 신규 실패 0.
- **확인 화면**: Cloudflare Pages 프리뷰 `https://650ff552.djrpg.pages.dev` **SUCCESS**(commit `0e57190`). 390×844 실측: 창 358×692 · 카드 20장(52px) · `★ 최다` 16층 하나 · `★ 추천 16층 8,451마리/시간` · `▼17%`~`▼47%` · 가로 넘침 0(내용이 60px 길어 19·20층 줄과 안내 한 줄은 살짝 스크롤). 360×640: 창 328×525 · 가로 넘침 0. 스크린샷 `downloads/djrpg_offline_rework/preview-390x844.png`·`preview-360x640.png`(+측정 `.json`). 프리뷰 게스트는 20층에 아직 못 가므로, 화면 비교는 브라우저 응답의 세이브만 스크립트 안에서 20층으로 바꿔 그렸다(서버 저장 없음, 저장 요청은 성공으로 돌려줌). 검수 뒤 게스트 탈퇴 처리.

## 2026-11-23 · songduckjin 작업 279 — `내 정보`(장비창) topline 제거 1안 (390×844 시안 승인)

- **기준·브랜치**: 최신 `origin/main` `21343ea`(PR #344 머지 후)에서 `feat/equip-remove-topline`. 시안 1안 `downloads/djrpg_equip_topline/after-390.png`(대장님·송덕진 님 양측 최종 승인), 제거 전 `before-390.png`. **머지·배포 보류** — PR 링크·프리뷰 스크린샷을 송덕진 님 측과 대장님께 먼저 공유한다.
- **변경**: ① `renderEquipment()`에서 `.equip-topline`(요약 `LV · 층 · EXP% · 금화` + `⚔ 전투력` 알약) 생성·append를 없애고 `dialog.append(showcase)`로 곧바로 장착 쇼케이스를 붙인다. 쓰지 않게 된 `combatPower`·`goldMarkup`·`expToNext`·`MAX_LEVEL` 호출과 import를 정리했다(같은 값은 메인 HUD가 보여 준다). ② `equip.css`에서 `.equip-topline`·`.equipment-summary`·`.equip-powerpill` 계열 규칙(380px 미디어 규칙 포함) 삭제, `.equipment-showcase` 192 → **208px**(`flex-basis` 포함), `.bag-grid` `repeat(10…)` → **`repeat(8…)`**(공용창고 `.warehouse-grid`와 같은 8열). 반응형은 같은 +16px만큼: `max-width: 380px` 186 → **202px**, `max-height: 720px` 170 → **186px**, `max-height: 620px` 160 → **176px**. 가방 최소 높이 135px은 그대로다.
- **검증**: `tsc --noEmit` 통과, `vite build` 통과, 전체 `node --test tests/*.test.mjs` 결과는 PR 본문 참조. 신규 `tests/equip-topline-removal.test.mjs` 5건(규칙 부재·렌더 첫 요소·208/8열·반응형 3구간·가짜 DOM 실렌더), `tests/equipment-info.test.mjs`·`tests/downgrade-badge-and-journey.test.mjs`의 topline 계약을 1안으로 교체.
- **확인 화면**: Cloudflare Pages 프리뷰 390×844 캡처(장비창을 직접 열어 topline 없음·8열·빈 여백 없음), 경로는 PR 본문.

## 2026-11-23 · songduckjin **백로그 2·3·7번** — 치명타 피해량 추가옵션 · 유니크/전설 상위 노출 · 마법사/궁수 시트 알파 재베이크 (Draft PR)

- **기준·브랜치**: 최신 `origin/main` `ba3f3c2`(2026-11-23 09:46) 에서 `feat/collab-237-crit-rarity-opacity`. 작업 13번(`statBooks.ts`) 병행 작업과 파일·브랜치가 겹치지 않는다. **머지·배포 보류**(사용자 지시: 모아서 배포) — Draft PR로만 올린다.
- **[백로그 2] 치명타 피해량**: `extraOptionKeys` 맨 뒤에 `critDmgPct`를 더해 11종이 됐다(풀 길이 10→11이라 저장된 옵션이 **없던** 옛 장비만 한 번 다시 뽑히고, 저장된 값은 그대로 산다). 이름은 `critPct` `치명타 확률` · `critDmgPct` `치명타 피해량`으로 갈랐다. 배수는 `battle/formulas.ts` `critDamageScale(치명타 피해량%)` = `1.8 + min(15, N)/100` → 최대 **1.95배**, 상한 상수는 `CRIT_DAMAGE_BONUS_CAP = 15`(extraOptions `EXTRA_CRIT_DMG_CAP`·save-guard `EXTRA_CRIT_DMG_CAP` 같은 값). 적용처는 필드 `combat/engine.ts`(치명타 배수)·방치 `offline.ts` DPS·상세 스탯 `statSheet.ts`(치명타 피해 `195%` · `장비 +15% · 상한`)·장비 상세/거래소/창고 옵션 줄(공용 `extraOptionLines`). 전투력 가중치 1.2(확률 2.5보다 낮다). `statNames.crit`과 장비창 머리 칸을 `치명타 확률`로. 서버는 `server/extra-options.mjs` 키 표 + `server/core/commonCodes.seed.mjs` 코드 사전.
- **[백로그 3] 상위 노출**: `src/game/raritySpotlight.ts`(신규, DOM 없음)가 판정(`isSpotlightRarity`)·정렬(`spotlightFirst`, 안정)·꼬리표(`[전설]`/`[유니크]`)·문장·`SPOTLIGHT_BANNER_MS = 3500`을 갖고, 화면은 이 값만 읽는다. ① 주머니 개봉 카드 `.is-spotlight` + `[전설] [NEW]`(한 번에 열기 목록 줄도) ② 방치·던전 보상 목록은 상위 등급을 위로 올리고(나머지는 떨어진 순서, 스탯북 묶음은 아래 그대로) 줄에 빛·꼬리표 ③ 화면 위 3.5초 획득 띠(`src/ui/raritySpotlightBar.ts`, `domainBindings.ts`의 `itemGranted` 한 곳에서 불러 사냥·던전·방치·주머니 어디서 나와도 같은 자리) ④ 가방 `NEW` 핀(창을 열 때 `newItems` → `bagFresh`로 옮겨 이번에 연 가방에서만). 띠는 전설 전광판(`.legend-bar`, 6px) 아래 44px에 앉고 `prefers-reduced-motion`에서 애니메이션을 끈다.
- **[백로그 7] 시트 알파**: `scripts/restore-pilot-alpha.py`의 규칙을 다시 썼다 — 227의 "배경에서 2px 떨어진 내부"는 시트에 뚫린 알파 0 점 때문에 **내부를 한 픽셀도 못 찾아** 아무것도 고치지 못했다(마법사 남자 서기 안쪽 반투명 1,707px). 새 규칙은 ① 몸 = 300px 이상·중앙 알파 ≥200 덩어리(연기·글로우 제외) ② 안쪽에 뚫린 ≤64px² 구멍을 가장 가까운 몸 색으로 메움 ③ 실루엣 안쪽 255, 바깥 1px만 안티앨리어싱 유지. 대상 **48장**(마법사 24 = 기본·`mage_nostaff`·`mage_headless`·`mage_headless/nostaff`, 궁수 24 = 기본·`nobow`·`archer_headless`·`archer_headless/nobow`). 팔레트 PNG 중 25장은 (색, 알파)가 256칸을 넘어 **색 양자화 없이 RGBA로 저장**(팔레트 재양자화로 색이 바뀌는 것보다 파일 몇 KB가 낫다 — 47장 3.93MB → 5.99MB). `PILOT_ASSET_VERSION` 5 → 6.
- **검증**: `tsc --noEmit` 통과, `vite build` 통과, 전체 `node --test tests/*.test.mjs` 결과는 PR 본문 참조. 신규 테스트 `tests/crit-damage-option.test.mjs`(9건) · `tests/rarity-spotlight.test.mjs`(9건), `tests/pilot-alpha.test.mjs`는 48장으로 늘리고 "안쪽 반투명 0~3px"·"큰 빈 곳(활시위 안쪽)은 덮지 않음"을 고정(71건). `?v=5` → `?v=6` 기대값 13개 파일.
- **검수 이미지**: `downloads/djrpg_alpha_before_after_preview.png`(황야 타일 위 게임 배율 before/after) · `downloads/djrpg_alpha_mage_zoom.png` · `downloads/djrpg_alpha_frames_check.png` · `downloads/djrpg_alpha_attack_check.png`(스태프 번개 글로우 그대로).
- **남긴 것**: 필드에서 떨어진 **전설**은 전광판(서버 공지)에 올리지 않았다 — 기존 `announcePouchLegend`가 "보물 주머니에서"라는 문장을 서버에서 만들기 때문이다. 필드 전설도 모두에게 알리려면 서버 액션에 사유를 더하는 별도 작업이 필요하다(이번 PR은 화면 띠까지만).

## 2026-11-21 · Codex 작업 277 — 실제 장착 변화 기반 장비 판정 (390×844 시안 승인)

- 원인: `itemPower`가 캐릭터 성장과 옵션 상한을 보지 않아, 장착해도 오르지 않는 수치를 업그레이드로 표시했다.
- 수정: `equipDelta`가 교체 전후 `totalStats`·실효 추가옵션을 비교한다. 자동 장착·분해 보호·화살표가 같은 점수를 쓰고, 툴팁·팝업에 실제 증감과 상한을 보여 준다. 서버 옵션/저장 계약은 변경하지 않았다.
- 검증: 신규 `upgrade-real-value` 5건이 수정 전 실패함을 확인했다. 수정 뒤 `tsc --noEmit`·장비 관련 7파일 67/67 통과. 최종 전체 테스트는 1,470건 중 1,460 통과·10 실패. 실패는 Windows의 임시 DB 파일 `EBUSY`, CRLF 단언, Windows 경로 단언이며 `origin/main`도 같은 환경에서 1,464건 중 8건 실패했다. 전체 통과로 기록하지 않는다. 사용자에게 장비 3개 각각의 증감 수치를 보여 주는 390×844 시안을 제시했고 “이대로 적용” 승인을 받았다.

## 2026-11-21 · 작업 278 — 전 직업 스킬 범위 전수 점검 (PR 준비)

`skillRange`는 시전 가능 거리이고, 아래 타격 규격은 실제 피해·밀치기 반경이다. `Lv.1/10`은 시전 거리, `R`은 월드 반경, `a`는 중심선 양쪽 각도(rad)다. 바닥 경계는 월드 원/부채꼴을 `.86/.43` 아이소 투영해 표시한다. 투사체는 도착 시 피해 반경을 표시한다. 장식 텍스처의 크기는 판정선과 별개다.

| 직업 | 스킬 ID | 종류 | Lv.1/10 | 판정 규격 | 이펙트 경계·수정 | 일치 |
|---|---|---|---|---|---|---|
| 전사 | slash2 | 부채꼴 | 96/132 | R=거리, a=.9 | 투영 부채꼴선 추가 | 예 |
| 전사 | slam | 부채꼴 | 126/162 | R=거리, a=1.35 | 투영 부채꼴선 추가 | 예 |
| 전사 | warcry | 버프·밀치기 | 120/120 | R=115 | 투기 오라 유지·밀치기 반경 공용화 | 판정선 없음 |
| 전사 | power | 부채꼴 | 100/136 | R=거리, a=.45 | 투영 부채꼴선 추가 | 예 |
| 전사 | destroy | 부채꼴 | 175/238 | R=거리, a=.7 | 투영 부채꼴선 추가 | 예 |
| 전사 | hell | 원형 | 185/221 | R=거리 | 투영 타원선·회오리 반경 공용화 | 예 |
| 전사 | crushing | 단일 | 125/161 | 대상 1명, R=거리 | 10타 타격 위치 유지 | 범위 장판 없음 |
| 전사 | spin | 원형 | 170/206 | R=거리×용 궤도율 | 투영 타원선·용 궤도 공용화 | 예 |
| 궁수 | doubleShot | 투사체 | 265/301 | 착탄 R=40 | 착탄 타원선 추가 | 예 |
| 궁수 | multiShot | 투사체 | 260/296 | 착탄 R=34 | 착탄 타원선 추가 | 예 |
| 궁수 | pierceShot | 투사체 | 305/359 | 착탄 R=52 | 착탄 타원선 추가 | 예 |
| 궁수 | iceArrow | 투사체 | 270/306 | 착탄 R=54 | 착탄 타원선 추가 | 예 |
| 궁수 | hawkEye | 버프 | 200/200 | 피해 범위 없음 | 바람 오라 유지 | 해당 없음 |
| 궁수 | snipe | 투사체 | 340/412 | 착탄 R=38 | 착탄 타원선 추가 | 예 |
| 궁수 | stormVolley | 투사체 | 285/330 | 착탄 R=34 | 착탄 타원선 추가 | 예 |
| 궁수 | arrowRain | 원형 | 295/349 | 낙점 R=92 | 투영 타원선·화살 낙점 반경 공용화 | 예 |
| 마법사 | fireBolt | 투사체 | 260/305 | 착탄 R=36 | 착탄 타원선 추가 | 예 |
| 마법사 | iceBolt | 투사체 | 270/315 | 착탄 R=52 | 착탄 타원선 추가 | 예 |
| 마법사 | chainLightning | 투사체 | 275/329 | 착탄 R=70 | 착탄 타원선 추가 | 예 |
| 마법사 | manaBurst | 원형 | 250/295 | 폭발 R=96 | 투영 타원선·폭발 반경 공용화 | 예 |
| 마법사 | frostNova | 원형 | 150/186 | R=거리 | 투영 타원선·파동 반경 공용화 | 예 |
| 마법사 | arcaneShield | 버프 | 120/120 | 피해 범위 없음 | 보호막 유지 | 해당 없음 |
| 마법사 | meteorStrike | 원형 | 285/348 | 폭발 R=110 | 투영 타원선·폭발 반경 공용화 | 예 |
| 마법사 | arcaneOverlord | 원형 | 210/264 | R=거리 | 투영 타원선·파동 반경 공용화 | 예 |
| 전사 | mastery | 패시브 | — | 공격력 증가 | `totalStats` 반영 확인 | 해당 없음 |
| 전사 | body | 패시브 | — | HP·방어 증가 | `totalStats` 반영 확인 | 해당 없음 |
| 전사 | instinct | 패시브 | — | 치명·공속 증가 | `totalStats` 반영 확인 | 해당 없음 |
| 궁수 | bowMastery | 패시브 | — | 공격력 증가 | `totalStats` 반영 확인 | 해당 없음 |
| 궁수 | swiftStep | 패시브 | — | 공속 증가 | `totalStats` 반영 확인 | 해당 없음 |
| 궁수 | hawkSight | 패시브 | — | 치명 증가 | `totalStats` 반영 확인 | 해당 없음 |
| 마법사 | staffMastery | 패시브 | — | 공격력 증가 | `totalStats` 반영 확인 | 해당 없음 |
| 마법사 | manaCircuit | 패시브 | — | 공속 증가 | `totalStats` 반영 확인 | 해당 없음 |
| 마법사 | arcaneSense | 패시브 | — | 치명 증가 | `totalStats` 반영 확인 | 해당 없음 |

- `SKILL_AREAS`·`PASSIVE_AREAS`가 33종 전부를 열거한다. 엔진과 VFX는 같은 스펙을 읽는다.
- 다수 타격 장식은 최근 160개로 제한하고, `prefers-reduced-motion`에서 장식 입자 수를 줄인다. 판정 효과는 제한 대상이 아니다.
- 공용 경계: `skillAreas.ts`가 던전 리플레이의 순수 전투 의존성으로 들어와 최신 main 기준 서버 클로저가 21파일/4,123줄에서 22파일/4,181줄이 됐다. 필드 전용 모듈은 추가되지 않았다. `combat-field-split` 상한을 22파일/4,300줄로 조정했다.
- 실제 390×844 화면·다수 몹 60fps 측정은 브라우저 실기 요청이 없어 미실행이다.

## 2026-11-22 · songduckjin 작업 276 — Lv.1 기본 SP 3pt · 스킬의 서(영구 SP +1) · 우편 정밀 검증

- **SP**: `skillPoints.ts` `spTotal` = `level × 3 + SP_FIRST_RANK(1)` — Lv.1 3pt, Lv.2 6pt … Lv.30 90pt(총량 91). `freshSave`·`parseSave`·서버 `save-guard`·스킬 창 툴팁(`받은 SP`/`사용`)이 같은 식을 본다.
- **스킬의 서**: `STAT_BOOKS.skill`(`영구 스킬포인트(SP) +1`, 30권) — `STAT_BOOK_ORDER` 4번째라 가방 정렬·묶음(`×N`)·거래소 `statbook` 슬롯·보물 주머니 1% 풀(1/4 균등)·필드/던전 드랍 지점이 기존 규칙 그대로 붙는다. 서버 저장 검증은 `STAT_BOOK_IDS`(4종)와 `spLedger(statBooks)`로 상한을 계산한다.
- **우편 검증**: `tests/mail-reward-flow.test.mjs` — 초기화 보상 우편 표시값, 주머니 30개 = 30칸(=40칸 상한에서 10칸 여유), 가방 가득 시 `BAG_FULL` + 다이아·원장·우편 상태 모두 불변(원자성), `모두 받기`가 자리 없는 우편만 건너뛰고 안내, requestId 멱등(원장·주머니 1회), 수령분만 삭제.
- **고친 불일치**: 폐지된 `books`(스킬북)를 우편·보상 카드가 '영구 스탯북 N권'으로 표시하고, 화면 칸 계산(`mailItems`)에는 넣어 **금화만 주는 우편이 '가방 가득'으로 잠기던** 문제 — 표시·칸 계산에서 빼고 서버 지급분(`UPDATE_NOTICE`)도 0으로 맞췄다.
- **후속(#326)**: 서버 `initialSave`가 `skillPoints: 0`을 박아 **가입·캐릭터 추가·시즌 초기화로 만든 Lv.1 캐릭터가 빈 SP로 시작**하던 문제 — `SP_PER_LEVEL`(3)로 고치고 세 직업·시즌 세이브·`parseSave` 왕복 테스트를 추가(기존 사용자 세이브는 건드리지 않는다).

## 2026-11-22 · songduckjin **새벽 일괄 배포(작업 265~275)** — #304·#305·#306·#307·#308·#309·#310·#311·#312·#313·#314 + 후속 #317

- **절차**: `public/maintenance.json` 점검 ON(PR #315, `02:03` 예상 완료 `02:40`) → 기능 PR 11건 순차 squash 병합 → 전수 검증·운영 스모크 → 점검 OFF(PR #316). 배포 `version.json` **`b64c45430724`**(02:30), 최종 **`16c586d4af59`**(02:43, 후속 #317).
- **병합 순서**: #304 이름판 → #306 슬롯 8칸 → #305 등급 배지 → #307 밸런스 v2 → #308 층 선택 → #309 튜토리얼(base `feat/balance-v2-impl` → `main` 전환 후 병합) → #310 도감 135 → #311 스킬 창 B → #312 빨간 화살표·정렬·여정 → #313 HUD 묶음 → #314 기념 보상.
- **충돌 정리(코드)**: `src/ui/modals/equipModal.ts`(가방 칸 innerHTML = 아이콘+초록+**빨강**+`+N`+등급 배지, 장착 칸 등급 배지 유지, 튜토리얼 대상 강조 유지) · `src/ui/modals/warehouseModal.ts`(다운그레이드 화살표 + 등급 배지) · `src/styles/modals/skill.css`(스킬북 `×N`은 직업 배지가 오른쪽 아래로 비킨 뒤라 **오른쪽 위** 유지) · `src/game/items.ts`(`totalStats` = 밸런스 v2 스탯·쿨감·% 방어 + 기념 버프 한 곳) · `src/ui/hud.ts`(닉네임판 + 버프 알약) · `src/game/power.ts`·`src/game/floorPower.ts`(전투력 식 한 곳 — `floorPower`는 `power.ts`를 재수출).
- **문서 충돌**: `docs/TASK.md`·`docs/WORKLOG.md`는 양쪽 유지(union), 재구성된 `docs/CODE_MAP.md`·`docs/QUICK_PATCH.md`는 main 구조 유지. `[작업 미정]` 행 9개에 **266~274** 번호를 붙였다(265는 #304·#307).
- **검증**: `npx tsc --noEmit` 통과, `vite build` 통과, 전체 `node --test tests/*.test.mjs` **1,464/1,464 통과**(자산 포함 체크아웃 기준 — sparse 체크아웃에서는 `public/assets/**` ENOENT 54건이 기존 실패). 병합 중 고친 테스트 기대값: 기념 버프 밖 시계(Lv1 체력 140·전투력 68), 다운그레이드 화살표·닉네임판 `dataset` 스텁, 서버 클로저 줄 상한 3,600 → **4,000**(파일 20개 상한은 그대로 — 밸런스 v2 `battle/formulas.ts`·`patchBuff.ts`가 엔진의 실제 의존).
- **운영 스모크**: 게스트 로그인 200 → 여정 목록에 기념 우편 `밸런스·UI 개편 감사 보상`(꾸러미 **5개**, 만료 7일) → 진행 저장 200 → 창고 보관/회수 200 → 계정 삭제 200·재접속 401. 게스트는 `journey-read`가 `403 GUEST_READ_ONLY`라 수령 자체는 정식 계정 전용(설계대로) — 가방 반영은 `tests/patch-rewards-and-buff.test.mjs`가 고정.
- **실브라우저**: HUD `🔥 패치 버프 공·방·체 +30% · 26시간 xx분`, 이름판 `전사 │ 모험가`, `⚔ 전투력 150`, 층 선택 아코디언(1~10층·권장 68~308·여유/적정/위험), 우편함 기념 우편, 상세 스탯 11칸(`피해 감소 7.4% · 3층 기준`·`스킬 쿨타임 감소`). 스크린샷 `downloads/djrpg-20261122-open-*.png`·`-mail-patch-reward-*.png`·`-equipment-*.png`·`-floor-accordion-*.png`·`-stats-cdr-dr-*.png`.
- **후속(275)**: #313 `statSheet.ts`가 예고한 밸런스 v2 정합 — 방어력 설명을 `damageReduction`(층별 %)으로, `스킬 쿨타임 감소` 줄 추가(PR #317, 점검 없이 배포).

## 2026-11-21 · songduckjin 작업 265 — 레벨 배지 아래 닉네임을 `🏷️ 다크 이름판`(`전사 │ 모험가` 한 줄)으로 (PR #304)

- **사용자 선택**: 닉네임 시안 2종 중 **옵션 2 `다크 이름판`**(반투명 다크 필 + 금빛 액센트 라인, `downloads/nickname_preview/opt2_nameplate_pill.png`).
- **직업 태그**(`src/ui/hud.ts`): `renderStatus`가 `heroName.dataset.job = jobNames[jobOrDefault(save.job)]`로 `전사`·`궁수`·`마법사`를 넘기고 `aria-label="캐릭터 닉네임 · 전사 모험가"`도 채운다. 태그 문구는 HTML이 아니라 CSS `::before`가 `attr(data-job)`으로 그리므로 닉네임은 계속 `textContent`만 쓴다 — 직업을 바꾸면 다음 렌더에서 태그가 바로 바뀐다.
- **이름판**(`src/styles/hud.css` `.hero-name`): 반투명 다크 필 `#120c12ad`(68%) + `1px solid #d6af7288` + 위쪽 `inset 0 1.5px 0 #f6d28e55`, 닉네임 `700 13px/15.6px` `#fff0d2`, `height: 17.6px`·`max-width: 140px`·`text-overflow: ellipsis` 유지. `::before`는 `7.6px` `#eec57a` 태그 + `height: 10px` 인라인 블록의 `border-right: 1px #d6af7280` 구분선(필 높이에 닿지 않게).
- **자리**: `left: 12px`·`top: 56px` 그대로 — 레벨 배지 원(5~54px) 바깥 아래에서 오른쪽으로만 늘어나고, HP 바(77px)와 **3.4px** 여유, `pointer-events: none`이라 배지 클릭을 막지 않는다.
- **검증**: `npx tsc --noEmit`·`NODE_OPTIONS=--max-old-space-size=1400 npx vite build`(825.93kB) 통과. 신규 `tests/hud-nameplate.test.mjs` **4/4**(직업 태그가 전사→궁수→마법사로 바뀜·알 수 없는 직업은 전사, `data-job`만 사용·특수문자 닉네임 유지, CSS 계약, 배지·HP 바 사이 3px 이상 여유), `tests/floor-return.test.mjs` 가짜 DOM 헬퍼에 `dataset` 추가(실제 span에 늘 있는 속성). 전체 **1,359건 중 1,307 통과** — `origin/main`(636208e) 기준선 1,355건/1,302 통과/실패 53과 비교해 **신규 실패 0**.
- **미리보기**: [PR #304](https://github.com/songduckjin/DJRPG/pull/304) Cloudflare Pages **SUCCESS**, `https://6e10334e.djrpg.pages.dev`(CSS 커밋 `b93900a`의 배포, `version.json` `b93900a642bb`), 배포 CSS `assets/index-Cf956m1E.css`에 새 규칙 실측. 게스트 실화면: 전사 `모험가` 이름판 **73.3×17.6px**(시안과 같은 폭), 새 캐릭터 `궁수`·`어둡의기사단장`으로 갈아타 태그가 `궁수`로 바뀌고 **120.3×17.6px**·잘림 없음. `140px` 상한 때문에 **8자까지 온전, 9자부터 줄임표**(시안 주석의 "10자까지"보다 짧다 — 늘리려면 `max-width`를 165px쯤으로). 스크린샷 `downloads/djrpg_265/hero_nameplate_preview.png`·`hero_nameplate_long_preview.png`.
- **머지·배포 보류**: 사용자 지시(변경사항 모아서 배포).

## 2026-11-21 · songduckjin 캐릭터 슬롯 최대 8칸 — 판매 상한 9 → 8 (`feat/character-slots-max-8`)

- **변경**: 캐릭터 슬롯 구매 상한을 **9칸 → 8칸**. `server/endpoints/shop.mjs` `maxSlots = 8`(catalog `available: Number(wallet.max_slots) < 8`, `buySlot`은 `max_slots >= 8`이면 `409 MAX_SLOTS`), `src/ui/modals/charactersModal.ts`는 `list.maxSlots < 8`일 때만 `＋ 슬롯 추가`를 그린다.
- **기존 계정 호환**: 이미 9칸을 산 계정은 세이브·캐릭터를 건드리지 않는다 — 슬롯 9 캐릭터 선택·삭제가 계속 되도록 `server/endpoints/account.mjs`의 절대 상한 9(`INVALID_SLOT`)는 그대로 두고, **구매만** 막는다. 8칸 계정도 쪽 나눔(`ceil(maxSlots/3)`)은 그대로라 3쪽(3·3·2)으로 보인다.
- **테스트**: `tests/shop.test.mjs`에 슬롯 캡 테스트 추가(3→8 다섯 번 구매, 8칸에서 `available:false`, 9번째 `409 MAX_SLOTS`에 다이아·장부 불변), `tests/characters.test.mjs`(8칸 계정에서 슬롯 8 생성 200·슬롯 9 생성/선택 `403 SLOT_LOCKED`·목록 `maxSlots: 8`), `tests/modal-ui.test.mjs`(7칸 추가 버튼 표시·8·9칸 숨김·마지막 쪽 슬롯 7·8). 상한을 9로 되돌린 코드에서 새 테스트 2건이 실패하는 것을 확인해 회귀를 잡는다.
- **검증**: `npx tsc --noEmit` 통과. `NODE_OPTIONS=--max-old-space-size=1400 node node_modules/vite/bin/vite.js build` 통과(`dist/assets/index-BnzGdKYn.js` 825.83kB — `npx vite build`는 이 컨테이너의 `ulimit -d` 2GB 때문에 semi-space 할당 실패로 죽는다). 새 테스트 3파일 **26/26**(shop 2·characters 6·modal-ui 18), 관련 11파일 **77건 중 75 통과** — 실패 2건은 `public/assets/**`가 없는 sparse 체크아웃의 ENOENT(`diamond-icon`의 `diamond.png`·`shop-diamond-pack`의 WebP)로 이 변경과 무관하다.
- **문서**: `docs/SHOP_ECONOMY.md`(기본 3, 최대 8)·`docs/AUTH_CHARACTER.md`(구매 최대 8, 절대 상한 9 유지) 갱신.
- **PR·프리뷰**: [PR #306](https://github.com/songduckjin/DJRPG/pull/306) (`feat/character-slots-max-8`, base `main` `636208e`) — Cloudflare Pages **SUCCESS**, `mergeStateStatus` CLEAN. 프리뷰 `https://099354a3.djrpg.pages.dev`(브랜치 `feat-character-slots-max-8.djrpg.pages.dev`), `version.json` `2b2cc00a235b`(`builtAt` 2026-11-21T13:37:03Z)·루트 200·`/api/account` 401 JSON, 배포 번들 `assets/index-CDZpJEzp.js`(825,556B)에 `maxSlots<8` 1건·`maxSlots<9` 0건·`character-add-slot` 1건. 게스트 실브라우저: 캐릭터 선택 창 3칸 + `＋ 슬롯 추가 · 다이아 500`(8칸 미만이므로 정상), 상점 패키지 탭 `캐릭터 슬롯 추가` `구매` 활성 — 8칸 상태 화면은 게스트로 만들 수 없어 단위 테스트로만 확인. **머지·배포 보류**(사용자 지시: 묶음 배포).

## 2026-11-21 · songduckjin 작업 미정 — 입문 튜토리얼: 첫 방어구·첫 액티브 스킬 장착 안내 (PR #309, **#307 의존**)

- **요청**: 새 캐릭터가 시작 스킬과 시작 장비를 **직접 장착**하도록 입문 튜토리얼을 넓힌다 — ① 가방의 시작 방어구를 끼면 **가방/장착 버튼과 그 칸을 강조**, ② 습득한 시작 액티브 스킬을 **빈 퀵슬롯(`+`)에 장착**(문구 `스킬 아이콘 또는 빈 슬롯을 눌러 첫 스킬을 장착하세요`, 완료 = `quickSlots`에 스킬 1개 이상), ③ 막지 않는 가벼운 안내(장착되면 자연히 사라지고 절대 소프트락 없음). PR #307(밸런스 v2)이 시작 스킬을 `learned`/`skillLevels`에 넣고 `quickSlots`를 비운 채 시작하며 1~2층 두·세 번째 처치에 투구·갑옷을 확정 드랍하므로 그 위에서 이어받았다.
- **설계**: `src/game/tutorial.ts`(신규)가 단계·문구·강조 대상의 유일한 판정처. 세이브 `tutorial`은 **예전 그대로 0~3**(서버 `server/save-guard.mjs`가 3에서 자름) — 무기까지는 그 값을 따르고, **3 이후의 방어구·스킬 안내는 저장값을 더하지 않고 지금 상태로 계산**한다(장비 칸이 차거나 `quickSlots`에 스킬이 들어오는 순간 완료 → 되돌릴 저장값이 없어 새 세이브 필드·서버 계약 무변경). 입문 구간(`OPENING_LEVEL=10`)을 지난 캐릭터에게는 3단계 이후 안내를 안 띄우고, 습득한 액티브 스킬이 없거나 다른 직업 전용 방어구면 안내하지 않는다(막다른 안내 금지). 문구·조사는 `objectParticle`(`투구를`·`갑옷을`·`투구·갑옷을`·`낡은 견습생의 지팡이를`).
- **화면**: `src/ui/hud.ts`가 안내 띠 문구와 `.tutorial-target`(하단 `내 정보`/`스킬` 버튼·필드의 첫 빈 원)을 그리고, `src/ui/modals/equipModal.ts`가 장비 창의 빈 투구·갑옷 칸과 가방의 그 칸을 강조하며 모달 뒤로 띠가 가려지므로 **가방 머리글 밑에 같은 문장 한 줄**(`.tutorial-note`: `가방에서 투구·갑옷을 골라 [장착]을 누르세요.`)을 남긴다. 강조는 1.6s 숨쉬기 한 벌(`prefers-reduced-motion`에서 정지)이고 입력·전투·저장을 막지 않는다.
- **함께 고침**: 무기 장착 → 3단계 전환을 `advanceTutorialOnEquip`(`src/game/items.ts`) 한 곳으로 모았다. 예전엔 장비창 `[장착]` 경로가 **`낡은 두손검`(전사)일 때만** 넘어가 궁수·마법사는 2단계에 머물렀다 — `equipment.weapon` 기준(직업 공통)으로 고쳤고 토스트도 `{장비명} 장착! 이제 방어구와 첫 스킬을 챙겨 보세요.`로 바뀐 단계를 알린다.
- **문서**: `docs/TUTORIAL.md`(신규 — 단계 표·불변 규칙·테스트) + `AGENTS.md`·`CODE_MAP.md` 도메인 표 1행, `SKILLS_CODEX.md`·`INVENTORY_GEAR.md`에 링크 한 줄.
- **검증**: `npx tsc --noEmit` 통과. `npx vite build` 통과(23.16s) — 이 컨테이너는 RAM 3.6GB(가용 ~2GB)라 **node 24 + `--max-old-space-size=3000/2000`은 V8 OOM**, node 22 + `2200`으로 빌드. 전체 `node --test tests/*.test.mjs`(4분할 병렬) **1,380건 중 1,328 통과·실패 52** = base(`feat/balance-v2-impl` `7f6512b`, 같은 방식 1,369건·1,317·52)와 **실패 이름 집합 차집합 0**(신규 실패 0). 실패 52건은 모두 `public/assets/**`가 없는 체크아웃의 기존 실패. 신규 `tests/tutorial-skill-gear.test.mjs` **11/11**.
- **미리보기·실화면**: [PR #309](https://github.com/songduckjin/DJRPG/pull/309) Cloudflare Pages **SUCCESS**, 프리뷰 `https://3845b670.djrpg.pages.dev`(브랜치 별칭 `feat-tutorial-skill-gear.djrpg.pages.dev`), `version.json` `f4b52a8207f0`(`builtAt` 2026-11-21T14:34:00Z). 게스트 실브라우저 전 단계: 첫 처치 → `낡은 두손검을 장착하세요`(내 정보 버튼만 강조) → [장착] → `낡은 두손검 장착! 이제 방어구와 첫 스킬을 챙겨 보세요.`·스킬 버튼/1번 원 강조 → 2·3번째 처치 확정 드랍(서리의 가죽 두건·조끼) → `투구·갑옷을 장착하세요`·장비 창 빈 두 칸·가방 두 칸 강조·가방 줄 → [자동 장착] → 다시 스킬 안내 → `+` 원에서 이단참 장착 → **띠·강조 전부 사라짐**(`quickSlots`=`[slash2,null,null]`). 스크린샷 `browser/djrpg_tutorial_gear_step_309-2026-11-21-233735.png`(방어구 단계)·`browser/djrpg_tutorial_done_309-2026-11-21-233836.png`(완료).
- **머지·배포 보류**(사용자 묶음 배포 지시). base가 `feat/balance-v2-impl`라 **#307 머지 시 GitHub가 base를 `main`으로 자동 전환**한다. 배포할 때는 `src/game/**`·`src/ui/**`·`src/styles/**`를 건드리므로 `AGENTS.md` 점검 ON → 병합 → 정수 확인 → 점검 OFF 순서 대상이다.
- **관찰(범위 밖)**: 첫 스킬을 끼고 나면 나머지 두 원이 `미습득`으로 비활성으로 바뀐다(습득 스킬이 1개뿐이라 `availableSkills`가 빔) — 기존 동작이고 이번에 바꾸지 않았다.

## 2026-11-21 · songduckjin 작업 미정 — 스킬 창 **B안(2열 타일 + 하단 고정 액션 바)** · PR #311(머지·배포 보류)

- **요청**: 사용자가 스킬 창 시안 두 개 중 **B안 `🔲 2열 타일 그리드 + 하단 고정 액션 바`** 를 골랐다(기준 시안 `downloads/skill_ui_preview/opt2_2col_grid_actionbar.png`). 액티브·패시브 **양쪽**에 적용하고 **머지·배포는 하지 않는다**(변경사항 모아서 배치).
- **창틀**: `.modal-dialog.skills-modal`을 `display:flex; flex-direction:column; overflow:hidden`으로 바꾸고 4단으로 나눴다 — 머리글 / `.skill-top-bar` / `.skill-list`(여기만 `overflow-y:auto`, `flex:1 1 auto`, `min-height:0`) / `.skill-action-bar`(`flex:0 0 auto`, 스크롤 밖). 목록 스크롤 자리는 `ui.skillScroll`에 남겨 타일 선택·정보 토글·강화로 다시 그려도 보던 자리를 지킨다.
- **타일**: 액티브(기본 공격 + 8종)와 패시브 3종이 같은 `.skill-tile-grid`(2열)를 쓴다 — 아이콘·이름·`Lv.N` 배지·상태 칩(`장착중`·`강화!`·`고정`·`미습득`)만. 타일에서 설명·능력치·카드별 강화 버튼을 없앴다(설명은 액션 바 `정보`). 미습득은 `Lv.N` 자리가 `미습득`이라 칩을 겹치지 않는다(같은 말이 두 번 보이던 것 정리). 왼쪽 세로 막대 색이 상태(장착·강화 금빛 / 고정 청회색 / 미습득 회색)를 가리키고, 고른 타일은 금빛 테두리 + `✓`.
- **액션 바**: 고른 타일 하나만 다룬다. 액티브는 `[장착][강화][정보]`(장착 중이면 첫 버튼이 `해제`), 패시브는 `[강화][정보]`, 기본 공격은 `[고정][강화][정보]`가 잠긴다. 같은 폭 `flex:1 1 0`. `정보`가 설명 한 줄 + 능력치 줄(`쿨 16초 · 지속 1.1초 · 범위 193 · 위력 +20%`, 패시브 `영구 적용 · 공격 +19%`) + 보유/필요 권수를 액션 바 안에서 펼치고(`aria-expanded`, `정보 ▴`) 다시 누르면 접는다.
- **강화 한 벌로 통일**: `src/ui/skillBooks.ts`에 `skillUpgradeInfo(ui, id)`(문구·잠금·권수)와 `upgradeSkill(ui, id)`(동기화 가드·최대 체력 보정·`world.onChange`)를 뽑아 `renderSkillUpgrade`와 액션 바가 **같은 판정**을 쓰게 했다. 새 판정을 만들지 않는다.
- **보기 상태**: `Interface.skillSelected`(스킬 ID 또는 기본 공격 `'attack'`)·`skillInfoOpen`·`skillScroll` 추가, `modalDefaults`가 창을 닫을 때 셋 다 초기화. 기본 선택은 장착 중 → 습득 → 기본 공격이고, 탭을 바꿔 고른 타일이 사라지면 그 탭의 같은 규칙으로 옮긴다. `전체/액티브/패시브` 탭과 `추천 자동 장착`·`자동 강화`는 문구·동작 그대로.
- **정리**: 타일이 칩을 갖게 되어 카드마다 붙던 빨간 점(`markSkillUpgrade`·`.skill-upgrade-dot`)과 더 이상 그리지 않는 카드형 규칙(`.skill-status-stack`·`.equipped-skill-group`·`.skill-actions`·`.passive-skill-card` 레이아웃)을 지웠다. 테스트·문서가 이름으로 찾는 `passive-skill-card`·`active-skill-card`는 타일에 남겼다.
- **검증**: `npx tsc --noEmit` 통과, `NODE_OPTIONS=--max-old-space-size=1600 npx vite build` 통과(`assets/index-CBX81_SY.js` 829.57kB). 신규 `tests/skill-modal-ui.test.mjs` **11/11**(칩·선택 규칙·버튼 구성·능력치 줄·4단 배치·정보 토글·액션·초기화·CSS 계약), `skill-ui` 10/10(옛 카드 계약 2건을 B안 계약으로 교체), `skill-auto-loadout` 10/10·`skill-auto-upgrade` 8/8·`skillbook-art` 2/2·`modal-css-split` 4/4 = 관련 **45/45**. 전체 166개 테스트 파일을 파일 단위로 실행해 **실패 21개가 `origin/main`(636208e)과 같은 목록**(이 컨테이너에 없는 `public/assets/**` ENOENT)임을 확인 — 새 실패 0건.
- **프리뷰**: [PR #311](https://github.com/songduckjin/DJRPG/pull/311) `feat/266-skill-modal-b`, Cloudflare Pages **SUCCESS**, `version.json` `45fba9ecb308`(`builtAt` 2026-11-21T15:01:14Z, 코드 커밋 `45fba9e` — 이후 커밋은 문서), 배포 CSS에 `.skill-tile-grid{grid-template-columns:repeat(2,minmax(0,1fr))}`·`.modal-dialog.skills-modal{display:flex;flex-direction:column;overflow:hidden}`·`.skill-action-bar{flex:0 0 auto;…}` 포함. 게스트 실화면: 창 열기·`패시브` 탭 전환·타일 선택(✓·금빛 테두리)·`정보` 펼침(설명·`영구 적용 · 공격 +15%`·`보유 0 / 필요 1권`·`정보 ▴`)·`고정`/`강화` 잠금 확인 — 스크린샷 `browser/skill_b_final_all_tab-2026-11-21-235659.png`·`browser/skill_b_guest_fixed-2026-11-21-235223.png`. 게스트는 스킬을 습득할 수 없어 장착·강화 상태는 같은 CSS로 정적 재현해 확인했다(`browser/skill_b_states_replica2-2026-11-21-235254.png`).
- **머지·배포 보류**: 사용자 지시(변경사항 모아서 배치). 스킬 창은 `src/ui/**`·`src/styles/**`만 건드린다.

## 2026-11-21 · songduckjin 작업 261 **핫픽스** — 궁수 호크아이 빛/바람 오브젝트 잔존 (PR #300)

- **증상(운영)**: #299 일괄 배포 뒤 사용자 신고 "궁수한테 빛이 계속 따라다여" → "호쿠아이도 빛나게 하는건 아니야". 궁수에게 호크아이 바람·빛 오브젝트가 화면에 쌓여 영원히 남았다.
- **원인**: `render/hawkEyeWind.ts`의 `windStates`(`WeakMap<object, WindState>`) 키가 **호출부가 매 프레임 새로 만드는 래퍼** `{ windBack, windFront }`였다 — `entities.ts`가 그렇게 호출하므로 캐시가 항상 miss. 그때마다 `Graphics` 2개와 글로우 `Sprite` 2개를 `rageBack`/`rageFront`에 `addChild`하고 옛 상태는 지우지 않았다. **실측(수정 전 코드, 같은 컨테이너에 600프레임): `windBack` 자식 1,800개(Graphics 600 + Sprite 1,200)·`windFront` 600개.**
- **수정 ①**: 키를 `view.windBack`(`render.ts`가 계속 들고 있는 레이어)으로 바꾸어 `WeakMap<Container, WindState>` — 래퍼가 매 프레임 새로 생겨도 상태 한 벌만 재사용한다(수정 후 600프레임에도 자식 1/1). 호크아이가 꺼지면 같은 `Graphics`를 `clear()`해 잔존이 없다.
- **수정 ②(사용자 지시)**: 몸 빛무리(`windGlows`·`fx_rage_glow_v1.png` 스프라이트·`glowTexture` 인자)를 **완전히 삭제**했다. 호크아이는 **바람 리본 2줄 + 바람 알갱이 7개**만 그린다 — 궁수 몸은 발동 중에도 빛나지 않는다. `entities.ts` 호출부에서 `this.textures.fxRageGlow` 인자를 뺐다(전사 블러드 레이지는 그대로).
- **검증**: `npx tsc --noEmit` 통과. `npx vite build` 통과 — 이 컨테이너는 RAM 2GB(가용 800MB)라 `--max-old-space-size=2400`은 OOM, `1400`으로 빌드(`assets/index-*.js` 825.83kB). `tests/hawk-eye-wind.test.mjs` **10/10**(신규: 같은 컨테이너 600프레임 누적 회귀 — 수정 전 코드에서 실패 확인 / 글라우 스프라이트·`windGlows`·`fxRageGlow` 부재), 관련 렌더 16파일 **248/248**. `public/assets/**`가 없는 sparse 체크아웃 때문에 실패하던 7건은 에셋 폴더(archer_armors·archer_headless·bows·nobow·headless·world-boss)를 sparse에 더해 전부 통과시켰다(코드 문제 아님).
- **배포(점검 정책 준수)**: 점검 ON([PR #301](https://github.com/songduckjin/DJRPG/pull/301) 머지 `9afce3c`, `public/maintenance.json` `active:true`·eta 21:52) → [PR #300](https://github.com/songduckjin/DJRPG/pull/300) 스쿼시 머지 **`b3beabfb8e74`** → 전수 확인 → 점검 OFF([PR #302](https://github.com/songduckjin/DJRPG/pull/302) 머지 `9d0d98c`). 점검 창 21:38:39~21:41:00 KST(약 2분 20초). 운영 `version.json` `b3beabfb8e74`(`builtAt` 2026-11-21T12:39:24Z)·`/` 200·`/maintenance.json`=방금 올린 파일·`/api/account` 405 JSON·게스트 로그인 200→저장 200. 배포 번들 `assets/index-D8S1JyXt.js` **825,556B**(이전 825,978B)에 호크아이 빛무리 데이터(`-.46`·`ry:.54`) **0건**. 실브라우저(게스트): 로그인 화면 → 자동 사냥·드랍·층 진행 정상(`browser/djrpg_hawkeye_hotfix_live_2026-11-21-2026-11-21-214256.png`). 검수 이미지 `downloads/hawkeye_wind_300_before_after.png`(이전 빛무리 / 지금 리본·알갱이만)·`hawkeye_wind_300_frames.png`·`hawkeye_wind_300_full.png`.

## 2026-11-21 · songduckjin 작업 261 — 다이아 표기를 `◆` 글자에서 보석 그림으로 전면 교체 · 우측 상점 버튼을 다이아 상자 그림으로 (PR #288)

- **사용자 지시(18:16 KST)**: "그리고 다이아 아이콘 안바꼇더라" → "그상자로 오른쪽에 떠있는 아이컨더 변경하다" → "다이아 생긴모양이 그냥 도형같아 다이아로 전부 변경".
- **시안 확정**: 보석 아이콘 6종(A 라운드 브릴리언트·B 카이트 컷·C 에메랄드 컷·D 페어 컷·E 헥사곤 브릴리언트·F 브라이트 크리스탈)을 14·18·24·48·96px 및 실제 자리(HUD·상점 카드·상점 버튼·슬롯 버튼·우편 보상)로 그린 비교 이미지 두 장(`downloads/djrpg_diamond_icon_options_{1,2}.png`)으로 보여 드렸고, 사용자가 **💠 2안 — 래디언트 크리스탈 다이아(은빛 테두리 + 푸른 크리스탈)** 를 골랐다(`downloads/diamond_icon_preview/icon_v2_opt2.png`).
- **에셋**: 고른 128×128 투명 PNG(25KB)를 가공 없이 `public/assets/icons/diamond.png`로 넣었다 — 금화(`gold-coin.png`, 18KB)와 같은 18px 크기로 쓴다.
- **아이콘 헬퍼**(`src/ui/currency.ts`): `diamondIconMarkup` = `<img class="currency-icon currency-diamond" src="/assets/icons/diamond.png" alt="다이아">`, `diamondMarkup(amount, { prefix, suffix })`·`diamondNode(amount, prefix, suffix)` — `goldMarkup`/`goldNode`와 같은 `currency-amount` span·천 단위(`ko-KR`)·음수/NaN은 0.
- **교체 6곳**(코드에 `◆` 0, 번들에도 0): 상단 HUD `.diamonds`(`hud.ts`), 상점 잔액 `.shop-balance`·다이아 카드 8칸·패키지 카드(`shopModal.ts`), `＋ 슬롯 추가` 버튼(`charactersModal.ts` — 읽기 이름 `캐릭터 슬롯 추가 · 다이아 500개`), 우편 보상 `diamondNode(mail.diamonds,'다이아 ','개')`(`utilityModal.ts`).
- **우측 상점 버튼**: `interface.ts`가 `textContent='◆'` 대신 `<img src=DIAMOND_PACK_ART>`(상점 대표 그림 `/assets/shop/diamond_pack_v1.webp`)를 넣고, `hud.css` `.utility-nav .shop-entry`는 `padding:0·overflow:hidden·border:1px solid #6aa9ce·box-shadow:0 0 10px #5ebaff66`, `img`는 `width/height:100%·object-fit:cover·border-radius:inherit`. 글자 시절 `font-size:30px`·`text-shadow` 삭제, `.diamonds`는 `.gold`와 같은 `inline-flex`+`gap:4px`, `.currency-diamond`는 `vertical-align: middle`.
- **검증**: `npx tsc --noEmit`·`npx vite build` 통과, 신규 `tests/diamond-icon.test.mjs` **9/9**(아이콘 마크업·PNG 128×128 RGBA·헬퍼·5개 UI 파일에 `◆` 0·HUD·`.shop-entry`·잔액/카드 렌더·CSS), `shop-diamond-pack` 3/3, 관련 묶음(`shop*`·`modal-ui`·`characters`·`floor-return`·`character-switch`·`warehouse-grid`) 55/55.
- **미리보기**: [PR #288](https://github.com/songduckjin/DJRPG/pull/288) — Cloudflare Pages **SUCCESS**, 프리뷰 `96d092ce.djrpg.pages.dev`(브랜치 `feat-261-diamond-icon.djrpg.pages.dev`), `version.json` `aa83a48482bc`, 배포 번들 `assets/index-bBqpXMVL.js`에 `◆` **0건**·`/assets/icons/diamond.png` 1건, 두 에셋 HTTP 200(25,450B PNG·50,280B WebP). 게스트 실화면에서 상단 HUD·상점 잔액/카드·슬롯 추가 버튼·우측 상점 상자 버튼 확인(스크린샷 `downloads/djrpg_261/`). 게스트 우편에는 다이아 보상이 없어 우편 줄은 테스트로만 확인했다.
- **머지·배포 보류**: 사용자 지시 "변경사항 모아서 한 번에 배포" — 다른 기능 PR과 함께 배포한다.

## 2026-11-21 · songduckjin 작업 259 — 게스트 계정 24시간 자동 삭제 · PR #287(머지·배포 보류)

- **요청**: 사용자 "게스트 계정 접속 하루지나면 삭제해줘"(2026-11-21).
- **대상 판정**: `djrpg_accounts.password_hash='guest'` 이고 `updated_at`이 24시간보다 오래된 행. `updated_at`은 `writeSave`·캐릭터 생성/선택 때 서버 시각(`new Date().toISOString()`)으로 갱신되고 클라이언트가 10초마다 바뀐 진행을 저장한다(`src/main.ts` `sync.flushIfDirty`) — 24시간 갱신이 없었다 = 그동안 접속하지 않았다. 게스트는 비밀번호가 없어 다시 로그인할 수 없으므로 버려진 계정은 그대로 쌓이기만 했다.
- **삭제**: 계정 탈퇴와 **같은 한 벌**(`server/account-delete.mjs` `deleteAccountData`)을 계정마다 트랜잭션에서 돌린다 — 계정 종속 표 22종(`djrpg_characters`·`djrpg_warehouse`·`djrpg_journey`·`djrpg_shop_*`…) + `djrpg_market`(`seller`/`buyer`) + `djrpg_market_events` + `djrpg_accounts` 행. 판매 중 매물은 자동 취소되므로 사는 사람이 실패하는 유령 매물이 남지 않는다.
- **새 파일** `server/guest-cleanup.mjs`: `GUEST_TTL_MS`(24시간)·`GUEST_CLEANUP_COOLDOWN_MS`(5분)·`GUEST_TOUCH_INTERVAL_MS`(1시간)·`GUEST_CLEANUP_LIMIT`(5)·`GUEST_ADMIN_CLEANUP_LIMIT`(25). `cleanupExpiredGuests(db, { now, limit, cooldownMs, force })`는 ① 아이솔레이트별 5분 쿨다운(조회 전에 시각을 적어 동시 요청이 같은 정리를 겹쳐 돌지 않게) ② `SELECT id FROM djrpg_accounts WHERE password_hash='guest' AND updated_at < ? ORDER BY updated_at ASC LIMIT ?` ③ 계정마다 `transaction` + `deleteAccountData`, 하나가 실패해도 나머지는 계속(`{"event":"guest_cleanup_error","id":…}` 한 줄, 세이브·토큰 없음) ④ **던지지 않는다** — 정리 실패가 게스트 입장·관리자 조회를 막지 않는다. `touchGuestActivity(db, row)`는 게스트 `load`에서 `updated_at`이 1시간 넘게 낡았을 때만 다시 찍는다(토큰을 24시간 넘게 들고 노는 게스트가 놀던 도중 지워지지 않게, 읽기 경로에 쓰기를 더하지 않게).
- **관리자 화면**: `public/admin.js` `renderStatus`에 `게스트 자동 정리 N건` 카드를 더했다 — 포털을 열 때마다 밀린 게스트가 25건씩 정리되는 것이 화면에 보인다.
- **배선**: `server/endpoints/account.mjs` — `action:'guest'`가 새 게스트를 만들기 **전에** `cleanupExpiredGuests(db, { limit: GUEST_CLEANUP_LIMIT })`(5건 — 입장 지연을 묶는다); 게스트 `load`는 `touchGuestActivity`. `server/endpoints/admin.mjs` — `view=status|accounts` 모두 집계·목록 **전에** `cleanupExpiredGuests(db, { force: true, limit: 25 })`, 응답에 `guestsCleaned`를 더한다(관리자 화면은 모르는 필드를 무시한다). 관리자 포털을 열면 밀린 게스트가 한 번에 25건씩 정리된다.
- **검증**: `npx tsc --noEmit` 통과, `NODE_OPTIONS=--max-old-space-size=2048 npx vite build` 통과(`assets/index-D3elP9-C.js` 815.52kB — 서버 전용 변경이라 번들 동작 변화 없음). 신규 `tests/guest-cleanup.test.mjs` **8/8**(25시간 지난 게스트가 계정 종속 표·매물·전광판·계정 행까지 사라지고 토큰 401 / 23시간·정식 계정 30일은 유지 / `limit` 상한과 다음 정리 / 5분 쿨다운·`force` / 게스트 입장이 밀린 게스트를 정리하고 새 게스트는 정상 / `load`가 1시간 넘게 낡은 활동 시각만 갱신 / 관리자 `status`·`accounts`가 집계 전에 정리 / 정리 조회 실패에도 입장·조회 성공). `tests/admin.test.mjs` **4/4**(집계 전 정리 조회 1건 추가에 맞춰 단언 갱신). 프리뷰 `d5148585.djrpg.pages.dev`(`version.json` `e5a4a29ac894`) 루트·`/admin` 200, 배포된 `admin.js`에 `게스트 자동 정리` 포함 확인. 관련 `account-delete` 8/8·`characters`·`character-switch`·`character-card-actions`·`season-reset`·`warehouse-*`·`market-*`·`journey`·`sync`·`login-maintenance`·`maintenance-policy`·`shop`·`dungeon-*`·`world-boss-*` 포함 **253건 중 250 통과** — 실패 3건은 변경 전 `main`(`origin/main` 워크트리에서 같은 실패 확인)과 같은 기존 건(`dungeon-248` 피해식 40≠76 1건, `public/assets/**` 가 없는 sparse 체크아웃의 ENOENT 2건 — `shop-diamond-pack`·`world-boss-field`)이고 `skillbook-server`의 기존 `hell` 이름 불일치도 그대로다.
- **PR**: [PR #287](https://github.com/songduckjin/DJRPG/pull/287) (`feat/259-guest-cleanup`, Cloudflare Pages SUCCESS·`mergeStateStatus` CLEAN).
- **머지·배포**: **하지 않았다** — 사용자 지시 "이제부터 시키는건 배포하지말고 모으자"(11-21 18:2x KST). `server/endpoints/account.mjs`(게임 API)를 건드리므로 나중에 배포할 때는 `AGENTS.md`대로 **점검 ON → 병합 → 정수 확인 → 점검 OFF** 순서다. 배포 직후에는 관리자 포털(`/api/admin?view=status`)을 몇 번 열어 밀린 게스트(회당 25건)를 비우고 `accounts`·`active24h`가 줄어드는지, 게스트 입장 → 저장 200 스모크로 확인하면 된다.
# DJRPG WORKLOG

> 최근 작업·PR·배포 기록만 둔다(최근 20건). 더 이전 기록은 `docs/archive/2026-11/WORKLOG-history.md`.
> 새 기록은 맨 위에 `## YYYY-MM-DD · <담당> 작업 <번호> — <제목>` 형식으로 추가하고, 오래된 항목은 아카이브로 옮긴다.

## 2026-11-21 · songduckjin 작업 218 — 관리자 운영 포털(읽기 전용) 추가·밝은 화면 재설계 · 운영 배포(`78ed95b4bd41`)

- PR #180을 최신 `main`(`efc6431`)과 병합해 배포했다. 점검 ON `8670808a42bc`(17:19~17:26) → 스쿼시 머지 `78ed95b4bd41` → 점검 OFF `2aaa5cdef13e`.
- 화면: `https://djrpg.pages.dev/admin` (`/admin.html`은 Cloudflare Pages가 `.html`을 떼어 308로 `/admin`으로 보낸다). 로그인은 HTTP Basic(`ADMIN_DASHBOARD_USER`, 기본 `djsong`) + `ADMIN_DASHBOARD_PASSWORD`(Cloudflare Pages Production Secret, 코드·저장소에 없음).
- API: `GET /api/admin?view=status|accounts[&q=&page=]` — 서버 상태(DB 왕복 ms·계정·캐릭터·24시간 접속)·계정 목록(25건/페이지, 비밀번호 해시·세이브 미노출). GET 외 405, 미설정 503, 인증 실패 401, 잘못된 view 400.
- 배포 확인: `version.json`=`78ed95b4bd41`, `/` 200, `/admin` 200, `/api/admin` 인증 200(`database:ok`·계정 89·캐릭터 119), `/api/account` 401 JSON, 게스트 로그인→저장 200, Cloudflare Pages SUCCESS.
- 검증: `npx tsc --noEmit`·`npx vite build` 통과, `tests/admin.test.mjs` 4/4.

## 2026-11-21 · songduckjin 작업 257 — 전 직업 갑옷·로브 **파츠만** 발광(오라 없음)

- **사용자 확정(12:46 KST)**: `✨ 1안 — 분리한 갑옷/로브 파츠만 깔끔하게 발광(오라 없음)`.
- **원인**: [작업 218]의 갑옷 발광은 몸 시트를 **목 밑동 y에서 가로로** 잘라(`neckY`) 발광을 얹었다. 몸 시트에는 얼굴·머리카락·맨팔·맨손·바지·부츠·기본 대검/활이 함께 그려져 있어 ① 견갑 윗부분이 잘리고 ② 맨팔·손·부츠·기본 무기까지 등급색으로 빛났다.
- **마스크 생성**(`scripts/build-armor-glow-masks.py`, 신규): 갑옷·로브 시트에서 **갑옷 픽셀만** 남긴 알파 마스크를 굽는다 — 전사 `armors/`(10티어)·궁수 `archer_armors/`(1~9)·마법사 `robes/`(1~9) + 0번 갑옷이 쓰는 스타터 시트(`archer_*`·`mage_*`). 성별·동작(서기 1·걷기 4·공격 4프레임)마다 한 장 = **180장**.
  - **머리**: 같은 시트의 `headless/` 판(투구용 머리 지운 판)과의 차집합을 **후보 영역**으로만 쓰고, 그 안에서 살색·머리카락색 픽셀만 골라 실루엣을 만든다 — 차집합을 그대로 쓰면 궁수 스케일 셔츠의 어깨까지 지워져 갑옷 상반신이 통째로 발광에서 빠진다. 작은 구멍(눈·수염)만 메운다.
  - **무기**: `noweapon/`(전사)·`nobow/`(궁수)·`mage_nostaff/`(마법사 스타터)와의 차집합. 무기 지운 판이 그림 전체를 다시 칠한 경우(궁수 `nobow/` 17~38% 색 변화)에는 색 차이를 쓰지 않는다 — 쓰면 갑옷 무늬가 점박이로 빠진다. 패왕의 전갑처럼 칼날이 흐릿한 얼룩으로 남는 판은 색 차이(28 이상)까지 함께 지운다.
  - **맨살**: 따뜻한 살구빛 덩어리만(1px 침식으로 가죽·금속의 점박이 반사 제거). 궁수·마법사는 기준 시트에서 맨살인 자리로 색 범위를 넓혀 그늘 진 손까지 잡는다.
  - **다리·부츠**: 갑옷 실루엣 폭이 급히 줄어드는 줄(스커트 → 다리)을 그림에서 찾아 그 아래로 20~24px 페이드. 티어마다 밑단이 달라(가죽 조끼는 엉덩이, 판금은 허벅지) 값은 그림이 정한다.
  - **마법 불꽃**: 로브 시트 손 안의 붉은 불꽃은 옷이 아니라 채도로 뺀다.
- **필드**: `src/game/render/armorGlowMasks.ts`(신규)가 지금 차림의 마스크 시트를 고르고, `render.ts`의 `armorGlowFrame`이 갑옷과 **같은** `sliceArmorSheet`·`armorFrameIndex`로 프레임을 자른다(최근 6장만 캐시). `entities.syncGearGlow`는 파츠와 같은 앵커·위치·배율의 마스크 스프라이트를 `mask` 로 걸고, 마스크 로딩 전에는 이번 프레임 발광을 **숨긴다**(마스크 없이 그리면 예전 문제로 돌아간다). `gearGlowLayersFor('armor')`는 실루엣 밖으로 1.12배 키워 번지는 후광 겹을 빼고 파츠 위 두 겹(진한 색 + 가산 빛)만 쓴다 — 사용자 확정 1안.
- **장착 화면**: `equipmentPortrait.paintPatch`가 등급색으로 칠한 캔버스에 마스크를 `destination-in` 으로 도려내고, 후광(`shadowBlur`)은 `ARMOR_GLOW_AURA` 0.3배로 줄인다. 마스크를 못 받았을 때만 예전 머리 타원을 도려낸다.
- **검증**: `npx tsc --noEmit` 통과, `npx vite build` 통과, 신규 `tests/armor-glow-mask.test.mjs` **8/8**(마스크 180장 존재·원본과 같은 크기·머리/무기/부츠 자리가 비어 있음·겹 구성·차림별 경로 선택), 관련 `tests/{gear-rarity-glow,armor-render,archer-armor-render,mage-robe-render,weapon-render,weaponless-body,character-portrait}` **72/72**. 검수 이미지로 전사·궁수·마법사 남녀 × 티어 0·3·6·9 × 서기/걷기/공격을 눈으로 확인(견갑 포함·얼굴/머리카락/맨팔/무기/부츠 제외).
- **머지·배포**: 보류(사용자 지시). [작업 256] 투구 발광(PR #264)과 같은 마스크 구조(`gearGlowLayersFor`·`GearGlowOptions.mask`·`heroGlowPartMasks`)를 쓰므로 **#264 를 먼저 머지한 뒤 이 PR을 리베이스**하면 된다(갑옷 호출부 한 줄과 `tests/gear-rarity-glow.test.mjs` 의 같은 줄만 충돌).

## 2026-11-21 · songduckjin 작업 256 — 전 직업 투구 발광 범위 조정(파츠만 빛나고 얼굴·머리카락·목·어깨는 원래 색)

- **요청**: 사용자 "딱 투구만 빛나면 좋겠는데 얼굴 머리카락까지 영향이 가더라고" · "파츠만 따로 분리해서 칠하자". 12:41 KST 확정 **1안**(분리한 투구 파츠만 깔끔하게 발광, 오라 번짐 없음) — 검토 시안 `downloads/helmet_glow_preview/v3_opt1.png`.
- **원인**: [작업 218·231]의 등급색 발광은 착용 파츠 스프라이트 **전체**에 겹을 얹었다. 전사·궁수 투구 파츠는 (a) 오픈페이스·두건이 **얼굴·수염·머리카락**까지 담고 (b) 궁수 파츠는 362 셀 전체라 목·어깨·가슴 옷까지 들어 있어, 유니크·전설 투구를 쓰면 머리 전체가 등급색으로 타올랐다.
- **마스크 113장**(`scripts/build-helm-glow-masks.py`): 파츠 PNG와 같은 이름·같은 크기의 RGBA PNG(흰색 + 알파=발광 세기)를 `public/assets/pilot-25d/helmets_glow/**`(정면 13·공격 80)·`archer_helms_glow/*`(20)에 굽는다. 빼는 것 = ① 살색 얼굴·목·어깨(눈·입은 `fill_holes`) ② 얼굴 타원 안의 어두운 픽셀(눈·눈썹·입·그늘) ③ 턱 아래 목·어깨 띠(묶음마다 14~22px 페이드) ④ 머리카락(묶음별 캡슐 구역 ∩ 갈색). 재질이 살색인 청동·금속 투구가 통째로 '피부'로 잡히지 않게 **b/g 비율 0.55~0.92** 로 금색을 걸러 내고, 얼굴 타원(앵커 기준 오프셋)으로 피부 제외 범위를 좁혔다 — 안 그러면 `atk/male_3_*`(청동 기사 투구)의 발광이 0에 가까워졌다.
- **필드**(`src/game/render/entities.ts`): `syncGearGlow(view, key, source, rarity, time, options?: { neckY?, mask? })` 로 인자를 정리(갑옷은 `{ neckY }`·투구는 `{ mask }`). 투구는 `gearGlowLayersFor('helmet')` — **1.12배 후광 겹을 뺀 2겹**(1안). 마스크 스프라이트는 파츠와 같은 앵커·위치·배율·회전으로 놓고(`GameView.heroGlowPartMasks`), 파츠를 고른 `syncHelmet`·`syncArcherHelmet` 이 남긴 `heroHelmetGlowMaskPath` 로 **그 프레임의 파츠와 짝이 맞는 마스크**를 쓴다. `GameView.helmetGlowMask(path)` 가 유니크·전설 투구를 쓴 순간에만 지연 로딩하고, **로딩 전 프레임은 발광을 숨긴다**(마스크 없이 그리면 얼굴이 다시 물든다).
- **장비창**(`src/ui/equipmentPortrait.ts`): 투구 계획에 `glowMask` 를 더하고 `paintPatch(…, mask, aura)` 가 등급색 파츠를 `destination-in` 으로 도려낸다. 투구 후광 배율 `HELMET_GLOW_AURA = 0.35`(갑옷·무기는 종전 1).
- **궁수**: `heroArcherHelm` 이라는 필드는 없고 궁수 투구는 `heroHelmet` 을 그대로 쓴다 — 연결 누락은 없었고, 문제는 파츠 전체가 빛나던 것이었다(이번 마스크로 해결). **마법사는 건드리지 않았다**: `mage_helms` 재베이크·발광 마스크를 다루는 [작업 247 PR #252](https://github.com/songduckjin/DJRPG/pull/252)과 같은 자리라서다. 마스크 인자를 텍스처 하나로 둔 덕에 마법사·**갑옷**도 같은 방식으로 이어 붙일 수 있다.
- **검증**: `npx tsc --noEmit`·`npx vite build` 통과(번들 `index-*.js` 에 `helmets_glow`·`archer_helms_glow`·`helmetGlowMask` 포함), 신규 `tests/gear-glow-mask.test.mjs` **10/10**(113장 존재·파츠와 같은 크기·실루엣 안쪽·투구 면적 5% 이상·얼굴 좌표 불발광·살색 70% 이상 소등·마스크 목록 1:1·투구 2겹(후광 없음)·필드/장비창 배선·세이브별 마스크 경로), `tests/gear-rarity-glow.test.mjs` **11/11**(새 인자에 맞춰 단언 갱신), 전체 `tests/*.test.mjs` **1,068건 중 1,064 통과**(실패 4건은 변경 전과 동일 — `costume-field-render` 2·`skillbook-server` 1 + 이 체크아웃에 `public/assets/world-boss` 가 없어 생기는 `world-boss-field` 1), `node scripts/verify-item-art.mjs` 통과(마스크 113장 규격 검사 추가). 검수 이미지 `downloads/djrpg_helm_glow_only_before_after_v1.png`(투구 12쌍 전/후)·`downloads/djrpg_helm_glow_only_field_v1.png`(필드 42% 배율).
- **작업 번호**: 처음 254로 등록했으나, 같은 시각 다른 세션이 **몬스터 공격 사거리 90 작업**(PR #259·#260)을 254로 올려 **256으로 정정**했다(브랜치 `feat/256-helmet-glow-mask`).
- **머지·배포**: **하지 않았다**(사용자 지시 "모아서 배포" · 이 작업 지시 "머지·배포 보류"). 브라우저 실기 화면은 미확인 — 로컬 루프백 차단으로 합성 검수만 했다.

## 2026-11-21 · songduckjin 작업 254 — 몬스터 공격 사거리 90 통일(전사 평타와 같은 맞사거리)

- **지시**: 인수인계 "몬스터 공격 사거리 90 통일" — 전사 평타 사거리 90과 같은 값으로 적의 공격 거리를 맞춘다.
- **원인**: 필드 `src/game/world.ts` `update`가 적 이동을 `d > 27`, 적 피격을 `d < 35`로 두고 있었다. 적이 히어로 몸(27)까지 걸어 들어와 때리므로 ① 여러 마리가 히어로 위에 겹쳐 서고 ② 전사는 90에서 일방적으로 벨 수 있으며 ③ 적은 몸이 닿아야 반격했다. 던전(`src/ui/dungeonBattle.ts`)도 같은 값을 따로 적어 두고 있었다 — `DungeonWorld.update`의 추가 걸음 `d-27`, `DungeonBattle.step`의 0.9초 피격 `< 36`.
- **수정**: `world.ts`에 세 상수를 두고 하드코딩을 걷어냈다 — `WARRIOR_ATTACK_RANGE = 90`(전사 평타. `action`의 `range`·평타 `damage(…)`·추격 `stopRange`/`attackRange` 네 자리의 90을 이 상수로 바꿨다), `ENEMY_ATTACK_RANGE = WARRIOR_ATTACK_RANGE`(90, 적 피격 `d <= ENEMY_ATTACK_RANGE`), `ENEMY_STOP_RANGE = 60`(적이 걷기를 멈추는 자리, `enemy.moving = d > ENEMY_STOP_RANGE`). 던전은 같은 두 상수를 import해 추가 걸음 게이트·클램프(27→`ENEMY_STOP_RANGE`)와 0.9초 피격(36→`ENEMY_ATTACK_RANGE`)에 쓴다. 세이브·서버·API 계약은 그대로다(`server/dungeon-verify.mjs`는 같은 모듈을 리플레이하므로 상수 중복이 없다).
- **정지 거리 60을 고른 근거**(브리프가 맡긴 판단): 정지 거리를 사거리와 똑같이 90으로 두면 히어로 평타의 넉백(`damage`의 `knockback 12 × 16` = 16유닛)이 매 타격마다 적을 106으로 밀어내 사거리 밖으로 튕기고, 히어로가 다시 걸어 들어가야 한다(1프레임 실측으로 확인). 60은 ① 16유닛 밀려도 76이라 사거리(90) 안에 남아 때리고 걷기를 반복하지 않고 ② 화면에서 약 57px(390×700 기준, 적·히어로 몸 높이 66px 안팎)라 몸이 겹치지 않으며 ③ 공격 모션의 내딛기(일반 16px·보스 26px)와 할퀴기 이펙트가 닿는 자리다. 멈춤(60)과 피격(90)이 서로 다른 값이라 적은 90을 지나 60까지 걸어오며 이미 때리기 시작한다.
- **실측**(같은 세이브·같은 시드 97531, 수정 전 → 후): 던전 Lv10·공격 120 — 1층 5.6s 체력 208→203, 5층 19.6s 194→175, 10층 83.3s **77→57**(90초 안에 여전히 클리어). Lv30·공격 320 — 1층 5.6s·5층 8.9s·10층 34.0s로 **클리어 시간은 그대로**, 받는 피해만 448→436·448→420·359→319. 클리어 시간이 변하지 않는 이유는 히어로 공격이 쿨다운 기준이고 적이 정지 거리 안에 계속 서 있기 때문이다. 필드 20층 10초 자동 사냥 — 잃은 체력 0 → 17(328 중)·18(448 중), 처치 6~7 → 7(적이 90에서부터 때리므로 히어로가 먼저 맞기 시작한다).
- **검증**: `npx tsc --noEmit` 통과, `npx vite build` 통과(배포 번들에 `hr=90,Cg=hr,uc=60`·`a.moving=h>uc`·`h<=Cg&&e.hit<=0` 확인 — `hr`=전사 평타, `Cg`=적 사거리, `uc`=적 정지 거리). 프리뷰 배포 `6d94d058.djrpg.pages.dev` **Cloudflare Pages SUCCESS**·`version.json` `6d09d808212a`(`builtAt` 2026-11-21T04:27:31Z)·루트 200, 배포 번들 `assets/index-CtQMmII0.js`(762,950B)에 `a.moving=h>uc`·`h<=Cg&&e.hit<=0`까지 포함 확인(`Workers Builds: djrpg` 실패는 `main`·PR #258에서도 같은 상시 체크). 신규 `tests/enemy-range-90.test.mjs` **8/8**(상수 통일·80 거리 피격·90 밖 무피해·정지 거리 준수·넉백 뒤에도 계속 피격·던전 0.9초 피격·던전 추가 걸음·던전 리플레이 클리어). `tests/dungeon-battle.test.mjs` **32/32**(정지 거리 계약으로 교체 + 이동 계측을 적의 실제 변위로), `tests/{world-movement,range,enemy-strike-crit,dungeon-verify,dungeon-seed,dungeon-record,dungeon-rewards,world-boss-field,world-boss-live}` 통과. 전체 `node --test tests/*.test.mjs` **1,052건 중 955 통과** — 실패 97건은 이 sparse 체크아웃에 `public/assets/**`가 없어 나는 ENOENT(같은 체크아웃의 `main` 워크트리에서 **1,044건 중 946 통과·실패 98**로 동일한 자산 실패 집합, 차이 1건은 종전부터 간헐적인 `평타 두 방이면…` 1건).
- **PR #253과의 겹침**: [PR #253](https://github.com/songduckjin/DJRPG/pull/253)(작업 248, 던전 히어로 추격)도 `src/ui/dungeonBattle.ts`를 고친다. 이 작업이 바꾼 곳은 `DungeonWorld.update`의 **추가 걸음 블록**(`d<=27`·`d-27` — PR #253에서는 문맥 줄)과 `DungeonBattle.step`의 피격 거리, 그리고 `world.ts`(PR #253은 건드리지 않는다)라 기능은 독립이고, `dungeonBattle.ts`의 같은 함수 주변을 함께 만지므로 **나중에 합치는 쪽이 그 한 블록만 손으로 맞추면 된다**. 두 PR 모두 히어로가 걷는지와 무관하게 적의 정지 거리·피격 거리를 60/90으로 쓰므로 서로를 깨지 않는다.
- **머지·배포**: 사용자 지시("변경사항 모아서 한 번에 배포")에 따라 **PR만 만들고 `main` 머지·배포는 하지 않았다.** 폰 실기 확인(적이 몸에 겹치지 않고 90에서 때리는지, 던전 난이도)은 사용자 몫.

## 2026-11-21 · songduckjin 작업 255 — 전체 장비 밸런스 조정(직업 정체성·티어 %·부위 역할·쯔바이핸드)

- **요청**: "그리고 이제 전체 장비가 생겼으니까 전체적인 장비 벨런스 조정도 해줘"(12:59 KST) → 세 가지 불균형 보고(직업별 스탯 차별화 없음·0↔9티어 +6/+4·쯔바이핸드 역전)와 조정 방향 제안 → "응 바로진행해 원하던거야"로 승인. **머지·배포 보류.**
- **직업 정체성**: 예전에는 투구·갑옷·무기 이름이 직업별로 나뉘어도(작업 249) 스탯 식이 세 직업 100% 같았다. 이제 `jobMastery`가 **장비로 오른 능력치에만** 곱하고(전사 방어 ×1.12·체력 ×1.10, 궁수 치명 ×1.15·공속 ×1.38, 마법사 공격 ×1.38), 장비 자체도 `jobWeaponProfiles`(대검 공격 1.05·체력 1.30·방어 .25, 활 공격 .95·치명 1.35·공속 .85, 지팡이 공격 1.18)와 `jobArmorProfiles`(판금 > 가죽 > 로브)로 나뉜다. 직업은 `itemJob`으로 판별하므로 작업 249(PR #254)가 없는 `main`에서는 투구·갑옷이 공용 표(`slotProfiles`)를 쓰고, #254가 머지되면 그 PR의 `item.job`/직업별 목록을 그대로 따라간다 — **두 상태 모두에서 동작**하고 밸런스도 ±9% 안쪽이다(시뮬레이션은 두 상태를 모두 계산).
- **티어 %**: `TIER_STAT_GROWTH = .035`. 10티어 슬롯은 0→9가 ×1.315, 5티어 슬롯(문장·목걸이·반지)은 4단계를 9단계로 환산(`×9/4`)해 최고 티어가 역시 ×1.315. 깊은 층에서도 비율이 유지되어(예전 고정 +6/+4는 `scale`이 커지면 1~2%로 희석됐다) 9티어 파밍이 체감된다. 시뮬 50층 전설 무기 주 스탯 164 → 215.
- **부위 역할**: `slotProfiles`로 무기는 공격의 주인(1.0), 갑옷(방어 1.6·체력 5.2)·투구(1.3·4.6)는 방어·체력의 주인, 문장·벨트는 방어+체력, 장갑·신발은 공속, 목걸이·반지는 치명 중심이며 **반지 공격은 무기의 1/3**로 낮췄다. 등급 규칙은 체력 매직↑·치명 레어↑·공속 레어 35%→유니크 100%로 조정했다(유니크부터 주면 레어 구간 궁수만 15~19% 뒤처졌고, 레어부터 100%를 주면 레어 장비가 2배 강해져 난이도가 내려갔다).
- **쯔바이핸드**: `+25% 공격·+50% 치명` → `공격 +2·치명 + scaled×0.15`만 남겼다. 3티어 쯔바이핸드가 7~9티어 대검을 이기던 역전이 사라지고(같은 부위 3티어보다 치명만 높은 5~6티어급), `itemPower`로 3티어 < 7티어를 테스트로 고정했다.
- **호환**: 기존 장비 스탯은 **그대로** 저장·표시되고 직업 숙련만 새로 적용된다. `estimatePlus`·`maxTierBonus`는 **옛 공식 역산 전용**으로 남겨 옛 세이브의 `+N`이 바뀌지 않게 했고, 서버 `itemWithinBounds`는 새 상한(`MAX_SLOT_PROFILES`·`TIER_STAT_GROWTH`)과 옛 공식 상한 중 **큰 쪽**을 허용해 새 드롭·옛 장비가 모두 통과한다(서버 사본은 `save-guard` 테스트가 표 단위로 대조). 도감 `codexOptions`는 `gearStats`의 무작위 0/.999로 최소·최대를 만들어 공식이 한 곳만 남았다.
- **검증**: `npx tsc --noEmit` 통과, `npx vite build` 통과, 신규 `tests/gear-balance.test.mjs` **7/7**(티어 계수·부위 역할·직업 정체성·레어 이상 세 직업 ±10%·쯔바이핸드·옛 장비/서버 상한), 관련 `gear-balance`+`item-plus`+`save-guard`+`codex`+`appearance`+`upgrade-badge`+`extra-options` 통과, 전체 `node --test tests/*.test.mjs` 994건 중 888~890 통과(실패 104~106건은 sparse 체크아웃에 `public/assets/**`가 없어 PNG를 여는 기존 실패와 `costume-field-render` 등 — 변경 전 `main` 워크트리에서도 같은 수). `scripts/sim-gear-balance.mjs` — 1·20·25·50·78·100층 × 6등급 × 티어 0~9, 세 직업 전투력 최대 격차 **레어 이상 9.0%**(일반·매직은 최대 19.6% — 버리는 장비라 숙련 배율이 크게 보인다), 50층 전설 기준 전사 100 / 궁수 100 / 마법사 101(공격 100/103/149, 방어 100/82/82, 체력 100/87/87, 치명 100/122/102, 공속 100/147/102), `#254` 이전 standalone 계산도 최대 9.0%.
- **PR**: [PR #261](https://github.com/songduckjin/DJRPG/pull/261)(`feat/255-gear-balance`, base `main`). **머지·배포는 하지 않았다** — 사용자 검수 후 결정.
- **한계·남은 것**: ① 치명타는 `world.ts`의 80% 상한 때문에 후반에 세 직업 모두 상한에 닿는다 — 궁수 정체성의 중심은 공속이고 치명은 초·중반 체감이다(상한·공속 곡선 자체를 손대는 것은 이 PR 범위 밖). ② 옛 장비의 과도한 공속·치명은 그대로 남는다(스탯 불변 원칙). ③ 실제 폰 화면·전투 체감 확인은 사용자 몫. **머지·배포는 하지 않았다.**

## 2026-11-21 · songduckjin 작업 253 — 상점 다이아 패키지 확정 1안 그림 적용(PR 준비, 중단·인수인계)

- **요청**: 사용자가 `ask_user`로 확정한 1안(`downloads/djrpg_diamond_pack_v1.png`, 청동 보물상자의 파란 다이아)을 상점 다이아 상품에 적용.
- **에셋**: 1254×1254 PNG 2.2MB → 512×512 WebP `public/assets/shop/diamond_pack_v1.webp` **50,280B**(시험값: PNG 512 411KB·WebP 720 81KB — 88px 표시라 512 WebP 하나로 충분).
- **UI**: `src/ui/modals/shopModal.ts`에 `DIAMOND_PACK_ART`·`diamondHero()` — 다이아 탭에서 잔액·탭 아래, 상품 그리드 위에 대표 카드 한 번만(`figure.shop-hero` = 88px 아트 + `다이아 패키지` + `충전한 다이아로 캐릭터 슬롯과 전 슬롯 방치를 열 수 있습니다.`). 8칸 카드에 같은 그림을 반복하지 않고, 패키지 탭에는 붙이지 않는다. `alt`=`다이아가 가득 담긴 청동 보물상자`, `width/height=512`, `decoding=async`.
- **CSS**: `src/styles/modals.css` `.shop-hero`(남색 radial 후광·1px 테두리)·`.shop-hero-art`(88×88·`object-fit: cover`·둥근 모서리·파란 글로우)·`.shop-hero-caption`.
- **검증**: `npx tsc --noEmit`·`npm run build` 통과, 신규 `tests/shop-diamond-pack.test.mjs` **3/3**. 전체 테스트는 300초 시간 초과로 **884건까지** 실행(실패 2건 = 기존 `costume-field-render`).
- **중단·인수인계**(사용자 지시: 토큰 절약 위해 직접 이어서 작업): 남은 것은 ① 전체 테스트 완주(기대 실패 4건: costume-field-render 2·skillbook-server 1·hero-art 1) ② 검수 이미지 `downloads/djrpg_shop_diamond_pack_v1.png`(권장: `node scripts/preview-server.mjs` + 브라우저에서 `window.fetch`를 `/api/shop` catalog로 바꾸고 하단 `◆` 버튼으로 390×844 캡처) ③ PR 프리뷰 CI·`/assets/shop/diamond_pack_v1.webp` 200·md5 확인.

## 2026-11-21 · songduckjin 작업 251 — 창을 내렸다가 돌아올 때 "게임에 접속 중입니다…" 안내(재접속 팝업)

- **제보**: "창내렸다가 들어오면 네크워크 연결할수없습니다 상태확인하라고 뜨는데 게임접속중입니다 팝업문구 띄우는걸로"(11:34 KST).
- **원인**: iOS는 창을 내린 사이 떠 있던 요청을 끊는다. 그 순간의 실패가 **오류처럼** 보였다 — ① 세션 복구(`openLogin`의 `begin('load')`)가 실패하면 로그인 화면이 `서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.`를 빨갛게 표시하고 ② 게임 중에는 `SaveSync.flush` 실패가 `handleError` → `onMessage`(빨간 토스트 3.2초) + `저장 실패`로 떴다. 둘 다 다시 보내면 풀리는 끊김이다.
- **문구·판정·재시도 한 곳**(`src/ui/reconnect.ts` 신규): `RECONNECT_MESSAGE='게임에 접속 중입니다…'`, `RECONNECT_SLOW_MESSAGE='연결이 계속 끊겨 있습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.'`, `RECONNECT_RECOVERED_MESSAGE='다시 연결되었습니다.'`, `RECONNECT_SLOW_AFTER_MS=20_000`·`RECONNECT_RETRY_MS=3_000`·`RECONNECT_SLOW_RETRY_MS=10_000`. `offlineError()`는 `code='NETWORK_OFFLINE'`·`notice=true`, `isNetworkOffline()`은 **브라우저가 던지는 끊김 문구**(`Failed to fetch`·`Load failed`·`NetworkError`·`network connection was lost`·`Internet connection appears to be offline`)만 참으로 본다 — HTTP 4xx/5xx·JSON 파싱 실패·서버가 답한 오류는 재시도하지 않는다. `reconnectStage(elapsed)`가 20초 경계에서 '재연결 중'과 '상태 확인 + 다시 시도'를 가른다.
- **로그인**(`src/ui/login.ts`): `accountRequest`의 `fetch` 실패는 `offlineError()`, 본문을 받다 끊긴 `response.json()` 실패도 끊김으로 구분해 던진다(정적 폴백 405는 종전대로 점검 안내 — 작업 242). `openLogin`은 `retryNetwork`로 세션 자동 복구 **7회(약 21초)**·직접 로그인/게스트 **4회**를 스스로 다시 보내고, 그동안 `.login-error.is-connecting`(주황 `#f3cd93` + 도는 표시)에 `게임에 접속 중입니다…`, 20초 뒤에는 상태 확인 안내로 바꾼다. 버튼은 다시 활성화되어 이용자가 바로 로그인할 수 있다.
- **게임**(`src/game/sync.ts`): `onNetwork(state)` 추가. `flush`의 네트워크 오류는 `reportOffline()`(안내 + `연결 중` 상태)만 하고 **빨간 토스트를 띄우지 않는다**. 저장·거래·창고 응답이 성공하면 `reportOnline()`(`recovered`). 거래 `mutate`·창고 `transferWarehouse`의 시도별 끊김도 같은 안내로 넘어가고, `pendingMarket`(결과 미확인 거래)·`INVALID_SAVE` 재동기화·세션 교체·426 버전 가드·409 충돌 경로는 종전 그대로다.
- **화면**(`src/main.ts`·`src/styles/base.css`): `ReconnectNotice`가 `.reconnect-notice`(화면을 막지 않는 상단 알약, `role=status`·`aria-live=polite`, 도는 표시, `prefers-reduced-motion` 대응)를 띄우고 **3초마다 `sync.flushIfDirty()`**로 다시 보낸다. 20초가 지나면 같은 자리가 `다시 시도` 버튼이 있는 안내로 바뀌고, 붙으면 `다시 연결되었습니다.`를 1.6초 보여 준 뒤 저절로 사라진다. `visibilitychange`가 **보일 때**·`online` 이벤트에서도 곧바로 재전송한다(기존에는 숨길 때만 저장했다).
- **검증**: `npx tsc --noEmit`·`vite build` 통과. 신규 `tests/reconnect.test.mjs` **9/9**(문구·20초 단계·끊김 판정(브라우저 문구 5종/HTTP·JSON 오류 제외)·`accountRequest` 끊김 문구·재시도 후 복구·횟수 소진 시 상태 확인 문구·서버 오류는 재시도 안 함·저장 끊김에서 빨간 토스트 없이 `connecting`→`recovered`·거래 끊김·안내 부품의 표시→20초→다시 시도→복구 소멸). `tests/sync.test.mjs` **23/23**(끊김 저장의 거래 차단 문구 기대값을 새 문구로 갱신). 전체 `node --test tests/*.test.mjs` **1,066건 중 1,063 통과**(실패 3건은 변경 전 `origin/main`과 동일 — `costume-field-render` 2·`skillbook-server` 1).
- **남은 것**: 사용자 폰(iOS)에서 창 내렸다가 복귀했을 때 실제 문구·자동 소멸 확인. 이 PR은 **모아서 배포** 지시에 따라 머지하지 않는다.

## 2026-11-21 · songduckjin 작업 250 — 전 직업 공격 파츠 안정화(활·지팡이 프레임 배율, 직업 전환 잔여물, 평타 아이콘)

- **제보**: `#21151` "전직업 공격할때 서있을때랑 색상이 약간 바뀌는거 같고 파츠별로 분리되는현상이 있는거같은데 안정화 필요해"·`#21206` "전사인데 다른캐릭도 보이고 활도 떠다니고"·`#21260` "전사인대 평타 아이콘이미지가 활로되어있어"(11:32~11:41 KST). 세 건 모두 **캐릭터를 바꿔 가며 본 화면**에서 나왔다.
- **파츠 분리 — 측정으로 확인한 원인**: 활·지팡이 파츠 PNG는 `build-bow-parts.py`·`build-staff-parts.py`의 `align_head`가 **서기 셀**에 정합해 뜬 것이라 **서기 아트 배율**을 갖는다. 그런데 사격·공격 시트는 같은 인물을 작게 그린 판이다: 궁수 사격 본체 머리 높이 337→233px(0.69)·불투명 면적 18,565→7,716px(0.42)·`heroBodyPx` 337→235, 마법사 공격은 투구 정합 표 기준 0.89~0.98배. 배율 없이 1로 얹으니 사격할 때 **활만 1/0.70 = 40% 커져** 손에서 떨어진 것처럼 보였다(합성 검수 `downloads/djrpg_attack_parts_before_after_v1.png` — 수정 전에는 활이 키보다 컸다). `archerHelmPlacement`·`mageHelmPlacement`(투구가 프레임마다 얼굴을 템플릿 정합해 잰 **본체 아트 배율**)를 단일 기준으로 삼아 `bows.ts` `bowPlacement()`(그립 앵커는 그대로 두고 배율만), `staffs.ts` `staffPlacement()`(서기 참조값 0.83525/1 × 프레임 배율)로 줄였다. `syncBowPart`·`syncStaffPart`가 그 배율을 스프라이트에 적용한다. 전사 검은 투구 파츠 80장이 그 공격 셀에 정합돼 있고 합성 검수에서 가드가 두 손에 붙어 있어 **배율을 두지 않았다**(공격 시트도 서기와 같은 아트 배율).
- **직업 전환 잔여물 — 원인**: `drawHero`의 `plain`(궁수·마법사) 분기에서만 `heroBow`/`heroStaff`/`heroMageHelm`을 숨기고 **전사 분기(`else`)에는 숨기는 코드가 없었다**(궁수 분기도 지팡이를 `else if`로만 숨겨, 모자만 쓴 마법사에서 넘어오면 모자가 남았다). 그래서 궁수·마법사→전사로 바꾸면 이전 직업 파츠가 본체 위에 그대로 남고 `cloneHeroLayers` 잔상에도 복제됐다. 매 프레임 `hideOtherJobParts(view, job)`가 **직업별로 보여야 하는 것만 남기고 모두 숨기고**(동기화 함수가 필요한 것만 다시 `visible = true`), `World.adoptSave`가 올리는 `switchEpoch`를 `GameView.heroSwitchEpoch`와 비교해 전환 순간 `resetHeroLayers()`가 파츠 5종·`heroGear`·등급 발광 복제본·`ghosts`·`afterimages`·`crushTrails`·`last*` 미리받기 기억을 비운다(시트 텍스처 캐시는 남긴다).
- **평타 아이콘 — 원인**: `src/ui/hud.ts` `tick`의 `button.dataset.state` 캐시 키가 `${kind}:${canAdd}:${selecting}`로 직업을 빼고 있어, 궁수·마법사→전사로 바꿔도 상태 문자열이 같아 `applySkillArtwork`·`basicAttackName`을 다시 부르지 않았다 → `${job}:${kind}:${canAdd}:${selecting}`로 고쳤다.
- **색감 — 원인 규명(코드 무죄, 시트 해상도 문제)**: ① 코드: 서기·공격 모두 `heroTint`(흰색/피격), 파츠 `alpha=1`, `tintedGearTexture(..., armor=null, helmet=null)`는 **원본 텍스처를 그대로** 돌려준다 → 색을 바꾸는 분기가 없다. ② 알파: 본체 18장 전 프레임의 **내부 반투명 0.0%**(작업 227 반영 확인). ③ 같은 자세의 시트 변형(기본↔무기 지운 판↔머리 없는 판)의 **공유 픽셀 색차 ΔRGB 3~5**(256색 팔레트 재인코딩 수준) → 시트 배치가 색을 흔들지 않는다. ④ 실제 차이는 **공격 시트를 작게 그려 1.06~1.43배 더 확대**하는 데서 오는 해상도·윤곽 차이와 포즈 구성(검·활이 위로 솟는 프레임은 평균 밝기 +9%, 마법사 2프레임은 마법 광휘로 +20%, 여마법사는 -13%)이다. 그래서 PNG 색 보정은 넣지 않았다(포즈 구성이 섞여 있어 프레임별 평균 맞추기는 오히려 그림을 망친다). **남은 해결책은 공격 시트를 서기와 같은 아트 배율로 다시 굽는 것**이며 별도 에셋 작업이다.
- **검증**: `npx tsc --noEmit` 통과, 신규 `tests/attack-part-stability.test.mjs` **6/6**(활 배율=본체 배율·그립 불변·지팡이 배율=서기 참조×프레임 배율·전사 검 배율 없음·전사/궁수/마법사에서 이전 직업 파츠 숨김·`adoptSave` 세대 증가와 `resetHeroLayers` 파괴/비움).
- **남은 미세 문제**: ① 짧은 지팡이(1~5번) 파츠 PNG는 손잡이 아래가 잘려 있어(그립 92,114 vs 아트 끝 106) 서기·공격에서 손바닥 위로 약 6아트px 뜬다 → 디자인별 앵커가 필요하다 ② 여마법사 공격 1~2프레임은 **원본 시트 자체가 지팡이를 다른 손·다른 높이로 그려** 파츠가 그 프레임의 손을 따른다(원본 아트 불일치) ③ 궁수 `nobow` 사격 시트에 **활줄 잔여물**이 남아 있어 파츠 활줄과 겹쳐 보인다(수 px).

## 2026-11-21 · songduckjin 작업 249 — 투구·갑옷 직업별 분리(이름·아이콘·장착 제한·도감) · PR 준비(머지 보류)

- **요청**: 사용자 `#21117` "그리고 지금 장비들 법사 궁수 다만등어놨는대 전사꺼 다입고있더리 구분하고 바꾸자"(2026-11-21). **투구·갑옷만** 세 직업으로 나누고 장갑·신발·문장·장신구는 공용 유지, 기존 보유 장비는 그대로 유효하게.
- **이름·데이터**(`src/game/items.ts`): `archerArmorBases`(경갑 — 사냥꾼 가죽 조끼 … 패왕의 신궁 갑주), `archerHelmetBases`(후드 — 사냥꾼의 가죽 두건 … 신궁의 왕관), `mageArmorBases`(로브 — 견습 천 로브 … 대현자 롱 케이프 성의), `mageHelmetBases`(모자 — 수련생 천 두건 … 대현자의 황금 왕관) 각 10종. 이름은 **이미 승인된 외형 시안의 티어 1~10 표기**(`downloads/djrpg_archer_armor_*`·`djrpg_archer_helm_*`·`djrpg_mage_robe_*`·`djrpg_mage_helm_*`)를 그대로 썼고, 전사 목록과 겹치는 셋만 달리 지었다(`사냥꾼 가죽 조끼`·`사냥꾼의 가죽 두건`·`사슬 사냥 코이프`) — 이름이 겹치면 도감·아이콘·외형이 어느 목록의 몇 번째인지 가릴 수 없다. `armorBasesFor`/`helmetBasesFor`/`gearBasesFor`가 드롭 목록을 고르고, `gearTier`가 **가장 긴 기본형 우선**으로 0~9 티어를 찾는다(`사냥꾼 가죽 조끼`가 전사 `가죽 조끼` 0번에 먼저 걸리지 않게).
- **장착 제한과 옛 세이브 호환(핵심 결정)**: 이름만으로는 "새로 떨어진 전사 전용 장비"와 "옛 세이브의 공용 장비"를 가릴 수 없다. 그래서 **새 드롭에만 `EquipmentItem.job` 표식**을 적고 `itemJob`이 ①표식 ②이름(궁수·마법사 목록) 순으로 주인을 판정하며, **전사용 이름에 표식이 없으면 공용**으로 본다. 이 규칙 덕분에 마법사가 입고 있던 `흑요석 갑주`·`불멸의 왕관`이 갑자기 장착 불가나 `INVALID_SAVE`가 되지 않고(가방에 있던 옛 장비도 그대로 착용 가능), 새로 떨어진 전사 전용 장비만 전사 전용이 된다. `canWield`가 무기+투구+갑옷을 보므로 자동 장착·분해 보호·업그레이드 화살표(`▲`)·`내 직업만 보기`가 함께 맞는다.
- **드롭**: `rollEquipment`가 투구·갑옷도 `dropJob()`으로 1/3씩 직업을 골라 그 목록에서 뽑고(`던전·보스·보물 주머니` 포함, 던전 서버 리플레이도 같은 코드라 시드 재현 유지), `migrateItem`이 `job`을 보존한다(알 수 없는 값은 버린다).
- **아이콘**: 궁수 경갑·후드, 마법사 로브·모자 **40종 원화를 새로 생성**(`downloads/jobgear_icons/` — 5종씩 8장)하고 `scripts/build-job-gear-icons.py`로 174×290 5칸·256색 아틀라스(`public/assets/item-art/{archer,mage}_{armor,helmet}_{0,5}.png`)를 구웠다. `equipmentImage`가 그 직업의 아틀라스를 쓰고, 옛 전사용 이름·전사 전용 장비는 기존 판금 아틀라스 그대로다. `scripts/verify-item-art.mjs`가 40종 규격을 검사하고, `scripts/build-item-art-trim.py`로 장착 칸 trim 표(27개 아틀라스)를 다시 만들었다.
- **도감**(`src/game/codex.ts`): 투구·갑옷도 세 갈래(전사 0~9 · 궁수 10~19 · 마법사 20~29)라 기본형 **95 → 135종**, 발견 칸 **570 → 810**. `server/database.mjs`의 발견 기록 상한을 810으로, 업적 `장비 도감 수집`은 **마지막 단계만 570 → 810**으로 올렸다(이미 오른 단계·보상 사다리는 그대로 — 도감이 커진 만큼 마지막 단계만 따라 올린 것).
- **UI**: 장비 상세의 `전사/궁수/마법사 전용 장비` 문구를 바로잡았다 — 투구·갑옷에 `weaponJob`을 쓰면 늘 '전사 전용 무기'로 보이던 버그. 가방·거래소·창고 배지와 `내 직업만 보기`는 `itemJob`을 그대로 쓰므로 자동으로 붙는다.
- **서버 검증**(`tests/job-gear-server.test.mjs` 신규 2/2): 로컬 libSQL로 `register`→`createCharacter`(마법사)→`save`→`load`를 돌려 — ① 새 로브·모자와 `job:'archer'` 갑옷이 `save` 200·`load`에서도 표식 그대로, 옛 전사용 이름(표식 없음)도 함께 통과(다시 `save` 200) ② 가방 40칸은 직업과 무관하게 투구·갑옷을 한 칸씩 센다(무기와 같은 규칙).
- **검증**: `npx tsc --noEmit` 통과, `npm run build` 통과(배포 번들 `assets/index-bCS2djHr.js` 766.22kB — 새 목록 3.3kB 증가, 번들에 `사냥꾼 가죽 코트` 포함·`dist/assets/item-art/`에 8장 포함 확인). 신규 `tests/job-gear.test.mjs` **8/8**(이름 중복 없음·직업 판정·장착 제한·1/3 드롭·아이콘 경로·도감 번호·자동 장착/업그레이드·옛 세이브 호환), `tests/{codex,job-filter,item-drop-jobs,achievements,modal-ui,equipment-slot-aspect}` 통과. 전체 **1,074건 중 1,071 통과** — 실패 3건은 `origin/main`과 동일한 기존 건(`costume-field-render` 2 · `skillbook-server` 1).
- **검수 이미지**: `downloads/job_gear_249/bag_by_job.png`(전사·궁수·마법사 갑옷 10 + 투구 10, 실제 아틀라스 아이콘과 이름), `downloads/job_gear_249/equip_detail.png`(다른 직업 전용 장비의 `장착 불가 (궁수 전용 장비)`와 옛 공용 장비의 `장착` 비교).
- **PR**: [PR #254](https://github.com/songduckjin/DJRPG/pull/254) — CI `Cloudflare Pages` **SUCCESS**, `Workers Builds: djrpg` 실패는 `main`·PR #251에서도 같은 기존 잔재(실제 배포 경로 아님). 파일 27개 변경.
- **머지 보류**: 사용자 "오늘부터는 변경사항 모아서 한 번에 배포하자"(11-21) — **PR만 올리고 머지·배포하지 않는다.**

## 2026-11-21 · songduckjin 작업 248 — 끝없는 던전에서 캐릭터가 몬스터를 기다리던 문제(히어로 이동·추격 복구)

- **제보**: `#21078` "그리고 끝없는던전에서 캐릭터가 몬스터가 다가오길 기다리더라"(11-21 오전 KST).
- **원인**: `src/ui/dungeonBattle.ts` `DungeonWorld.update`가 시작·끝 두 번 `this.player.x=50; this.player.y=50; this.activeMove={x:0,y:0}`으로 히어로를 고정했다(11-19 `d61a685` "spawn dungeon enemies farther away and defend central position"). `super.update(dt)`가 적을 향해 옮긴 한 걸음을 같은 프레임 끝에서 되돌리므로 히어로의 이동 거리는 **항상 0**이었고, 적만 1.5배 속도로 27까지 다가와 때렸다. 그 위에 `nearest()`가 110 밖의 적을 `undefined`로 돌려줘, 150~200 밖에서 뜨는 웨이브는 추격 대상도 아니었다.
- **수정**: 고정 줄 두 개와 `nearest()` 오버라이드를 삭제해 일반 필드와 같은 규칙을 쓴다 — `World.update`가 가장 가까운 적을 향해 `activeMove`로 `stopRange`(전사 90·궁수 180·마법사 160)까지 걷고, 히어로는 `clampArenaPoint` 안에 머문다. 적의 1.5배 추가 걸음·`DUNGEON_STEP=1/60` 고정 스텝·시드 리플레이(서버 `server/dungeon-verify.mjs`가 같은 모듈로 다시 돈다)·90초 제한·드롭/보상은 손대지 않았다.
- **실측**(같은 세이브·같은 시드, 수정 전 → 후): Lv10·공격 120 전사 1층 클리어 **5.6초 → 3.3초**, 4층 **5.6 → 3.7초**, 5층(보스) **22.2 → 20.8초**, Lv30 10층 보스 **68.1 → 66.7초**. 히어로 경로 길이 0 → 65~69유닛(390×700에서 화면 392 → 351px, 1초에 28px·2초에 추가 12px 걸어 올라간 뒤 교전). 궁수·마법사는 정지 거리(180·160)가 웨이브 등장 거리(≈167)보다 멀어 종전처럼 제자리에서 쏘고 **이제 사거리(330·285) 안의 적을 실제로 쏜다**(110 상한 삭제).
- **경계**: 히어로의 발끝이 화면에서 가장 높이 올라간 지점은 390×700 **344px**·360×640 **314px**로, 철문 문턱(화면 38% = 266px·243px)보다 78px·71px 아래다 — 문을 뚫고 나가지 않는다(`clampArenaPoint` 이탈 0회, 5시드×1~10층 50판). 히어로가 서 있는 자리에서 다음 웨이브가 뜨는 최소 거리는 **81.6유닛**이라 코앞에 튀어나오지 않는다. 드롭 착지·흡수·결과창·히어로 체력바는 매 프레임 `battle.world.player` 좌표를 다시 읽으므로 이동을 그대로 따라간다.
- **검증**: `npx tsc --noEmit`·`npx vite build` 통과, `tests/dungeon-battle.test.mjs` **34/34**(기존 "히어로가 50,50에 머문다" 계약을 "걸어 나가 적과 교전한다"로 교체 + ① 110 밖 웨이브도 추격 ② 아레나·문 경계 2건 신규), 던전·이동 관련 `dungeon-{battle,seed,verify,ranking,record,rewards,lobby}`·`world-movement`·`arena`·`field-loot` 112건 통과, 전체 `node --test tests/*.test.mjs` **1,049건 중 953 통과**(실패 96건은 이 sparse 체크아웃에 `public/assets/**`·`public/assets/pilot-25d/**`가 없어 나는 시트 규격/아트 검사 ENOENT — 변경 파일과 무관, CI의 전체 체크아웃에서 수행). 서버 리플레이는 같은 함수를 돌리므로 시드·스텝·digest 계약(`dungeon-seed`)이 그대로 통과한다.
- **머지·배포**: 사용자 지시 "오늘부터는 변경사항 모아서 한 번에 배포하자"에 따라 **PR만 만들고 `main` 머지·배포는 하지 않았다.** [PR #253](https://github.com/songduckjin/DJRPG/pull/253) — Cloudflare Pages **SUCCESS**(프리뷰 `0d568cf9.djrpg.pages.dev` `version.json` `e2a48a2bb9d1`·`builtAt` 2026-11-21T03:02:21Z, 배포 번들 `assets/index-D14AeeER.js`에서 매 프레임 고정 `this.player.x=50` 0건), `Workers Builds: djrpg` 실패는 `main`·PR #250에서도 같은 상시 체크. 폰 실기 확인(던전에서 히어로가 걸어가 교전하는지)은 사용자 몫.

## 2026-11-21 · songduckjin 작업 247 — 마법사 모자·투구 파츠에서 상반신 걷어내기(투구만 빛나게)

- **제보**: "투규만 유니크인대 갑옷도 반짝거리네"(02:23 KST, `IMG_1147`) — 마법사 여성 캐릭터에 **투구만 유니크**인데 로브 상체까지 주황색으로 반짝였다.
- **원인(확인)**: `mage_helms/{male,female}_{0..9}_v1.png`(362×406)가 머리·모자만이 아니라 **상반신 전체**(어깨·가슴·허리·양팔·왼손의 불꽃, 셀 y 195)를 담고 있었다. 파츠가 로브 위를 덮어 상체 옷이 바뀌어 보였고, 등급색 발광이 파츠 전체에 걸려 로브까지 물들었다. 파츠 아래 경계(`EXTRA_BOX` y=196/176)가 머리 구멍(`ERASE_BOX` y=104)보다 훨씬 아래였던 것이 원인.
- **파츠 수정**(`scripts/build-mage-helm-parts.py`): `NECK_Y = 104` 를 두고 **머리 구멍과 파츠가 같은 목선에서 끝나게** 했다(파츠 y1 196/176 → 104). 같은 시안에서 20장 재생성(9~19KB → 5~12KB) 후 `restore-pilot-alpha.py` 로 작업 227의 내부 알파 기준을 다시 맞췄다. 머리 구멍·머리 없는 시트 12장은 손대지 않아 로브·지팡이·바꿔 입기 조합이 그대로다(재생성하면 알파·팔레트가 달라져 66장이 흔들린다).
- **발광 마스크**(`mageHelmets.ts`): ① 파츠에 얼굴이 함께 들어 있어 유니크·전설에서 얼굴이 등급색 덩어리가 되고 ② 목선에서 끊긴 파츠에 발광을 그대로 걸면 가슴께에 **직선으로 잘린 발광 띠**가 남는다. 그래서 성별 마스크를 캔버스로 굽는다 — 목선(셀 y 84→106/108)으로 갈수록 빛이 사라지고, 얼굴(중심 194/48·205/52, 안쪽 20~22px)은 부드럽게 도려낸다. 새 PNG 파일 없이 성별당 1장만 캐시한다.
- **필드**(`entities.ts`·`render.ts`): `syncGearGlow` 에 7번째 인자 `maskTexture` 를 두고, 마법사 투구일 때만 `mageHelmGlowMaskTexture(gender)` 를 넘겨 `GameView.heroHelmGlowMask` 스프라이트(파츠와 같은 앵커·위치·배율)를 발광 3겹의 마스크로 건다. 전사·궁수 투구는 예전처럼 마스크 없음.
- **장비창**(`equipmentPortrait.ts`): `paintPatch` 가 발광 사본을 만든 뒤 마스크를 `destination-in` 으로 합성해 도려낸다(마법사 투구 레이어일 때만). `EquipmentPortraitMageHelm` 에 `gender` 를 더했다.
- **캐시**: `PILOT_ASSET_VERSION` 4 → 5(같은 파일명으로 다시 구웠으므로 `?v=5`). 테스트 13개 파일의 `?v=4` 기대값을 함께 올렸다.
- **검증**: `npx tsc --noEmit`·`npm run build` 통과(배포 번들 `index-8tRnUFGl.js` 에 `heroHelmGlowMask` 포함). 신규 테스트 2건(`mage-helm-render` — 20장 전수 목선 위에서 끝남·상반신 자리 0픽셀, 발광 마스크 식: 정수리 1·목선 0·얼굴 0·단조 감소) + `gear-rarity-glow` 1건(마스크 배선·캔버스 캐시·PNG 없음). 전체 1,060건 중 1,056 통과 — 실패 4건은 변경 전 `origin/main` 과 같은 기존 건(`costume-field-render` 2·`skillbook-server` 1·`hero-art` 1).
- **검수 이미지**(`downloads/`): `djrpg_mage_helm_torso_before_after_v1.png`(수정 전/후 · 유니크 투구 · 장비창), `djrpg_mage_helm_glow_portrait_v1.png`(일반/유니크/전설 · 남녀), `djrpg_mage_helm_glow_field_v1.png`(필드 42% · 일반/유니크), `djrpg_mage_helm_glow_all_{female,male}_v1.png`(10종 전수 · 유니크).
- **프리뷰 배포 실측**: [PR #252](https://github.com/songduckjin/DJRPG/pull/252) Cloudflare Pages 체크 SUCCESS, 프리뷰 `44da4568.djrpg.pages.dev` 에서 `assets/pilot-25d/mage_helms/female_0_v1.png?v=5` = 로컬 파일(md5 `04c5be3a…`, 7,881B) **일치** · 배포 번들에 `heroHelmGlowMask`·성별 마스크 표(`fadeEnd:106/108`) 포함 · 게스트로 마법사(여) 캐릭터를 만들어 필드·내 정보 초상화가 정상 렌더되는 것까지 확인(투구는 드롭 전이라 파츠·발광은 합성 이미지로만 검수).
- **상태**: PR 준비 완료 — 사용자 지시 "오늘부터는 모아서 배포하자"에 따라 **머지·배포하지 않았다**.
- **남은 것**: 어깨까지 파츠를 더 줄이려면 머리 구멍(현재 셀 y 104)을 목선까지 올려야 하고, 그러면 `mage_headless` 12장 + `robes/headless` 54장을 같은 규칙으로 다시 구워야 한다(그대로 줄이면 어깨에 투명 구멍이 난다). 이번 작업은 파츠·발광만 손봤다.
