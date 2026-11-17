import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {createSkillBookArt}=await import('../src/ui/skillBookArt.ts');
const {renderSkillUpgrade}=await import('../src/ui/skillBooks.ts');
const {freshSave}=await import('../src/game/store.ts');
function el(){return {style:{},children:[],setAttribute(){},append(...items){this.children.push(...items);}};}
test('eight active and three passive books show matching round skill artwork and distinct covers',()=>{
 const previous=globalThis.document;globalThis.document={createElement:el};
 try{
  const ids=['slash2','spin','crushing','slam','warcry','power','destroy','hell','mastery','body','instinct'];
  ids.forEach((skillId,index)=>{
   const art=createSkillBookArt({skillId});assert(art.style.backgroundImage.includes(index<8?'icon_skillbook.png':'icon_skillbook_passive.png'));
   const badge=art.children[0];assert.equal(badge.className,'skill-book-emblem');assert(badge.children[0].style.backgroundImage.includes(index<8?'field-skills.png':'passive-skills.png'));
  });
 }finally{globalThis.document=previous;}
});
test('skill ownership count moves to the supplied status column while upgrade stays in actions',()=>{
 const previous=globalThis.document;globalThis.document={createElement:el};
 try{
  const actions=el(),status=el();renderSkillUpgrade({world:{save:freshSave()}},actions,'spin',status);
  assert.equal(status.children.length,1);assert.match(status.children[0].textContent,/보유 0/);
  assert.equal(actions.children.length,1);assert.equal(actions.children[0].className,'skillbook-use');assert.equal(actions.children[0].disabled,true);
 }finally{globalThis.document=previous;}
});
