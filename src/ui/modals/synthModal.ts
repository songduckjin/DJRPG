import { createSkillBookArt } from '../skillBookArt';
import { skillbookName } from '../skillbookBag';
import { createPouchLight } from '../pouchLight';
import { skillBookJob, type SkillBook } from '../../game/items';
import { jobNames, jobOrDefault } from '../../game/skills';
import {
  stackSynthBooks, synthCapacity, synthMaterials, synthesizeAllAvailable, synthesizeSkillBooks,
  SYNTH_BOOK_COST, type SynthOutcome
} from '../../game/skillSynth';
import type { Interface } from '../interface';

/**
 * 작은 스킬북 합성 팝업 (작업 251, 사용자 확정).
 *
 * 사용자 지시: "가방에 합성버튼추가해서 타직업스킬북 5개당 내직업 랜덤1개로 합성가능 합성버튼누르면
 * 작은팝업추가되고 5개합성모션넣고 랜덤으로 한개뜨게할껀데 … 간단하게 5권 배열하고 가운데로모여서
 * 빛나면서 터지는모션넣고 허물벗고 새책이등장하는모션어때?"
 * 이어서 "빈칸 5칸 표시 · `자동 합성` · 합성 가능한 수만큼 한꺼번에 결과 나열"을 추가로 확정했다.
 *
 * 화면 구성:
 *  - 위: **빈칸 5개**(선택 전에는 점선 테두리) — 아래 목록에서 고르면 하나씩 채워진다.
 *  - 가운데: 가방의 **타직업 스킬북 목록**(누르면 칸에 들어가고, 다시 누르면 빠진다).
 *  - 아래: `자동 채우기` · `합성하기` · `자동 합성 (N회)` · `닫기`.
 *
 * 연출(총 0.9초, `SYNTH_MOTION_MS`):
 *  0ms   두 줄로 늘어선 5권이 **가운데 한 점으로 쑥 모여들며** 겹친다(각 책의 실제 거리를 재어 `--synth-dx`로 옮긴다).
 *  280ms 중앙에서 빛이 차오르고(`is-charging`), Canvas 흰빛·입자가 고조된다.
 *  560ms **팡!** — 순백 섬광(`is-burst`)과 함께 **허물(종이 조각)이 사방으로 흩어지고**, 그 속에서 결과 책이 나온다.
 *  620ms 결과 카드(내 직업 책 1권, 자동 합성은 N권 전부)가 드러난다.
 *  900ms 버튼 잠금 해제.
 *
 * 세이브 차감은 **누르는 즉시 한 번만** 하고(연출은 화면만), 연출이 끝날 때까지 버튼을 잠가 두 번 합성되지
 * 않게 한다. `prefers-reduced-motion`이면 연출 없이 결과가 바로 보인다.
 */

export const SYNTH_GATHER_MS = 280;
/** 빛이 터지는(섬광·허물이 흩어지는) 시각. */
export const SYNTH_BURST_MS = 560;
/** 결과 카드가 드러나는 시각 — 섬광이 가라앉는 사이에 책이 나타난다. */
export const SYNTH_RESULT_MS = 620;
/** 연출 전체 길이 — 이 뒤에 버튼 잠금이 풀린다. */
export const SYNTH_MOTION_MS = 900;

type SynthWindowOptions = { /** 연출 길이 — 테스트가 0으로 줄인다. */ delay?: number };
export type SynthWindowApi = { overlay: HTMLElement; close: () => void; craft: (all: boolean) => void; slots: HTMLElement; result: HTMLElement };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function button(text: string, className: string): HTMLButtonElement {
  const node = element('button', className, text);
  node.type = 'button';
  return node;
}

/** 재료 칸 하나 — 책 그림 + 이름 + 직업 배지. */
function materialCell(book: SkillBook, picked: boolean): HTMLButtonElement {
  const cell = button('', `synth-material${picked ? ' is-picked' : ''}`);
  const owner = skillBookJob(book);
  cell.append(createSkillBookArt(book));
  if (owner) {
    const badge = element('span', `job-badge job-${owner}`, jobNames[owner]);
    badge.setAttribute('aria-hidden', 'true'); cell.append(badge);
  }
  cell.append(element('small', 'synth-material-name', skillbookName(book)));
  cell.setAttribute('aria-pressed', String(picked));
  cell.setAttribute('aria-label', `${skillbookName(book)}${owner ? ` · ${jobNames[owner]} 전용` : ''}${picked ? ' · 선택됨' : ''}`);
  return cell;
}

/** 결과 책 한 칸 — 같은 책은 `×N`. */
function resultCell(book: SkillBook, count: number): HTMLElement {
  const cell = element('div', 'synth-result-item');
  cell.append(createSkillBookArt(book));
  const name = element('b', 'synth-result-name', skillbookName(book));
  cell.append(name);
  if (count > 1) cell.append(element('em', 'synth-result-count', `×${count}`));
  return cell;
}

