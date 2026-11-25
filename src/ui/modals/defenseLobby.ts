/**
 * 던전 허브 + 무한 방어전 로비·순위 화면 (2026-11-24).
 *
 * 기존 던전 모달(`ui/modals/dungeonModal.ts`)의 첫 화면을 **던전 허브**로 확장했다 — 철문 아트 아래
 * 두 카드 중 하나를 고른다: `끝없는 던전`(기존 돌파형, 화면·동작 그대로)과 `무한 방어전`(신규).
 * 새 버튼·새 모달을 만들지 않고, 같은 창 안에서 `mode`만 바꾼다.
 */
import type { Interface } from '../interface';
import type { DungeonLobby } from '../dungeonLobby';
import type { DefenseLobby } from '../defenseLobby';
import type { DefenseLive } from '../../game/defenseLive';
import { DEFENSE_MAX_STAGE, defenseBossStage, defenseEliteWave, defenseStageEnemyCount } from '../../game/dungeon/defenseBattle';
import { bindModalClose } from '../modalClose';
import { openDefenseField } from '../defenseField';

function text(tag: string, value: string, className = ''): HTMLElement {
  const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el;
}

/** 철문 아트 — 두 화면(허브·방어전 로비)이 같은 머리글을 쓴다. */
const gateMarkup = `<div class="dungeon-hero"><div class="dungeon-lobby-gate" role="img" aria-label="등불이 켜진 철문"><i class="dungeon-lobby-gate-dark"></i><img class="dungeon-gate-left" src="/assets/dungeon/gate-left-v1.png" alt=""><img class="dungeon-gate-right" src="/assets/dungeon/gate-right-v1.png" alt=""><img class="dungeon-gate-frame" src="/assets/dungeon/gate-frame-v1.png" alt=""></div><button type="button" class="modal-close dungeon-close" aria-label="닫기">×</button></div>`;

/**
 * 던전 허브 — 두 모드 카드. 카드 하나가 곧 입장 버튼이라 모바일에서 한 번에 고를 수 있다.
 * 기존 '끝없는 던전' 화면은 이 카드를 누르면 예전 그대로 나온다.
 */
export function renderDungeonHub(ui: Interface, dialog: HTMLElement): void {
  const dungeon: DungeonLobby = ui.dungeon, defense: DefenseLobby = ui.defense;
  dungeon.load(ui.world.save);
  defense.load(ui.world.save);
  dialog.innerHTML = `<section class="dungeon-lobby defense-hub" data-mode="hub">${gateMarkup}<div class="dungeon-body">
    <div class="dungeon-current"><h2>던전</h2><strong>어떤 도전을 하시겠습니까?</strong><small>두 모드 모두 계정 진행에 저장되고 서버 순위에 기록됩니다.</small></div>
    <div class="defense-hub-cards">
      <button type="button" class="defense-hub-card" data-dungeon-mode="endless">
        <span class="defense-hub-tag">돌파형</span>
        <strong>끝없는 던전</strong>
        <p>1층부터 10층까지. 층마다 웨이브를 모두 처치하면 다음 층으로 이어집니다.</p>
        <em>최고 클리어 <b>${dungeon.clearedFloor}</b>층</em>
        <i>입장</i>
      </button>
      <button type="button" class="defense-hub-card is-new" data-dungeon-mode="defense">
        <span class="defense-hub-tag">무한</span><span class="defense-hub-new">NEW</span>
        <strong>무한 방어전</strong>
        <p>아래에서 출발해 위에서 내려오는 적에게 직접 걸어가 싸웁니다. 쓰러질 때까지 웨이브가 계속 오릅니다.</p>
        <em>최고 <b>${defense.bestStage}</b> 웨이브</em>
        <i>입장</i>
      </button>
    </div>
    <p class="defense-hub-note">무한 방어전은 웨이브 하나가 진행 단위입니다 — 5웨이브마다 보스, 3의 배수 웨이브에 정예. 15웨이브부터 적이 가팔라지고 30웨이브가 사실상의 막입니다.</p>
  </div></section>`;
  bindModalClose(dialog.querySelector<HTMLButtonElement>('.dungeon-close')!, () => ui.open(null));
  dialog.querySelectorAll<HTMLButtonElement>('[data-dungeon-mode]').forEach(button => button.onclick = () => {
    dungeon.mode = button.dataset.dungeonMode === 'defense' ? 'defense' : 'endless';
    ui.renderModal();
  });
}

