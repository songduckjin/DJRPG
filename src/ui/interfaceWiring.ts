/**
 * 도메인 콜백 배선 (PR-4) — 거래소·여정·창고·월드가 화면을 부르는 통로를 한 파일로 모았다.
 *
 * `Interface` 생성자는 조립만 하고, "무엇이 바뀌면 어디를 다시 그리는가"는 여기서 정한다.
 * 어느 창을 사냥 중에 다시 그리지 않는지는 `modalRegistry.refreshesOnWorldChange`가 답한다.
 */
import type { Interface } from './interface';
import type { World } from '../game/world';
import { discoverEquipment } from '../game/codex';
import { isSkillBook } from '../game/items';
import { updateMarketLive, updateMarketNavDot } from './modals/marketModal';
import { loadWarehouse } from './modals/charactersModal';
import { updateUtilityBadges } from './modals/utilityModal';
import { isJourneyModal, refreshesOnWorldChange } from './modalRegistry';

/** 거래소·여정·창고가 돌려준 결과를 화면에 반영한다. */
export function wireDomains(ui: Interface): void {
  ui.market.onMessage = text => ui.message(text);
  ui.market.sync.onWarehouseRecovered = () => {
    ui.renderStatus(); ui.renderBagBadge();
    if (ui.openModal === 'warehouse') void loadWarehouse(ui);
    ui.message('공용창고 이동 결과를 확인했습니다.');
  };
  ui.market.onChange = full => {
    if (ui.openModal === 'market' && full) ui.renderModal();
    updateMarketLive(ui); updateMarketNavDot(ui); ui.renderStatus();
  };
  ui.journey.onMessage = text => ui.message(text);
  ui.journey.onChange = () => {
    ui.renderStatus(); ui.renderBagBadge(); updateUtilityBadges(ui); updateMarketNavDot(ui);
    if (isJourneyModal(ui.openModal)) ui.renderModal();
  };
  void ui.journey.load();
  // 우편·업적 배지는 다른 탭에서 받은 보상도 보여야 해서 2분마다 한 번씩 조용히 확인한다.
  window.setInterval(() => { if (!document.hidden) void ui.journey.load(); }, 120000);
}

/** 사냥 한 마리마다 — 도감 발견·저장·새 장비 표시·열린 창 갱신. */
export function wireWorld(ui: Interface, world: World): void {
  world.onChange = () => {
    discoverEquipment(world.save); ui.onSave();
    for (const item of world.save.bag) {
      if (!ui.knownItems.has(item.id)) {
        ui.knownItems.add(item.id);
        if (ui.openModal !== 'equipment' && !isSkillBook(item)) ui.newItems.add(item.id);
      }
    }
    ui.renderBagBadge(); ui.renderStatus();
    // 캐릭터 선택·새 캐릭터 창은 사냥 중 매 처치마다 다시 그리지 않는다(작업 228) —
    // 목록은 열 때 한 번 읽고, 카드 초상화 합성이 무거워 재렌더가 잦으면 선택·생성이 느려진다.
    if (refreshesOnWorldChange(ui.openModal)) ui.renderModal();
  };
  world.onMessage = text => ui.message(text);
}