/**
 * 팝업을 연다. `ui.root`에 한 겹으로 얹고(주머니 개봉 창과 같은 방식), 장비창이 닫히면 함께 닫힌다.
 */
export function openSynthWindow(ui: Interface, options: SynthWindowOptions = {}): SynthWindowApi {
  const delay = options.delay ?? SYNTH_MOTION_MS;
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const save = ui.world.save;

  const overlay = element('div', 'synth-window');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '스킬북 합성');
  const card = element('div', 'synth-window-card');

  const top = element('div', 'synth-window-top');
  const title = element('h3', 'synth-window-title', '스킬북 합성');
  const closeButton = button('×', 'synth-window-close');
  closeButton.setAttribute('aria-label', '닫기');
  top.append(element('span', 'synth-top-blank'), title, closeButton);

  // 빈칸 5개 — 선택 전에도 늘 보인다(사용자 확정).
  const slots = element('div', 'synth-slots');
  slots.setAttribute('role', 'group');
  slots.setAttribute('aria-label', `합성 재료 ${SYNTH_BOOK_COST}칸`);
  const slotNodes: HTMLButtonElement[] = [];
  for (let index = 0; index < SYNTH_BOOK_COST; index++) {
    const slot = button('', 'synth-slot');
    slot.dataset.slot = String(index);
    slot.append(element('span', 'synth-slot-plus', '+'));
    slot.onclick = () => { removeAt(index); };
    slotNodes.push(slot); slots.append(slot);
  }

  const stage = element('div', 'synth-stage');
  stage.append(slots);
  const flash = element('span', 'synth-flash');
  flash.setAttribute('aria-hidden', 'true');
  const glow = element('span', 'synth-glow');
  glow.setAttribute('aria-hidden', 'true');
  const husks = element('span', 'synth-husks');
  husks.setAttribute('aria-hidden', 'true');
  const light = reducedMotion ? null : createPouchLight('#ffffff');
  stage.append(glow);
  if (light) stage.append(light.canvas);
  stage.append(husks, flash);

  const hint = element('p', 'synth-window-hint', `타직업 전용 스킬북 ${SYNTH_BOOK_COST}권 → 내 직업 스킬북 1권 (비용 없음)`);
  const countLabel = element('p', 'synth-window-count');
  const error = element('p', 'synth-window-error'); error.hidden = true;
  const result = element('div', 'synth-result');
  result.setAttribute('aria-live', 'polite');

  const listWrap = element('div', 'synth-materials-wrap');
  const listHeading = element('p', 'synth-materials-heading');
  const list = element('div', 'synth-materials');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', '가방의 타직업 스킬북');
  listWrap.append(listHeading, list);

  const actions = element('div', 'synth-window-actions');
  const fillButton = button('자동 채우기', 'synth-fill');
  const craftButton = button('합성하기', 'synth-craft is-primary');
  const autoButton = button('자동 합성', 'synth-auto');
  const closeAction = button('닫기', 'synth-close');
  actions.append(fillButton, craftButton, autoButton, closeAction);

  card.append(top, stage, hint, error, result, countLabel, listWrap, actions);
  overlay.append(card);

  // 고른 재료 5칸(빈 칸은 undefined) — `id`는 가방 아이템 그대로다(사용·저장은 개별 id로).
  let picked: (string | undefined)[] = Array.from({ length: SYNTH_BOOK_COST }, () => undefined);
  let animating = false, closed = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number): void => { timers.push(setTimeout(fn, ms)); };

  const materials = (): SkillBook[] => synthMaterials(save);
  const pickedIds = (): string[] => picked.filter((id): id is string => !!id);

  const close = (): void => {
    closed = true;
    while (timers.length) clearTimeout(timers.pop() as ReturnType<typeof setTimeout>);
    light?.stop();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('keydown', onKey, true);
    observer?.disconnect();
    overlay.remove?.();
    if (ui.openModal === 'equipment') ui.renderModal();
  };
  const onKey = (event: Event): void => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    event.preventDefault(); event.stopImmediatePropagation?.();
    close();
  };
  let observer: MutationObserver | undefined;
  if (typeof MutationObserver !== 'undefined' && ui.modal) {
    observer = new MutationObserver(() => { if (ui.modal.hidden) close(); });
    observer.observe(ui.modal, { attributes: true, attributeFilter: ['hidden'] });
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('keydown', onKey, true);

  /** 결과 카드 — `합성 결과 N권`과 책 목록. */
  const showResult = (outcome: Extract<SynthOutcome, { ok: true }>): void => {
    result.replaceChildren();
    const stacks = stackSynthBooks(outcome.books);
    result.append(element('p', 'synth-result-title', outcome.books.length > 1 ? `합성 결과 ${outcome.books.length}권` : '합성 결과'));
    const grid = element('div', 'synth-result-list');
    stacks.forEach((stack, index) => {
      const cell = resultCell(stack.book, stack.count);
      // 결과가 여럿이면 살짝 시차를 두고 하나씩 떠오른다(모션 감소면 바로).
      if (!reducedMotion) cell.style.setProperty('--synth-index', String(index));
      grid.append(cell);
    });
    result.append(grid);
    result.dataset.count = String(outcome.books.length);
    result.classList.add('is-shown');
  };

  /** 칸과 목록을 지금 세이브에 맞춰 다시 그린다(연출이 끝난 뒤 부른다). */
  const refresh = (): void => {
    const books = materials();
    // 세이브에서 사라진 재료는 칸에서도 뺀다.
    const alive = new Set(books.map(book => book.id));
    picked = picked.map(id => id && alive.has(id) ? id : undefined);
    const capacity = synthCapacity(save);
    countLabel.textContent = `타직업 스킬북 ${books.length}권 · 내 직업 ${jobNames[jobOrDefault(save.job)]}`;
    listHeading.textContent = books.length
      ? `가방의 타직업 스킬북 ${books.length}권 · 누르면 위 칸에 들어갑니다`
      : '가방에 타직업 스킬북이 없습니다';
    list.replaceChildren(...books.map(book => {
      const cell = materialCell(book, picked.includes(book.id));
      cell.dataset.itemId = book.id;
      cell.onclick = () => { toggle(book.id); };
      return cell;
    }));
    for (const [index, slot] of slotNodes.entries()) {
      const id = picked[index];
      const book = id ? books.find(entry => entry.id === id) : undefined;
      slot.classList.toggle('is-filled', !!book);
      slot.replaceChildren();
      if (book) {
        slot.append(createSkillBookArt(book), element('small', 'synth-slot-name', skillbookName(book)));
        slot.setAttribute('aria-label', `${skillbookName(book)} · 재료 ${index + 1}번째. 누르면 뺍니다`);
      } else {
        slot.append(element('span', 'synth-slot-plus', '+'));
        slot.setAttribute('aria-label', `재료 ${index + 1}번째 빈칸`);
      }
      slot.classList.remove('is-gathered');
      (slot.firstElementChild as HTMLElement | null)?.style.removeProperty('--synth-dx');
    }
    const charges = pickedIds().length;
    craftButton.disabled = animating || charges !== SYNTH_BOOK_COST;
    craftButton.textContent = charges === SYNTH_BOOK_COST ? '합성하기' : `합성하기 (${charges}/${SYNTH_BOOK_COST})`;
    fillButton.disabled = animating || books.length - picked.filter(Boolean).length <= 0;
    autoButton.disabled = animating || capacity < 1;
    autoButton.textContent = `자동 합성 (${capacity}회)`;
    autoButton.classList.toggle('is-ready', capacity > 0);
  };

  const toggle = (id: string): void => {
    if (animating) return;
    const at = picked.indexOf(id);
    if (at >= 0) { picked[at] = undefined; refresh(); return; }
    const empty = picked.indexOf(undefined);
    if (empty < 0) { error.textContent = `재료 칸 ${SYNTH_BOOK_COST}칸이 가득 찼습니다. 한 권을 빼고 골라 주세요.`; error.hidden = false; return; }
    error.hidden = true; picked[empty] = id; refresh();
  };
  const removeAt = (index: number): void => {
    if (animating || !picked[index]) return;
    picked[index] = undefined; error.hidden = true; refresh();
  };
  /** 목록에서 5권을 한 번에 채운다(이미 고른 책은 그대로 두고 빈 칸만 채운다). */
  const fillSlots = (): void => {
    if (animating) return;
    const taken = new Set(pickedIds());
    for (const book of materials()) {
      if (!picked.includes(undefined)) break;
      if (taken.has(book.id)) continue;
      picked[picked.indexOf(undefined)] = book.id; taken.add(book.id);
    }
    error.hidden = true; refresh();
  };

  /**
   * 연출 시작 — `chosen`은 화면에서 모여들 5권(자동 합성은 소모분의 첫 5권), `outcome`은 이미 차감된 결과다.
   * 세이브는 `craft`가 누르는 순간 이미 바꿔 두었다(연출은 화면만 바꾼다).
   */
  const play = (chosen: SkillBook[], outcome: Extract<SynthOutcome, { ok: true }>): void => {
    animating = true; error.hidden = true;
    picked = Array.from({ length: SYNTH_BOOK_COST }, (_, index) => chosen[index]?.id);
    refresh();
    craftButton.disabled = true; fillButton.disabled = true; autoButton.disabled = true;
    result.replaceChildren(); result.classList.remove('is-shown'); delete result.dataset.count;

    /** 결과 카드와 빈칸으로 돌아간다 — 연출이 끝난 뒤(또는 모션 감소에서 바로). */
    const reveal = (): void => {
      picked = Array.from({ length: SYNTH_BOOK_COST }, () => undefined);
      stage.classList.remove('is-gathering', 'is-charging', 'is-burst');
      slotNodes.forEach(slot => { slot.classList.remove('is-filled', 'is-gathered'); (slot.firstElementChild as HTMLElement | null)?.style.removeProperty('--synth-dx'); });
      showResult(outcome);
      refresh();
    };
    const unlock = (): void => { animating = false; refresh(); };

    if (reducedMotion || delay <= 0) { reveal(); unlock(); return; }

    // 각 책의 실제 위치에서 **가운데 칸 중앙**까지의 거리를 재어 `--synth-dx`로 넘긴다(화면 크기와 무관).
    const centerSlot = slotNodes[Math.floor(SYNTH_BOOK_COST / 2)];
    const slotRect = centerSlot.getBoundingClientRect?.();
    for (const slot of slotNodes) {
      const art = slot.firstElementChild as HTMLElement | null;
      if (!art || !slot.classList.contains('is-filled')) continue;
      const rect = slot.getBoundingClientRect?.();
      const dx = slotRect && rect ? (slotRect.left + slotRect.width / 2) - (rect.left + rect.width / 2) : 0;
      art.style.setProperty('--synth-dx', `${Math.round(dx)}px`);
      slot.classList.add('is-gathered');
    }
    void (stage as HTMLElement).offsetWidth;
    stage.classList.add('is-gathering');
    later(() => { if (!closed) stage.classList.add('is-charging'); }, Math.min(SYNTH_GATHER_MS, delay));
    later(() => {
      if (closed) return;
      stage.classList.add('is-burst');
      // 허물 조각 — 책 껍질(종이) 12조각이 사방으로 흘어지며 벗겨진다(방향·거리는 CSS가 인덱스로 나눠 가진다).
      husks.replaceChildren(...Array.from({ length: 12 }, (_, index) => {
        const piece = element('i', 'synth-husk');
        piece.style.setProperty('--synth-angle', `${index * 30 + (index % 3) * 7}deg`);
        piece.style.setProperty('--synth-dist', `${26 + (index % 4) * 9}px`);
        return piece;
      }));
    }, Math.min(SYNTH_BURST_MS, delay));
    light?.start(Math.min(SYNTH_BURST_MS, delay), delay);
    // 결과는 0.62초에, 버튼 잠금은 연출이 끝나는 `delay`에 풀린다.
    later(() => { if (!closed) reveal(); }, Math.min(SYNTH_RESULT_MS, delay));
    later(() => { if (!closed) unlock(); }, delay);
  };

  /** `합성하기` — 고른 5권으로 1회, `자동 합성` — 남은 5권 묶음만큼 한꺼번에. */
  const craft = (all: boolean): void => {
    if (animating) return;
    if (!all) {
      if (pickedIds().length !== SYNTH_BOOK_COST) { error.textContent = `재료 ${SYNTH_BOOK_COST}권을 채워 주세요.`; error.hidden = false; return; }
      const ids = pickedIds();
      const chosen = materials().filter(book => ids.includes(book.id));
      const outcome = synthesizeSkillBooks(save, ids);
      if (!outcome.ok) { error.textContent = outcome.message; error.hidden = false; return; }
      // 차감은 **누르는 순간 한 번** — 연출은 화면만 바꾸고, 세이브·배지·가방 목록도 바로 갱신한다.
      ui.world.onChange();
      play(chosen, outcome);
      return;
    }
    const capacity = synthCapacity(save);
    if (capacity < 1) { error.textContent = `타직업 스킬북이 ${SYNTH_BOOK_COST}권 이상 있어야 합성할 수 있습니다.`; error.hidden = false; return; }
    const preview = synthMaterials(save).slice(0, SYNTH_BOOK_COST);
    const outcome = synthesizeAllAvailable(save);
    if (!outcome.ok) { error.textContent = outcome.message; error.hidden = false; return; }
    ui.world.onChange();
    play(preview, outcome);
  };

  fillButton.onclick = fillSlots;
  craftButton.onclick = () => craft(false);
  autoButton.onclick = () => craft(true);
  closeButton.onclick = close;
  closeAction.onclick = close;
  overlay.onclick = event => { if (event.target === overlay) close(); };

  refresh();
  (ui.root ?? document.body).append(overlay);
  return { overlay, close, craft, slots, result };
}
