# DJRPG QUICK_PATCH — 증상 하나 → 도메인 매뉴얼 하나

> **읽는 법**: 아래 증상에서 한 줄을 찾아 **그 도메인 매뉴얼만** 연다. 매뉴얼의 "핵심 파일"에서 `rg`로 심볼을 찾고, "테스트"의 단건만 돌린다. 두 단계를 건너뛰고 전체 탐색하지 않는다.
> 과거의 긴 레시피 표(수정 파일·금지·단건 테스트 수십 줄)는 `docs/archive/2026-11/QUICK_PATCH-full.md`에 보관돼 있다.

## 자주 오는 증상

| 증상 | 매뉴얼 |
|---|---|
| 몹이 안 다가옴·사거리·평타 대상·층 이동·보스가 안 나옴·보스 도전 버튼 | `docs/FIELD_OFFLINE.md` |
| 맞은 몹이 맵 밖으로 밀려나 전사가 접근·공격을 못 함(넉백 경계) | `docs/FIELD_OFFLINE.md` |
| 드롭이 안 주워짐·1.5초 흡수·금화 무더기 | `docs/FIELD_OFFLINE.md` |
| 방치 보상이 0·방치 등반·방치 자동 분해 | `docs/FIELD_OFFLINE.md` |
| 탭(창)을 내렸다 돌아오니 사냥이 멈춰 있고 보상이 없음·자리 비움 정산 토스트/팝업 | `docs/FIELD_OFFLINE.md`(자리 비움 정산) · `docs/SYNC_SAVE.md`(숨김·복귀 저장) |
| 던전에서 안 움직임·클리어가 순위에 안 올라감·`DUNGEON_*` 오류 | `docs/DUNGEON.md` |
| 월드보스 순위·보상·전투 재현 어긋남 | `docs/WORLDBOSS_RANKING.md` |
| 일일/주간 퀘스트·업적 수치·보상 수령 반복 | `docs/QUEST_ATTENDANCE.md` |
| 가방 40칸·스킬북 칸 계산·강화 `+N`·추가옵션·분해 보호 | `docs/INVENTORY_GEAR.md` |
| 치명타 확률과 치명타 피해량이 헷갈림·피해량 옵션이 안 먹음 | `docs/INVENTORY_GEAR.md` |
| 유니크·전설이 나왔는데 화면에서 티가 안 남(주머니·보상 창·가방) | `docs/INVENTORY_GEAR.md` |
| 업그레이드 화살표(▲)·장비 비교 | `docs/INVENTORY_GEAR.md` |
| 스킬 쿨타임·버프·퀵슬롯·추천 장착·스킬북 합성·도감 칸 | `docs/SKILLS_CODEX.md` |
| 스킬 트리·SP 투자/초기화·선행 조건·스킬 최대 Lv.10 | `docs/SKILLS_CODEX.md` |
| 우편이 안 받아져·보상을 못 받아감·가방이 꽉 차 거래소가 잠김 | `docs/MAIL_WAREHOUSE.md` · `docs/SYNC_SAVE.md`(여정 전용 입구) |
| 우편 수령·만료·공지 우편 중복 | `docs/MAIL_WAREHOUSE.md` |
| 창고 이동이 느림·이동 중 잠김·`CHARACTER_CONFLICT` | `docs/MAIL_WAREHOUSE.md` |
| 거래소 목록·시세·묶음·수령함·`INBOX_FULL`·전환 뒤 거래소 잠김 | `docs/MARKET.md` |
| 다이아 잔액·상품·결제 승인·슬롯 구매 | `docs/SHOP_ECONOMY.md` |
| 로그인·토큰 만료·다른 기기 로그인·캐릭터 생성/삭제·점검 팝업 | `docs/AUTH_CHARACTER.md` |
| 저장이 안 됨·`SAVE_CONFLICT`·`ITEM_CONFLICT`·"게임에 접속 중입니다…"·창 내렸다 복귀 | `docs/SYNC_SAVE.md` |
| 부캐릭(2번 이상)에서 방치 보상 저장 실패·접속 불가·가방이 비어 보임·"아이템 정보가 서버 기록과 다릅니다" | `docs/SYNC_SAVE.md` |
| 캐릭터가 안 보임·코스튬 폴백·투구/갑옷/무기 외형·발광 | `docs/COSTUME_SYSTEM.md` |
| 그림을 바꿨는데 화면이 그대로(캐시) | `docs/COSTUME_SYSTEM.md` + `PILOT_ASSET_VERSION`/`?v=` |
| 3D에서 2.5D 셀을 다시 뽑아야 함 | `docs/BLENDER_25D_PIPELINE.md` |
| 로브·갑옷 뒤로 바닥이 비치거나 천에 반점이 보임(시트 내부 알파) | `docs/COSTUME_SYSTEM.md` |
| 저장 400(`INVALID_ITEM`·`INVALID_GOLD`)·스키마·이관 | `docs/SYNC_SAVE.md` → `docs/TURSO_DB_GUIDE.md` |
| API가 느림·요청이 너무 많음 | `docs/WORLDBOSS_RANKING.md`(폴링 예산)·`server/metrics.mjs` |

## 마무리 3줄

1. `npx tsc --noEmit`
2. 해당 도메인 매뉴얼의 테스트만 `node --test …`
3. 그 도메인 매뉴얼 1곳에 바뀐 책임·새 파일 1줄 추가(`docs/CODE_MAP.md` 인덱스는 도메인이 늘 때만)
