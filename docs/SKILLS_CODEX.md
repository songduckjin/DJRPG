# SKILLS_CODEX — 스킬 · 스킬북 · 합성 · 장비 도감

> **책임**: 액티브/패시브 스킬 정의·해금·쿨타임·버프, 퀵슬롯 추천, 스킬북 드롭·사용·합성(타직업 5권 → 내 직업 1권), 장비 도감(810칸). 아이템 스탯·가방은 `docs/INVENTORY_GEAR.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 스킬·패시브 정의, 직업별 순서·레벨 | `src/game/skills.ts` (`jobs`·`skillOrderFor`·`passiveOrderFor`·`skillDuration`·`canLearn`) |
| 퀵슬롯·추천 장착·DPS | `src/game/loadout.ts` (`normalizeQuickSlots`·`recommendedSkillOrder`·`autoEquipRecommendedSkills`·`skillDps`) |
| 스킬 레벨·스킬북 비용 | `src/game/skillProgress.ts`·`src/game/store.ts`(`useSkillBook`·`skillLevel`) |
| 스킬북 합성 | `src/game/skillSynth.ts`(`SYNTH_BOOK_COST`=5·`synthMaterials`·`synthCapacity`·`synthesizeSkillBooks`) |
| 합성 UI·연출 | `src/ui/modals/synthModal.ts`·`src/styles/modals.css`(`.synth-*`) |
| 스킬 화면·퀵슬롯 UI | `src/ui/modals/skillModal.ts`·`src/ui/skillLoadout.ts`·`src/ui/skillFeedback.ts`·`src/ui/skillArtwork.ts` |
| 서버 스킬북 ID 단일 목록 | `server/skill-ids.mjs`(33종) — `tests/skillbook-server.test.mjs`가 `skills.ts`와 대조 |
| 도감 | `src/game/codex.ts`·`src/ui/modals/codexModal.ts`·`src/styles/codex.css` |

## 불변 규칙

- **직업 3종**: 전사·궁수·마법사. 직업별 액티브 8 + 패시브 3 = 11종, 전체 스킬북 33종.
- **스킬 ID 2중 정의**: Functions는 TS를 실행할 수 없으므로 `server/skill-ids.mjs`에 같은 목록이 있다. **스킬을 더하면 두 파일을 함께 고친다.** 이름·순서·ID가 어긋나면 `skillbook-server` 테스트가 실패한다.
- **레벨 잠금 없음**: `canLearn`은 항상 참 — 스킬북만 있으면 1레벨부터 습득·사용. `skills[].level`은 순서 표기용. 최대 스킬 레벨 30.
- **쿨타임·버프**: 지속은 `skillDuration`(warcry 6+0.2·Lv, hawkEye/arcaneShield 7+0.17·Lv)이 단일 기준. 공속·공격 배율은 `berserkSpeedScale`/`berserkAttackScale`.
- **퀵슬롯 3칸**: `normalizeQuickSlots`가 모르는 스킬·직업 불일치를 걸러 낸다. 직업을 바꾸면 퀵슬롯이 그 직업 기준으로 정규화된다.
- **추천은 초당 딜량**: `skillDps` = 시전 총 계수 × 레벨 배율 / 쿨타임. 1번 원은 버프 고정. 화면 순서·추천이 같은 식을 쓴다.
- **합성**: 재료는 **타 직업·미잠금** 스킬북 5권, 결과는 내 직업 11종 중 1권. 가방 순감 -4칸이라 40칸·서버 검증 안전. `rollSkillBookFor`가 결과를 정하고 드롭 1/33 규칙은 그대로.
- **도감 810칸**: 투구·갑옷·무기가 직업별 3갈래(전사 0~9·궁수 10~19·마법사 20~29) → 기본형 135종 × 6등급 = 810. 서버 발견 상한(`database.mjs`)과 업적 마지막 단계도 810.
- **도감 키**: `부위:번호:등급`. 발견은 등급별이며 `equipmentCollection` 합집합으로 저장된다.

## 금지

- 스킬 ID·이름을 한쪽(`skills.ts` 또는 `skill-ids.mjs`)만 고치기.
- 클라이언트에서 합성 결과·스킬 레벨을 만들어 저장하기.
- 도감 상한(810)을 코드 한 곳만 바꾸기 — 서버·업적·테스트가 같이 움직여야 한다.
- 미리보기 전용 테스트 우편·전용 기능 되살리기(작업 252에서 제거).

## 테스트

`node --test tests/skill-progression.test.mjs tests/skillbook-server.test.mjs tests/skillbook-synth.test.mjs tests/loadout.test.mjs tests/skill-auto-loadout.test.mjs tests/skill-ui.test.mjs tests/skill-feedback.test.mjs tests/skillbook-art.test.mjs tests/codex.test.mjs tests/achievements.test.mjs`

## 관련 매뉴얼

`docs/INVENTORY_GEAR.md` · `docs/FIELD_OFFLINE.md`(전투 피해·사거리) · `docs/SYNC_SAVE.md` · `docs/QUEST_ATTENDANCE.md`
