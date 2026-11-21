# AUTH_CHARACTER — 계정 · 로그인 · 캐릭터 슬롯/전환 · 점검 모드

> **책임**: 가입·로그인·게스트·세션(단일 기기), 캐릭터 슬롯 3~9·생성/선택/삭제·전환 가드의 화면 쪽 절반, 계정 탈퇴, 배포 점검 모드. 저장·충돌은 `docs/SYNC_SAVE.md`, 결제 권한은 `docs/SHOP_ECONOMY.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 로그인·가입·게스트 화면 | `src/ui/login.ts`(`openLogin`·`accountRequest`·`characterStep`·`clearToken`) |
| 계정·캐릭터 API | `server/endpoints/account.mjs`(`register`·`guest`·`login`·`characters`·`selectCharacter`·`createCharacter`·`deleteCharacter`·`deleteAccount`·`save`) |
| 토큰·비밀번호 | `server/auth.mjs`(`tokenFor`·`tokenPayload`·`deriveScrypt`)·`server/scrypt-js.mjs`·`server/legacy-auth.mjs` |
| 단일 세션 | `server/database.mjs`(`assignSession`·`assertSession`·`assertSessionId`) |
| 계정 탈퇴 | `server/account-delete.mjs`·`src/ui/modals/accountDelete.ts` |
| 캐릭터 화면 | `src/ui/modals/charactersModal.ts`(선택·생성·삭제 확인 모달·방치·슬롯 추가) |
| 점검 모드 | `src/game/maintenance.ts`·`src/ui/maintenance.ts`·`public/maintenance.json`·`server/maintenance.mjs`·`public/_headers` |
| 시즌 초기화 | `server/season.mjs`·`server/save-seed.mjs` |

## 불변 규칙

- **단일 세션**: 로그인·가입·게스트 성공마다 `assignSession`이 `session_id`를 새 `sid`로 덮는다. 다른 기기 토큰은 모든 엔드포인트에서 `401 SESSION_REPLACED`. `session_id`는 클라이언트에 내려보내지 않는다.
- **토큰**: HMAC(`TURSO_AUTH_TOKEN` 서명 키) `{id,sid,exp}`. 클라 저장은 `localStorage djrpg.auth.token` 하나뿐. 모든 요청에 `Authorization` + `X-App-Version`.
- **가입 흐름**: 가입은 아이디·비밀번호만 → `needsCharacter:true` → 로그인 화면 안 `characterStep`(닉네임·직업·성별) → `createCharacter` → 세션 갱신. 자리표시자 세이브에 `save`를 보내면 `409 CHARACTER_REQUIRED`. 게스트는 1번 캐릭터를 바로 만든다.
- **슬롯**: 기본 3, 구매로 최대 8(`SLOT_LOCKED`). 판매 상한은 `server/endpoints/shop.mjs` `maxSlots=8`이고, 이미 9칸을 산 계정의 기존 캐릭터는 그대로 둔다(`account.mjs`의 절대 상한 9는 유지 — 슬롯 9 선택·삭제가 계속 된다). 캐릭터 삭제는 현재 캐릭터 제외·이름 확인 뒤 소유권을 `consumed`로 전환한다. 삭제 확인은 **게임 모달**(iOS 시스템 `prompt`/`confirm` 금지).
- **성별·직업 변경 없음**: 캐릭터 생성 뒤 성별·직업은 바꾸지 않는다(계정 화면은 읽기 전용).
- **탈퇴**: 세션 + 비밀번호 재확인 + 아이디 확인. `djrpg_accounts` 행을 맨 마지막에 지워 같은 아이디로 즉시 재가입할 수 있게 한다. 판매 중 매물이 있으면 `MARKET_PENDING`으로 막는다.
- **시즌 초기화는 운영 호스트에서만**: `seasonArmed`가 `djrpg.pages.dev`(또는 `DJRPG_PRODUCTION_HOSTS`)일 때만 돈다. **미리보기 호스트에서 돌리면 같은 Turso DB의 운영 진행이 지워진다.**
- **점검 모드**: `public/maintenance.json` 하나가 스위치(`active`·`eta`·`message`, 기본 `false`). 점검 중에는 접속 중 플레이어를 저장 후 로그인 화면으로 돌려 `점검 진행 중입니다` + 예상 시간을 띄우고 로그인·게스트를 막는다. `eta` 없는 점검은 열지 않는다. 배포는 **점검 ON → 배포 → 전수 정상화 확인 → 점검 OFF** 순서만.

## 금지

- 사용자 선택 없이 세이브 형식·`characters` 응답에 세이브 본문 넣기.
- 캐릭터 전환에서 `sync.trading` 가드(`beginSwitch`/`endSwitch`) 우회 — 거래 중 전환은 `CHARACTER_CONFLICT`를 만든다(`docs/MARKET.md`).
- `window.prompt()`/`window.confirm()` 되살리기.
- 점검을 코드·환경변수만으로 끄기(파일이 기준, 서버 플래그 `DJRPG_MAINTENANCE`는 보조).

## 테스트

`node --test tests/characters.test.mjs tests/character-switch.test.mjs tests/register-flow.test.mjs tests/character-card-actions.test.mjs tests/account-delete.test.mjs tests/legacy-login.test.mjs tests/season-reset.test.mjs tests/maintenance-policy.test.mjs tests/login-maintenance.test.mjs tests/functions-adapter.test.mjs`

## 관련 매뉴얼

`docs/SYNC_SAVE.md` · `docs/SHOP_ECONOMY.md` · `docs/MARKET.md` · `docs/TURSO_DB_GUIDE.md`
