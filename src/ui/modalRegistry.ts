/**
 * 팝업 등록부 (PR-4) — 예전 `Interface.renderModal()`의 18갈래 `if`를 이 표 한 벌로 바꿨다.
 *
 * 새 팝업은 여기 한 줄을 더하는 것으로 끝난다: 제목·창틀 클래스·그리는 함수·열 때 할 일
 * (`prepare`·`load`)·사냥 중 다시 그릴지(`quietWhileHunting`)·입력 중이면 멈출지(`keepsTyping`).
 * `Interface`는 이 표를 읽어 창틀만 그리고(`modalChrome.ts`), 각 도메인 모달이 자기 내용을 그린다.
 *
 * 이 파일은 `Interface`를 **타입으로만** 가져온다 — 실제 import는 전부 모달 쪽이라 런타임 순환은
 * 생기지 않는다. (모달들도 `Interface`를 `import type`으로만 쓴다.)
 */
import type { Interface } from './interface';
import type { Modal } from './interfaceTypes';
import { renderEquipment, renderInventory } from './modals/equipModal';
import { renderDungeonLobby } from './modals/dungeonModal';
import { renderWorldBoss } from './modals/worldBossModal';
import { renderSettings, renderUtility } from './modals/utilityModal';
import { renderCodex } from './modals/codexModal';
import { renderSalvage } from './modals/salvageModal';
import { renderMarket } from './modals/marketModal';
import { loadCharacters, loadWarehouse, renderCharacters, renderCreateCharacter, renderWarehouse } from './modals/charactersModal';
import { resetWarehouse } from './modals/warehouseModal';
import { loadShop, renderShop } from './modals/shopModal';
import { renderOffline } from './modals/offlineModal';
import { renderFloor } from './modals/floorModal';
import { renderAccount } from './modals/accountModal';
import { renderSkills } from './modals/skillModal';

/** 팝업 하나의 규칙 — 그리기와, 열 때·사냥 중에 무엇을 할지. */
export interface ModalSpec {
  /** 공통 머리글에 적히는 이름. 자기 머리글을 그리는 창(던전·월드보스)도 같은 이름을 쓴다. */
  title: string;
  /** `.modal-dialog`에 함께 붙는 클래스. 표에 없는 클래스는 이 창을 열 때 떨어진다. */
  dialogClasses?: readonly string[];
  /** 스크린리더가 읽을 이름 — 없으면 공통 머리글을 지우므로 `aria-label`도 지운다. */
  ariaLabel?: string;
  /** 머리글을 창이 직접 그린다(던전·월드보스). 공통 머리글을 붙이지 않는다. */
  ownHeading?: boolean;
  /** 머리글 제목 옆에 다른 창으로 넘어가는 버튼(내 정보 ↔ 장비 도감). */
  titleLink?: { to: Modal; label: string };
  /** 창 안쪽을 그린다 — 공통 창틀은 이미 그려져 있다. */
  render(ui: Interface, dialog: HTMLElement): void;
  /** 첫 그리기 **전에** 할 일 — 지난번 표시를 지우는 등. */
  prepare?(ui: Interface): void;
  /** 첫 그리기 **뒤에** 할 일 — 목록 조회. */
  load?(ui: Interface): void;
  /** 사냥 중 매 처치(`world.onChange`)마다 다시 그리지 않는다 — 목록 조회·연출이 무거운 창. */
  quietWhileHunting?: boolean;
  /** 이 입력 요소에 포커스가 있으면 다시 그리지 않는다 — 타이핑 중인 검색어를 지우지 않는다. */
  keepsTyping?: readonly string[];
}

/** 여정에서 오는 창(우편함·보상·업적) — 열 때 여정을 한 번 읽고, 여정이 바뀌면 다시 그린다. */
export const JOURNEY_MODALS: readonly Modal[] = ['mail', 'rewards', 'achievements'];

/** 여정 창인가 — `open()`·`journey.onChange`·`renderUtility`가 같은 목록을 본다. */
export function isJourneyModal(kind: Modal | null): boolean {
  return !!kind && JOURNEY_MODALS.includes(kind);
}

const journeyLoad = (ui: Interface): void => { void ui.journey.load(); };

