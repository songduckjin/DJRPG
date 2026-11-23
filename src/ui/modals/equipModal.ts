import { emitDomainEvent } from '../../core/domainEvents';
import {EQUIPMENT_BAG_LIMIT,equipmentCount} from '../../game/bagCapacity';
import { autoEquipBest, equipmentImage, rarityNames, statNames, totalStats, type Item, type Save, type Slot, type Stat } from '../../game/store';
import { isEquipment, isPouch, isStatBook, rarityRanks, salvageGold, slotNameFor, canWield, weaponJob, itemJob, advanceTutorialOnEquip, type TreasurePouch } from '../../game/items';
import { STAT_BOOKS, isStatBookKind, statBookCounts, statBookLabel, statBookStatusText, useStatBook } from '../../game/statBooks';
import { objectParticle, tutorialGuide } from '../../game/tutorial';
import { extraOptionLines, extraOptionSummary } from '../../game/extraOptions';
import { jobNames, jobShortNames, jobOrDefault } from '../../game/skills';
import { BAG_JOB_ONLY_KEY, jobOnlyLabel, jobOnlyVisible, saveJobOnly } from '../jobFilter';
import { nextSalvageRarity, saveSalvageRarity, type SalvageRarity } from '../salvageRarity';
import { AUTO_SALVAGE_HINT } from '../autoSalvage';
import { salvagePlusLabel, salvagePlusUnlocked, salvagePlusValues } from '../salvagePlus';
import { canAutoEquip } from '../../game/inventory';
import { patchBuffSummaryMarkup } from '../../game/patchBuff';
import { requestSalvage } from './salvageModal';
import { equipmentPortraitPlan, renderEquipmentGlowLayers, renderEquipmentPortrait } from '../equipmentPortrait';
import { pouchCount } from '../../game/pouch';
import { openPouchWindow } from './pouchModal';
import { pouchIconMarkup } from '../pouchArt';
import { showEquippedDetail, dismissEquippedDetail, deferEquippedDismiss } from '../equippedDetail';
import { bagDetailPinned, createBagDetail, deferBagDismiss, dismissBagDetail, showBagDetail } from '../bagDetail';
import { bagStacks, orderedBagItems } from '../bagStacks';
import { plusBadgeMarkup } from '../plusBadge';
import { rarityBadgeMarkup } from '../rarityBadge';
import { itemNameText, renderItemName } from '../itemName';
import { slotAtlasStyle } from '../slotArtStyle';
import { downgradeArrowMarkup, upgradeArrowMarkup } from '../upgradeBadge';
import type { BagFilter, Interface } from '../interface';

export const equipmentInfoSlots = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'offhand', 'necklace', 'belt', 'ring1', 'ring2'] as const;
/** 장착 10칸의 **좌우 배치**(2026-11-22 사용자 확정 B안, `04-b.png`) — 왼쪽 5칸 / 오른쪽 5칸,
 *  가운데는 캐릭터 일러스트다. 왼쪽은 손에 드는 것부터(무기·투구·갑옷·장갑·신발), 오른쪽은
 *  반대편 소지품(문장·목걸이·벨트·반지1·반지2)이다. 배열 순서가 그대로 화면의 위→아래다. */
export const equipmentSlotColumns = [equipmentInfoSlots.slice(0, 5), equipmentInfoSlots.slice(5)] as const;

