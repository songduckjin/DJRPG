import type { Interface } from '../interface';
import { dungeonRankings } from '../dungeonLobby';
import { bindModalClose } from '../modalClose';

export function renderDungeonLobby(ui: Interface, dialog: HTMLElement): void {
  const state = ui.dungeon, floor = state.floor;
  dialog.innerHTML = `<section class="dungeon-lobby" data-tab="${state.tab}"><div class="dungeon-hero"><img src="/assets/dungeon/lobby-gate-v1.png" alt="등불이 켜진 닫힌 철문"><button type="button" class="modal-close dungeon-close" aria-label="닫기">×</button></div><div class="dungeon-body"><div class="dungeon-current"><h2>끝없는 던전</h2><strong>제 ${floor.floor} 층</strong></div><nav class="dungeon-tabs" aria-label="던전 메뉴"><button type="button" data-dungeon-tab="challenge" aria-pressed="${state.tab==='challenge'}">도전</button><button type="button" data-dungeon-tab="ranking" aria-pressed="${state.tab==='ranking'}">순위</button></nav><div class="dungeon-content"></div>${state.tab==='challenge'?`<footer class="dungeon-footer"><button type="button" class="dungeon-enter">도전하기</button><small>대기창 미리보기 · 전투 입장은 준비 중입니다</small></footer>`:''}</div></section>`;
  bindModalClose(dialog.querySelector<HTMLButtonElement>('.dungeon-close')!, () => ui.open(null));
  dialog.querySelectorAll<HTMLButtonElement>('[data-dungeon-tab]').forEach(button => button.onclick = () => { state.tab = button.dataset.dungeonTab as typeof state.tab; ui.renderModal(); });
  const enter = dialog.querySelector<HTMLButtonElement>('.dungeon-enter');
  if (enter) enter.onclick = () => ui.message('던전 전투 입장은 준비 중입니다. 현재는 대기창 미리보기입니다.');
  const content = dialog.querySelector<HTMLElement>('.dungeon-content')!;
  if (state.tab === 'challenge') {
    content.innerHTML = `<h3>전투 구성</h3><div class="dungeon-waves">${floor.waves.map((count,index)=>`<div><small>${floor.boss ? '단독 전투' : `${index+1} WAVE`}</small><strong>${floor.boss ? '필드 보스' : index===2 ? '정예 해골' : '해골 병사'}</strong><span>${count}마리</span></div>`).join('<i aria-hidden="true">›</i>')}</div><p>${floor.boss ? '보스를 처치하세요.' : '각 웨이브는 10초가 지나거나 앞선 적을 모두 처치하면 등장합니다. 모든 적을 처치하세요.'}<br><strong class="dungeon-time-note">제한시간은 90초입니다.</strong></p><section class="dungeon-prize" aria-label="최초 클리어 보상"><h3>최초 클리어 보상</h3><div class="dungeon-prize-items"><div><img src="/assets/icons/gold-coin.png" alt=""><strong>금화</strong></div><div><img src="/assets/icons/dungeon-stone.svg" alt=""><strong>강화석</strong></div></div><small>보상 수량은 전투 연결 시 확정됩니다.</small></section>`;
  } else {
    const rankings = dungeonRankings(state.records);
    content.innerHTML = '<div class="dungeon-rank-heading"><span>순위</span><span>도전자</span><span>최고 클리어</span></div>';
    for (let index=0;index<10;index++) {
      const row=rankings[index],line=document.createElement('div');
      line.className=`dungeon-rank-row${row?.mine?' is-mine':''}${row?'':' is-empty'}`;
      for(const text of [`${index+1}`,row?.name ?? '기록 없음',row ? `${row.clearedFloor}층` : '—']) {
        const cell=document.createElement('span');cell.textContent=text;line.append(cell);
      }
      content.append(line);
    }
    const mine=rankings.findIndex(row=>row.mine), own=document.createElement('div');own.className='dungeon-own-rank';own.textContent=mine<0?'내 순위 · 아직 기록 없음':`내 순위 ${mine+1}위 · ${rankings[mine].clearedFloor}층 클리어`;content.append(own);
    const note=document.createElement('p');note.textContent='최고 클리어 층 기준 · 같은 층은 먼저 클리어한 도전자 순으로 표시됩니다. 순위 서버 연결은 준비 중입니다.';content.append(note);
  }
}
