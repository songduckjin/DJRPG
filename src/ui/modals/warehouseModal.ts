/**
 * 공용창고 모달 (작업 225) — 장비창 가방과 같은 아이콘 슬롯 그리드로 다시 만들었다.
 *
 * 예전 화면(`charactersModal.renderWarehouse`)은 아이콘·등급색 없이 이름 줄만 늘어놓았고,
 * 아이템 하나를 옮길 때마다 `ui.warehouseItems = undefined`로 목록을 지우고 `loadWarehouse`를
 * 다시 불러 **"공용창고를 불러오는 중…"이 화면을 덮었다**(스크롤도 처음으로 돌아갔다).
 *
 * 지금은 이동 뒤에도 목록을 비우지 않는다 — 서버가 응답에 실어 준 `items`(창고 목록)와
 * `save`(가방)로 인메모리 상태를 바로 맞추고 그리드만 다시 그린다. 옮기는 동안에는 그 칸만
 * 잠깐 흐려지고(`is-busy`) 나머지는 그대로다. 여러 개는 `선택` 모드로 골라 한 요청(`itemIds`)으로
 * 한꺼번에 옮긴다. `equipModal.ts`는 건드리지 않고 그리드 모양(`.bag-grid`·`.bag-item`)과
 * 헬퍼(`iconPath`)만 빌려 쓴다.
 */
import { equipmentCount } from '../../game/bagCapacity';
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from '../../game/appVersion';
import {
  equipmentImage, isEquipment, isPouch, isSkillBook, itemDisplayName, itemJob, plusOf,
  rarityNames, skillBookJob, slotNameFor, statNames, type Item, type Stat
} from '../../game/items';
import { jobNames, jobOrDefault } from '../../game/skills';
import type { Save } from '../../game/store';
import { pouchIconMarkup } from '../pouchArt';
import type { Interface } from '../interface';

export type WarehouseSide = 'storage' | 'bag';

/** 같은 주머니·같은 스킬북은 한 칸에 `×N`으로 모은다(개별 id는 그대로 남아 일괄 이동 때 함께 나간다). */
type Stack = { key: string; items: Item[] };

type WarehouseState = {
  /** `빠른 이동` — 상세 없이 탭 한 번에 반대편으로 옮긴다. */
  quick: boolean;
  /** `선택` — 여러 칸을 골라 한 번에 옮긴다. `quick`과는 함께 켜지지 않는다. */
  select: boolean;
  /** 고른 칸 — 키는 `bag:`/`storage:` 접두사가 붙은 스택 키, 값은 그 쪽(side). */
  picked: Map<string, WarehouseSide>;
  /** 상세 바에 띄운 칸. */
  focus?: { side: WarehouseSide; key: string };
  /** 지금 서버 응답을 기다리는 아이템 id — 그 칸만 잠깐 흐리게 한다. */
  busy: Set<string>;
  error?: string;
};

const states = new WeakMap<Interface, WarehouseState>();
/** 지금 그려진 창고 화면의 다시 그리기 — 탭·이동 뒤에 화면 전체를 갈아 끼우지 않고 그리드·상세만 손본다(스크롤 유지). */
const painters = new WeakMap<Interface, () => void>();
/** 이동은 한 번에 하나씩 — 서버가 `pendingWarehouse`로 재확인하므로 줄을 세워 보낸다. */
const queues = new WeakMap<Interface, Promise<void>>();

export function warehouseState(ui: Interface): WarehouseState {
  let state = states.get(ui);
  if (!state) { state = { quick: false, select: false, picked: new Map(), busy: new Set() }; states.set(ui, state); }
  return state;
}

/** 창고를 새로 열 때 — 선택·상세·잠금 표시는 남기지 않는다(빠른 이동 설정만 기억). */
export function resetWarehouse(ui: Interface): void {
  const state = warehouseState(ui);
  state.select = false; state.picked.clear(); state.focus = undefined; state.busy.clear(); state.error = undefined;
}

const keyOf = (side: WarehouseSide, stackKey: string): string => `${side}:${stackKey}`;
const sideOf = (key: string): WarehouseSide => key.startsWith('storage:') ? 'storage' : 'bag';
const stackKeyOf = (key: string): string => key.slice(sideOf(key).length + 1);

function stackKey(item: Item): string {
  if (isPouch(item)) return 'pouch';
  if (isSkillBook(item)) return `book:${item.skillId ?? item.name}`;
  return `item:${item.id}`;
}