/** 무한 방어전 로비 — 최고 웨이브·이번 웨이브 안내·도전/순위 탭. */
export function renderDefenseLobby(ui: Interface, dialog: HTMLElement): void {
  const state: DefenseLobby = ui.defense;
  state.load(ui.world.save);
  const status = state.status, live = state.live;
  dialog.innerHTML = `<section class="dungeon-lobby defense-lobby" data-tab="${state.tab}">${gateMarkup}<div class="dungeon-body">
    <button type="button" class="dungeon-back" aria-label="던전 허브로">‹ 던전</button>
    <div class="dungeon-current"><h2>무한 방어전</h2><strong>${status.headline}</strong><small>${status.detail}</small></div>
    <nav class="dungeon-tabs" aria-label="무한 방어전 메뉴"><button type="button" data-defense-tab="challenge" aria-pressed="${state.tab === 'challenge'}">도전</button><button type="button" data-defense-tab="ranking" aria-pressed="${state.tab === 'ranking'}">순위</button></nav>
    <div class="dungeon-content"></div>
    ${state.tab === 'challenge' ? `<footer class="dungeon-footer"><button type="button" class="dungeon-enter">${status.button}</button><small>방어선 없이 적이 직접 다가옵니다 · 쓰러져도 그때까지의 보상은 유지 · 최고 웨이브가 순위에 기록됩니다</small></footer>` : ''}
  </div></section>`;
  bindModalClose(dialog.querySelector<HTMLButtonElement>('.dungeon-close')!, () => ui.open(null));
  dialog.querySelector<HTMLButtonElement>('.dungeon-back')!.onclick = () => { ui.dungeon.mode = 'hub'; ui.renderModal(); };
  dialog.querySelectorAll<HTMLButtonElement>('[data-defense-tab]').forEach(button => button.onclick = () => { state.tab = button.dataset.defenseTab as typeof state.tab; ui.renderModal(); });
  const enter = dialog.querySelector<HTMLButtonElement>('.dungeon-enter');
  if (enter) enter.onclick = () => openDefenseField(ui, dialog);
  const content = dialog.querySelector<HTMLElement>('.dungeon-content')!;
  if (state.tab === 'challenge') {
    const wave = state.nextStage, spec = state.nextWaveSpec;
    const boss = defenseBossStage(wave), elite = defenseEliteWave(wave);
    const kind = boss ? `보스 1 + 호위 ${defenseStageEnemyCount(wave) - 1}` : elite ? '마지막 1마리 정예' : '근접·돌진·사수 혼성';
    content.innerHTML = `<h3>전투 구성</h3><div class="dungeon-waves"><div><small>WAVE ${wave}</small><strong>${boss ? '보스 웨이브' : elite ? '정예 웨이브' : '일반 웨이브'}</strong><span>${spec.mobs}마리 · ${kind}</span></div><i aria-hidden="true">›</i><div><small>적 추격</small><strong>${spec.speed}u/s</strong><span>사수형 25% · 돌진형 20%</span></div><i aria-hidden="true">›</i><div><small>보상</small><strong>${spec.rewardFloor}층 기준</strong><span>1웨이브마다 +1 · 20층 포화</span></div></div>
      <p>웨이브를 막으면 <strong>다음 웨이브</strong>로 이어지고, 막을 때마다 <strong>최대 체력 15%</strong>를 회복합니다. 적이 방어선 없이 캐릭터에게 직접 다가오고, 캐릭터는 가장 가까운 적에게 걸어가 자동으로 싸웁니다.<br><strong class="dungeon-time-note">캐릭터 체력이 0이 되면 판이 끝납니다(최대 30분).</strong></p>
      <ul class="defense-rules"><li>이번 웨이브 적 <b>${spec.mobs}마리</b> · 5웨이브마다 보스, 3의 배수 웨이브에 정예</li><li>적 1타는 <b>필드 1타의 90%</b>, 1타는 <b>0.9초마다 한 마리</b> — 1~3웨이브는 한층 더 약하다</li><li>처치 금화·경험치는 <b>필드의 1.8배</b>, 아이템 드랍률은 필드와 동일 — 보스는 <b>확정 2개</b></li><li>10·20·30웨이브를 막으면 <b>보스 금화 ×2 + 확정 장비 1개</b></li><li>랭킹 웨이브는 <b>${DEFENSE_MAX_STAGE}</b>까지 계속 오릅니다</li></ul>`;
  } else {
    const refresh = (): void => {
      if (!dialog.isConnected || state.tab !== 'ranking') return;
      const panel = dialog.querySelector<HTMLElement>('.dungeon-content');
      if (!panel) return;
      panel.replaceChildren(); renderDefenseRanking(panel, state, live);
    };
    renderDefenseRanking(content, state, live);
    if (live) void (async () => {
      if (!live.fresh) await live.load();
      // 전송이 실패해 남아 있는 판 요약이 있고 서버 기록이 세이브보다 뒤처져 있으면 한 번 더 보낸다.
      if (!live.guest && live.run?.summary && live.run.stage && (live.data?.standing.mine?.bestStage ?? 0) < state.bestStage) await live.submit(live.run.stage, live.run.summary);
      refresh();
    })();
  }
}

