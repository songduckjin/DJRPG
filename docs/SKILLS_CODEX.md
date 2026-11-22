# SKILLS_CODEX — 스킬 · 스킬북 · 합성 · 장비 도감

> **책임**: 액티브/패시브 스킬 정의·해금·쿨타임·버프, 퀵슬롯 추천, 스킬북 드롭·사용·합성(타직업 5권 → 내 직업 1권), 장비 도감(저장 810칸 · 화면 135칸). 아이템 스탯·가방은 `docs/INVENTORY_GEAR.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| **스킬 트리 데이터·판정·투자/초기화** | `src/game/skillTree.ts`(`skillTreeFor`·`buildSkillTree`·`skillNodeStatus`·`investSkillPoint`·`resetSkillTree`·`skillValueRows`·`TIER_SHAPE`·`TIER_GATE`) |
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
| ① | `.skill-top-bar` | `SP N`(남은 포인트) · `초기화 (무료)` |
| ② | `.skill-tree` | 티어 4줄(3-3-3-2) + 연결선(SVG) + 노드(아이콘·`N/10`) — 여기만 `overflow-y: auto` |
| ③ | `.skill-detail` | 고른 스킬: 아이콘·이름·`Lv.N / 10`·설명·선행 조건(✓/✕)·현재/다음 수치·`장착`·`SP 1 투자` |

- **배치 3-3-3-2**: 1티어 = 액티브1·액티브2·패시브1, 2티어 = 액티브3·액티브4·패시브2, 3티어 = 액티브5·액티브6·패시브3, 4티어(궁극) = 액티브7·액티브8. 배치표는 `skillTree.ts`의 `TIER_PLAN` 한 곳이고, 스킬을 더하면 `skills.ts`의 순서 배열에 한 칸만 더한다(남는 스킬은 4티어 뒤에 붙는다 — 개수를 박지 않는다).
- **선행 조건 = 같은 자리(lane)의 앞 티어**: 2티어는 1티어 Lv.1 + 누적 3pt, 3티어는 2티어 Lv.2 + 누적 12pt, 궁극은 3티어 Lv.3 + 누적 36pt(`TIER_GATE`). 연결선은 `prerequisites`에서 그대로 만들어진다(`skillTreeEdges`).
- **SP는 레벨에서 파생된다**(`skillPoints.ts`): `level당 3pt`, Lv.1은 0(첫 스킬 Lv.1 무료 지급분 1pt를 상쇄). 만렙 30의 총량 88pt, 11종을 모두 Lv.10으로 올리는 110pt에 모자라 빌드를 고른다. `save.skillPoints`는 그 장부의 사본이고 `parseSave`·투자·초기화·스킬북 사용 뒤에 맞춰진다.
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

`node --test tests/skill-tree.test.mjs tests/skill-progression.test.mjs tests/skillbook-server.test.mjs tests/skillbook-synth.test.mjs tests/loadout.test.mjs tests/skill-auto-loadout.test.mjs tests/skill-ui.test.mjs tests/skill-modal-ui.test.mjs tests/skill-auto-upgrade.test.mjs tests/skill-feedback.test.mjs tests/skillbook-art.test.mjs tests/codex.test.mjs tests/codex-ui.test.mjs tests/achievements.test.mjs`

## 관련 매뉴얼

`docs/INVENTORY_GEAR.md` · `docs/FIELD_OFFLINE.md`(전투 피해·사거리) · `docs/SYNC_SAVE.md` · `docs/QUEST_ATTENDANCE.md` · `docs/SCALE_100.md`(save-guard 상한 표)
