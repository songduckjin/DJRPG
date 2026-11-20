import type { Item } from '../../game/store';
import { jobNames, jobOrDefault, type Job } from '../../game/skills';
import type { Interface } from '../interface';
import { accountRequest } from '../login';
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from '../../game/appVersion';
import { itemDisplayName } from '../../game/items';

export type CharacterSummary = { slot: number; name: string; gender: 'male' | 'female'; job?: Job; level: number; floor: number; itemCount?: number };

/** 캐릭터 선택 카드 그림 — 전사는 기존 base 초상화, 궁수·마법사는 자기 기본 시트를 쓴다. */
function characterImage(character: CharacterSummary): string {
  const gender = character.gender === 'female' ? 'female' : 'male';
  const job = jobOrDefault(character.job);
  // 작업 159: 궁수 시트를 갈면서 `/assets/*` immutable 캐시를 피해 `?v=2`를 쓴다(render.ts·equipmentPortrait.ts와 같은 규칙).
  if (job === 'archer') return `/assets/pilot-25d/archer_${gender}_idle_v1.png?v=2`;
  if (job === 'mage') return `/assets/pilot-25d/mage_${gender}_idle_v1.png`;
  return `/assets/warrior_${gender}_base.png`;
}
type CharacterList = { characters: CharacterSummary[]; activeSlot: number; maxSlots: number; revision: number };

export async function loadCharacters(ui: Interface): Promise<void> {
  try {
    ui.characterList = await accountRequest<CharacterList>('characters', {}, ui.session.token);
    if (ui.openModal === 'characters') ui.renderModal();
  } catch (error) { ui.message(error instanceof Error ? error.message : String(error)); }
}

function button(label: string, action: () => void): HTMLButtonElement {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.onclick = action; return node;
}

export function renderCharacters(ui: Interface, dialog: HTMLElement): void {
  const list = ui.characterList;
  if (!list) { const note = document.createElement('p'); note.textContent = '캐릭터 목록을 불러오는 중…'; dialog.append(note); return; }
  const totalPages = Math.ceil(list.maxSlots / 3);
  ui.characterPage = Math.max(0, Math.min(ui.characterPage, totalPages - 1));
  const grid = document.createElement('div'); grid.className = 'character-slots';
  for (let slot = ui.characterPage * 3 + 1; slot <= Math.min(list.maxSlots, (ui.characterPage + 1) * 3); slot++) {
    const character = list.characters.find(entry => Number(entry.slot) === slot);
    const card = document.createElement('div');
    card.className = `character-slot${slot === ui.session.characterSlot ? ' selected' : ''}`;
    const select = button('', () => {
      if (!character) { ui.characterCreateSlot = slot; ui.open('createCharacter'); return; }
      if (slot === ui.session.characterSlot) { ui.message('현재 선택된 캐릭터입니다.'); return; }
      void changeCharacter(ui, 'selectCharacter', slot).catch(error => ui.message(error instanceof Error ? error.message : String(error)));
    });
    select.className = 'character-select';
    const image = document.createElement('img'); image.alt = '';
    image.src = character ? characterImage(character) : '';
    const details = document.createElement('span'); details.textContent = character ? `${character.name} · ${jobNames[jobOrDefault(character.job)]} · Lv.${character.level} · ${character.floor}층` : `슬롯 ${slot} · 새 캐릭터 만들기`;
    if (character) select.append(image);
    else { const plus = document.createElement('strong'); plus.textContent = '+'; select.append(plus); }
    select.append(details); card.append(select);
    if (character) {
      const idle = button('방치', () => {
        if (slot === ui.session.characterSlot) {
          if (!ui.world.save.autoClimb) { ui.world.save.autoClimb = true; ui.world.onChange(); }
          ui.message('현재 캐릭터의 자동 등반을 시작합니다.');
          return;
        }
        void changeCharacter(ui, 'selectCharacter', slot).catch(error => ui.message(error instanceof Error ? error.message : String(error)));
      });
      idle.className = 'character-idle';
      idle.setAttribute('aria-label', `${character.name} 방치 사냥 시작`);
      card.append(idle);
      const remove = button('삭제', () => { void deleteCharacter(ui, character).catch(error => ui.message(error instanceof Error ? error.message : String(error))); });
      remove.className = 'character-delete';
      remove.setAttribute('aria-label', `${character.name} 캐릭터 삭제`);
      remove.disabled = slot === ui.session.characterSlot;
      remove.title = remove.disabled ? '다른 캐릭터를 선택한 뒤 삭제할 수 있습니다.' : `${character.name} 삭제`;
      card.append(remove);
    }
    grid.append(card);
  }
  dialog.append(grid);
  if (totalPages > 1) {
    const pages = document.createElement('div'); pages.className = 'character-pages';
    pages.append(button('이전', () => { ui.characterPage--; ui.renderModal(); }), document.createTextNode(`${ui.characterPage + 1} / ${totalPages}`), button('다음', () => { ui.characterPage++; ui.renderModal(); }));
    pages.querySelectorAll('button')[0].disabled = ui.characterPage === 0;
    pages.querySelectorAll('button')[1].disabled = ui.characterPage >= totalPages - 1;
    let startX = 0;
    grid.addEventListener('touchstart', event => { startX = event.touches[0].clientX; }, { passive: true });
    grid.addEventListener('touchend', event => { const dx = event.changedTouches[0].clientX - startX; if (Math.abs(dx) > 50) { ui.characterPage = Math.max(0, Math.min(totalPages - 1, ui.characterPage + (dx < 0 ? 1 : -1))); ui.renderModal(); } }, { passive: true });
    dialog.append(pages);
  }
  if (list.maxSlots < 9) {
    const addSlot = button('＋ 슬롯 추가 · ◆ 500', () => { ui.shopTab = 'packages'; ui.open('shop'); });
    addSlot.className = 'character-add-slot';
    dialog.append(addSlot);
  }
  dialog.append(button('공용창고', () => ui.open('warehouse')));
}

