import { codexEntries, codexOptions, codexOwnership, codexSlotNames, codexVariantName, filterCodex, firstDropFloor, type CodexEntry } from '../../game/codex';
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
  summary.append(element('b', '', `발견 ${found} / ${codexEntries.length}`), element('span', '', '분해·판매 후에도 발견 기록이 남습니다.'));
  const progress = element('progress'); progress.value = found; progress.max = codexEntries.length; progress.setAttribute('aria-label', '장비 도감 발견 진행도'); summary.append(progress); dialog.append(summary);
  const toolbar = element('div', 'codex-toolbar');
  const search = element('input'); search.type = 'search'; search.placeholder = '장비 이름 검색'; search.setAttribute('aria-label', '도감 장비 이름 검색'); search.value = this.codexQuery; search.maxLength = 80;
  const slot = element('select'); slot.setAttribute('aria-label', '장비 부위');
  for (const [value, label] of [['', '모든 부위'], ...Object.entries(codexSlotNames)]) { const option = element('option', '', label); option.value = value; slot.append(option); } slot.value = this.codexSlot;
  const state = element('select'); state.setAttribute('aria-label', '발견 및 보유 상태');
  for (const [value, label] of [['all','전체'],['found','발견한 장비'],['missing','미발견 장비'],['owned','현재 보유']]) { const option = element('option', '', label); option.value = value; state.append(option); } state.value = this.codexState;
  toolbar.append(search, slot, state); dialog.append(toolbar);
  dialog.append(element('p', 'codex-hint', '그림을 누르면 등급별 등장 가능 층과 현재 층 기준 옵션을 확인합니다.'));
  const count = element('p', 'codex-result'), grid = element('div', 'codex-grid'), empty = element('p', 'empty', '조건에 맞는 장비가 없습니다.');
  dialog.append(count, grid, empty);
  for (const entry of codexEntries) {
    const ownership = codexOwnership(save, entry), card = element('button', `codex-card${ownership.discovered ? ' discovered' : ''}${this.codexSelected === entry.key ? ' selected' : ''}`);
    card.type = 'button'; card.dataset.codexKey = entry.key; card.setAttribute('aria-expanded', String(this.codexSelected === entry.key)); card.setAttribute('aria-label', `${entry.name} · ${ownership.discovered ? '발견' : '미발견'} · 상세 보기`);
    card.append(art(entry), element('b', '', entry.name), element('small', '', codexSlotNames[entry.slot]), element('span', 'codex-owned', ownership.bag + ownership.equipped ? `보유 ${ownership.bag + ownership.equipped}${ownership.equipped ? ' · 착용 중' : ''}` : ownership.discovered ? '발견 완료' : '미발견'));
    card.onclick = () => {
      this.codexSelected = this.codexSelected === entry.key ? undefined : entry.key; this.renderModal();
      this.root.querySelector<HTMLElement>('.codex-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    grid.append(card);
    if (this.codexSelected === entry.key) { const detail = codexDetail(entry, save.floor); detail.dataset.codexDetail = entry.key; grid.append(detail); }
  }
  const apply = () => {
    this.codexQuery = search.value; this.codexSlot = slot.value; this.codexState = state.value;
    const visible = new Set(filterCodex(save, this.codexQuery, this.codexSlot, this.codexState).map(entry => entry.key));
    grid.querySelectorAll<HTMLElement>('[data-codex-key]').forEach(node => { node.hidden = !visible.has(node.dataset.codexKey!); });
    const detail = grid.querySelector<HTMLElement>('[data-codex-detail]'); if (detail) detail.hidden = !visible.has(detail.dataset.codexDetail!);
    count.textContent = `${visible.size}종 표시 · 총 ${codexEntries.length}종`; empty.hidden = visible.size > 0;
  };
  search.oninput = apply; slot.onchange = apply; state.onchange = apply; apply();
}
function codexDetail(entry: CodexEntry, floor: number): HTMLElement {
  const detail = element('section', 'codex-detail'); detail.setAttribute('aria-label', `${entry.name} 상세 정보`);
  const heading = element('div', 'codex-detail-heading'); heading.append(art(entry, true), element('h3', '', entry.name)); detail.append(heading);
  detail.append(element('p', '', `${codexSlotNames[entry.slot]} · 일반 몬스터/보스 사냥에서 드랍 · 등급과 층에 따라 옵션 증가`));
  const rarity = element('select'); rarity.setAttribute('aria-label', '상세 등급 선택');
  for (const [value, label] of Object.entries(rarityNames)) { const option = element('option', '', label); option.value = value; rarity.append(option); }
  const options = element('div', 'codex-option-list'); detail.append(rarity, options);
  const update = () => {
    const grade = rarity.value as Rarity, preview = codexOptions(entry, grade, floor); options.replaceChildren();
    options.append(element('b', `rarity-${grade}`, codexVariantName(entry, grade)), element('p', '', `${firstDropFloor(entry, grade)}층부터 등장 가능 · ${preview.floor}층 드랍 옵션 기준`));
    for (const option of preview.stats) options.append(element('span', '', `${statNames[option.stat]} +${option.min}${option.min !== option.max ? `~${option.max}` : ''}`));
  };
  rarity.onchange = update; update();
  detail.append(element('p', 'codex-hint', '등장 가능 층은 확정 드랍이 아닙니다. 실제 장비 옵션은 획득한 층과 등급에 따라 달라집니다. 첫 튜토리얼 무기의 고정 옵션은 제외합니다.'));
  return detail;
}
