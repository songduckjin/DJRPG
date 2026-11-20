import { freshSave, parseSave, type Item, type Save } from '../../game/store';
import { jobNames, jobOrDefault, type Job } from '../../game/skills';
import type { Interface } from '../interface';
import { accountRequest } from '../login';
import { type EquipmentItem, type Slot } from '../../game/items';
import { equipmentFallbackPortrait, equipmentPortraitPlan, renderEquipmentPortrait } from '../equipmentPortrait';
import { loadWarehouse as loadWarehouseModal, renderWarehouse as renderWarehouseModal } from './warehouseModal';
import { discoverEquipment } from '../../game/codex';
import { applyOfflineRewards } from '../../game/offline';

/** `characters` 응답이 슬롯마다 내려 주는 장비 외형 정보(작업 210) — 이름만 있고 능력치·가방은 없다. */
export type CharacterEquipment = { helmet?: { name?: string } | null; armor?: { name?: string } | null; weapon?: { name?: string } | null } | null;

export type CharacterSummary = { slot: number; name: string; gender: 'male' | 'female'; job?: Job; level: number; floor: number; itemCount?: number; idleSeconds?: number; equipment?: CharacterEquipment };

/** 카드 초상화 높이(px) — 카드는 108px 높이라 360px면 충분하고, 장비창(720px)보다 캔버스가 가볍다. */
export const characterPortraitHeight = 360;

function portraitItem(slot: Slot, value?: { name?: string } | null): EquipmentItem | undefined {
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  return name ? { id: `card-${slot}`, name, slot, rarity: 'common', stats: {} } : undefined;
}

/**
 * 캐릭터 선택 카드의 합성 초상화용 최소 `Save`(작업 210).
 *
 * 서버 `characters` 응답은 **다른 슬롯**의 장비 이름만 준다(능력치·가방·계정 정보 없음).
 * 초상화 경로(`equipmentPortrait.ts`)는 성별·직업·장비 이름만 읽으므로 그 셋만 채운다.
 * 접속 중인 슬롯은 이 함수 대신 `ui.world.save`를 그대로 써서, 장비를 갈아입고 모달을 열면
 * 바로 바뀐 외형이 보이게 한다.
 */
export function characterPortraitSave(character: CharacterSummary): Save {
  const save = freshSave(character.gender === 'female' ? 'female' : 'male', jobOrDefault(character.job));
  save.name = character.name;
  const level = Math.floor(Number(character.level)), floor = Math.floor(Number(character.floor));
  if (Number.isFinite(level) && level >= 1) save.level = level;
  if (Number.isFinite(floor) && floor >= 1) save.floor = floor;
  const helmet = portraitItem('helmet', character.equipment?.helmet);
  const armor = portraitItem('armor', character.equipment?.armor);
  const weapon = portraitItem('weapon', character.equipment?.weapon);
  save.equipment = {};
  if (helmet) save.equipment.helmet = helmet;
  if (armor) save.equipment.armor = armor;
  if (weapon) save.equipment.weapon = weapon;
  return save;
}

/** 합성 결과 캐시 — 사냥 중 모달이 자주 다시 그려져도 같은 장비는 기본 시트로 깜빡이지 않는다. */
const cardPortraits = new Map<string, string>();

/**
 * 카드 그림을 채운다. 접속 중인 슬롯은 라이브 세이브, 다른 슬롯은 서버가 준 장비 이름으로
 * 필드·장비창과 같은 합성 초상화(전신 + 투구 + 갑옷/로브 + 무기/활/지팡이)를 그린다.
 * 합성이 끝나기 전에는 같은 조합의 전신 시트를 먼저 보여 준다.
 */
