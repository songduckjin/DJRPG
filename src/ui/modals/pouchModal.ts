import { equipmentImage, isSkillBook, itemDisplayName, rarityNames, type Rarity } from '../../game/items';
import { openPouch, POUCH_OVERALL_RATES, POUCH_RARITY_INK, pouchCount, POUCH_HINT, pouchResultText, firstPouch, type PouchResult } from '../../game/pouch';
import { isLegendaryPouchResult } from '../../game/legendBoard';
import { createSkillBookArt } from '../skillBookArt';
import { pouchArt, preloadPouchFrames, setPouchFrame, POUCH_FRAME_URLS } from '../pouchArt';
import { goldMarkup } from '../currency';
import type { Interface } from '../interface';

/**
 * 개봉 연출 타임라인 (작업 210 — 사용자 지시 `#4404` "당연히 부드럽게 열어야지").
 * 4단계 그림이 바뀌는 시각(ms, [열기]를 누른 순간부터)과 보상 카드가 뜨는 시각.
 * `POUCH_FRAME_AT`의 값은 `styles/modals.css`의 애니메이션 지연(`.pouch-art`·`.pouch-glow`·
 * `.pouch-flash`·`.pouch-window-result`)과 **같은 시각**이어야 한다(테스트가 둘을 함께 검사).
 */
export const POUCH_FRAME_AT = [0, 200, 420, 640] as const;      // 닫힘 → 끈 헐거워짐 → 빛 새어 나옴 → 활짝
/** 보상 카드가 떠오르는 시각(빛이 퍼진 뒤). */
export const POUCH_RESULT_MS = 900;
/** 연출 전체 길이(작업 207 사용자 요청 0.8~1.0초 유지) — 이 뒤에 버튼 잠금이 풀린다. */
export const POUCH_OPEN_MS = 950;

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

/**
 * 확률표 (작업 207, 사용자 최종 확정) — **전체 확률 한 줄(10항목)**을 높은 확률 순으로 깔아
 * 표로 보여 준다. 각 줄: 결과 이름(장비는 인게임 등급 색) + 확률(`30.25%` 소수 둘째 자리).
 * 아래 한 줄 요약: `합계 100% · 장비·스킬북은 3직업 균등`.
 */
export function pouchRatesPanel(): HTMLElement {
  const panel = element('div', 'pouch-rates');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', '보물 주머니 확률표');
  const table = element('ul', 'pouch-rate-table');
  for (const line of POUCH_OVERALL_RATES) {
    const row = element('li', `pouch-rate-row${line.rarity ? ` rarity-${line.rarity}` : ''}`);
    row.append(element('span', 'pouch-rate-name', line.label), element('em', 'pouch-rate-value', `${(line.rate * 100).toFixed(2)}%`));
    table.append(row);
  }
  panel.append(table, element('p', 'pouch-rate-summary', '합계 100% · 장비·스킬북은 3직업 균등'));
  return panel;
}

/** 획득 결과 카드 — 장비는 등급 색 이름, 금화는 금화 표기. */
export function pouchResultCard(result: PouchResult): HTMLElement {
  const card = element('div', `pouch-result pouch-result-${result.kind}`);
  if (result.kind === 'gold') {
    card.append(element('span', 'pouch-result-label', '금화 획득'));
    const amount = element('strong', 'pouch-result-name pouch-result-gold');
    amount.innerHTML = goldMarkup(result.gold);
    card.append(amount);
    return card;
  }
  card.append(element('span', 'pouch-result-label', result.kind === 'equipment' ? '장비 획득' : '스킬북 획득'));
  const item = result.item;
  const art = element('span', 'pouch-result-art');
  if (isSkillBook(item)) {
    const book = createSkillBookArt(item); book.classList.add('pouch-result-book'); art.append(book);
  } else {
    const image = equipmentImage(item);
    if (image.columns > 1) {
      const sheet = element('span', 'pouch-result-sheet atlas-icon');
      sheet.style.backgroundImage = `url("${image.path}")`;
      sheet.style.backgroundPosition = `${image.frame / (image.columns - 1) * 100}% center`;
      art.append(sheet);
    } else {
      const img = document.createElement('img'); img.src = image.path; img.alt = ''; art.append(img);
    }
  }
  const name = element('strong', 'pouch-result-name');
  name.textContent = itemDisplayName(item);
  name.classList.add(`rarity-${item.rarity as Rarity}`);
  const grade = element('small', 'pouch-result-grade', isSkillBook(item) ? '스킬북' : rarityNames[item.rarity]);
  card.append(art, name, grade);
  return card;
}

