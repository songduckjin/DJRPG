import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { runtimeEnv } from './env.mjs';

const scrypt = promisify(scryptCallback);
export const sign = (value, env = runtimeEnv()) => createHmac('sha256', env.TURSO_AUTH_TOKEN).update(value).digest('base64url');
export const tokenFor = (id, env = runtimeEnv()) => {
  const value = Buffer.from(JSON.stringify({ id, exp: Date.now() + 30 * 86400_000 })).toString('base64url');
  return `${value}.${sign(value, env)}`;
};
export function tokenId(request, env = runtimeEnv()) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token || token.length > 4096) return null;
  const [value, mac, extra] = token.split('.');
  if (!value || !mac || extra || !/^[\w-]+$/.test(value)) return null;
  const expected = Buffer.from(sign(value, env));
  const received = Buffer.from(mac);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try { const payload = JSON.parse(Buffer.from(value, 'base64url').toString()); return typeof payload.id === 'string' && Number.isFinite(payload.exp) && payload.exp > Date.now() ? payload.id : null; }
  catch { return null; }
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored).split(':');
  if (!salt || !/^[a-f\d]{128}$/.test(hex ?? '')) return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
