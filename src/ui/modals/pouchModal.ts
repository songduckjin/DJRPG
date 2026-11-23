import { itemDisplayName, type Rarity } from '../../game/items';
import { openPouch, POUCH_OVERALL_RATES, pouchCount, POUCH_HINT, pouchResultText, firstPouch, type PouchResult } from '../../game/pouch';
import { openPouches, pouchBatchText } from '../../game/pouchBatch';
import { pouchBatchPanel } from '../pouchBatch';
import { isLegendaryPouchResult } from '../../game/legendBoard';
import { isSpotlightRarity, spotlightTag } from '../../game/raritySpotlight';
import { createPouchArt, pouchRewardArt, preloadPouchFrames, resetPouchArt, setPouchFrame, POUCH_FRAME_URLS, POUCH_GOLD_PILE_URL } from '../pouchArt';
import { createPouchLight } from '../pouchLight';
import { goldMarkup } from '../currency';
import type { Interface } from '../interface';

/**
 * 개봉 연출 타임라인 (작업 215 — **3컷** + 탄성 모션 + 빛 전환, 약 1.55초).
 * 그림이 바뀌는 시각(ms, [열기]를 누른 순간부터)과 보상 카드가 뜨는 시각.
 * `POUCH_FRAME_AT`의 값은 `styles/modals.css`의 `.pouch-window-result` 애니메이션 지연과
 * **같은 시각**이어야 하고(테스트가 둘을 함께 검사), 절정(2번째 컷으로 넘어가는 시각)은 Canvas 빛의 `burstAt`이다.
 *
 * 사용자 피드백(작업 215 `#5297`): "이미지가 연결이 하나도 안 돼 끈 풀리기까지 더 뚝뚝 끊겨 그리고 모양이 막 변하고".
 * AI로 만든 중간 컷들은 각도·배 둘레·문양이 조금씩 달라 넘길수록 주머니가 울렁거렸다. 그래서
 * **모양이 변하지 않는 3장**만 두고, 그림 대신 **바닥을 축으로 한 탄성(Squash & Stretch)** 으로 움직임을 만들며,
 * 1→2번 컷은 **가장 눈부신 흰빛 순간(920ms)**, 2→3번 컷은 1080ms에 짧게 크로스페이드한다.
 * 좌우 흔들기(`rotate`)는 쓰지 않는다.
 *
 *  - `0ms`    1컷 닫힘 — **쪼으는 구간** 시작: `transform-origin: 50% 92%`로 부풀었다 눌렸다를 반복하며 힘을 모은다(그림은 이 한 장 그대로)
 *  - `920ms`  2컷 풀리며 무너짐 — **절정**: Canvas 순백색 섬광이 가장 밝게 팡 터지는 순간에 180ms 크로스페이드로 그림이 바뀐다
 *  - `1080ms` 3컷 바닥에 납작 — 200ms 크로스페이드 + 아래로 가라앉는 `translateY`/`scaleY`
 *  - `1220ms` 보상 카드가 위쪽 빈 공간에 즉시 떠오른다(토스트·전광판도 이 시각 — 스포일러 없음)
 *  - `1550ms` 버튼 잠금 해제(`1개 더 열기`)
 */
export const POUCH_FRAME_AT = [0, 920, 1080] as const;
/** 절정(흰빛이 팡 터지는) 시각 — Canvas 빛·입자가 이 순간에 터지고 1→2번 컷이 바뀐다. */
export const POUCH_BURST_MS = POUCH_FRAME_AT[1];
/** 보상 카드가 드러나는 시각(절정 + 0.3초 — 빛이 가라앉으며 주머니가 풀리는 사이). */
export const POUCH_RESULT_MS = 1220;
/** 연출 전체 길이(약 1.55초) — 이 뒤에 버튼 잠금이 풀리고 `1개 더 열기`가 보인다. */
export const POUCH_OPEN_MS = 1550;

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
 * 아래 한 줄 요약: `합계 100% · 장비는 3직업 균등 · 영구 스탯북은 4종 균등`.
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
  panel.append(table, element('p', 'pouch-rate-summary', '합계 100% · 장비는 3직업 균등 · 영구 스탯북은 4종 균등'));
  return panel;
}

