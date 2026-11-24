import { tutorialGuide } from '../game/tutorial';
import { EQUIPMENT_BAG_LIMIT, equipmentCount } from '../game/bagCapacity';
import { spLedger } from '../game/skillPoints';
import { applySkillArtwork } from './skillArtwork';
import { SkillFeedback } from './skillFeedback';
import { diamondMarkup, goldMarkup } from './currency';
import { expToNext, floorKillTarget, MAX_LEVEL, totalStats } from '../game/store';
import { combatPower } from '../game/power';
import { availableSkills } from '../game/loadout';
import { cooldowns, type Action } from '../game/world';
import { skills, type Job, type SkillId } from '../game/skills';
import { jobNames, jobOrDefault } from '../game/skills';
import { PATCH_BUFF_PILL_TEXT, isPatchBuffActive, patchBuffRemainingText, patchBuffTitle, patchBuffPillMarkup } from '../game/patchBuff';
import type { Interface } from './interface';

const shortNames: Record<SkillId, string> = {
  slash2: '이단참', spin: '용오름', crushing: '크러싱', slam: '스탬프', warcry: '레이지', power: '파워', destroy: '충격파', hell: '회전참격',
  doubleShot: '더블샷', multiShot: '멀티샷', pierceShot: '관통', iceArrow: '빙결', hawkEye: '호크아이', snipe: '저격', stormVolley: '연사', arrowRain: '화살비',
  fireBolt: '파이어', iceBolt: '아이스', chainLightning: '체인', manaBurst: '마력폭발', frostNova: '서리노바', arcaneShield: '아케인', meteorStrike: '메테오', arcaneOverlord: '워터캐논'
};
/** 평타 이름 — 직업마다 다른 무기를 쓴다. */
export function basicAttackName(job: Job): string { return job === 'archer' ? '활 사격' : job === 'mage' ? '마법탄' : '대검 베기'; }

