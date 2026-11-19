# Turso DB 분리 이관 가이드 (DJRPG 전용 DB)

> 대상: `songduckjin/DJRPG` 운영자(PC Windows PowerShell 기준)
> 스크립트: `scripts/migrate-turso-db.mjs` · 테스트: `tests/migrate-turso-db.test.mjs`
> 원칙: **코드는 바꾸지 않는다.** DB만 새로 만들고, `djrpg_*` 14개 테이블을 복사한 뒤 Cloudflare Pages 환경변수 두 개를 바꾼다.

## 0. 왜 나누는가

지금 DJRPG와 퍼즐 메이츠는 Turso DB **하나(`djsong/puzzle-mates`)** 를 같이 쓴다. 한쪽에서 락·연결·한도 문제가 생기면 다른 쪽도 같이 멈춘다(2026-11-19 장애). 어느 게임의 부하·장애도 다른 게임에 번지지 않게 DB를 갈라 놓는다.

```
[지금]  DJRPG(Cloudflare djrpg) ┐
                               ├─→ Turso: djsong/puzzle-mates  (users…, djrpg_* 14개)
        퍼즐 메이츠(Vercel)     ┘

[이후]  DJRPG(Cloudflare djrpg) ──→ Turso: djrpg               (djrpg_* 14개만)
        퍼즐 메이츠(Vercel)     ──→ Turso: djsong/puzzle-mates  (그대로, 무변경)
```

- 옮기는 테이블은 **14개**다: `djrpg_accounts`, `djrpg_journey`, `djrpg_save_requests`, `djrpg_save_versions`, `djrpg_market`, `djrpg_market_inbox`, `djrpg_item_owners`, `djrpg_market_events`, `djrpg_market_requests`, `djrpg_account_profiles`, `djrpg_characters`, `djrpg_character_item_owners`, `djrpg_warehouse`, `djrpg_warehouse_requests`.
- 퍼즐 메이츠 테이블(`users` 등)은 **읽지도 쓰지도 않는다**. 스크립트는 소스 DB에 `SELECT`만 보낸다.
- 테이블 구조는 새 DB에서 앱 코드의 `server/database.mjs` `schema()`가 그대로 만든다. 손으로 DDL을 쓰지 않는다.

## 0-1. 먼저 알아 둘 부작용 (이관하면 반드시 생기는 일)

1. **모든 로그인 세션이 풀린다.** `TURSO_AUTH_TOKEN`은 DB 토큰이면서 동시에 세션 토큰(HMAC) 서명 키다(`server/auth.mjs` `sign`). 새 DB 토큰으로 바꾸면 예전 토큰은 전부 검증 실패(401 `INVALID_TOKEN`)가 되어 **전원 재로그인**이다.
2. **게스트 계정은 되돌아올 수 없다.** 게스트는 비밀번호가 없어서 토큰만으로 접속한다. 위 이유로 토큰이 무효가 되면 그 계정의 세이브는 DB에 남아 있어도 다시 들어갈 방법이 없다. 이관 전에 `--dry-run`이 **게스트 계정 수**를 알려 준다. 게스트가 의미 있는 수라면 이관 전에 공지하거나, 계정 전환(별도 작업) 후에 이관한다.
3. **복사 시점과 환경변수 교체 시점 사이의 저장은 사라진다.** 그 사이에 들어온 자동 저장은 새 DB에 없다. 그래서 **복사 → 교체 → 재배포를 몇 분 안에 끝내고**, 새벽처럼 접속이 적은 시간에 한다.
4. **환경변수를 바꾼 뒤에 `--force`로 다시 복사하지 말 것.** 새 DB에 이미 쌓인 신규 저장을 지우고 예전 데이터로 되돌린다.

## 1단계 — 새 Turso DB 만들고 URL·토큰 받기

기존 DB가 `libsql://…` URL을 쓰므로 **새 DB도 libSQL로 만든다**(`--tursodb`를 붙이지 않는다).

### 대시보드로 (권장)

1. https://app.turso.tech 로그인 → **Create Database**
2. 이름 `djrpg`, 위치는 기존 DB와 같은 리전(한국 사용자면 가장 가까운 리전) → 생성
3. 생성된 DB 화면에서 **Database URL**(`libsql://djrpg-<org>.turso.io`) 복사
4. **Tokens → Create Token** → 권한은 읽기·쓰기(기본값), 만료는 `Never` 또는 넉넉하게 → 토큰 문자열 복사
   - 토큰은 **한 번만 보인다.** 바로 Cloudflare에 넣을 곳에 붙여 두고, 채팅·이슈·커밋·로그에는 남기지 않는다.

### CLI로

```bash
turso auth login
turso db create djrpg            # libSQL DB
turso db show djrpg --url        # libsql://...
turso db tokens create djrpg     # 토큰 출력
```

> CLI 버전에 따라 명령이 다를 수 있다. 다르면 `turso db --help`로 확인하거나 대시보드를 쓴다.

