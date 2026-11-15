import { GameView } from './game/render';
import { freshSave, loadSave, saveGame } from './game/store';
import { World } from './game/world';
import { Interface } from './ui/interface';
import './styles/main.css';

const root = document.getElementById('app');
if (!root) throw new Error('앱 루트 요소가 없습니다.');
const appRoot = root;
let pendingMessage = '';
let gameUi: Interface | undefined;
window.addEventListener('game-message', (event: Event) => {
  pendingMessage = (event as CustomEvent<string>).detail;
  gameUi?.message(pendingMessage);
});
const save = loadSave();
let hasSave = false;
try { hasSave = localStorage.getItem('djrpg-save-v1') !== null; } catch { /* loadSave already reports storage failure. */ }
const world = new World(save);
const ui = new Interface(appRoot, world, () => saveGame(save));
gameUi = ui;
if (pendingMessage) ui.message(pendingMessage);
const view = new GameView();
await view.mount(ui.canvasHost);

const keys = new Set<string>();
const direction = () => {
  const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  if (x || y || !document.querySelector('.stick:active')) world.move = { x, y };
};
window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
  keys.add(key); direction();
  if (e.repeat) return;
  if (key === ' ') world.action('attack');
  if (key === '1') world.action('spin');
  if (key === '2') world.action('slam');
  if (key === '3') world.action('warcry');
});
window.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); direction(); });
window.addEventListener('blur', () => { keys.clear(); world.move = { x: 0, y: 0 }; world.attackHeld = false; saveGame(save); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(save); });

if (!hasSave) {
  const chooser = document.createElement('div'); chooser.className = 'character-choice';
  chooser.innerHTML = '<div><small>THE DESCENT BEGINS</small><h2>전사를 선택하세요</h2><p>빈손으로 어둠의 던전에 들어갑니다.</p><button data-gender="male">남성 전사</button><button data-gender="female">여성 전사</button></div>';
  appRoot.appendChild(chooser);
  chooser.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.onclick = () => {
    Object.assign(save, freshSave(button.dataset.gender === 'female' ? 'female' : 'male'));
    world.player.hp = 100; hasSave = true; saveGame(save); chooser.remove(); ui.renderStatus();
  });
}

let previous = performance.now(), time = 0;
view.app.ticker.add(() => {
  const now = performance.now(), dt = Math.min(.05, (now - previous) / 1000); previous = now; time += dt;
  if (hasSave) world.update(dt);
  view.draw(world, time); ui.tick();
});
