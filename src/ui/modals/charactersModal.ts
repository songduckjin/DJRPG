import type { Item } from '../../game/store';
import { jobNames, jobOrDefault, type Job } from '../../game/skills';
import type { Interface } from '../interface';
import { accountRequest } from '../login';
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from '../../game/appVersion';
import { itemDisplayName } from '../../game/items';

export type CharacterSummary = { slot: number; name: string; gender: 'male' | 'female'; job?: Job; level: number; floor: number; itemCount?: number; idleSeconds?: number };

/** 캐릭터 선택 카드 그림 — 전사는 기존 base 초상화, 궁수·마법사는 자기 기본 시트를 쓴다. */
function characterImage(character: CharacterSummary): string {
  const gender = character.gender === 'female' ? 'female' : 'male';
  const job = jobOrDefault(character.job);
  // 작업 159: 궁수 시트를 갈면서 `/assets/*` immutable 캐시를 피해 `?v=2`를 쓴다(render.ts·equipmentPortrait.ts와 같은 규칙).
  if (job === 'archer') return `/assets/pilot-25d/archer_${gender}_idle_v1.png?v=2`;
  // 작업 204: 서기 시트를 다시 구워 `?v=2`(render.ts·equipmentPortrait.ts와 같은 규칙).
  if (job === 'mage') return `/assets/pilot-25d/mage_${gender}_idle_v1.png?v=2`;
  return `/assets/warrior_${gender}_base.png`;
}
type CharacterList = { characters: CharacterSummary[]; activeSlot: number; maxSlots: number; revision: number; allIdleExpiresAt?: number; loadedAt?: number };
let characterClock: ReturnType<typeof setTimeout> | undefined;

function idleTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export async function loadCharacters(ui: Interface): Promise<void> {
  try {
    ui.characterList = { ...await accountRequest<CharacterList>('characters', {}, ui.session.token), loadedAt: Date.now() };
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
  const allIdleActive = Number(list.allIdleExpiresAt ?? 0) > Date.now();
  if (characterClock) clearTimeout(characterClock);
  if (ui.openModal === 'characters' && allIdleActive) characterClock = setTimeout(() => {
    if (ui.openModal === 'characters' && ui.characterList === list) ui.renderModal();
  }, 60_000);
  ui.characterPage = Math.max(0, Math.min(ui.characterPage, totalPages - 1));
  const grid = document.createElement('div'); grid.className = 'character-slots';
  for (let slot = ui.characterPage * 3 + 1; slot <= Math.min(list.maxSlots, (ui.characterPage + 1) * 3); slot++) {
    const character = list.characters.find(entry => Number(entry.slot) === slot);
    const card = document.createElement('div');
    card.className = `character-slot${slot === ui.session.characterSlot ? ' selected' : ''}`;
    if (character) {
      const timer = document.createElement('span'); timer.className = 'character-idle-time';
      const elapsed = allIdleActive ? Math.max(0, Math.floor((Date.now() - Number(list.loadedAt ?? Date.now())) / 1000)) : 0;
      timer.textContent = slot === ui.session.characterSlot ? '접속 중' : `방치 시간 ${idleTime(Math.min(43_200, (character.idleSeconds ?? 0) + elapsed))}`;
      card.append(timer);
    }
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
      idle.disabled = allIdleActive;
      if (allIdleActive) idle.title = '전 슬롯 방치 패키지가 활성화되어 있습니다. 캐릭터 카드를 눌러 보상을 회수하세요.';
      card.append(idle);
      const remove = button('삭제', () => { openDeleteCharacter(ui, character); });
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
  const loading = action === 'selectCharacter' ? document.createElement('div') : undefined;
  let label: HTMLSpanElement | undefined;
  if (loading) {
    loading.className = 'character-create-loading'; loading.setAttribute('role', 'status');
    const spinner = document.createElement('i'); spinner.setAttribute('aria-hidden', 'true');
    label = document.createElement('span'); label.textContent = '캐릭터에 접속하는 중입니다…';
    loading.append(spinner, label); document.body.append(loading);
  }
  try {
    const sync = ui.market.sync;
    if (!await sync.flush()) throw new Error('현재 캐릭터 저장 결과를 확인한 뒤 다시 시도하세요.');
    await accountRequest(action, { slot, name, gender, job, revision: sync.revision }, ui.session.token);
    if (label) label.textContent = '사냥터에 입장하는 중입니다…';
    onReady?.();
    location.reload();
  } catch (error) { loading?.remove(); throw error; }
}

const deleteNameMismatch = '캐릭터 이름을 정확히 입력해 주세요.';

function element(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * 캐릭터 삭제 확인창(작업 205).
 *
 * 브라우저 기본 `prompt()`는 iOS 인앱 브라우저(구글 앱·사파리 웹뷰)에서 시스템 얼럿으로 떠 게임 UI와
 * 어긋나고, 입력을 못 받거나 이름이 틀렸을 때 아무 말 없이 끝났다. 그래서 게임 모달과 같은
 * 다크 판타지 톤의 확인창을 직접 그리고, 이름이 다르면 확인창 안에 안내를 남긴다.
 *
 * 캐릭터 목록 모달은 사냥 중 `world.onChange`마다 다시 그려지므로, 이 확인창은 목록 모달의
 * `.modal-dialog` 안이 아니라 같은 화면 위에 한 겹 따로 얹는다 — 그래야 사냥이 계속돼도
 * 입력하던 이름과 오류 문구가 사라지지 않는다. 목록 모달이 닫히면 함께 닫힌다.
 */
export function openDeleteCharacter(ui: Interface, character: CharacterSummary): HTMLElement {
  // 빠르게 두 번 눌러도 확인창은 하나만 — 이미 떠 있으면 그 하나를 새로 그린다.
  ui.root?.querySelectorAll?.('.character-delete-overlay').forEach(node => node.remove());
  const overlay = element('div', 'character-delete-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '캐릭터 삭제 확인');
  const card = element('div', 'character-delete-card');
  card.append(element('h3', 'character-delete-title', '캐릭터 삭제'));
  card.append(element('p', 'character-delete-warning', `${character.name} 캐릭터와 착용 장비·가방 아이템 ${character.itemCount ?? 0}개가 영구 삭제됩니다.`));

  const form = document.createElement('form');
  form.className = 'character-delete-form';
  const field = element('label', 'character-delete-field', '확인을 위해 캐릭터 이름을 입력하세요');
  const input = document.createElement('input');
  input.type = 'text'; input.name = 'deleteCharacterName'; input.value = '';
  // iOS는 16px 미만 입력창에 포커스하면 화면을 확대하고, 자동 수정·첫 글자 대문자가 이름을 바꾼다.
  input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off');
  input.setAttribute('enterkeyhint', 'done'); input.setAttribute('aria-label', '캐릭터 이름 확인');
  field.append(input);
  const error = element('p', 'character-delete-error');
  error.setAttribute('role', 'alert');
  const actions = element('div', 'character-delete-actions');
  const cancel = element('button', 'character-delete-cancel', '취소') as HTMLButtonElement;
  cancel.type = 'button';
  const confirm = element('button', 'character-delete-confirm', '영구 삭제') as HTMLButtonElement;
  confirm.type = 'submit';
  actions.append(cancel, confirm);
  form.append(field, error, actions);
  card.append(form);
  overlay.append(card);

  const matches = (): boolean => input.value.trim() === character.name;
  let busy = false;
  let observer: MutationObserver | undefined;
  const onKey = (event: Event): void => {
    if ((event as KeyboardEvent).key !== 'Escape' || busy) return;
    event.preventDefault(); event.stopImmediatePropagation?.();
    close();
  };
  const detach = (): void => {
    observer?.disconnect();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('keydown', onKey, true);
  };
  function close(): void { detach(); overlay.remove?.(); }
  const setError = (text: string): void => { error.textContent = text; };
  const setBusy = (next: boolean): void => {
    busy = next;
    confirm.disabled = next; cancel.disabled = next;
    confirm.textContent = next ? '삭제 중…' : '영구 삭제';
    if (next) setError('');
  };
  input.addEventListener('input', () => {
    const ready = matches();
    confirm.classList.toggle('ready', ready);
    if (ready && error.textContent) setError('');
  });
  form.onsubmit = event => { event.preventDefault(); void submit(); };
  cancel.onclick = () => { if (!busy) close(); };
  overlay.onclick = event => { if (event.target === overlay && !busy) close(); };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('keydown', onKey, true);
  if (typeof MutationObserver !== 'undefined' && ui.modal) {
    observer = new MutationObserver(() => { if (ui.modal.hidden) close(); });
    observer.observe(ui.modal, { attributes: true, attributeFilter: ['hidden'] });
  }

  async function submit(): Promise<void> {
    if (busy) return;
    // 틀린 이름은 조용히 돌려보내지 않는다 — 확인창 안에 바로 안내하고 입력창으로 되돌린다.
    if (!matches()) { setError(deleteNameMismatch); try { input.focus({ preventScroll: true }); } catch { /* 포커스 불가 */ } return; }
    setBusy(true);
    try {
      const sync = ui.market.sync;
      if (!await sync.flush()) throw new Error('현재 캐릭터 저장 결과를 확인한 뒤 다시 시도하세요.');
      await accountRequest('deleteCharacter', { slot: character.slot, name: input.value.trim(), revision: sync.revision }, ui.session.token);
      close();
      ui.characterList = undefined;
      await loadCharacters(ui);
      ui.message(`${character.name} 캐릭터를 삭제했습니다.`);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  (ui.root ?? document.body).append(overlay);
  // 이미 이름을 알고 있으니 바로 입력할 수 있게 한다(키보드가 올라와도 카드가 스크롤된다).
  try { input.focus({ preventScroll: true }); } catch { /* 자동 포커스 불가 */ }
  return overlay;
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