export function renderStatus(this: Interface): void {
    const { save, player } = this.world;
    renderPatchBuff.call(this);
    const progress = save.level >= MAX_LEVEL ? 100 : Math.min(100, Math.max(0, save.exp / expToNext(save.level) * 100));
    // 최고 도달 층에서 패배한 뒤 `⚔ 보스 도전`이 살아난다(작업 210).
    // 작업 212(`#4995`): 버튼을 **현재 층 배지 바로 옆**에 붙인다(`.status-floor`).
    // 작업 245: 몹이 쌓여 아래층으로 강등돼도 버튼은 남고, 누르면 최고층으로 올라가 보스와 붙는다.
    // 휴대폰 배율 맞춤(작업 4번 개선안) — 460px 미만에서는 `⚔` 아이콘만 남기고 글자는 CSS가 감춘다(`.ctx-label`).
    // 아이콘만 남아도 뜻은 `aria-label`·`title`이 지킨다(누르기 전에 손가락을 올려도 읽힌다).
    const bossRetry = this.world.bossRetryReady ? `<button class="boss-retry" type="button" aria-label="최고층 ${save.maxFloor}층 보스에게 다시 도전" title="최고층 ${save.maxFloor}층 보스에게 다시 도전"><span aria-hidden="true">⚔</span><span class="ctx-label">보스 도전</span></button>` : '';
    // 작업 224(`#6215`): 최고 도달 층에서 **2층 이상 내려왔을 때만** `▲ 최고층`을 붙인다.
    // 한 층 아래는 층 선택 창으로 충분하고, 배지 옆이 좁아지는 것을 막는다.
    const floorReturn = save.maxFloor - save.floor >= 2 ? `<button class="floor-return" type="button" aria-label="최고층 ${save.maxFloor}층으로 이동" title="최고층 ${save.maxFloor}층으로 바로 이동"><span aria-hidden="true">▲</span><span class="ctx-label">최고층</span></button>` : '';
    // 전투력(사용자 요청: `전사 | 닉네임` 밑에 전투력 표기) — 이름판 바로 아래 반투명 필에 `⚔ 전투력 68`.
    // 식은 내 정보 창·상세 스탯과 같은 `combatPower` 하나만 쓴다(`game/power.ts`).
    const power = combatPower(totalStats(save));
    const powerText = power.toLocaleString('ko-KR');
    this.top.innerHTML = `<button class="level-badge" type="button" aria-label="상세 스탯 열기"><span>LV</span><b>${save.level >= MAX_LEVEL ? 'MAX' : save.level}</b></button><span class="hero-name" aria-label="캐릭터 닉네임"></span><span class="hero-power" aria-label="전투력 ${power}"><i aria-hidden="true">⚔</i><span>전투력</span><b>${powerText}</b></span><div class="health-bar hp" role="progressbar" aria-label="체력"><i></i><b></b></div><div class="status-main"><span class="status-floor"><button class="floor-button" type="button" aria-label="층 선택, 현재 ${save.floor}층"><span>층 <b>${save.floor}</b><span class="kills"> · ${Math.min(save.floorKills, floorKillTarget(save.floor))}/${floorKillTarget(save.floor)}</span></span><span aria-hidden="true">▾</span></button>${bossRetry}${floorReturn}</span><span class="gold">${goldMarkup(save.gold)}</span><span class="diamonds" aria-label="다이아 ${this.shopCatalog?.wallet.diamonds ?? 0}개">${diamondMarkup(this.shopCatalog?.wallet.diamonds ?? 0)}</span></div><div class="exp"><i style="width:${progress}%"></i></div>`;
    const levelBadge = this.get('.level-badge'); levelBadge.style.setProperty('--progress', `${progress}%`);
    // LV 배지 → `상세 스탯`(사용자 요청 2026-11-21 "LV 누르면 내 전체 상세 스탯 보여주기").
    // 캐릭터 전환은 오른쪽 아이콘 레일의 `캐릭터` 버튼이 맡는다.
    levelBadge.addEventListener('click', () => this.open('stats'));
    // 레벨 배지 아래 캐릭터 닉네임(작업 228, 사용자 요청 `#19089` "레벨믿에 닉네임은 떠야할거같아").
    // 이름은 HTML로 넣지 않고 textContent로만 써서, 예전 세이브의 특수문자가 태그로 해석되지 않게 한다.
    const heroName = this.get('.hero-name');
    const nameText = typeof save.name === 'string' && save.name.trim() ? save.name.trim() : '모험가';
    heroName.textContent = nameText; heroName.title = nameText;
    // 이름판(작업 265, 옵션 2 `다크 이름판`) — `전사 │ 모험가` 한 줄. 직업 태그는 CSS `::before`가
    // `data-job`을 그대로 그리므로 문구를 HTML로 넣지 않는다(직업을 바꾸면 다음 렌더에서 바로 바뀐다).
    const jobLabel = jobNames[jobOrDefault(save.job)];
    heroName.dataset.job = jobLabel;
    heroName.setAttribute('aria-label', `캐릭터 닉네임 · ${jobLabel} ${nameText}`);
    this.get('.floor-button').addEventListener('click', () => this.open('floor'));
    this.top.querySelector<HTMLButtonElement>('.boss-retry')?.addEventListener('click', () => this.world.challengeBoss());
    this.top.querySelector<HTMLButtonElement>('.floor-return')?.addEventListener('click', () => { const result = this.world.travelToFloor(this.world.save.maxFloor); if (result.message) this.message(result.message); });
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.hp b').textContent = `HP ${Math.ceil(player.hp)}/${totalStats(save).health}`;
    this.get('.hp').setAttribute('aria-valuenow', String(Math.ceil(player.hp)));
    this.get('.hp').setAttribute('aria-valuemax', String(totalStats(save).health));
    // 입문 안내(문구·강조)는 `tutorial.ts` 한 곳이 정한다 — 무기까지는 세이브 단계, 그 뒤로는 지금 상태.
    const guide = tutorialGuide(save);
    this.banner.textContent = guide?.message ?? ''; this.banner.hidden = !guide;
    for (const target of ['equipment', 'skills'] as const) {
      (this.root as HTMLElement | undefined)?.querySelector<HTMLElement>(`.bottom-nav [data-modal="${target}"]`)?.classList.toggle('tutorial-target', guide?.nav === target);
    }
    // 첫 스킬은 필드의 빈 원(`+`)을 눌러 장착한다 — 그 원만 은은하게 숨쉬게 한다.
    (this.slotButtons ?? []).forEach((button, index) => button.classList.toggle('tutorial-target', guide?.stage === 'skill' && guide.skillSlot === index));
  }

