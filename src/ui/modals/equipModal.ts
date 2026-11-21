import {equipmentCount} from '../../game/bagCapacity';
import { autoEquipBest, equipmentImage, expToNext, MAX_LEVEL, rarityNames, statNames, totalStats, useSkillBook, type Item, type Save, type Slot, type Stat } from '../../game/store';
import { isEquipment, isPouch, rarityRanks, salvageGold, slotNameFor, canWield, weaponJob, itemJob, skillBookJob, type TreasurePouch } from '../../game/items';
import { extraOptionLines, extraOptionSummary } from '../../game/extraOptions';
import { jobNames, jobOrDefault } from '../../game/skills';
import { BAG_JOB_ONLY_KEY, jobOnlyLabel, jobOnlyVisible, saveJobOnly } from '../jobFilter';
import { nextSalvageRarity, saveSalvageRarity, type SalvageRarity } from '../salvageRarity';
import { AUTO_SALVAGE_HINT } from '../autoSalvage';
import { salvagePlusLabel, salvagePlusUnlocked, salvagePlusValues } from '../salvagePlus';
import { canAutoEquip } from '../../game/inventory';
import { requestSalvage } from './salvageModal';
import { equipmentPortraitPlan, renderEquipmentGlowLayers, renderEquipmentPortrait } from '../equipmentPortrait';
import { goldMarkup } from '../currency';
import { isSkillBook } from '../../game/items';
import { pouchCount, discardPouch, discardAllPouches } from '../../game/pouch';
// [미리보기 전용 · main 운영 배포 금지] 보물 주머니 버리기 버튼은 미리보기 호스트에서만 보인다(작업 251).
import { isPreviewClient } from '../../game/previewOnly';
import { openPouchWindow } from './pouchModal';
// [작업 251] 가방 `합성` — 타직업 스킬북 5권을 내 직업 책 1권으로. 팝업은 작은 창(`synthModal`).
import { openSynthWindow } from './synthModal';
import { SYNTH_BOOK_COST, synthCapacity } from '../../game/skillSynth';
import { pouchIconMarkup } from '../pouchArt';
import { showEquippedDetail, dismissEquippedDetail, deferEquippedDismiss } from '../equippedDetail';
import { bagDetailPinned, createBagDetail, deferBagDismiss, dismissBagDetail, showBagDetail } from '../bagDetail';
import { skillbookName } from '../skillbookBag';
import { bagStacks, orderedBagItems } from '../bagStacks';
import { plusBadgeMarkup } from '../plusBadge';
import { itemNameText, renderItemName } from '../itemName';
import { slotAtlasStyle } from '../slotArtStyle';
import { upgradeArrowMarkup } from '../upgradeBadge';
import type { BagFilter, Interface } from '../interface';

export const equipmentInfoSlots = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'offhand', 'necklace', 'belt', 'ring1', 'ring2'] as const;
export const equipmentInfoStats = ['전투력', 'HP', '공격력', '방어력', '치명타', '공격속도'] as const;

