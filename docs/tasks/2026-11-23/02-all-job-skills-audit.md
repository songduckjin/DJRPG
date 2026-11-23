# [코덱스 지시서 2] 백로그 9번 — 전 캐릭(전사·궁수·마법사) 스킬 이펙트 연출·스킬 범위·타격 범위 전수 개선

> 2026-11-23 덕진 님 PC Codex 전용 상세 작업지시서. 공통 실행 규칙은 `AGENTS.md`, 진행 현황은 `docs/TASK.md`를 따른다.

## [코덱스 지시서 2] 백로그 9번 — 전 캐릭(전사·궁수·마법사) 스킬 이펙트 연출·스킬 범위·타격 범위 전수 개선

사용자 지시(2026-11-23 KST): "9번 코덱스한테 시키자" · "스킬관련은 전캐릭 전부 확인해봐야돼"

**대상 범위 — 직업·스킬 빠짐 없이**: 액티브 24종(직업별 8 — `skillOrderFor`: 전사 `slash2`·`slam`·`warcry`·`power`·`destroy`·`hell`·`crushing`·`spin`, 궁수 `doubleShot`·`multiShot`·`pierceShot`·`iceArrow`·`hawkEye`·`snipe`·`stormVolley`·`arrowRain`, 마법사 `fireBolt`·`iceBolt`·`chainLightning`·`manaBurst`·`frostNova`·`arcaneShield`·`meteorStrike`·`arcaneOverlord`) + 패시브 9종(`passiveOrderFor`: 전사 `mastery`·`body`·`instinct`, 궁수 `bowMastery`·`swiftStep`·`hawkSight`, 마법사 `staffMastery`·`manaCircuit`·`arcaneSense`). 한 스킬도 빼지 말고 표로 남긴다.

**지금 상태(확인함, `origin/main` `237f2bc` 기준) — 판정과 그리기가 따로 논다**
- 사거리: `src/game/skills.ts` `skills[id].range` + `skillRange(id, level)`(레벨당 성장).
- 판정: `src/game/combat/engine.ts`에 **인라인 매직 넘버**로 흩어져 있다 — `burst` 반경 96·`meteor` 110·`chain` 70·`nova` = `skillRange`, 부채꼴 `slash2` .9rad·`slam` 1.35rad·`hell`/`spin` π, 투사체 `shoot({radius})` 34~70. 타겟 계산은 `src/game/battle/targeting.ts`(`targetsInArc`·`nearestEnemy`·`aimPoint`).
- 그리기: `src/game/render/vfx.ts`(`drawBurst`·`drawNova`·`drawArrowRain`·`drawDragon`·`drawWhirlSlash`·`drawHit` …)가 자기 크기로 그리고, `src/game/render/field.ts`·`src/game/render/hawkEyeWind.ts`·`src/game/render.ts`가 바닥 범위·바람·레이어를 맡는다.

**요구사항**
1. **스킬별 판정 스펙을 한 곳으로 모은다** — 예: `src/game/battle/skillAreas.ts`(또는 `skills.ts`의 `SKILL_AREAS`)에 스킬 id별 `{range, radius, arc, projectileRadius, duration}`을 적고, `engine.ts`(판정)와 `render/vfx.ts`·`render/field.ts`(그리기)가 **같은 값**을 읽는다. `engine.ts`·`vfx.ts`에 스킬 반경/각도 리터럴을 남기지 않는다.
2. **시각 범위 = 실제 타격 범위**(모든 액티브): 이펙트만 크고 안 맞거나, 이펙트 밖 몹이 맞는 경우를 없앤다. 바닥 장판·부채꼴·관통선·화살비 낙점은 **판정 반경 그대로** 그린다(가장자리 1~2px 표시 여유는 허용, 판정과 다른 비율 금지).
3. **전수 표**: 스킬 id·직업·종류·`skillRange`(Lv.1/Lv.10)·판정 반경/부채꼴·이펙트 크기·일치 여부·수정 내용을 24+9행으로 만들어 PR 본문과 `docs/WORKLOG.md`에 남긴다(빠짐 없음의 증거).
4. **연출 차별화·타격감**: 전사(근접 베기·충격파·돌진/회전)·궁수(단발·다중·관통·화살비)·마법사(원소 투사체·장판·연쇄·폭발)가 390×844 전투 화면에서 한눈에 구분되게 색·잔상·발사/착탄·피격을 보강한다. 화면을 과도하게 덮지 않게(전체 화면 피복 상한) 하고 `prefers-reduced-motion`을 존중한다.
5. **성능 안전장치**: 다수 몹·고공속에서 이펙트 배열의 수명·상한(동시 파티클 수)·메모리 누수를 정리하고, 프레임 예산을 넘지 않게 한다(60fps 기준, 다수 몹 시나리오 확인).
6. **패시브 9종**: 붙이는 수치(공격력·HP·방어·치명·공속)가 `src/game/combat/engine.ts`·`src/game/statSheet.ts`에 실제 반영되는지 확인하고, 반영되지 않는 항목이 있으면 보고한다(이 지시서 범위에서 고칠지 판단).
7. **테스트**: 신규 `tests/skill-areas.test.mjs` — ㉠ 액티브 24 + 패시브 9 전부 스펙 표에 존재 ㉡ 판정과 그리기가 같은 스펙을 읽음 ㉢ `engine.ts`·`vfx.ts`에 스킬 반경 리터럴이 남아 있지 않음 ㉣ 판정 경계 바로 밖의 적은 맞지 않고 안쪽은 맞음(`targetsInArc` 경계) ㉤ 3직업 대표 스킬 6종 이상의 시각/판정 일치. 기존 `tests/{skill-double-slash,skill-whirl-slash,skill-feedback,range,enemy-range-90,combat-field-split,dungeon-battle}.test.mjs` 회귀 통과.
