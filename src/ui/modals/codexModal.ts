import { codexEntries, codexOptions, codexOwnership, codexSlotNames, codexVariantName, codexVariants, firstDropFloor, type CodexEntry } from '../../game/codex';
import { rarityNames, statNames, type Rarity } from '../../game/items';
import type { Interface } from '../interface';
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function art(entry: CodexEntry, large = false): HTMLElement {
  const node = element('span', `codex-art${large ? ' codex-art-large' : ''}`);
  node.style.backgroundImage = `url("${entry.art.path}")`; node.style.backgroundSize = `${entry.art.columns * 100}% 100%`; node.style.backgroundPosition = `${entry.art.columns > 1 ? entry.art.frame / (entry.art.columns - 1) * 100 : 0}% center`;
  node.setAttribute('aria-hidden', 'true'); return node;
}
export function renderCodex(this: Interface, dialog: HTMLElement): void {
  const save = this.world.save;
  const found = codexEntries.filter(entry => codexOwnership(save, entry).discovered).length;
  const summary = element('section', 'codex-summary');
  summary.append(element('b', '', `발견 ${found} / ${codexEntries.length}`), element('span', '', '발견 기록은 기본형 기준 · 분해·판매 후에도 유지'));
  const progress = element('progress'); progress.value = found; progress.max = codexEntries.length; progress.setAttribute('aria-label', '장비 도감 발견 진행도'); summary.append(progress); dialog.append(summary);
  const toolbar = element('div', 'codex-toolbar');
  const search = element('input'); search.type = 'search'; search.placeholder = '장비 이름 검색'; search.setAttribute('aria-label', '도감 장비 이름 검색'); search.value = this.codexQuery; search.maxLength = 80;
  const slot = element('select'); slot.setAttribute('aria-label', '장비 부위');
  for (const [value, label] of [['', '모든 부위'], ...Object.entries(codexSlotNames)]) { const option = element('option', '', label); option.value = value; slot.append(option); } slot.value = this.codexSlot;
  const state = element('select'); state.setAttribute('aria-label', '발견 및 보유 상태');
  for (const [value, label] of [['all','전체'],['found','발견한 장비'],['missing','미발견 장비'],['owned','현재 보유']]) { const option = element('option', '', label); option.value = value; state.append(option); } state.value = this.codexState;
  const rarity = element('select'); rarity.setAttribute('aria-label', '장비 등급');
  for (const [value, label] of [['','모든 등급'], ...Object.entries(rarityNames)]) { const option = element('option', '', label); option.value = value; rarity.append(option); } rarity.value = this.codexRarity;
  toolbar.append(search, slot, rarity, state); dialog.append(toolbar);
  const tabs = element('div', 'codex-slot-tabs'); tabs.setAttribute('aria-label', '부위별 도감');
  for (const [value, label] of [['','전체'], ...Object.entries(codexSlotNames)]) {
    const tab = element('button', '', label); tab.type = 'button'; tab.dataset.slot = value;
    tab.onclick = () => { slot.value = value; apply(); }; tabs.append(tab);
  }
  dialog.append(tabs);
  dialog.append(element('p', 'codex-hint', '그림을 누르면 등급별 등장 가능 층과 현재 층 기준 옵션을 확인합니다.'));
  const count = element('p', 'codex-result'), grid = element('div', 'codex-grid'), empty = element('p', 'empty', '조건에 맞는 장비가 없습니다.');
  dialog.append(count, grid, empty);
  for (const variant of codexVariants(save)) {
    const { entry, rarity: grade } = variant;
    const ownership = variant, card = element('button', `codex-card rarity-${grade}${ownership.discovered ? ' discovered' : ''}${this.codexSelected === variant.key ? ' selected' : ''}`);
    card.type = 'button'; card.dataset.codexKey = variant.key; card.setAttribute('aria-expanded', String(this.codexSelected === variant.key)); card.setAttribute('aria-label', `${variant.name} · ${ownership.discovered ? '발견' : '미발견'} · 상세 보기`);
    card.append(art(entry), element('b', '', variant.name), element('small', '', codexSlotNames[entry.slot]), element('span', 'codex-owned', ownership.bag + ownership.equipped ? `보유 ${ownership.bag + ownership.equipped}${ownership.equipped ? ' · 착용 중' : ''}` : ownership.discovered ? '기본형 발견' : '미발견'));
    card.onclick = () => {
      this.codexSelected = this.codexSelected === variant.key ? undefined : variant.key; this.renderModal();
      this.root.querySelector<HTMLElement>('.codex-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    grid.append(card);
    if (this.codexSelected === variant.key) { const detail = codexDetail(entry, save.floor, grade); detail.dataset.codexDetail = variant.key; grid.append(detail); }
  }
  const apply = () => {
    this.codexQuery = search.value; this.codexSlot = slot.value; this.codexState = state.value; this.codexRarity = rarity.value;
    const visible = new Set(codexVariants(save, this.codexQuery, this.codexSlot, this.codexState, this.codexRarity).map(variant => variant.key));
    grid.querySelectorAll<HTMLElement>('[data-codex-key]').forEach(node => { node.hidden = !visible.has(node.dataset.codexKey!); });
    const detail = grid.querySelector<HTMLElement>('[data-codex-detail]'); if (detail) detail.hidden = !visible.has(detail.dataset.codexDetail!);
    tabs.querySelectorAll<HTMLButtonElement>('button').forEach(tab => { const active = tab.dataset.slot === slot.value; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
    count.textContent = `${visible.size}개 표시 · 기본형 ${codexEntries.length}종 × 4등급`; empty.hidden = visible.size > 0;
  };
  search.oninput = apply; slot.onchange = apply; rarity.onchange = apply; state.onchange = apply; apply();
}
function codexDetail(entry: CodexEntry, floor: number, grade: Rarity): HTMLElement {
  const detail = element('section', `codex-detail rarity-${grade}`); detail.setAttribute('aria-label', `${entry.name} 상세 정보`);
  const heading = element('div', 'codex-detail-heading'); heading.append(art(entry, true), element('h3', '', codexVariantName(entry, grade))); detail.append(heading);
  detail.append(element('p', '', `${codexSlotNames[entry.slot]} · ${rarityNames[grade]} · 일반 몬스터/보스 사냥에서 드랍`));
  const preview = codexOptions(entry, grade, floor), options = element('div', 'codex-option-list');
  options.append(element('p', '', `${firstDropFloor(entry, grade)}층부터 등장 가능 · ${preview.floor}층 드랍 옵션 기준`));
  for (const option of preview.stats) options.append(element('span', '', `${statNames[option.stat]} +${option.min}${option.min !== option.max ? `~${option.max}` : ''}`));
  detail.append(options, element('p', 'codex-hint', '확정 드랍이 아닙니다. 실제 옵션은 획득한 층과 등급에 따라 달라집니다. 튜토리얼 고정 옵션은 제외합니다.'));
  return detail;
}
