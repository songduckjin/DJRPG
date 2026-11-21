/**
 * 아키텍처 경계 가드 (PR-1).
 *
 * `work/djrpg_domain_split_plan.md` §3.1(S-1)·§3.2(S-6)의 위반을 **CI에서 자동으로 막는다**. 이 저장소는
 * `docs/CODE_MAP.md` §3.5에 "server는 src를 import하지 않는다"고 적어 두었지만 실제로는 서버가
 * `src/ui/dungeonBattle.ts`를 import해 UI 파일이 서버 계약의 일부가 되어 있었다(2026-11-21, PR-2A에서 절단).
 * 다시 그 상태로 돌아가지 않도록 **import 그래프를 실제로 계산해서** 검사한다 — 문자열 grep이 아니라
 * TypeScript 파서로 각 파일의 import/export/동적 import를 읽고, 서버 진입점에서 도달 가능한 전체
 * 클로저(간접 의존 포함)를 계산한다.
 *
 * 검사 항목
 *  ① `server/**`·`api/**`·`functions/**` 클로저에 `src/ui/**` 파일이 하나도 없다.
 *  ② 같은 클로저에 `pixi.js`·`src/styles/**`가 없다. 서버가 닿는 `src/` 파일은 `src/game/**`뿐이다.
 *  ③ 클로저 안에서 DOM API를 쓰는 파일은 아래 `DOM_ALLOWED`에 적힌 예외뿐이다.
 *  ④ `src/game/**`는 `src/ui/**`를 **값으로** import하지 않는다(타입 전용은 허용 — 지금 2곳).
 *  ⑤ 표 등록부(schema ↔ 탈퇴 ↔ 시즌초기화 ↔ 이관)의 누락·불일치.
 *  ⑥ 옛 경로(`src/ui/dungeonBattle.ts`)가 되살아나지 않았다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { TABLES as MIGRATE_TABLES, OPTIONAL_TABLES as MIGRATE_OPTIONAL } from '../scripts/migrate-turso-db.mjs';
import { ACCOUNT_TABLES } from '../server/account-delete.mjs';
import { RESET_TABLES } from '../server/season.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const posix = path => path.split('\\').join('/');

/** 서버 코드의 진입점 — 이 파일들에서 도달 가능한 모든 파일이 "서버 번들"이다. */
const SERVER_ROOTS = ['server', 'api', 'functions'];
const SOURCE_EXT = /\.(mjs|js|ts|tsx)$/;

/**
 * 서버 클로저에서 DOM을 쓰는 것이 **허용된** 파일.
 *
 * `src/game/store.ts`의 `readLegacySave`·`clearLegacySave`는 브라우저의 옛 localStorage 세이브를
 * 정리하는 클라이언트 전용 함수다(서버는 호출하지 않고, 정의만 번들에 남는다). 나머지는 예외가 없다 —
 * 새 파일이 DOM을 쓰면 여기에 이유를 적고 리뷰에서 확인해야 한다.
 */
const DOM_ALLOWED = new Map([
  ['src/game/store.ts', 'readLegacySave·clearLegacySave — 브라우저 전용 legacy 세이브 정리(서버 미호출)']
]);

/** `src/game/**`가 `src/ui/**`를 **값으로** import하는 것이 허용된 간선. */
const GAME_TO_UI_ALLOWED = new Map([
  ['src/game/sync.ts -> ../ui/login', 'HTTP 전송 계층 — 토큰·세션·계정 요청은 ui/login이 소유한다(서버는 이 파일을 import하지 않는다)'],
  ['src/game/sync.ts -> ../ui/reconnect', '오프라인 판정·재시도 문구 — sync가 다시 보내기 루프를 재사용한다(서버 미도달)']
]);

const DOM_NAMES = new Set([
  'document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'HTMLElement',
  'requestAnimationFrame', 'XMLHttpRequest', 'CustomEvent', 'MutationObserver', 'getComputedStyle'
]);

