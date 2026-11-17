import { createClient } from '@libsql/client';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const input = createInterface({ input: process.stdin });
const [line] = await once(input, 'line');
input.close();
const { url, authToken } = JSON.parse(line);
if (typeof url !== 'string' || typeof authToken !== 'string' || !url || !authToken) throw new Error('Turso 연결 정보가 필요합니다.');

const directory = join(process.cwd(), '.backups');
await mkdir(directory, { recursive: true });
const filename = `djrpg-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`;
const path = join(directory, filename);
const remote = createClient({ url, authToken });
const local = createClient({ url: `file:${path}` });
let transaction;
let complete = false;
let localClosed = false;
const counts = {};
try {
  transaction = await remote.transaction('read');
  const objects = (await transaction.execute("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','view','trigger') AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,name")).rows;
  const tables = objects.filter(entry => entry.type === 'table');
  if (!tables.some(entry => entry.name === 'djrpg_accounts')) throw new Error('계정 테이블을 찾지 못했습니다.');
  await local.execute('PRAGMA foreign_keys=OFF');
  for (const object of tables) await local.execute(object.sql);
  for (const table of tables) {
    const name = `"${String(table.name).replaceAll('"', '""')}"`;
    let offset = 0;
    while (true) {
      const page = await transaction.execute({ sql: `SELECT * FROM ${name} LIMIT 250 OFFSET ?`, args: [offset] });
      if (!page.rows.length) break;
      const columns = page.columns.map(column => `"${column.replaceAll('"', '""')}"`).join(',');
      const placeholders = page.columns.map(() => '?').join(',');
      await local.batch(page.rows.map(row => ({ sql: `INSERT INTO ${name} (${columns}) VALUES (${placeholders})`, args: page.columns.map(column => row[column]) })), 'write');
      offset += page.rows.length;
    }
    counts[table.name] = offset;
  }
  for (const object of objects.filter(entry => entry.type !== 'table')) await local.execute(object.sql);
  await transaction.commit();
  await local.execute('PRAGMA foreign_keys=ON');
  if ((await local.execute('PRAGMA foreign_key_check')).rows.length) throw new Error('백업 파일의 외래 키 검사에 실패했습니다.');
  for (const [table, expected] of Object.entries(counts)) {
    const name = `"${table.replaceAll('"', '""')}"`;
    const actual = Number((await local.execute(`SELECT COUNT(*) AS n FROM ${name}`)).rows[0].n);
    if (actual !== expected) throw new Error(`${table} 행 수가 일치하지 않습니다.`);
  }
  const integrity = (await local.execute('PRAGMA integrity_check')).rows[0].integrity_check;
  if (integrity !== 'ok') throw new Error('백업 파일 무결성 검사에 실패했습니다.');
  await local.close();
  localClosed = true;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  console.log(JSON.stringify({ path, bytes: (await stat(path)).size, sha256: hash.digest('hex'), counts }));
  complete = true;
} finally {
  if (transaction && !transaction.closed) await transaction.rollback();
  await remote.close();
  if (!localClosed) await local.close();
  if (!complete) await rm(path, { force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
}
