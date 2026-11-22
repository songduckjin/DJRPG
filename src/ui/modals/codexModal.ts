import { codexEntries, codexEntryStates, codexGroupNames, codexGroupTotals, codexOptions, codexRarities, codexSlotNames, codexVariantCount, normalizeCollection, filterCodexEntryStates, firstDropFloor, type CodexEntry, type CodexEntryState, type CodexGroup } from '../../game/codex';
import { rarityNames, statNames, type Rarity } from '../../game/items';
import type { Interface } from '../interface';
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function art(entry: CodexEntry): HTMLElement {
  const node = element('span', 'codex-art');
  node.style.backgroundImage = `url("${entry.art.path}")`; node.style.backgroundSize = `${entry.art.columns * 100}% 100%`; node.style.backgroundPosition = `${entry.art.columns > 1 ? entry.art.frame / (entry.art.columns - 1) * 100 : 0}% center`;
  node.setAttribute('aria-hidden', 'true'); return node;
}
/** 부위 표기 — 무기는 대검·활·지팡이를 함께 보여 준다(작업 208). */
function slotLabel(entry: CodexEntry): string { return entry.group ? `${codexSlotNames[entry.slot]} · ${entry.group}` : codexSlotNames[entry.slot]; }
/** 상세 띠 둘째 줄 — 부위 · 지금까지 모은 최고 등급 · 지금 몇 개 들고 있는지. */
function sheetSubtitle(view: CodexEntryState): string {
  const highest = view.highest ? `지금까지 모은 최고 등급 ${rarityNames[view.highest]}` : '아직 모은 등급이 없습니다';
  const owned = view.bag + view.equipped ? ` · 가방 ${view.bag}${view.equipped ? ` · 착용 ${view.equipped}` : ''}` : '';
  return `${slotLabel(view.entry)} · ${highest}${owned}`;
}
/** 모은 등급 수(`3/6`) — 칸 배지가 아니라 상세 띠 오른쪽 숫자다(사용자 확정: 칸에는 L·U·E·R). */
const gradeTotal = codexRarities.length;

