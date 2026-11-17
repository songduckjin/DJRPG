import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {ModalRenderGate,bindModalInteraction}=await import('../src/ui/modalInteraction.ts');
const {Interface}=await import('../src/ui/interface.ts');
test('combat and async refreshes preserve a pressed target until click completes, then redraw once',t=>{
  t.mock.timers.enable({apis:['setTimeout']});let redraws=0,clicks=0,alive=true;
  const gate=new ModalRenderGate(()=>{alive=false;redraws++;});
  gate.begin('p1');assert(gate.defer());assert(gate.defer());t.mock.timers.tick(500);assert(alive);
  gate.end('p1');assert(gate.defer(),'refresh between pointerup and click is also deferred');
  if(alive)clicks++;assert.equal(clicks,1);assert.equal(redraws,0);
  t.mock.timers.tick(0);assert.equal(redraws,1);assert.equal(gate.defer(),false);
});
test('pointer cancellation, multiple pointers and keyboard release cannot leave redraws locked',t=>{
  t.mock.timers.enable({apis:['setTimeout']});let redraws=0;const handlers={},modal={addEventListener(type,run){handlers[`m:${type}`]=run;}},surface={addEventListener(type,run){handlers[`w:${type}`]=run;}};
  const gate=bindModalInteraction(modal,surface,()=>redraws++);
  handlers['m:pointerdown']({pointerId:1});handlers['m:pointerdown']({pointerId:2});gate.defer();handlers['w:pointerup']({pointerId:1});t.mock.timers.tick(0);assert.equal(redraws,0);
  handlers['w:pointercancel']({pointerId:2});t.mock.timers.tick(0);assert.equal(redraws,1);
  handlers['m:keydown']({key:' '});gate.defer();handlers['w:keyup']({key:' '});t.mock.timers.tick(0);assert.equal(redraws,2);
  handlers['m:pointerdown']({pointerId:3});gate.defer();handlers['w:blur']();t.mock.timers.tick(0);assert.equal(redraws,3);
});
test('modal integration defers replacement but close stays immediate; save status changes only its text',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const gate=new ModalRenderGate(()=>{});gate.begin('p1');
  const ui={openModal:'settings',modalRenderGate:gate};assert.doesNotThrow(()=>Interface.prototype.renderModal.call(ui));
  ui.openModal=null;ui.modal={hidden:false};Interface.prototype.renderModal.call(ui);assert.equal(ui.modal.hidden,true);
  const label={textContent:'old'},statusUi={modal:{querySelector:()=>label},renderModal(){throw new Error('must not replace an active input');}};
  Interface.prototype.setSaveStatus.call(statusUi,'저장됨');assert.equal(label.textContent,'서버 저장됨');gate.cancel();t.mock.timers.tick(0);
});
