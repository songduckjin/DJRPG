import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave }=await import('../src/game/store.ts');
const { tick }=await import('../src/ui/hud.ts');
const { chooseSkill, pressSkillSlot, cancelSkillSelection }=await import('../src/ui/skillLoadout.ts');
const { renderSkills }=await import('../src/ui/modals/skillModal.ts');
function node(){const classes=new Set(),children=new Map();return {dataset:{},hidden:false,disabled:false,textContent:'',style:{setProperty(){}},classList:{toggle(key,on){if(on)classes.add(key);else classes.delete(key);},contains:key=>classes.has(key)},setAttribute(key,value){this[key]=value;},querySelector(key){if(!children.has(key))children.set(key,node());return children.get(key);},append(){},appendChild(){},remove(){},focus(){}};}
function uiFixture(){
  const save=freshSave(),root=node(),messages=[],actions=[];
  const ui={world:{save,player:{hp:100},cooldown:{attack:0,slash2:0,spin:0,slam:0,power:0},paused:false,action:kind=>actions.push(kind),onChange(){}},market:{busy:false,sync:{locked:false}},root,slotButtons:[node(),node(),node()],attackButton:node(),get:key=>root.querySelector(key),tick(){tick.call(this);},open(kind){this.opened=kind;},message:text=>messages.push(text),messages,actions};return ui;
}
test('field circles are disabled until a learned unassigned skill enables plus and red dots',()=>{
  const created=[];globalThis.document={createElement:tag=>{const element=node(tag);created.push(element);return element;}};
  try{
  const ui=uiFixture();ui.tick();assert(ui.slotButtons.every(button=>button.disabled));assert(ui.slotButtons.every(button=>button.querySelector('.skill-alert-dot').hidden));
  ui.world.save.learned=['slash2'];ui.tick();assert(ui.slotButtons.every(button=>!button.disabled));assert(ui.slotButtons.every(button=>button.querySelector('strong').textContent==='+'));assert(ui.slotButtons.every(button=>!button.querySelector('.skill-alert-dot').hidden));
  assert.equal(ui.root.querySelector('.skill-nav-dot').hidden,false);
  // 작업 245: 빈 원(`+`)은 전체 스킬 창이 아니라 **장착할 수 있는 스킬만** 고르는 팝업을 연다.
  pressSkillSlot.call(ui,1);assert.equal(ui.opened,undefined,'전체 스킬 창을 열지 않는다');assert.equal(ui.skillTarget,undefined);
  const rows=created.filter(element=>typeof element.className==='string'&&element.className.includes('skill-picker-row'));
  assert.equal(rows.length,1,'장착 가능한 스킬만 보여 준다');assert.equal(rows[0].dataset.skill,'slash2');assert(rows[0].className.includes('is-recommended'),'1순위에 추천 배지');
  rows[0].onclick();
  ui.tick();assert.deepEqual(ui.world.save.quickSlots,[null,'slash2',null]);
  assert(ui.slotButtons.every(button=>button.querySelector('.skill-alert-dot').hidden));assert.equal(ui.root.querySelector('.skill-nav-dot').hidden,true);assert(ui.slotButtons[0].disabled);assert(!ui.slotButtons[1].disabled);
  }finally{delete globalThis.document;}
});
test('choosing an extra skill highlights all field circles and replaces exactly the clicked one',()=>{
  globalThis.document={createElement:()=>node()};const ui=uiFixture();ui.world.save.learned=['slash2','spin','slam','power'];ui.world.save.quickSlots=['slash2','spin','slam'];
  chooseSkill.call(ui,'power');assert.equal(ui.pendingSkill,'power');assert.equal(ui.opened,null);assert(ui.slotButtons.every(button=>button.classList.contains('slot-selecting')));
  pressSkillSlot.call(ui,2);assert.deepEqual(ui.world.save.quickSlots,['slash2','spin','power']);assert.equal(ui.pendingSkill,undefined);assert.equal(ui.actions.length,0);assert(ui.slotButtons.every(button=>!button.classList.contains('slot-selecting')));delete globalThis.document;
});
test('canceling field selection keeps the loadout intact and equipped clicks still cast',()=>{
  const ui=uiFixture();ui.world.save.learned=['slash2','spin','slam','power'];ui.world.save.quickSlots=['slash2','spin','slam'];ui.pendingSkill='power';
  cancelSkillSelection.call(ui);assert.equal(ui.pendingSkill,undefined);assert.deepEqual(ui.world.save.quickSlots,['slash2','spin','slam']);pressSkillSlot.call(ui,0);assert.deepEqual(ui.actions,['slash2']);
});
test('skill window unequip button clears the assigned circle and saves the change',()=>{
  const created=[];globalThis.document={createElement:()=>{const element=node();created.push(element);return element;}};
  try {
    const ui=uiFixture();let changes=0;ui.world.onChange=()=>{changes++;};ui.world.save.learned=['spin'];ui.world.save.quickSlots=[null,'spin',null];
    renderSkills.call(ui,node());
    const remove=created.find(element=>element.textContent==='해제');assert(remove);remove.onclick();
    assert.deepEqual(ui.world.save.quickSlots,[null,null,null]);assert.deepEqual(ui.world.save.learned,['spin']);assert.equal(changes,1);
    assert(ui.messages.at(-1).includes('2번 스킬 원에서 해제'));
  } finally {delete globalThis.document;}
});

