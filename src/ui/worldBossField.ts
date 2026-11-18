import {Assets,Rectangle,Sprite,Texture} from 'pixi.js';
import {GameView} from '../game/render';
import {projectArenaPoint} from '../game/arena';
import {WorldBossRehearsal} from '../game/worldBossRehearsal';
import {totalStats} from '../game/store';
import {skills} from '../game/skills';
import {setSkillIcon} from './skillArtwork';
import {BOSS_SHEETS,bossPose,footShift} from './worldBossPreview';
import type {Interface} from './interface';
export function pauseMainForBoss(ui:Interface):()=>void {
  const wasPaused=ui.world.paused,resume=ui.suspendMainField?.();
  ui.world.paused=true;ui.world.attackHeld=false;let restored=false;
  return ()=>{if(restored)return;restored=true;ui.world.paused=wasPaused||ui.market.sync.locked||ui.market.sync.conflicted;resume?.();};
}
export function openWorldBossField(ui:Interface):void {
  if(ui.market.sync.locked||ui.market.sync.conflicted||ui.market.busy){ui.message('동기화가 끝난 뒤 도전해 주세요.');return;}
  ui.worldBossField?.();ui.open(null);
  const restoreMain=pauseMainForBoss(ui);
  const session=new WorldBossRehearsal(ui.world.save),view=new GameView();
  const field=document.createElement('section');field.className='world-boss-field';field.setAttribute('role','region');field.setAttribute('aria-label','월드보스 전용 연습 필드');
  field.innerHTML='<div class="wb-field-canvas"></div><header class="wb-field-header"><div><small>월드보스 · 전투 연습</small><h2>잿불의 군주 발카론</h2></div><button class="wb-field-leave" type="button">나가기</button><div class="wb-field-boss-hp"><i></i><span>연습용 보스 · 공유 체력 미연동</span></div><div class="wb-field-record"><strong class="wb-field-clock">60초</strong><span>누적 피해량 <b class="wb-field-damage">0</b></span></div></header><div class="wb-field-loading" role="status">전장을 준비하고 있습니다…</div><div class="wb-field-warning" hidden>광역 공격! 내려찍기를 준비합니다</div><footer class="wb-field-footer"><div class="wb-field-player-hp"><i></i><b></b></div><div class="wb-field-skills"></div><p>현재 장비·장착 스킬로 자동 전투 · 횟수와 보상은 소모되지 않습니다.</p></footer><div class="wb-field-result" hidden><h3>전투 연습 종료</h3><p></p><button type="button">보스 소개로 돌아가기</button></div>';
  ui.root.querySelector('.game-shell')!.append(field);
  const get=<T extends HTMLElement>(selector:string)=>field.querySelector<T>(selector)!;
  let closed=false,mounted=false;const ownedFrames:Texture[]=[];
  const releaseFrames=()=>{for(const frame of ownedFrames)frame.destroy(false);ownedFrames.length=0;};
  const cleanup=()=>{
    if(closed)return;closed=true;ui.worldBoss.damage=session.damage;field.remove();
    if(mounted)view.app.destroy(true,{children:true,texture:false,textureSource:false});
    releaseFrames();restoreMain();
    ui.worldBossField=undefined;
  };
  ui.worldBossField=cleanup;
  const leave=()=>{cleanup();ui.open('worldBoss');};
  get<HTMLButtonElement>('.wb-field-leave').onclick=leave;get<HTMLButtonElement>('.wb-field-result button').onclick=leave;
  field.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape')leave();});
  get<HTMLButtonElement>('.wb-field-leave').focus();
  const skillNodes=session.world.save.quickSlots.map(id=>{
    const slot=document.createElement('div');slot.className='wb-field-slot';const art=document.createElement('span');art.className='wb-field-slot-art';
    const label=document.createElement('small');label.textContent=id?skills[id].name:'빈 슬롯';const cd=document.createElement('b');
    if(id)setSkillIcon(art,id);slot.append(art,label,cd);get('.wb-field-skills').append(slot);return {id,cd};
  });
  void (async()=>{
    try{
      const sheets=await Promise.all(BOSS_SHEETS.map(path=>Assets.load<Texture>(path)));
      const frames=sheets.flatMap(sheet=>Array.from({length:8},(_,i)=>{
        const left=Math.round(i%4*sheet.width/4),top=Math.round(Math.floor(i/4)*sheet.height/2);
        return new Texture({source:sheet.source,frame:new Rectangle(left,top,Math.round((i%4+1)*sheet.width/4)-left,Math.round((Math.floor(i/4)+1)*sheet.height/2)-top)});
      }));
      ownedFrames.push(...frames);
      if(closed){releaseFrames();return;}
      await view.mount(get('.wb-field-canvas'));mounted=true;
      if(closed){view.app.destroy(true,{children:true,texture:false,textureSource:false});releaseFrames();return;}
      get('.wb-field-loading').hidden=true;
      const bossSprite=new Sprite(frames[0]);bossSprite.anchor.set(.5,.97);view.actors.addChild(bossSprite);
      let previous=performance.now();view.app.ticker.maxFPS=60;
      view.app.ticker.add(()=>{
        if(closed)return;if(!field.isConnected){cleanup();return;}
        const now=performance.now(),dt=Math.min(.05,(now-previous)/1000);previous=now;
        if(!document.hidden)session.advance(dt);
        // Targets remain present for real combat, but the default skeleton is never rendered.
        const enemies=session.world.enemies;session.world.enemies=[];
        try{view.draw(session.world,session.elapsed);}finally{session.world.enemies=enemies;}
        const pose=bossPose(session.elapsed),texture=frames[pose.frame];bossSprite.texture=texture;
        const h=view.app.screen.height,w=view.app.screen.width,[x,y]=projectArenaPoint(session.boss.x,session.boss.y,w,h);
        const size=Math.min(w*.82,h*.39);bossSprite.width=size;bossSprite.height=size;
        bossSprite.position.set(x,y+footShift(pose.frame)*size);bossSprite.tint=session.boss.hit>0?0xffd9c0:0xffffff;
        view.actors.setChildIndex(bossSprite,0);view.floor.tint=0xb57e60;
        get('.wb-field-warning').hidden=pose.motion!=='slam'||pose.impact||session.finished;
        if(pose.motion==='slam')view.ground.ellipse(x-25,y,95,38).stroke({color:pose.impact?0xffa344:0xc83024,width:pose.impact?6:2,alpha:pose.impact?.8:.45});
        get('.wb-field-clock').textContent=`${Math.ceil(60-session.elapsed)}초`;
        get('.wb-field-damage').textContent=session.damage.toLocaleString('ko-KR');
        const hp=Math.ceil(session.world.player.hp),max=totalStats(session.world.save).health;
        get('.wb-field-player-hp i').style.width=`${Math.max(0,hp/max*100)}%`;get('.wb-field-player-hp b').textContent=`HP ${hp}/${max}`;
        for(const {id,cd} of skillNodes)cd.textContent=id?(session.world.cooldown[id]>0?session.world.cooldown[id].toFixed(1):'준비'):'';
        if(session.finished){get('.wb-field-result').hidden=false;get('.wb-field-result p').textContent=`${session.defeated?'전투 불능 · ':''}누적 피해량 ${session.damage.toLocaleString('ko-KR')} · 연습 기록은 저장되지 않습니다.`;}
      });
    }catch(error){if(!closed){get('.wb-field-loading').textContent='전장을 불러오지 못했습니다. 나갔다가 다시 도전해 주세요.';ui.message(error instanceof Error?error.message:String(error));}}
  })();
}
