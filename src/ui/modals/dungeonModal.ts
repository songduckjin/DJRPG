import type { Interface } from '../interface';
import { dungeonRankings } from '../dungeonLobby';
import { bindModalClose } from '../modalClose';

export function renderDungeonLobby(ui: Interface, dialog: HTMLElement): void {
  const state = ui.dungeon, floor = state.floor;
  dialog.innerHTML = `<section class="dungeon-lobby"><div class="dungeon-hero"><img src="/assets/dungeon/lobby-gate-v1.png" alt="등불이 켜진 닫힌 철문"><button type="button" class="modal-close dungeon-close" aria-label="닫기">×</button><div class="dungeon-title"><small>끝을 향한 도전</small><h2>끝없는 던전</h2></div></div><div class="dungeon-body"><div class="dungeon-current"><span>현재 도전 층</span><strong>제 ${floor.floor} 층</strong><small>${state.clearedFloor ? `${state.clearedFloor}층 클리어` : '첫 번째 문이 당신을 기다립니다'}</small></div><nav class="dungeon-tabs" aria-label="던전 메뉴"><button type="button" data-dungeon-tab="challenge" aria-pressed="${state.tab==='challenge'}">도전</button><button type="button" data-dungeon-tab="ranking" aria-pressed="${state.tab==='ranking'}">순위</button></nav><div class="dungeon-content"></div><footer class="dungeon-footer"><button type="button" class="dungeon-enter">도전하기</button><small>대기창 미리보기 · 전투 입장은 준비 중입니다</small></footer></div></section>`;
  bindModalClose(dialog.querySelector<HTMLButtonElement>('.dungeon-close')!, () => ui.open(null));
  dialog.querySelectorAll<HTMLButtonElement>('[data-dungeon-tab]').forEach(button => button.onclick = () => { state.tab = button.dataset.dungeonTab as typeof state.tab; ui.renderModal(); });
  dialog.querySelector<HTMLButtonElement>('.dungeon-enter')!.onclick = () => ui.message('던전 전투 입장은 준비 중입니다. 현재는 대기창 미리보기입니다.');
  const content = dialog.querySelector<HTMLElement>('.dungeon-content')!;
  if (state.tab === 'challenge') {
    content.innerHTML = `<div class="dungeon-facts"><div><small>제한 시간</small><strong>90초</strong></div><div><small>출현 적</small><strong>${floor.boss ? '보스 1마리' : '해골 병사 6 · 정예 1'}</strong></div></div><h3>${floor.boss ? '보스 층' : '전투 구성'}</h3><div class="dungeon-waves">${floor.waves.map((count,index)=>`<div><small>${floor.boss ? '단독 전투' : `${index+1} WAVE`}</small><strong>${floor.boss ? '필드 보스' : index===2 ? '정예 해골' : '해골 병사'}</strong><span>${count}마리</span></div>`).join('<i aria-hidden="true">›</i>')}</div><p>각 웨이브는 10초가 지나거나 앞선 적을 모두 처치하면 등장합니다. 제한 시간 안에 모든 적을 처치하세요.</p><div class="dungeon-note"><strong>5층마다 보스 등장</strong><span>보스 층에는 일반 병사 없이 보스만 등장합니다.</span></div><div class="dungeon-prize"><span>최초 클리어 보상</span><strong>금화 · 강화석</strong><small>보상 수량은 전투 연결 시 확정됩니다.</small></div>`;
  } else {
    const rankings = dungeonRankings(state.records);
    content.innerHTML = '<div class="dungeon-rank-heading"><span>순위</span><span>도전자</span><span>최고 클리어</span></div>';
    if (!rankings.length) { const empty=document.createElement('p'); empty.className='dungeon-empty'; empty.textContent='아직 클리어 기록이 없습니다.'; content.append(empty); }
    rankings.slice(0,10).forEach((row,index)=>{const line=document.createElement('div');line.className=`dungeon-rank-row${row.mine?' is-mine':''}`;for(const text of [`${index+1}`,row.name,`${row.clearedFloor}층`]){const cell=document.createElement('span');cell.textContent=text;line.append(cell);}content.append(line);});
    const mine=rankings.findIndex(row=>row.mine), own=document.createElement('div');own.className='dungeon-own-rank';own.textContent=mine<0?'내 순위 · 아직 기록 없음':`내 순위 ${mine+1}위 · ${rankings[mine].clearedFloor}층 클리어`;content.append(own);
    const note=document.createElement('p');note.textContent='최고 클리어 층 기준 · 같은 층은 먼저 클리어한 도전자 순으로 표시됩니다. 순위 서버 연결은 준비 중입니다.';content.append(note);
  }
}
