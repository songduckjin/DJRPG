import { DUNGEON_MAX_FLOOR } from './dungeonLobby';
import { addBossKill, dungeonBossKills } from '../game/bossCount';
import {Assets} from 'pixi.js';
import {GameView} from '../game/render';
import {projectArenaPoint} from '../game/arena';
import {totalStats} from '../game/store';
import {skills} from '../game/skills';
import {cooldowns} from '../game/world';
import {equipmentImage,isEquipment,isStatBook,type Rarity} from '../game/items';
import {DungeonBattle,DUNGEON_STEP,dungeonBattleSummary,dungeonLootSpots,dungeonLootTimeline,dungeonAbsorbProgress,dungeonAbsorbPoint,type DungeonLoot,type LootDrop,type LootField} from '../game/dungeon/battle';
import {claimDungeonRewards,type DungeonRewardReceipt} from '../game/dungeonRewards';
import {dungeonClearedFloor} from '../game/dungeonProgress';
import {dungeonRewardMarkup} from './dungeonRewardMarkup';
import {randomSeed} from '../game/rng';
import {heroBodyFraction} from '../game/render/heroScale';
import {GOLD_COIN_CHIP_DROP,GOLD_PILE,GOLD_PILE_RX,GOLD_PILE_RY,goldCoinChipHeight,goldCoinChipWidth,goldCoinHeight} from '../game/render/goldPile';
import {goldCoinChipUrl,warmGoldCoinChips} from '../game/render/goldCoinArt';
import {setSkillIcon} from './skillArtwork';
import type {Interface} from './interface';

