# [코덱스 지시서 1] 추가옵션까지 실제 반영한 '더 좋은 장비' 판정 개선

> 2026-11-23 덕진 님 PC Codex 전용 상세 작업지시서. 공통 실행 규칙은 `AGENTS.md`, 진행 현황은 `docs/TASK.md`를 따른다.

## [코덱스 지시서 1] 추가옵션까지 실제 반영한 '더 좋은 장비' 판정 개선

사용자 지시(2026-11-23 KST): "아이템에 추가옵션도 고려해서 더좋은템인지 아닌지 구분해야돼"

**지금 상태(확인함, `origin/main` `237f2bc` 기준)**
- `src/game/items.ts` `itemPower()`는 아이템 한 벌의 **고정 가중치**(공격×3·방어×2·체력×0.2·치명×2·공속×2·쿨감×6 + 등급 가중 2)에 `src/game/extraOptions.ts` `extraOptionPower()`의 **고정 가중치**(`extraOptionPowerWeights`: `attackPct` 3·`bonusDmgPct` 3·`critPct` 2.5·`speedPct` 2.5·`evasionPct` 2·`defensePct` 2·`lifestealPct` 2·`healthPct` 1·`regenPct` 1·`cdrPct` 4)를 더하는 **단품 점수**다.
- 그래서 ① 캐릭터가 성장할수록 커지는 % 추가옵션의 실제 가치(공격력 10인 캐릭터의 `attackPct 3`과 공격력 300인 캐릭터의 `attackPct 3`이 같은 점수) ② 합산 상한에 막혀 **실제로는 오르지 않는** 옵션(`EXTRA_EVASION_CAP` 30·`EXTRA_REGEN_CAP` 12·`EXTRA_CRIT_CAP` 10·`EXTRA_SPEED_CAP` 10·`EXTRA_CDR_CAP` 6·`EXTRA_LIFESTEAL_CAP` 5·전투 `SKILL_CDR_CAP` 35%) 이 판정에 반영되지 않는다.
- 이 점수를 `isUpgradeForHero`·`isDowngradeForHero`(화살표), `autoEquipBest`(자동 장착), 분해 보호(`src/game/inventory.ts`·`src/ui/salvageProtection.ts`), 업그레이드 배지(`src/ui/upgradeBadge.ts`)가 함께 쓴다.

**요구사항**
1. **판정 기준을 "내 캐릭터가 기존 부위 장비를 벗고 후보를 입었을 때의 실제 변화"로 바꾼다.** `save` 기준 `totalStats`(현재 상태)와 (기존 장비 제거 + 후보 착용) 상태의 차이를 비교하는 함수 하나(예: `equipDelta(save, item)`)를 `src/game/items.ts`에 두고, `isUpgradeForHero`·`isDowngradeForHero`·`autoEquipBest`·분해 보호가 **모두 그 함수 하나**를 쓰게 한다. 반지는 두 칸 중 약한 쪽을 바꿔 보는 현재 규칙을 유지한다.
2. **% 옵션의 유효 증감분을 캐릭터 스탯 규모에 비례해 평가한다.** `attackPct`·`defensePct`·`healthPct`는 캐릭터의 실제 공격력·방어력·최대 체력에 곱해 **절대량**으로 환산하고, `bonusDmgPct`·`critPct`·`speedPct`·`cdrPct`·`lifestealPct`·`evasionPct`·`regenPct`는 그 캐릭터의 현재 수치·상한 대비 **얼마나 더 오르는지**로 환산한다(DPS/생존 기대값 기준). 상한에 이미 닿은 옵션은 증분 0으로 계산한다.
3. **향후 치명타 피해량 추가옵션 확장을 고려한다.** `ExtraOptionKey`에 `critDamagePct`를 더해도 판정 코드가 깨지지 않게 키별 환산표를 한 곳(`extraOptions.ts`)에 두고, 알 수 없는 키는 0이 아니라 **보수적 기본값**으로 처리하되 테스트로 고정한다(옵션을 지금 추가하지는 않는다).
4. **화면 숫자와 판정을 일치시킨다.** 분해 보호 팝업과 업그레이드/다운그레이드 화살표가 같은 근거(어느 스탯이 얼마나 오르내리는지)를 보여 주고, 표시 숫자와 실제 판정이 뒤집히지 않게 한다(팝업 문구에 상한 때문에 오르지 않는 옵션은 '상한' 표시).
5. **서버 계약은 바꾸지 않는다.** `server/extra-options.mjs`의 옵션 규칙·`save-guard.mjs`의 상한 검증은 그대로 두고, 클라이언트 평가만 바꾼다(서버 사본과의 대조 테스트는 계속 통과해야 한다).
6. **테스트**: 신규 `tests/upgrade-real-value.test.mjs` — ㉠ 성장한 캐릭터에서 `attackPct`가 낮은 장비보다 실제 공격력이 더 오르는 장비가 '업그레이드'로 판정 ㉡ 상한에 닿은 `critPct`/`evasionPct` 장비가 '업그레이드'로 오판되지 않음 ㉢ `isUpgradeForHero`·`isDowngradeForHero`가 한 아이템에 동시에 참이 되지 않음 ㉣ `autoEquipBest`가 고른 장비가 `equipDelta` 최대 ㉤ 분해 보호·배지가 같은 판정을 씀(함수 호출 대조) ㉥ 반지 두 칸 규칙 ㉦ 알 수 없는 옵션 키 안전 처리. 기존 `tests/{upgrade-badge,downgrade-badge-and-journey,salvage-protection,equipment-info,extra-options,ring-restore,item-drop-jobs}.test.mjs` 회귀도 통과.
