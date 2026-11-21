# SKILLS_CODEX — 스킬 · 스킬북 · 합성 · 장비 도감

> **책임**: 액티브/패시브 스킬 정의·해금·쿨타임·버프, 퀵슬롯 추천, 스킬북 드롭·사용·합성(타직업 5권 → 내 직업 1권), 장비 도감(저장 810칸 · 화면 135칸). 아이템 스탯·가방은 `docs/INVENTORY_GEAR.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 스킬·패시브 정의, 직업별 순서·레벨 | `src/game/skills.ts` (`jobs`·`skillOrderFor`·`passiveOrderFor`·`skillDuration`·`canLearn`) |
| 퀵슬롯·추천 장착·DPS | `src/game/loadout.ts` (`normalizeQuickSlots`·`recommendedSkillOrder`·`autoEquipRecommendedSkills`·`skillDps`) |
| 스킬 레벨·스킬북 비용 | `src/game/skillProgress.ts`·`src/game/store.ts`(`useSkillBook`·`skillLevel`) |
| 스킬북 합성 | `src/game/skillSynth.ts`(`SYNTH_BOOK_COST`=5·`synthMaterials`·`synthCapacity`·`synthesizeSkillBooks`) |
| 합성 UI·연출 | `src/ui/modals/synthModal.ts`·`src/styles/modals.css`(`.synth-*`) |
| 스킬 화면·퀵슬롯 UI | `src/ui/modals/skillModal.ts`(2열 타일·하단 액션 바)·`src/ui/skillLoadout.ts`·`src/ui/skillFeedback.ts`·`src/ui/skillArtwork.ts`·`src/ui/skillBooks.ts`(`skillUpgradeInfo`·`upgradeSkill`) |
| 서버 스킬북 ID 단일 목록 | `server/skill-ids.mjs`(33종) — `tests/skillbook-server.test.mjs`가 `skills.ts`와 대조 |
| 도감 | `src/game/codex.ts`(`codexEntryStates`·`filterCodexEntryStates`·`codexGroupTotals`)·`src/ui/modals/codexModal.ts`·`src/styles/codex.css` |

## 불변 규칙

- **직업 3종**: 전사·궁수·마법사. 직업별 액티브 8 + 패시브 3 = 11종, 전체 스킬북 33종.
- **스킬 ID 2중 정의**: Functions는 TS를 실행할 수 없으므로 `server/skill-ids.mjs`에 같은 목록이 있다. **스킬을 더하면 두 파일을 함께 고친다.** 이름·순서·ID가 어긋나면 `skillbook-server` 테스트가 실패한다(2026-11-21 정리에서 `hell` 서버 이름을 `회전참격`으로 맞췄다).
- **읽기 목록은 액티브+패시브 전부**: `items.ts` `migrateItem`의 `skillBookReadIds`는 `allSkillIds`(액티브) + `allPassiveIds`(패시브 9종)다. 패시브를 빼면 방치 보상·드롭으로 받은 패시브 스킬북이 세이브를 읽을 때 사라진다(작업 255).
- **레벨 잠금 없음**: `canLearn`은 항상 참 — 스킬북만 있으면 1레벨부터 습득·사용. `skills[].level`은 순서 표기용. 최대 스킬 레벨 30.
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

## 스킬 창 구조 (작업 266 B안)

창은 위에서 아래로 네 칸이고 **스크롤은 목록만** 갖는다.

| 칸 | 요소 | 내용 |
|---|---|---|
| ① | `header` | `스킬` · 닫기 |
| ② | `.skill-top-bar` | `추천 자동 장착` · `자동 강화` · `전체/액티브/패시브` 탭 |
| ③ | `.skill-list` | 패시브 그리드 → 액티브 그리드(기본 공격 + 8종) → 스킬북 (여기만 `overflow-y: auto`) |
| ④ | `.skill-action-bar` | 고른 타일 하나: 아이콘·이름·`Lv.N` + `[장착·강화·정보]` / 패시브 `[강화·정보]` / 기본 공격 `[고정·강화·정보]` |

- **타일에는 아이콘·이름·`Lv.N`·상태 칩만** 둔다(`.skill-tile-grid` 2열). 긴 설명·능력치·카드별 강화 버튼은 타일에서 뺐고, 설명은 액션 바의 `정보`가 펼친다(`쿨 N초 · 지속 N초 · 범위 N · 위력 +N%`, 패시브는 `영구 적용 · …`).
- 상태 칩은 `skillChips(save, id)` 한 곳이 정한다: `장착중`(퀵슬롯) · `강화!`(`skillBookStatus().ready`) · `고정`(기본 공격) · `미습득`. 미습득은 `Lv.N` 자리가 이미 `미습득`이라 칩을 겹치지 않는다.
- **강화 판정은 한 벌**: `skillBooks.ts`의 `skillUpgradeInfo(ui, id)`(문구·잠금·권수)와 `upgradeSkill(ui, id)`(가드·체력 보정·저장 호출)를 스킬북 칸과 액션 바가 함께 쓴다. 새 화면에서 강화 버튼을 만들 때 `skillBookStatus`를 다시 해석하지 않는다.
- 보기 상태는 `Interface.skillSelected`(스킬 ID 또는 기본 공격 `'attack'`)·`skillInfoOpen`·`skillScroll`이고 `modalDefaults`가 창을 닫을 때 되돌린다. 기본 선택은 **장착 중 → 습득 → 기본 공격**, 탭을 바꿔 고른 타일이 사라지면 그 탭의 같은 규칙으로 옮긴다.
- 다시 그려도(타일 선택·정보 토글·강화) 목록 스크롤 자리를 지키려고 `ui.skillScroll`에 남긴다. 새로 그릴 때 이 값을 되돌려 놓는다.

## 금지

- 스킬 ID·이름을 한쪽(`skills.ts` 또는 `skill-ids.mjs`)만 고치기.
- 클라이언트에서 합성 결과·스킬 레벨을 만들어 저장하기.
- 도감 상한(810)을 코드 한 곳만 바꾸기 — 서버·업적·테스트가 같이 움직여야 한다.
- 미리보기 전용 테스트 우편·전용 기능 되살리기(작업 252에서 제거).

## 테스트

`node --test tests/skill-progression.test.mjs tests/skillbook-server.test.mjs tests/skillbook-synth.test.mjs tests/loadout.test.mjs tests/skill-auto-loadout.test.mjs tests/skill-ui.test.mjs tests/skill-modal-ui.test.mjs tests/skill-auto-upgrade.test.mjs tests/skill-feedback.test.mjs tests/skillbook-art.test.mjs tests/codex.test.mjs tests/codex-ui.test.mjs tests/achievements.test.mjs`

## 관련 매뉴얼

`docs/INVENTORY_GEAR.md` · `docs/FIELD_OFFLINE.md`(전투 피해·사거리) · `docs/SYNC_SAVE.md` · `docs/QUEST_ATTENDANCE.md`