/**
 * 획득 결과 카드 — 장비·영구 스탯북은 그림+등급 색 이름, 금화는 **금화 뭉치 그림**과 금화 표기.
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
  // 장비·영구 스탯북 그림은 `pouchRewardArt` 한 곳에서 만든다 — 한 번에 열기의 요약 줄과 같은 그림이다.
  const art = pouchRewardArt(item, { box: 'pouch-result-art', sheet: 'pouch-result-sheet' });
  const name = element('strong', 'pouch-result-name');
  name.textContent = itemDisplayName(item);
  name.classList.add(`rarity-${item.rarity as Rarity}`);
  card.append(art, name);
  // 유니크·전설 상위 노출(백로그 3번) — 카드 테두리에 등급 빛을 두르고, 위에 `[전설] [NEW]` 꼬리표를 붙인다.
  // 다른 등급은 지금처럼 그림 + 등급 색 이름만이다(사용자 확정 시안).
  if (isSpotlightRarity(item.rarity)) {
    card.classList.add('is-spotlight');
    card.dataset.rarity = item.rarity;
    const flag = element('span', 'pouch-result-flag');
    flag.append(element('b', `pouch-result-tag rarity-${item.rarity as Rarity}`, spotlightTag(item.rarity)), element('i', 'pouch-result-new', 'NEW'));
    // 꼬리표는 CSS가 카드 위쪽 가운데에 절대 배치하므로 붙이는 순서는 그림에 영향을 주지 않는다
    // (가짜 DOM을 쓰는 테스트도 `prepend` 없이 같은 구조를 본다).
    card.append(flag);
  }
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

type PouchWindowApi = { overlay: HTMLElement; open: () => void; close: () => void; rates: HTMLElement; result: HTMLElement; /** 한 번에 열기 결과 요약(숨김 상태로 시작). */ batch: HTMLElement };
type PouchWindowOptions = { /** 연출 길이 — 테스트가 0으로 줄인다(기본 2800ms). */ delay?: number };

