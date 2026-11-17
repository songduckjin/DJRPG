import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { runtimeEnv } from './env.mjs';

const scrypt = promisify(scryptCallback);
const passwordCost = { N: 2048, r: 8, p: 1 };
const hexSalt = /^[a-f\d]{32}$/;
const hexHash = /^[a-f\d]{128}$/;
export const sign = (value, env = runtimeEnv()) => createHmac('sha256', env.TURSO_AUTH_TOKEN).update(value).digest('base64url');
// `sid`는 마지막 로그인에서 발급한 세션 번호다. 두 번째 기기 로그인이 덮어쓰면 이 토큰은 즉시 무효가 된다.
export const tokenFor = (id, env = runtimeEnv(), sid) => {
  const value = Buffer.from(JSON.stringify(sid ? { id, sid, exp: Date.now() + 30 * 86400_000 } : { id, exp: Date.now() + 30 * 86400_000 })).toString('base64url');
  return `${value}.${sign(value, env)}`;
};
export function tokenPayload(request, env = runtimeEnv()) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token || token.length > 4096) return null;
  const [value, mac, extra] = token.split('.');
  if (!value || !mac || extra || !/^[\w-]+$/.test(value)) return null;
  const expected = Buffer.from(sign(value, env));
  const received = Buffer.from(mac);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (typeof payload.id !== 'string' || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    // 세션 열 도입 전에 발급된 토큰은 sid가 없다(구 토큰 호환).
    if (payload.sid !== undefined && (typeof payload.sid !== 'string' || !payload.sid || payload.sid.length > 64)) return null;
    return { id: payload.id, sid: typeof payload.sid === 'string' ? payload.sid : undefined };
  }
  catch { return null; }
}
export const tokenId = (request, env = runtimeEnv()) => tokenPayload(request, env)?.id ?? null;
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64, passwordCost)).toString('hex');
  return `scrypt$${passwordCost.N}$${passwordCost.r}$${passwordCost.p}$${salt}$${hash}`;
}
export function needsPasswordUpgrade(stored) {
  const [salt, hex, extra] = String(stored).split(':');
  return !extra && hexSalt.test(salt) && hexHash.test(hex ?? '');
}
export async function verifyPassword(password, stored) {
  let salt, hex, options;
  if (needsPasswordUpgrade(stored)) {
    [salt, hex] = String(stored).split(':');
  } else {
    const [algorithm, n, r, p, storedSalt, storedHash, extra] = String(stored).split('$');
    const N = Number(n), blockSize = Number(r), parallelism = Number(p);
    if (extra || algorithm !== 'scrypt' || !hexSalt.test(storedSalt ?? '') || !hexHash.test(storedHash ?? '') ||
      !Number.isInteger(N) || N < 1024 || N > 16384 || (N & (N - 1)) !== 0 || blockSize !== 8 || parallelism !== 1) return false;
    salt = storedSalt;
    hex = storedHash;
    options = { N, r: blockSize, p: parallelism };
  }
  const actual = await scrypt(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
