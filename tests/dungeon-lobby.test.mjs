import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {DungeonLobby,dungeonFloorInfo,dungeonRankings}=await import('../src/ui/dungeonLobby.ts');
test('only next uncleared floor is offered, every fifth floor is a solo boss',()=>{
 const lobby=new DungeonLobby();assert.equal(lobby.floor.floor,1);assert.deepEqual(lobby.floor.waves,[3,3,1]);assert.equal(lobby.floor.seconds,90);
 lobby.clearedFloor=4;assert.equal(lobby.floor.floor,5);assert.equal(lobby.floor.boss,true);assert.deepEqual(lobby.floor.waves,[1]);
 lobby.clearedFloor=5;assert.equal(lobby.floor.boss,false);assert.equal(dungeonFloorInfo(10).boss,true);
});
test('ranking uses cleared floors and earlier clear as tie breaker without changing records',()=>{
 const rows=[{name:'later',clearedFloor:9,clearedAt:20},{name:'first',clearedFloor:9,clearedAt:10},{name:'higher',clearedFloor:10,clearedAt:30},{name:'new',clearedFloor:0,clearedAt:0}];
 assert.deepEqual(dungeonRankings(rows).map(r=>r.name),['higher','first','later']);assert.equal(rows[0].name,'later');assert.deepEqual(new DungeonLobby().records,[]);
});
test('after tenth clear the lobby is complete and never offers floor eleven',()=>{const lobby=new DungeonLobby();lobby.clearedFloor=9;assert.equal(lobby.floor.floor,10);assert.equal(lobby.completed,false);lobby.clearedFloor=10;assert.equal(lobby.floor.floor,10);assert.equal(lobby.completed,true);});
