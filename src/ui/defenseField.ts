/**
 * 무한 방어전 전투 화면 (2026-11-24).
 *
 * 기존 던전 전장(`ui/dungeonField.ts`)과 같은 뼈대(전체 화면 오버레이 + Pixi 캔버스 + 하단 HUD + 결과창)를
 * 쓰되, 확정 사양에 맞춰 다음을 바꿨다.
 *  · **성벽·방어선 HP 막대가 없다** — 하단 HUD에는 캐릭터 HP 막대 하나만 있다(`02_battle_active.png`).
 *  · 캐릭터가 아래에서 출발해 위에서 내려오는 적에게 **직접 걸어가 교전**한다(`DefenseBattle` 순수 로직).
 *  · 무한 스테이지 — 판은 캐릭터 HP 0(또는 30분 안전 상한)에서 끝나고, 결과창이 도달 스테이지를 보여 준다.
 *  · 실패해도 그때까지 획득한 금화·경험치·아이템을 그대로 지급한다.
 */
import { Assets } from 'pixi.js';
import { GameView } from '../game/render';
import { projectArenaPoint } from '../game/arena';
import { totalStats } from '../game/store';
import { skills } from '../game/skills';
import { cooldowns } from '../game/world';
import { equipmentImage, isEquipment, isStatBook, type Rarity } from '../game/items';
import {
  DefenseBattle, DEFENSE_STEP, DEFENSE_RUN_SECONDS, defenseBattleSummary,
  type DefenseBattleSummary
} from '../game/dungeon/defenseBattle';
import { claimDefenseRewards, type DefenseRewardReceipt } from '../game/defenseProgress';
import { randomSeed } from '../game/rng';
import { setSkillIcon } from './skillArtwork';
import type { Interface } from './interface';

const rarityInk: Record<Rarity, string> = { common: '#cdd6e0', magic: '#2f7bff', rare: '#ffd400', epic: '#a855f7', unique: '#ff8a00', legendary: '#ff2d2d' };

function itemMarkup(items: DefenseRewardReceipt['items']): string {
  if (!items.length) return '<p class="defense-result-none">떨어진 아이템이 없습니다.</p>';
  return `<ul class="defense-result-items">${items.map(item => {
    const art = isEquipment(item) ? equipmentImage(item) : undefined;
    const icon = art
      ? art.columns > 1
        ? `<span class="atlas-icon" style="background-image:url('${art.path}');background-position:${art.frame / (art.columns - 1) * 100}% center"></span>`
        : `<img src="${art.path}" alt="">`
      : isStatBook(item) ? '<img src="/assets/icons/icon_skillbook.png" alt="">' : '';
    return `<li style="--loot-ink:${rarityInk[item.rarity]}">${icon}<span>${item.name}</span></li>`;
  }).join('')}</ul>`;
}

/** 결과창 본문 — 도달 스테이지·처치·획득·신기록. */
function resultMarkup(summary: DefenseBattleSummary, receipt: DefenseRewardReceipt | undefined, previous: number, settled: boolean): string {
  const record = summary.stages > previous;
  return `<small>무한 방어전</small><h2>도달 ${summary.stages} 스테이지</h2>
    <p>처치 <b>${summary.kills}</b>마리 · <b>${Math.floor(summary.seconds / 60)}분 ${Math.round(summary.seconds % 60)}초</b> · 남은 체력 ${summary.heroHp} / ${summary.heroHpMax}</p>
    ${record ? `<p class="defense-result-record">신기록 · 이전 최고 ${previous} → <b>${summary.stages} 스테이지</b></p>` : `<p class="defense-result-record">최고 기록 ${Math.max(previous, summary.stages)} 스테이지</p>`}
    ${receipt ? `<div class="dungeon-result-gold">획득 금화 <b>${receipt.gold.toLocaleString('ko-KR')}</b> · 경험치 <b>${receipt.exp.toLocaleString('ko-KR')}</b></div>${itemMarkup(receipt.items)}${receipt.missed ? `<p class="defense-result-note">가방이 가득 차 ${receipt.missed}개를 놓쳤습니다.</p>` : ''}${receipt.salvaged.count ? `<p class="defense-result-note">자동 분해 ${receipt.salvaged.count}개 · 금화 ${receipt.salvaged.gold.toLocaleString('ko-KR')} · 강화석 ${receipt.salvaged.stones}</p>` : ''}` : '<p>보상을 정산하는 중입니다…</p>'}
    <p class="defense-result-note">${settled ? '획득한 보상은 계정에 저장되었습니다.' : '저장 중입니다.'}</p>`;
}