export function tick(this: Interface): void {
    const available = availableSkills(this.world.save);
    const feedback = this.skillFeedback ??= new SkillFeedback();
    const casts = feedback.collect(this.world.effects);
    for (let index = 0; index < 4; index++) {
      const kind: Action | null = index === 0 ? 'attack' : this.world.save.quickSlots[index - 1];
      const button = index === 0 ? this.attackButton : this.slotButtons[index - 1];
      const empty = kind === null, canAdd = empty && available.length > 0;
      const selecting = index > 0 && !!this.pendingSkill;
      const name = empty ? canAdd ? '스킬 장착하기' : '미습득' : kind === 'attack' ? basicAttackName(jobOrDefault(this.world.save.job)) : skills[kind].name;
      // [작업 250] 직업을 키에 넣는다 — 빼두면 궁수·마법사에서 전사로 캐릭터를 바꿔도 상태가 같아
      // 아이콘·이름을 다시 그리지 않아 이전 직업의 활 아이콘과 평타 이름이 그대로 남는다(`#21260`).
      const job = jobOrDefault(this.world.save.job);
      const key = `${job}:${kind}:${canAdd}:${selecting}`;
      if (button.dataset.state !== key) {
        feedback.clear(button); applySkillArtwork(button, kind, job);
        button.dataset.state = key; button.dataset.skill = kind ?? '';
        // 기본 공격은 직업별 원형 아이콘(대검·활·마법탄)이 `.skill-art`로 덮으므로 글자 그림판은 비워 둔다(작업 216).
        button.querySelector('strong')!.textContent = empty ? canAdd || selecting ? '+' : '—' : kind === 'attack' ? '' : skills[kind].icon;
        button.querySelector('small')!.textContent = selecting ? '선택' : empty ? canAdd ? '장착' : '미습득' : kind === 'attack' ? basicAttackName(jobOrDefault(this.world.save.job)) : shortNames[kind];
        button.setAttribute('aria-label', selecting ? `${index}번 원에 스킬 장착` : name);
        button.classList.toggle('skill-empty', empty); button.classList.toggle('skill-can-add', canAdd);
        button.classList.toggle('slot-selecting', selecting); button.disabled = empty && !canAdd && !selecting;
        const alert = button.querySelector<HTMLElement>('.skill-alert-dot'); if (alert) alert.hidden = !canAdd;
      }
      if (kind && !selecting && casts.has(kind)) feedback.pulse(button, kind === 'attack');
      const cd = kind ? this.world.cooldown[kind] : 0;
      button.classList.toggle('cooling', cd > 0 && !selecting); button.querySelector('em')!.textContent = cd > 0 && !selecting ? cd.toFixed(1) : '';
      button.title = selecting ? '이 원에 장착' : kind ? `${name} · 쿨타임 ${cooldowns[kind]}초` : name;
    }
    const alert = this.root.querySelector<HTMLElement>('.skill-nav-dot');
    // 스킬 점: 넣을 스킬이 있는 빈 원 · 쓸 수 있는 스킬북 · **아직 쓰지 않은 SP**(4단계 스킬 트리).
    if (alert) alert.hidden = !((available.length && this.world.save.quickSlots.some(slot => slot === null))
      || spLedger(this.world.save).available > 0);
    const { player, save } = this.world;
    renderPatchBuff.call(this);
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.hp b').textContent = `HP ${Math.ceil(player.hp)}/${totalStats(save).health}`;
    this.get('.hp').setAttribute('aria-valuenow', String(Math.ceil(player.hp)));
    this.get('.hp').setAttribute('aria-valuemax', String(totalStats(save).health));
  }

