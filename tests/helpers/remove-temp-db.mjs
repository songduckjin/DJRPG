import { rm } from 'node:fs/promises';
import { checkedTempDbDirectory } from './temp-db.mjs';

const target = checkedTempDbDirectory(process.argv[2] ?? '');
for (let attempt = 0; attempt < 300; attempt += 1) {
  try { await rm(target, { recursive: true, force: true }); process.exit(0); }
  catch (error) {
    if (!['EBUSY', 'EPERM'].includes(error?.code)) throw error;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
throw new Error('테스트 임시 DB 잠금이 60초 동안 해제되지 않았습니다.');