function paintCharacterPortrait(ui: Interface, image: HTMLImageElement, character: CharacterSummary, slot: number): void {
  // 라이브 세이브는 초상화가 읽는 `equipment`가 있을 때만 쓴다(세이브가 아직 없는 화면·테스트 대비).
  const live = slot === ui.session?.characterSlot && ui.world?.save?.equipment ? ui.world.save : undefined;
  const save = live ?? characterPortraitSave(character);
  const key = `${equipmentPortraitPlan(save).key}@${characterPortraitHeight}`;
  const painted = cardPortraits.get(key);
  image.src = painted ?? equipmentFallbackPortrait(save);
  if (painted) return;
  void renderEquipmentPortrait(save, { height: characterPortraitHeight }).then(source => {
    if (cardPortraits.size >= 24) cardPortraits.clear();
    cardPortraits.set(key, source);
    if (image.isConnected) image.src = source;
  }).catch(error => console.info('[캐릭터 선택] 초상화 합성 실패 → 전신 시트 표시:', error));
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
    // [작업 216] 카드에는 평소 외형·정보만 보이고, 카드를 누른 그 카드에서만 `선택`·`방치`·`삭제`가
    // 나타난다. 사냥 중 모달이 다시 그려져도 펼친 카드가 유지되도록 펼침 상태는 `ui`에 둔다.
    const focused = ui.characterFocus === slot;
    const card = document.createElement('div');
    card.className = `character-slot${slot === ui.session.characterSlot ? ' selected' : ''}${focused ? ' focused' : ''}`;
    if (character) {
      const timer = document.createElement('span'); timer.className = 'character-idle-time';
      const elapsed = allIdleActive ? Math.max(0, Math.floor((Date.now() - Number(list.loadedAt ?? Date.now())) / 1000)) : 0;
      timer.textContent = slot === ui.session.characterSlot ? '접속 중' : `방치 시간 ${idleTime(Math.min(43_200, (character.idleSeconds ?? 0) + elapsed))}`;
      card.append(timer);
    }
    const select = button('', () => {
      // 빈 슬롯은 누르면 바로 생성 화면이다. 캐릭터가 있는 카드는 접속하지 않고 펼치기만 한다.
      if (!character) { ui.characterCreateSlot = slot; ui.open('createCharacter'); return; }
      ui.characterFocus = focused ? undefined : slot;
      ui.renderModal();
    });
    select.className = 'character-select';
    const details = document.createElement('span'); details.textContent = character ? `${character.name} · ${jobNames[jobOrDefault(character.job)]} · Lv.${character.level} · ${character.floor}층` : `슬롯 ${slot} · 새 캐릭터 만들기`;
    if (character) {
      const image = document.createElement('img');
      image.className = 'character-portrait';
      image.alt = `${character.name} ${jobNames[jobOrDefault(character.job)]} 외형`;
      select.append(image);
      paintCharacterPortrait(ui, image, character, slot);
    } else { const plus = document.createElement('strong'); plus.textContent = '+'; select.append(plus); }
    select.append(details); card.append(select);
    if (character) {
      const connect = button('선택', () => {
        if (slot === ui.session.characterSlot) { ui.message('현재 선택된 캐릭터입니다.'); return; }
        void changeCharacter(ui, 'selectCharacter', slot).catch(error => ui.message(error instanceof Error ? error.message : String(error)));
      });
      connect.className = 'character-connect';
      connect.setAttribute('aria-label', `${character.name} 선택해서 접속`);
      connect.title = slot === ui.session.characterSlot ? '지금 접속 중인 캐릭터입니다.' : `${character.name}으로 접속`;
      card.append(connect);
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
  // [작업 223/#18745] 공용창고는 하단 메뉴 아이콘으로 옮겼다 — 캐릭터 선택 화면에는 두지 않는다.
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
  // [작업 216] 성별 버튼은 직업 이름을 붙이지 않고 `남` / `여`만 표시한다(직업은 위 줄에서 고른다).
  const labelGenders = () => gender.querySelectorAll('button').forEach((node, index) => { node.textContent = index === 0 ? '남' : '여'; });
  for (const [value, title] of [['warrior', '전사'], ['archer', '궁수'], ['mage', '마법사']] as const) {
    const choice = button(title, () => { job = value; jobRow.querySelectorAll('button').forEach(node => node.classList.toggle('selected', node === choice)); labelGenders(); });
    choice.classList.toggle('selected', value === job); jobRow.append(choice);
  }
  for (const [value, title] of [['male', '남'], ['female', '여']] as const) {
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
    // 바뀐 것이 없으면(`flushIfDirty`) 저장 요청을 보내지 않고 바로 넘어간다 — 예전에는 캐릭터를
    // 고를 때마다 `flush()`가 빈 저장을 한 번 더 왕복했다(작업 227).
    if (!await sync.flushIfDirty()) throw new Error('현재 캐릭터 저장 결과를 확인한 뒤 다시 시도하세요.');
    const result = await accountRequest<CharacterSwitchResult>(action, { slot, name, gender, job, revision: sync.revision }, ui.session.token);
    if (!result || !result.save || !Number.isInteger(result.characterSlot) || !Number.isSafeInteger(result.revision)) throw new Error('캐릭터 전환 응답이 올바르지 않습니다. 다시 시도해 주세요.');
    if (label) label.textContent = '사냥터에 입장하는 중입니다…';
    onReady?.();
    // **`location.reload()` 없이** 받은 세이브로 그 자리에서 갈아탄다(작업 227). 새로고침은 번들·에셋·
    // `/api/account`을 처음부터 다시 받아 iOS에서 "접속하는 중입니다"가 오래 걸리는 원인이었다.
    applyCharacterSwitch(ui, result);
    loading?.remove();
  } catch (error) { loading?.remove(); throw error; }
}

/** `selectCharacter`·`createCharacter` 응답 — 서버가 새 세이브와 활성 슬롯을 함께 내려준다(작업 227). */
export type CharacterSwitchResult = { characterSlot: number; revision: number; save: Save; characterName?: string; offlineSeconds?: number };

/**
 * 캐릭터 전환 결과를 화면 전체에 반영한다(작업 227). 새로고침 대신 인메모리로 갈아타므로,
 * 월드·저장 동기화·세션·HUD·가방·임무 배지를 한 번에 새 캐릭터로 맞춘다.
 */
export function applyCharacterSwitch(ui: Interface, result: CharacterSwitchResult): void {
  const save = parseSave(result.save, ui.session.accountId);
  const sync = ui.market.sync;
  // 월드는 같은 인스턴스를 쓰고(렌더러·저장 큐가 이 객체를 가리킨다) 세이브 내용만 갈아탄다.
  ui.world.adoptSave(save);
  // 보상 정산은 **월드가 들고 있는 세이브**(= 저장 동기화가 보는 객체)에 직접 적용한다.
  const live = ui.world.save;
  ui.session.save = live;
  ui.session.characterSlot = result.characterSlot;
  ui.session.revision = result.revision;
  ui.session.gender = live.gender;
  ui.session.job = live.job;
  sync.revision = result.revision;
  sync.session.characterSlot = result.characterSlot;
  discoverEquipment(live);
  // 모달·선택 상태는 새 캐릭터의 것으로 다시 시작한다(이전 캐릭터의 아이디·슬롯이 남지 않게).
  ui.knownItems = new Set([...live.bag, ...Object.values(live.equipment)].filter(Boolean).map(item => (item as Item).id));
  ui.newItems.clear();
  ui.selected = undefined; ui.equippedSlot = undefined; ui.equippedPinned = false;
  ui.characterFocus = undefined; ui.characterList = undefined;
  ui.open(null);
  // 아직 사냥하지 않은 캐릭터는 그동안의 오프라인 보상을 여기서 한 번에 정산한다(서버가 초를 내려준다).
  const reward = result.offlineSeconds ? applyOfflineRewards(live, result.offlineSeconds) : undefined;
  ui.renderStatus(); ui.renderBagBadge();
  if (reward) { sync.markDirty(); ui.showOfflineReward(reward); void sync.flush(); }
  void ui.journey.load();
}

const deleteNameMismatch = '캐릭터 이름을 정확히 입력해 주세요.';

function element(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * 캐릭터 삭제 확인창(작업 206).
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

// 공용창고 화면은 `warehouseModal.ts`로 옮겼다(작업 225). 예전 import 경로(`interface.ts`)를 위해 이름만 유지한다.
export const loadWarehouse = loadWarehouseModal;
export const renderWarehouse = renderWarehouseModal;