/**
 * 밸런스·UI 개편 기념 종일 버프 알약(2026-11-22) — 켜져 있는 동안만 오른쪽 위에 작게 뜬다.
 *
 * 누르는 일이 없어 `pointer-events: none`이고, 왼쪽 위 레벨 배지·닉네임·HP바(왼쪽 12px, 56~92px)와
 * 왼쪽 97px부터 서는 월드보스 아이콘을 비켜 **오른쪽**에 앉힌다. 남은 시간은 `title`과 알약 안
 * 글자에 함께 있고, 30초에 한 번만 다시 쓴다(매 프레임 DOM을 건드리지 않게). 기간이 지나면 요소를 지우므로
 * `renderStatus`가 다시 돌지 않아도 스스로 사라진다.
 */
export function renderPatchBuff(this: Interface, now = Date.now()): void {
    const battle = this.root?.querySelector?.<HTMLElement>('.battle');
    // 테스트는 `renderStatus`만 돌리려고 최소 스텁 DOM을 넘긴다 — 그럴 때는 조용히 지나간다.
    if (!battle || typeof battle.insertAdjacentHTML !== 'function' || typeof battle.querySelector !== 'function') return;
    const pill = battle.querySelector<HTMLElement>('.patch-buff-pill');
    if (!isPatchBuffActive(now)) { pill?.remove(); return; }
    if (!pill) { battle.insertAdjacentHTML('beforeend', patchBuffPillMarkup(now)); return; }
    // 알약을 그린 직후에는 아직 남은 시간이 맞다 — 시각이 바뀐 뒤에만 다시 쓴다.
    if (now - Number(pill.dataset.at ?? 0) < 30_000) return;
    const title = patchBuffTitle(now), remaining = patchBuffRemainingText(now);
    pill.dataset.at = String(now); pill.title = title; pill.setAttribute('aria-label', `${PATCH_BUFF_PILL_TEXT} · ${remaining} 남음`);
    const time = pill.querySelector<HTMLElement>('.patch-buff-time'); if (time) time.textContent = remaining;
}

export function renderBagBadge(this: Interface): void {
    const count = this.world.save.bag.filter(item => this.newItems.has(item.id)).length;
    const badge = this.get('.new-badge'); badge.textContent = `${count}`; badge.hidden = count === 0;
    // 가방 가득 참 표시(작업 246, 사용자 요청 `#20938` "가방 꽉차면 가방 풀 표시 해주고").
    // 40칸(장비 + 다른 직업 전용 스킬북)이 차면 하단 내 정보 버튼에 `FULL` 배지를 붙인다 —
    // 이 상태에서는 새 장비를 줍지 못하므로, 가방을 열지 않아도 화면에서 바로 알 수 있어야 한다.
    const used = equipmentCount(this.world.save.bag, this.world.save.job);
    const full = used >= EQUIPMENT_BAG_LIMIT;
    const root = this.root as HTMLElement | undefined;
    const fullBadge = root?.querySelector<HTMLElement>('.bag-full-badge');
    if (fullBadge) { fullBadge.hidden = !full; fullBadge.textContent = full ? 'FULL' : ''; }
    const nav = root?.querySelector<HTMLElement>('.bottom-nav [data-modal="equipment"]');
    if (nav) {
      nav.classList.toggle('is-bag-full', full);
      nav.setAttribute('aria-label', full ? `내 정보 · 가방 가득 참 (${used}/${EQUIPMENT_BAG_LIMIT})` : '내 정보');
      nav.title = full ? `가방이 가득 찼습니다 (${used}/${EQUIPMENT_BAG_LIMIT}) · 분해·판매로 자리를 비워 주세요` : '내 정보';
    }
  }