export function renderInventory(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save;
    const section = document.createElement('section'); section.className = 'modal-bag';
    const heading = document.createElement('div'); heading.className = 'bag-heading';
    const title = document.createElement('h3'); title.textContent = '가방';
    const sort = document.createElement('button'); sort.type = 'button'; sort.className = 'bag-rarity-sort'; sort.textContent = '등급순';
    sort.classList.toggle('active', this.bagRaritySort); sort.setAttribute('aria-pressed', String(this.bagRaritySort));
    sort.onclick = () => { this.bagRaritySort = !this.bagRaritySort; dismissBagDetail(this); this.renderModal(); };
    // `내 직업만 보기` (작업 205): 다른 직업 전용 무기(와 스킬북)만 감춘다. 공용 방어구·장신구는 그대로
    // 보이고, 켠 상태는 기기에 남긴다. [작업 228] 세로가 짧은 폰에서 가방 칸을 밀어내지 않도록
    // 제목·`등급순`과 **한 줄**에 둔다(예전에는 필터 아래 따로 한 줄을 썼다).
    const jobToggle = document.createElement('button'); jobToggle.type = 'button'; jobToggle.className = 'bag-job-only';
    jobToggle.textContent = jobOnlyLabel(this.bagJobOnly);
    jobToggle.classList.toggle('is-on', this.bagJobOnly);
    jobToggle.setAttribute('aria-pressed', String(this.bagJobOnly));
    jobToggle.setAttribute('aria-label', `내 직업만 보기 ${this.bagJobOnly ? '켜짐' : '꺼짐'}. 누르면 다른 직업 전용 무기·스킬북을 ${this.bagJobOnly ? '다시 보여 줍니다' : '숨깁니다'}`);
    jobToggle.title = `${jobNames[jobOrDefault(save.job)]}가 쓸 수 없는 무기·스킬북을 숨깁니다. 공용 방어구·장신구는 그대로 보입니다.`;
    jobToggle.onclick = () => {
      this.bagJobOnly = !this.bagJobOnly; saveJobOnly(BAG_JOB_ONLY_KEY, this.bagJobOnly);
      dismissBagDetail(this); this.renderModal();
    };
    heading.append(title, jobToggle, sort); section.appendChild(heading);
    const filters = document.createElement('div'); filters.className = 'bag-filters';
    const filterNames: Record<BagFilter, string> = { all: '장비 전체', weapon: '무기', armor: '방어구', accessory: '장신구' };
    for (const filter of Object.keys(filterNames) as BagFilter[]) {
      const button = document.createElement('button'); button.textContent = filterNames[filter];
      button.classList.toggle('active', this.bagFilter === filter);
      button.onclick = () => { this.bagFilter = filter; dismissBagDetail(this); this.renderModal(); };
      filters.appendChild(button);
    }
    section.appendChild(filters);
    const grid = document.createElement('div'); grid.className = 'bag-grid'; section.appendChild(grid);
    // 분류 필터로 한 번 고른 뒤 `내 직업만 보기`로 직업 전용 장비를 걷어 낸다(작업 205).
    // 보물 주머니(작업 207)는 장비가 아니라 분류 필터와 상관없이 늘 보인다 — 보상으로 받은 주머니를
    // 어디서 찾아야 하는지 헤매지 않게 한다. 스킬북은 스킬 창에서 다룬다.
    // **다른 직업 전용 스킬북**은 가방에 보인다(작업 210, 사용자 지시 `#4617`) — 판매·창고 보관으로 처리해야 한다.
    // 내 직업 책은 스킬 창에서 다루고, `내 직업만 보기`가 켜져 있으면 다른 직업 책은 직업 필터가 걷어 낸다.
    const myJob = jobOrDefault(save.job);
    const foreignBook = (item: Item): boolean => isSkillBook(item) && (skillBookJob(item) ?? myJob) !== myJob;
    const candidates = save.bag.filter(item => isPouch(item) || foreignBook(item) || (!isSkillBook(item) && (this.bagFilter === 'all'
      || (this.bagFilter === 'weapon' && (item.slot === 'weapon' || item.slot === 'offhand'))
      || (this.bagFilter === 'armor' && ['helmet', 'armor', 'gloves', 'belt', 'boots'].includes(item.slot))
      || (this.bagFilter === 'accessory' && ['necklace', 'ring1', 'ring2'].includes(item.slot)))));
    const shown = jobOnlyVisible(candidates, item => item, save.job, this.bagJobOnly);
    const hiddenJob = candidates.length - shown.length;
    // 칸 순서(작업 247, 사용자 확정): **보물 주머니(첫 칸) → 장비 → 스킬북**. 등급순을 켜고 꺼도 이 3단은
    // 그대로고, 등급순은 같은 단 안에서만 적용된다(`bagStacks.compareBagItems` 한 곳).
    const ordered = orderedBagItems(shown, this.bagRaritySort, myJob);
    // 같은 주머니는 한 칸에 `×N`, **같은 스킬북도 한 칸에 `×N`**으로 모아 보여 준다(작업 246 — 예전에는
    // 스킬북을 `count: 1`로 하나씩 그려 세 권이 있어도 `×1` 세 칸이었다). 칸의 `data-item-id`는 그 묶음의
    // 첫 아이템 id이고, 사용·판매·창고 이동은 지금처럼 개별 id로 처리된다.
    const stacks = bagStacks(ordered);
    const visible = stacks.map(stack => stack.item);
    for (const { item, count: quantity } of stacks) {
      const book = isSkillBook(item), pouch = isPouch(item), name = book ? skillbookName(item) : itemNameText(item);
      // 업그레이드 화살표(작업 241): 내 직업이 낄 수 있는 장비 중 지금 낀 것보다 좋은 것만.
      // 스킬북·보물 주머니는 `upgradeArrowMarkup`이 판정에서 걸러 빈 문자열을 돌려준다.
      const upgrade = upgradeArrowMarkup(save, item);
      // `+N` 강화 배지(작업 246): 업그레이드 화살표가 우상단, 타직업 배지가 좌상단, 수량이 우하단이라
      // 비어 있는 **왼쪽 아래**에 붙인다 — 장비창 장착 칸·공용창고와 같은 자리(plusBadge.ts).
      const plus = plusBadgeMarkup(item);
      const cell = document.createElement('button'); cell.className = `bag-item ${book ? 'skillbook-item' : pouch ? 'pouch-item' : item.rarity} ${this.selected === item.id ? 'selected' : ''}`;
      if (upgrade) cell.classList.add('has-upgrade');
      cell.innerHTML = itemIcon.call(this, item.slot, item, 'item-icon') + upgrade + plus;
      cell.type = 'button'; cell.dataset.itemId = item.id;
      // 직업 전용 장비에는 `전사`/`궁수`/`마법사` 배지를 단다(작업 205) — 공용 방어구·장신구에는 붙지 않는다.
      const owner = itemJob(item);
      if (owner) {
        const jobBadge = document.createElement('span'); jobBadge.className = `job-badge job-${owner}`; jobBadge.textContent = jobNames[owner];
        jobBadge.setAttribute('aria-hidden', 'true'); cell.append(jobBadge);
      }
      if (book || pouch) {
        const badge = document.createElement('span'); badge.className = 'skillbook-count'; badge.textContent = `×${quantity}`;
        cell.append(badge);
      }
      const locked = isEquipment(item) && !!item.locked;
      cell.setAttribute('aria-label', `${name}${book ? ` · ${quantity}권` : pouch ? ` · ${quantity}개` : ` · ${rarityNames[item.rarity]}`}${owner ? ` · ${jobNames[owner]} 전용` : ''}${locked ? ' · 잠긴 장비' : ''}${upgrade ? ' · 지금 장착한 장비보다 좋음' : ''}`);
      if (locked) {
        const badge = document.createElement('span'); badge.className = 'lock-icon is-locked bag-lock-badge';
        badge.setAttribute('aria-hidden', 'true'); cell.appendChild(badge);
      }
      cell.setAttribute('aria-expanded', String(this.selected === item.id));
      cell.onpointerenter = event => {
        if (event.pointerType !== 'touch') { dismissEquippedDetail(this); showBagDetail(this, item.id); }
      };
      cell.onpointerleave = () => { if (cell.isConnected) deferBagDismiss(this); };
      cell.onfocus = () => { dismissEquippedDetail(this); showBagDetail(this, item.id); };
      cell.onblur = () => { if (cell.isConnected) deferBagDismiss(this); };
      cell.onclick = () => {
        // 보물 주머니는 **가방에서 그림을 한 번 누르면 바로 개봉 창**이 뜨다(작업 212 `#4984`) —
        // 상세 패널의 [열기]를 한 번 더 누르게 하지 않는다.
        if (pouch) { dismissBagDetail(this); openPouchWindow(this, item.id); return; }
        dismissEquippedDetail(this);
        if (this.selected === item.id && bagDetailPinned(this)) dismissBagDetail(this);
        else showBagDetail(this, item.id, true);
      };
      grid.appendChild(cell);
    }
    if (!visible.length) grid.innerHTML = `<p class="empty">${hiddenJob ? '다른 직업 전용 장비만 있습니다. <b>내 직업만 보기</b>를 끄면 보입니다.' : '이 분류에 획득한 아이템이 없습니다.'}</p>`;
    const footer = document.createElement('div'); footer.className = 'modal-bag-footer';
    const pouches = pouchCount(save);
    // 가방 40칸은 **장비·다른 직업 스킬북·보물 주머니**를 1개씩 세고, **내 직업 스킬북은 세지 않는다**(작업 253).
    const bagUsed = equipmentCount(save.bag, save.job);
    const count = document.createElement('span'); count.textContent = `가방 ${bagUsed}/40`;
    count.title = bagUsed > 40
      ? `가방 ${bagUsed}/40 · 40칸을 넘었습니다. 장비를 분해하거나 공용창고에 보관해 정리해 주세요. 새 아이템·우편은 받아지지 않습니다`
      : `가방 ${bagUsed}/40 · 장비·타직업 스킬북·보물 주머니를 1개씩 셉니다(내 직업 스킬북 제외)`;
    if (bagUsed > 40) count.classList.add('is-over');
    // [작업 228] `가방 16칸` · `가방 16/40` 두 줄로 적던 것을 한 줄로 합쳤다 — 세로가 짧은 폰에서
    // 가방 칸을 밀어내던 한 줄을 바닥줄에서 돌려준다.
    if (pouches) {
      const capacity = document.createElement('small'); capacity.className = 'bag-capacity'; capacity.textContent = ` · 보물 주머니 ${pouches}개`; count.append(capacity);
    }
    const controls = document.createElement('div'); controls.className = 'bag-footer-actions';
    const equip = document.createElement('button'); equip.className = 'salvage'; equip.textContent = '자동 장착';
    const canEquip = canAutoEquip(save); equip.disabled = !canEquip; equip.classList.toggle('auto-equip-ready', canEquip);
    equip.title = canEquip ? '더 좋은 장비를 장착할 수 있습니다.' : '자동 장착할 장비가 없습니다.';
    equip.onclick = () => {
      const changed = autoEquipBest(save);
      this.selected = undefined; this.world.onChange();
      this.message(changed ? `${changed}부위 자동 장착 완료` : '이미 최고 장비 장착 중');
    };
    const rarityLabels: Record<SalvageRarity, string> = { common: '일반만', magic: '매직 이하', rare: '레어 이하', epic: '에픽 이하', unique: '유니크 이하' };
    const rarityButton = document.createElement('button'); rarityButton.className = 'salvage-rarity'; rarityButton.type = 'button';
    // The threshold is the user's own setting: it survives closing the popup and reloading the app
    // (작업 196), and every change is stored as it is made.
    const showRarity = () => {
      rarityButton.textContent = `기준: ${rarityLabels[this.salvageRarity]}`;
      rarityButton.setAttribute('aria-label', `일괄 분해 기준 ${rarityLabels[this.salvageRarity]}. 누르면 다음 등급으로 변경`);
    };
    showRarity();
    rarityButton.onclick = () => {
      this.salvageRarity = nextSalvageRarity(this.salvageRarity);
      saveSalvageRarity(this.salvageRarity);
      showRarity();
    };
    const salvage = document.createElement('button'); salvage.className = 'salvage'; salvage.textContent = '일괄 분해'; salvage.onclick = () => this.salvage();
    // 합성(작업 251, 사용자 지시 "가방에 합성버튼추가"): `분해` 옆 바닥줄에 둔다. 타직업 스킬북이 5권
    // 미만이면 누를 수 없고(안내는 title), 5권이면 작은 합성 팝업이 열린다. 재료는 **타직업 책**만이다.
    const synth = document.createElement('button'); synth.className = 'salvage synth-open'; synth.type = 'button';
    const synthRuns = synthCapacity(save);
    synth.textContent = '합성';
    synth.disabled = synthRuns < 1;
    synth.classList.toggle('is-ready', synthRuns > 0);
    synth.title = synthRuns > 0
      ? `타직업 스킬북 ${SYNTH_BOOK_COST}권으로 내 직업 스킬북 1권을 만듭니다 (${synthRuns}회 가능)`
      : `타직업 스킬북이 ${SYNTH_BOOK_COST}권 이상 있어야 합성할 수 있습니다`;
    synth.setAttribute('aria-label', synthRuns > 0 ? `스킬북 합성 · ${synthRuns}회 가능` : '스킬북 합성 · 재료 부족');
    synth.onclick = () => { dismissBagDetail(this); openSynthWindow(this); };
    // 접속 중 자동 분해 (작업 196): the switch sits beside the threshold it uses, and says right under it
    // that it only works while hunting — offline rewards keep every piece.
    const auto = document.createElement('button'); auto.className = 'salvage auto-salvage'; auto.type = 'button';
    const showAuto = () => {
      auto.textContent = `자동 분해 ${this.autoSalvage ? '켬' : '끔'}`;
      auto.classList.toggle('is-on', this.autoSalvage);
      auto.setAttribute('aria-pressed', String(this.autoSalvage));
      auto.setAttribute('aria-label', `접속 중 자동 분해 ${this.autoSalvage ? '켜짐' : '꺼짐'}. 누르면 ${this.autoSalvage ? '끕니다' : '켭니다'}`);
    };
    showAuto();
    auto.onclick = () => { this.setAutoSalvage(!this.autoSalvage); showAuto(); };
    // 41층부터 (작업 203): 고단계 장비는 경매장에 팔 수 있으므로, 자동 분해가 갈 `+단계` 상한을 등급 기준
    // 바로 옆에서 고른다. 40층 이하면 어떤 장비도 `+0`이라 예전과 똑같이 이 칸이 아예 없다.
    const plusSelect = salvagePlusUnlocked(save.maxFloor) ? salvagePlusPicker.call(this) : undefined;
    const autoHint = document.createElement('small'); autoHint.className = 'auto-salvage-hint'; autoHint.textContent = AUTO_SALVAGE_HINT;
    const plusHint = document.createElement('small'); plusHint.className = 'auto-salvage-hint';
    plusHint.textContent = '고른 단계보다 높은 장비는 자동 분해되지 않고 경매장 판매용으로 보관됩니다.';
    const jobHint = document.createElement('small'); jobHint.className = 'auto-salvage-hint bag-job-only-hint';
    jobHint.textContent = `다른 직업 전용 장비 ${hiddenJob}개는 숨겨져 있습니다.`;
    jobHint.hidden = !this.bagJobOnly || hiddenJob === 0;
    controls.append(equip, rarityButton, auto, ...(plusSelect ? [plusSelect] : []), synth, salvage, autoHint, ...(plusSelect ? [plusHint] : []), jobHint); footer.append(count, controls); section.appendChild(footer);
    dialog.appendChild(section);
    const selectedItem = visible.find(item => item.id === this.selected);
    if (selectedItem) {
      const detail = createBagDetail(this, selectedItem); detail.dataset.itemId = selectedItem.id;
      dialog.append(detail);
    }
  }

