/**
 * 공용창고 모달 (작업 225) — 장비창 가방과 같은 아이콘 슬롯 그리드로 다시 만들었다.
 *
 * 예전 화면(`charactersModal.renderWarehouse`)은 아이콘·등급색 없이 이름 줄만 늘어놓았고,
 * 아이템 하나를 옮길 때마다 `ui.warehouseItems = undefined`로 목록을 지우고 `loadWarehouse`를
 * 다시 불러 **"공용창고를 불러오는 중…"이 화면을 덮었다**(스크롤도 처음으로 돌아갔다).
 *
 * 지금은 이동 뒤에도 목록을 비우지 않는다 — 서버가 응답에 실어 준 `items`(창고 목록)와
 * `save`(가방)로 인메모리 상태를 바로 맞추고 그리드만 다시 그린다. 옮기는 동안에는 그 칸만
 * 잠깐 흐려지고(`is-busy`) 나머지는 그대로다. 여러 개는 칸을 그냥 탭해 고르면 한 요청(`itemIds`)으로
 * 한꺼번에 옮긴다(작업 246 — `선택` 모드 버튼과 `빠른 이동`은 없애고 **다중 선택이 기본**이며, 고른
 * 쪽에만 `선택 보관`/`선택 꺼내기`가 나타난다). `equipModal.ts`는 건드리지 않고 그리드 모양
 * (`.bag-grid`·`.bag-item`)과 헬퍼(`iconPath`)만 빌려 쓴다.
 *
 * 작업 258 — 사용자 제보 "창고시스템 오류가 너무 많은데 점검해볼래?"에 따른 정리:
 * ① **칸이 모자라도 옮길 수 있는 만큼 옮긴다** — 예전에는 창고(또는 가방) 잔여 칸보다 고른 개수가
 *    많으면 버튼을 통째로 잠갔다. 주머니·스킬북 묶음 5개 중 2칸만 남았을 때 아무것도 못 옮겼다.
 *    지금은 남은 칸만큼만 골라 보내고 버튼에 `보관하기 (2/5)`처럼 **몇 개가 나가는지** 밝힌다.
 * ② **이동 중인 칸을 다시 열어도 잠금이 풀리지 않는다** — 예전 `renderWarehouse`는 그릴 때마다
 *    `state.busy`를 비워, 응답을 기다리는 아이템을 다시 탭해 같은 요청을 또 보낼 수 있었다.
 * ③ **409·오류에서 목록을 지우지 않는다** — 예전에는 `ui.warehouseItems = undefined`로 비우고 다시 읽어
 *    `공용창고를 불러오는 중…`이 화면을 덮었다. 지금은 그리드를 그대로 두고 조용히 다시 읽는다.
 */
import { countedInBag, equipmentCount } from '../../game/bagCapacity';
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from '../../game/appVersion';
import {
  equipmentImage, isEquipment, isPouch, isSkillBook, itemDisplayName, itemJob, itemPower, plusOf,
  rarityNames, rarityOrder, skillBookJob, slotNameFor, slots as equipmentSlots, statNames, type Item, type Stat
} from '../../game/items';
import { extraOptionLines } from '../../game/extraOptions';
import { jobNames, jobShortNames, jobOrDefault, type Job } from '../../game/skills';
import type { Save } from '../../game/store';
import { pouchIconMarkup } from '../pouchArt';
import { skillBookJobRank } from '../bagStacks';
import { downgradeArrowMarkup, upgradeArrowMarkup } from '../upgradeBadge';
import { appendPlusBadge } from '../plusBadge';
import { appendRarityBadge } from '../rarityBadge';
import type { Interface } from '../interface';

export type WarehouseSide = 'storage' | 'bag';

/** 같은 주머니·같은 스킬북은 한 칸에 `×N`으로 모은다(개별 id는 그대로 남아 일괄 이동 때 함께 나간다). */
type Stack = { key: string; items: Item[] };

type WarehouseState = {
  /** 고른 칸 — 키는 `bag:`/`storage:` 접두사가 붙은 스택 키, 값은 그 쪽(side). */
  picked: Map<string, WarehouseSide>;
  /** 상세 바에 띄운 칸. */
  focus?: { side: WarehouseSide; key: string };
  /** 지금 서버 응답을 기다리는 아이템 id — 그 칸만 잠깐 흐리게 한다. */
  busy: Set<string>;
  /** 진행 중인 이동 요청 수 — 그릴 때·다시 열 때 잠금을 함부로 풀지 않기 위해 센다(작업 258). */
  moving: number;
  error?: string;
};