const walk = dir => {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const path = posix(join(dir, entry));
    if (statSync(join(root, path)).isDirectory()) out.push(...walk(path));
    else if (SOURCE_EXT.test(path)) out.push(path);
  }
  return out;
};

const parseCache = new Map();
const sourceFile = file => {
  if (!parseCache.has(file)) {
    const text = readFileSync(join(root, file), 'utf8');
    parseCache.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS));
  }
  return parseCache.get(file);
};

/** 한 파일의 정적·동적 import/export 간선. `typeOnly`는 `import type`·`export type`만 참이다. */
function edgesOf(file) {
  const edges = [];
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) {
        const typeOnly = ts.isImportDeclaration(node) ? Boolean(node.importClause?.isTypeOnly) : node.isTypeOnly === true;
        edges.push({ spec: spec.text, typeOnly });
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      edges.push({ spec: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(file));
  return edges;
}

/** 상대 경로 간선을 실제 파일로 푼다. 못 풀면 `undefined`(외부 패키지·node 내장). */
function resolveEdge(file, spec) {
  if (!spec.startsWith('.')) return undefined;
  const base = resolve(join(root, dirname(file)), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.mjs')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return posix(relative(root, candidate));
  }
  return undefined;
}

/** 서버 진입점에서 도달 가능한 파일 전체(값 간선만 — 타입 전용은 런타임에 없다). */
function serverClosure() {
  const parents = new Map();
  const queue = SERVER_ROOTS.flatMap(walk).map(file => [file, null]);
  while (queue.length) {
    const [file, parent] = queue.shift();
    if (parents.has(file)) continue;
    parents.set(file, parent);
    for (const edge of edgesOf(file)) {
      if (edge.typeOnly) continue;
      const target = resolveEdge(file, edge.spec);
      if (target && !parents.has(target)) queue.push([target, file]);
    }
  }
  return parents;
}

/** 위반 파일에서 진입점까지의 실제 import 사슬 — 실패 메시지가 "왜"를 말하게 한다. */
function chainTo(parents, file) {
  const chain = [file];
  let cursor = parents.get(file);
  while (cursor) { chain.push(cursor); cursor = parents.get(cursor); }
  return chain.reverse().join(' → ');
}

const closure = serverClosure();

test('서버 클로저(server·api·functions)는 src/ui 파일을 하나도 포함하지 않는다', () => {
  const violations = [...closure.keys()].filter(file => file.startsWith('src/ui/'));
  assert.deepEqual(violations.map(file => chainTo(closure, file)), [],
    '서버가 화면 코드를 import하면 UI 리팩터가 서버 배포를 유발하고, 타입 import가 값 import로 바뀌는 순간 pixi.js가 Functions 번들로 들어온다.');
});

test('서버 클로저는 pixi.js·헬퍼 스타일시트를 포함하지 않고, src 쪽 의존은 src/game·src/core뿐이다', () => {
  const external = new Set();
  for (const file of closure.keys()) for (const edge of edgesOf(file)) if (!edge.typeOnly) external.add(edge.spec);
  const forbidden = [...external].filter(spec => spec === 'pixi.js' || spec.startsWith('pixi.js/') || spec.startsWith('@pixi/'));
  assert.deepEqual(forbidden, [], '서버 번들에 렌더러가 들어오면 콜드 스타트가 무거워지고 DOM 없는 런타임에서 깨진다.');
  const sourceFiles = [...closure.keys()].filter(file => file.startsWith('src/'));
  // `src/core/**`는 UI(#285 도메인 이벤트 버스)에 붙지 않은 공용 코어로, DOM-free다.
  const outsideGame = sourceFiles.filter(file => !file.startsWith('src/game/') && !file.startsWith('src/core/'));
  assert.deepEqual(outsideGame.map(file => chainTo(closure, file)), [],
    '서버가 쓸 수 있는 클라이언트 코드는 DOM-free인 src/game/**·src/core/**뿐이다.');
});

test('서버 클로저 안에서 DOM API를 쓰는 파일은 문서화된 예외뿐이다', () => {
  const offenders = [];
  for (const file of closure.keys()) {
    if (DOM_ALLOWED.has(file)) continue;
    const found = new Set();
    const visit = node => {
      if (ts.isIdentifier(node) && DOM_NAMES.has(node.text)) found.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile(file));
    if (found.size) offenders.push(`${file}(${[...found].sort().join(', ')}) ← ${chainTo(closure, file)}`);
  }
  assert.deepEqual(offenders, [],
    `DOM을 쓰는 새 파일이 서버 클로저에 들어왔다. 정말 필요하면 DOM_ALLOWED에 이유와 함께 적어라. 허용: ${[...DOM_ALLOWED.keys()].join(', ') || '없음'}`);
});

test('src/game은 src/ui를 값으로 import하지 않는다(타입 전용은 허용)', () => {
  const allowed = new Set(GAME_TO_UI_ALLOWED.keys());
  const violations = [];
  for (const file of walk('src/game')) {
    for (const edge of edgesOf(file)) {
      if (edge.typeOnly) continue;
      const target = resolveEdge(file, edge.spec);
      if (!target || !target.startsWith('src/ui/')) continue;
      const key = `${file} -> ${edge.spec}`;
      if (!allowed.has(key)) violations.push(`${key} (${target})`);
    }
  }
  assert.deepEqual(violations, [],
    `도메인 코드가 화면 코드를 값으로 잡으면 순환·초기화 순서 문제가 돌아온다. 허용 간선: ${[...allowed].join(', ')}`);
  const stale = [...allowed].filter(key => {
    const [file, spec] = key.split(' -> ');
    return !edgesOf(file).some(edge => edge.spec === spec && !edge.typeOnly);
  });
  assert.deepEqual(stale, [], '허용 목록에 더 이상 존재하지 않는 간선이 남았다 — 지워라.');
});

test('옛 경로 src/ui/dungeonBattle.ts는 다시 생기지 않는다', () => {
  assert.equal(existsSync(join(root, 'src/ui/dungeonBattle.ts')), false,
    '던전 전투는 서버가 리플레이하는 DOM-free 코드다 — src/game/dungeon/battle.ts 하나만 있어야 한다.');
  const importers = [...walk('src'), ...walk('server')].filter(file => /['"][^'"]*ui\/dungeonBattle['"]/.test(readFileSync(join(root, file), 'utf8')));
  assert.deepEqual(importers, [], '옛 경로를 import하는 파일이 남아 있다.');
});

/* ───────────────────────── 표 등록부 (S-6) ───────────────────────── */

/** 스키마 DDL에서 `djrpg_*` 표 이름을 뽑는다. 표를 새로 만들고 등록부를 잊는 것이 이 검사의 대상이다. */
function schemaTables(...files) {
  const names = new Set();
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(djrpg_[a-z0-9_]+)/g)) names.add(match[1]);
  }
  return names;
}