/** The `+N까지` picker (작업 203). A native select rather than a cycling button: eight values stepped one
 *  tap at a time would be seven taps to go from `+4까지` down to `+3까지`, and the phone already opens its
 *  own picker for a select. The label carries the whole meaning — `자동 분해 +4까지` — so no extra caption
 *  is needed beside the 자동 분해 switch. */
function salvagePlusPicker(this: Interface): HTMLSelectElement {
  const select = document.createElement('select'); select.className = 'salvage-plus';
  select.setAttribute('aria-label', `자동 분해 +단계 상한 ${salvagePlusLabel(this.salvagePlus)}. 고른 단계까지만 자동 분해하고 그 위는 보관합니다`);
  for (const value of salvagePlusValues) {
    const option = document.createElement('option'); option.value = String(value); option.textContent = `자동 분해 ${salvagePlusLabel(value)}`; select.append(option);
  }
  select.value = String(this.salvagePlus);
  select.onchange = () => this.setSalvagePlus(Number(select.value));
  return select;
}

export function itemDetail(this: Interface, save: Save, item: Item): HTMLElement {
    const panel = document.createElement('div'); panel.className = `item-detail ${isSkillBook(item) ? 'skillbook-detail' : isPouch(item) ? 'pouch-detail' : item.rarity}`;
    const myJob = jobOrDefault(save.job);
    // 보물 주머니(작업 207): 상세에서 바로 [열기] — 큰 개봉 창이 열린다.
    if (isPouch(item)) return pouchDetail.call(this, save, item);
    if (isSkillBook(item)) {
      const title = document.createElement('h2'); title.textContent = skillbookName(item); panel.appendChild(title);
      // 어느 직업의 스킬북인지 바로 보이게 한다(작업 205) — 내 직업이 아니면 그 사실도 함께 적는다.
      const owner = skillBookJob(item);
      const mine = (owner ?? myJob) === myJob;
      if (owner) {
        const jobLine = document.createElement('span'); jobLine.className = `item-detail-job job-${owner}`;
        jobLine.textContent = mine ? `${jobNames[owner]} 전용 스킬북 · 내 직업` : `${jobNames[owner]} 전용 스킬북`;
        panel.appendChild(jobLine);
      }
      // 다른 직업 전용 스킬북(작업 210): 여기서 쓸 수 없고, 경매장 판매·공용창고 보관으로 처리한다.
      if (!mine) {
        const note = document.createElement('p'); note.className = 'pouch-detail-note';
        note.textContent = `다른 직업 전용 스킬북 · ${jobNames[owner as keyof typeof jobNames]} 캐릭터만 사용할 수 있습니다. 경매장 판매/공용창고 보관 가능.`;
        panel.appendChild(note); return panel;
      }
      const note = document.createElement('p'); note.textContent = '사용하면 해당 스킬을 습득하거나 1레벨 강화합니다. 최대 Lv.30'; panel.appendChild(note);
      const use = document.createElement('button'); use.type = 'button'; use.className = 'skillbook-use'; use.textContent = '사용하기';
      use.onclick = () => {
        const before = totalStats(save).health;
        const result = useSkillBook(save, item.id);
        if (!result.ok) { this.message(result.message); return; }
        this.world.player.hp += totalStats(save).health - before;
        save.health = this.world.player.hp;
        this.selected = undefined; this.world.onChange(); this.message(result.message);
      };
      panel.appendChild(use); return panel;
    }
    const equipped = save.equipment[item.slot];
    const heading = document.createElement('div'); heading.className = 'item-detail-heading';
    const title = document.createElement('h2'); renderItemName(title, item);
    const slotTitle = document.createElement('span'); slotTitle.className = 'item-detail-slot'; slotTitle.textContent = ` · ${slotNameFor(item.slot, item.slot === 'weapon' ? weaponJob(item) : jobOrDefault(save.job))}`; title.append(slotTitle);
    const lock = document.createElement('button'); lock.type = 'button'; lock.className = 'item-lock';
    lock.setAttribute('aria-pressed', String(!!item.locked)); lock.setAttribute('aria-label', item.locked ? '장비 잠금 해제' : '장비 잠금');
    lock.title = item.locked ? '잠금 중 · 누르면 해제' : '열림 · 누르면 분해 방지 잠금';
    lock.innerHTML = `<span class="lock-icon ${item.locked ? 'is-locked' : 'is-open'}" aria-hidden="true"></span>`;
    lock.onclick = () => { if (this.world.paused) return; item.locked = !item.locked; this.world.onChange(); };
    heading.append(title, lock); panel.append(heading);
    const grade = document.createElement('small'); grade.className = `item-detail-grade rarity-${item.rarity}`; grade.textContent = rarityNames[item.rarity]; panel.append(grade);
    // 직업 전용 무기에는 어느 직업의 것인지 배지를 달고, 내 직업이 아니면 장착할 수 없다고 한 줄로 적는다(작업 205).
    const ownerJob = itemJob(item);
    if (ownerJob) {
      const jobLine = document.createElement('span'); jobLine.className = `item-detail-job job-${ownerJob}`;
      const mine = ownerJob === jobOrDefault(save.job);
      jobLine.textContent = mine ? `${jobNames[ownerJob]} 전용 무기 · 내 직업` : `장착 불가 (${jobNames[ownerJob]} 전용)`;
      panel.append(jobLine);
    }
    const compared = new Set<Stat>([...Object.keys(item.stats), ...Object.keys(equipped?.stats ?? {})] as Stat[]);
    for (const stat of compared) {
      const diff = (item.stats[stat] ?? 0) - (equipped?.stats[stat] ?? 0);
      const line = document.createElement('span'); line.className = diff >= 0 ? 'up' : 'down';
      line.textContent = `${statNames[stat]} +${item.stats[stat] ?? 0} (현재 +${equipped?.stats[stat] ?? 0}) ${diff >= 0 ? '▲' : '▼'}${Math.abs(diff)}`; panel.appendChild(line);
    }
    // 추가옵션(작업 238): 애픽 1 · 유니크 2 · 전설 3줄을 스탯 아래에 붙인다.
    for (const extra of extraOptionLines(item)) {
      const line = document.createElement('span'); line.className = 'item-extra'; line.textContent = extra; panel.appendChild(line);
    }
    const buttons = document.createElement('div'); buttons.className = 'detail-actions';
    // 다른 직업의 무기는 입을 수 없다(작업 204): 버튼을 잠그고 어느 직업의 무기인지 알린다.
    const wieldable = canWield(item, jobOrDefault(save.job));
    const equip = document.createElement('button'); equip.textContent = wieldable ? '장착' : `${jobNames[weaponJob(item)]} 전용`;
    equip.disabled = !wieldable;
    if (!wieldable) { equip.title = `${jobNames[weaponJob(item)]}만 쓸 수 있는 무기입니다. 경매장에 팔거나 분해하세요.`; equip.setAttribute('aria-label', `${itemNameText(item)} · ${jobNames[weaponJob(item)]} 전용 무기, 장착할 수 없음`); }
    equip.onclick = () => {
      if (!wieldable) { this.message(`${jobNames[weaponJob(item)]}만 쓸 수 있는 무기입니다.`); return; }
      const index = save.bag.findIndex(i => i.id === item.id); if (index < 0) return;
      save.bag.splice(index, 1); if (equipped) save.bag.push(equipped); save.equipment[item.slot] = item;
      if (item.name === '낡은 두손검' && save.tutorial === 2) { save.tutorial = 3; this.message('튜토리얼 완료! 두손검을 장착했습니다.'); }
      this.selected = undefined; this.world.onChange();
    };
    const dismantle = document.createElement('button'); dismantle.textContent = item.locked ? '잠금 중' : '분해'; dismantle.disabled = !!item.locked; dismantle.onclick = () => requestSalvage.call(this, [item.id]);
    buttons.append(equip, dismantle); panel.appendChild(buttons); return panel;
  }

