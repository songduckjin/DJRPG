import {Assets,Sprite,Texture} from 'pixi.js';
import {GameView} from '../game/render';
import {totalStats} from '../game/store';
import {skills} from '../game/skills';
import {DungeonBattle} from './dungeonBattle';
import {setSkillIcon} from './skillArtwork';
import type {Interface} from './interface';

export function openDungeonField(ui:Interface):void {
  if(ui.market.sync.locked||ui.market.sync.conflicted||ui.market.busy){ui.message('동기화가 끝난 뒤 도전해 주세요.');return;}
  ui.open(null);if(ui.openModal!==null)return;
  const wasPaused=ui.world.paused,resume=ui.suspendMainField?.();ui.world.paused=true;ui.world.attackHeld=false;
  const field=document.createElement('section');field.className='dungeon-field';field.setAttribute('role','region');field.setAttribute('aria-label','끝없는 던전 1층 미리보기');
  field.innerHTML=`<div class="dungeon-field-canvas"></div><header class="dungeon-field-hud"><div><small>끝없는 던전</small><strong>제 1 층</strong></div><button type="button" class="dungeon-field-leave">나가기</button></header><div class="dungeon-wave-notice" role="status"></div><footer class="dungeon-battle-hud"><div class="dungeon-battle-record"><strong data-clock>90초</strong><span data-wave>WAVE 1 / 3</span><span data-kills>처치 0 / 7</span></div><div class="dungeon-hp"><i></i><span></span></div><div class="dungeon-auto-skills"></div><small>자동 전투 · 1층 미리보기 · 보상/기록 미반영</small></footer><div class="dungeon-battle-result" hidden></div><div class="dungeon-entry-transition"><div class="dungeon-gate-portal"><div class="dungeon-gate-dark"></div><img class="gate-stone" src="/assets/dungeon/lobby-gate-v1.png" alt=""><img class="gate-left" src="/assets/dungeon/lobby-gate-v1.png" alt=""><img class="gate-right" src="/assets/dungeon/lobby-gate-v1.png" alt=""></div><span>철문 너머로 진입 중…</span></div>`;
  ui.root.querySelector('.game-shell')!.append(field);
  const get=<T extends HTMLElement>(s:string)=>field.querySelector<T>(s)!;
  const view=new GameView();let battle=new DungeonBattle(ui.world.save),closed=false,mounted=false,age=0,combatTime=0,lastWave=0,cueAt=0,resultShown=false;
  let destroyPending=false;
  const cleanup=()=>{if(closed)return;closed=true;field.remove();if(mounted)view.app.destroy(true,{children:true,texture:false,textureSource:false});else destroyPending=true;ui.world.paused=wasPaused||ui.market.sync.locked||ui.market.sync.conflicted;resume?.();};
  const leave=()=>{cleanup();ui.open('dungeon');};get<HTMLButtonElement>('.dungeon-field-leave').onclick=leave;
  field.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')leave();});get<HTMLButtonElement>('.dungeon-field-leave').focus();
  for(const id of battle.world.save.quickSlots){const slot=document.createElement('div');slot.className='dungeon-auto-skill';if(id){const icon=document.createElement('i');setSkillIcon(icon,id);slot.append(icon);const name=document.createElement('span');name.textContent=skills[id].name;slot.append(name);}else slot.textContent='빈 슬롯';get('.dungeon-auto-skills').append(slot);}
  const result=()=>{resultShown=true;const box=get('.dungeon-battle-result');box.hidden=false;box.innerHTML=`<div><small>끝없는 던전 · 제1층</small><h2>${battle.outcome==='clear'?'1층 클리어':battle.outcome==='dead'?'도전에 실패했습니다':'시간이 종료되었습니다'}</h2><p>처치 ${battle.world.slain} / 7 · ${Math.ceil(battle.elapsed)}초</p><p>${battle.outcome==='clear'?'다음 층은 준비 중입니다.':'재도전하면 체력과 제한 시간이 초기화됩니다.'}</p><button type="button" data-retry>다시 도전하기</button><button type="button" data-leave>나가기</button><small>미리보기 · 실제 보상과 순위는 반영되지 않습니다.</small></div>`;
    get<HTMLButtonElement>('[data-retry]').onclick=()=>{battle=new DungeonBattle(ui.world.save);combatTime=0;lastWave=0;resultShown=false;box.hidden=true;};get<HTMLButtonElement>('[data-leave]').onclick=leave;};
  void (async()=>{try{
    const texture=await Assets.load<Texture>('/assets/dungeon/prison-floor-v1.png');if(closed)return;
    await view.mount(get('.dungeon-field-canvas'));mounted=true;if(closed||destroyPending){view.app.destroy(true,{children:true,texture:false,textureSource:false});return;}
    const background=new Sprite(texture);view.app.stage.addChildAt(background,0);
    for(const layer of [view.floor,view.terrainLayer,view.ambientLayer,view.glow,view.shade])layer.visible=false;
    view.drawTerrain=()=>{};view.drawDust=()=>{};view.drawRunes=()=>{};
    let previous=performance.now();
    view.app.ticker.add(()=>{if(closed)return;const now=performance.now(),dt=document.hidden?0:Math.min(.05,(now-previous)/1000);previous=now;age+=dt;
      const transition=get('.dungeon-entry-transition');transition.style.setProperty('--entry-time',String(age));
      if(age>2.4){transition.hidden=true;if(!battle.finished){combatTime+=dt;battle.advance(dt);}}
      view.draw(battle.world,combatTime);
      const w=view.app.screen.width,h=view.app.screen.height; background.width=w;background.height=h;
      // Preserve the existing skeletal art; the elite is the same soldier at larger scale.
      if(battle.elite){const sprite=view.enemies.get(battle.elite);if(sprite){sprite.scale.x*=1.35;sprite.scale.y*=1.35;sprite.tint=0xdcc4a1;}}
      const hp=battle.world.player.hp,max=totalStats(battle.world.save).health;
      get('.dungeon-hp i').style.width=`${hp/max*100}%`;get('.dungeon-hp span').textContent=`HP ${Math.ceil(hp)} / ${max}`;
      get('[data-clock]').textContent=`${Math.ceil(90-battle.elapsed)}초`;get('[data-wave]').textContent=`WAVE ${battle.wave} / 3`;get('[data-kills]').textContent=`처치 ${battle.world.slain} / 7`;
      if(age>2.4&&lastWave!==battle.wave){lastWave=battle.wave;cueAt=age;get('.dungeon-wave-notice').textContent=battle.wave===3?'마지막 웨이브 · 정예 해골 등장':`WAVE ${battle.wave} · 해골 병사 3마리`;}
      get('.dungeon-wave-notice').hidden=age<2.4||age-cueAt>2.4||battle.finished;
      if(battle.finished&&!resultShown)result();
    });
  }catch(error){if(closed)return;get('.dungeon-entry-transition span').textContent='전장 로딩에 실패했습니다. 나간 후 다시 도전해 주세요.';ui.message(error instanceof Error?error.message:String(error));}})();
  // CSS door animation starts immediately; loading never consumes the 90-second timer.
  requestAnimationFrame(()=>{if(!closed)field.classList.add('is-entering');});
}
