import { equipmentImage, isSkillBook, itemDisplayName, type Rarity } from '../../game/items';
import { openPouch, POUCH_OVERALL_RATES, pouchCount, POUCH_HINT, pouchResultText, firstPouch, type PouchResult } from '../../game/pouch';
import { isLegendaryPouchResult } from '../../game/legendBoard';
import { createSkillBookArt } from '../skillBookArt';
import { createPouchArt, preloadPouchFrames, resetPouchArt, setPouchFrame, POUCH_FRAME_URLS, POUCH_GOLD_PILE_URL } from '../pouchArt';
import { createPouchLight } from '../pouchLight';
import { goldMarkup } from '../currency';
import type { Interface } from '../interface';

/**
 * 개봉 연출 타임라인 (작업 214 — 9컷 프레임 시퀀스, 약 1.8초).
 * 그림이 바뀌는 시각(ms, [열기]를 누른 순간부터)과 보상 카드가 뜨는 시각.
 * `POUCH_FRAME_AT`의 값은 `styles/modals.css`의 `.pouch-window-result` 애니메이션 지연과
 * **같은 시각**이어야 하고(테스트가 둘을 함께 검사), 절정(7번째 컷)은 Canvas 빛의 `burstAt`이다.
 *
 * 사용자 지시(작업 214 `#5222`·`#5241`): "이미지를 흔들지 말고 프레임을 더 넣어서 모션으로",
 * "빛난 후에는 템 뜨는 거랑 주머니 바닥에 풀리는 게 더 빨랐으면 좋겠어". 그래서 좌우로 흔들던
 * `pouch-shake`를 없애고 **중간 컷 4장을 더한 9컷**으로 모션을 만들며, 앞쪽 텐션은 ~1.0~1.1초로
 * 길게 가져가고 절정 뒤에는 0.35~0.45초 안에 주머니가 풀리고 보상이 뜬다(전체 약 1.8초).
 *
 *  - `0ms`      1컷 닫힘 — **쪼으는 구간** 시작(끈이 당겨지며 부푼다, 흔들지 않는다)
 *  - `220ms`    2컷 끈이 당겨지며 부푸는
 *  - `470ms`    3컷 끈 헐거워짐
 *  - `700ms`    4컷 입구가 틈새처럼 살짝 벌어짐
 *  - `890ms`    5컷 끈 풀리고 빛이 새어 나옴
 *  - `1000ms`   6컷 반쯤 활짝 열리며 빛이 비침
 *  - `1075ms`   7컷 활짝 열림 — **절정**: 흰빛이 팡 번지고 입자 36개가 흩어진다
 *  - `1180ms`   8컷 무너지며 풀리기 시작 (빛이 빠르게 잦아든다)
 *  - `1300ms`   9컷 바닥에 납작하게 접힘 — 그대로 유지되고 위쪽에 보상 카드가 드러난다
 */
export const POUCH_FRAME_AT = [0, 220, 470, 700, 890, 1000, 1075, 1180, 1300] as const;
/** 절정(흰빛이 팡 터지는) 시각 — Canvas 빛·입자가 이 순간에 터진다. */
export const POUCH_BURST_MS = POUCH_FRAME_AT[6];
/** 보상 카드가 드러나는 시각(절정 + 0.36초 — 빛이 가라앉으며 주머니가 풀리는 사이). */
export const POUCH_RESULT_MS = 1440;
/** 연출 전체 길이(약 1.8초) — 이 뒤에 버튼 잠금이 풀리고 `1개 더 열기`가 보인다. */
export const POUCH_OPEN_MS = 1800;

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

/**
 * 획득 결과 카드 — 장비·스킬북은 그림+등급 색 이름, 금화는 **금화 뭉치 그림**과 금화 표기.
 * 작업 213(`#5057`): `장비 획득`·`금화 획득` 같은 분류 문구와 `일반`·`레어` 같은 등급 글자를 없애고
 * **그림을 주인공으로** 둔다(등급 구분은 이름 색만 남긴다). `#5069` — 이름·수치 글자는 그림보다 작게.
 */
export function pouchResultCard(result: PouchResult): HTMLElement {
  const card = element('div', `pouch-result pouch-result-${result.kind}`);
  if (result.kind === 'gold') {
    const art = element('span', 'pouch-result-art pouch-result-pile');
    const pile = document.createElement('img');
    pile.src = POUCH_GOLD_PILE_URL; pile.alt = ''; pile.draggable = false;
    art.append(pile);
    const amount = element('strong', 'pouch-result-name pouch-result-gold');
    amount.innerHTML = goldMarkup(result.gold);
    card.append(art, amount);
    return card;
  }
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
  card.append(art, name);
  return card;
}

