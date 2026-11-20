import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './ts-loader.mjs';
const {DUNGEON_MAX_FLOOR,freshSave,parseSave}=await import('../src/game/store.ts');
const {dungeonClearedFloor,recordDungeonClear}=await import('../src/game/dungeonProgress.ts');
const {DungeonLobby,dungeonLobbyStatus}=await import('../src/ui/dungeonLobby.ts');

test('던전 최고 클리어 층은 계정 세이브에 0층부터 적힌다',()=>{
  const save=freshSave();
  assert.equal(save.dungeonFloor,0);assert.equal(save.dungeonClearAt,0);
  assert.equal(parseSave(save).dungeonFloor,0);
  assert.equal(parseSave({...save,dungeonFloor:7,dungeonClearAt:1000}).dungeonFloor,7);
  assert.equal(parseSave({...save,dungeonFloor:7,dungeonClearAt:1000}).dungeonClearAt,1000);
});

test('세이브의 던전 층수는 0~10 정수로 다듬어 읽고, 시각 없는 층은 0으로 둔다',()=>{
  const save=freshSave();
  assert.equal(parseSave({...save,dungeonFloor:12}).dungeonFloor,DUNGEON_MAX_FLOOR);
  assert.equal(parseSave({...save,dungeonFloor:-4}).dungeonFloor,0);
  assert.equal(parseSave({...save,dungeonFloor:3.7}).dungeonFloor,3);
  assert.equal(parseSave({...save,dungeonFloor:'9'}).dungeonFloor,0,'문자열 층수는 기록이 아니다');
  assert.equal(parseSave({...save,dungeonFloor:0,dungeonClearAt:555}).dungeonClearAt,0);
  assert.equal(dungeonClearedFloor({dungeonFloor:11}),DUNGEON_MAX_FLOOR);
});

test('클리어는 최고층을 올리기만 하고, 같은 층의 최초 클리어 시각을 지킨다',()=>{
  const save=freshSave();
  assert.equal(recordDungeonClear(save,1,100),true);
  assert.equal(save.dungeonFloor,1);assert.equal(save.dungeonClearAt,100);
  assert.equal(recordDungeonClear(save,1,900),false,'같은 층 재도전은 기록을 바꾸지 않는다');
  assert.equal(save.dungeonClearAt,100);
  assert.equal(recordDungeonClear(save,3,200),true);
  assert.equal(save.dungeonFloor,3);assert.equal(save.dungeonClearAt,200);
  assert.equal(recordDungeonClear(save,2,300),false,'낮은 층은 최고층을 되돌리지 않는다');
  assert.equal(save.dungeonFloor,3);
  assert.equal(recordDungeonClear(save,11,400),true);
  assert.equal(save.dungeonFloor,DUNGEON_MAX_FLOOR,'마지막 층보다 깊은 기록은 없다');
  assert.equal(recordDungeonClear(save,0,500),false);
});

test('던전 로비는 세이브에서 진행을 되살리고 클리어를 세이브에 적는다',()=>{
  const save=freshSave(),lobby=new DungeonLobby();
  assert.equal(lobby.clearedFloor,0);assert.equal(lobby.floor.floor,1);
  lobby.load({dungeonFloor:4,dungeonClearAt:10});
  assert.equal(lobby.clearedFloor,4);assert.equal(lobby.floor.floor,5);assert.equal(lobby.floor.boss,true);
  assert.equal(lobby.clear(save,6,700),true);
  assert.equal(save.dungeonFloor,6);assert.equal(lobby.clearedFloor,6);assert.equal(lobby.completed,false);
  save.dungeonFloor=10;lobby.load(save);
  assert.equal(lobby.completed,true);assert.equal(lobby.floor.floor,DUNGEON_MAX_FLOOR,'11층은 열리지 않는다');
});

test('10층을 다 깨면 로비가 다음 층 커밍순을 안내한다',()=>{
  const before=dungeonLobbyStatus(9),after=dungeonLobbyStatus(10);
  assert.equal(before.completed,false);assert.equal(before.headline,'제 10 층');assert.equal(before.detail,'');assert.equal(before.button,'도전하기');
  assert.equal(after.completed,true);assert.equal(after.headline,'10층 정복 완료');assert.equal(after.badge,'Coming Soon');
  assert.match(after.detail,/11층/);assert.equal(after.button,'다음 층 준비 중');
});

test('던전 대기창과 결과창이 실제 순위·커밍순을 그린다',()=>{
  const modal=readFileSync(new URL('../src/ui/modals/dungeonModal.ts',import.meta.url),'utf8');
  const field=readFileSync(new URL('../src/ui/dungeonField.ts',import.meta.url),'utf8');
  const layout=readFileSync(new URL('../src/styles/dungeon.css',import.meta.url),'utf8');
  // “순위 서버 연결은 준비 중입니다”는 이제 없고, 서버 순위를 그대로 그린다.
  assert.doesNotMatch(modal,/순위 서버 연결은 준비 중입니다/);
  assert.match(modal,/renderDungeonRanking/,'the ranking tab draws the server standing');
  assert.match(modal,/live\.load\(\)/,'and asks the server for it');
  assert.match(modal,/live\.submit\(\)/,'a record the server missed is submitted again');
  assert.match(modal,/Coming Soon/,'the lobby states the coming-soon floor');
  assert(modal.includes('dungeon-coming-soon-panel'),'the challenge tab has a coming-soon panel');
  // 클리어는 세이브에 적고(새로고침 유지) 서버 순위로 보낸다.
  assert(field.includes('ui.dungeon.clear(ui.world.save,floor)'),'a clear is written to the save');
  assert(field.includes('ui.dungeon.live?.submit()'),'and pushed to the ranking');
  assert.match(field,/Coming Soon/,'the tenth clear result shows the coming-soon badge');
  assert.match(layout,/\.dungeon-coming-soon\{/,'the badge has its own style');
  assert.match(layout,/\.dungeon-result-coming\{/,'and so does the result badge');
});