export function renderCodex(this: Interface, dialog: HTMLElement): void {
  const ui = this;
  const save = this.world.save;
  // 1종 1칸 — 135종을 한 번에 만들고 탭·검색·상태로 `hidden`만 바꾼다(작업 208의 810칸 저장 기록은 그대로).
  const states = codexEntryStates(save);
  const found = normalizeCollection(save.equipmentCollection).length;
  const kinds = states.filter(view => view.discovered).length;
  const percent = codexVariantCount ? found / codexVariantCount * 100 : 0;

  // 요약 — 왼쪽 `수집률 N / 810`, 오른쪽 `종별 M / 135`(시안 opt2).
  const summary = element('section', 'codex-summary'); summary.setAttribute('aria-label', '도감 수집 현황');
  const rate = element('div', 'codex-rate');
  rate.append(element('span', 'codex-rate-label', '수집률'));
  const rateValue = element('b', 'codex-rate-value');
  rateValue.append(document.createTextNode(`${found} `), element('em', '', `/ ${codexVariantCount}`), element('small', '', ` (${percent.toFixed(1)}%)`));
  rate.append(rateValue);
  const kind = element('div', 'codex-kinds');
  kind.append(element('span', '', '종별'), element('b', '', `${kinds} / ${codexEntries.length}`));
  summary.append(rate, kind);
  const progress = element('progress'); progress.value = found; progress.max = codexVariantCount; progress.setAttribute('aria-label', '장비 도감 등급별 발견 진행도'); summary.append(progress);
  dialog.append(summary);

  // 탭 — 전체 135 · 무기 35 · 방어구 90 · 장신구 10.
  const groups: CodexGroup[] = ['', 'weapon', 'armor', 'accessory'];
  const tabBar = element('div', 'codex-tabs'); tabBar.setAttribute('role', 'tablist'); tabBar.setAttribute('aria-label', '도감 분류');
  const tabs = new Map<CodexGroup, HTMLButtonElement>();
  for (const group of groups) {
    const tab = element('button', 'codex-tab'); tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.dataset.codexGroup = group;
    tab.append(element('span', '', codexGroupNames[group]), element('small', '', String(codexGroupTotals[group])));
    tab.onclick = () => { ui.codexSlot = group; paint(); };
    tabs.set(group, tab); tabBar.append(tab);
  }
  dialog.append(tabBar);

  // 검색 + 상태(발견/미발견/보유) — 등급은 아래 상세 띠의 6칩이 맡는다.
  const toolbar = element('div', 'codex-search');
  const search = element('input'); search.type = 'search'; search.placeholder = '장비 이름 검색'; search.setAttribute('aria-label', '도감 장비 이름 검색'); search.value = this.codexQuery; search.maxLength = 80;
  const stateSelect = element('select'); stateSelect.setAttribute('aria-label', '발견 및 보유 상태');
  for (const [value, label] of [['all', '전체'], ['found', '발견'], ['missing', '미발견'], ['owned', '보유']]) { const option = element('option', '', label); option.value = value; stateSelect.append(option); } stateSelect.value = this.codexState;
  toolbar.append(search, stateSelect); dialog.append(toolbar);

  // 6등급 범례 — 칸 배지·테두리·상세 칩이 같은 색을 쓴다.
  const legend = element('div', 'codex-legend'); legend.setAttribute('aria-hidden', 'true');
  for (const grade of codexRarities) {
    const item = element('span', 'codex-legend-item');
    item.append(element('i', `codex-legend-dot codex-g-${grade}`), document.createTextNode(rarityNames[grade]));
    legend.append(item);
  }
  dialog.append(legend);

  const count = element('p', 'codex-result'), grid = element('div', 'codex-grid'), empty = element('p', 'empty', '조건에 맞는 장비가 없습니다.');
  dialog.append(count, grid, empty);

  // 하단 상세 띠 — 칸을 누르면 붙는다(시안 opt2). 등급 6칩으로 등장 층·옵션을 한 등급씩 본다.
  const sheet = element('section', 'codex-sheet'); sheet.hidden = true; sheet.setAttribute('aria-label', '도감 장비 상세');
  dialog.append(sheet);

  const paintSheet = (view: CodexEntryState) => {
    const entry = view.entry;
    const grade = (codexRarities as string[]).includes(ui.codexRarity) ? ui.codexRarity as Rarity : view.highest ?? codexRarities[0];
    ui.codexRarity = grade;
    const head = element('div', 'codex-sheet-head');
    const text = element('div', 'codex-sheet-text');
    text.append(element('h3', '', entry.name), element('p', '', sheetSubtitle(view)));
    const total = element('span', 'codex-sheet-count', `${view.count} / ${gradeTotal}`);
    total.setAttribute('aria-label', `등급 ${view.count}개 수집`);
    const close = element('button', 'codex-sheet-close', '×'); close.type = 'button'; close.setAttribute('aria-label', '상세 닫기');
    close.onclick = () => { ui.codexSelected = undefined; ui.codexRarity = ''; paint(); };
    head.append(art(entry), text, total, close);
    const chips = element('div', 'codex-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', `${entry.name} 등급별 옵션`);
    const body = element('div', 'codex-sheet-body');
    const paintBody = (target: Rarity) => {
      body.replaceChildren();
      const collected = view.collected.includes(target);
      const options = codexOptions(entry, target, save.floor);
      const line = element('p', 'codex-sheet-line');
      line.append(element('b', `codex-g-${target}`, rarityNames[target]), document.createTextNode(` · ${collected ? '수집함' : '미발견'} · ${firstDropFloor(entry, target)}층부터 등장 가능 · ${options.floor}층 드랍 옵션 기준`));
      body.append(line);
      const stats = element('p', 'codex-sheet-stats');
      for (const option of options.stats) stats.append(element('span', '', `${statNames[option.stat]} +${option.min}${option.min !== option.max ? `~${option.max}` : ''}`));
      body.append(stats, element('p', 'codex-hint', '확정 드랍이 아닙니다. 실제 옵션은 획득한 층과 등급에 따라 달라집니다. 튜토리얼 고정 옵션은 제외합니다.'));
    };
    const paintChips = () => {
      chips.querySelectorAll<HTMLButtonElement>('.codex-chip').forEach(chip => {
        const on = chip.dataset.codexRarity === ui.codexRarity;
        chip.classList.toggle('is-on', on); chip.setAttribute('aria-pressed', String(on));
      });
    };
    for (const target of codexRarities) {
      const collected = view.collected.includes(target);
      const chip = element('button', `codex-chip codex-g-${target}${collected ? ' is-collected' : ''}`, `${collected ? '✓ ' : ''}${rarityNames[target]}`);
      chip.type = 'button'; chip.dataset.codexRarity = target;
      chip.setAttribute('aria-label', `${rarityNames[target]}${collected ? ' 수집함' : ' 미발견'} · 옵션 보기`);
      chip.onclick = () => { ui.codexRarity = target; paintChips(); paintBody(target); };
      chips.append(chip);
    }
    paintBody(grade); paintChips();
    sheet.replaceChildren(head, chips, body);
  };

  const cards = new Map<string, HTMLButtonElement>();
  for (const view of states) {
    const card = element('button', `codex-card${view.discovered ? ' discovered' : ''}${view.highest ? ` codex-g-${view.highest}` : ''}`);
    card.type = 'button'; card.dataset.codexKey = view.entry.key;
    const status = view.highest ? `최고 등급 ${rarityNames[view.highest]} · ${view.count}/${gradeTotal}등급` : '미발견';
    card.setAttribute('aria-label', `${view.entry.name} · ${status} · 상세 보기`);
    card.append(art(view.entry), element('b', '', view.entry.name));
    // 왼쪽 위 등급 배지 — 모은 것 중 가장 높은 등급이 레어·에픽·유니크·레전드일 때만(`R`·`E`·`U`·`L`).
    // 일반·매직만 모은 종은 테두리만 등급색이고 배지는 없다(사용자 확정).
    if (view.highest && view.badge) {
      const badge = element('span', 'rarity-badge', view.badge ?? '');
      badge.setAttribute('aria-hidden', 'true'); badge.title = `${rarityNames[view.highest]} 등급`;
      card.append(badge);
    }
    card.onclick = () => {
      ui.codexSelected = ui.codexSelected === view.entry.key ? undefined : view.entry.key;
      ui.codexRarity = ui.codexSelected ? view.highest ?? codexRarities[0] : '';
      paint();
    };
    cards.set(view.entry.key, card); grid.append(card);
  }

  const paint = () => {
    for (const [group, tab] of tabs) { const on = ui.codexSlot === group; tab.classList.toggle('is-on', on); tab.setAttribute('aria-selected', String(on)); }
    const visible = filterCodexEntryStates(states, ui.codexQuery, ui.codexSlot as CodexGroup, ui.codexState);
    const visibleKeys = new Set(visible.map(view => view.entry.key));
    for (const [key, card] of cards) {
      const on = visibleKeys.has(key);
      card.hidden = !on; card.classList.toggle('selected', ui.codexSelected === key && on);
      card.setAttribute('aria-expanded', String(ui.codexSelected === key && on));
    }
    count.textContent = `${visible.length}종 표시 · 등급 칸 ${found} / ${codexVariantCount}`;
    empty.hidden = visible.length > 0;
    const view = states.find(view => view.entry.key === ui.codexSelected);
    if (view && visibleKeys.has(view.entry.key)) { paintSheet(view); sheet.hidden = false; }
    else { if (view) ui.codexSelected = undefined; sheet.hidden = true; sheet.replaceChildren(); }
  };
  const apply = () => { ui.codexQuery = search.value; ui.codexState = stateSelect.value; paint(); };
  search.oninput = apply; stateSelect.onchange = apply;
  paint();
}