/**
 * 개봉 연출의 빛 색 (작업 213 `#5057` → 214) — 노란/주황빛 대신 **깨끗한 흰빛**.
 * 순백색 하나만 쓰고, 보상 종류·등급에 따라 색을 바꾸지 않는다. Canvas 빛·입자가 이 색을 쓴다.
 */
export function pouchGlowInk(): string {
  return POUCH_WHITE_LIGHT;
}

/** 개봉 연출의 흰빛(순백) — Canvas 빛·입자(`pouchLight.createPouchLight`)가 함께 쓴다. */
export const POUCH_WHITE_LIGHT = '#ffffff';

type PouchWindowApi = { overlay: HTMLElement; open: () => void; close: () => void; rates: HTMLElement; result: HTMLElement };
type PouchWindowOptions = { /** 연출 길이 — 테스트가 0으로 줄인다(기본 2800ms). */ delay?: number };

/**
 * 큰 개봉 창 (작업 207 → 213).
 *
 * 장비창 위에 한 겹으로 얹히는 팝업이다(분해 보호 팝업과 같은 방식). 상단 한 줄 왼쪽 `[확률표]`를
 * 누르면 전체 확률표가 창 안쪽에 펼쳐지고(가운데는 `보물 주머니` 제목), 주머니를 `[열기]`로 까면
 * 결과 카드가 뜬다.
 * 한 번에 **주머니 1개씩** 열고, 개봉이 끝났을 때 가방에 주머니가 남아 있으면
 * `[1개 더 열기]`로 바로 다음 주머니를 이어서 깐다. 다 열었으면 `[확인]`, 언제든 `[닫기]`·`×`로 나간다.
 *
 * **[열기]의 연출**(작업 214 — `#5204`·`#5222`·`#5241`, 총 1.8초):
 * 0~1.0초 닫힌 주머니가 **끈을 조이며 부푸는 텐션 구간**(중간 컷 3장 — 흔들지 않는다),
 * 1.0초 반쯤 열리며 빛이 비치고, **1.075초 활짝 열리는 절정**에서 Canvas 흰빛이 팡 번지며
 * 입자 36개가 사방으로 흩어진다. 곧바로 1.18초 무너지고 1.3초 바닥에 납작하게 풀리며,
 * **1.44초** 위쪽 빈 공간에 보상 카드가 드러난다(1.8초에 버튼 잠금 해제).
 * 아홉 장은 창을 열 때 미리 받아 두어 전환이 깜빡이지 않는다.
 * 세이브 차감은 **누르는 즉시 한 번만** 하고(연출은 화면만), 연출이 끝날 때까지 버튼을 잠가
 * 두 번 까이지 않게 한다. 결과 토스트·레전드 전광판은 **보상 카드가 뜨는 시각**까지 미룬다
 * (누르자마자 위쪽 글자로 정답을 스포일러하던 것을 고쳤다 — `#5228`).
 * `prefers-reduced-motion`이면 애니메이션·Canvas 없이 결과가 바로 보인다(CSS).
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
  // 상단 한 줄 (작업 213 `#5057`) — 왼쪽 `확률표`, 가운데 `보물 주머니` 제목, 오른쪽 `×`.
  const top = element('div', 'pouch-window-top');
  const ratesButton = button('확률표', 'pouch-rates-toggle');
  ratesButton.setAttribute('aria-expanded', 'false');
  const closeButton = button('×', 'pouch-window-close');
  closeButton.setAttribute('aria-label', '닫기');
  const title = element('h3', 'pouch-window-title', firstPouch(save)?.name ?? '무작위 보물 주머니');
  top.append(ratesButton, title, closeButton);

  const stage = element('div', 'pouch-window-stage');
  // 개봉 창을 열 때 여섯 장을 미리 받아 두어, 단계가 바뀔 때 그림이 깜빡이지 않게 한다.
  preloadPouchFrames();
  // 두 장을 겹쳐 둔 무대 — `setPouchFrame`이 `is-front`를 넘겨 크로스페이드한다.
  const art = createPouchArt();
  // 개봉 연출의 빛과 입자 (작업 214) — CSS 도형 대신 60fps Canvas 한 장(투명·`pointer-events: none`).
  // 모션 감소 사용자에겐 아예 만들지 않는다(빛이 필요 없다).
  const light = reducedMotion ? null : createPouchLight(pouchGlowInk());
  const result = element('div', 'pouch-window-result');
  result.setAttribute('aria-live', 'polite');
  stage.dataset.frame = '1';
  // 빛은 주머니 스택 **밖**에 둔다 — 스택의 drop-shadow가 빛까지 그림자로 만들지 않게.
  // 결과 카드보다 **아래**에 깔아 아이템 그림을 빛이 덮지 않는다.
  stage.append(art);
  if (light) stage.append(light.canvas);
  stage.append(result);

  const hint = element('p', 'pouch-window-hint', POUCH_HINT);
  const countLabel = element('p', 'pouch-window-count');
  const error = element('p', 'pouch-window-error');
  error.hidden = true;

  const actions = element('div', 'pouch-window-actions');
  const openButton = button('열기', 'pouch-open is-primary');
  const closeAction = button('닫기', 'pouch-close');
  actions.append(openButton, closeAction);

  const rates = pouchRatesPanel();
  rates.hidden = true;

  card.append(top, stage, hint, error, countLabel, actions, rates);
  overlay.append(card);

  const showCount = (): void => {
    const remaining = pouchCount(save);
    countLabel.textContent = `보유 ${remaining}개`;
    countLabel.hidden = remaining === 0;
    // 남은 주머니가 있으면 `1개 더 열기` — 다 열었으면 `확인`으로 바뀐다(`닫기`는 늘 옆에 있다).
    openButton.textContent = result.childElementCount ? (remaining ? '1개 더 열기' : '확인') : '열기';
  };
  let animating = false, closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frameTimers: ReturnType<typeof setTimeout>[] = [];
  const clearFrameTimers = (): void => { while (frameTimers.length) clearTimeout(frameTimers.pop() as ReturnType<typeof setTimeout>); };
  // 결과 알림(토스트·레전드 전광판)은 **보상 카드가 뜨는 시각**까지 미룬다 (작업 214 `#5228`).
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingAnnounce: (() => void) | undefined;
  const announceResult = (): void => {
    announceTimer = undefined;
    const announce = pendingAnnounce;
    pendingAnnounce = undefined;
    announce?.();
  };
  const close = (): void => {
    const announce = pendingAnnounce;
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    if (announceTimer !== undefined) clearTimeout(announceTimer);
    announceTimer = undefined;
    clearFrameTimers();
    light?.stop();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('keydown', onKey, true);
    observer?.disconnect();
    overlay.remove?.();
    if (ui.openModal === 'equipment') ui.renderModal();
    // 연출이 끝나기 전에 창을 닫아도 깐 주머니의 결과는 잃지 않는다 — 남은 알림을 그 자리에서 보낸다.
    if (announce) announce();
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
    // [1개 더 열기]가 [확인]으로 바뀐 뒤에는 닫기만 한다.
    if (result.childElementCount && !pouchCount(save)) { close(); return; }
    // 세이브 차감·지급은 **누르는 이 순간 한 번** — 아래 연출은 화면만 바꾼다.
    // 두 번째부터는 방금 깐 주머니가 이미 사라졌으므로 `itemId`가 첫 주머니로 되돌아간다.
    const opened = openPouch(save, itemId);
    if (!opened.ok) {
      error.textContent = opened.message; error.hidden = false;
      ui.message(opened.message);
      return;
    }
    error.hidden = true;
    result.replaceChildren(pouchResultCard(opened.result));
    result.setAttribute('data-kind', opened.result.kind);
    // 같은 연출을 다시 틀 수 있게 클래스를 지웠다가 리플로 뒤에 붙인다.
    // `1개 더 열기`도 늘 1컷(닫힌 주머니)부터 새로 시작한다.
    clearFrameTimers();
    if (announceTimer !== undefined) clearTimeout(announceTimer);
    announceTimer = undefined; pendingAnnounce = undefined;
    stage.classList.remove('is-opening');
    stage.dataset.frame = '1';
    resetPouchArt(art);
    void (stage as HTMLElement).offsetWidth;
    stage.classList.add('is-opening');
    // Canvas 빛·입자 — 1.075초 절정에 터지고 1.8초에 스스로 멈춘다(모션 감소면 빛 자체가 없다).
    light?.start(POUCH_BURST_MS, POUCH_OPEN_MS);
    // 0.22 / 0.47 / 0.7 / 0.89 / 1.0 / 1.075 / 1.18 / 1.3초에 2~9컷으로 겹쳐 넘긴다(모션 감소면 곧바로 마지막 컷).
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
    // **스포일러 금지**(작업 214 `#5228`): 누르자마자 위쪽 토스트·전광판으로 정답을 알리지 않고,
    // 보상 카드가 뜨는 1.44초에 맞춰 보낸다(모션 감소·테스트처럼 연출이 짧으면 그에 맞춰 더 일찍).
    const announceDelay = reducedMotion ? 0 : Math.min(POUCH_RESULT_MS, delay);
    pendingAnnounce = () => {
      ui.message(`${opened.pouch.name} → ${pouchResultText(opened.result)}`);
      // 보물 주머니에서 레전드 장비(작업 208) — 접속 중인 모두의 화면 위 전광판에 한 줄 띄운다.
      if (isLegendaryPouchResult(opened.result)) ui.sharePouchLegend(itemDisplayName((opened.result as Extract<PouchResult, { kind: 'equipment' }>).item));
    };
    if (announceDelay <= 0) announceResult();
    else announceTimer = setTimeout(announceResult, announceDelay);
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