export function renderInventory(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save;
    const section = document.createElement('section'); section.className = 'modal-bag';
    const heading = document.createElement('div'); heading.className = 'bag-heading';
    const title = document.createElement('h3'); title.textContent = '가방';
    const sort = document.createElement('button'); sort.type = 'button'; sort.className = 'bag-rarity-sort'; sort.textContent = '등급순';
    sort.classList.toggle('active', this.bagRaritySort); sort.setAttribute('aria-pressed', String(this.bagRaritySort));
    sort.onclick = () => { this.bagRaritySort = !this.bagRaritySort; dismissBagDetail(this); this.renderModal(); };
    // `내 직업만 보기` (작업 205): 다른 직업 전용 무기·투구·갑옷만 감춘다. 공용 방어구·장신구는 그대로
    // 보이고, 켠 상태는 기기에 남긴다. [작업 228] 세로가 짧은 폰에서 가방 칸을 밀어내지 않도록
    // 제목·`등급순`과 **한 줄**에 둔다(예전에는 필터 아래 따로 한 줄을 썼다).
    const jobToggle = document.createElement('button'); jobToggle.type = 'button'; jobToggle.className = 'bag-job-only';
    jobToggle.textContent = jobOnlyLabel(this.bagJobOnly);
    jobToggle.classList.toggle('is-on', this.bagJobOnly);
    jobToggle.setAttribute('aria-pressed', String(this.bagJobOnly));
    jobToggle.setAttribute('aria-label', `내 직업만 보기 ${this.bagJobOnly ? '켜짐' : '꺼짐'}. 누르면 다른 직업 전용 무기·투구·갑옷을 ${this.bagJobOnly ? '다시 보여 줍니다' : '숨깁니다'}`);
    jobToggle.title = `${jobNames[jobOrDefault(save.job)]}가 쓸 수 없는 무기·투구·갑옷을 숨깁니다. 공용 장갑·신발·문장·장신구는 그대로 보입니다.`;
    jobToggle.onclick = () => {
      this.bagJobOnly = !this.bagJobOnly; saveJobOnly(BAG_JOB_ONLY_KEY, this.bagJobOnly);
      dismissBagDetail(this); this.renderModal();
    };
    // 파트 B(2026-11-22): 스킬북과 `합성` 버튼을 없앴다 — 가방 머리줄은 `제목 · 내 직업만 보기 · 등급순`이다.
    heading.append(title, jobToggle, sort); section.appendChild(heading);
    // 입문 안내(작업 미정): 안내 띠는 창 뒤로 가린다 — 방어구를 챙길 순서면 가방 머리글 밑에 같은 문장을 한 줄 둔다.
    // 판정은 안내 띠와 **같은** `tutorialGuide`를 쓴다(입문 구간을 지난 세이브에는 줄도 칸 강조도 없다).
    const guide = tutorialGuide(save);
    const pending = guide?.stage === 'gear' ? guide.slots ?? [] : [];
    if (pending.length) {
      const note = document.createElement('small'); note.className = 'tutorial-note';
      note.textContent = `가방에서 ${objectParticle(pending.map(slot => slotNameFor(slot, jobOrDefault(save.job))).join('·'))} 골라 [장착]을 누르세요.`;
      section.appendChild(note);
    }
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
    // 보물 주머니(작업 207)와 영구 스탯북(파트 B)은 장비가 아니라 분류 필터와 상관없이 늘 보인다 — 보상으로
    // 받은 주머니·책을 어디서 찾아야 하는지 헤매지 않게 한다.
    const myJob = jobOrDefault(save.job);
    const candidates = save.bag.filter(item => isPouch(item) || isStatBook(item)
      || this.bagFilter === 'all'
      || (this.bagFilter === 'weapon' && (item.slot === 'weapon' || item.slot === 'offhand'))
      || (this.bagFilter === 'armor' && ['helmet', 'armor', 'gloves', 'belt', 'boots'].includes(item.slot))
      || (this.bagFilter === 'accessory' && ['necklace', 'ring1', 'ring2'].includes(item.slot)));
    const shown = jobOnlyVisible(candidates, item => item, save.job, this.bagJobOnly);
    const hiddenJob = candidates.length - shown.length;
    // 칸 순서(작업 247, 사용자 확정): **보물 주머니(첫 칸) → 장비 → 책**. 등급순을 켜고 꺼도 이 3단은
    // 그대로고, 등급순은 같은 단 안에서만 적용된다(`bagStacks.compareBagItems` 한 곳).
    const ordered = orderedBagItems(shown, this.bagRaritySort, myJob);
    // 같은 주머니는 한 칸에 `×N`, **같은 스탯북도 한 칸에 `×N`**으로 모아 보여 준다(작업 246 — 예전에는
    // 책을 `count: 1`로 하나씩 그려 세 권이 있어도 `×1` 세 칸이었다). 칸의 `data-item-id`는 그 묶음의
    // 첫 아이템 id이고, 사용·판매·창고 이동은 지금처럼 개별 id로 처리된다.
    const stacks = bagStacks(ordered);
    const visible = stacks.map(stack => stack.item);
    for (const { item, count: quantity } of stacks) {
      const book = isStatBook(item), pouch = isPouch(item), name = itemNameText(item);
      // 업그레이드 화살표(작업 241): 내 직업이 낄 수 있는 장비 중 지금 낀 것보다 좋은 것만.
      // 스탯북·보물 주머니는 `upgradeArrowMarkup`이 판정에서 걸러 빈 문자열을 돌려준다.
      const upgrade = upgradeArrowMarkup(save, item);
      // 다운그레이드 화살표(빨간 아래) — 같은 직업 장비가 지금 낀 것보다 **약할 때**만. 업그레이드와 같은
      // 우측 상단을 쓰지만 두 판정이 서로 배타적이라 한 칸에 함께 붙지 않는다(사용자 요청).
      const downgrade = downgradeArrowMarkup(save, item);
      // `+N` 강화 배지(작업 246): 업그레이드 화살표가 우상단, 타직업 배지가 좌상단, 수량이 우하단이라
      // 비어 있는 **왼쪽 아래**에 붙인다 — 장비창 장착 칸·공용창고와 같은 자리(plusBadge.ts).
      const plus = plusBadgeMarkup(item);
      // 등급 배지(`L`·`U`·`E`, 전설·유니크·에픽 장비만) — 칸의 **왼쪽 위**. 이 자리를 쓰던 타직업
      // 배지는 좁은 칸에서 오른쪽 아래로 비킨다(`styles/modals/equip.css`).
      const rarity = rarityBadgeMarkup(item);
      const cell = document.createElement('button'); cell.className = `bag-item ${book ? 'skillbook-item' : pouch ? 'pouch-item' : item.rarity} ${this.selected === item.id ? 'selected' : ''}`;
      if (upgrade) cell.classList.add('has-upgrade');
      if (!book && !pouch && pending.some(slot => slot === item.slot)) cell.classList.add('tutorial-target');
      if (downgrade) cell.classList.add('has-downgrade');
      cell.innerHTML = itemIcon.call(this, item.slot, item, 'item-icon') + upgrade + downgrade + plus + rarity;
      cell.type = 'button'; cell.dataset.itemId = item.id;
      // 새로 들어온 아이템 강조(백로그 3번) — 가방을 열 때 `newItems`를 `bagFresh`로 옮겨 두고(modalRegistry),
      // 이번에 연 가방에서만 `NEW` 핀을 보여 준다. 다음에 열면 그새 들어온 것만 다시 선다.
      if (this.bagFresh?.has(item.id)) {
        cell.classList.add('is-new');
        const fresh = document.createElement('i'); fresh.className = 'bag-new-badge'; fresh.textContent = 'NEW';
        fresh.setAttribute('aria-hidden', 'true'); cell.append(fresh);
      }
      // 직업 전용 장비에는 `전사`/`궁수`/`마법사` 배지를 단다(작업 205) — 공용 방어구·장신구에는 붙지 않는다.
      // 좁은 가방 칸(30~40px)에서는 등급 배지가 왼쪽 위를 쓰므로 **한 글자**(`전`·`궁`·`법`)로 오른쪽 아래에 붙는다.
      const owner = itemJob(item);
      if (owner) {
        const jobBadge = document.createElement('span'); jobBadge.className = `job-badge job-${owner}`; jobBadge.textContent = jobShortNames[owner];
        jobBadge.title = `${jobNames[owner]} 전용`; jobBadge.setAttribute('aria-hidden', 'true'); cell.append(jobBadge);
      }
      if (book || pouch) {
        const badge = document.createElement('span'); badge.className = 'skillbook-count'; badge.textContent = `×${quantity}`;
        cell.append(badge);
      }
      const locked = isEquipment(item) && !!item.locked;
      cell.setAttribute('aria-label', `${name}${book ? ` · ${quantity}권` : pouch ? ` · ${quantity}개` : ` · ${rarityNames[item.rarity]}`}${owner ? ` · ${jobNames[owner]} 전용` : ''}${locked ? ' · 잠긴 장비' : ''}${upgrade ? ' · 지금 장착한 장비보다 좋음' : ''}${downgrade ? ' · 지금 장착한 장비보다 약함' : ''}`);
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
    // 가방 40칸은 장비 1개=1칸, 보물 주머니는 수량 무관 1칸, 영구 스탯북은 종류당 1칸(주머니 스택형).
    const bagUsed = equipmentCount(save.bag, save.job);
    const count = document.createElement('span'); count.textContent = `가방 ${bagUsed}/40`;
    count.title = bagUsed > 40
      ? `가방 ${bagUsed}/40 · 40칸을 넘었습니다. 장비를 분해하거나 공용창고에 보관해 정리해 주세요. 새 아이템·우편은 받아지지 않습니다`
      : `가방 ${bagUsed}/40 · 장비는 1개=1칸, 보물 주머니는 수량 무관 1칸, 영구 스탯북은 종류당 1칸`;
    if (bagUsed > 40) count.classList.add('is-over');
    // 가방 가득 참(작업 246, 사용자 요청 `#20938`) — 40칸이 차면 칸수 옆에 빨간 `가득 참`을 붙인다.
    if (bagUsed >= EQUIPMENT_BAG_LIMIT) {
      const flag = document.createElement('b'); flag.className = 'bag-full-flag'; flag.textContent = ' 가득 참';
      count.append(flag);
    }
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
    // 자동 분해 (작업 196, 작업 254에서 방치에도 적용): the switch sits beside the threshold it uses, and the
    // hint under it says it now works while hunting and while away.
    const auto = document.createElement('button'); auto.className = 'salvage auto-salvage'; auto.type = 'button';
    const showAuto = () => {
      auto.textContent = `자동 분해 ${this.autoSalvage ? '켬' : '끔'}`;
      auto.classList.toggle('is-on', this.autoSalvage);
      auto.setAttribute('aria-pressed', String(this.autoSalvage));
      auto.setAttribute('aria-label', `자동 분해 ${this.autoSalvage ? '켜짐' : '꺼짐'}. 접속·방치 사냥 모두 적용. 누르면 ${this.autoSalvage ? '끕니다' : '켭니다'}`);
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
    controls.append(equip, rarityButton, auto, ...(plusSelect ? [plusSelect] : []), salvage, autoHint, ...(plusSelect ? [plusHint] : []), jobHint); footer.append(count, controls); section.appendChild(footer);
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
    const panel = document.createElement('div'); panel.className = `item-detail ${isStatBook(item) ? 'skillbook-detail' : isPouch(item) ? 'pouch-detail' : item.rarity}`;
    // 보물 주머니(작업 207): 상세에서 바로 [열기] — 큰 개봉 창이 열린다.
    if (isPouch(item)) return pouchDetail.call(this, save, item);
    // 영구 스탯북(파트 B) — 여기서 바로 사용하고, 몇 권 썼는지(0~30)를 함께 보여 준다.
    if (isStatBook(item)) {
      const spec = isStatBookKind(item.book) ? STAT_BOOKS[item.book] : undefined;
      const title = document.createElement('h2'); title.textContent = item.name; panel.appendChild(title);
      const grade = document.createElement('small'); grade.className = 'item-detail-grade rarity-unique'; grade.textContent = '소모품 · 영구 스탯북'; panel.appendChild(grade);
      const note = document.createElement('p'); note.className = 'pouch-detail-note';
      note.textContent = spec ? `${spec.description}. 장비처럼 벗을 수 없는 영구 보너스입니다.` : '사용하면 캐릭터 능력치가 영구히 오릅니다.'; panel.appendChild(note);
      const status = document.createElement('span'); status.className = 'pouch-detail-count';
      status.textContent = spec ? statBookStatusText(save, item.book) : ''; panel.appendChild(status);
      const remaining = spec ? spec.max - statBookCounts(save)[item.book] : 0;
      const use = document.createElement('button'); use.type = 'button'; use.className = 'skillbook-use';
      use.textContent = remaining > 0 ? '사용하기' : '최대 사용';
      use.disabled = remaining < 1;
      use.title = remaining > 0 ? `사용하면 영구 ${spec ? statBookLabel(item.book) : ''} +${spec?.perBook ?? 0}` : '이미 최대 권수를 사용했습니다';
      use.onclick = () => {
        const before = totalStats(save).health;
        const result = useStatBook(save, item.id);
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
    // 직업 전용 장비(무기·투구·갑옷)에는 어느 직업의 것인지 배지를 달고, 내 직업이 아니면 장착할 수 없다고 한 줄로 적는다
    // (작업 205 → 249: 투구·갑옷도 직업별로 나뉘었다).
    const ownerJob = itemJob(item);
    if (ownerJob) {
      const jobLine = document.createElement('span'); jobLine.className = `item-detail-job job-${ownerJob}`;
      const mine = ownerJob === jobOrDefault(save.job);
      const gearWord = item.slot === 'weapon' ? '무기' : '장비';
      jobLine.textContent = mine ? `${jobNames[ownerJob]} 전용 ${gearWord} · 내 직업` : `장착 불가 (${jobNames[ownerJob]} 전용 ${gearWord})`;
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
    // 다른 직업의 장비는 입을 수 없다(작업 204·249): 버튼을 잠그고 어느 직업의 장비인지 알린다.
    // 투구·갑옷은 `weaponJob`이 늘 'warrior'를 돌려주므로 반드시 `itemJob`으로 주인을 읽는다.
    const wieldable = canWield(item, jobOrDefault(save.job));
    const ownerName = jobNames[itemJob(item) ?? weaponJob(item)];
    const gearWord = item.slot === 'weapon' ? '무기' : '장비';
    const equip = document.createElement('button'); equip.textContent = wieldable ? '장착' : `${ownerName} 전용`;
    equip.disabled = !wieldable;
    if (!wieldable) { equip.title = `${ownerName}만 쓸 수 있는 ${gearWord}입니다. 경매장에 팔거나 분해하세요.`; equip.setAttribute('aria-label', `${itemNameText(item)} · ${ownerName} 전용 ${gearWord}, 장착할 수 없음`); }
    equip.onclick = () => {
      if (!wieldable) { this.message(`${ownerName}만 쓸 수 있는 ${gearWord}입니다.`); return; }
      const index = save.bag.findIndex(i => i.id === item.id); if (index < 0) return;
      save.bag.splice(index, 1); if (equipped) save.bag.push(equipped); save.equipment[item.slot] = item;
      emitDomainEvent('equipmentChanged', { save, slot: item.slot, item, previous: equipped, source: 'equip' });
      if (advanceTutorialOnEquip(save)) this.message(`${itemNameText(item)} 장착! 이제 방어구와 첫 스킬을 챙겨 보세요.`);
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
  note.textContent = '열면 금화 · 장비 · 영구 스탯북 중 하나가 나옵니다. 확률표는 개봉 창 왼쪽 위 [확률표]에서 볼 수 있습니다.'; panel.append(note);
  const count = document.createElement('span'); count.className = 'pouch-detail-count'; count.textContent = `보유 ${pouchCount(save)}개`; panel.append(count);
  const buttons = document.createElement('div'); buttons.className = 'detail-actions';
  const open = document.createElement('button'); open.type = 'button'; open.className = 'pouch-open';
  open.textContent = '열기'; open.setAttribute('aria-label', `${pouch.name} 열기`);
  open.onclick = () => { openPouchWindow(this, pouch.id); };
  buttons.append(open); panel.append(buttons);
  return panel;
}

export function salvage(this: Interface): void {
    const save = this.world.save;
    const ids = save.bag.filter(item => isEquipment(item) && !item.locked && rarityRanks[item.rarity] <= rarityRanks[this.salvageRarity]).map(item => item.id);
    requestSalvage.call(this, ids);
  }

/**
 * `내 정보`(장비창) — 2026-11-23 사용자·송덕진 님 양측 최종 승인 **1안**
 * (`downloads/djrpg_equip_topline/after-390.png`).
 *
 * 창 맨 위의 **요약 한 줄**(`LV · 층 · EXP · 금화` + `⚔ 전투력` 알약)을 **없앴다**. 그 값들은
 * 메인 HUD가 이미 보여 주고 있어(LV 배지·층 버튼·금화·다이아·EXP 바·`⚔ 전투력` 알약) 이 창에서는 중복이었다.
 * 머리글 바로 아래에서 **가운데 캐릭터 + 좌우 장착 5칸씩 대칭**(`equipmentSlotColumns`)이 시작하고, 없앤
 * 26px은 장착 쇼케이스(+16px)와 가방(+10px)이 나눠 가진다(`equip.css`).
 *
 * 상세 능력치는 이 창의 일이 아니다 — 메인 HUD의 `LV` 배지를 누르면 열리는 `상세 스탯`(`statsModal.ts`)이
 * 전담한다(`hud.ts`의 `levelBadge.addEventListener('click', () => this.open('stats'))`).
 */
export function renderEquipment(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save;
    // 입문 안내가 가리키는 빈 칸(투구·갑옷) — 칸 자체를 은은하게 강조한다.
    const pending = tutorialGuide(save)?.slots ?? [];
    // ── 가운데 캐릭터 + 좌우 5칸씩 ──────────────────────────────────────────
    const showcase = document.createElement('div'); showcase.className = 'equipment-showcase';
    showcase.setAttribute('aria-label', '장착 장비 10칸');
    const addSlot = (slot: Slot, column: HTMLElement) => {
      const item = save.equipment[slot]; const cell = document.createElement('button'); cell.className = `equipment-slot ${item?.rarity ?? 'empty-slot'}`;
      cell.type = 'button'; cell.dataset.equippedSlot = slot; cell.disabled = !item;
      const slotLabel = slotNameFor(slot, jobOrDefault(save.job));
      // 착용 중 장비에도 강화 단계를 **왼쪽 아래**에 붙인다(작업 246) — 예전에는 장착 칸에만 `+N`이 빠져
      // 가방·공용창고와 보이는 자리가 달랐다. 배지는 CSS가 `이름 줄 위`로 살짝 올려(13px) 아이콘 왼쪽 아래에
      // 두고, 부위 이름은 아이콘과 같은 중심에 선다(예전에는 이름만 6.5px 오른쪽으로 밀려 있었다).
      // 등급 배지(`L`·`U`·`E`)는 칸의 **왼쪽 위**에 얹는다.
      cell.innerHTML = `${itemIcon.call(this, slot, item, 'slot-icon')}<small class="slot-part">${slotLabel}</small>${item ? plusBadgeMarkup(item) : ''}${rarityBadgeMarkup(item)}`;
      cell.setAttribute('aria-label', `${slotLabel} · ${item ? itemNameText(item) : '빈 슬롯'}`);
      cell.title = item ? itemNameText(item) : '빈 슬롯';
      cell.setAttribute('aria-expanded', String(this.equippedSlot === slot));
      if (pending.some(pendingSlot => pendingSlot === slot)) cell.classList.add('tutorial-target');
      cell.onpointerenter = event => { if (event.pointerType !== 'touch') showEquippedDetail(this, slot); };
      cell.onpointerleave = () => { if (cell.isConnected) deferEquippedDismiss(this); };
      cell.onfocus = () => showEquippedDetail(this, slot);
      cell.onblur = () => { if (cell.isConnected) deferEquippedDismiss(this); };
      cell.onclick = () => {
        if (this.equippedSlot === slot && this.equippedPinned) dismissEquippedDetail(this);
        else showEquippedDetail(this, slot, true);
      };
      column.appendChild(cell);
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
    // 좌 5칸(무기·투구·갑옷·장갑·신발) · 가운데 캐릭터 · 우 5칸(문장·목걸이·벨트·반지1·반지2).
    const columns = equipmentSlotColumns.map((slots, index) => {
      const column = document.createElement('div');
      column.className = `equipment-slot-col ${index === 0 ? 'is-left' : 'is-right'}`;
      column.setAttribute('aria-label', index === 0 ? '장착 장비 왼쪽 5칸' : '장착 장비 오른쪽 5칸');
      for (const slot of slots) addSlot(slot, column);
      return column;
    });
    showcase.append(columns[0], center, columns[1]);
    dialog.append(showcase);
    // 시안에는 없는 줄이지만, 예전 창에 있던 두 안내를 잃지 않게 캐릭터 아래에 **얇게** 모은다
    // (스탯 표를 없앴으니 버프 줄은 "위 숫자에 들어 있다"는 말을 뺄 수 없다 — 그래서 HUD 알약과
    //  같은 문구만 남긴다). 추가옵션 줄은 상한이 걸린 실제 전투 값이라 다른 곳에 없다.
    const notes = document.createElement('div'); notes.className = 'equipment-notes';
    const buffLine = patchBuffSummaryMarkup();
    if (buffLine) notes.insertAdjacentHTML('beforeend', buffLine);
    // 추가옵션(작업 238) 합계 — 상한이 걸린 실제 전투 값(회피 30%·회복 12%/5초·피흡 15%).
    const extraSummary = extraOptionSummary(save.equipment);
    if (extraSummary) {
      const extraLine = document.createElement('div'); extraLine.className = 'equipment-info-extras';
      extraLine.textContent = `✨ ${extraSummary}`;
      notes.appendChild(extraLine);
    }
    if (notes.childElementCount) dialog.appendChild(notes);
  }

export function salvageValue(this: Interface, item: Item): number { return salvageGold[item.rarity]; }

function itemIcon(this: Interface, slot: Slot | 'statbook' | 'pouch', item: Item | undefined, className: string): string {
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

export function iconPath(this: Interface, slot: Slot | 'statbook' | 'pouch', item?: Item): string {
  // 영구 스탯북은 전용 아이콘 시안이 나오기 전까지 기존 책 그림을 쓴다(필드·창고·거래소와 같은 그림).
  if (slot === 'statbook') return '/assets/icons/icon_skillbook.png';
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
