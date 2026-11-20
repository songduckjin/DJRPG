import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const prefixes = ['djrpg-migrate-', 'djrpg-characters-', 'djrpg-heal-load-', 'djrpg-item-name-', 'djrpg-season-'];

export function checkedTempDbDirectory(directory) {
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !prefixes.some(prefix => basename(target).startsWith(prefix))) {
    throw new Error('테스트 임시 DB 경로가 올바르지 않습니다.');
  }
  return target;
}

export async function removeTempDbDirectory(directory) {
  const target = checkedTempDbDirectory(directory);
  try { await rm(target, { recursive: true, force: true }); }
  catch (error) {
    if (process.platform !== 'win32' || !['EBUSY', 'EPERM'].includes(error?.code)) throw error;
    // Windows libsql 네이티브 핸들은 client.close() 뒤에도 테스트 프로세스가 끝날 때까지 남을 수 있다.
    const script = fileURLToPath(new URL('./remove-temp-db.mjs', import.meta.url));
    const child = spawn(process.execPath, [script, target], { detached: true, stdio: 'ignore', windowsHide: true });
    await new Promise((resolveSpawn, rejectSpawn) => {
      child.once('spawn', resolveSpawn);
      child.once('error', rejectSpawn);
    });
    child.unref();
  }
}
