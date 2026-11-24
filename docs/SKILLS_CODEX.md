# SKILLS_CODEX — 스킬 · 스킬북 · 합성 · 장비 도감

> **책임**: 액티브/패시브 스킬 정의·해금·쿨타임·버프, 퀵슬롯 추천, 스킬북 드롭·사용·합성(타직업 5권 → 내 직업 1권), 장비 도감(저장 810칸 · 화면 135칸). 아이템 스탯·가방은 `docs/INVENTORY_GEAR.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| **스킬 트리 데이터·판정·투자/초기화** | `src/game/skillTree.ts`(`skillTreeFor`·`buildSkillTree`·`skillNodeStatus`·`investSkillPoint`·`resetSkillTree`·`skillValueRows`·`TIER_SHAPE`·`TIER_GATE`) |
| **스킬 타격 범위 공용 규격** | `src/game/battle/skillAreas.ts`(`SKILL_AREAS`·`PASSIVE_AREAS`·`skillArea`·`projectedAreaRadii`) — `combat/engine.ts`와 `render/vfx.ts`가 공유 |
| 전사·궁수·마법사 스킬 VFX 개발용 미리보기 | `skill-vfx-studio.html`·`src/dev/skillVfxStudio.ts` — 실제 `CombatEngine`·`GameView`를 쓰는 독립 화면, 계정·저장 없음 |
| **SP 회계(클라·서버 공용)** | `src/game/skillPoints.ts`(`SP_PER_LEVEL`·`spTotal`·`spSpent`·`spLedger`) |
| 스킬 트리 화면 | `src/ui/modals/skillModal.ts`(세 칸 조립)·`src/ui/skillTreeView.ts`(상단 바·트리·상세 패널)·`src/styles/modals/skill.css` |
| 스킬·패시브 정의, 직업별 순서·레벨 | `src/game/skills.ts` (`jobs`·`skillOrderFor`·`passiveOrderFor`·`skillDuration`·`canLearn`·`MAX_SKILL_LEVEL`) |
| 퀵슬롯·추천 장착·DPS | `src/game/loadout.ts` (`normalizeQuickSlots`·`recommendedSkillOrder`·`autoEquipRecommendedSkills`·`skillDps`) |
| 스킬 레벨·스킬북 비용 | `src/game/skillProgress.ts`·`src/game/store.ts`(`useSkillBook`·`skillLevel`) |
| 스킬북 합성 | `src/game/skillSynth.ts`(`SYNTH_BOOK_COST`=5·`synthMaterials`·`synthCapacity`·`synthesizeSkillBooks`) |
| 합성 UI·연출 | `src/ui/modals/synthModal.ts`·`src/styles/modals.css`(`.synth-*`) |
| 퀵슬롯 UI·스킬 그림·스킬북 사용 | `src/ui/skillLoadout.ts`(빈 원 선택 팝업)·`src/ui/skillFeedback.ts`·`src/ui/skillArtwork.ts`·`src/ui/skillBooks.ts`(`skillUpgradeInfo`·`upgradeSkill`·`renderSkillBooks` — 스킬북 탭 전용) |
| 서버 스킬북 ID 단일 목록 | `server/skill-ids.mjs`(33종) — `tests/skillbook-server.test.mjs`가 `skills.ts`와 대조 |
| 도감 | `src/game/codex.ts`(`codexEntryStates`·`filterCodexEntryStates`·`codexGroupTotals`)·`src/ui/modals/codexModal.ts`·`src/styles/codex.css` |

## 불변 규칙

- **직업 3종**: 전사·궁수·마법사. 직업별 액티브 8 + 패시브 3 = 11종, 전체 스킬북 33종.
- **타격 범위**: `skillArea(id, level)`이 시전 거리(`skillRange`)와 피해 반경·각도·투사체 착탄 반경을 한 곳에서 준다. 원형 바닥 표시는 월드 반경을 아이소 투영(`projectedAreaRadii`)해 그린다. 투사체는 도착 뒤 같은 반경의 바닥 피드백을 낸다. 장식 이펙트는 타격 판정에 영향을 주지 않고 최근 160개로 제한한다. 모션 감소 설정에서는 장식 입자를 줄인다.
- **이단참**: 두 검기는 반대 대각선으로 겹쳐 X자를 만들고, 두 타격은 전방 길이 Lv.1 130px(레벨당 +4px) × 폭 180px 사각형을 각각 다시 판정한다. 같은 사각형 바닥선을 VFX 스튜디오와 게임 화면에 그린다.
- **와일드 스탬프**: 캐릭터는 공중으로 뜨지 않는다. 고해상도 투명 바닥 에셋 `fx_wild_stamp_lava_v2.png`가 갈라진 흙과 틈의 용암을 표시하고, 영웅보다 뒤 레이어에 놓는다. 기존 `fx_wild_stamp.png`는 딜레이 크러싱 전용으로 남긴다. 타격은 자신 중심 원형 반경 Lv.1 90px, 레벨당 +4px(Lv.10 126px)이며, 균열 그림은 투영된 타격 경계와 같은 크기로 그린다. 지속시간은 Lv.1 0.8초, 레벨당 +0.12초(Lv.10 1.88초)다. 둔화·밀치기 수치는 그대로다.
- **파워 스트라이크**: 사거리 안 가장 가까운 적 한 명만 공격력 ×5.5로 타격한다. 전용 투명 에셋 `fx_power_strike_cleave_v2.png`의 선명한 금빛 검기가 대상 머리 위에서 내려와 닿고, 발밑 충격 링이 퍼진다. 사거리 밖이면 전방 빈 지점에 헛친다.
- **디스트로이 스윙**: 붉은 검기가 시전 시간 초반 약 45%에 전방 끝까지 빠르게 뻗는다. 길이 Lv.1 175px(레벨당 +7px) × 폭 160px 사각형 판정과 붉은 잔상이 같은 속도로 확장된다. 검기가 지나간 적은 각자 한 번씩 공격력 ×2.7의 피해를 받고, 지면 경계도 현재 진행 거리까지만 그린다.
- **궁수 화살**: 시전자·대상의 몸통 중앙 높이(-46px)에서 발사 시점의 목표 지점까지 직선으로 날린다. 비행 중 적을 추적하거나 위로 휘지 않는다. 나무 화살대·붉은 갈색 양쪽 깃·금속 촉을 따로 그려 화살 형태가 보이게 한다.
- **더블 샷**: 좌우 8px 떨어진 발사점에서 두 화살이 동시에 같은 적을 향해 날아가 각각 공격력 ×1.35 피해를 준다.
- **멀티 샷**: Lv.1/4/7/10에 5/7/9/11발로 늘고, 부채꼴 전체 각도는 약 39°→80°로 넓어진다. 모든 화살은 레벨별 전체 사거리까지 뻗어 폭 68px 경로의 적을 관통한다. 한 시전의 여러 화살에 겹쳐 맞은 적은 한 번만 공격력 ×0.95 피해를 받는다.
- **저격 일격**: 목표 몸통에 붉은 원형 십자 조준표를 0.32초 표시한 뒤 붉은 촉의 화살 한 발을 직선 발사한다. 단일 대상 피해는 공격력 ×6.5(스킬 레벨 배율 별도)이며 치명타가 확정된다. 방치 전투도 치명타 피해 배수를 반영한다.
- **폭풍 연사**: 여섯 발을 0.18초 간격으로 실제 한 발씩 생성한다. 매 발사 시 살아 있는 현재 표적을 확인하고, 처치되었으면 사거리 안 다음 적으로 바꾼다. 화살은 발사 후 목표 지점까지 직진한다.
- **애로우 레인**: 화살이 위에서 수직으로 내려와 꽂힌다. 타격 반경은 Lv.1 92px에서 레벨당 +6px(Lv.10 146px), 지속시간은 Lv.1 3.2초에서 레벨당 +0.12초(Lv.10 4.28초)다. 판정·바닥 경계·화살 낙하 분포가 같은 반경을 쓴다.
- **호크아이**: 시전 순간 날개·머리·발톱이 선명한 독수리 원화(`fx_hawkeye_eagle_v1.png`) 한 마리만 몸 위로 떠오른다. 잔상은 없다. 모션 감소 설정에서는 제자리에서 나타났다 사라진다. 버프 중 바람 오라는 유지한다.
- **빙결 화살**: 별도 고해상도 얼음 화살 한 발이 착탄하면 Lv.1 반경 62px에서 레벨당 +2px(Lv.10 80px)까지 얼음 조각과 눈싸라기가 퍼진다. 중심 한 명은 공격력 ×1.9 피해를 받고, 주변 적도 모두 둔화된다. 둔화는 Lv.1 2.4초·이동속도 55%에서 Lv.10 4.02초·이동속도 28%로 성장한다. 화살 길이는 활의 보이는 크기에 맞춘 52px이다.
- **화살 그래픽**: 평타·더블·멀티·관통·폭풍·애로우 레인은 투명 고해상도 `fx_archer_arrow_v1.png`, 빙결은 `fx_ice_arrow_v1.png`를 같은 52px 기본 길이로 쓴다. 저격 58px·관통 55px만 구분하고, 애로우 레인의 화살도 같은 그림을 수직 회전해 위에서 꽂히게 한다.
- **관통 사격**: 목표 방향으로 레벨별 전체 사거리까지 좁은 폭 48px 화살이 날아가며 경로의 적 최대 4명에게 각자 공격력 ×2.6 피해를 준다. 종전 도착점 반경 피해는 쓰지 않는다.
- **파이어 볼트**: Lv.1/3/5/8/10에 1/2/3/4/5발을 띄우고 0.1초 간격으로 일직선 발사한다(속도 720). Lv.10의 5발은 머리 위 **윗줄 3개·아랫줄 2개**로 엇갈리게 놓는다. 투명 고해상도 원형 불꽃 구슬 `fx_mage_fireball_v2.png`를 화면에서 더 작게 그리며 긴 꼬리는 없다. 시전 합계 위력은 공격력 ×1.5(기존 ×2.0에서 하향)로 발수에 나누고, 모든 발은 시전 때 정한 **한 대상만** 타격한다. 대상이 먼저 죽으면 남은 탄은 다른 적을 때리지 않는다. 착탄은 짧은 불티·충격 링을 보여 준다.
- **아이스 볼트**: 투명 고해상도 `fx_mage_ice_orb_v1.png` 얼음 구슬 **한 발**이 시전자 위치에서 발사 방향으로 Lv.1 0.85초→Lv.10 1.84초 동안 전진한다. 적에 닿아도 소멸하지 않고 첫 적에게만 낮은 피해(공격력 ×0.65→×0.83)를 준다. 구슬은 경로 주변 52px 안의 적을 이동속도 60%로 2.2→3.1초 둔화한다. 구슬에서 Lv.1 6개→Lv.10 18개의 고드름이 사방으로 발사되며, 고정 폭발 반경 없이 적중하거나 3초 비행 시간이 끝날 때까지 직진한다. 고드름 적중은 낮은 추가 피해와 같은 둔화를 준다.
- **체인 라이트닝**: 전기 구슬 없이 시전자에서 첫 적까지 끊어지지 않는 번개 줄기가 이어지고, 직전 대상 108px 안의 가장 가까운 미피격 적에게 0.14초 간격으로 전이한다. 앞선 줄기는 전이 중에도 남는다. 첫 대상 포함 Lv.1/5/10에 최대 3/4/5명, 대상당 한 번씩 피해를 주고 다음 전이에는 위력이 0.85배씩 줄어든다.
- **마력 폭발**: 자신 주변에 보랏빛 마력을 응축해 시전 시간 중간에 폭발시킨다. 적에게 피해를 주지 않고 자신에게 최대 체력의 Lv.1 25%→Lv.10 70% 실드 체력을 5초간 부여한다. 실드는 적 공격을 먼저 흡수하며 소진되거나 시간이 끝나면 사라진다.
- **프로스트 노바**: 캐릭터를 따라가는 서리 결계가 주변 적을 한 번 때리고 바깥으로 밀어낸다. 밀린 뒤 0.14초가 지나면 기절이 시작되며 기절 시간은 Lv.1 0.35초→Lv.10 0.80초다. 기절 중에는 적이 이동·공격하지 않고 머리 위에 얼음 표시가 남는다.
- **아케인 실드**: 버프 지속시간 동안 캐릭터를 따라가는 반투명 다면체 보호 결계를 그린다. 발밑 마법진과 링은 그리지 않는다. 기존 공격력·공격속도 버프 판정은 유지한다.
- **메테오 스트라이크**: 운석 `fx_mage_meteor_v1.png`가 화면 왼쪽 위에서 착탄점으로 사선 낙하한다. 시전 시간의 48% 지점에 충돌·타격하며 운석이 짧게 눌리고, 흙먼지 질감 `fx_mage_meteor_dust_v1.png`이 지면에서 퍼진 뒤 불규칙한 충격 파동이 이어진다. 착탄 범위는 Lv.1 반경 110px→Lv.10 반경 164px로 커진다. 위력은 기본 공격력 ×3.6에 레벨 배율을 적용한다.
- **워터 캐논**: 세이브 호환을 위해 내부 ID `arcaneOverlord`는 유지한다. 시전 순간 정한 한 방향으로 굵은 수류를 Lv.1 2.2초→Lv.10 2.74초간 유지한다. 시전자도 발사 자세를 유지하며 수류 시작점은 손끝을 따라간다. 짧은 투명 물결 질감 `fx_mage_water_flow_v1.png`이 시작점에서 점점 굵어지며 연속해서 움직인다. 네모 경계를 만들던 반투명 면과 짧은 직선 포말은 그리지 않는다. 경로 반폭 Lv.1 42px→Lv.10 60px 안의 여러 적에게 0.18초마다 피해를 주며, 한 대상에게 닿는 총 위력은 공격력 ×3.0에 레벨 배율을 적용한다. 참고: https://redstone.client.jp/skill/skilwiz.html
- **스킬 ID 2중 정의**: Functions는 TS를 실행할 수 없으므로 `server/skill-ids.mjs`에 같은 목록이 있다. **스킬을 더하면 두 파일을 함께 고친다.** 이름·순서·ID가 어긋나면 `skillbook-server` 테스트가 실패한다(2026-11-21 정리에서 `hell` 서버 이름을 `회전참격`으로 맞췄다).
- **읽기 목록은 액티브+패시브 전부**: `items.ts` `migrateItem`의 `skillBookReadIds`는 `allSkillIds`(액티브) + `allPassiveIds`(패시브 9종)다. 패시브를 빼면 방치 보상·드롭으로 받은 패시브 스킬북이 세이브를 읽을 때 사라진다(작업 255).
- **레벨 잠금 없음**: `canLearn`은 항상 참. `skills[].level`은 순서 표기용이며 트리 티어와는 무관하다. **최대 스킬 레벨 10**(4단계 스킬 트리).
- **쿨타임·버프**: 지속은 `skillDuration`(warcry 6+0.2·Lv, hawkEye/arcaneShield 7+0.17·Lv)이 단일 기준. 공속·공격 배율은 `berserkSpeedScale`/`berserkAttackScale`.
- **퀵슬롯 3칸**: `normalizeQuickSlots`가 모르는 스킬·직업 불일치를 걸러 낸다. 직업을 바꾸면 퀵슬롯이 그 직업 기준으로 정규화된다.
- **첫 스킬 장착 안내**: 새 캐릭터가 습득한 첫 액티브 스킬을 빈 원에 끼우도록 이끄는 입문 안내는 `docs/TUTORIAL.md`가 단일 기준이다(완료 판정 = `quickSlots`에 스킬이 하나 이상).
- **추천은 초당 딜량**: `skillDps` = 시전 총 계수 × 레벨 배율 / 쿨타임. 1번 원은 버프 고정. 화면 순서·추천이 같은 식을 쓴다.
- **합성**: 재료는 **타 직업·미잠금** 스킬북 5권, 결과는 내 직업 11종 중 1권. 가방 순감 -4칸이라 40칸·서버 검증 안전. `rollSkillBookFor`가 결과를 정하고 드롭 1/33 규칙은 그대로.
- **도감 810칸**: 투구·갑옷·무기가 직업별 3갈래(전사 0~9·궁수 10~19·마법사 20~29) → 기본형 135종 × 6등급 = 810. 서버 발견 상한(`database.mjs`)과 업적 마지막 단계도 810.
- **도감 키**: `부위:번호:등급`. 발견은 등급별이며 `equipmentCollection` 합집합으로 저장된다.
- **도감 화면은 1종 1칸 135칸·5열**(2026-11-21 사용자 확정): `codexEntryStates(save)`가 135종의 모은 등급 Set·최고 등급·보유 수를 한 번에 만든다. 격자는 `repeat(5, minmax(0, 1fr))`이고 810칸 카드는 만들지 않는다.
- **칸 왼쪽 위 등급 배지**: 모은 것 중 **가장 높은 등급** 하나 — 레전드 `L`·유니크 `U`·에픽 `E`·레어 `R`(`codexRarityMarks`). 일반·매직만 모았거나 미발견인 종은 배지가 없고, 칸 테두리는 그 최고 등급 색(`.codex-g-*` 변수)이다. 배지 알약 규격은 가방·거래소의 `.rarity-badge`(PR #305)와 같다.
- **하단 상세 띠**: 칸을 누르면 `.codex-sheet`(sticky bottom)가 열리고 6등급 칩 `일반·매직·레어·에픽·유니크·레전드`를 누르면 그 등급의 등장 시작 층·현재 층 옵션(`codexOptions`)이 나온다. 못 모은 등급도 미리 볼 수 있다.
- **탭 합계는 `codexGroupTotals`**: 전체 135 · 무기 35(무기+문장) · 방어구 90(투구·갑옷 30 + 장갑·허리띠·신발 10) · 장신구 10(목걸이·반지).
- **810 저장은 그대로**: `codexVariantCount` 810·발견 수(`수집률 N / 810`)·업적·서버 상한은 바꾸지 않고, 요약에 `종별 M / 135`만 더한다.

## 스킬 트리 (4단계 티어 · SP)

창은 위에서 아래로 **세 칸**이고, **스크롤은 트리만** 갖는다(`ui/skillTreeView.ts`).

| 칸 | 요소 | 내용 |
|---|---|---|
| 머리글 | `header` | 제목 `스킬 트리` · **`⚡ 추천 장착`**(`.skill-suggest-btn`) · `×` 닫기 |
| ① | `.skill-top-bar` | `SP N`(남은 포인트) · `초기화 (무료)` |
| ② | `.skill-tree` | 티어 4줄(3-3-3-2) + 연결선(SVG) + 노드(아이콘·`N/10`) — 여기만 `overflow-y: auto` |
| ③ | `.skill-detail` | 고른 스킬: 아이콘·이름·`Lv.N / 10`·설명·선행 조건(✓/✕)·현재/다음 수치·`장착`·`SP 1 투자` |

- **머리글 `⚡ 추천 장착`**(스킬 추천 자동 장착 A안): `×` 왼쪽의 금빛 알약 버튼을 누르면 창을 닫지 않고 `autoEquipRecommendedSkills`가 퀵슬롯을 채운다. 대상은 **습득한 액티브** 중 `skillDps` 상위 3개이고, **이미 꽂힌 추천 스킬은 그 원에 그대로** 두며 남은 추천은 **빈 원 → 추천 밖 스킬이 있는 원** 순서로 들어간다. 결과는 `world.onChange()`(저장·HUD·트리 배지 재렌더) 뒤 토스트 `추천 조합 N개 장착 완료 · 2번 원 → 블러드 레이지`로 알린다. 습득이 없거나 추천 조합이 이미 다 꽂혀 있으면(순서가 달라도) 세이브를 건드리지 않고 안내만 한다. 다른 스킬 조작과 같은 잠금 가드(`world.paused`·`market.busy`·`sync.locked`)를 지난다.
- **배치 3-3-3-2**: 1티어 = 액티브1·액티브2·패시브1, 2티어 = 액티브3·액티브4·패시브2, 3티어 = 액티브5·액티브6·패시브3, 4티어(궁극) = 액티브7·액티브8. 배치표는 `skillTree.ts`의 `TIER_PLAN` 한 곳이고, 스킬을 더하면 `skills.ts`의 순서 배열에 한 칸만 더한다(남는 스킬은 4티어 뒤에 붙는다 — 개수를 박지 않는다).
- **선행 조건 = 같은 자리(lane)의 앞 티어**: 2티어는 1티어 Lv.1 + 누적 3pt, 3티어는 2티어 Lv.2 + 누적 12pt, 궁극은 3티어 Lv.3 + 누적 36pt(`TIER_GATE`). 연결선은 `prerequisites`에서 그대로 만들어진다(`skillTreeEdges`).
- **티어 조건 표시**: 트리의 각 2~4티어 왼쪽에 바로 위 스킬의 필요 레벨과 `투자 현재/필요 SP`를 표시한다. 개별 잠금 노드를 누르면 아래 상세의 선행 조건에 스킬 이름과 충족 여부가 나온다. 선택·투자 후 트리를 다시 그릴 때 스크롤은 새 패널을 창에 붙인 뒤 복원하며, 분리된 옛 패널의 늦은 스크롤 이벤트는 무시한다.
- **SP는 레벨에서 파생된다**(`skillPoints.ts`): `level당 3pt`이고 **Lv.1부터 3pt**다(첫 스킬 Lv.1 무료 지급분 1pt는 총량에서 상쇄). 만렙 30 = 90pt, 여기에 `스킬의 서`(영구 SP +1, 최대 30권)를 더할 수 있다 — 11종을 모두 Lv.10으로 올리는 110pt에 모자라 빌드를 고른다. `save.skillPoints`는 그 장부의 사본이고 `parseSave`·투자·초기화·스탯북 사용 뒤에 맞춰진다.
- **투자 1회 = 1랭크**: 미습득이면 Lv.1로 습득, 배웠으면 한 랭크 오른다. 랭크 하나에 SP 1, 최대 Lv.10.
- **초기화는 무료**(테스트 서버 기간): 첫 액티브 1랭크만 남기고 모든 랭크·습득을 되돌려 SP 전액 환급하고, 사라진 스킬은 퀵슬롯에서도 뺀다(`normalizeQuickSlots`). 비용을 붙일 때는 `skillsResetCost`(금화·다이아)에 값만 채운다.
- **현재/다음 수치**는 `skillValueRows` 한 함수가 두 열에 같은 식으로 준다(액티브: 총 위력·사거리 / 버프: 공격 버프%·지속 / 패시브: `items.ts` `totalStats`와 같은 식).
- 보기 상태는 `Interface.skillSelected`·`skillScroll`이고 `modalDefaults`가 창을 닫을 때 되돌린다. 기본 선택은 **장착 중 → 습득 → 첫 노드**.
- **스킬북과의 경계**: 이 창은 스킬북을 보여 주지도 요구하지도 않는다. 스킬은 SP로만 오른다(스킬북 아이템·합성·드랍 정리는 파트 B 담당).

## 금지

- 스킬 ID·이름을 한쪽(`skills.ts` 또는 `skill-ids.mjs`)만 고치기.
- 클라이언트에서 합성 결과·스킬 레벨을 만들어 저장하기.
- 도감 상한(810)을 코드 한 곳만 바꾸기 — 서버·업적·테스트가 같이 움직여야 한다.
- 미리보기 전용 테스트 우편·전용 기능 되살리기(작업 252에서 제거).

## 테스트

전사·궁수·마법사 이펙트를 다듬을 때 `npm run dev` 뒤 `/skill-vfx-studio.html`에서 390×844 미리보기를 연다. 직업별 액티브 8개, Lv.1/5/10, 대상 1/3/8명, 남녀 캐릭터, 전체/낮음 효과 품질을 바꾸면 같은 구도로 자동 반복 재생한다. 원거리 대상은 탄환 비행이 보이도록 떨어뜨리고, 마법사 자기 중심 광역기는 가까이 배치한다. 모바일에서는 선택 도구를 화면 위에 둔다. 수치는 실제 엔진과 렌더러에서 나온다. 이 HTML은 Vite 개발 서버 전용이며 운영 `index.html` 흐름·계정·DB·세이브를 건드리지 않는다.

`node --test tests/skill-areas.test.mjs tests/skill-double-slash.test.mjs tests/skill-whirl-slash.test.mjs tests/skill-feedback.test.mjs tests/range.test.mjs tests/enemy-range-90.test.mjs tests/combat-field-split.test.mjs tests/dungeon-battle.test.mjs`

기존 스킬 트리·도감 검증: `node --test tests/skill-tree.test.mjs tests/skill-progression.test.mjs tests/skillbook-server.test.mjs tests/skillbook-synth.test.mjs tests/loadout.test.mjs tests/skill-auto-loadout.test.mjs tests/skill-ui.test.mjs tests/skill-modal-ui.test.mjs tests/skill-auto-upgrade.test.mjs tests/skillbook-art.test.mjs tests/codex.test.mjs tests/codex-ui.test.mjs tests/achievements.test.mjs`

## 관련 매뉴얼

`docs/INVENTORY_GEAR.md` · `docs/FIELD_OFFLINE.md`(전투 피해·사거리) · `docs/SYNC_SAVE.md` · `docs/QUEST_ATTENDANCE.md` · `docs/SCALE_100.md`(save-guard 상한 표)
