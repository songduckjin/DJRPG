## 요청(사용자 확정)

모아서 한 번에 배포하기로 한 **7가지 통합 개선** + 진행 중 추가 지시 2건(궁수 공격 체격·광폭 버프 밸런스). 작업 번호 216(`docs/TASK.md` 선점).

1. 3직업 기본 평타 원형 아이콘(불꽃 없는 대검 / 활 / 마법탄)
2. 마법사 1번 `파이어 볼트` — 머리 위 화염구 N발, 목표 한 마리로 직선 단일 타격(레벨별 개수·크기)
3. 무기 미장착 시 전 직업 공격 불가 + 장착 안내(4.5초 쿨다운)
4. 신규 가입은 아이디·비밀번호만 → 캐릭터 생성 화면 분리(성별 `남`/`여`)
5. 마법사 사거리 240 / 130
6. 스킬 권장(필요) 레벨 잠금·표기 제거
7. 캐릭터 카드 탭 시 `선택`·`방치`·`삭제` 노출

추가: "궁수는 활 쏠 때 캐릭터가 작아져" · "[#18466] 블러드 레이지·호크아이·아케인 실드 공속·공격력·지속시간 비정상 수치 다듬어서 바로 반영".

## 변경 내용

### 1) 평타 원형 아이콘
- `scripts/build-attack-icons.py` — 승인 원본(`downloads/icon_greatsword/`)에서 **메달리온 원 밖만 투명**(r 620·2.5px 페더)으로 자르고 알파 프리멀티플라이로 축소해 `public/assets/icons/attack_{warrior,archer,mage}.png`(256×256 RGBA, 103/103/122KB)를 굽는다.
- `src/ui/skillArtwork.ts` — `attackIconPath(job)`, `applySkillArtwork(button, kind, job)`, `setSkillIcon(art, kind, job)`. 액션 패드(`hud.ts`)와 스킬 창 기본 공격 카드(`skillModal.ts`)가 같은 함수를 쓰고 글자 `⚔`는 비운다(`.action.has-skill-art strong { opacity: 0 }`).
- `scripts/verify-item-art.mjs` — 평타 아이콘 3장 규격 검사 추가.

### 2) 파이어 볼트
- `world.ts` — `fireBoltCount`(Lv.1~4 1발 → 5레벨마다 +1, 최대 6발)·`fireBoltScale`(1→2.45배)·`fireBoltSpots`(아이소 투영 역변환으로 머리 위 반원). `action('fireBolt')`가 N발을 `shoot({ from: 머리 위 자리, launch: .18+i*.05, size })`로 쏘고 **위력을 N으로 나눠** 합계는 예전 한 발(×2.0) 그대로.
- `render/vfx.ts` — `Effect.launch`/`size` 추가, `drawMagicBolt`가 떠 있는 동안 제자리 맥동 후 남은 시간에만 선형(직선) 비행.

### 3) 무기 미장착
- `world.ts` — `WEAPON_REQUIRED_NOTICE`·`WEAPON_NOTICE_COOLDOWN`(4.5초)·`World.weaponNotice`/`warnWeapon`. `action()`이 `save.equipment.weapon` 없으면 평타·공격 스킬을 막는다. **첫 처치 전(`tutorial === 0`)만 예외** — 시작 무기는 첫 처치의 100% 드랍이라 전면 차단하면 새 캐릭터가 진행 불가가 된다.

### 4) 가입 분리
- `server/endpoints/account.mjs` — `register`가 아이디·비밀번호만 받고 **캐릭터 행 없이** `uncreated: true` 자리표시자 세이브만 만들며 `needsCharacter: true`를 돌려준다. `characters` 목록에서 자리표시자 제외, `load`/`login`에 `needsCharacter`, `createCharacter`가 자리표시자 슬롯을 덮어씀, 자리표시자에 `save`를 보내면 `409 CHARACTER_REQUIRED`. 게스트·기존 로그인·예전 가입 요청(성별·직업 포함) 호환 유지.
- `src/ui/login.ts` — 가입 탭은 아이디·비밀번호만. `needsCharacter`면 패널 안 `characterStep`(닉네임·직업·성별 `남`/`여`)에서 `createCharacter` 후 세션을 갱신해 입장.

### 5) 마법사 사거리
- `mageAttackRange` 240 / `mageStopRange` 130 (궁수 280/150 > 마법사 240/130 > 전사 90).

