import {renderBossResult} from './worldBossResult';
import {bannerOffset,cloudCenter} from './worldBossWeather';
import {preferences} from '../game/preferences';
import {slamParticles} from './worldBossImpact';
import {WorldBossIntro} from './worldBossIntro';
import {Assets,ColorMatrixFilter,Graphics,MeshPlane,Rectangle,Sprite,Texture} from 'pixi.js';
import {GameView} from '../game/render';
import {projectArenaPoint} from '../game/arena';
import {WorldBossRehearsal} from '../game/worldBossRehearsal';
import {totalStats} from '../game/store';
import {skills} from '../game/skills';
import {setSkillIcon} from './skillArtwork';
import {BOSS_SHEETS,bossPose,footShift,slamImpactAge} from './worldBossPreview';
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
  const session=new WorldBossRehearsal(ui.world.save),view=new GameView(),intro=new WorldBossIntro();
  const field=document.createElement('section');field.className='world-boss-field';field.setAttribute('role','region');field.setAttribute('aria-label','월드보스 전용 연습 필드');
  field.innerHTML='<div class="wb-field-canvas"></div><header class="wb-field-header"><button class="wb-field-leave" type="button">나가기</button></header><div class="wb-battle-start" hidden>전투 시작</div><div class="wb-field-loading" role="status">전장을 준비하고 있습니다…</div><div class="wb-field-warning" hidden>광역 공격! 내려찍기를 준비합니다</div><footer class="wb-field-footer"><div class="wb-field-record"><strong class="wb-field-clock">60초</strong><span>누적 피해량 <b class="wb-field-damage">0</b></span></div><div class="wb-field-health-label">잿불의 군주 발카론 <small>보스 · 연습용</small></div><div class="wb-field-boss-hp"><i></i><span>공유 체력 미연동</span></div><div class="wb-field-health-label wb-player-label">내 체력 <b class="wb-player-value"></b></div><div class="wb-field-player-hp"><i></i><b></b></div><div class="wb-field-controls"><div><small class="wb-auto-label">메인 장착 스킬 · 자동 사용</small><div class="wb-field-skills"></div></div><button class="wb-field-dodge" type="button"><span aria-hidden="true">↝</span><small>회피</small><b class="wb-dodge-cd"></b></button></div><p>60초 전투 연습 · 실제 도전 횟수와 보상은 소모되지 않습니다.</p></footer><div class="wb-field-result" hidden></div>' ;
  ui.root.querySelector('.game-shell')!.append(field);
  const get=<T extends HTMLElement>(selector:string)=>field.querySelector<T>(selector)!;
  let closed=false,mounted=false,resultShown=false;const ownedFrames:Texture[]=[];const cleanedFrames=new Set<Texture>();const ownedTones:ColorMatrixFilter[]=[];
  const releaseFrames=()=>{for(const frame of ownedFrames)frame.destroy(cleanedFrames.has(frame));ownedFrames.length=0;cleanedFrames.clear();for(const filter of ownedTones)filter.destroy();ownedTones.length=0;};
  const cleanup=()=>{
    if(closed)return;closed=true;ui.worldBoss.damage=session.damage;field.remove();
    if(mounted)view.app.destroy(true,{children:true,texture:false,textureSource:false});
    releaseFrames();restoreMain();
    ui.worldBossField=undefined;
  };
  ui.worldBossField=cleanup;
  const leave=()=>{cleanup();ui.open('worldBoss');};
  get<HTMLButtonElement>('.wb-field-leave').onclick=leave;
  get<HTMLButtonElement>('.wb-field-dodge').onclick=()=>{if(!intro.active)session.dodge();};
  field.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape')leave();});
  get<HTMLButtonElement>('.wb-field-leave').focus();
  const skillNodes=session.world.save.quickSlots.map(id=>{
    const slot=document.createElement('div');slot.className='wb-field-slot';const art=document.createElement('span');art.className='wb-field-slot-art';
    const label=document.createElement('small');label.textContent=id?skills[id].name:'빈 슬롯';const cd=document.createElement('b');
    if(id)setSkillIcon(art,id);slot.append(art,label,cd);get('.wb-field-skills').append(slot);return {id,cd};
  });
  void (async()=>{
    try{
      const [sheets,arena]=await Promise.all([Promise.all([...BOSS_SHEETS,'/assets/world-boss/valkaron-roar-hd-v1.png'].map(path=>Assets.load<Texture>(path))),Assets.load<Texture>('/assets/world-boss/obsidian-arena-v1.png')]);
      const frames=sheets.flatMap(sheet=>Array.from({length:8},(_,i)=>{
        const left=Math.round(i%4*sheet.width/4),top=Math.round(Math.floor(i/4)*sheet.height/2);
        return new Texture({source:sheet.source,frame:new Rectangle(left,top,Math.round((i%4+1)*sheet.width/4)-left,Math.round((Math.floor(i/4)+1)*sheet.height/2)-top)});
      }));
      // Sheet frame 3 contains a detached blade fragment from the neighboring cell.
      const raw=frames[11],canvas=document.createElement('canvas'),rect=raw.frame;
      canvas.width=rect.width;canvas.height=rect.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(ctx){ctx.drawImage(raw.source.resource as CanvasImageSource,rect.x,rect.y,rect.width,rect.height,0,0,canvas.width,canvas.height);
        const data=ctx.getImageData(0,0,canvas.width,canvas.height);retainMainBody(data.data,canvas.width,canvas.height);ctx.putImageData(data,0,0);
        const cleaned=Texture.from(canvas);frames[11]=cleaned;cleanedFrames.add(cleaned);raw.destroy(false);
      }
      ownedFrames.push(...frames);
      if(closed){releaseFrames();return;}
      await view.mount(get('.wb-field-canvas'));mounted=true;
      if(closed){view.app.destroy(true,{children:true,texture:false,textureSource:false});releaseFrames();return;}
      const arenaSprite=new MeshPlane({texture:arena,verticesX:72,verticesY:120});view.app.stage.addChildAt(arenaSprite,0);
      const flagBuffer=arenaSprite.geometry.getAttribute('aPosition').buffer,flagBase=new Float32Array(flagBuffer.data as Float32Array);
      const flagCanvas=document.createElement('canvas');flagCanvas.width=arena.width;flagCanvas.height=arena.height;
      const flagContext=flagCanvas.getContext('2d',{willReadFrequently:true});
      flagContext?.drawImage(arena.source.resource as CanvasImageSource,0,0);
      const flagPixels=flagContext?.getImageData(0,0,arena.width,arena.height).data;
      const flagVertices:number[]=[];
      for(let i=0;i<flagBase.length;i+=2){
        const x=flagBase[i],y=flagBase[i+1],p=(Math.min(arena.height-1,Math.round(y))*arena.width+Math.min(arena.width-1,Math.round(x)))*4;
        if(flagPixels&&flagPixels[p]>flagPixels[p+1]*1.3&&flagPixels[p]>25&&flagPixels[p+1]<100&&(bannerOffset(x/arena.width,y/arena.height,0).x!==0))flagVertices.push(i);
      }
      const reduceWeather=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const clouds=new Graphics();view.app.stage.addChildAt(clouds,1);
      const tones=frames.map(frame=>bossFrameTone(frame));ownedTones.push(...tones);
      get('.wb-field-loading').hidden=true;
      const bossSprite=new Sprite(frames[0]);bossSprite.anchor.set(.5,.97);view.actors.addChild(bossSprite);
      let previous=performance.now();view.app.ticker.maxFPS=60;
      view.app.ticker.add(()=>{
        if(closed)return;if(!field.isConnected){cleanup();return;}
        const now=performance.now(),dt=Math.min(.05,(now-previous)/1000);previous=now;
        if(!document.hidden){const combatDt=intro.advance(dt);if(combatDt>0)session.advance(combatDt);}
          get('.wb-battle-start').hidden=!intro.startCue;
        get('.wb-battle-start').style.opacity=String(intro.cueOpacity);

        const visualTime=intro.elapsed+session.elapsed;
        if(!reduceWeather){const vertices=flagBuffer.data as Float32Array;
          for(const i of flagVertices){const offset=bannerOffset(flagBase[i]/arena.width,flagBase[i+1]/arena.height,visualTime);vertices[i]=flagBase[i]+offset.x;vertices[i+1]=flagBase[i+1]+offset.y;}flagBuffer.update();
        }
        // Targets remain present for real combat, but the default skeleton is never rendered.
        const enemies=session.world.enemies;session.world.enemies=[];
        try{view.draw(session.world,visualTime);}finally{session.world.enemies=enemies;}
        const pose=bossPose(session.elapsed),shownFrame=intro.active?intro.frame:pose.frame,texture=frames[shownFrame];bossSprite.texture=texture;bossSprite.filters=[tones[shownFrame]];
        const h=view.app.screen.height,w=view.app.screen.width,[x,y]=projectArenaPoint(session.boss.x,session.boss.y,w,h);
        const size=Math.min(w*.82,h*.39);bossSprite.width=size;bossSprite.height=size;
        bossSprite.position.set(x,y+(intro.active?intro.footShift:footShift(pose.frame))*size);bossSprite.tint=0xffffff;
        view.actors.setChildIndex(bossSprite,0);
        // Only this dedicated view hides the regular field scenery.
        view.floor.visible=false;view.terrainLayer.visible=false;view.glow.visible=false;view.shade.visible=false;
        view.heroLayer.visible=true;view.heroLayer.alpha=1;
        view.app.stage.scale.set(1);view.app.stage.position.y+=h*.07;
        const cover=Math.max(w/arena.width,h/arena.height);arenaSprite.scale.set(cover);
        arenaSprite.position.set((w-arena.width*cover)/2,(h-arena.height*cover)/2-h*.07);
        const dodge=get<HTMLButtonElement>('.wb-field-dodge');dodge.disabled=intro.active||session.finished||session.dodgeCooldown>0;
        get('.wb-dodge-cd').textContent=session.dodgeCooldown>0?session.dodgeCooldown.toFixed(1):'';
        get('.wb-field-warning').hidden=intro.active||pose.motion!=='slam'||pose.frame>=31||session.finished;
        // Cloud graphics live between the arena and actors, never above the boss.
        clouds.clear();clouds.position.set(0,-h*.07);
        for(let i=0;i<5;i++)for(let layer=7;layer>0;layer--){
          clouds.ellipse(cloudCenter(i,reduceWeather?0:visualTime,w),h*(.06+(i%2)*.07),w*(.12+layer*.025),h*(.025+layer*.009)).fill({color:0x9b969e,alpha:.015});
        }
        if(!intro.active&&pose.motion==='slam'&&pose.frame<31)view.ground.ellipse(x-25,y,95,38).stroke({color:0xb7674f,width:1.2,alpha:.24});
        const impactAge=slamImpactAge(session.elapsed);
        if(!intro.active&&impactAge!==null){
          drawSlamImpact(view.ground,view.effects,x-25,y,impactAge);
          if(preferences.shake&&impactAge<.2)view.app.stage.position.y+=Math.sin(impactAge*85)*4*(1-impactAge/.2);
        }
        get('.wb-field-clock').textContent=`${Math.ceil(60-session.elapsed)}초`;
        get('.wb-field-damage').textContent=session.damage.toLocaleString('ko-KR');
        const hp=Math.ceil(session.world.player.hp),max=totalStats(session.world.save).health;
        get('.wb-field-player-hp i').style.width=`${Math.max(0,hp/max*100)}%`;get('.wb-player-value').textContent=`${hp} / ${max}`;
        for(const {id,cd} of skillNodes)cd.textContent=id?(session.world.cooldown[id]>0?session.world.cooldown[id].toFixed(1):'준비'):'';
        if(session.finished&&!resultShown){
          resultShown=true;const result=get('.wb-field-result');result.hidden=false;
          renderBossResult(result,ui.worldBoss.standing,session.damage,{
            retry:()=>{if(ui.market.sync.locked||ui.market.sync.conflicted||ui.market.busy){ui.message('동기화가 끝난 뒤 도전해 주세요.');return;}cleanup();openWorldBossField(ui);},
            leave:()=>{cleanup();ui.open(null);}
          });
          result.querySelector<HTMLButtonElement>('.wb-result-actions button')?.focus();view.app.ticker.stop();
        }
      });
    }catch(error){if(!closed){get('.wb-field-loading').textContent='전장을 불러오지 못했습니다. 나갔다가 다시 도전해 주세요.';ui.message(error instanceof Error?error.message:String(error));}}
  })();
}

