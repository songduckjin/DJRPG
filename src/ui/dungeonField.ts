import {Assets} from 'pixi.js';
import {GameView} from '../game/render';
import {totalStats} from '../game/store';
import {skills} from '../game/skills';
import {DungeonBattle} from './dungeonBattle';
import {setSkillIcon} from './skillArtwork';
import type {Interface} from './interface';

export function openDungeonField(ui:Interface,lobby:HTMLElement):void {
  if(ui.market.sync.locked||ui.market.sync.conflicted||ui.market.busy){ui.message('동기화가 끝난 뒤 도전해 주세요.');return;}
  if(ui.root.querySelector('.dungeon-field'))return;
  const lobbyRoot=lobby.querySelector<HTMLElement>('.dungeon-lobby')!;
  lobbyRoot.classList.add('is-opening');
  lobbyRoot.querySelectorAll<HTMLButtonElement>('button:not(.dungeon-close)').forEach(button=>button.disabled=true);
  const doorOpened=new Promise<void>(resolve=>window.setTimeout(resolve,1800));
  const wasPaused=ui.world.paused,resume=ui.suspendMainField?.();ui.world.paused=true;ui.world.attackHeld=false;
  const field=document.createElement('section');field.className='dungeon-field';field.setAttribute('role','region');field.setAttribute('aria-label','끝없는 던전 1층 미리보기');
  field.innerHTML=`<div class="dungeon-field-canvas"></div><div class="dungeon-exit-gate" aria-label="다음 층으로 이어지는 철문"><div class="dungeon-lobby-gate"><i class="dungeon-lobby-gate-dark"></i><img class="dungeon-gate-left" src="/assets/dungeon/gate-left-v1.png" alt=""><img class="dungeon-gate-right" src="/assets/dungeon/gate-right-v1.png" alt=""><img class="dungeon-gate-frame" src="/assets/dungeon/gate-frame-v1.png" alt=""></div></div><header class="dungeon-field-hud"><div><small>끝없는 던전</small><strong>제 1 층</strong></div><button type="button" class="dungeon-field-leave">나가기</button></header><footer class="dungeon-battle-hud"><div class="dungeon-battle-record"><strong data-clock>90초</strong><span data-wave>WAVE 1 / 3</span><span data-kills>처치 0 / 7</span></div><div class="dungeon-hp"><i></i><span></span></div><div class="dungeon-auto-skills"></div><small>자동 전투 · 1~2층 미리보기 · 보상/기록 미반영</small></footer><div class="dungeon-battle-result" hidden></div><div class="dungeon-floor-transition" aria-hidden="true"></div>`;
  ui.root.querySelector('.game-shell')!.append(field);
  const get=<T extends HTMLElement>(s:string)=>field.querySelector<T>(s)!;
  const view=new GameView();let battle=new DungeonBattle(ui.world.save),closed=false,mounted=false,age=0,visualTime=0,finishAge=0,resultShown=false;
  // Canvas alpha is fixed at context creation; changing it after mount cannot
  // reveal the CSS chamber/door behind an opaque context (Pixi BackgroundSystem).
  const initialize=view.app.init.bind(view.app);
  view.app.init=options=>initialize({...options,backgroundAlpha:0});
  let destroyPending=false;
  const observer=new MutationObserver(()=>{if(ui.openModal!=='dungeon'||!lobbyRoot.isConnected)cleanup();});
  observer.observe(ui.modal,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});
  const cleanup=()=>{if(closed)return;closed=true;observer.disconnect();lobbyRoot.classList.remove('is-opening');lobbyRoot.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=false);field.remove();if(mounted)view.app.destroy(true,{children:true,texture:false,textureSource:false});else destroyPending=true;ui.world.paused=wasPaused||ui.market.sync.locked||ui.market.sync.conflicted;resume?.();};
  const leave=()=>{cleanup();ui.open('dungeon');};get<HTMLButtonElement>('.dungeon-field-leave').onclick=leave;
  field.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')leave();});get<HTMLButtonElement>('.dungeon-field-leave').focus();
  for(const id of battle.world.save.quickSlots){const slot=document.createElement('div');slot.className='dungeon-auto-skill';if(id){const icon=document.createElement('i');setSkillIcon(icon,id);slot.append(icon);const name=document.createElement('span');name.textContent=skills[id].name;slot.append(name);}else slot.textContent='빈 슬롯';get('.dungeon-auto-skills').append(slot);}
  const resetBattle=(floor:1|2)=>{
    const gate=get('.dungeon-exit-gate');gate.classList.add('is-resetting');gate.classList.remove('is-opening');
    void gate.offsetWidth;gate.classList.remove('is-resetting');
    for(const sprite of view.enemies.values())sprite.destroy();view.enemies.clear();view.enemyWalkDistance.clear();
    for(const corpse of view.corpses)corpse.sprite.destroy();view.corpses=[];
    for(const label of view.damageLabels.values())label.destroy();view.damageLabels.clear();
    battle=new DungeonBattle(ui.world.save,floor);finishAge=0;age=0;resultShown=false;
    get('.dungeon-battle-result').hidden=true;
    get('.dungeon-field-hud strong').textContent=`제 ${floor} 층`;
    field.setAttribute('aria-label',`끝없는 던전 ${floor}층 미리보기`);
  };
  const result=()=>{resultShown=true;const floor=battle.floor,canNext=battle.outcome==='clear'&&floor===1;
    const box=get('.dungeon-battle-result');box.hidden=false;
    box.innerHTML=`<div><small>끝없는 던전 · 제${floor}층</small><h2>${battle.outcome==='clear'?`${floor}층 클리어`:battle.outcome==='dead'?'도전에 실패했습니다':'시간이 종료되었습니다'}</h2><p>처치 ${battle.world.slain} / 7 · ${Math.ceil(battle.elapsed)}초</p><p>${canNext?'열린 길을 따라 2층으로 이동할 수 있습니다.':battle.outcome==='clear'?'2층 미리보기가 완료되었습니다.':'재도전하면 체력과 제한 시간이 초기화됩니다.'}</p>${canNext?'<button type="button" data-next>다음 층으로 · 2층</button>':''}<button type="button" data-retry>다시 도전하기</button><button type="button" data-leave>나가기</button><small>미리보기 · 실제 보상과 순위는 반영되지 않습니다.</small></div>`;
    get<HTMLButtonElement>('[data-retry]').onclick=()=>resetBattle(floor);
    get<HTMLButtonElement>('[data-leave]').onclick=leave;
    if(canNext)get<HTMLButtonElement>('[data-next]').onclick=()=>{
      box.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);
      box.hidden=true;
      const gate=get('.dungeon-exit-gate');gate.classList.add('is-opening');

      window.setTimeout(()=>{if(closed)return;field.classList.add('is-changing-floor');
        window.setTimeout(()=>{if(closed)return;resetBattle(2);gate.classList.remove('is-opening');
          window.setTimeout(()=>{if(!closed)field.classList.remove('is-changing-floor');},100);
        },400);
      },1800);
    };
  };
  void (async()=>{try{
    await Assets.load('/assets/dungeon/prison-room-v2.png');if(closed)return;
    await view.mount(get('.dungeon-field-canvas'));mounted=true;if(closed||destroyPending){view.app.destroy(true,{children:true,texture:false,textureSource:false});return;}
    await doorOpened;if(closed)return;observer.disconnect();
    view.app.renderer.background.alpha=0;
    for(const layer of [view.floor,view.terrainLayer,view.ambientLayer,view.glow,view.shade])layer.visible=false;
    view.drawTerrain=()=>{};view.drawDust=()=>{};view.drawRunes=()=>{};
    // Render a complete frame before exposing the canvas. Keep the lobby underneath
    // throughout the fade so neither main hunting nor the renderer's clear color flashes.
    view.draw(battle.world,0);view.app.renderer.render(view.app.stage);
    requestAnimationFrame(()=>{if(closed)return;field.classList.add('is-ready');get<HTMLButtonElement>('.dungeon-field-leave').focus();
      window.setTimeout(()=>{if(!closed&&ui.openModal==='dungeon')ui.open(null);},650);
    });
    let previous=performance.now();
    view.app.ticker.add(()=>{if(closed)return;const now=performance.now(),dt=document.hidden?0:Math.min(.05,(now-previous)/1000);previous=now;age+=dt;
      visualTime+=dt;
      if(age>.65&&!battle.finished)battle.advance(dt);
      if(battle.finished){
        finishAge+=dt;battle.world.attackPose=Math.max(0,battle.world.attackPose-dt);
        battle.world.effects=battle.world.effects.filter(effect=>{effect.age+=dt;return effect.age<effect.duration;});
      }
      view.draw(battle.world,visualTime);
      // Preserve the existing skeletal art; the elite is the same soldier at larger scale.
      if(battle.elite){const sprite=view.enemies.get(battle.elite);if(sprite){sprite.scale.x*=1.35;sprite.scale.y*=1.35;sprite.tint=0xdcc4a1;}}
      const hp=battle.world.player.hp,max=totalStats(battle.world.save).health;
      get('.dungeon-hp i').style.width=`${hp/max*100}%`;get('.dungeon-hp span').textContent=`HP ${Math.ceil(hp)} / ${max}`;
      get('[data-clock]').textContent=`${Math.ceil(90-battle.elapsed)}초`;get('[data-wave]').textContent=`WAVE ${battle.wave} / 3`;get('[data-kills]').textContent=`처치 ${battle.world.slain} / 7`;
      if(battle.finished&&finishAge>=.75&&!resultShown)result();
    });
  }catch(error){if(closed)return;cleanup();ui.message(`전장 로딩 실패: ${error instanceof Error?error.message:String(error)}`);}})();

}
