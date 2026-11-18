import type {Interface} from '../interface';
import {heroAppearance} from '../../game/appearance';
import {totalStats} from '../../game/store';
import {BOSS_ART} from '../worldBossPreview';
export function renderWorldBoss(ui:Interface,dialog:HTMLElement):void {
  const preview=ui.worldBoss;
  const body=document.createElement('section');body.className='world-boss-content';
  body.innerHTML=`<p class="wb-subtitle">모든 모험가가 함께 맞서는 재앙</p><div class="wb-stage" aria-label="월드보스 모션 미리보기"><div class="wb-ruins"></div><div class="wb-warning" hidden></div><div class="wb-wave"></div><div class="wb-sprite" role="img" aria-label="잿불의 군주 발카론"></div><img class="wb-hero" alt="내 캐릭터"><i class="wb-hero-slash"></i><div class="wb-session"><span class="wb-clock">전투 시간 60초</span><span>연습 피해량 <b class="wb-damage">0</b></span></div><span class="wb-session-status">모션 미리보기</span></div><h3 class="wb-name">잿불의 군주 발카론</h3><div class="wb-health"><i></i><span>공유 체력 연동 준비 중</span></div><p class="wb-preview-note">화면·모션 확인용 · 참여 횟수와 보상은 소모되지 않습니다.</p>`;
  const sprite=body.querySelector<HTMLElement>('.wb-sprite')!;sprite.style.backgroundImage=`url('${BOSS_ART}')`;
  body.querySelector<HTMLImageElement>('.wb-hero')!.src=heroAppearance(ui.world.save).portrait;
  const tabs=document.createElement('div');tabs.className='wb-tabs';tabs.setAttribute('role','tablist');
  for(const [id,label] of [['challenge','도전'],['ranking','순위'],['rewards','보상']] as const){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(preview.tab===id));
    button.onclick=()=>{preview.tab=id;ui.renderModal();};tabs.append(button);
  }
  body.append(tabs);const panel=document.createElement('div');panel.className='wb-panel';panel.setAttribute('role','tabpanel');
  if(preview.tab==='challenge'){
    panel.innerHTML='<p>60초 동안 보스의 호흡·대검 횡베기·광역 내려찍기를 확인합니다.</p><p>붉은 범위 예고 후 내려찍기와 충격파가 발생합니다.</p>';
    const start=document.createElement('button');start.type='button';start.className='wb-challenge';start.textContent=preview.startedAt===undefined?'60초 전투 연습':'전투 연습 다시 시작';
    start.onclick=()=>{preview.start();ui.renderModal();};panel.append(start);
  }else if(preview.tab==='ranking')panel.innerHTML='<h4>피해량 순위</h4><p>전체 유저의 피해량 순위는 서버 연동 단계에서 제공됩니다.</p><p>현재 연습 기록은 순위에 반영되지 않습니다.</p>';
  else panel.innerHTML='<h4>월드보스 보상 안내</h4><ul><li>도전 참여 보상</li><li>누적 피해량 순위 보상</li><li>마지막 타격 추가 보상</li><li>토벌 성공 시 모든 참여자 추가 보상</li></ul><p>정식 도전은 계정당 하루 3회로 준비 중입니다. 현재 보상은 지급되지 않습니다.</p>';
  body.append(panel);dialog.append(body);
  const stats=totalStats(ui.world.save);preview.animate(body.querySelector('.wb-stage')!,stats.attack/0.48);
}
