import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

const { applyCharacterSwitch } = await import('../src/ui/modals/charactersModal.ts');
const { renderStatus } = await import('../src/ui/hud.ts');
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');

const modalSource = readFileSync(new URL('../src/ui/modals/charactersModal.ts', import.meta.url), 'utf8');
const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
const hudSource = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
const hudStyles = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
const worldBossStyles = readFileSync(new URL('../src/styles/world-boss.css', import.meta.url), 'utf8');
const modalStyles = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');

function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: { vars: {}, setProperty(key, value) { this.vars[key] = value; } }, className: '', textContent: '', innerHTML: '', attrs: {}, hidden: false,
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; },
    addEventListener() {}, removeEventListener() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  };
  node.classList = { add(name) { node.className += ` ${name}`; }, remove() {}, toggle(name, on) { if (on) this.className += ` ${name}`; } };
  return node;
}

/** 전환에 쓰이는 최소 UI — 실제 `Interface` 대신 쓰는 부분만 흉내 낸다. */
function harness(overrides = {}) {
  const save = freshSave('male', 'warrior');
  save.name = '옛전사'; save.level = 5;
  const world = new World(save);
  world.enemies.push({ x: 0, y: 0, hp: 10, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  world.drops = [{ x: 0, y: 0, item: { id: 'stale', name: '옛 장비', slot: 'weapon', rarity: 'common', stats: {} } }];
  const session = { accountId: 'ACC1', loginId: 'hero', guest: false, token: 'token', characterSlot: 1, revision: 7, save, gender: 'male', job: 'warrior' };
  const sync = { revision: 7, session, marks: 0, flushes: 0, markDirty() { this.marks++; }, flush() { this.flushes++; return Promise.resolve(true); } };
  const calls = [];
  const ui = {
    world, session, market: { sync }, knownItems: new Set(['old']), newItems: new Set(['old']), selected: 'old', equippedSlot: 'weapon', equippedPinned: true,
    characterFocus: 2, characterList: { characters: [] },
    open(kind) { calls.push(['open', kind]); }, renderStatus() { calls.push(['status']); }, renderBagBadge() { calls.push(['bag']); },
    showOfflineReward(reward) { calls.push(['offline', reward.seconds]); },
    journey: { load() { calls.push(['journey']); return Promise.resolve(); } }, message() {},
    ...overrides
  };
  return { ui, world, save, session, sync, calls };
}

const clone = value => JSON.parse(JSON.stringify(value));

test('캐릭터 전환은 location.reload 없이 flushIfDirty를 쓰고, 바뀐 것이 없으면 저장을 보내지 않는다(작업 228)', () => {
  const reloadCalls = modalSource.split('\n').filter(line => line.includes('location.reload') && !line.trimStart().startsWith('//'));
  assert.deepEqual(reloadCalls, [], '캐릭터 전환에 새로고침이 남아 있으면 안 된다');
  assert.match(modalSource, /sync\.flushIfDirty\(\)/, '변경이 없으면 바로 통과하는 flushIfDirty를 쓴다');
  assert.match(modalSource, /applyCharacterSwitch\(ui, result\)/, '받은 세이브로 그 자리에서 갈아탄다');
});

test('applyCharacterSwitch가 월드·세션·동기화 상태를 새 캐릭터로 바꾼다', () => {
  const { ui, world, save, session, sync, calls } = harness();
  const next = freshSave('female', 'mage');
  next.name = '새마법사'; next.level = 12; next.floor = 6; next.gold = 300;

  applyCharacterSwitch(ui, { characterSlot: 3, revision: 9, save: clone(next), characterName: '새마법사', offlineSeconds: 0 });

  assert.equal(world.save, save, '렌더러·저장 큐가 보는 세이브 객체는 그대로다');
  assert.equal(save.name, '새마법사');
  assert.equal(save.level, 12);
  assert.equal(save.floor, 6);
  assert.equal(save.gender, 'female');
  assert.equal(save.job, 'mage');
  assert.equal(session.characterSlot, 3);
  assert.equal(session.revision, 9);
  assert.equal(sync.revision, 9);
  assert.equal(sync.session.characterSlot, 3);
  assert.equal(world.enemies.length, 1, '옛 필드 몹은 지우고 새 층의 몹 한 마리로 시작한다');
  assert.equal(world.drops.length, 0, '옛 드랍이 남지 않는다');
  assert.equal(ui.selected, undefined);
  assert.equal(ui.equippedSlot, undefined);
  assert.equal(ui.characterList, undefined, '옛 목록은 버리고 다음에 열 때 다시 읽는다');
  assert.deepEqual(calls.map(call => call[0]), ['open', 'status', 'bag', 'journey']);
  assert.deepEqual(calls[0], ['open', null], '모달을 닫고 사냥터로 돌아간다');
  assert.equal(sync.marks, 0, '보상이 없으면 저장을 새로 만들지 않는다');
});

test('방치해 둔 캐릭터로 갈아타면 그 자리에서 오프라인 보상을 정산한다', () => {
  const { ui, world, save, sync, calls } = harness();
  const next = freshSave('male', 'warrior');
  next.name = '방치전사'; next.level = 9; next.floor = 5;
  const before = { level: next.level, gold: next.gold };

  applyCharacterSwitch(ui, { characterSlot: 2, revision: 11, save: clone(next), offlineSeconds: 7200 });

  const offline = calls.find(call => call[0] === 'offline');
  assert(offline, '오프라인 정산 창을 띄운다');
  assert.equal(offline[1], 7200);
  assert(save.gold > before.gold || save.exp > 0, '보상이 세이브에 반영된다');
  assert.equal(sync.marks, 1, '정산 결과를 저장 대상으로 표시한다');
  assert.equal(sync.flushes, 1, '정산 결과를 바로 서버로 보낸다');
  assert.equal(world.save, save);
});

test('HUD는 레벨 배지 아래에 현재 캐릭터 닉네임을 보여 준다(사용자 요청 #19089)', () => {
  assert.match(hudSource, /class="hero-name"/, 'HUD 템플릿에 닉네임 자리가 있다');
  assert.match(hudSource, /heroName\.textContent = nameText/, '이름은 textContent로만 넣는다');
  assert.match(hudStyles, /\.hero-name \{[^}]*top: \d+px/, '배지 아래에 붙는 위치');
  assert.match(hudStyles, /\.hero-name \{[^}]*text-overflow: ellipsis/, '긴 닉네임은 줄임표');
  assert.match(hudStyles, /\.hero-name \{[^}]*pointer-events: none/, '배지 클릭을 가로막지 않는다');

  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const heroName = element('span'), top = element('div'), hpBar = element('div'), hpLabel = element('b'), levelBadge = element('button'), floorButton = element('button');
    const save = freshSave(); save.name = '덕진전사'; save.level = 3;
    const ui = {
      top, banner: element('div'), world: { save, player: { hp: 80 } },
      get(selector) { return { '.level-badge': levelBadge, '.floor-button': floorButton, '.hp': hpBar, '.hp b': hpLabel, '.hero-name': heroName }[selector]; }
    };
    renderStatus.call(ui);
    assert.equal(heroName.textContent, '덕진전사');
    assert.equal(heroName.title, '덕진전사');
    save.name = '이름없음없음';
    renderStatus.call(ui);
    assert.equal(heroName.textContent, '이름없음없음', '캐릭터가 바뀌면 다음 렌더에서 바로 새 이름');
  } finally { globalThis.document = previous; }
});

test('좌상단 HUD는 레벨 배지 → 닉네임 → HP → 월드보스 순서로 겹치지 않는다(작업 230)', () => {
  // 실기 IMG_1143: `top: 40px`이던 이름판이 배지 원(5~54px) 안쪽이라 레벨 숫자 아래를 가렸다.
  const value = (source, pattern) => { const found = source.match(pattern); assert.ok(found, `규칙을 찾는다: ${pattern}`); return Number(found[1]); };
  const badgeTop = value(hudStyles, /\.level-badge \{[^}]*top: (-?\d+)px/);
  const badgeHeight = value(hudStyles, /\.level-badge \{[^}]*height: (\d+)px/);
  const nameTop = value(hudStyles, /\.hero-name \{[^}]*top: (\d+)px/);
  const healthTop = value(hudStyles, /\.health-bar \{[^}]*top: (\d+)px/);
  const healthHeight = value(hudStyles, /\.health-bar \{[^}]*height: (\d+)px/);
  const bossTop = value(worldBossStyles, /\.world-boss-entry \{[^}]*top:calc\(env\(safe-area-inset-top, 0px\) \+ (\d+)px\)/);
  // 이름판 높이 = 글자 13px(10px·line-height 1.3) + 위아래 여백 2px + 테두리 2px.
  const NAME_HEIGHT = 17;
  assert.ok(nameTop >= badgeTop + badgeHeight, `닉네임(${nameTop}px)은 배지 원(${badgeTop + badgeHeight}px)보다 아래`);
  assert.ok(healthTop >= nameTop + NAME_HEIGHT, `HP(${healthTop}px)는 이름판(${nameTop + NAME_HEIGHT}px)보다 아래`);
  assert.ok(bossTop >= healthTop + healthHeight, `월드보스 진입(${bossTop}px)은 HP(${healthTop + healthHeight}px)보다 아래`);
  assert.doesNotMatch(hudStyles, /\.hero-name \{[^}]*translateX\(-50%\)/, '이름판은 배지 왼쪽에 붙어 오른쪽으로만 늘어난다(16자 닉네임이 화면 밖으로 나가지 않는다)');
});

test('모바일 장비창은 가방 칸 최소 높이를 지키고, 낮은 화면에서는 창이 스크롤된다(작업 228)', () => {
  // 예전 `@media (max-height: 750px)`의 `min-height: 0`이 가방을 5px까지 찌그러뜨렸다.
  assert.doesNotMatch(modalStyles, /\.bag-grid \{ min-height: 0; \}/, '가방 칸을 0으로 만드는 규칙이 없다');
  assert.match(modalStyles, /@media \(max-width: 480px\) \{[\s\S]*\.equipment-modal \.bag-grid \{ min-height: 135px; \}/, '모바일에서 가방 칸 135px 확보');
  assert.match(modalStyles, /@media \(max-height: 620px\) \{[\s\S]*\.modal-dialog\.equipment-modal \{ height: auto; max-height: 92dvh; overflow-y: auto; \}/, '아주 낮은 화면은 창 전체 스크롤');
  assert.match(modalStyles, /\.equipment-slot \{ aspect-ratio: auto; height: 48px; \}/, '장착 10칸은 모바일에서 납작하게');
  assert.match(equipSource, /heading\.append\(title, jobToggle, sort\)/, '가방 제목·내 직업만 보기·등급순은 한 줄');
});
