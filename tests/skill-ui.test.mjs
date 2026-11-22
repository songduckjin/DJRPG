import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { element, query, byClass, textOf, withClasses, installDocument } from './helpers/dom.mjs';
const { freshSave }=await import('../src/game/store.ts');
const { tick }=await import('../src/ui/hud.ts');
const { chooseSkill, pressSkillSlot, cancelSkillSelection }=await import('../src/ui/skillLoadout.ts');
const { renderSkills }=await import('../src/ui/modals/skillModal.ts');
const { passives }=await import('../src/game/skills.ts');
function node(){const classes=new Set(),children=new Map();return {dataset:{},hidden:false,disabled:false,textContent:'',style:{setProperty(){}},classList:{toggle(key,on){if(on)classes.add(key);else classes.delete(key);},contains:key=>classes.has(key)},setAttribute(key,value){this[key]=value;},querySelector(key){if(!children.has(key))children.set(key,node());return children.get(key);},append(){},appendChild(){},remove(){},focus(){}};}
function uiFixture(){
  // 밸런스 v2: 새 캐릭터는 첫 액티브 스킬을 '습득한 상태'로 시작한다 — 이 파일은 슬롯 규칙만 보므로 비운다.
  const save=freshSave();save.learned=[];save.skillLevels={};
  const root=node(),messages=[],actions=[];
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
test('스킬 트리 상세 패널의 장착 해제가 스킬 원을 비우고 저장한다',()=>{
  const restoreDocument = installDocument();
  try {
    const ui=uiFixture();let changes=0;ui.world.onChange=()=>{changes++;};ui.world.save.learned=['spin'];ui.world.save.skillLevels={spin:1};ui.world.save.quickSlots=[null,'spin',null];
    ui.skillSelected='spin';ui.renderModal=()=>{};ui.message=text=>ui.messages.push(text);
    const dialog=element('div');renderSkills.call(ui,dialog);
    const remove=withClasses(dialog,'skill-detail-equip');
    assert.equal(remove.textContent,'장착 해제');
    remove.onclick();
    assert.deepEqual(ui.world.save.quickSlots,[null,null,null]);assert.deepEqual(ui.world.save.learned,['spin']);assert.equal(changes,1);
    assert(ui.messages.at(-1).includes('2번 스킬 원에서 해제'));
  } finally {restoreDocument();}
});

test('HUD pulses actual casts only, not cooldowns restored by equipping or repeated frame updates',()=>{
  const ui=uiFixture();ui.world.save.learned=['spin'];ui.world.save.quickSlots=['spin',null,null];ui.world.effects=[];
  let pulses=0;ui.slotButtons[0].animate=()=>{pulses++;return {cancel(){}};};
  ui.tick();ui.world.cooldown.spin=6;ui.tick();assert.equal(pulses,0);
  ui.world.effects.push({kind:'spin',age:0,duration:2,x:0,y:0,angle:0});ui.tick();assert.equal(pulses,1);ui.tick();assert.equal(pulses,1);
  ui.world.save.quickSlots[0]=null;ui.tick();assert(ui.slotButtons[0].querySelector('.skill-art').hidden);assert.equal(ui.slotButtons[0].querySelector('strong').textContent,'+');
});

test('스킬 메뉴 점은 스킬북·남은 SP·빈 스킬 원을 모두 본다',()=>{
  const ui=uiFixture(),save=ui.world.save;
  save.learned=['spin','slam','power'];save.quickSlots=['spin','slam','power'];save.skillLevels={spin:1,slam:1,power:1};
  ui.tick();assert(ui.root.querySelector('.skill-nav-dot').hidden,'쓸 책도 SP도 빈 원도 없다');
  save.bag=[{id:'b0',kind:'skillbook',slot:'skillbook',skillId:'spin',rarity:'rare',name:'book',stats:{}}];
  ui.tick();assert(!ui.root.querySelector('.skill-nav-dot').hidden,'바로 쓸 수 있는 스킬북이 있다');
  save.bag=[];save.skillLevels.spin=10;save.skillLevels.slam=10;save.skillLevels.power=10;
  ui.tick();assert(ui.root.querySelector('.skill-nav-dot').hidden,'최대 레벨·책 없음·SP 없음');
  // 남은 SP가 생기면(4단계 스킬 트리) 점이 켜진다 — 레벨이 오르면 그만큼 투자할 수 있다.
  save.level=5;save.skillLevels={spin:1,slam:1,power:1};ui.tick();assert(!ui.root.querySelector('.skill-nav-dot').hidden,'투자할 SP가 남았다');
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

test('트리의 11개 노드가 필드와 같은 스킬 그림을 쓰고, 패시브는 패시브 시트를 쓴다',async()=>{
  const {applySkillArtwork}=await import('../src/ui/skillArtwork.ts');const {skillOrder}=await import('../src/game/skills.ts');
  const restoreDocument = installDocument();
  try {
    const ui=uiFixture();ui.renderModal=()=>{};
    const dialog=element('div');renderSkills.call(ui,dialog);
    const nodes=byClass(dialog,'skill-node');
    assert.equal(nodes.length,11,'티어 3-3-3-2');
    for(const node of nodes){
      const icon=query(node,'.skill-icon');
      assert.equal(icon.textContent,'');
      assert.equal(icon.className.includes('skill-image-icon'),true);
      const passive=node.className.includes('is-passive');
      if(passive) assert(icon.style.backgroundImage.includes('passive-skills.png'),'패시브 시트');
      else assert.match(icon.style.backgroundImage,/field-skills|archer-skills|mage-skills/,'직업 스킬 시트');
    }
    // 전사 액티브는 필드 시트의 같은 칸을 쓴다(액션 패드와 한 벌).
    for(const id of skillOrder){const node=nodes.find(item=>item.dataset.skill===id),icon=query(node,'.skill-icon'),field=element(),art=element();art.className='skill-art';field.appendChild(art);applySkillArtwork(field,id);
      assert.equal(icon.style.backgroundImage,art.style.backgroundImage,`${id} 그림`);assert.equal(icon.style.backgroundPosition,art.style.backgroundPosition,`${id} 칸`);}
  } finally {restoreDocument();}
});

test('상세 패널은 고른 스킬 하나만 다루고, 티어 요약은 습득 수를 센다',()=>{
  const restoreDocument = installDocument();
  try {
    const ui=uiFixture();ui.renderModal=()=>{};const save=ui.world.save;
    save.learned=['spin','slam'];save.skillLevels={spin:2,slam:1};
    ui.skillSelected='spin';
    const dialog=element('div');renderSkills.call(ui,dialog);
    const nodes=byClass(dialog,'skill-node');
    assert.equal(withClasses(dialog,'skill-detail').dataset.skill,'spin','고른 스킬의 상세');
    assert.deepEqual(textOf(dialog,'skill-tier-count'),['1/3','0/3','0/3','1/2'],'1티어 slam·궁극 spin');
    // 같은 노드를 다시 눌러도 다시 그리지 않는다.
    let renders=0;ui.renderModal=()=>{renders++;};
    nodes.find(item=>item.dataset.skill==='spin').onclick();
    assert.equal(renders,0,'이미 고른 노드는 그대로');
  } finally {restoreDocument();}
});
