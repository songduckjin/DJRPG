import { isSkillBook, starterWeaponName } from '../game/items';
import { hasSkillUpgrade } from '../game/skillProgress';
import { applySkillArtwork } from './skillArtwork';
import { SkillFeedback } from './skillFeedback';
import { goldMarkup } from './currency';
import { expToNext, floorKillTarget, MAX_LEVEL, totalStats } from '../game/store';
import { availableSkills } from '../game/loadout';
import { cooldowns, type Action } from '../game/world';
import { skills, type Job, type SkillId } from '../game/skills';
import { jobOrDefault } from '../game/skills';
import type { Interface } from './interface';

const shortNames: Record<SkillId, string> = {
  slash2: '이단참', spin: '용오름', crushing: '크러싱', slam: '스탬프', warcry: '레이지', power: '파워', destroy: '충격파', hell: '회전참격',
  doubleShot: '더블샷', multiShot: '멀티샷', pierceShot: '관통', iceArrow: '빙결', hawkEye: '호크아이', snipe: '저격', stormVolley: '연사', arrowRain: '화살비',
  fireBolt: '파이어', iceBolt: '아이스', chainLightning: '체인', manaBurst: '마력폭발', frostNova: '서리노바', arcaneShield: '아케인', meteorStrike: '메테오', arcaneOverlord: '오버로드'
};
/** 평타 이름 — 직업마다 다른 무기를 쓴다. */
export function basicAttackName(job: Job): string { return job === 'archer' ? '활 사격' : job === 'mage' ? '마법탄' : '대검 베기'; }

export function renderStatus(this: Interface): void {
    const { save, player } = this.world;
    const progress = save.level >= MAX_LEVEL ? 100 : Math.min(100, Math.max(0, save.exp / expToNext(save.level) * 100));
    // 최고 도달 층에서 패배해 자동 등반이 꺼지면 `⚔ 보스 도전`이 살아난다(작업 210).
    // 작업 212(`#4995`): 버튼을 **현재 층 배지 바로 옆**에 붙인다(`.status-floor`).
    const bossRetry = this.world.bossRetryReady ? '<button class="boss-retry" type="button" aria-label="현재 층 보스에게 다시 도전">⚔ 보스 도전</button>' : '';
    // 작업 224(`#6215`): 최고 도달 층에서 **2층 이상 내려왔을 때만** `▲ 최고층`을 붙인다.
    // 한 층 아래는 층 선택 창으로 충분하고, 배지 옆이 좁아지는 것을 막는다.
    const floorReturn = save.maxFloor - save.floor >= 2 ? `<button class="floor-return" type="button" aria-label="최고층 ${save.maxFloor}층으로 이동" title="최고층 ${save.maxFloor}층으로 바로 이동">▲ 최고층</button>` : '';
    this.top.innerHTML = `<button class="level-badge" type="button" aria-label="캐릭터 선택 열기"><span>LV</span><b>${save.level >= MAX_LEVEL ? 'MAX' : save.level}</b></button><span class="hero-name" aria-label="캐릭터 닉네임"></span><div class="health-bar hp" role="progressbar" aria-label="체력"><i></i><b></b></div><div class="status-main"><span class="status-floor"><button class="floor-button" type="button" aria-label="층 선택, 현재 ${save.floor}층"><span>층 <b>${save.floor}</b> · ${Math.min(save.floorKills, floorKillTarget(save.floor))}/${floorKillTarget(save.floor)}</span><span aria-hidden="true">▾</span></button>${bossRetry}${floorReturn}</span><span class="gold">${goldMarkup(save.gold)}</span><span class="diamonds" aria-label="다이아 ${this.shopCatalog?.wallet.diamonds ?? 0}개">◆ ${(this.shopCatalog?.wallet.diamonds ?? 0).toLocaleString('ko-KR')}</span></div><div class="exp"><i style="width:${progress}%"></i></div>`;
    const levelBadge = this.get('.level-badge'); levelBadge.style.setProperty('--progress', `${progress}%`); levelBadge.addEventListener('click', () => this.open('characters'));
    // 레벨 배지 아래 캐릭터 닉네임(작업 228, 사용자 요청 `#19089` "레벨믿에 닉네임은 떠야할거같아").
    // 이름은 HTML로 넣지 않고 textContent로만 써서, 예전 세이브의 특수문자가 태그로 해석되지 않게 한다.
    const heroName = this.get('.hero-name');
    const nameText = typeof save.name === 'string' && save.name.trim() ? save.name.trim() : '모험가';
    heroName.textContent = nameText; heroName.title = nameText;
    this.get('.floor-button').addEventListener('click', () => this.open('floor'));
    this.top.querySelector<HTMLButtonElement>('.boss-retry')?.addEventListener('click', () => this.world.challengeBoss());
    this.top.querySelector<HTMLButtonElement>('.floor-return')?.addEventListener('click', () => { const result = this.world.travelToFloor(this.world.save.maxFloor); if (result.message) this.message(result.message); });
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.hp b').textContent = `HP ${Math.ceil(player.hp)}/${totalStats(save).health}`;
    this.get('.hp').setAttribute('aria-valuenow', String(Math.ceil(player.hp)));
    this.get('.hp').setAttribute('aria-valuemax', String(totalStats(save).health));
    const tutorial = ['자동 사냥이 시작되었습니다. 첫 해골전사를 처치하세요.', `${starterWeaponName(jobOrDefault(save.job))}을 자동으로 줍고 있습니다.`, `하단 갑옷 아이콘을 눌러 가방의 ${starterWeaponName(jobOrDefault(save.job))}을 장착하세요.`][save.tutorial];
    this.banner.textContent = tutorial ?? ''; this.banner.hidden = save.tutorial >= 3;
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
      const key = `${kind}:${canAdd}:${selecting}`;
      if (button.dataset.state !== key) {
        feedback.clear(button); applySkillArtwork(button, kind, jobOrDefault(this.world.save.job));
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
    if (alert) alert.hidden = !((available.length && this.world.save.quickSlots.some(slot => slot === null)) || hasSkillUpgrade(this.world.save));
    const { player, save } = this.world;
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.hp b').textContent = `HP ${Math.ceil(player.hp)}/${totalStats(save).health}`;
    this.get('.hp').setAttribute('aria-valuenow', String(Math.ceil(player.hp)));
    this.get('.hp').setAttribute('aria-valuemax', String(totalStats(save).health));
  }

export function renderBagBadge(this: Interface): void {
    const count = this.world.save.bag.filter(item => !isSkillBook(item) && this.newItems.has(item.id)).length;
    const badge = this.get('.new-badge'); badge.textContent = `${count}`; badge.hidden = count === 0;
  }