### 이관 전 백업 (권장, 5분)

공용 DB 전체를 로컬 SQLite 파일로 떠 둔다(스크립트가 stdin으로 `{url,authToken}` JSON을 받는다).

```powershell
'{"url":"libsql://<기존공용DB>","authToken":"<기존토큰>"}' | node scripts/backup-turso.mjs
# → .backups\djrpg-<시각>-<uuid>.sqlite  (경로·바이트·행 수 출력)
```

## 2단계 — PC에서 이관 (PowerShell)

DJRPG 저장소 루트에서 실행한다. Node 20 이상.

```powershell
# 2-1. 이관할 행 수만 확인 (아무 것도 쓰지 않음)
$env:SOURCE_TURSO_DATABASE_URL="libsql://<기존공용DB>"
$env:SOURCE_TURSO_AUTH_TOKEN="<기존토큰>"
node scripts/migrate-turso-db.mjs --dry-run
```

출력 예시(아래는 로컬 테스트 DB 예시. 실제 운영은 행 수가 다르다):

```
소스 DB: libsql://...
[소스 djrpg_* 테이블 행 수]
  djrpg_accounts                            1
  …
  djrpg_market_events                       3
  합계                                      4

게스트 계정: 0개 (게스트는 토큰이 없으면 다시 로그인할 수 없습니다)
--dry-run: 소스만 읽었고 아무 것도 쓰지 않았습니다.
```

- `djrpg_* 테이블이 없습니다` 로 실패하면 URL/토큰이 다른 DB를 가리키고 있다. 공용 DB인지 다시 확인한다.
- **게스트 계정 수를 확인**한다(0-1의 2번).

```powershell
# 2-2. 실제 이관
$env:TARGET_TURSO_DATABASE_URL="libsql://djrpg-<org>.turso.io"
$env:TARGET_TURSO_AUTH_TOKEN="<새DB토큰>"
node scripts/migrate-turso-db.mjs
```

- 새 DB에 앱 스키마(`schema()`)를 먼저 만들고, 14개 테이블을 500행씩(옵션 `--chunk-size=N`, 최대 5000) 복사한다.
- `djrpg_market_events`의 `AUTOINCREMENT` 시퀀스도 소스 값 이상으로 맞춘다(seq 재사용 없음).
- 시작할 때 타겟에 행이 하나라도 있으면 **중단**한다. 정말 덮어쓰려면 `--force`(타겟의 14개 테이블을 비우고 다시 복사).
- 끝나면 테이블별 `COUNT(*)`를 소스/타겟에서 비교해 전부 `OK`여야 성공이다. 하나라도 다르면 종료 코드 1로 실패한다.

```
[검증] COUNT(*) 소스 / 타겟
  OK   djrpg_accounts                          1 /          1
  …
이관 완료: 14개 테이블, 4행, 0.0초
```

실패했을 때: 타겟이 새 빈 DB라면 그대로 다시 실행하면 된다. 일부만 복사된 상태면 `--force`로 한 번 더 돌린다(이때는 아직 서비스가 새 DB를 보고 있지 않아야 한다).

## 3단계 — Cloudflare Pages 환경변수 교체 + 재배포

1. Cloudflare 대시보드 → **Workers & Pages** → **djrpg** → **Settings → Environment variables** (Production)
2. 두 값을 바꾼다. 이름은 그대로, 값만 새 DB 것으로:
   - `TURSO_DATABASE_URL` = `libsql://djrpg-<org>.turso.io`
   - `TURSO_AUTH_TOKEN` = 새 DB 토큰
3. **저장만 하면 반영되지 않는다.** Pages는 환경변수를 배포본에 묶어 두므로 **Deployments → 최신 배포 → `Retry deployment`** 로 재배포해야 새 값이 적용된다.
4. 재배포가 끝나기 전까지는 예전 배포본이 예전 DB를 계속 본다(그 사이 저장은 0-1의 3번대로 새 DB에 없다).

## 4단계 — 운영 검증

교체 직후 5분 안에 아래를 확인한다.

| 확인 | 방법 | 정상 |
|---|---|---|
| 배포본이 새 빌드인가 | `https://djrpg.pages.dev/version.json` | `version` 값이 방금 배포와 같음(캐시 없음: `no-store`) |
| DB가 새것을 보는가 | 새 계정으로 게스트 로그인 → 세이브 | 오류 없이 진입, 새 DB `djrpg_accounts`에 행이 생김 |
| 기존 계정 | 아이디/비밀번호 로그인 | 401이 아니라 정상 로그인(세이브 유지) |
| 거래소 | 목록 열기·등록 1건 | 목록에 기존 매물이 보이고 등록 성공 |
| 공용 DB 무변경 | 기존 DB의 `djrpg_accounts` 최신 `updated_at` | 교체 시점 이후로 늘지 않음 |
| 퍼즐 메이츠 | 게임 접속·저장 | 정상(공용 DB 그대로) |

