import { equipmentImage, isSkillBook, itemDisplayName, rarityNames, type Rarity } from '../../game/items';
import { openPouch, POUCH_CATEGORIES, POUCH_GOLD_TIERS, POUCH_RARITY_TIERS, pouchCount, POUCH_HINT, pouchResultText, firstPouch, type PouchResult } from '../../game/pouch';
import { createSkillBookArt } from '../skillBookArt';
import { pouchArt } from '../pouchArt';
import { goldMarkup } from '../currency';
import type { Interface } from '../interface';

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
 * 확률표 (작업 207) — 세 분류를 **박스 3개**로 나누고, 박스마다 그 안의 세부 확률을 적는다.
 * 장비 등급은 인게임 등급 색(`rarity-common` … `rarity-legendary`)을 그대로 입힌다.
 */
export function pouchRatesPanel(): HTMLElement {
  const panel = element('div', 'pouch-rates');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', '보물 주머니 확률표');
  const gold = element('section', 'pouch-rate-box pouch-rate-box-gold');
  const goldTitle = element('b', 'pouch-rate-title', POUCH_CATEGORIES[0].label);
  goldTitle.append(element('em', 'pouch-rate-head', `${Math.round(POUCH_CATEGORIES[0].rate * 100)}%`));
  gold.append(goldTitle, element('small', 'pouch-rate-note', '한 주머니를 열 때 가장 먼저 뽑는 분류'));
  const goldList = element('ul', 'pouch-rate-list');
  for (const tier of POUCH_GOLD_TIERS) {
    const row = element('li', 'pouch-rate-row');
    row.append(element('span', 'pouch-rate-name', `${tier.gold.toLocaleString('ko-KR')}G`), element('em', 'pouch-rate-value', `${Math.round(tier.rate * 100)}%`));
    goldList.append(row);
  }
  gold.append(goldList);

  const gear = element('section', 'pouch-rate-box pouch-rate-box-equipment');
  const gearTitle = element('b', 'pouch-rate-title', POUCH_CATEGORIES[1].label);
  gearTitle.append(element('em', 'pouch-rate-head', `${Math.round(POUCH_CATEGORIES[1].rate * 100)}%`));
  gear.append(gearTitle, element('small', 'pouch-rate-note', '최고 층 기준 · 3직업 균등'));
  const gearList = element('ul', 'pouch-rate-list');
  for (const tier of POUCH_RARITY_TIERS) {
    const row = element('li', `pouch-rate-row rarity-${tier.rarity}`);
    row.append(element('span', 'pouch-rate-name', rarityNames[tier.rarity]), element('em', 'pouch-rate-value', `${Math.round(tier.rate * 100)}%`));
    gearList.append(row);
  }
  gear.append(gearList);

  const book = element('section', 'pouch-rate-box pouch-rate-box-skillbook');
  const bookTitle = element('b', 'pouch-rate-title', POUCH_CATEGORIES[2].label);
  bookTitle.append(element('em', 'pouch-rate-head', `${Math.round(POUCH_CATEGORIES[2].rate * 100)}%`));
  book.append(bookTitle, element('small', 'pouch-rate-note', '3직업 균등'));
  const bookList = element('ul', 'pouch-rate-list');
  const bookRow = element('li', 'pouch-rate-row');
  bookRow.append(element('span', 'pouch-rate-name', '전 직업 모든 스킬북'), element('em', 'pouch-rate-value', '100%'));
  bookList.append(bookRow);
  book.append(bookList);

  panel.append(gold, gear, book);
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

type PouchWindowApi = { overlay: HTMLElement; open: () => void; close: () => void; rates: HTMLElement; result: HTMLElement };

/**
 * 큰 개봉 창 (작업 207).
 *
 * 장비창 위에 한 겹으로 얹히는 팝업이다(분해 보호 팝업과 같은 방식). 왼쪽 위 `[확률표]`를 누르면
 * 세 분류 박스 확률표가 창 안쪽에 펼쳐지고, 가운데 주머니를 `[열기]`로 까면 결과 카드가 뜬다.
 * 더 남아 있으면 `[한 번 더 열기]`, 아니면 `[확인]`으로 닫힌다.
 */
export function openPouchWindow(ui: Interface, itemId?: string): PouchWindowApi {
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
  const art = pouchArt('pouch-art');
  const result = element('div', 'pouch-window-result');
  result.setAttribute('aria-live', 'polite');
  stage.append(art, result);

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
    openButton.hidden = false;
  };
  const close = (): void => {
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
    // [한 번 더 열기]가 [확인]으로 바뀐 뒤에는 닫기만 한다.
    if (result.childElementCount && !pouchCount(save)) { close(); return; }
    const opened = openPouch(save, itemId);
    if (!opened.ok) {
      error.textContent = opened.message; error.hidden = false;
      ui.message(opened.message);
      return;
    }
    error.hidden = true;
    result.replaceChildren(pouchResultCard(opened.result));
    result.setAttribute('data-kind', opened.result.kind);
    stage.classList.remove('is-opening');
    // 결과가 바로 뜨되, 주머니가 흔들리며 열리는 연출은 CSS가 맡는다(다시 열 때도 한 번 더).
    void stage.offsetWidth;
    stage.classList.add('is-opening');
    ui.world.onChange();
    ui.message(`${opened.pouch.name} → ${pouchResultText(opened.result)}`);
    showCount();
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