/**
 * 계정 id로 지우지 **않는** 표 — 이유가 코드가 아니라 정책인 것들.
 *  · djrpg_accounts: 계정 행 자체(탈퇴는 이 행을 id로 지운다)
 *  · djrpg_meta: 서버 전역 키/값(시즌 epoch 등), 계정과 무관
 *  · djrpg_market: seller/buyer로 계정을 가리킨다(`MARKET_TABLE`로 따로 지운다)
 *  · djrpg_market_events: 거래소 전광판용 전역 이벤트 로그(계정 열이 없다)
 *  · djrpg_boss_days: 그날의 보스 한 행(계정 열이 없다)
 */
const NOT_ACCOUNT_SCOPED = new Set(['djrpg_accounts', 'djrpg_meta', 'djrpg_market', 'djrpg_market_events', 'djrpg_boss_days']);
/** 시즌 초기화가 **일부러** 비우지 않는 표 — 결제 원장은 시즌과 무관하게 보존한다. */
const SEASON_KEPT = new Set(['djrpg_accounts', 'djrpg_characters', 'djrpg_account_profiles', 'djrpg_meta',
  'djrpg_shop_wallet', 'djrpg_shop_orders', 'djrpg_shop_ledger', 'djrpg_shop_entitlements', 'djrpg_shop_requests',
  'djrpg_dungeon_attempts']);

