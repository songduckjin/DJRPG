import { openDungeonField } from '../dungeonField';
import type { Interface } from '../interface';
import { DUNGEON_MAX_FLOOR, type DungeonLobby } from '../dungeonLobby';
import type { DungeonLive } from '../../game/dungeonLive';
import { bindModalClose } from '../modalClose';

function text(tag: string, value: string, className = ''): HTMLElement {
  const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el;
}

/** 순위 탭: 서버가 돌려준 상위 10명과 내 기록. 서버 기록이 없을 때만 그 이유를 짧게 적는다. */
export function renderDungeonRanking(parent: HTMLElement, state: DungeonLobby, live?: DungeonLive): void {
  const standing = live?.data?.standing, top = standing?.top ?? [], mine = standing?.mine;
  state.syncStanding(top);
  const heading = text('div', '', 'dungeon-rank-heading');
  for (const label of ['순위', '도전자', '최고 클리어']) heading.append(text('span', label));
  parent.append(heading);
  for (let index = 0; index < 10; index++) {
    const rank = index + 1, entry = top.find(row => row.rank === rank), line = document.createElement('div');
    line.className = `dungeon-rank-row${entry?.clearedFloor ? '' : ' is-empty'}${entry?.mine || mine?.rank === rank ? ' is-mine' : ''}`;
    for (const value of [String(rank), entry?.name ?? '기록 없음', entry ? `${entry.clearedFloor}층` : '—']) line.append(text('span', value));
    parent.append(line);
  }
  const own = text('div', mine
    ? `내 순위 ${mine.rank}위 · ${mine.clearedFloor}층 클리어`
    : live?.guest
      ? '게스트는 순위에 기록되지 않습니다. 정식 계정으로 로그인하면 내 기록이 올라갑니다.'
      : state.clearedFloor > 0
        ? `아직 서버에 기록되지 않았습니다 · 내 최고 ${state.clearedFloor}층`
        : '내 순위 · 아직 기록 없음', 'dungeon-own-rank');
  parent.append(own);
  const notes: string[] = [];
  if (live?.error) notes.push(live.error);
  else if (live?.loading && !standing) notes.push('서버 순위를 불러오는 중입니다.');
  else if (!live) notes.push('순위 서버에 연결하지 못했습니다.');
  else if (standing) notes.push(`참가자 ${standing.total.toLocaleString('ko-KR')}명 · 최고 클리어 층 기준, 같은 층은 먼저 클리어한 도전자 순입니다.`);
  if (live?.data?.recorded) notes.push(`이번 기록: ${live.data.recorded}층`);
  if (notes.length) parent.append(text('p', notes.join(' '), 'dungeon-rank-note'));
}