export function renderCreateCharacter(ui: Interface, dialog: HTMLElement): void {
  const form = document.createElement('form'); form.className = 'character-create';
  const label = document.createElement('label'); label.textContent = `슬롯 ${ui.characterCreateSlot} · 이름`;
  const name = document.createElement('input'); name.name = 'characterName'; name.required = true; name.minLength = 2; name.maxLength = 16; name.pattern = '[가-힣a-zA-Z0-9_]{2,16}'; label.append(name);
  // 위 줄 = 직업, 아래 줄 = 성별. 성별 버튼 이름은 고른 직업을 따라간다(남성 전사 ↔ 남성 궁수 ↔ 남성 마법사).
  let job: Job = 'warrior';
  let selected: 'male' | 'female' = 'male';
  const jobRow = document.createElement('div'); jobRow.className = 'character-gender character-job';
  const gender = document.createElement('div'); gender.className = 'character-gender';
  const labelGenders = () => gender.querySelectorAll('button').forEach((node, index) => { node.textContent = `${index === 0 ? '남성' : '여성'} ${jobNames[job]}`; });
  for (const [value, title] of [['warrior', '전사'], ['archer', '궁수'], ['mage', '마법사']] as const) {
    const choice = button(title, () => { job = value; jobRow.querySelectorAll('button').forEach(node => node.classList.toggle('selected', node === choice)); labelGenders(); });
    choice.classList.toggle('selected', value === job); jobRow.append(choice);
  }
  for (const [value, title] of [['male', '남성 전사'], ['female', '여성 전사']] as const) {
    const choice = button(title, () => { selected = value; gender.querySelectorAll('button').forEach(node => node.classList.toggle('selected', node === choice)); });
    choice.classList.toggle('selected', value === selected); gender.append(choice);
  }
  const error = document.createElement('p'); error.className = 'character-error'; error.setAttribute('role', 'alert');
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = '캐릭터 생성';
  const loading = document.createElement('div'); loading.className = 'character-create-loading'; loading.hidden = true; loading.setAttribute('role', 'status');
  const spinner = document.createElement('i'); spinner.setAttribute('aria-hidden', 'true');
  const loadingText = document.createElement('span'); loadingText.textContent = '캐릭터를 생성하는 중입니다…'; loading.append(spinner, loadingText);
  form.append(label, jobRow, gender, error, submit, loading);
  form.onsubmit = async event => { event.preventDefault(); submit.disabled = true; loading.hidden = false; error.textContent = ''; try { await changeCharacter(ui, 'createCharacter', ui.characterCreateSlot, name.value.trim(), selected, job, () => { loadingText.textContent = '사냥터에 입장하는 중입니다…'; }); } catch (cause) { error.textContent = cause instanceof Error ? cause.message : String(cause); submit.disabled = false; loading.hidden = true; } };
  dialog.append(form, button('캐릭터 목록으로', () => ui.open('characters')));
}