/** 개봉 연출의 빛 색 — 금화·스킬북은 황금빛, 장비는 그 등급의 색(레전드면 붉게). */
export function pouchGlowInk(result: PouchResult): string {
  if (result.kind === 'equipment') return POUCH_RARITY_INK[result.item.rarity] ?? POUCH_RARITY_INK.common;
  return '#ffd977';
}

type PouchWindowApi = { overlay: HTMLElement; open: () => void; close: () => void; rates: HTMLElement; result: HTMLElement };
type PouchWindowOptions = { /** 연출 길이 — 테스트가 0으로 줄인다(기본 950ms). */ delay?: number };

/**
 * 큰 개봉 창 (작업 207).
 *
 * 장비창 위에 한 겹으로 얹히는 팝업이다(분해 보호 팝업과 같은 방식). 왼쪽 위 `[확률표]`를 누르면
 * 세 분류 박스 확률표가 창 안쪽에 펼쳐지고, 가운데 주머니를 `[열기]`로 까면 결과 카드가 뜬다.
 * 더 남아 있으면 `[한 번 더 열기]`, 아니면 `[확인]`으로 닫힌다.
 *
 * **[열기]의 연출**(작업 210, 4단계 — 사용자 지시 `#4404`): 0~0.20초 닫힌 주머니가 살짝 부풀며
 * 흔들리고, 0.20초에 끈이 헐거워진 2단계, 0.42초에 끈이 풀리며 안쪽 황금빛이 새어 나오는 3단계,
 * 0.64초에 활짝 열린 4단계로 갈아 끼우며 입구에서 등급색/황금빛 광선이 퍼지고, 0.90초에 결과
 * 카드가 짠 하고 떠오른다. 네 장은 창을 열 때 미리 받아 두어 전환이 깜빡이지 않는다.
 * 세이브 차감은 **누르는 즉시 한 번만** 하고(연출은 화면만), 연출이 끝날 때까지 버튼을 잠가
 * 두 번 까이지 않게 한다. `prefers-reduced-motion`이면 애니메이션 없이 결과가 바로 보인다(CSS).
 */