/**
 * 방어전 전투를 연다. `lobby`는 이 화면을 띄운 던전 모달이다(닫힐 때 함께 정리한다).
 */
export function openDefenseField(ui: Interface, lobby: HTMLElement): void {
  if (ui.market.sync.locked || ui.market.sync.conflicted || ui.market.busy) { ui.message('동기화가 끝난 뒤 도전해 주세요.'); return; }
  if (ui.root.querySelector('.dungeon-field')) return;
  const lobbyRoot = lobby.querySelector<HTMLElement>('.dungeon-lobby')!;
  lobbyRoot.classList.add('is-opening');
  lobbyRoot.querySelectorAll<HTMLButtonElement>('button:not(.dungeon-close)').forEach(button => button.disabled = true);
  const doorOpened = new Promise<void>(resolve => window.setTimeout(resolve, 1500));
  const wasPaused = ui.world.paused, resume = ui.suspendMainField?.();
  ui.world.paused = true; ui.world.attackHeld = false;
  const field = document.createElement('section');
  field.className = 'dungeon-field defense-field';
  field.setAttribute('role', 'region');
  field.setAttribute('aria-label', '무한 방어전');
  field.innerHTML = `<div class="dungeon-field-canvas"></div><div class="defense-trail" aria-hidden="true"></div>
    <header class="dungeon-field-hud"><div><small>무한 방어전</small><strong data-stage>STAGE 1</strong></div><button type="button" class="dungeon-field-leave">나가기</button></header>
    <div class="defense-stage-banner" aria-live="polite"></div>
    <footer class="dungeon-battle-hud defense-battle-hud"><div class="dungeon-battle-record"><strong data-clock>30:00</strong><span data-wave>WAVE 1 / 3</span><span data-kills>처치 0</span><span data-gold>금화 0</span></div><div class="dungeon-hp"><i></i><span></span></div><div class="dungeon-auto-skills"></div><small>자동 전투 · 적 추적 교전 · 처치 보상은 필드와 동일 · 최고 스테이지 랭킹 기록</small></footer>
    <div class="dungeon-battle-result" hidden></div>`;
  ui.root.querySelector('.game-shell')!.append(field);
  const get = <T extends HTMLElement>(s: string) => field.querySelector<T>(s)!;
  const view = new GameView();
  let battle!: DefenseBattle, closed = false, mounted = false, age = 0, visualTime = 0, finishAge = 0, resultShown = false, pendingStep = 0, starting = false;
  let lastStage = 1, bannerTimer = 0, summary: DefenseBattleSummary | undefined, receipt: DefenseRewardReceipt | undefined, settled = false;
  const previousBest = ui.defense.bestStage;

  // 서버가 준 판 번호·시드로 전투를 시작한다. 게스트·start 실패면 로컬 시드로 돌고, 그 판은 순위에 오르지 않는다.
  const createBattle = async (): Promise<void> => {
    starting = true;
    const start = await ui.defense.live?.begin();
    if (closed) return;
    battle = new DefenseBattle(ui.world.save, start?.seed ?? randomSeed());
    pendingStep = 0; starting = false;
    lastStage = battle.stage;
  };

  // 이동 궤적 — 캐릭터가 서 있는 자리에서 화면 아래까지 옅은 점선을 남긴다(요청: 이동 궤적만 은은히).
  const updateTrail = (): void => {
    const w = view.app.screen.width, h = view.app.screen.height;
    const [hx, hy] = projectArenaPoint(battle.world.player.x, battle.world.player.y, w, h);
    const trail = get<HTMLElement>('.defense-trail');
    trail.style.left = `${hx}px`;
    trail.style.top = `${hy + 6}px`;
    trail.style.height = `${Math.max(0, h - hy - 6)}px`;
  };

  const leave = () => { cleanup(); ui.open('dungeon'); };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    observer.disconnect();
    lobbyRoot.classList.remove('is-opening');
    lobbyRoot.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = false);
    field.remove();
    if (mounted) view.app.destroy(true, { children: true, texture: false, textureSource: false });
    ui.world.paused = wasPaused || ui.market.sync.locked || ui.market.sync.conflicted;
    resume?.();
  };
  const observer = new MutationObserver(() => { if (ui.openModal !== 'dungeon' || !lobbyRoot.isConnected) cleanup(); });
  observer.observe(ui.modal, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });

  get<HTMLButtonElement>('.dungeon-field-leave').onclick = leave;
  field.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') leave(); });

  // 하단 자동 스킬 칸 — 장전된 스킬의 남은 쿨타임을 매 프레임 숫자와 어두운 마스크로 보여 준다.
  const autoSkillViews: { id: string; el: HTMLElement; cd: HTMLElement; mask: HTMLElement }[] = [];
  for (const id of ui.world.save.quickSlots) {
    const slot = document.createElement('div'); slot.className = 'dungeon-auto-skill';
    if (id) {
      const icon = document.createElement('i'); setSkillIcon(icon, id);
      const mask = document.createElement('b'); mask.className = 'dungeon-auto-skill-mask';
      const cd = document.createElement('em'); cd.className = 'dungeon-auto-skill-cd';
      icon.append(mask, cd); slot.append(icon);
      const name = document.createElement('span'); name.textContent = skills[id].name; slot.append(name);
      autoSkillViews.push({ id, el: slot, cd, mask });
    } else slot.textContent = '빈 슬롯';
    get('.dungeon-auto-skills').append(slot);
  }

  /** 판이 끝났을 때 — 요약을 서버에 먼저 보내고(검증), 그 뒤 보상을 세이브에 적는다. */
  const finish = (): void => {
    if (resultShown) return;
    resultShown = true;
    const save = ui.world.save;
    summary = defenseBattleSummary(battle);
    ui.defense.live?.rememberRun(battle.stage, summary);
    // ⚠️ 보상보다 **먼저** 제출한다: 서버는 이 순간의 세이브(보상·레벨업 전)로 같은 시드의 판을 리플레이한다.
    void ui.defense.live?.submit(battle.stage, summary);
    // 도달 스테이지·보상은 실패해도 그대로 남긴다(확정 사양 ③).
    ui.defense.record(save, battle.stage);
    receipt = claimDefenseRewards(save, battle.rewards(), {
      autoSalvage: ui.autoSalvage ? ui.salvageRarity : undefined, autoSalvagePlus: ui.salvagePlus
    });
    settled = true;
    ui.onSave(); ui.renderStatus(); ui.renderBagBadge();
    const box = get<HTMLElement>('.dungeon-battle-result');
    box.hidden = false;
    box.innerHTML = `<div>${resultMarkup(summary, receipt, previousBest, settled)}<button type="button" data-retry>다시 도전</button><button type="button" data-leave>나가기</button><small>${ui.defense.live?.guest ? '게스트 기록은 순위에 오르지 않습니다.' : '최고 스테이지는 서버가 판을 다시 계산해 확인한 뒤 순위에 반영됩니다.'}</small></div>`;
    box.querySelector<HTMLButtonElement>('[data-retry]')!.onclick = () => { box.hidden = true; void resetBattle(); };
    box.querySelector<HTMLButtonElement>('[data-leave]')!.onclick = leave;
  };

  const resetBattle = async (): Promise<void> => {
    for (const sprite of view.enemies.values()) sprite.destroy();
    view.enemies.clear(); view.enemyWalkDistance.clear();
    for (const corpse of view.corpses) corpse.sprite.destroy();
    view.corpses = [];
    for (const label of view.damageLabels.values()) label.destroy();
    view.damageLabels.clear();
    finishAge = 0; age = 0; resultShown = false; summary = undefined; receipt = undefined; settled = false;
    await createBattle();
    if (closed) return;
    get('.dungeon-battle-result').hidden = true;
  };

  void (async () => {
    try {
      await Assets.load('/assets/dungeon/prison-room-v2.png');
      if (closed) return;
      await view.mount(get('.dungeon-field-canvas'));
      mounted = true;
      if (closed) return;
      await doorOpened;
      if (closed) return;
      observer.disconnect();
      view.app.renderer.background.color = 0x000000;
      view.app.renderer.background.alpha = 0;
      for (const layer of [view.floor, view.terrainLayer, view.ambientLayer, view.glow, view.shade]) layer.visible = false;
      view.drawTerrain = () => {}; view.drawDust = () => {}; view.drawRunes = () => {};
      await createBattle();
      if (closed) return;
      view.draw(battle.world, 0);
      view.app.renderer.render(view.app.stage);
      requestAnimationFrame(() => {
        if (closed) return;
        field.classList.add('is-ready');
        get<HTMLButtonElement>('.dungeon-field-leave').focus();
        // 전투 화면이 뜨면 모달은 접는다(던전과 같다).
        window.setTimeout(() => { if (!closed && ui.openModal === 'dungeon') ui.open(null); }, 650);
      });
      let previous = performance.now();
      view.app.ticker.add(() => {
        if (closed || starting) return;
        const now = performance.now();
        const dt = document.hidden ? 0 : Math.min(.05, (now - previous) / 1000);
        previous = now; age += dt; visualTime += dt;
        // 전투는 고정 스텝으로만 전진한다 — 서버 리플레이와 같은 스텝 수를 밟아야 같은 결과가 나온다.
        if (age > .65 && !battle.finished) {
          pendingStep += dt;
          for (let steps = 0; pendingStep >= DEFENSE_STEP && !battle.finished && steps < 8; steps++) { battle.advance(DEFENSE_STEP); pendingStep -= DEFENSE_STEP; }
          if (battle.finished) pendingStep = 0;
        }
        if (battle.finished) {
          finishAge += dt;
          battle.world.attackPose = Math.max(0, battle.world.attackPose - dt);
          battle.world.effects = battle.world.effects.filter(effect => { effect.age += dt; return effect.age < effect.duration; });
        }
        view.draw(battle.world, visualTime);
        updateTrail();
        const hp = battle.world.player.hp, max = totalStats(battle.world.save).health;
        get('.dungeon-hp i').style.width = `${Math.max(0, hp) / max * 100}%`;
        get('.dungeon-hp span').textContent = `HP ${Math.ceil(Math.max(0, hp))} / ${max}`;
        const left = Math.max(0, DEFENSE_RUN_SECONDS - battle.elapsed);
        get('[data-clock]').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
        get('[data-stage]').textContent = `STAGE ${battle.stage}`;
        get('[data-wave]').textContent = battle.bossStage ? 'BOSS' : `WAVE ${battle.wave} / 3`;
        get('[data-kills]').textContent = `처치 ${battle.world.slain}`;
        get('[data-gold]').textContent = `금화 ${battle.world.gold.toLocaleString('ko-KR')}`;
        // 스테이지가 오르면 가운데에 크게 한 번 알린다.
        if (battle.stage !== lastStage && !battle.finished) {
          lastStage = battle.stage;
          const banner = get<HTMLElement>('.defense-stage-banner');
          banner.textContent = battle.bossStage ? `STAGE ${battle.stage} · 보스` : `STAGE ${battle.stage}`;
          banner.classList.add('is-show');
          window.clearTimeout(bannerTimer);
          bannerTimer = window.setTimeout(() => banner.classList.remove('is-show'), 1400);
        }
        for (const skill of autoSkillViews) {
          const total = Math.max(.001, cooldowns[skill.id as keyof typeof cooldowns] ?? 1);
          const remains = Math.max(0, battle.world.cooldown[skill.id as keyof typeof battle.world.cooldown] ?? 0);
          const ratio = Math.min(1, remains / total);
          skill.el.classList.toggle('is-cooling', remains > 0);
          skill.cd.textContent = remains > 0 ? (remains >= 10 ? String(Math.ceil(remains)) : remains.toFixed(1)) : '';
          skill.mask.style.transform = `scaleY(${ratio})`;
        }
        if (battle.finished && finishAge >= .8) finish();
      });
    } catch (error) {
      if (closed) return;
      cleanup();
      ui.message(`전장 로딩 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}