`503 DB_NOT_CONFIGURED` → 환경변수 이름 오타 또는 재배포 누락. `401 INVALID_TOKEN`이 전원에게 → 정상(토큰 키가 바뀌어 세션이 만료된 것), 재로그인 안내.

### 롤백

문제가 생기면 **환경변수 두 개를 예전 값으로 되돌리고 다시 `Retry deployment`** 한다. 코드·DB는 그대로라 즉시 원복된다.
단, 교체 후 새 DB에 쌓인 저장은 롤백하면 보이지 않는다(지워지지는 않는다). 롤백은 **교체 직후 몇 분 안에만** 판단한다.

## 5단계 — 안정화 후 공용 DB의 옛 `djrpg_*` 정리

바로 지우지 않는다. 최소 며칠(권장 1주) 새 DB로 정상 운영을 확인한 뒤에 한다.

- 그 전에 공용 DB 전체 덤프를 한 번 더 떠 둔다(1단계 백업 명령).
- 공용 DB를 쓰는 퍼즐 메이츠 코드는 `djrpg_*`를 전혀 참조하지 않으므로, 정리해도 퍼즐 메이츠에는 영향이 없다. 반대로 **DJRPG의 옛 데이터는 되돌릴 수 없으니** 백업 파일이 있는지 먼저 확인한다.
- 권장 순서: `ALTER TABLE djrpg_accounts RENAME TO old_djrpg_accounts;` 처럼 **이름만 바꿔** 두고(Turso는 트랜잭션·시점 복원이 되지만 실수 방지가 먼저다) → 한 달 뒤 `DROP`.
- 정리 후에는 예전 배포본으로 롤백하지 않는다(테이블이 없어 503/오류가 난다).

## 스크립트 사양 요약

| 항목 | 내용 |
|---|---|
| 입력 | `SOURCE_TURSO_DATABASE_URL`(필수), `SOURCE_TURSO_AUTH_TOKEN`(원격이면 필수, `file:`이면 생략), `TARGET_TURSO_DATABASE_URL`, `TARGET_TURSO_AUTH_TOKEN` |
| 옵션 | `--dry-run`(행 수만), `--force`(타겟 비우고 다시), `--chunk-size=N`(기본 500), `--help` |
| 소스 | 읽기 전용 트랜잭션(`transaction('read')`)으로만 조회. 쓰기 SQL 없음 |
| 타겟 | `schema()`로 테이블·인덱스 생성 → 비어 있음 확인 → rowid 오름차순 청크 복사 → `sqlite_sequence` 맞춤 |
| 검증 | 14개 테이블 `COUNT(*)` 소스=타겟, 불일치 시 종료 코드 1 |
| 안전장치 | 소스 URL=타겟 URL이면 중단, 소스에 14개 테이블이 없으면 중단, 타겟에 행이 있으면 `--force` 없이는 중단 |
| 로컬 확인 | `file:` URL 두 개로 전체 흐름 테스트: `node --test tests/migrate-turso-db.test.mjs` |

## 체크리스트

- [ ] 접속 적은 시간대 공지 (세션 만료·재로그인, 게스트 계정 영향)
- [ ] 공용 DB 백업(`scripts/backup-turso.mjs`)
- [ ] 새 DB `djrpg` 생성(libSQL) + URL/토큰 확보
- [ ] `--dry-run`으로 14개 테이블 행 수·게스트 수 확인
- [ ] 본 이관 실행 → 검증 전부 `OK`
- [ ] Cloudflare `TURSO_DATABASE_URL`·`TURSO_AUTH_TOKEN` 교체 → **Retry deployment**
- [ ] `/version.json`·신규/기존 로그인·거래소·퍼즐 메이츠 확인
- [ ] 1주 관찰 후 공용 DB의 옛 `djrpg_*` 이름 변경 → 이후 DROP

## 문제 해결

| 증상 | 원인 / 조치 |
|---|---|
| `SOURCE_TURSO_DATABASE_URL이 없습니다` | PowerShell에서 `$env:` 설정이 그 창에만 유지된다. 같은 창에서 실행하거나 명령 앞에 붙여 실행 |
| `소스 DB에 다음 테이블이 없습니다` | URL이 다른 DB(새 DB나 퍼즐 메이츠 외 DB)를 가리킨다 |
| `타겟 DB에 이미 행이 있습니다` | 이미 이관했거나 다른 데이터가 있다. 새 빈 DB를 쓰거나 `--force` |
| `소스와 타겟 URL이 같습니다` | `TARGET_*`에 공용 DB URL을 넣었다. 절대 그대로 진행하지 않는다 |
| `LIBSQL_HTTP_401` / `Unauthorized` | 토큰 오타·만료·다른 DB의 토큰 |
| 이관은 됐는데 앱이 `503 DB_NOT_CONFIGURED` | Cloudflare 환경변수 이름 오타 또는 **Retry deployment 누락** |
| 로그인이 전부 401 | 정상(토큰 키 변경). 재로그인 안내. 게스트는 0-1의 2번 참고 |
