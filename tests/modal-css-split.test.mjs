import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modalStyles } from './helpers/modal-styles.mjs';

// 작업 256 — 830줄짜리 단일 `styles/modals.css`를 도메인별 파일로 나눴다.
// 진입점은 @import만 남기고, 규칙은 `styles/modals/<도메인>.css`에 있다.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/styles/modals.css');
const DIR = resolve(ROOT, 'src/styles/modals');
const entry = readFileSync(ENTRY, 'utf8');
const imports = [...entry.matchAll(/@import\s+'([^']+)';/g)].map((match) => match[1]);

test('진입점은 규칙을 갖지 않고 도메인 파일만 순서대로 묶는다', () => {
  const withoutComments = entry.replace(/\/\*[\s\S]*?\*\//g, '');
  const rest = withoutComments.replace(/@import\s+'[^']+';/g, '').trim();
  assert.equal(rest, '', '진입점에 규칙이 남아 있으면 도메인 분리가 아니다');
  assert.deepEqual(imports, [
    './modals/equip.css',
    './modals/character.css',
    './modals/shop.css',
    './modals/account.css',
    './modals/journey.css',
    './modals/skill.css',
    './modals/utility.css',
    './modals/mail.css',
    './modals/warehouse.css',
    './modals/pouch.css',
    './modals/synth.css',
    // 공통 껍데기는 **마지막** — 닫기 버튼 44px 정규화가 모달별 크기 규칙을 이겨야 한다.
    './modals/base.css',
  ]);
});

test('모든 도메인 파일이 있고, 파일마다 무엇을 담는지 머리말이 있다', () => {
  for (const path of imports) {
    const file = resolve(dirname(ENTRY), path);
    assert.ok(existsSync(file), `${path}가 없다`);
    const css = readFileSync(file, 'utf8');
    assert.match(css, /^\/\* DJRPG 모달 — /, `${path}에 도메인 머리말이 없다`);
    assert.ok(css.trim().split('\n').length > 3, `${path}가 비어 있다`);
  }
});

test('이어 붙인 CSS는 원본의 규칙을 하나도 잃지 않는다', () => {
  const all = modalStyles();
  // 도메인마다 대표 규칙이 실제로 이어 붙은 결과에 들어 있는지 확인한다.
  for (const selector of ['.bag-item', '.character-slot', '.shop-card', '.account-line', '.floor-grid', '.skill-list',
    '.utility-content', '.mail-body', '.warehouse-grid', '.pouch-window', '.synth-window', '.modal-dialog']) {
    assert.ok(all.includes(selector), `${selector} 규칙이 사라졌다`);
  }
  // 파일 경계에서 잘린 규칙(중괄호 짝)이 없어야 한다.
  let depth = 0;
  for (const char of all.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') depth++;
    else if (char === '}') depth--;
    assert.ok(depth >= 0, '닫는 중괄호가 먼저 나온다 — 파일이 잘렸다');
  }
  assert.equal(depth, 0, '중괄호 짝이 맞지 않는다');
});

test('도메인 파일은 서로의 규칙을 다시 정의하지 않는다 — 같은 선택자·같은 본문 중복은 원본 그대로다', () => {
  const seen = new Map();
  for (const path of imports) {
    const css = readFileSync(resolve(dirname(ENTRY), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    let index = 0, head = '';
    while (index < css.length) {
      if (css[index] !== '{') { head += css[index++]; continue; }
      let depth = 1, end = index + 1;
      while (end < css.length && depth > 0) {
        if (css[end] === '{') depth++;
        else if (css[end] === '}') depth--;
        end++;
      }
      const selector = head.trim().replace(/\s+/g, ' ');
      const body = css.slice(index + 1, end - 1).trim();
      // 최상위 규칙만 본다 — @media/@keyframes 안쪽은 자기 블록 안에서만 의미가 있다.
      if (selector && !selector.startsWith('@')) {
        const key = `${selector}|${body}`;
        if (!seen.has(key)) seen.set(key, path);
        else assert.equal(seen.get(key), path, `${selector} 규칙이 두 파일에 나뉘어 있다`);
      }
      head = '';
      index = end;
    }
  }
});
