import {topTen,type BossRank,type BossStanding} from './worldBossPresentation';
export function resultRankWindow(standing?:BossStanding):Array<{rank:number;entry?:BossRank}> {
  const mine=standing?.mine,rank=mine?.rank;
  const last=rank&&Number.isInteger(rank)&&rank>10?rank:10;
  const entries=[...(standing?.top??[]),...(standing?.nearMine??[]),...(mine?[mine]:[])];
  return Array.from({length:10},(_,i)=>({rank:last-9+i,entry:entries.find(e=>e.rank===last-9+i)}));
}
function text(tag:string,value:string,className=''):HTMLElement {const el=document.createElement(tag);el.textContent=value;el.className=className;return el;}
function row(rank:number,entry?:BossRank,mine?:number):HTMLElement {
  const el=document.createElement('div');el.className='wb-result-rank-row'+(rank===mine?' is-mine':'');
  el.append(text('b',`${rank}위`),text('span',entry?.name??'집계 대기'),text('strong',entry?entry.damage.toLocaleString('ko-KR'):'—'));return el;
}
export function exampleBossStanding():BossStanding {
  const make=(rank:number):BossRank=>({rank,name:`예시 전사 ${rank}`,damage:(50-rank)*1000});
  return {top:Array.from({length:10},(_,i)=>make(i+1)),nearMine:[...Array.from({length:9},(_,i)=>make(i+14)),make(24)],mine:{rank:23,name:'내 캐릭터 (예시)',damage:27000,mine:true}};
}
export function renderBossResult(parent:HTMLElement,standing:BossStanding|undefined,damage:number,actions:{retry:()=>void;leave:()=>void},example=false):void {
  parent.replaceChildren();const card=document.createElement('section');card.className='wb-result-card';card.setAttribute('aria-label','월드보스 전투 결과');
  const heading=text('h3',example?'순위 연출 예시':'전투 결과');
  const note=text('p',example?'연출 예시 · 실제 순위나 보상이 아닙니다.':`이번 연습 피해량 ${damage.toLocaleString('ko-KR')} · 기록은 저장되지 않습니다.`,'wb-result-note');
  card.append(heading,note);
  const mine=standing?.mine,descend=!!mine&&mine.rank>10;
  if(!mine){
    card.append(text('p','연습전 · 실제 순위 집계 대기','wb-result-pending'));
    const demo=document.createElement('button');demo.type='button';demo.className='wb-result-demo';demo.textContent='순위 연출 보기 (예시)';
    demo.onclick=()=>renderBossResult(parent,exampleBossStanding(),damage,actions,true);card.append(demo);
  }
  const window=document.createElement('div');window.className='wb-result-window'+(descend?' is-descending':'');window.setAttribute('aria-label',descend?'내 순위와 바로 위 9명':'상위 10명');
  const track=document.createElement('div');track.className='wb-result-track';
  const initial=document.createElement('div');initial.className='wb-result-page';const entries=topTen(standing);
  for(let rank=1;rank<=10;rank++)initial.append(row(rank,mine?.rank===rank?mine:entries.find(e=>e.rank===rank),mine?.rank));track.append(initial);
  if(descend){
    const target=document.createElement('div');target.className='wb-result-page';const rows=resultRankWindow(standing);
    for(const item of rows.slice(0,9))target.append(row(item.rank,item.entry));
    const arrival=document.createElement('div');arrival.className='wb-result-arrival';
    // The next-ranked participant occupied this position before my row was inserted.
    const displacedEntry=[...(standing?.nearMine??[]),...(standing?.top??[])].find(e=>e.rank===mine!.rank+1);
    const displaced=row(mine!.rank,displacedEntry);displaced.className+=' wb-result-displaced';
    arrival.append(displaced,row(mine!.rank,mine,mine!.rank));target.append(arrival);track.append(target);
  }
  window.append(track);card.append(window);
  const footer=document.createElement('footer');footer.className='wb-result-actions';
  for(const [label,run] of [['다시 도전하기',actions.retry],['나가기',actions.leave]] as const){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=run;footer.append(button);}
  card.append(footer);parent.append(card);
}