### 6) 스킬 레벨 제한
- `skills.ts` `canLearn`은 항상 참(스킬북만 있으면 1레벨부터 습득·사용), `skillModal.ts`의 `권장 Lv.N` 문구 제거. 전사 스킬 순서·`skills[].level` 값은 유지.

### 7) 캐릭터 카드 액션
- `charactersModal.ts` — `ui.characterFocus`로 카드를 누르면 그 카드만 펼쳐져 `선택`(접속)·`방치`·`삭제`가 나타나고(다시 누르면 접힘, 팝업을 닫으면 초기화), 빈 슬롯은 누르면 바로 생성 화면. 생성 화면 성별 버튼은 `남`/`여`만. `styles/modals.css` `.character-slot.focused`.

### 추가 1) 궁수 공격 체격
- `render/heroScale.ts` — `archerMaleAttack` 268→**235**, `archerFemaleAttack` 270→**233**. 예전 값은 공격 시트의 불투명 영역(머리 위로 솟은 활대 포함 239~275px)을 잰 값이라 몸통(정수리~발끝 232.75/229px)이 서기(333/331px)보다 13% 작게 그려졌다. 정수리~발끝 실측으로 다시 잡아 서기와 같은 체격이 된다(갑옷 1~9번 공격 시트 230~258px는 한 값으로 그려 ±8%).

### 추가 2) 광폭 버프 3종 밸런스
- `world.ts` — `berserkSpeedScale(level)=min(1.5, 1.2+(level-1)*.01)`(Lv.1 +20%·레벨당 +1%·상한 1.5배), `berserkAttackScale(level)=1.2+(level-1)*.015`(Lv.30 +63.5%). 예전 `1.5+(level-1)*.08`은 Lv.30이 3.82배였다.
- `render/heroMotion.ts` — `costumePlaybackRate`의 rage 식을 같은 공속 식으로 맞춤(쿨다운 × 재생 배율 = 기본 쿨다운).
- `skills.ts` — `skillDuration`: `warcry` 6+(level-1)*.2(Lv.30 11.8초 < 쿨 14), `hawkEye`·`arcaneShield` 7+(level-1)*.17(Lv.30 11.93초 < 쿨 16) → 어떤 레벨에서도 무한 유지 없음. `power`/`description` 문구도 새 수치로.
- `skillModal.ts` — 버프 성장 문구 `+20% + 레벨당 +1.5%`.

## 검증

- `npx tsc --noEmit` 통과, `npx vite build` 통과.
- 전체 `node --test tests/*.test.mjs` **736건 중 731 통과** — 실패 5건은 전부 `origin/main`(33a2505)에서도 같은 기존 실패: 코스튬 v3 매니페스트·아틀라스 2건 + `costume-field-render` drawHero 2건(이 체크아웃이 sparse라 `public/assets/costume/v3` blob을 받지 못하는 환경 요인 포함), 월드보스 패배 연출 1건.
- 신규 테스트: `attack-icon`(256² RGBA·모서리 투명·3장 상이·경로), `fire-bolt`(개수·크기·머리 위 반원 대칭·N발 단일 목표·합계 피해·대상 처치 후 정리), `weapon-required`(세 직업 평타/스킬 차단·4.5초 쿨다운·자동 사냥 도배 없음·튜토리얼 0 예외), `register-flow`(캐릭터 0개·목록/load·409 CHARACTER_REQUIRED·생성 덮어쓰기·게스트/구형 요청·입력 검증), `character-card-actions`(접힘/펼침·세 버튼·빈 슬롯 생성 이동·`남`/`여`), `archer-attack-scale`(실측 정수리~발끝·서기 대비 ±3%·예전 대비 12~18% 확대), `buff-balance`(배율·지속·쿨다운 역수).
- 갱신: `world-movement`·`archer`·`crushing`·`skill-feedback`·`skill-ui`·`modal-ui`·`costume-field-render`, 서버 테스트(`characters`·`functions-adapter`·`dungeon-verify`·`dungeon-seed`·`dungeon-ranking`·`world-boss-live`·`world-boss-field`·`concurrency`) — 가입 후 캐릭터 생성과 `tests/helpers/armed.mjs`(전투 세이브에 무기) 반영.
- `node scripts/verify-item-art.mjs`는 평타 아이콘 3장 검사를 추가했으나 이 체크아웃에서는 `costume/v3` 자산 부재로 끝까지 돌지 못한다(같은 환경 요인).