export function renderDungeonLobby(ui: Interface, dialog: HTMLElement): void {
  const state = ui.dungeon;
  // 진행은 계정 세이브가 소유한다: 새로고침·재접속 뒤에도 이 값에서 이어 간다.
  state.load(ui.world.save);
  const floor = state.floor, status = state.status, live = state.live;
  const comingSoon = `<em class="dungeon-coming-soon"><b>${DUNGEON_MAX_FLOOR + 1}층</b> Coming Soon</em>`;
  dialog.innerHTML = `<section class="dungeon-lobby" data-tab="${state.tab}"><div class="dungeon-hero"><div class="dungeon-lobby-gate" role="img" aria-label="등불이 켜진 철문"><i class="dungeon-lobby-gate-dark"></i><img class="dungeon-gate-left" src="/assets/dungeon/gate-left-v1.png" alt=""><img class="dungeon-gate-right" src="/assets/dungeon/gate-right-v1.png" alt=""><img class="dungeon-gate-frame" src="/assets/dungeon/gate-frame-v1.png" alt=""></div><button type="button" class="modal-close dungeon-close" aria-label="닫기">×</button></div><div class="dungeon-body"><div class="dungeon-current"><h2>끝없는 던전</h2><strong>${status.headline}</strong>${status.completed ? `${comingSoon}<small>${status.detail}</small>` : `<small>최고 클리어 ${state.clearedFloor}층</small>`}</div><nav class="dungeon-tabs" aria-label="던전 메뉴"><button type="button" data-dungeon-tab="challenge" aria-pressed="${state.tab==='challenge'}">도전</button><button type="button" data-dungeon-tab="ranking" aria-pressed="${state.tab==='ranking'}">순위</button></nav><div class="dungeon-content"></div>${state.tab==='challenge'?`<footer class="dungeon-footer"><button type="button" class="dungeon-enter" ${status.completed?'disabled':''}>${status.button}</button><small>1~${DUNGEON_MAX_FLOOR}층 자동 전투 · 클리어 기록은 서버 순위에 반영됩니다</small></footer>`:''}</div></section>`;
  bindModalClose(dialog.querySelector<HTMLButtonElement>('.dungeon-close')!, () => ui.open(null));
  dialog.querySelectorAll<HTMLButtonElement>('[data-dungeon-tab]').forEach(button => button.onclick = () => { state.tab = button.dataset.dungeonTab as typeof state.tab; ui.renderModal(); });
  const enter = dialog.querySelector<HTMLButtonElement>('.dungeon-enter');
  if (enter) enter.onclick = () => openDungeonField(ui, dialog);
  const content = dialog.querySelector<HTMLElement>('.dungeon-content')!;
  if (state.tab === 'challenge') {
    if (status.completed) {
      // 최고층을 다 깼다: 도전할 층이 없으니 다음 층이 준비 중임을 분명히 보여 준다.
      content.innerHTML = `<section class="dungeon-coming-soon-panel" aria-label="다음 층 준비 중"><h3>${status.headline}</h3><p>더 깊은 던전을 준비하고 있습니다.</p>${comingSoon}<small>${status.detail} 보상과 순위는 다음 층이 열릴 때 함께 정해집니다.</small></section>`;
      return;
    }
    content.innerHTML = `<h3>전투 구성</h3><div class="dungeon-waves">${floor.waves.map((count,index)=>`<div><small>${floor.boss ? '단독 전투' : `${index+1} WAVE`}</small><strong>${floor.boss ? '필드 보스' : index===2 ? '정예 해골' : '해골 병사'}</strong><span>${count}마리</span></div>`).join('<i aria-hidden="true">›</i>')}</div><p>${floor.boss ? '보스를 처치하세요.' : '각 웨이브는 10초가 지나거나 앞선 적을 모두 처치하면 등장합니다. 모든 적을 처치하세요.'}<br><strong class="dungeon-time-note">제한시간은 90초입니다.</strong></p><section class="dungeon-prize" aria-label="최초 클리어 보상"><h3>최초 클리어 보상</h3><div class="dungeon-prize-items"><div><img src="/assets/icons/gold-coin.png" alt=""><strong>금화</strong></div><div><img src="/assets/icons/dungeon-stone.svg" alt=""><strong>강화석</strong></div></div><small>보상 수량은 전투 연결 시 확정됩니다.</small></section>`;
  } else {
    const refresh = (): void => {
      if (!dialog.isConnected || state.tab !== 'ranking') return;
      const panel = dialog.querySelector<HTMLElement>('.dungeon-content');
      if (!panel) return;
      panel.replaceChildren(); renderDungeonRanking(panel, state, live);
    };
    renderDungeonRanking(content, state, live);
    if (live) void (async () => {
      if (!live.fresh) await live.load();
      // 세이브와 서버 기록이 다르면(오프라인 클리어·전송 실패·계정 초기화) 한 번 더 맞춘다.
      // 세이브의 층이 서버 기록보다 앞서 있으면(전송 실패) 그 전투 요약이 남아 있을 때만 다시 보낸다 —
      // 요약 없이 보내면 서버가 거절하고(DUNGEON_SUMMARY_REQUIRED) 순위 탭에 실패 문구만 남는다.
      if (!live.guest && live.data && (live.data.standing.mine?.clearedFloor ?? 0) !== state.clearedFloor && live.hasClear(state.clearedFloor)) await live.submit(state.clearedFloor);
      refresh();
    })();
  }
}