test('HUD pulses actual casts only, not cooldowns restored by equipping or repeated frame updates',()=>{
  const ui=uiFixture();ui.world.save.learned=['spin'];ui.world.save.quickSlots=['spin',null,null];ui.world.effects=[];
  let pulses=0;ui.slotButtons[0].animate=()=>{pulses++;return {cancel(){}};};
  ui.tick();ui.world.cooldown.spin=6;ui.tick();assert.equal(pulses,0);
  ui.world.effects.push({kind:'spin',age:0,duration:2,x:0,y:0,angle:0});ui.tick();assert.equal(pulses,1);ui.tick();assert.equal(pulses,1);
  ui.world.save.quickSlots[0]=null;ui.tick();assert(ui.slotButtons[0].querySelector('.skill-art').hidden);assert.equal(ui.slotButtons[0].querySelector('strong').textContent,'+');
});

test('skill menu upgrade dot tracks book cost even with all field slots equipped',()=>{
  const ui=uiFixture(),save=ui.world.save;
  save.learned=['spin','slam','power'];save.quickSlots=['spin','slam','power'];save.skillLevels.spin=25;
  save.bag=Array.from({length:5},(_,i)=>({id:`b${i}`,kind:'skillbook',slot:'skillbook',skillId:'spin',rarity:'rare',name:'book',stats:{}}));
  ui.tick();assert(ui.root.querySelector('.skill-nav-dot').hidden);
  save.bag.push({...save.bag[0],id:'sixth'});ui.tick();assert(!ui.root.querySelector('.skill-nav-dot').hidden);
  save.skillLevels.spin=30;ui.tick();assert(ui.root.querySelector('.skill-nav-dot').hidden);
});
test('skillbook section groups copies and actual upgrade button consumes cost and refreshes the game',async()=>{
  const {renderSkillBooks}=await import('../src/ui/skillBooks.ts');
  const previous=globalThis.document;
  function element(){return {children:[],style:{},className:'',append(...items){this.children.push(...items);},setAttribute(){},get childElementCount(){return this.children.length;}};}
  globalThis.document={createElement:()=>element()};
  try{
    const ui=uiFixture(),save=ui.world.save;let changes=0;ui.world.onChange=()=>changes++;
    save.learned=['spin'];save.skillLevels.spin=5;
    save.bag=Array.from({length:2},(_,i)=>({id:`book${i}`,kind:'skillbook',slot:'skillbook',skillId:'spin',rarity:'rare',name:'[스킬북] 드래곤 트위스터',stats:{}}));
    const parent=element();renderSkillBooks(ui,parent);const grid=parent.children[0].children[1];
    assert.equal(grid.children.length,1);const card=grid.children[0];
    // 카드 맨 앞에 어느 직업의 책인지 배지가 붙는다(작업 205).
    assert.equal(card.children[0].textContent,'전사');assert.equal(card.children[0].className,'job-badge job-warrior');
    assert.equal(card.children[2].textContent,'드래곤 트위스터');assert.equal(card.children[3].textContent,'×2');
    assert.equal(card.children[4].textContent,'보유 2 / 필요 2권');const button=card.children[5];assert.equal(button.disabled,false);button.onclick();
    assert.equal(save.skillLevels.spin,6);assert.equal(save.bag.length,0);assert.equal(changes,1);
  }finally{globalThis.document=previous;}
});