function stacksOf(items: Item[]): Stack[] {
  const order: string[] = []; const map = new Map<string, Stack>();
  for (const item of items) {
    const key = stackKey(item);
    const stack = map.get(key);
    if (stack) stack.items.push(item);
    else { map.set(key, { key, items: [item] }); order.push(key); }
  }
  return order.map(key => map.get(key)!);
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
  const quick = document.createElement('button'); quick.type = 'button'; quick.className = 'warehouse-mode warehouse-quick';
  const select = document.createElement('button'); select.type = 'button'; select.className = 'warehouse-mode warehouse-select';
  const depositPicked = document.createElement('button'); depositPicked.type = 'button'; depositPicked.className = 'warehouse-batch warehouse-deposit-picked';
  const withdrawPicked = document.createElement('button'); withdrawPicked.type = 'button'; withdrawPicked.className = 'warehouse-batch warehouse-withdraw-picked';
  // 새로고침은 도구 줄 오른쪽 끝에 둔다 — 아래에 따로 두면 그만큼 그리드가 좁아진다.
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'warehouse-refresh';
  reset.textContent = '새로고침';
  reset.title = '공용창고 목록을 서버에서 다시 읽습니다.';
  reset.onclick = () => { ui.warehouseItems = undefined; painters.delete(ui); ui.renderModal(); void loadWarehouse(ui); };
  tools.append(quick, select, depositPicked, withdrawPicked, reset);

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
    storageStacks = stacksOf(ui.warehouseItems ?? []);
    bagStacks = stacksOf(save.bag);
    const known = { storage: new Set(storageStacks.map(stack => stack.key)), bag: new Set(bagStacks.map(stack => stack.key)) };
    // 서버 목록이 바뀌었으면 사라진 칸의 선택·상세는 버린다.
    for (const [key, side] of [...state.picked]) if (!known[side].has(stackKeyOf(key))) state.picked.delete(key);
    if (state.focus && !known[state.focus.side].has(state.focus.key)) state.focus = undefined;

    const warehouseCount = (ui.warehouseItems ?? []).length;
    const bagCount = equipmentCount(save.bag, save.job);
    gold.textContent = `계정 공용 금화 ${save.gold.toLocaleString('ko-KR')}`;
    counts.textContent = `공용창고 ${warehouseCount}/40 · 가방 ${bagCount}/40`;
    counts.title = '가방 40칸은 장비와 다른 직업 전용 스킬북을 함께 세고, 내 직업 스킬북·보물 주머니는 세지 않습니다.';
    storageHeading.textContent = `공용창고 ${warehouseCount}/40`;
    bagHeading.textContent = `내 가방 ${bagCount}/40`;

    quick.textContent = `빠른 이동 ${state.quick ? '켬' : '끔'}`;
    quick.classList.toggle('is-on', state.quick);
    quick.setAttribute('aria-pressed', String(state.quick));
    quick.setAttribute('aria-label', `빠른 이동 ${state.quick ? '켜짐' : '꺼짐'}. 켜면 상세창 없이 탭 한 번에 반대편으로 옮깁니다`);
    select.textContent = `선택 ${state.select ? '켬' : '끔'}`;
    select.classList.toggle('is-on', state.select);
    select.setAttribute('aria-pressed', String(state.select));
    select.setAttribute('aria-label', `선택 모드 ${state.select ? '켜짐' : '꺼짐'}. 켜면 여러 칸을 골라 한 번에 옮깁니다`);

    const idsOn = (side: WarehouseSide): string[] => pickIds(state, side, side === 'bag' ? bagStacks : storageStacks);
    const bagIds = idsOn('bag'), storageIds = idsOn('storage');
    const showDeposit = state.select && bagIds.length > 0;
    const showWithdraw = state.select && storageIds.length > 0;
    depositPicked.hidden = !showDeposit; withdrawPicked.hidden = !showWithdraw;
    depositPicked.textContent = `선택 보관 (${bagIds.length})`;
    withdrawPicked.textContent = `선택 꺼내기 (${storageIds.length})`;
    const depositFull = warehouseCount + bagIds.length > 40;
    depositPicked.disabled = depositFull;
    depositPicked.title = depositFull ? '공용창고가 가득 차 선택한 만큼 보관할 수 없습니다.' : `${bagIds.length}개를 공용창고에 보관합니다.`;
    withdrawPicked.disabled = false;

    paintGrid(ui, storageGrid, 'storage', storageStacks, state);
    paintGrid(ui, bagGrid, 'bag', bagStacks, state);
    paintDetail(ui, save, detail, state, paint);
  };

  quick.onclick = () => {
    state.quick = !state.quick;
    if (state.quick) { state.select = false; state.picked.clear(); state.focus = undefined; }
    paint();
  };
  select.onclick = () => {
    state.select = !state.select;
    if (state.select) { state.quick = false; state.focus = undefined; }
    state.picked.clear(); paint();
  };
  depositPicked.onclick = () => {
    const ids = pickIds(state, 'bag', bagStacks);
    if (!ids.length) return;
    for (const [key, side] of [...state.picked]) if (side === 'bag') state.picked.delete(key);
    move(ui, 'bag', ids);
  };
  withdrawPicked.onclick = () => {
    const ids = pickIds(state, 'storage', storageStacks);
    if (!ids.length) return;
    for (const [key, side] of [...state.picked]) if (side === 'storage') state.picked.delete(key);
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
    cell.innerHTML = cellIcon(ui, item);
    if (stack.items.length > 1) {
      const badge = document.createElement('span'); badge.className = 'skillbook-count';
      badge.textContent = `×${stack.items.length}`; cell.append(badge);
    }
    const plus = plusOf(item);
    if (plus > 0) {
      const badge = document.createElement('span'); badge.className = 'item-plus warehouse-plus';
      badge.textContent = `+${plus}`; cell.append(badge);
    }
    const owner = itemJob(item);
    if (owner) {
      const badge = document.createElement('span'); badge.className = `job-badge job-${owner}`;
      badge.textContent = jobNames[owner]; badge.setAttribute('aria-hidden', 'true'); cell.append(badge);
    }
    if (isEquipment(item) && item.locked) {
      const badge = document.createElement('span'); badge.className = 'lock-icon is-locked bag-lock-badge';
      badge.setAttribute('aria-hidden', 'true'); cell.append(badge);
    }
    const name = itemDisplayName(item);
    const where = side === 'storage' ? '공용창고' : '가방';
    cell.setAttribute('aria-label', `${where} · ${name}${stack.items.length > 1 ? ` · ${stack.items.length}개` : ''} · ${rarityNames[item.rarity]}${owner ? ` · ${jobNames[owner]} 전용` : ''}${isEquipment(item) && item.locked ? ' · 잠긴 장비' : ''}`);
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
  if (state.select) {
    if (state.picked.has(key)) state.picked.delete(key);
    else {
      // 한 번에 한 쪽만 고른다 — 가방에서 고른 것을 창고에서 고르면 섞이지 않게 지운다.
      for (const [pickedKey, pickedSide] of [...state.picked]) if (pickedSide !== side) state.picked.delete(pickedKey);
      state.picked.set(key, side);
    }
    repaint(ui);
    return;
  }
  if (state.quick) { move(ui, side, stack.items.map(item => item.id)); return; }
  state.focus = state.focus && state.focus.side === side && state.focus.key === stack.key ? undefined : { side, key: stack.key };
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
  for (const id of ids) state.busy.add(id);
  repaint(ui);
  const run = async (): Promise<void> => {
    try {
      const result = await ui.market.sync.transferWarehouse(action, ids);
      if (result.items) ui.warehouseItems = result.items;
      ui.renderStatus(); ui.renderBagBadge();
      if (state.focus && state.focus.side === side) {
        const stacks = stacksOf(side === 'bag' ? ui.world.save.bag : ui.warehouseItems ?? []);
        if (!stacks.some(stack => stack.key === state.focus!.key)) state.focus = undefined;
      }
      ui.message(result.message || (action === 'deposit' ? '공용창고에 보관했습니다.' : '가방으로 가져왔습니다.'));
    } catch (error) {
      ui.message(error instanceof Error ? error.message : String(error));
      // 409(소유 상태·가득 참)는 화면과 서버가 어긋났다는 뜻이다 — 서버 기준으로 다시 읽는다.
      const code = error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code ?? '') : '';
      if (code) { ui.warehouseItems = undefined; void loadWarehouse(ui); }
    } finally {
      for (const id of ids) state.busy.delete(id);
      repaint(ui);
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
  const stacks = focus ? stacksOf(focus.side === 'storage' ? ui.warehouseItems ?? [] : save.bag) : [];
  const stack = focus ? stacks.find(entry => entry.key === focus.key) : undefined;
  if (!focus || !stack) { detail.hidden = true; detail.replaceChildren(); return; }
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
  meta.textContent = parts.join(' · ');
  detail.append(head, meta);
  if (isEquipment(item)) {
    const entries = Object.entries(item.stats) as [Stat, number][];
    if (entries.length) {
      const stats = document.createElement('div'); stats.className = 'warehouse-detail-stats';
      for (const [stat, value] of entries) {
        const line = document.createElement('span'); line.textContent = `${statNames[stat]} +${value}`; stats.append(line);
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
  const moving = stack.items.some(entry => state.busy.has(entry.id));
  const full = focus.side === 'bag' && (ui.warehouseItems?.length ?? 0) + stack.items.length > 40;
  const moveButton = document.createElement('button'); moveButton.type = 'button'; moveButton.className = 'warehouse-move';
  moveButton.textContent = `${focus.side === 'storage' ? '꺼내기' : '보관하기'}${stack.items.length > 1 ? ` (${stack.items.length})` : ''}`;
  moveButton.disabled = moving || full;
  if (full) moveButton.title = '공용창고가 가득 찼습니다.';
  moveButton.onclick = () => move(ui, focus.side, stack.items.map(entry => entry.id));
  const close = document.createElement('button'); close.type = 'button'; close.className = 'warehouse-detail-close';
  close.textContent = '닫기';
  close.onclick = () => { state.focus = undefined; paint(); };
  actions.append(moveButton, close);
  detail.append(actions);
}