/**
 * 큰 개봉 창 (작업 207 → 213).
 *
 * 장비창 위에 한 겹으로 얹히는 팝업이다(분해 보호 팝업과 같은 방식). 상단 한 줄 왼쪽 `[확률표]`를
 * 누르면 전체 확률표가 창 안쪽에 펼쳐지고(가운데는 `보물 주머니` 제목), 주머니를 `[열기]`로 까면
 * 결과 카드가 뜬다.
 * 한 번에 **주머니 1개씩** 열고, 개봉이 끝났을 때 가방에 주머니가 남아 있으면
 * `[1개 더 열기]`로 바로 다음 주머니를 이어서 깐다. 다 열었으면 `[확인]`, 언제든 `[닫기]`·`×`로 나간다.
 * 보유 주머니가 2개 이상이면 그 아래 줄에 **`[전부 열기 (N개)]`** 가 함께 서고, 누르면 연출 없이 보유한 주머니를
 * 모두 까고 무대 자리에 **결과 요약**(금화·장비·스탯북 합계, 등급별 수량, `×N` 목록)을 띄운다(2026-11-22).
 *
 * **[열기]의 연출**(작업 215 — `#5297`, 총 1.55초):
 * 0~0.9초 닫힌 주머니 **한 장**이 바닥을 축으로 부풀었다 눌렸다 하며 힘을 모으고(좌우 흔들기 없음),
 * **0.92초 절정**에서 Canvas 순백색 섬광이 가장 밝게 터지며 그 빛 속에서 **2번 컷(풀리며 무너짐)** 으로 180ms 크로스페이드,
 * 1.08초에 **3번 컷(바닥에 납작)** 으로 200ms 크로스페이드하며 아래로 가라앉고, **1.22초** 위쪽 빈 공간에 보상 카드가 즉시 떠오른다
 * (1.55초에 버튼 잠금 해제). 세 장은 창을 열 때 미리 받아 두어 전환이 깜빡이지 않는다.
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
  // 개봉 창을 열 때 세 장을 미리 받아 두어, 단계가 바뀔 때 그림이 깜빡이지 않게 한다.
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

  // 한 번에 열기 (2026-11-22) — 보유 주머니가 2개 이상일 때만 보인다(1개면 [열기]와 같다).
  //   주 버튼 줄(열기·닫기)에 끼우지 않고 한 줄을 따로 준다 — 폰 폭 330px에서 세 버튼은 글자가 잘린다.
  const batchRow = element('div', 'pouch-window-batch');
  const openAllButton = button('전부 열기', 'pouch-open-all');
  batchRow.append(openAllButton);

  const actions = element('div', 'pouch-window-actions');
  const openButton = button('열기', 'pouch-open is-primary');
  const closeAction = button('닫기', 'pouch-close');
  actions.append(openButton, closeAction);

  // 결과 요약 — 주머니 그림(무대) 대신 이 자리에 들어선다. 닫으면 창이 닫힌다.
  const batchPanel = element('div', 'pouch-window-batch-result');
  batchPanel.hidden = true;

  const rates = pouchRatesPanel();
  rates.hidden = true;

  card.append(top, stage, batchPanel, hint, error, countLabel, batchRow, actions, rates);
  overlay.append(card);

  const showCount = (): void => {
    const remaining = pouchCount(save);
    countLabel.textContent = `보유 ${remaining}개`;
    countLabel.hidden = remaining === 0;
    // 남은 주머니가 있으면 `1개 더 열기` — 다 열었으면 `확인`으로 바뀐다(`닫기`는 늘 옆에 있다).
    // 한 번에 열기까지 끝났으면 [확인] 하나만 남는다.
    openButton.textContent = batchDone ? '확인' : result.childElementCount ? (remaining ? '1개 더 열기' : '확인') : '열기';
    // 한 번에 열기는 2개 이상일 때만 — 요약을 띄운 뒤에는 숨긴다(열 주머니가 없다).
    openAllButton.textContent = `전부 열기 (${remaining}개)`;
    openAllButton.disabled = animating;
    batchRow.hidden = batchDone || remaining < 2;
  };
  let animating = false, closed = false;
  /** 한 번에 열기까지 끝났는가 — 이 뒤에는 [확인]만 남고 요약이 주인공이다. */
  let batchDone = false;
  let batchBusy = false;
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
    if (batchDone) { close(); return; }                      // 요약 뒤의 [확인]은 창을 닫는다.
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
    // Canvas 빛·입자 — 0.92초 절정에 터지고 1.55초에 스스로 멈춘다(모션 감소면 빛 자체가 없다).
    light?.start(POUCH_BURST_MS, POUCH_OPEN_MS);
    // 0.92 / 1.08초에 2·3컷으로 겹쳐 넘긴다(모션 감소면 곧바로 마지막 컷).
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
    // 보상 카드가 뜨는 1.22초에 맞춰 보낸다(모션 감소·테스트처럼 연출이 짧으면 그에 맞춰 더 일찍).
    const announceDelay = reducedMotion ? 0 : Math.min(POUCH_RESULT_MS, delay);
    pendingAnnounce = () => {
      ui.message(`${opened.pouch.name} → ${pouchResultText(opened.result)}`);
      // 보물 주머니에서 레전드 장비(작업 208) — 접속 중인 모두의 화면 위 전광판에 한 줄 띄운다.
      if (isLegendaryPouchResult(opened.result)) ui.sharePouchLegend(itemDisplayName((opened.result as Extract<PouchResult, { kind: 'equipment' }>).item));
    };
    if (announceDelay <= 0) announceResult();
    else announceTimer = setTimeout(announceResult, announceDelay);
  };

  /**
   * 전부 열기 — 보유한 주머니를 **모두** 까고 개봉 창을 결과 요약으로 바꾼다(2026-11-22).
   *
   * 1개 연출은 1.55초라 30개를 이어 까면 46초가 걸린다 — 한 번에 열기는 연출 없이 **요약 한 장**을 보여 준다.
   * 세이브 변경은 `openPouches` 한 번(주머니 N개 소모 + 결과 지급)이고 저장은 `ui.world.onChange()`가
   * 한 번 건다 — 서버에는 한 요청으로 나가고, 같은 `requestId`의 재전송은 서버가 중복 처리를 막는다.
   */
  const openAll = (): void => {
    if (animating || batchBusy || batchDone || closed) return;
    if (pouchCount(save) < 2) return;
    batchBusy = true;
    openButton.disabled = true; openAllButton.disabled = true;
    const opened = openPouches(save);
    if (!opened.ok) {
      batchBusy = false;
      error.textContent = opened.message; error.hidden = false;
      ui.message(opened.message);
      showCount();
      return;
    }
    const summary = opened.summary;
    // 진행 중인 1개 연출의 타이머·빛을 거둔다(남기면 요약 위에서 결과 카드가 뒤늦게 뜬다).
    if (timer !== undefined) clearTimeout(timer);
    if (announceTimer !== undefined) clearTimeout(announceTimer);
    timer = undefined; announceTimer = undefined; pendingAnnounce = undefined;
    clearFrameTimers();
    light?.stop();
    stage.hidden = true;
    hint.hidden = true;
    error.hidden = true;
    batchPanel.replaceChildren(pouchBatchPanel(summary));
    batchPanel.hidden = false;
    batchDone = true;
    openButton.disabled = false;
    showCount();
    ui.world.onChange();
    // 토스트는 한 줄 — 주머니 30개를 개별 토스트 30개로 늘어놓지 않는다.
    ui.message(`보물 주머니 ${summary.opened}개 → ${pouchBatchText(summary)}`);
    // 한 번에 열어도 레전드 장비는 접속 중인 모두의 전광판에 올린다.
    for (const item of summary.legendary) ui.sharePouchLegend(itemDisplayName(item));
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
  openAllButton.onclick = openAll;
  overlay.onclick = event => { if (event.target === overlay) close(); };
  showCount();

  // 장비창 위에 한 겹만 얹는다(뒤의 장비창은 그대로 보인다).
  (ui.root ?? document.body).append(overlay);
  return { overlay, open, close, rates, result, batch: batchPanel };
}