/** 보물 주머니 상세(작업 207) — 가방에서 주머니를 고르면 여기서 [열기]로 개봉 창을 연다. */
export function pouchDetail(this: Interface, save: Save, pouch: TreasurePouch): HTMLElement {
  const panel = document.createElement('div'); panel.className = 'item-detail pouch-detail';
  const heading = document.createElement('div'); heading.className = 'item-detail-heading';
  const title = document.createElement('h2'); title.textContent = pouch.name; heading.append(title); panel.append(heading);
  const grade = document.createElement('small'); grade.className = 'item-detail-grade rarity-unique'; grade.textContent = '소모품 · 보물 주머니'; panel.append(grade);
  const note = document.createElement('p'); note.className = 'pouch-detail-note';
  note.textContent = '열면 금화 · 장비 · 스킬북 중 하나가 나옵니다. 확률표는 개봉 창 왼쪽 위 [확률표]에서 볼 수 있습니다.'; panel.append(note);
  const count = document.createElement('span'); count.className = 'pouch-detail-count'; count.textContent = `보유 ${pouchCount(save)}개`; panel.append(count);
  const buttons = document.createElement('div'); buttons.className = 'detail-actions';
  const open = document.createElement('button'); open.type = 'button'; open.className = 'pouch-open';
  open.textContent = '열기'; open.setAttribute('aria-label', `${pouch.name} 열기`);
  open.onclick = () => { openPouchWindow(this, pouch.id); };
  buttons.append(open); panel.append(buttons);
  // [미리보기 전용 · main 운영 배포 금지] 보물 주머니 버리기 (작업 251, 사용자 요청).
  // 미리보기 테스트 주머니가 많아 가방이 40칸을 넘었을 때 바로 정리할 수 있게 한다. 미리보기가 아니면 안 붙는다.
  if (isPreviewClient()) {
    const discard = document.createElement('button'); discard.type = 'button'; discard.className = 'pouch-discard';
    discard.textContent = '버리기';
    discard.onclick = () => {
      const result = discardPouch(save, pouch.id);
      if (!result.ok) { this.message(result.message); return; }
      this.selected = undefined; this.world.onChange(); this.message(result.message);
    };
    const discardAll = document.createElement('button'); discardAll.type = 'button';
    discardAll.className = 'pouch-discard-all'; discardAll.textContent = `모두 버리기 (${pouchCount(save)}개)`;
    discardAll.onclick = () => {
      // 되돌릴 수 없는 동작이라 한 번 더 확인한다(첫 누름 → 빨간 확인 버튼).
      if (!discardAll.classList.contains('is-armed')) {
        discardAll.classList.add('is-armed'); discardAll.textContent = `정말 모두 버리기 (${pouchCount(save)}개)`; return;
      }
      const result = discardAllPouches(save);
      if (!result.ok) { this.message(result.message); return; }
      this.selected = undefined; this.world.onChange(); this.message(result.message);
    };
    buttons.append(discard, discardAll);
  }
  return panel;
}

