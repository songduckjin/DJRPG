import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { SkillFeedback } = await import('../src/ui/skillFeedback.ts');
const { freshSave } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');
const { applySkillArtwork } = await import('../src/ui/skillArtwork.ts');
const effect=(kind,age=0)=>({kind,age,x:0,y:0,duration:1,angle:0});
function worldWith(id){const save=freshSave();save.learned=[id];save.quickSlots=[id,null,null];const world=new World(save);world.enemies[0].x=30;world.enemies[0].y=0;world.enemies[0].hp=1e8;return world;}
test('manual casts highlight once and rejected cooldown presses do not highlight again',()=>{
  const world=worldWith('spin'),feedback=new SkillFeedback();
  world.action('spin');assert(feedback.collect(world.effects).has('spin'));assert.equal(feedback.collect(world.effects).size,0);
  world.action('spin');assert.equal(feedback.collect(world.effects).size,0);
  world.cooldown.spin=0;world.action('spin');assert(feedback.collect(world.effects).has('spin'));
});
test('automatic combat emits the same feedback for basic attack and equipped skills',()=>{
  const world=worldWith('warcry'),feedback=new SkillFeedback();world.update(.016);
  const casts=feedback.collect(world.effects);assert(casts.has('warcry'));assert(casts.has('attack'));
});
test('damage ticks, deaths and stale effects never masquerade as a fresh skill activation',()=>{
  const feedback=new SkillFeedback();assert.equal(feedback.collect([effect('hit'),effect('death'),effect('hell',.6)]).size,0);
  const spin=effect('spin');assert(feedback.collect([spin]).has('spin'));spin.age=.2;assert.equal(feedback.collect([spin]).size,0);
});
function animatedNode(){const calls=[];return {calls,style:{},animate(frames,options){const animation={cancelled:0,cancel(){this.cancelled++;}};calls.push({frames,options,animation});return animation;}};}
test('repeated activations replace the pulse; clearing a reassigned slot cancels button and artwork pulses',()=>{
  const feedback=new SkillFeedback(),art=animatedNode(),button=animatedNode();button.querySelector=()=>art;
  feedback.pulse(button);feedback.pulse(button);
  assert.equal(button.calls.length,2);assert.equal(button.calls[0].animation.cancelled,1);assert.equal(art.calls[0].animation.cancelled,1);
  feedback.clear(button);assert.equal(button.calls[1].animation.cancelled,1);assert.equal(art.calls[1].animation.cancelled,1);
});
test('reduced motion preserves a short colored emphasis without moving or scaling the controls',()=>{
  const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});
  try{const feedback=new SkillFeedback(),art=animatedNode(),button=animatedNode();button.querySelector=()=>art;feedback.pulse(button);
    assert.equal(art.calls.length,0);assert(button.calls[0].frames.every(frame=>!('transform' in frame)&&frame.boxShadow));assert.equal(button.calls[0].options.duration,480);
  }finally{globalThis.matchMedia=previous;}
});
test('changing artwork retains slot semantics and clears the art when a skill is removed',()=>{
  const art={style:{},hidden:false},classes=new Set(),button={querySelector:()=>art,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}};
  applySkillArtwork(button,'spin');assert(art.style.backgroundImage.includes('field-skills.png'));assert(classes.has('has-skill-art'));
  // [작업 216] 기본 공격은 직업별 원형 아이콘이다(전사 대검·궁수 활·마법사 마법탄).
  applySkillArtwork(button,'attack');assert(art.style.backgroundImage.includes('attack_warrior.png'));assert.equal(art.style.backgroundSize,'contain');
  applySkillArtwork(button,'attack','archer');assert(art.style.backgroundImage.includes('attack_archer.png'));
  applySkillArtwork(button,'attack','mage');assert(art.style.backgroundImage.includes('attack_mage.png'));
  applySkillArtwork(button,null);assert(art.hidden);assert(!classes.has('has-skill-art'));
});