export const MODALS: Record<Modal, ModalSpec> = {
  dungeon: {
    title: '끝없는 던전',
    ownHeading: true,
    ariaLabel: '끝없는 던전',
    dialogClasses: ['dungeon-modal'],
    render: (ui, dialog) => renderDungeonLobby(ui, dialog),
    quietWhileHunting: true
  },
  worldBoss: {
    title: '월드보스',
    ownHeading: true,
    ariaLabel: '월드보스',
    dialogClasses: ['world-boss-modal'],
    render: (ui, dialog) => renderWorldBoss(ui, dialog),
    quietWhileHunting: true
  },
  equipment: {
    title: '내 정보',
    dialogClasses: ['equipment-modal'],
    titleLink: { to: 'codex', label: '도감' },
    // 새로 얻은 장비 표시는 창을 여는 순간 지운다(작업 136).
    prepare: ui => { ui.newItems.clear(); ui.renderBagBadge(); },
    render: (ui, dialog) => { renderEquipment.call(ui, dialog); renderInventory.call(ui, dialog); }
  },
  skills: {
    title: '스킬',
    dialogClasses: ['skills-modal'],
    render: (ui, dialog) => renderSkills.call(ui, dialog)
  },
  account: {
    title: '계정 정보',
    render: (ui, dialog) => renderAccount.call(ui, dialog),
    keepsTyping: ['INPUT']
  },
  floor: {
    title: '층 선택',
    render: (ui, dialog) => renderFloor.call(ui, dialog)
  },
  offline: {
    title: '오프라인 사냥 정산',
    render: (ui, dialog) => { if (ui.offlineReward) renderOffline(dialog, ui.offlineReward); }
  },
  market: {
    title: '거래소',
    dialogClasses: ['market-modal'],
    render: (ui, dialog) => renderMarket.call(ui, dialog),
    quietWhileHunting: true
  },
  salvage: {
    title: '분해 확인',
    render: (ui, dialog) => renderSalvage.call(ui, dialog)
  },
  codex: {
    title: '장비 도감',
    dialogClasses: ['codex-modal'],
    titleLink: { to: 'equipment', label: '장비' },
    render: (ui, dialog) => renderCodex.call(ui, dialog),
    keepsTyping: ['INPUT', 'SELECT']
  },
  characters: {
    title: '캐릭터 선택',
    render: (ui, dialog) => renderCharacters(ui, dialog),
    // 목록은 열 때 한 번 읽는다 — 카드 초상화 합성이 무거워 매 처치마다 다시 그리면 느려진다(작업 228).
    load: ui => { void loadCharacters(ui); },
    quietWhileHunting: true
  },
  createCharacter: {
    title: '새 캐릭터',
    render: (ui, dialog) => renderCreateCharacter(ui, dialog),
    quietWhileHunting: true
  },
  warehouse: {
    title: '공용창고',
    dialogClasses: ['warehouse-modal'],
    render: (ui, dialog) => renderWarehouse(ui, dialog),
    load: ui => { ui.warehouseItems = undefined; resetWarehouse(ui); void loadWarehouse(ui); }
  },
  settings: {
    title: '설정',
    dialogClasses: ['utility-modal', 'settings-modal'],
    render: (ui, dialog) => renderSettings(ui, dialog),
    quietWhileHunting: true
  },
  mail: {
    title: '우편함',
    dialogClasses: ['utility-modal'],
    render: (ui, dialog) => renderUtility(ui, dialog, 'mail'),
    load: journeyLoad,
    quietWhileHunting: true
  },
  rewards: {
    title: '보상',
    dialogClasses: ['utility-modal'],
    render: (ui, dialog) => renderUtility(ui, dialog, 'rewards'),
    load: journeyLoad,
    quietWhileHunting: true
  },
  achievements: {
    title: '업적',
    dialogClasses: ['utility-modal'],
    render: (ui, dialog) => renderUtility(ui, dialog, 'achievements'),
    load: journeyLoad,
    quietWhileHunting: true
  },
  shop: {
    title: '상점',
    render: (ui, dialog) => renderShop(ui, dialog),
    // 상품 목록은 처음 한 번만 읽는다 — 결제에서 돌아왔을 때는 `completeShopReturn`이 채운다.
    load: ui => { if (!ui.shopCatalog) void loadShop(ui); },
    quietWhileHunting: true
  }
};

/**
 * 창이 열린 채 사냥(`world.onChange`)이 돌 때 이 창을 다시 그릴지.
 *
 * 목록·연출이 무거운 창(`quietWhileHunting`)은 그대로 두고, 도감·계정처럼 검색어·입력값을 받는 창은
 * 입력 중이면 멈춘다 — 글자를 치는 동안 창이 새로 그려지면 포커스와 글자가 날아간다.
 */
export function refreshesOnWorldChange(kind: Modal | null): boolean {
  if (!kind) return true;
  const spec = MODALS[kind] as ModalSpec | undefined;
  if (!spec) return true;
  if (spec.quietWhileHunting) return false;
  if (spec.keepsTyping) {
    const tag = document.activeElement?.tagName ?? '';
    if (spec.keepsTyping.includes(tag)) return false;
  }
  return true;
}