export function bossFrameTone(frame:Texture):ColorMatrixFilter {
  const filter=new ColorMatrixFilter();
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return filter;
  const f=frame.frame;
  ctx.drawImage(frame.source.resource as CanvasImageSource,f.x,f.y,f.width,f.height,0,0,96,96);
  const pixels=ctx.getImageData(0,0,96,96).data,channels:number[][]=[[],[],[]];
  for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2],mean=(r+g+b)/3;
    if(pixels[i+3]<240||mean<25||mean>185||Math.max(r,g,b)-Math.min(r,g,b)>65)continue;
    channels[0].push(r);channels[1].push(g);channels[2].push(b);
  }
  const targets=[77,54,46],gain=channels.map((values,i)=>{values.sort((a,b)=>a-b);return values.length?Math.max(.7,Math.min(1.3,targets[i]/Math.max(1,values[Math.floor(values.length/2)]))):1;});
  filter.matrix=[gain[0],0,0,0,0,0,gain[1],0,0,0,0,0,gain[2],0,0,0,0,0,1,0];return filter;
}

export function drawSlamImpact(ground:Graphics,debris:Graphics,x:number,y:number,age:number):void {
  const {rocks,dust}=slamParticles(age);
  if(age<.18){
    const fade=1-age/.18;
    ground.ellipse(x,y,22+age*170,8+age*60).fill({color:0xc3b19a,alpha:fade*.32});
    ground.ellipse(x,y,20+age*360,7+age*125).stroke({color:0xb8aa97,width:4*fade,alpha:fade*.65});
  }
  for(const p of rocks){
    ground.ellipse(x+p.x,y+p.groundY,p.size*1.1,p.size*.35).fill({color:0x100e12,alpha:p.alpha*.3});
    const points:number[]=[];
    for(let j=0;j<5;j++){const a=p.angle+j*Math.PI*2/5,r=p.size*(j%2?.78:1);points.push(x+p.x+Math.cos(a)*r,y+p.y+Math.sin(a)*r);}
    debris.poly(points).fill({color:0x3b3432,alpha:p.alpha});
    debris.poly([points[0],points[1],points[2],points[3],x+p.x,y+p.y]).fill({color:0xa1937e,alpha:p.alpha*.9});
  }
  for(const p of dust){
    // Soft concentric puffs stay low; visible expansion and drift sell the displaced ground.
    for(let layer=3;layer>0;layer--)debris.ellipse(x+p.x,y+p.y,p.rx*layer/3,p.ry*layer/3).fill({color:layer===1?0xa99a85:0x756c61,alpha:p.alpha*(layer===3?.3:.45)});
  }
}

export function retainMainBody(pixels:Uint8ClampedArray,width:number,height:number):void {
  const labels=new Int32Array(width*height),stack:number[]=[],sizes=[0];let component=0;
  for(let start=0;start<labels.length;start++){
    if(labels[start]||pixels[start*4+3]<=12)continue;
    component++;sizes[component]=0;stack.push(start);labels[start]=component;
    while(stack.length){const pos=stack.pop()!;sizes[component]++;const x=pos%width;
      for(const next of [x>0?pos-1:-1,x<width-1?pos+1:-1,pos-width,pos+width]){
        if(next<0||next>=labels.length||labels[next]||pixels[next*4+3]<=12)continue;
        labels[next]=component;stack.push(next);
      }
    }
  }
  const largest=Math.max(0,...sizes);
  for(let i=0;i<labels.length;i++)if(sizes[labels[i]]<largest*.02)pixels[i*4+3]=0;
}