const states = new WeakMap<Interface, WarehouseState>();
/** 지금 그려진 창고 화면의 다시 그리기 — 탭·이동 뒤에 화면 전체를 갈아 끼우지 않고 그리드·상세만 손본다(스크롤 유지). */
const painters = new WeakMap<Interface, () => void>();
/** 이동은 한 번에 하나씩 — 서버가 `pendingWarehouse`로 재확인하므로 줄을 세워 보낸다. */
const queues = new WeakMap<Interface, Promise<void>>();
/** 캐릭터 전환 등으로 큐를 버릴 때 이미 걸려 있던 이동이 실행되지 않게 하는 세대 번호(작업 258). */
const generations = new WeakMap<Interface, number>();
const generationOf = (ui: Interface): number => generations.get(ui) ?? 0;

export function warehouseState(ui: Interface): WarehouseState {
  let state = states.get(ui);
  if (!state) { state = { picked: new Map(), busy: new Set(), moving: 0 }; states.set(ui, state); }
  return state;
}

/** 창고를 새로 열 때 — 선택·상세·오류는 지우되, **보내는 중인 칸의 잠금은 남긴다**(작업 258). */
export function resetWarehouse(ui: Interface): void {
  const state = warehouseState(ui);
  state.picked.clear(); state.focus = undefined; state.error = undefined;
  if (!state.moving) state.busy.clear();
}

/**
 * 캐릭터가 바뀌었을 때 — 이전 캐릭터의 이동 큐·선택·잠금·목록을 전부 버린다(작업 258).
 *
 * 큐에 남은 이동이 새 캐릭터의 화면에서 실행되면 옛 캐릭터의 아이템 id로 요청이 나가 409만 받는다.
 */
export function resetWarehouseForCharacterSwitch(ui: Interface): void {
  const state = warehouseState(ui);
  state.picked.clear(); state.focus = undefined; state.error = undefined;
  state.busy.clear(); state.moving = 0;
  queues.delete(ui); painters.delete(ui);
  generations.set(ui, generationOf(ui) + 1);
  ui.warehouseItems = undefined;
}

const keyOf = (side: WarehouseSide, stackKey: string): string => `${side}:${stackKey}`;
const sideOf = (key: string): WarehouseSide => key.startsWith('storage:') ? 'storage' : 'bag';
const stackKeyOf = (key: string): string => key.slice(sideOf(key).length + 1);

function stackKey(item: Item): string {
  if (isPouch(item)) return 'pouch';
  if (isSkillBook(item)) return `book:${item.skillId ?? item.name}`;
  return `item:${item.id}`;
}

function stacksOf(items: Item[], myJob: Job = 'warrior'): Stack[] {
  const order: string[] = []; const map = new Map<string, Stack>();
  for (const item of items) {
    const key = stackKey(item);
    const stack = map.get(key);
    if (stack) stack.items.push(item);
    else { map.set(key, { key, items: [item] }); order.push(key); }
  }
  // 서버가 준 순서(`item_id`)는 뜻이 없어 칸마다 뒤죽박죽이었다(작업 245) — 부위별로 모으고
  // 같은 부위 안에서는 전투력이 높은 순으로 놓는다. 가방 쪽 목록도 같은 순서를 쓴다.
  return order.map(key => map.get(key)!).sort((a, b) => compareWarehouseItems(a.items[0], b.items[0], myJob));
}

/** 부위 순서 — 보물 주머니(작업 247, 늘 첫 칸) → 장비 슬롯 표(`slots`) → 스킬북(맨 뒤). */
const SLOT_ORDER = new Map<string, number>(equipmentSlots.map((slot, index) => [slot, index]));
const KIND_POUCH = -1, KIND_BOOK = equipmentSlots.length + 1, KIND_OTHER = equipmentSlots.length + 2;
function slotRank(item: Item): number {
  // 보물 주머니는 창고·가방 어느 목록에서도 맨 앞이다(작업 247) — 받은 주머니를 찾아 헤매지 않게 한다.
  if (isPouch(item)) return KIND_POUCH;
  if (isSkillBook(item)) return KIND_BOOK;
  return SLOT_ORDER.get(String(item.slot)) ?? KIND_OTHER;
}
const rarityRank = (item: Item): number => Math.max(0, rarityOrder.indexOf(item.rarity));
/**
 * 공용창고·가방 칸 정렬 — 부위 → (스킬북은 직업 묶음) → 전투력(내림차순) → 등급 → 강화(+N) → 이름 → id
 * (작업 245, 247). 보물 주머니는 `slotRank` -1로 늘 첫 칸이고, 스킬북 구간은 내 직업 → 전사 → 궁수 →
 * 마법사 순으로 모은다(`bagStacks.skillBookJobRank` — 장비창 가방과 같은 규칙).
 */