async function changeCharacter(ui: Interface, action: 'selectCharacter' | 'createCharacter', slot: number, name?: string, gender?: string, job?: string, onReady?: () => void): Promise<void> {
  const sync = ui.market.sync;
  if (!await sync.flush()) throw new Error('현재 캐릭터 저장 결과를 확인한 뒤 다시 시도하세요.');
  await accountRequest(action, { slot, name, gender, job, revision: sync.revision }, ui.session.token);
  onReady?.();
  location.reload();
}

async function deleteCharacter(ui: Interface, character: CharacterSummary): Promise<void> {
  const name = window.prompt(`${character.name} 캐릭터와 착용 장비·가방 아이템 ${character.itemCount ?? 0}개가 영구 삭제됩니다. 정말 삭제하려면 캐릭터 이름을 입력하세요.`);
  if (name !== character.name) return;
  const sync = ui.market.sync;
  if (!await sync.flush()) throw new Error('현재 캐릭터 저장 결과를 확인한 뒤 다시 시도하세요.');
  await accountRequest('deleteCharacter', { slot: character.slot, name, revision: sync.revision }, ui.session.token);
  ui.characterList = undefined;
  await loadCharacters(ui);
  ui.message(`${character.name} 캐릭터를 삭제했습니다.`);
}

export async function loadWarehouse(ui: Interface): Promise<void> {
  try {
    const response = await fetch('/api/warehouse', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${ui.session.token}` }), body: JSON.stringify({ action: 'list' }) });
    const data = await response.json();
    if (isOutdatedResponse(response.status, data.code, data.expected)) { reloadForNewVersion(); return; }
    if (!response.ok) throw new Error(data.error || '공용창고를 읽지 못했습니다.');
    ui.warehouseItems = data.items as Item[];
    if (ui.openModal === 'warehouse') ui.renderModal();
  } catch (error) { ui.message(error instanceof Error ? error.message : String(error)); }
}

export function renderWarehouse(ui: Interface, dialog: HTMLElement): void {
  if (!ui.warehouseItems) { const note = document.createElement('p'); note.textContent = '공용창고를 불러오는 중…'; dialog.append(note); return; }
  const note = document.createElement('p'); note.textContent = `계정 공용 금화 ${ui.world.save.gold.toLocaleString('ko-KR')} · 보관 ${ui.warehouseItems.length}/40`;
  dialog.append(note);
  const section = (title: string, items: Item[], action: 'deposit' | 'withdraw') => {
    const heading = document.createElement('h3'); heading.textContent = title; dialog.append(heading);
    if (!items.length) { const empty = document.createElement('p'); empty.textContent = '아이템이 없습니다.'; dialog.append(empty); }
    for (const item of items) {
      const row = document.createElement('div'); row.className = 'warehouse-item';
      const label = document.createElement('span'); label.textContent = itemDisplayName(item);
      const move = button(action === 'deposit' ? '보관' : '꺼내기', () => { void moveItem(ui, action, item.id, move); });
      row.append(label, move); dialog.append(row);
    }
  };
  section('캐릭터 가방', ui.world.save.bag, 'deposit');
  section('공용창고', ui.warehouseItems, 'withdraw');
  dialog.append(button('캐릭터 목록으로', () => ui.open('characters')));
}

async function moveItem(ui: Interface, action: 'deposit' | 'withdraw', itemId: string, buttonNode: HTMLButtonElement): Promise<void> {
  buttonNode.disabled = true;
  try {
    const result = await ui.market.sync.transferWarehouse(action, itemId);
    ui.message(result.message || '창고 이동을 완료했습니다.');
    ui.warehouseItems = undefined;
    ui.renderStatus(); ui.renderBagBadge();
    await loadWarehouse(ui);
  } catch (error) { ui.message(error instanceof Error ? error.message : String(error)); buttonNode.disabled = false; }
}
