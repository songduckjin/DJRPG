import { DUNGEON_MAX_FLOOR } from './dungeonLobby';
import {Assets} from 'pixi.js';
import {GameView} from '../game/render';
import {projectArenaPoint} from '../game/arena';
import {totalStats} from '../game/store';
import {skills} from '../game/skills';
import {equipmentImage,isSkillBook,type Rarity} from '../game/items';
import {DungeonBattle,dungeonLootSpots,dungeonLootTimeline,dungeonAbsorbProgress,type DungeonLoot,type LootSpot} from './dungeonBattle';
import {heroBodyFraction} from '../game/render/heroScale';
import {setSkillIcon} from './skillArtwork';
import {createSkillBookArt} from './skillBookArt';
import type {Interface} from './interface';

export function openDungeonField(ui:Interface,lobby:HTMLElement):void {
  if(ui.market.sync.locked||ui.market.sync.conflicted||ui.market.busy){ui.message('동기화가 끝난 뒤 도전해 주세요.');return;}
  if(ui.root.querySelector('.dungeon-field')||ui.dungeon.completed)return;
  const lobbyRoot=lobby.querySelector<HTMLElement>('.dungeon-lobby')!;
  lobbyRoot.classList.add('is-opening');
  lobbyRoot.querySelectorAll<HTMLButtonElement>('button:not(.dungeon-close)').forEach(button=>button.disabled=true);
  const doorOpened=new Promise<void>(resolve=>window.setTimeout(resolve,1800));
  const wasPaused=ui.world.paused,resume=ui.suspendMainField?.();ui.world.paused=true;ui.world.attackHeld=false;
  const field=document.createElement('section');field.className='dungeon-field';field.setAttribute('role','region');field.setAttribute('aria-label','끝없는 던전 1층 미리보기');
  field.innerHTML=`<div class="dungeon-field-canvas"></div><div class="dungeon-loot-layer is-behind" aria-hidden="true"></div><div class="dungeon-loot-layer" aria-hidden="true"></div><div class="dungeon-exit-gate" aria-label="다음 층으로 이어지는 철문"><div class="dungeon-lobby-gate"><i class="dungeon-lobby-gate-dark"></i><img class="dungeon-gate-left" src="/assets/dungeon/gate-left-v1.png" alt=""><img class="dungeon-gate-right" src="/assets/dungeon/gate-right-v1.png" alt=""><img class="dungeon-gate-frame" src="/assets/dungeon/gate-frame-v1.png" alt=""></div></div><header class="dungeon-field-hud"><div><small>끝없는 던전</small><strong>제 1 층</strong></div><button type="button" class="dungeon-field-leave">나가기</button></header><footer class="dungeon-battle-hud"><div class="dungeon-battle-record"><strong data-clock>90초</strong><span data-wave>WAVE 1 / 3</span><span data-kills>처치 0 / 7</span></div><div class="dungeon-hp"><i></i><span></span></div><div class="dungeon-auto-skills"></div><small>자동 전투 · 1~10층 미리보기 · 드롭 50% 테스트 · 보상/기록 미반영</small></footer><div class="dungeon-battle-result" hidden></div><div class="dungeon-floor-transition" aria-hidden="true"></div>`;
  ui.root.querySelector('.game-shell')!.append(field);
  const get=<T extends HTMLElement>(s:string)=>field.querySelector<T>(s)!;
  const view=new GameView();let battle=new DungeonBattle(ui.world.save,ui.dungeon.floor.floor),closed=false,mounted=false,age=0,visualTime=0,finishAge=0,resultShown=false;
  // Ground loot is DOM on top of the transparent arena canvas: the shared field renderer keeps
  // drawing only the arena, so drops stay inside the isolated dungeon UI files.
  const lootLayer=get('.dungeon-loot-layer:not(.is-behind)'),backLootLayer=get('.dungeon-loot-layer.is-behind');
  // Grade colours are pushed to full saturation: an equipment drop has to read as its grade at a
  // glance, while gold and skill books carry no outer light at all.
  const rarityInk:Record<Rarity,string>={common:'#cdd6e0',magic:'#2f7bff',rare:'#ffd400',epic:'#a855f7',unique:'#ff8a00',legendary:'#ff2d2d'};
  type LootView={el:HTMLDivElement;body:HTMLDivElement;shadow:HTMLSpanElement;x:number;y:number;tx:number;ty:number;drift:number;h:number;vh:number;spin:number;spinV:number;settled:boolean;done:boolean};
  let lootViews:LootView[]=[],restSpots:LootSpot[]=[],spawnedLoot=0,absorbStarted=false,absorbRing:HTMLDivElement|undefined;
  // One timeline owns the clear beat: hold on the ground, pull every drop in, then show the result.
  const timeline=()=>dungeonLootTimeline(battle.outcome,battle.world.loot.length);
  const LOOT_GAP=36;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spawnLoot=(loot:DungeonLoot):void=>{
    const el=document.createElement('div'),body=document.createElement('div'),shadow=document.createElement('span');
    el.className='dungeon-loot';body.className='dungeon-loot-body';shadow.className='dungeon-loot-shadow';
    if(loot.kind==='gold'){
      el.classList.add('is-gold');
      const coin=document.createElement('img');coin.className='dungeon-loot-coin';coin.src='/assets/icons/gold-coin.png';coin.alt='';
      body.append(coin);
    }else{
      const item=loot.item;el.classList.add('is-item');el.style.setProperty('--loot-ink',rarityInk[item.rarity]);
      if(isSkillBook(item)){const art=createSkillBookArt(item);art.classList.add('dungeon-loot-book');body.append(art);}
      else{const art=equipmentImage(item);
        if(art.columns>1){const atlas=document.createElement('span');atlas.className='dungeon-loot-art atlas-icon';atlas.style.backgroundImage=`url("${art.path}")`;atlas.style.backgroundPosition=`${art.frame/(art.columns-1)*100}% center`;body.append(atlas);}
        else{const img=document.createElement('img');img.className='dungeon-loot-art';img.src=art.path;img.alt='';body.append(img);}
      }
    }
    // A kill lands almost on top of the hero, so the drop keeps its own death point unless that
    // point is inside the character: then it is pulled straight out along the same line until it
    // clears the art, inside the fan, and only far enough apart from other drops not to overlap.
    const w=view.app.screen.width,h=view.app.screen.height,[heroX,heroY]=projectArenaPoint(battle.world.player.x,battle.world.player.y,w,h),[gx,gy]=projectArenaPoint(loot.x,loot.y,w,h);
    const heroH=Math.max(48,h*heroBodyFraction),[spot]=dungeonLootSpots(heroX,heroY,[{x:gx,y:gy}],restSpots,Math.max(40,heroH*.5),heroH+8,LOOT_GAP),tx=spot.x-gx,ty=spot.y-gy;
    el.append(shadow,body);
    // Depth: loot that rests behind the hero's feet stays under the transparent arena canvas, loot
    // in front of them is drawn over the floor. Neither ever sits on the hero art.
    (gy+ty<heroY-6?backLootLayer:lootLayer).append(el);
    lootViews.push({el,body,shadow,x:loot.x,y:loot.y,tx,ty,drift:reducedMotion?1:0,h:reducedMotion?0:2,vh:reducedMotion?0:110+Math.random()*70,spin:0,spinV:reducedMotion?0:(Math.random()-.5)*240,settled:false,done:false});
  };
  const clearLoot=():void=>{for(const entry of lootViews)entry.el.remove();lootViews=[];restSpots=[];spawnedLoot=0;absorbStarted=false;absorbRing?.remove();absorbRing=undefined;};
  // Bounce until resting; on a clear the same nodes are pulled in an accelerating arc into the hero.
  const updateLoot=(dt:number):void=>{
    if(closed)return;
    while(spawnedLoot<battle.world.loot.length)spawnLoot(battle.world.loot[spawnedLoot++]);
    const w=view.app.screen.width,h=view.app.screen.height;
    const [heroX,heroY]=projectArenaPoint(battle.world.player.x,battle.world.player.y,w,h);
    if(!absorbStarted&&battle.outcome==='clear'&&finishAge>=timeline().absorbAt){
      absorbStarted=true;
      absorbRing=document.createElement('div');absorbRing.className='dungeon-absorb-ring';
      absorbRing.style.left=`${heroX}px`;absorbRing.style.top=`${heroY-26}px`;lootLayer.append(absorbRing);
    }
    for(const [index,entry] of lootViews.entries()){
      if(entry.done)continue;
      entry.drift=Math.min(1,entry.drift+dt/.45);
      const [groundX,groundY]=projectArenaPoint(entry.x,entry.y,w,h),ease=1-Math.pow(1-entry.drift,3),x=groundX+entry.tx*ease,y=groundY+entry.ty*ease;
      if(absorbStarted){
        entry.el.classList.remove('is-resting');
        const p=dungeonAbsorbProgress(finishAge,index);
        if(p>=1){entry.done=true;entry.el.remove();continue;}
        const k=p*p;
        entry.el.style.transform=`translate3d(${x+(heroX-x)*k+Math.sin(Math.PI*p)*10*(index%2?1:-1)}px,${y-entry.h+(heroY-26-(y-entry.h))*k}px,0)`;
        entry.body.style.transform=`translate(-50%,-100%) rotate(${entry.spin+p*220}deg) scale(${1-.55*k})`;
        entry.body.style.opacity=String(1-p*.9);entry.shadow.style.opacity=String(.45*(1-p));
        continue;
      }
      if(!entry.settled){
        entry.h+=entry.vh*dt;entry.vh-=1200*dt;
        entry.spin+=entry.spinV*dt;entry.spinV*=Math.exp(-dt*2.2);
        if(entry.h<=0){entry.h=0;
          if(entry.vh<-70){entry.vh=-entry.vh*.42;entry.spinV*=.5;}
          else{entry.vh=0;entry.settled=true;entry.el.classList.add('is-resting');}
        }
      }
      entry.el.style.transform=`translate3d(${x}px,${y}px,0)`;
      entry.body.style.transform=`translate(-50%,-100%) translateY(${-entry.h}px) rotate(${entry.spin}deg)`;
      const lift=Math.min(1,entry.h/150);
      entry.shadow.style.transform=`translate(-50%,-50%) scale(${1-lift*.55})`;
      entry.shadow.style.opacity=String(.5-lift*.3);
    }
  };
  // Canvas alpha is fixed at context creation; changing it after mount cannot
  // reveal the CSS chamber/door behind an opaque context (Pixi BackgroundSystem).
  const initialize=view.app.init.bind(view.app);
  view.app.init=options=>initialize({...options,background:0x000000,backgroundColor:0x000000,backgroundAlpha:0});
  let destroyPending=false;
  const observer=new MutationObserver(()=>{if(ui.openModal!=='dungeon'||!lobbyRoot.isConnected)cleanup();});
  observer.observe(ui.modal,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});
  const cleanup=()=>{if(closed)return;closed=true;observer.disconnect();lobbyRoot.classList.remove('is-opening');lobbyRoot.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=false);field.remove();if(mounted)view.app.destroy(true,{children:true,texture:false,textureSource:false});else destroyPending=true;ui.world.paused=wasPaused||ui.market.sync.locked||ui.market.sync.conflicted;resume?.();};
  const leave=()=>{cleanup();ui.open('dungeon');};get<HTMLButtonElement>('.dungeon-field-leave').onclick=leave;
  field.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')leave();});get<HTMLButtonElement>('.dungeon-field-leave').focus();
  for(const id of battle.world.save.quickSlots){const slot=document.createElement('div');slot.className='dungeon-auto-skill';if(id){const icon=document.createElement('i');setSkillIcon(icon,id);slot.append(icon);const name=document.createElement('span');name.textContent=skills[id].name;slot.append(name);}else slot.textContent='빈 슬롯';get('.dungeon-auto-skills').append(slot);}
  const resetBattle=(floor:number)=>{
    const gate=get('.dungeon-exit-gate');gate.classList.add('is-resetting');gate.classList.remove('is-opening');
    void gate.offsetWidth;gate.classList.remove('is-resetting');
    for(const sprite of view.enemies.values())sprite.destroy();view.enemies.clear();view.enemyWalkDistance.clear();
    for(const corpse of view.corpses)corpse.sprite.destroy();view.corpses=[];
    for(const label of view.damageLabels.values())label.destroy();view.damageLabels.clear();
    battle=new DungeonBattle(ui.world.save,floor);clearLoot();finishAge=0;age=0;resultShown=false;
    get('.dungeon-battle-result').hidden=true;
    get('.dungeon-field-hud strong').textContent=`제 ${floor} 층`;
    field.setAttribute('aria-label',`끝없는 던전 ${floor}층 미리보기`);
  };
  const result=()=>{resultShown=true;absorbRing?.remove();absorbRing=undefined;const floor=battle.floor,canNext=battle.outcome==='clear'&&floor<DUNGEON_MAX_FLOOR;
    if(battle.outcome==='clear')ui.dungeon.clearedFloor=Math.max(ui.dungeon.clearedFloor,floor);
    const box=get('.dungeon-battle-result');box.hidden=false;
    // A clear reports the gold this floor actually left on the ground and pulled in, not its clock.
    const record=battle.outcome==='clear'?`<p class="dungeon-result-gold"><img src="/assets/icons/gold-coin.png" alt="">획득 금화 <strong>${battle.world.lootGold}</strong></p>`:`<p>처치 ${battle.world.slain} / ${battle.targetCount} · ${Math.ceil(battle.elapsed)}초</p>`;
    box.innerHTML=`<div><small>끝없는 던전 · 제${floor}층</small><h2>${battle.outcome==='clear'?`${floor}층 클리어`:battle.outcome==='dead'?'도전에 실패했습니다':'시간이 종료되었습니다'}</h2>${record}<p>${canNext?`열린 길을 따라 ${floor+1}층으로 이동할 수 있습니다.`:battle.outcome==='clear'?'10층 정복을 완료했습니다.':'재도전하면 체력과 제한 시간이 초기화됩니다.'}</p>${canNext?`<button type="button" data-next>다음 층으로 · ${floor+1}층</button>`:''}${battle.outcome!=='clear'?'<button type="button" data-retry>다시 도전하기</button>':''}<button type="button" data-leave>나가기</button><small>미리보기 · 실제 보상과 순위는 반영되지 않습니다.</small></div>`;
    const retry=field.querySelector<HTMLButtonElement>('[data-retry]');if(retry)retry.onclick=()=>resetBattle(floor);
    get<HTMLButtonElement>('[data-leave]').onclick=leave;
    if(canNext)get<HTMLButtonElement>('[data-next]').onclick=()=>{
      box.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);
      box.hidden=true;
      const gate=get('.dungeon-exit-gate');gate.classList.add('is-opening');

      window.setTimeout(()=>{if(closed)return;field.classList.add('is-changing-floor');
        window.setTimeout(()=>{if(closed)return;resetBattle(floor+1);gate.classList.remove('is-opening');
          window.setTimeout(()=>{if(!closed)field.classList.remove('is-changing-floor');},100);
        },400);
      },1800);
    };
  };
  void (async()=>{try{
    await Assets.load('/assets/dungeon/prison-room-v2.png');if(closed)return;
    await view.mount(get('.dungeon-field-canvas'));mounted=true;if(closed||destroyPending){view.app.destroy(true,{children:true,texture:false,textureSource:false});return;}
    await doorOpened;if(closed)return;observer.disconnect();
    view.app.renderer.background.color=0x000000;view.app.renderer.background.alpha=0;
    for(const layer of [view.floor,view.terrainLayer,view.ambientLayer,view.glow,view.shade])layer.visible=false;
    view.drawTerrain=()=>{};view.drawDust=()=>{};view.drawRunes=()=>{};
    // Render a complete frame before exposing the canvas. Keep the lobby underneath
    // throughout the fade so neither main hunting nor the renderer's clear color flashes.
    view.draw(battle.world,0);view.app.renderer.render(view.app.stage);
    requestAnimationFrame(()=>{if(closed)return;field.classList.add('is-ready');get<HTMLButtonElement>('.dungeon-field-leave').focus();
      window.setTimeout(()=>{if(!closed&&ui.openModal==='dungeon')ui.open(null);},650);
    });
    get('.dungeon-field-hud strong').textContent=`제 ${battle.floor} 층`;
    let previous=performance.now();
    view.app.ticker.add(()=>{if(closed)return;const now=performance.now(),dt=document.hidden?0:Math.min(.05,(now-previous)/1000);previous=now;age+=dt;
      visualTime+=dt;
      if(age>.65&&!battle.finished)battle.advance(dt);
      if(battle.finished){
        finishAge+=dt;battle.world.attackPose=Math.max(0,battle.world.attackPose-dt);
        battle.world.effects=battle.world.effects.filter(effect=>{effect.age+=dt;return effect.age<effect.duration;});
      }
      updateLoot(dt);
      view.draw(battle.world,visualTime);
      // Preserve the existing skeletal art; the elite is the same soldier at larger scale.
      if(battle.elite&&!battle.elite.boss){const sprite=view.enemies.get(battle.elite);if(sprite){sprite.scale.x*=1.35;sprite.scale.y*=1.35;sprite.tint=0xdcc4a1;}}
      const hp=battle.world.player.hp,max=totalStats(battle.world.save).health;
      get('.dungeon-hp i').style.width=`${hp/max*100}%`;get('.dungeon-hp span').textContent=`HP ${Math.ceil(hp)} / ${max}`;
      get('[data-clock]').textContent=`${Math.ceil(90-battle.elapsed)}초`;get('[data-wave]').textContent=battle.bossFloor?'보스전':`WAVE ${battle.wave} / 3`;get('[data-kills]').textContent=`처치 ${battle.world.slain} / ${battle.targetCount}`;
      if(battle.finished&&finishAge>=timeline().resultAt&&!resultShown)result();
    });
  }catch(error){if(closed)return;cleanup();ui.message(`전장 로딩 실패: ${error instanceof Error?error.message:String(error)}`);}})();

}