export function compareWarehouseItems(a: Item, b: Item, myJob: Job = 'warrior'): number {
  const kind = slotRank(a) - slotRank(b);
  if (kind) return kind;
  if (isSkillBook(a) && isSkillBook(b)) {
    const job = skillBookJobRank(a, myJob) - skillBookJobRank(b, myJob);
    if (job) return job;
  }
  return itemPower(b) - itemPower(a)
    || rarityRank(b) - rarityRank(a)
    || plusOf(b) - plusOf(a)
    || String(a.name).localeCompare(String(b.name), 'ko')
    || String(a.id).localeCompare(String(b.id));
}

export async function loadWarehouse(ui: Interface): Promise<void> {
  const state = warehouseState(ui);
  try {
    const response = await fetch('/api/warehouse', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${ui.session.token}` }), body: JSON.stringify({ action: 'list' }) });
    const data = await response.json();
    if (isOutdatedResponse(response.status, data.code, data.expected)) { reloadForNewVersion(); return; }
    if (!response.ok) throw new Error(data.error || '공용창고를 읽지 못했습니다.');
    state.error = undefined;
    ui.warehouseItems = data.items as Item[];
    if (ui.openModal === 'warehouse') ui.renderModal();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    painters.delete(ui);
    if (ui.openModal === 'warehouse') ui.renderModal();
    ui.message(state.error);
  }
}

export function renderWarehouse(ui: Interface, dialog: HTMLElement): void {
  const state = warehouseState(ui);
  // 새로 그리는 창고에는 이전 이동의 잠금 표시를 남기지 않는다 — 단, **지금 보내고 있는 칸**은 잠근 채로 둔다.
  // 예전에는 무조건 비워서 응답을 기다리는 아이템을 다시 탭해 같은 요청을 또 보낼 수 있었다(작업 258).
  if (!state.moving) state.busy.clear();
  if (!ui.warehouseItems) {
    const note = document.createElement('p'); note.className = 'warehouse-note';
    note.textContent = state.error ? state.error : '공용창고를 불러오는 중…';
    dialog.append(note);
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'warehouse-retry';
    retry.textContent = state.error ? '다시 불러오기' : '새로고침';
    retry.onclick = () => { ui.warehouseItems = undefined; state.error = undefined; ui.renderModal(); void loadWarehouse(ui); };
    dialog.append(retry);
    return;
  }
  const save = ui.world.save;

  const summary = document.createElement('div'); summary.className = 'warehouse-summary';
  const gold = document.createElement('span'); gold.className = 'warehouse-gold';
  const counts = document.createElement('span'); counts.className = 'warehouse-counts';
  summary.append(gold, counts);

  const tools = document.createElement('div'); tools.className = 'warehouse-tools';
  // [작업 246] `선택 끔/켬` 모드 버튼과 `빠른 이동`은 없앴다 — 창고를 열면 **바로 탭해서 여러 칸을
  // 고르는** 것이 기본이고, 고른 쪽에만 `선택 보관`/`선택 꺼내기`가 나타난다(사용자 요청).
  const depositPicked = document.createElement('button'); depositPicked.type = 'button'; depositPicked.className = 'warehouse-batch warehouse-deposit-picked';
  const withdrawPicked = document.createElement('button'); withdrawPicked.type = 'button'; withdrawPicked.className = 'warehouse-batch warehouse-withdraw-picked';
  // 새로고침은 도구 줄 오른쪽 끝에 둔다 — 아래에 따로 두면 그만큼 그리드가 좁아진다.
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'warehouse-refresh';
  reset.textContent = '새로고침';
  reset.title = '공용창고 목록을 서버에서 다시 읽습니다.';
  reset.onclick = () => { ui.warehouseItems = undefined; painters.delete(ui); ui.renderModal(); void loadWarehouse(ui); };
  tools.append(depositPicked, withdrawPicked, reset);

  const storageHeading = document.createElement('h3'); storageHeading.className = 'warehouse-pane-title';
  const bagHeading = document.createElement('h3'); bagHeading.className = 'warehouse-pane-title';
  const storageGrid = document.createElement('div'); storageGrid.className = 'bag-grid warehouse-grid warehouse-grid-storage';
  const bagGrid = document.createElement('div'); bagGrid.className = 'bag-grid warehouse-grid warehouse-grid-bag';
  const storagePane = document.createElement('section'); storagePane.className = 'warehouse-pane warehouse-pane-storage';
  const bagPane = document.createElement('section'); bagPane.className = 'warehouse-pane warehouse-pane-bag';
  storagePane.append(storageHeading, storageGrid);
  bagPane.append(bagHeading, bagGrid);
  const panes = document.createElement('div'); panes.className = 'warehouse-panes';
  panes.append(storagePane, bagPane);

  const detail = document.createElement('div'); detail.className = 'warehouse-detail'; detail.hidden = true;
  dialog.append(summary, tools, panes, detail);

  let storageStacks: Stack[] = [];
  let bagStacks: Stack[] = [];

  const paint = (): void => {
    const myJob = jobOrDefault(save.job);
    storageStacks = stacksOf(ui.warehouseItems ?? [], myJob);
    bagStacks = stacksOf(save.bag, myJob);
    const known = { storage: new Set(storageStacks.map(stack => stack.key)), bag: new Set(bagStacks.map(stack => stack.key)) };
    // 서버 목록이 바뀌었으면 사라진 칸의 선택·상세는 버린다.
    for (const [key, side] of [...state.picked]) if (!known[side].has(stackKeyOf(key))) state.picked.delete(key);
    if (state.focus && !known[state.focus.side].has(state.focus.key)) state.focus = undefined;

    const warehouseCount = (ui.warehouseItems ?? []).length;
    const bagCount = equipmentCount(save.bag, save.job);
    gold.textContent = `계정 공용 금화 ${save.gold.toLocaleString('ko-KR')}`;
    counts.textContent = `공용창고 ${warehouseCount}/40 · 가방 ${bagCount}/40`;
    counts.title = '가방 40칸은 장비·타직업 스킬북·보물 주머니를 1개씩 셈합니다(내 직업 스킬북 제외).';
    storageHeading.textContent = `공용창고 ${warehouseCount}/40`;
    bagHeading.textContent = `내 가방 ${bagCount}/40`;

    const idsOn = (side: WarehouseSide): string[] => pickIds(state, side, side === 'bag' ? bagStacks : storageStacks);
    const bagIds = idsOn('bag'), storageIds = idsOn('storage');
    const busyOn = (ids: string[]): boolean => ids.some(id => state.busy.has(id));
    // 고른 칸이 있는 쪽에만 액션 버튼이 나타난다(작업 246) — 모드 전환 없이 바로 다중 선택.
    const showDeposit = bagIds.length > 0;
    const showWithdraw = storageIds.length > 0;
    depositPicked.hidden = !showDeposit; withdrawPicked.hidden = !showWithdraw;
    const depositBusy = busyOn(bagIds);
    const withdrawBusy = busyOn(storageIds);
    // 잔여 칸이 고른 개수보다 적으면 **남은 칸만큼만** 옮긴다(작업 258) — 버튼을 통째로 잠그지 않고
    // `선택 보관 (2/5)`처럼 몇 개가 나가는지 밝힌다. 옮길 칸이 0일 때만 잠근다.
    const depositPlan = movePlan(ui, 'bag', bagIds);
    const withdrawPlan = movePlan(ui, 'storage', storageIds);
    const caption = (plan: MovePlan, verb: string, busyText: string, busy: boolean): string => {
      if (busy) return busyText;
      const total = plan.requested;
      return plan.overflow > 0 || plan.free <= 0 ? `${verb} (${plan.ids.length}/${total})` : `${verb} (${total})`;
    };
    // 옮기는 중이면 문구부터 바뀐다(작업 253, 사용자 제보 "로딩인지 모르겠음") — 눌렀는지 아닌지 바로 보이게.
    depositPicked.textContent = caption(depositPlan, '선택 보관', '보관 중…', depositBusy);
    withdrawPicked.textContent = caption(withdrawPlan, '선택 꺼내기', '꺼내는 중…', withdrawBusy);
    // 옮기는 중이거나 옮길 칸이 없으면 다시 누를 수 없다 — 같은 아이템을 두 번 보내 409를 받지 않게 한다(작업 250·258).
    depositPicked.disabled = depositPlan.ids.length === 0 || depositBusy;
    depositPicked.title = depositPlan.overflow > 0
      ? `공용창고에 ${depositPlan.free}칸 남아 선택한 ${bagIds.length}개 중 ${depositPlan.ids.length}개만 보관합니다.`
      : depositPlan.ids.length ? `${depositPlan.ids.length}개를 공용창고에 보관합니다.` : '공용창고가 가득 차 보관할 수 없습니다.';
    // 꺼내기도 가방 40칸을 넘길 수 없다(작업 248) — 스킬북·보물 주머니도 칸을 쓴다.
    withdrawPicked.disabled = withdrawPlan.ids.length === 0 || withdrawBusy;
    withdrawPicked.title = withdrawPlan.overflow > 0
      ? `가방이 ${withdrawPlan.free}칸 남아 선택한 ${storageIds.length}개 중 ${withdrawPlan.ids.length}개만 꺼냅니다.`
      : withdrawPlan.ids.length ? `${withdrawPlan.ids.length}개를 가방으로 꺼냅니다.` : '가방이 가득 차 꺼낼 수 없습니다. 가방을 비운 뒤 다시 시도하세요.';

    paintGrid(ui, storageGrid, 'storage', storageStacks, state);
    paintGrid(ui, bagGrid, 'bag', bagStacks, state);
    paintDetail(ui, save, detail, state, paint);
  };

  depositPicked.onclick = () => {
    const ids = pickIds(state, 'bag', bagStacks);
    if (!ids.length) return;
    // 선택은 이동이 **성공한 뒤** `move`가 비운다 — 실패하면 골라 둔 칸이 그대로 남아 다시 누를 수 있다(작업 250).
    move(ui, 'bag', ids);
  };
  withdrawPicked.onclick = () => {
    const ids = pickIds(state, 'storage', storageStacks);
    if (!ids.length) return;
    move(ui, 'storage', ids);
  };

  painters.set(ui, paint);
  paint();
}

/** 고른 칸들의 아이템 id — 스택이면 그 안의 모든 id가 한 요청에 함께 나간다. */
function pickIds(state: WarehouseState, side: WarehouseSide, stacks: Stack[]): string[] {
  const ids: string[] = [];
  for (const [key, pickedSide] of state.picked) {
    if (pickedSide !== side) continue;
    const stack = stacks.find(entry => entry.key === stackKeyOf(key));
    if (stack) ids.push(...stack.items.map(item => item.id));
  }
  return ids;
}

type MovePlan = {
  /** 이번 요청에 실제로 실릴 아이템 id — 대상 쪽 남은 칸에 맞춰 자른 결과다. */
  ids: string[];
  /** 고른 아이템 전체 수. */
  requested: number;
  /** 칸이 모자라 이번에 빠진 수(0이면 전부 옮긴다). */
  overflow: number;
  /** 대상 쪽(창고 또는 가방) 남은 칸. */
  free: number;
};

/**
 * 옮길 수 있는 만큼만 고른다(작업 258).
 *
 * 예전에는 잔여 칸보다 고른 개수가 많으면 버튼을 통째로 잠갔다 — 주머니·스킬북 묶음이 5개인데 창고에
 * 2칸만 남았을 때 **하나도 못 옮겼다**. 지금은 남은 칸만큼(`targetIds` 순서대로)만 보내고, 나머지는
 * 선택을 그대로 두어 버튼을 다시 누르면 된다.
 *
 * 보관(창고)은 장비·스킬북·주머니 모두 1칸을 쓰지만, 꺼내기는 가방 40칸 규칙대로 **내 직업 스킬북은 칸을 쓰지 않는다**
 * (`countedInBag`, 작업 253).
 */
function movePlan(ui: Interface, side: WarehouseSide, ids: string[]): MovePlan {
  const save = ui.world.save;
  const items = side === 'bag' ? save.bag : ui.warehouseItems ?? [];
  // 서버의 검사 순서를 그대로 따른다(작업 258): 아이템마다 **지금 칸이 꽉 찼는지** 먼저 보고,
  // 그 다음 `countedInBag`인 아이템만 칸을 하나 쓴다. 보관(창고)은 모든 아이템이 1칸을 쓴다.
  const counts = side === 'bag' ? () => true : (item: Item) => countedInBag(item, save.job);
  const start = side === 'bag' ? (ui.warehouseItems ?? []).length : equipmentCount(save.bag, save.job);
  const free = Math.max(0, 40 - start);
  const byId = new Map(items.map(item => [item.id, item]));
  const picked: string[] = [];
  let used = start, overflow = 0;
  for (const id of ids) {
    const item = byId.get(id);
    if (item) {
      if (used >= 40) { overflow++; continue; }
      if (counts(item)) used++;
    }
    picked.push(id);
  }
  return { ids: picked, requested: ids.length, overflow, free };
}

function paintGrid(ui: Interface, grid: HTMLElement, side: WarehouseSide, stacks: Stack[], state: WarehouseState): void {
  grid.replaceChildren();
  for (const stack of stacks) {
    const item = stack.items[0];
    const key = keyOf(side, stack.key);
    const book = isSkillBook(item), pouch = isPouch(item);
    const rarity = book ? 'skillbook-item' : pouch ? 'pouch-item' : item.rarity;
    const cell = document.createElement('button'); cell.type = 'button';
    cell.className = `bag-item warehouse-slot ${rarity}`;
    const busy = stack.items.some(entry => state.busy.has(entry.id));
    if (busy) { cell.classList.add('is-busy'); cell.disabled = true; }
    if (state.focus && state.focus.side === side && state.focus.key === stack.key) cell.classList.add('selected');
    if (state.picked.has(key)) cell.classList.add('is-picked');
    cell.dataset.itemId = item.id;
    cell.dataset.side = side;
    // 업그레이드 화살표(작업 241): 공용창고·가방 **양쪽** 모두, 접속 중인 캐릭터 기준으로 판정한다.
    const upgrade = upgradeArrowMarkup(ui.world.save, item);
    // 다운그레이드 화살표(빨간 아래) — 같은 기준으로 지금 난 것보다 약한 장비에만 붙는다(가방·장비창과 같은 판정).
    const downgrade = downgradeArrowMarkup(ui.world.save, item);
    if (upgrade) cell.classList.add('has-upgrade');
    if (downgrade) cell.classList.add('has-downgrade');
    cell.innerHTML = cellIcon(ui, item) + upgrade + downgrade;
    // 등급 배지(`L`·`U`·`E`)는 칸의 **왼쪽 위** — 가방(`equipModal`)과 같은 자리·같은 헬퍼다.
    appendRarityBadge(cell, item);
    if (stack.items.length > 1) {
      const badge = document.createElement('span'); badge.className = 'skillbook-count';
      badge.textContent = `×${stack.items.length}`; cell.append(badge);
    }
    // `+N`은 가방·장착 칸과 **같은 자리(왼쪽 아래)**에 붙인다(작업 246, `plusBadge.ts`).
    appendPlusBadge(cell, item);
    const owner = itemJob(item);
    if (owner) {
      // 30~40px 칸에서는 등급 배지가 왼쪽 위를 쓰므로 직업 배지는 한 글자(`전`·`궁`·`법`)로 오른쪽 아래.
      const badge = document.createElement('span'); badge.className = `job-badge job-${owner}`;
      badge.textContent = jobShortNames[owner]; badge.title = `${jobNames[owner]} 전용`;
      badge.setAttribute('aria-hidden', 'true'); cell.append(badge);
    }
    if (isEquipment(item) && item.locked) {
      const badge = document.createElement('span'); badge.className = 'lock-icon is-locked bag-lock-badge';
      badge.setAttribute('aria-hidden', 'true'); cell.append(badge);
    }
    const name = itemDisplayName(item);
    const where = side === 'storage' ? '공용창고' : '가방';
    cell.setAttribute('aria-label', `${where} · ${name}${stack.items.length > 1 ? ` · ${stack.items.length}개` : ''} · ${rarityNames[item.rarity]}${owner ? ` · ${jobNames[owner]} 전용` : ''}${isEquipment(item) && item.locked ? ' · 잠긴 장비' : ''}${upgrade ? ' · 지금 장착한 장비보다 좋음' : ''}${downgrade ? ' · 지금 장착한 장비보다 약함' : ''}`);
    cell.setAttribute('aria-pressed', String(state.picked.has(key)));
    cell.title = name;
    cell.onclick = () => tap(ui, side, stack);
    grid.append(cell);
  }
  if (!stacks.length) {
    const empty = document.createElement('p'); empty.className = 'empty';
    empty.textContent = side === 'storage' ? '공용창고가 비어 있습니다.' : '가방에 아이템이 없습니다.';
    grid.append(empty);
  }
}

function tap(ui: Interface, side: WarehouseSide, stack: Stack): void {
  const state = warehouseState(ui);
  const key = keyOf(side, stack.key);
  // [작업 246] 탭 = **바로 선택**이다. 모드 버튼이 없어졌고, 고른 칸은 상세 바에도 띄운다(정보는
  // 그대로 볼 수 있고, 같은 칸을 다시 탭하면 선택이 풀린다).
  if (state.picked.has(key)) state.picked.delete(key);
  else {
    // 한 번에 한 쪽만 고른다 — 가방에서 고른 것을 창고에서 고르면 섞이지 않게 지운다.
    for (const [pickedKey, pickedSide] of [...state.picked]) if (pickedSide !== side) state.picked.delete(pickedKey);
    state.picked.set(key, side);
  }
  state.focus = { side, key: stack.key };
  repaint(ui);
}

/** 그리드·상세만 다시 그린다 — 화면 전체(`renderModal`)를 다시 만들지 않아 스크롤과 스크롤 위치가 그대로다. */
function repaint(ui: Interface): void {
  painters.get(ui)?.();
}

/** 이동 요청을 줄 세워 보낸다. 응답이 오면 창고 목록·가방을 그 자리에서 맞추고 그리드만 다시 그린다. */
function move(ui: Interface, side: WarehouseSide, ids: string[]): void {
  const state = warehouseState(ui);
  if (!ids.length) return;
  const action = side === 'bag' ? 'deposit' : 'withdraw';
  const generation = generationOf(ui);
  const queued = movePlan(ui, side, ids);
  // 옮길 수 있는 게 하나도 없으면 요청을 보내지 않고 이유를 알려 준다(작업 258).
  if (!queued.ids.length) {
    ui.message(side === 'bag' ? '공용창고가 가득 차 보관할 수 없습니다.' : '가방이 가득 차 꺼낼 수 없습니다.');
    return;
  }
  for (const id of ids) state.busy.add(id);
  state.moving++;
  repaint(ui);
  const run = async (): Promise<void> => {
    // 캐릭터가 바뀌어 큐를 버렸으면 이 요청은 실행하지 않는다(작업 258) — 잠금 표시는 버릴 때 이미 지웠다.
    if (generationOf(ui) !== generation) return;
    // 큐에서 기다리는 사이 앞선 이동이 끝나 창고·가방이 바뀌었다 — 보내기 직전에 칸을 다시 본다.
    const plan = movePlan(ui, side, ids);
    if (!plan.ids.length) {
      ui.message(side === 'bag' ? '공용창고가 가득 차 보관할 수 없습니다.' : '가방이 가득 차 꺼낼 수 없습니다.');
      return;
    }
    try {
      const result = await ui.market.sync.transferWarehouse(action, plan.ids);
      if (generationOf(ui) !== generation) return;
      if (result.items) ui.warehouseItems = result.items;
      // 응답이 오면 창고 목록·가방이 이미 새 상태다 — 옮긴 칸의 선택을 바로 비우고(작업 250) 그리드를 즉시 다시 그린다.
      // 칸이 모자라 일부만 옮겼으면 남은 칸은 그대로 골라 둔 채 다시 누를 수 있게 둔다(작업 258).
      if (plan.overflow === 0) for (const [key, pickedSide] of [...state.picked]) if (pickedSide === side) state.picked.delete(key);
      ui.renderStatus(); ui.renderBagBadge();
      if (state.focus && state.focus.side === side) {
        const stacks = stacksOf(side === 'bag' ? ui.world.save.bag : ui.warehouseItems ?? [], jobOrDefault(ui.world.save.job));
        if (!stacks.some(stack => stack.key === state.focus!.key)) state.focus = undefined;
      }
      repaint(ui);
      ui.message(plan.overflow > 0
        ? `공간이 모자라 ${plan.ids.length}개만 옮겼습니다. 나머지 ${plan.overflow}개는 다시 옮겨 주세요.`
        : result.message || (action === 'deposit' ? '공용창고에 보관했습니다.' : '가방으로 가져왔습니다.'));
    } catch (error) {
      ui.message(error instanceof Error ? error.message : String(error));
      // 응답을 받은 실패(409 등)는 화면과 서버가 어긋났다는 뜻이다 — 목록을 **비우지 않고** 서버 기준으로 조용히
      // 다시 읽는다(예전에는 `warehouseItems = undefined`로 지워 `불러오는 중…`이 화면을 덮었다 — 작업 258).
      if (error instanceof Error && 'status' in error) void loadWarehouse(ui);
    } finally {
      if (generationOf(ui) === generation) {
        for (const id of ids) state.busy.delete(id);
        state.moving = Math.max(0, state.moving - 1);
        repaint(ui);
      }
    }
  };
  const previous = queues.get(ui) ?? Promise.resolve();
  queues.set(ui, previous.then(run, run));
}

function cellIcon(ui: Interface, item: Item): string {
  if (isPouch(item)) return pouchIconMarkup('item-icon');
  if (isEquipment(item)) {
    const art = equipmentImage(item);
    if (art.columns === 5) return `<span class="item-icon atlas-icon" style="background-image:url('${art.path}');background-position:${art.frame * 25}% center" aria-hidden="true"></span>`;
  }
  return `<img class="item-icon" src="${ui.iconPath(item.slot, item)}" alt="">`;
}

function paintDetail(ui: Interface, save: Save, detail: HTMLElement, state: WarehouseState, paint: () => void): void {
  const focus = state.focus;
  const stacks = focus ? stacksOf(focus.side === 'storage' ? ui.warehouseItems ?? [] : save.bag, jobOrDefault(save.job)) : [];
  const stack = focus ? stacks.find(entry => entry.key === focus.key) : undefined;
  if (!focus || !stack) { detail.hidden = true; detail.replaceChildren(); return; }
  // 선택한 칸이 2개 이상이면 상세 바 버튼도 **선택한 칸 전부**를 대상으로 한다(작업 250) — 마지막으로 탭한
  // 1개만 옮겨서 사용자가 헷갈렸다. 1개(또는 스택 한 칸)만 골랐을 때는 예전 `꺼내기`/`보관하기` 그대로다.
  const pickedIds = pickIds(state, focus.side, stacks);
  const item = stack.items[0];
  detail.hidden = false; detail.replaceChildren();
  const head = document.createElement('div'); head.className = 'warehouse-detail-head';
  const name = document.createElement('b'); name.textContent = itemDisplayName(item);
  const grade = document.createElement('span'); grade.className = `warehouse-grade rarity-${item.rarity}`;
  grade.textContent = rarityNames[item.rarity];
  head.append(name, grade);
  const meta = document.createElement('small'); meta.className = 'warehouse-detail-meta';
  const parts: string[] = [focus.side === 'storage' ? '공용창고' : '내 가방'];
  if (isSkillBook(item)) {
    parts.push('스킬북');
    const owner = skillBookJob(item);
    if (owner) parts.push(`${jobNames[owner]} 전용`);
  } else if (isPouch(item)) {
    parts.push('보물 주머니');
  } else {
    parts.push(slotNameFor(item.slot, jobOrDefault(save.job)));
    const owner = itemJob(item);
    if (owner) parts.push(`${jobNames[owner]} 전용${owner === jobOrDefault(save.job) ? ' · 내 직업' : ' · 사용 불가'}`);
    if (item.locked) parts.push('잠긴 장비');
  }
  if (stack.items.length > 1) parts.push(`${stack.items.length}개`);
  // 여러 칸을 골랐으면 상세 바가 몇 개를 함께 옮기는지 미리 밝혀 둔다(작업 250).
  if (pickedIds.length > 1) parts.push(`선택 ${pickedIds.length}개`);
  meta.textContent = parts.join(' · ');
  detail.append(head, meta);
  if (isEquipment(item)) {
    const entries = Object.entries(item.stats) as [Stat, number][];
    if (entries.length) {
      const stats = document.createElement('div'); stats.className = 'warehouse-detail-stats';
      for (const [stat, value] of entries) {
        const line = document.createElement('span'); line.textContent = `${statNames[stat]} +${value}`; stats.append(line);
      }
      // 추가옵션(작업 238) — 창고에 넣어 둔 장비도 상세에서 옵션을 확인할 수 있다.
      for (const extra of extraOptionLines(item)) {
        const line = document.createElement('span'); line.className = 'warehouse-extra'; line.textContent = extra; stats.append(line);
      }
      detail.append(stats);
    }
  } else {
    const note = document.createElement('p'); note.className = 'warehouse-detail-note';
    note.textContent = isPouch(item)
      ? '열면 금화 · 장비 · 스킬북 중 하나가 나옵니다. 개봉은 가방에서 합니다.'
      : '스킬북은 가방이나 공용창고에 보관할 수 있습니다. 내 직업 책은 스킬 창에서 사용합니다.';
    detail.append(note);
  }
  const actions = document.createElement('div'); actions.className = 'warehouse-detail-actions';
  const multi = pickedIds.length > 1;
  const targetIds = multi ? pickedIds : stack.items.map(entry => entry.id);
  const moving = targetIds.some(id => state.busy.has(id));
  // 대상 칸의 남은 자리를 넘기면 **남은 만큼만** 보낸다(작업 258) — 예전에는 넘기는 순간 버튼을 잠가 버렸다.
  const plan = movePlan(ui, focus.side, targetIds);
  const verb = focus.side === 'storage' ? '꺼내기' : '보관하기';
  const selectVerb = focus.side === 'storage' ? '꺼내기' : '보관';
  const moveButton = document.createElement('button'); moveButton.type = 'button'; moveButton.className = 'warehouse-move';
  // 옮기는 중에는 버튼 문구도 "지금 하고 있다"로 바뀐다(작업 253, 사용자 제보 "로딩인지 모르겠음").
  moveButton.textContent = moving
    ? (focus.side === 'storage' ? '꺼내는 중…' : '보관 중…')
    : multi
      ? (plan.overflow > 0 || plan.ids.length === 0 ? `선택 ${selectVerb} (${plan.ids.length}/${plan.requested})` : `선택 ${selectVerb} (${pickedIds.length})`)
      : (plan.overflow > 0 || plan.ids.length === 0
        ? `${verb} (${plan.ids.length}/${plan.requested})`
        : `${verb}${stack.items.length > 1 ? ` (${stack.items.length})` : ''}`);
  moveButton.disabled = moving || plan.ids.length === 0;
  if (moving) moveButton.title = '이동 결과를 기다리는 중입니다.';
  else if (plan.ids.length === 0) moveButton.title = focus.side === 'bag' ? '공용창고가 가득 찼습니다.' : '가방이 가득 차 꺼낼 수 없습니다.';
  else if (plan.overflow > 0) moveButton.title = `남은 칸(${plan.free})만큼 ${plan.ids.length}개를 먼저 옮기고, 나머지 ${plan.overflow}개는 다시 옮겨 주세요.`;
  else if (multi) moveButton.title = `선택한 ${pickedIds.length}개를 한꺼번에 ${focus.side === 'storage' ? '가방으로 꺼냅니다' : '공용창고에 보관합니다'}.`;
  moveButton.onclick = () => move(ui, focus.side, targetIds);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'warehouse-detail-close';
  close.textContent = '닫기';
  close.onclick = () => { state.focus = undefined; paint(); };
  actions.append(moveButton, close);
  detail.append(actions);
}
