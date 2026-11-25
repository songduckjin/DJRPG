## 무엇을 하나

**사망 후 5초 부활 대기를 화면 중앙 상태 카드(B안)로 표시**합니다. 2026-11-25 대장님·송덕진 님 양측 확정안(`downloads/djrpg_disconnect_revive_ui/design.md`·`02_revive_b_card.png`)의 구현입니다.

지금은 `reviveTimer`(5초, 입문 1~4층 0초)를 `src/ui/`에서 아무도 읽지 않아, 안내가 **3.2초짜리 토스트 한 줄**뿐이었습니다 — 5초 중 마지막 1.8초는 표시가 없고 캐릭터는 서 있는 자세 그대로라 왜 사냥이 멈췄는지 알 수 없었습니다.

### 화면 (390×844 기준, `--u` 토큰으로 배율 대응)

- 화면 중앙(폭 272px·`top: 44%`) 카드, **92px 원형 링 카운트다운** — 남은 초를 **5→1 정수**로(올림), 링 호와 진행 막대가 남은 비율을 그립니다.
- 0초 → 링 가운데가 **`부활!`** 로 바뀌며 **0.9초 플래시** 후 카드가 사라집니다.
- 문구: `쓰러졌습니다` · `{손실금화}금화 손실 · {현재층}층` · `{N}초 뒤 만혈로 부활합니다` / `부활하면 자동 사냥이 다시 시작됩니다.` · 진행 막대 · `1~4층은 대기 없이 바로 부활합니다.`
- 쓰러진 동안 전투 캔버스 탈색(`saturate(.28) brightness(.62)`) + HP 바 붉은 테두리(HP 0 강조).
- `pointer-events: none` — 자동 사냥 화면을 막지 않습니다. `z-index: 4`(오른쪽 레일 3 위, 모달 스크림 5·토스트 20 아래).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/game/reviveNotice.ts` (신규) | 판정·문구·상수(순수 모듈, DOM 없음) — `reviveNoticeState`·`reviveChipText`·`reviveCountdownText`·`isReviveToastSuppressed` |
| `src/ui/reviveNotice.ts` (신규) | DOM — 카드는 필요할 때 `.battle`에 한 번 붙이고 플래시가 끝나면 제거, 바뀐 값만 씀 |
| `src/game/fieldProgress.ts` | `reviveLostGold` — `defeatPenalty`가 돌려준 **실제 손실**(가진 금화가 모자라면 그만큼) |
| `src/ui/hud.ts` | `tick()`에서 `this.revive?.render(this)` |
| `src/ui/interface.ts` | `message()`가 카드와 같은 문장의 토스트를 접음(보스 안내 `1마리부터 다시 잡으면…`은 남김) |
| `src/styles/hud.css` | `.revive-card`·`.rvc-*`·`is-revived` 플래시·`.battle.is-revive-down`·`.health-bar.hp.is-down` |
| `tests/revive-notice.test.mjs` (신규) | 8건 — 상태 5→1·0초 플래시·1~4층 없음·문구·실제 손실 금화·토스트 접기·CSS 계약 |
| `docs/{FIELD_OFFLINE,CODE_MAP,TASK}.md` | 도메인 매뉴얼·색인·진행 현황 |

**입문 1~4층은 대기 자체가 0초라 카드가 뜨지 않습니다(현행 유지).** 세이브·서버 계약·API는 건드리지 않았습니다.

## 검증

- `npx tsc --noEmit` 통과
- `vite build` 통과(`index-plYQXUWm.js` 932.86kB)
- 신규 `tests/revive-notice.test.mjs` **8/8**
- 관련 기존 테스트: `skill-ui`·`world-movement`·`progress-parity`·`offline-survival-rework` 등 54/54 통과
- 전체 `tests/*.test.mjs` — 실패는 모두 **`origin/main`(`a76cd3e`) 기준선과 같은 이름**(sparse 체크아웃의 `public/assets/**` 부재: 시트·마스크·아이콘 규격 검사)이고 **신규 실패 0**. 기준선에서도 실패하는 `hud-bundle`의 `LV 배지는…`·`world-boss-field`의 `defeat integration…` 2건은 같은 이름으로 확인했습니다. (최종 전건 수치는 이어지는 댓글에 적습니다.)
- 프리뷰 실화면(390×844) 검수 결과는 아래 댓글에 이어서 남깁니다.

## 주의

- **머지·운영 배포 보류**(대장님 지시) — PR·프리뷰 검수까지만 합니다.
- 프리뷰 배포에서 게스트 테스트 계정을 쓰면 검수 뒤 정리합니다.
