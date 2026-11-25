/**
 * 1~40층 렌더 미리보기 — PR 검수용 임시 페이지(브랜치 `preview/roster-harness` 전용).
 *
 * 로그인·서버 세이브 없이 **게임과 같은 `GameView`·`World`·층 테마**로 그 층의 필드를 그린다.
 * `?floor=30&boss=1` 보스, `?floor=30&elite=1` 정예를 세운다. 게임 코드는 한 줄도 바꾸지 않는다.
 */
import './game/pixiSetup';
import { GameView } from './game/render';
import { World } from './game/world';
import { freshSave, totalStats } from './game/store';
import { mountWasteland } from './game/wasteland';
import { bossName, eliteName, isCastle, mobName, realmName, zoneOf } from './game/floorTheme';

const params = new URLSearchParams(location.search);
const floor = Math.max(1, Math.min(40, Math.floor(Number(params.get('floor') ?? 21)) || 21));
const wantBoss = params.get('boss') === '1';
const wantElite = params.get('elite') === '1';

const save = freshSave();
save.floor = floor;
save.maxFloor = floor;
save.autoClimb = false;
// 그 층의 기준 레벨(권장 빌드와 같은 규칙)로 맞춰 몹·체력이 자연스럽게 보이게 한다.
save.level = Math.min(30, Math.ceil(floor * .8));
save.health = totalStats(save).health;

const world = new World(save);
world.onChange = () => {};
world.onMessage = () => {};
if (wantBoss) {
  world.enemies = [];
  world.bossPending = true;
  world.spawnTimer = 0;
}
if (wantElite) {
  // 정예 예약 — 다음 리필에서 첫 몹이 정예로 나온다(30마리 주기와 같은 경로).
  world.elitePending = true;
  world.spawnTimer = Math.min(world.spawnTimer, .05);
}

const host = document.getElementById('stage');
if (!host) throw new Error('무대가 없습니다');
const view = new GameView();
await view.mount(host);
await mountWasteland(view);

const caption = document.getElementById('caption');
if (caption) {
  const zone = zoneOf(floor);
  const who = wantBoss ? bossName(floor) : wantElite ? eliteName(floor) : mobName(floor);
  const tag = wantBoss ? '보스' : wantElite ? '정예' : '몹';
  caption.innerHTML = `<b>${floor}층</b> · ${realmName(floor)}${zone ? ` · ${zone.name}` : ''} · ${tag} ${who}`;
}
const links = document.getElementById('links');
if (links) {
  const shots = [1, 10, 21, 26, 31, 40];
  links.innerHTML = shots.map(value => `<a href="?floor=${value}">${value}층</a>`).join('')
    + `<a href="?floor=10&elite=1">10층 정예</a><a href="?floor=20&boss=1">20층 보스</a>`
    + `<a href="?floor=30&elite=1">30층 정예</a><a href="?floor=40&boss=1">40층 보스</a>`;
}

let previous = performance.now(), time = 0, placed = false;
view.app.ticker.add(() => {
  const now = performance.now(), dt = Math.min(.05, (now - previous) / 1000);
  previous = now; time += dt;
  world.update(dt);
  // 검수용: 보스·정예는 필드 끝에서 뜨므로 화면 안(히어로 옆)으로 한 번 옮긴다.
  if ((wantBoss || wantElite) && !placed) {
    const target = wantBoss ? world.enemies.find(enemy => enemy.boss) : world.enemies.find(enemy => enemy.elite);
    if (target) { target.x = -74; target.y = -46; world.player.x = 118; world.player.y = 116; placed = true; }
  }
  view.draw(world, time);
});

if (!isCastle(floor)) document.body.dataset.wasteland = '1';