// 작업 260에서 DDL이 `server/db/schema.mjs`로 옮겨졌다(파사드 `server/database.mjs`에는 DDL이 없다).
const SCHEMA = schemaTables('server/db/schema.mjs', 'server/dungeon-schema.mjs', 'server/world-boss-schema.mjs');

test('스키마가 만드는 모든 표가 탈퇴(ACCOUNT_TABLES) 등록부에 있다', () => {
  const missing = [...SCHEMA].filter(table => !NOT_ACCOUNT_SCOPED.has(table) && !ACCOUNT_TABLES.includes(table));
  assert.deepEqual(missing, [],
    '탈퇴 시 지우지 않은 표가 남으면 같은 아이디로 다시 가입한 사람이 이전 주인의 데이터를 물려받는다.');
  const stale = ACCOUNT_TABLES.filter(table => !SCHEMA.has(table));
  assert.deepEqual(stale, [], '등록부에만 있고 스키마에 없는 표 이름이 있다(이름 변경·오타).');
});

test('시즌 초기화 목록은 스키마 표만 가리키고, 결제 원장은 비우지 않는다', () => {
  const unknown = RESET_TABLES.filter(table => !SCHEMA.has(table));
  assert.deepEqual(unknown, [], '시즌 초기화가 스키마에 없는 표를 지우려 한다.');
  const dangerous = RESET_TABLES.filter(table => /^djrpg_shop_(orders|ledger|requests)$/.test(table) || table === 'djrpg_accounts');
  assert.deepEqual(dangerous, [], '결제 원장·계정 행은 시즌 초기화로 지우지 않는다(환불·재가입 추적 근거).');
  const expected = [...RESET_TABLES].sort();
  const derived = [...SCHEMA].filter(table => !SEASON_KEPT.has(table)).sort();
  assert.deepEqual(expected, derived,
    '시즌 초기화 대상은 "스키마 표 − 의도적으로 남기는 표(SEASON_KEPT)"와 정확히 같아야 한다 — 새 표를 만들면 둘 중 하나를 고쳐야 한다.');
});

test('이관 스크립트 목록이 스키마 표를 모두 덮는다(상점 5표 누락 회귀 방지)', () => {
  const missing = [...SCHEMA].filter(table => !MIGRATE_TABLES.includes(table));
  assert.deepEqual(missing, [],
    '이관 목록에 빠진 표는 새 DB에서 빈 표로 시작한다 — 다이아 지갑·결제 원장이 사라지는 사고가 된다.');
  const stray = MIGRATE_TABLES.filter(table => !SCHEMA.has(table));
  assert.deepEqual(stray, [], '이관 목록에만 있는 표 이름이 있다.');
  const optionalOutside = MIGRATE_OPTIONAL.filter(table => !MIGRATE_TABLES.includes(table));
  assert.deepEqual(optionalOutside, [], 'OPTIONAL_TABLES는 복사 목록의 부분집합이어야 한다(빠지면 조용히 건너뛴다).');
  assert.deepEqual([...MIGRATE_OPTIONAL].sort(), ['djrpg_announcements', 'djrpg_meta',
    'djrpg_shop_entitlements', 'djrpg_shop_ledger', 'djrpg_shop_orders', 'djrpg_shop_requests', 'djrpg_shop_wallet'].sort(),
  '예전 공용 DB에 없을 수 있어 건너뛰는 표 목록이 바뀌었다 — 바꿀 이유를 주석에 적어라.');
});
