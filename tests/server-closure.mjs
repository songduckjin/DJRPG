/**
 * 서버 런타임 클로저 계산 도구 (PR-2B).
 *
 * `server/**`·`api/**`·`functions/**`에서 **값 import**만 따라가 도달 가능한 파일 전체를 구한다.
 * 서버 번들(=Cloudflare Functions)에 실제로 실리는 파일 집합이라, "필드 모듈이 서버로 새지 않았는가"를
 * 문자열 grep이 아니라 그래프로 확인할 수 있다(`tests/combat-field-split.test.mjs`).
 * `tests/architecture-boundaries.test.mjs`가 같은 방식의 계산을 자체 보유한다(그 파일은 PR-1 소유라
 * 손대지 않고, 새 경계 검사는 이 도구를 쓴다).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const posix = path => path.split('\\').join('/');
const SOURCE_EXT = /\.(mjs|js|ts|tsx)$/;

export function walk(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const path = posix(join(dir, entry));
    if (statSync(join(root, path)).isDirectory()) out.push(...walk(path));
    else if (SOURCE_EXT.test(path)) out.push(path);
  }
  return out;
}

const cache = new Map();
function sourceFile(file) {
  if (!cache.has(file)) {
    const text = readFileSync(join(root, file), 'utf8');
    cache.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS));
  }
  return cache.get(file);
}

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

function resolveEdge(file, spec) {
  if (!spec.startsWith('.')) return undefined;
  const base = resolve(join(root, dirname(file)), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.mjs')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return posix(relative(root, candidate));
  }
  return undefined;
}

/** 서버 진입점에서 도달 가능한 파일 → 그 파일을 처음 연 부모 파일. */
export function serverClosure() {
  const parents = new Map();
  const queue = ['server', 'api', 'functions'].flatMap(walk).map(file => [file, null]);
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

/** 위반 파일에서 진입점까지의 import 사슬 — 실패 메시지가 "왜"를 말하게 한다. */
export function chainTo(parents, file) {
  const chain = [file];
  let cursor = parents.get(file);
  while (cursor) { chain.push(cursor); cursor = parents.get(cursor); }
  return chain.reverse().join(' → ');
}

export function lineCount(file) {
  return readFileSync(join(root, file), 'utf8').split('\n').length;
}