export function salvage(this: Interface): void {
    const save = this.world.save;
    const ids = save.bag.filter(item => isEquipment(item) && !item.locked && rarityRanks[item.rarity] <= rarityRanks[this.salvageRarity]).map(item => item.id);
    requestSalvage.call(this, ids);
  }

export function renderEquipment(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save, stats = totalStats(save);
    const showcase = document.createElement('div'); showcase.className = 'equipment-showcase';
    const addSlot = (slot: Slot, grid: HTMLElement) => {
      const item = save.equipment[slot]; const cell = document.createElement('button'); cell.className = `equipment-slot ${item?.rarity ?? 'empty-slot'}`;
      cell.type = 'button'; cell.dataset.equippedSlot = slot; cell.disabled = !item;
      const slotLabel = slotNameFor(slot, jobOrDefault(save.job));
      // 착용 중 장비에도 강화 단계를 **왼쪽 아래**에 붙인다(작업 246) — 예전에는 장착 칸에만 `+N`이 빠져
      // 가방·공용창고와 보이는 자리가 달랐다.
      cell.innerHTML = `${itemIcon.call(this, slot, item, 'slot-icon')}<small class="slot-part">${slotLabel}</small>${item ? plusBadgeMarkup(item) : ''}`;
      cell.setAttribute('aria-label', `${slotLabel} · ${item ? itemNameText(item) : '빈 슬롯'}`);
      cell.title = item ? itemNameText(item) : '빈 슬롯';
      cell.setAttribute('aria-expanded', String(this.equippedSlot === slot));
      cell.onpointerenter = event => { if (event.pointerType !== 'touch') showEquippedDetail(this, slot); };
      cell.onpointerleave = () => { if (cell.isConnected) deferEquippedDismiss(this); };
      cell.onfocus = () => showEquippedDetail(this, slot);
      cell.onblur = () => { if (cell.isConnected) deferEquippedDismiss(this); };
      cell.onclick = () => {
        if (this.equippedSlot === slot && this.equippedPinned) dismissEquippedDetail(this);
        else showEquippedDetail(this, slot, true);
      };
      grid.appendChild(cell);
    };
    const center = document.createElement('div'); center.className = 'showcase-hero';
    const figure = document.createElement('span'); figure.className = 'showcase-figure';
    const portrait = document.createElement('img'); portrait.className = 'showcase-body'; portrait.alt = '현재 장착 장비 미리보기';
    portrait.src = equipmentPortraitPlan(save).base;
    void renderEquipmentPortrait(save).then(image => { if (portrait.isConnected) portrait.src = image; })
      .catch(error => console.error('착용 이미지 생성 실패:', error));
    figure.appendChild(portrait);
    // 등급색 발광(작업 218) — 유니크·전설 장비를 착용한 부위만 초상화 위에서 숨쉰다.
    const glowLayer = document.createElement('span'); glowLayer.className = 'showcase-glow';
    glowLayer.setAttribute('aria-hidden', 'true');
    figure.appendChild(glowLayer);
    void renderEquipmentGlowLayers(save).then(layers => {
      if (!glowLayer.isConnected) return;
      for (const layer of layers) {
        const image = document.createElement('img');
        image.className = 'showcase-glow-layer'; image.alt = ''; image.decoding = 'async';
        image.src = layer.src;
        image.style.setProperty('--gear-cycle', `${layer.cycle}s`);
        image.style.setProperty('--gear-color', layer.color);
        image.dataset.glowSlot = layer.slot;
        glowLayer.appendChild(image);
      }
    }).catch(error => console.error('장비 발광 합성 실패:', error));
    center.appendChild(figure);
    const info = document.createElement('div'); info.className = 'equipment-info';
    const summary = document.createElement('div'); summary.className = 'equipment-summary';
    const expPercent = save.level >= MAX_LEVEL ? 'MAX' : `${Math.floor(save.exp / expToNext(save.level) * 100)}%`;
    summary.innerHTML = `<span>LV <b>${save.level >= MAX_LEVEL ? `${MAX_LEVEL} MAX` : save.level}</b></span><span>${save.floor}층</span><span>EXP <b>${expPercent}</b></span><span>${goldMarkup(save.gold)} · 강화석 ${save.stones}</span>`;
    info.appendChild(summary);
    const power = Math.round(stats.attack * 3 + stats.defense * 2 + stats.health * .2 + stats.crit * 2 + stats.speed * 2);
    const values = [power, `${Math.ceil(this.world.player.hp)}/${stats.health}`, stats.attack, stats.defense, `${stats.crit}%`, `${stats.speed}%`];
    const statGrid = document.createElement('div'); statGrid.className = 'equipment-info-stats';
    equipmentInfoStats.forEach((label, index) => {
      const cell = document.createElement('div'); cell.innerHTML = `<span>${label}</span><b>${values[index]}</b>`; statGrid.appendChild(cell);
    });
    info.appendChild(statGrid);
    // 추가옵션(작업 238) 합계 — 상한이 걸린 실제 전투 값(회피 30%·회복 12%/5초·피흡 15%).
    const extraSummary = extraOptionSummary(save.equipment);
    if (extraSummary) {
      const extraLine = document.createElement('div'); extraLine.className = 'equipment-info-extras';
      extraLine.textContent = `✨ ${extraSummary}`;
      info.appendChild(extraLine);
    }
    showcase.append(center, info); dialog.appendChild(showcase);
    const grid = document.createElement('div'); grid.className = 'equipment-grid'; grid.setAttribute('aria-label', '장착 장비 10칸');
    for (const slot of equipmentInfoSlots) addSlot(slot, grid);
    dialog.appendChild(grid);
  }