test('three passive cards share a single grid and keep upgrade controls without redundant learned status',()=>{
  const previous=globalThis.document,created=[];globalThis.document={createElement(){const element=node();element.children=[];element.appendChild=function(child){this.children.push(child);};created.push(element);return element;}};
  try{
    const ui=uiFixture();ui.world.save.passives=['mastery','body','instinct'];renderSkills.call(ui,node());
    const grid=created.find(n=>n.className==='passive-skill-grid');assert(grid);assert.equal(grid.children.length,3);
    assert.deepEqual(grid.children.map(card=>card.dataset.skill),['mastery','body','instinct']);
    for(const [index,card] of grid.children.entries()){const icon=card.querySelector('.skill-icon');assert.equal(icon.textContent,'');assert(icon.style.backgroundImage.includes('passive-skills.png'));assert.equal(icon.style.backgroundSize,'300% 100%');assert.equal(icon.style.backgroundPosition,`${index*50}% center`);}
    assert(!created.some(n=>n.textContent==='습득 완료 · 상시 적용'));assert(created.filter(n=>n.textContent==='강화').length>=3);
  }finally{globalThis.document=previous;}
});

test('all eight active skill cards use the exact field artwork and basic attack keeps its sword image',async()=>{
  const {applySkillArtwork}=await import('../src/ui/skillArtwork.ts');const {skillOrder}=await import('../src/game/skills.ts');
  const previous=globalThis.document,created=[];globalThis.document={createElement(){const element=node();created.push(element);return element;}};
  try{
    renderSkills.call(uiFixture(),node());
    for(const id of skillOrder){const card=created.find(n=>n.dataset.skill===id),icon=card.querySelector('.skill-icon'),field=node();applySkillArtwork(field,id);const art=field.querySelector('.skill-art');
      assert.equal(icon.className,'skill-icon skill-image-icon');assert.equal(icon.textContent,'');assert.equal(icon.style.backgroundImage,art.style.backgroundImage);assert.equal(icon.style.backgroundPosition,art.style.backgroundPosition);
    }
    // [작업 216] 기본 공격 카드 아이콘은 직업별 원형 아이콘(전사 기본 = 대검)이다.
    assert(created.some(card=>card.querySelector('.skill-icon').style.backgroundImage?.includes('attack_warrior.png')));
  }finally{globalThis.document=previous;}
});


test('equipped skills share one group and upgrade counts live in the right status column',()=>{
  const previous=globalThis.document,created=[];
  globalThis.document={createElement(){const el=node();el.children=[];el.append=function(...children){this.children.push(...children);};el.appendChild=function(child){this.children.push(child);};created.push(el);return el;}};
  try {
    const ui=uiFixture();ui.world.save.learned=['spin','slam','power','warcry'];ui.world.save.quickSlots=['spin','slam','power'];
    renderSkills.call(ui,node());
    const group=created.find(el=>el.className==='equipped-skill-group');assert(group);
    assert.deepEqual(group.children.filter(el=>el.dataset?.skill).map(el=>el.dataset.skill),['spin','slam','power']);
    assert(!group.children.some(el=>el.dataset?.skill==='warcry'));
    const card=created.find(el=>el.dataset?.skill==='spin');
    const status=card.querySelector('.skill-status-stack');assert(status);
    const cost=created.find(el=>el.className==='skill-book-cost'&&el.textContent.startsWith('보유'));
    assert(cost);assert(created.some(el=>el.textContent==='해제'));
  } finally {globalThis.document=previous;}
});
