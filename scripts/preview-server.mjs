/**
 * 로컬 검수용 정적 서버 — `dist/` 를 내려주고 `/api/account` 만 가짜로 응답한다.
 * 운영 배포와 무관한 확인 도구다(레포 빌드 산출물은 건드리지 않는다).
 *
 * 사용: `node scripts/preview-server.mjs [port]`  →  http://127.0.0.1:4173
 * 게스트로 시작하면 궁수(male) 세이브가 내려오고, `?job=warrior` 로 전사를 볼 수 있다.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function save(gender, job) {
  const now = Date.now();
  return { version: 1, name: '검수용궁수', accountId: 'PREVIEW1', gender, job, auto: true, autoClimb: true, level: 12, exp: 1200, gold: 48000, floor: 7, maxFloor: 7, floorKills: 12, kills: 640, bossKills: 6, playSeconds: 9000, health: 900, equipment: {}, equipmentCollection: [], bag: [], tutorial: 3, stones: 12, skillPoints: 0, lastActiveAt: now, learned: ['doubleShot', 'multiShot', 'iceArrow', 'snipe'], passives: [], quickSlots: ['doubleShot', 'multiShot', 'iceArrow'], skillLevels: { doubleShot: 3, multiShot: 2, iceArrow: 1, snipe: 1 } };
}

const server = createServer(async (request, response) => {
  if (request.url?.startsWith('/api/account')) {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch { /* 빈 본문 */ }
    const job = new URL(request.url, 'http://localhost').searchParams.get('job') === 'warrior' ? 'warrior' : 'archer';
    const gender = payload.gender === 'female' ? 'female' : 'male';
    const account = { accountId: 'PREVIEW1', loginId: '검수용', gender, job, guest: true, token: 'preview-token', save: save(gender, job), revision: 0, characterSlot: 1, offlineSeconds: 0 };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(account));
    return;
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  const path = normalize(join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  try {
    const data = await readFile(path);
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    response.end(data);
  } catch {
    const html = await readFile(join(root, 'index.html')).catch(() => Buffer.from('not found'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  }
});
server.listen(port, '127.0.0.1', () => console.log(`preview on http://127.0.0.1:${port}`));