export function salvageValue(this: Interface, item: Item): number { return salvageGold[item.rarity]; }

function itemIcon(this: Interface, slot: Slot | 'skillbook' | 'pouch', item: Item | undefined, className: string): string {
  // 보물 주머니(작업 207): 확정 이미지가 오기 전까지 CSS로 그린 주머니를 쓴다(`ui/pouchArt.ts`).
  if (isPouch(item)) return pouchIconMarkup(className);
  if (item && isEquipment(item)) {
    const art = equipmentImage(item);
    // 장착 칸(작업 231): 내용 상자만 칸에 꽉 차게 그려 물건이 작아 보이지 않게 한다(비율은 그대로).
    if (art.columns === 5 && className === 'slot-icon') return `<span class="${className} atlas-icon" style="${slotAtlasStyle(art.path, art.frame)}" aria-hidden="true"></span>`;
    if (art.columns === 5) return `<span class="${className} atlas-icon" style="background-image:url('${art.path}');background-position:${art.frame * 25}% center" aria-hidden="true"></span>`;
  }
  return `<img class="${className}" src="${this.iconPath(slot, item)}" alt="">`;
}

export function iconPath(this: Interface, slot: Slot | 'skillbook' | 'pouch', item?: Item): string {
  if (slot === 'skillbook') return '/assets/icons/icon_skillbook.png';
  if (slot === 'pouch') return '';
  const iconSlot = slot === 'ring1' || slot === 'ring2' ? 'ring' : slot;
  if (item && isEquipment(item)) return equipmentImage(item).path;
  return `/assets/icons/${iconSlot}.png`;
}

export function wrapEquipmentName(name: string): string {
  const lines: string[] = [];
  let line = '';
  for (const word of name.trim().split(/\s+/)) {
    const characters = Array.from(word);
    if (line && Array.from(line).length + 1 + characters.length <= 8) { line += ` ${word}`; continue; }
    if (line) { lines.push(line); line = ''; }
    while (characters.length > 8) lines.push(characters.splice(0, 8).join(''));
    line = characters.join('');
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