export function openDungeonField(ui:Interface,lobby:HTMLElement):void {
  if(ui.market.sync.locked||ui.market.sync.conflicted||ui.market.busy){ui.message('동기화가 끝난 뒤 도전해 주세요.');return;}
  if(ui.root.querySelector('.dungeon-field')||ui.dungeon.completed)return;
  const lobbyRoot=lobby.querySelector<HTMLElement>('.dungeon-lobby')!;
  lobbyRoot.classList.add('is-opening');
  lobbyRoot.querySelectorAll<HTMLButtonElement>('button:not(.dungeon-close)').forEach(button=>button.disabled=true);
  const doorOpened=new Promise<void>(resolve=>window.setTimeout(resolve,1800));
  const wasPaused=ui.world.paused,resume=ui.suspendMainField?.();ui.world.paused=true;ui.world.attackHeld=false;
  const field=document.createElement('section');field.className='dungeon-field';field.setAttribute('role','region');field.setAttribute('aria-label','끝없는 던전 도전');
  field.innerHTML=`<div class="dungeon-field-canvas"></div><div class="dungeon-loot-layer is-behind" aria-hidden="true"></div><div class="dungeon-loot-layer" aria-hidden="true"></div><div class="dungeon-exit-gate" aria-label="다음 층으로 이어지는 철문"><div class="dungeon-lobby-gate"><i class="dungeon-lobby-gate-dark"></i><img class="dungeon-gate-left" src="/assets/dungeon/gate-left-v1.png" alt=""><img class="dungeon-gate-right" src="/assets/dungeon/gate-right-v1.png" alt=""><img class="dungeon-gate-frame" src="/assets/dungeon/gate-frame-v1.png" alt=""></div></div><header class="dungeon-field-hud"><div><small>끝없는 던전</small><strong>제 1 층</strong></div><button type="button" class="dungeon-field-leave">나가기</button></header><footer class="dungeon-battle-hud"><div class="dungeon-battle-record"><strong data-clock>90초</strong><span data-wave>WAVE 1 / 3</span><span data-kills>처치 0 / 7</span></div><div class="dungeon-hp"><i></i><span></span></div><div class="dungeon-auto-skills"></div><small>자동 전투 · 1~${DUNGEON_MAX_FLOOR}층 · 클리어하면 처치 금화·강화석·떨어진 아이템을 그대로 받습니다</small></footer><div class="dungeon-battle-result" hidden></div><div class="dungeon-floor-transition" aria-hidden="true"></div>`;
  ui.root.querySelector('.game-shell')!.append(field);
  const get=<T extends HTMLElement>(s:string)=>field.querySelector<T>(s)!;
  const view=new GameView();let battle!:DungeonBattle,closed=false,mounted=false,age=0,visualTime=0,finishAge=0,resultShown=false,pendingStep=0,starting=false;
  // 서버가 준 시드로 전투를 시작한다(작업 211). 서버는 같은 시드·같은 고정 스텝으로 다시 돌려 클리어를 확인한다.
  // 게스트이거나 `start`가 실패하면 로컬 시드로 돈다 — 그 판은 서버 기록으로 올라가지 않는다.
  const createBattle=async(floor:number):Promise<void>=>{
    starting=true;
    const start=await ui.dungeon.live?.begin(floor);
    if(closed)return;
    battle=new DungeonBattle(ui.world.save,floor,start?.seed??randomSeed());
    pendingStep=0;starting=false;
  };
  // Ground loot is DOM on top of the transparent arena canvas: the shared field renderer keeps
  // drawing only the arena, so drops stay inside the isolated dungeon UI files.
  const lootLayer=get('.dungeon-loot-layer:not(.is-behind)'),backLootLayer=get('.dungeon-loot-layer.is-behind');
  // Grade colours are pushed to full saturation: an equipment or skill book drop has to read as its
  // grade at a glance, while a coin carries no outer light at all.
  const rarityInk:Record<Rarity,string>={common:'#cdd6e0',magic:'#2f7bff',rare:'#ffd400',epic:'#a855f7',unique:'#ff8a00',legendary:'#ff2d2d'};
  type LootView={el:HTMLDivElement;body:HTMLDivElement;shadow:HTMLSpanElement;x:number;y:number;tx:number;ty:number;flight:number;peak:number;burst:boolean;drift:number;h:number;vh:number;tapped:boolean;settled:boolean;done:boolean;gold:boolean};
  let lootViews:LootView[]=[],restSpots:LootDrop[]=[],spawnedLoot=0,absorbStarted=false,absorbRing:HTMLDivElement|undefined;
  // One timeline owns the clear beat: hold on the ground, pull every drop in, then show the result.
  const timeline=()=>dungeonLootTimeline(battle.outcome,battle.world.loot.length);
  const LOOT_GAP=36;
  // The fall is one small hop and one soft tap: the first arc tops out around 5px (a sixth of the 38px
  // body) and the rebound is a third of that, so a drop drops onto the floor instead of being lobbed.
  // A boss heap is the exception (작업 196): it is thrown out of the body, so it flies a real parabola
  // across the floor — `LOOT_BURST_MIN`/`LOOT_BURST_FLIGHT`/`LOOT_BURST_APEX` below.
  const LOOT_GRAVITY=1200,LOOT_TOSS_PEAK=5,LOOT_TOSS_VARY=.2,LOOT_TOSS_REBOUND=.35,LOOT_TOSS_SETTLE=60,LOOT_TOSS_SPEED=Math.sqrt(2*LOOT_GRAVITY*LOOT_TOSS_PEAK);
  const LOOT_BURST_MIN=8;
  const tossOf=(travel:number)=>{if(reducedMotion)return{burst:false,flight:1,peak:LOOT_TOSS_PEAK};if(travel<=LOOT_BURST_MIN)return{burst:false,flight:.45,peak:LOOT_TOSS_PEAK};return{burst:true,flight:Math.min(.95,.3+travel/420),peak:Math.min(30,8+travel*.2)};};
  // A drop's art hangs 38px above its ground point, so a spot keeps that much room under the exit
  // door's sill: drops rest on the floor in front of the door and never climb up to it.
  const LOOT_ART_LIFT=38,LOOT_TOP_PAD=6;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The floor the drops may rest on, read off the real door box (`top:10%` + `height:28%` of the
  // field in dungeon.css) so the limit follows the room art instead of a guessed fraction.
  const lootField=(heroH:number):LootField=>{
    const h=view.app.screen.height,box=field.getBoundingClientRect(),gate=get('.dungeon-exit-gate').getBoundingClientRect();
    const sill=gate.height>0?gate.bottom-box.top:h*.38;
    return {top:sill+LOOT_ART_LIFT+LOOT_TOP_PAD,reach:Math.max(120,heroH*2+8)};
  };
  const spawnLoot=(loot:DungeonLoot):void=>{
    const el=document.createElement('div'),body=document.createElement('div'),shadow=document.createElement('span');
    el.className='dungeon-loot';body.className='dungeon-loot-body';shadow.className='dungeon-loot-shadow';
    if(loot.kind==='gold'){
      el.classList.add('is-gold');
      // A coin heap is wide and flat, so its ground shadow is too instead of an icon-sized circle.
      shadow.style.width=`${GOLD_PILE_RX*2}px`;shadow.style.height=`${GOLD_PILE_RY*2}px`;
      // A heap of coins lying flat on the floor: every coin of the shared table, each drawn from the
      // chip baked by `goldCoinArt` — the original coin art lifted out of the floor, with its own 1px
      // warm brown boundary and 2px darker-gold thickness — set a few pixels apart (작업 196). If the
      // art could not be baked, the plain coin keeps the heap readable.
      for(const coin of GOLD_PILE){
        const art=document.createElement('img');art.className='dungeon-loot-coin';art.alt='';
        const chip=goldCoinChipUrl(coin);art.src=chip??'/assets/icons/gold-coin.png';
        const width=chip?goldCoinChipWidth(coin):coin.size,height=chip?goldCoinChipHeight(coin):goldCoinHeight(coin);
        art.style.width=`${width}px`;art.style.height=`${height}px`;art.style.left=`calc(50% + ${coin.dx}px)`;
        art.style.bottom=`${-coin.dy-(chip?GOLD_COIN_CHIP_DROP:0)}px`;
        body.append(art);
      }
    }else{
      const item=loot.item;el.classList.add('is-item');el.style.setProperty('--loot-ink',rarityInk[item.rarity]);
      // 영구 스탯북(파트 B) — 전용 아이콘 시안이 나오기 전까지 기존 책 그림을 쓴다(가방·창고와 같은 그림).
      if(isStatBook(item)){const img=document.createElement('img');img.className='dungeon-loot-art';img.src='/assets/icons/icon_skillbook.png';img.alt='';body.append(img);}
      else if(isEquipment(item)){const art=equipmentImage(item);
        if(art.columns>1){const atlas=document.createElement('span');atlas.className='dungeon-loot-art atlas-icon';atlas.style.backgroundImage=`url("${art.path}")`;atlas.style.backgroundPosition=`${art.frame/(art.columns-1)*100}% center`;body.append(atlas);}
        else{const img=document.createElement('img');img.className='dungeon-loot-art';img.src=art.path;img.alt='';body.append(img);}
      }
    }
    // A kill lands almost on top of the hero, so the drop keeps its own death point unless that
    // point is inside the character: then it is pulled straight out along the same line until it
    // clears the art, inside the fan. Only items are held `LOOT_GAP` apart from each other; gold
    // piles up where the mob fell, so its coins stay bunched instead of scattering across the floor.
    // Whatever the fall point, the spot also comes back along its own line into the floor limit,
    // so nothing rests up at the exit door or far from the character.
    const w=view.app.screen.width,h=view.app.screen.height,[heroX,heroY]=projectArenaPoint(battle.world.player.x,battle.world.player.y,w,h),[gx,gy]=projectArenaPoint(loot.x,loot.y,w,h);
    const heroH=Math.max(48,h*heroBodyFraction),[spot]=dungeonLootSpots(heroX,heroY,[{x:gx,y:gy,gold:loot.kind==='gold'}],restSpots,Math.max(40,heroH*.5),heroH+8,LOOT_GAP,lootField(heroH));
    // A boss heap is thrown from the body (`from`), so it starts there and flies to its spot on the
    // floor; every other drop simply falls where it appeared (작업 196).
    const from=loot.kind==='gold'?loot.from:undefined;
    const [startX,startY]=from?projectArenaPoint(from.x,from.y,w,h):[gx,gy],tx=spot.x-startX,ty=spot.y-startY,toss=tossOf(Math.hypot(tx,ty));
    el.append(shadow,body);
    // Depth: an item that rests behind the hero's feet stays under the transparent arena canvas and
    // one in front of them is drawn over the floor. A coin lies flat on the floor, so it is always
    // put in the behind layer (작업 194): every monster, the hero and every item — in either layer —
    // is painted over it, whatever side of the hero it fell on.
    (loot.kind==='gold'||spot.y<heroY-6?backLootLayer:lootLayer).append(el);
    lootViews.push({el,body,shadow,x:from?.x??loot.x,y:from?.y??loot.y,tx,ty,flight:toss.flight,peak:toss.peak,burst:toss.burst,drift:reducedMotion?1:0,h:reducedMotion?0:2,vh:reducedMotion?0:LOOT_TOSS_SPEED*(1+(Math.random()*2-1)*LOOT_TOSS_VARY),tapped:false,settled:reducedMotion,done:false,gold:loot.kind==='gold'});
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
      entry.drift=Math.min(1,entry.drift+dt/entry.flight);
      const [groundX,groundY]=projectArenaPoint(entry.x,entry.y,w,h);
      // A burst heap crosses the floor at a steady pace under its arc; every other drop eases into its
      // spot from the short hop above it.
      const path=entry.burst?entry.drift:1-Math.pow(1-entry.drift,3),x=groundX+entry.tx*path,y=groundY+entry.ty*path;
      if(absorbStarted){
        entry.el.classList.remove('is-resting');
        const p=dungeonAbsorbProgress(finishAge,index);
        if(p>=1){entry.done=true;entry.el.remove();continue;}
        const point=dungeonAbsorbPoint({x,y:y-entry.h},{x:heroX,y:heroY-26},p,index);
        entry.el.style.transform=`translate3d(${point.x}px,${point.y}px,0)`;
        entry.body.style.transform=`translate(-50%,-100%) scale(${1-.55*p*p})`;
        entry.body.style.opacity=String(1-p*.9);entry.shadow.style.opacity=String((entry.gold ? .3 : .45)*(1-p));
        continue;
      }
      if(entry.burst){
        entry.h=Math.max(0,4*entry.peak*entry.drift*(1-entry.drift));
        if(entry.drift>=1){entry.settled=true;entry.el.classList.add('is-resting');}
      }else if(!entry.settled){
        entry.h+=entry.vh*dt;entry.vh-=LOOT_GRAVITY*dt;
        if(entry.h<=0){entry.h=0;
          if(!entry.tapped&&entry.vh<-LOOT_TOSS_SETTLE){entry.tapped=true;entry.vh=-entry.vh*LOOT_TOSS_REBOUND;}
          else{entry.vh=0;entry.settled=true;entry.el.classList.add('is-resting');}
        }
      }
      entry.el.style.transform=`translate3d(${x}px,${y}px,0)`;
      // The bounce carries the drop and nothing turns it: it falls and lands the way it left the mob.
      entry.body.style.transform=`translate(-50%,-100%) translateY(${-entry.h}px)`;
      const lift=Math.min(1,entry.h/(entry.peak*2));
      entry.shadow.style.transform=`translate(-50%,-50%) scale(${1-lift*.55})`;
      // Ten boss heaps lying together must not stack into one black puddle, so a coin's shadow is
      // lighter than an item's.
      entry.shadow.style.opacity=String((entry.gold ? .3 : .5)-lift*.3);
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
  // 하단 자동 스킬 칸(작업 245) — 장전된 스킬의 남은 쿨타임을 매 프레임 숫자와 어두운 마스크로 보여 준다.
  const autoSkillViews:{id:string;el:HTMLElement;cd:HTMLElement;mask:HTMLElement}[]=[];
  for(const id of ui.world.save.quickSlots){const slot=document.createElement('div');slot.className='dungeon-auto-skill';if(id){const icon=document.createElement('i');setSkillIcon(icon,id);const mask=document.createElement('b');mask.className='dungeon-auto-skill-mask';const cd=document.createElement('em');cd.className='dungeon-auto-skill-cd';icon.append(mask,cd);slot.append(icon);const name=document.createElement('span');name.textContent=skills[id].name;slot.append(name);autoSkillViews.push({id,el:slot,cd,mask});}else slot.textContent='빈 슬롯';get('.dungeon-auto-skills').append(slot);}
  const resetBattle=(floor:number)=>{
    const gate=get('.dungeon-exit-gate');gate.classList.add('is-resetting');gate.classList.remove('is-opening');
    void gate.offsetWidth;gate.classList.remove('is-resetting');
    for(const sprite of view.enemies.values())sprite.destroy();view.enemies.clear();view.enemyWalkDistance.clear();
    for(const corpse of view.corpses)corpse.sprite.destroy();view.corpses=[];
    for(const label of view.damageLabels.values())label.destroy();view.damageLabels.clear();
    clearLoot();finishAge=0;age=0;resultShown=false;
    // 서버 검증(작업 209·210): 이 층의 서버 시각과 시드를 받아 그 시드로 전투를 시작한다.
    void createBattle(floor).then(()=>{
      if(closed)return;
      get('.dungeon-battle-result').hidden=true;
      get('.dungeon-field-hud strong').textContent=`제 ${floor} 층`;
      field.setAttribute('aria-label',`끝없는 던전 ${floor}층`);
    });
  };
  const result=()=>{resultShown=true;absorbRing?.remove();absorbRing=undefined;const floor=battle.floor,canNext=battle.outcome==='clear'&&floor<DUNGEON_MAX_FLOOR;
    // 클리어 보상은 여기서 한 번만 지급한다(작업 205): 바닥에 남은 금화와 떨어진 장비·스탯북이 그대로
    // `ui.world.save`로 들어가고, 강화석은 층 비례분 + 최초 클리어 보너스가 더해진다. 실패·시간 초과에는
    // `clearRewards()`가 undefined라 아무것도 들어가지 않는다.
    let receipt:DungeonRewardReceipt|undefined;
    if(battle.outcome==='clear'){
      const save=ui.world.save,rewards=battle.clearRewards();
      // 보스 업적은 모든 보스류 합산이다(작업 208) — 던전 5·10층 보스를 깨면 보스 처치 1회로 센다.
      if(dungeonBossKills(floor,true))addBossKill(save);
      if(rewards)receipt=claimDungeonRewards(save,floor,rewards,{firstClear:floor>dungeonClearedFloor(save),
        autoSalvage:ui.autoSalvage?ui.salvageRarity:undefined,autoSalvagePlus:ui.salvagePlus});
      // 클리어 층수는 계정 세이브에 적고(새로고침·재접속에도 유지), 정식 계정이면 서버 순위에도 올린다.
      // 클리어는 세이브에 적고, 서버가 같은 시드로 다시 돌려 확인할 수 있게 전투 요약을 함께 보낸다(작업 211).
      const summary=dungeonBattleSummary(battle);
      ui.dungeon.live?.rememberClear(floor,summary);
      if(ui.dungeon.clear(save,floor))ui.onSave();
      ui.renderStatus();ui.renderBagBadge();
      void ui.dungeon.live?.submit(floor,summary);
    }
    const box=get('.dungeon-battle-result');box.hidden=false;
    const record=battle.outcome==='clear'&&receipt?dungeonRewardMarkup(receipt):`<p>처치 ${battle.world.slain} / ${battle.targetCount} · ${Math.ceil(battle.elapsed)}초</p>`;
    const completed=battle.outcome==='clear'&&!canNext;
    const note=completed?`${DUNGEON_MAX_FLOOR+1}층 Coming Soon · 클리어 기록이 순위에 반영되었습니다.`:battle.outcome==='clear'?'획득한 보상은 계정에 저장되었습니다. · 클리어 기록이 순위에 반영되었습니다.':'보상은 클리어했을 때만 지급됩니다.';
    box.innerHTML=`<div><small>끝없는 던전 · 제${floor}층</small><h2>${battle.outcome==='clear'?`${floor}층 클리어`:battle.outcome==='dead'?'도전에 실패했습니다':'시간이 종료되었습니다'}</h2>${record}<p>${canNext?`열린 길을 따라 ${floor+1}층으로 이동할 수 있습니다.`:completed?`${DUNGEON_MAX_FLOOR}층 정복을 완료했습니다. 더 깊은 던전은 준비 중입니다.`:'재도전하면 체력과 제한 시간이 초기화됩니다.'}</p>${completed?'<p class="dungeon-result-coming"><b>'+(DUNGEON_MAX_FLOOR+1)+'층</b> Coming Soon</p>':''}${canNext?`<button type="button" data-next>다음 층으로 · ${floor+1}층</button>`:''}${battle.outcome!=='clear'?'<button type="button" data-retry>다시 도전하기</button>':''}<button type="button" data-leave>나가기</button><small>${note}${ui.dungeon.live?.guest?' 게스트 기록은 순위에 오르지 않습니다.':''}</small></div>`;
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
    await warmGoldCoinChips();if(closed)return;
    await Assets.load('/assets/dungeon/prison-room-v2.png');if(closed)return;
    await view.mount(get('.dungeon-field-canvas'));mounted=true;if(closed||destroyPending){view.app.destroy(true,{children:true,texture:false,textureSource:false});return;}
    await doorOpened;if(closed)return;observer.disconnect();
    view.app.renderer.background.color=0x000000;view.app.renderer.background.alpha=0;
    for(const layer of [view.floor,view.terrainLayer,view.ambientLayer,view.glow,view.shade])layer.visible=false;
    view.drawTerrain=()=>{};view.drawDust=()=>{};view.drawRunes=()=>{};
    // Render a complete frame before exposing the canvas. Keep the lobby underneath
    // throughout the fade so neither main hunting nor the renderer's clear color flashes.
    await createBattle(ui.dungeon.floor.floor);if(closed)return;
    view.draw(battle.world,0);view.app.renderer.render(view.app.stage);
    requestAnimationFrame(()=>{if(closed)return;field.classList.add('is-ready');get<HTMLButtonElement>('.dungeon-field-leave').focus();
      window.setTimeout(()=>{if(!closed&&ui.openModal==='dungeon')ui.open(null);},650);
    });
    get('.dungeon-field-hud strong').textContent=`제 ${battle.floor} 층`;
    let previous=performance.now();
    view.app.ticker.add(()=>{if(closed||starting)return;const now=performance.now(),dt=document.hidden?0:Math.min(.05,(now-previous)/1000);previous=now;age+=dt;
      visualTime+=dt;
      // 전투는 **고정 스텝**으로만 전진한다 — 남는 시간은 다음 프레임으로 넘긴다(작업 211). 서버 리플레이와
      // 같은 스텝 수를 밟아야 같은 결과가 나온다.
      if(age>.65&&!battle.finished){
        pendingStep+=dt;
        for(let steps=0;pendingStep>=DUNGEON_STEP&&!battle.finished&&steps<8;steps++){battle.advance(DUNGEON_STEP);pendingStep-=DUNGEON_STEP;}
        if(battle.finished)pendingStep=0;
      }
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
      // 장전 스킬의 남은 쿨타임(작업 245) — 각 칸이 자기 쿨타임을 초 단위로 줄여 가며 마스크를 걷는다.
      for(const view of autoSkillViews){
        const total=Math.max(.001,cooldowns[view.id as keyof typeof cooldowns]??1);
        const left=Math.max(0,battle.world.cooldown[view.id as keyof typeof battle.world.cooldown]??0);
        const ratio=Math.min(1,left/total);
        view.el.classList.toggle('is-cooling',left>0);
        view.cd.textContent=left>0?(left>=10?String(Math.ceil(left)):left.toFixed(1)):'';
        view.mask.style.transform=`scaleY(${ratio})`;
      }
      if(battle.finished&&finishAge>=timeline().resultAt&&!resultShown)result();
    });
  }catch(error){if(closed)return;cleanup();ui.message(`전장 로딩 실패: ${error instanceof Error?error.message:String(error)}`);}})();

}