export function openPouchWindow(ui: Interface, itemId?: string, options: PouchWindowOptions = {}): PouchWindowApi {
  const delay = options.delay ?? POUCH_OPEN_MS;
  // 모션 감소 사용자는 단계 전환 없이 곧바로 활짝 열린 그림과 결과를 본다.
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const save = ui.world.save;
  const overlay = element('div', 'pouch-window');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', firstPouch(save)?.name ?? '무작위 보물 주머니');

  const card = element('div', 'pouch-window-card');
  const top = element('div', 'pouch-window-top');
  const ratesButton = button('확률표', 'pouch-rates-toggle');
  ratesButton.setAttribute('aria-expanded', 'false');
  const closeButton = button('×', 'pouch-window-close');
  closeButton.setAttribute('aria-label', '닫기');
  top.append(ratesButton, closeButton);

  const stage = element('div', 'pouch-window-stage');
  // 개봉 창을 열 때 네 장을 미리 받아 두어, 단계가 바뀔 때 그림이 깜빡이지 않게 한다.
  preloadPouchFrames();
  const art = pouchArt('pouch-art') as HTMLImageElement;
  // 주머니 입구에서 터지는 빛 — 주머니 그림 위에 screen으로 얹어 빛줄기처럼 보이게 한다.
  const glow = element('span', 'pouch-glow');
  glow.setAttribute('aria-hidden', 'true');
  // 4단계로 넘어가는 순간(0.64초)의 한 번짜리 섬광.
  const flash = element('span', 'pouch-flash');
  flash.setAttribute('aria-hidden', 'true');
  const result = element('div', 'pouch-window-result');
  result.setAttribute('aria-live', 'polite');
  stage.dataset.frame = '1';
  stage.append(art, glow, flash, result);

  const title = element('h3', 'pouch-window-title', firstPouch(save)?.name ?? '무작위 보물 주머니');
  const hint = element('p', 'pouch-window-hint', POUCH_HINT);
  const countLabel = element('p', 'pouch-window-count');
  const error = element('p', 'pouch-window-error');
  error.hidden = true;

  const actions = element('div', 'pouch-window-actions');
  const openButton = button('열기', 'pouch-open is-primary');
  const closeAction = button('확인', 'pouch-close');
  actions.append(openButton, closeAction);

  const rates = pouchRatesPanel();
  rates.hidden = true;

  card.append(top, title, stage, hint, error, countLabel, actions, rates);
  overlay.append(card);

  const showCount = (): void => {
    const remaining = pouchCount(save);
    countLabel.textContent = `보유 ${remaining}개`;
    countLabel.hidden = remaining === 0;
    openButton.textContent = result.childElementCount ? (remaining ? '한 번 더 열기' : '확인') : '열기';
  };
  let animating = false, closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frameTimers: ReturnType<typeof setTimeout>[] = [];
  const clearFrameTimers = (): void => { while (frameTimers.length) clearTimeout(frameTimers.pop() as ReturnType<typeof setTimeout>); };
  const close = (): void => {
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    clearFrameTimers();
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

  const open = (): void => {
    if (animating) return;                                   // 연출 중 중복 클릭은 무시한다.
    // [한 번 더 열기]가 [확인]으로 바뀐 뒤에는 닫기만 한다.
    if (result.childElementCount && !pouchCount(save)) { close(); return; }
    // 세이브 차감·지급은 **누르는 이 순간 한 번** — 아래 연출은 화면만 바꾼다.
    const opened = openPouch(save, itemId);
    if (!opened.ok) {
      error.textContent = opened.message; error.hidden = false;
      ui.message(opened.message);
      return;
    }
    error.hidden = true;
    result.replaceChildren(pouchResultCard(opened.result));
    // 보물 주머니에서 레전드 장비(작업 208) — 접속 중인 모두의 화면 위 전광판에 한 줄 띄운다.
    if (isLegendaryPouchResult(opened.result)) ui.sharePouchLegend(itemDisplayName((opened.result as Extract<PouchResult, { kind: 'equipment' }>).item));
    result.setAttribute('data-kind', opened.result.kind);
    glow.style.setProperty('--pouch-glow', pouchGlowInk(opened.result));
    // 같은 연출을 다시 틀 수 있게 클래스를 지웠다가 리플로 뒤에 붙인다.
    // `한 번 더 열기`도 늘 1단계(닫힌 주머니)부터 새로 시작한다.
    clearFrameTimers();
    stage.classList.remove('is-opening');
    stage.dataset.frame = '1';
    setPouchFrame(art, 0);
    void (stage as HTMLElement).offsetWidth;
    stage.classList.add('is-opening');
    // 0.20 / 0.42 / 0.64초에 그림을 2·3·4단계로 갈아 끼운다(모션 감소면 곧바로 활짝 열린 컷).
    if (reducedMotion) {
      stage.dataset.frame = String(POUCH_FRAME_URLS.length);
      setPouchFrame(art, POUCH_FRAME_URLS.length - 1);
    } else {
      for (let step = 1; step < POUCH_FRAME_URLS.length; step++) {
        frameTimers.push(setTimeout(() => {
          if (closed) return;
          stage.dataset.frame = String(step + 1);
          setPouchFrame(art, step);
        }, POUCH_FRAME_AT[step]));
      }
    }
    animating = true; openButton.disabled = true;
    countLabel.textContent = `보유 ${pouchCount(save)}개`; countLabel.hidden = pouchCount(save) === 0;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (closed) return;
      animating = false; openButton.disabled = false; showCount();
    }, delay);
    ui.world.onChange();
    ui.message(`${opened.pouch.name} → ${pouchResultText(opened.result)}`);
  };

  ratesButton.onclick = () => {
    const openNow = rates.hidden;
    rates.hidden = !openNow;
    ratesButton.setAttribute('aria-expanded', String(openNow));
    ratesButton.classList.toggle('is-on', openNow);
    card.classList.toggle('rates-open', openNow);
  };
  closeButton.onclick = close;
  closeAction.onclick = close;
  openButton.onclick = open;
  overlay.onclick = event => { if (event.target === overlay) close(); };
  showCount();

  // 장비창 위에 한 겹만 얹는다(뒤의 장비창은 그대로 보인다).
  (ui.root ?? document.body).append(overlay);
  return { overlay, open, close, rates, result };
}