/** 순위 탭 — 상위 10명(순위·닉네임·직업/레벨·최고 웨이브)과 내 순위 고정 카드. 직업별 분리 없이 통합 1개 순위다. */
export function renderDefenseRanking(parent: HTMLElement, state: DefenseLobby, live?: DefenseLive): void {
  const standing = live?.data?.standing, top = standing?.top ?? [], mine = standing?.mine;
  state.syncStanding(top);
  const heading = text('div', '', 'dungeon-rank-heading defense-rank-heading');
  for (const label of ['순위', '도전자', '직업', '최고 웨이브']) heading.append(text('span', label));
  parent.append(heading);
  const jobNames: Record<string, string> = { warrior: '전사', archer: '궁수', mage: '마법사' };
  for (let index = 0; index < 10; index++) {
    const rank = index + 1, entry = top.find(row => row.rank === rank), line = document.createElement('div');
    line.className = `dungeon-rank-row defense-rank-row${entry?.bestStage ? '' : ' is-empty'}${entry?.mine || mine?.rank === rank ? ' is-mine' : ''}`;
    const job = entry ? `${jobNames[entry.job ?? 'warrior'] ?? '전사'}${entry.level ? ` ${entry.level}` : ''}` : '—';
    for (const value of [String(rank), entry?.name ?? '기록 없음', job, entry ? `${entry.bestStage} 웨이브` : '—']) line.append(text('span', value));
    parent.append(line);
  }
  const own = text('div', mine
    ? `내 순위 ${mine.rank}위 · 최고 ${mine.bestStage} 웨이브`
    : live?.guest
      ? '게스트는 순위에 기록되지 않습니다. 정식 계정으로 로그인하면 내 기록이 올라갑니다.'
      : state.bestStage > 0
        ? `아직 서버에 기록되지 않았습니다 · 내 최고 ${state.bestStage} 웨이브`
        : '내 순위 · 아직 기록 없음', 'dungeon-own-rank defense-own-rank');
  parent.append(own);
  const notes: string[] = [];
  if (live?.error) notes.push(live.error);
  else if (live?.loading && !standing) notes.push('서버 순위를 불러오는 중입니다.');
  else if (!live) notes.push('순위 서버에 연결하지 못했습니다.');
  else if (standing) notes.push(`참가자 ${standing.total.toLocaleString('ko-KR')}명 · 최고 도달 웨이브 기준, 같은 웨이브는 먼저 도달한 도전자 순입니다.`);
  if (notes.length) parent.append(text('p', notes.join(' '), 'dungeon-rank-note'));
}
