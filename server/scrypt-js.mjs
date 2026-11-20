// 순수 JS scrypt (PBKDF2-HMAC-SHA256 + Salsa20/8) — Cloudflare Workers 폴백용.
//
// Cloudflare Workers의 `node:crypto`에는 `scrypt`가 없거나 호출이 예외로 끝나는 경우가 있다.
// 그런 런타임에서도 구형 비밀번호(`salt:hex`, N=16384·r=8·p=1)와 새 가입 해시(N=2048)를
// 서버 안에서 검증할 수 있도록, PBKDF2는 WebCrypto(`crypto.subtle`)로, ROMix만 JS로 계산한다.
// 값은 RFC 7914 그대로이며 `tests/legacy-login.test.mjs`가 `node:crypto` 결과와 대조한다.

const encoder = new TextEncoder();

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return encoder.encode(value);
  return new Uint8Array(value);
}

async function subtle() {
  const webcrypto = globalThis.crypto ?? (await import('node:crypto')).webcrypto;
  if (!webcrypto?.subtle) throw new Error('WebCrypto를 사용할 수 없습니다.');
  return webcrypto.subtle;
}

/** PBKDF2-HMAC-SHA256 (반복 1회) — scrypt의 앞뒤 두 단계가 쓰는 형태 그대로다. */
async function pbkdf2Sha256(password, salt, length) {
  const cryptoSubtle = await subtle();
  const key = await cryptoSubtle.importKey('raw', password, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const rounds = Math.ceil(length / 32);
  const block = new Uint8Array(salt.length + 4);
  block.set(salt, 0);
  const counter = new DataView(block.buffer);
  const out = new Uint8Array(rounds * 32);
  for (let index = 1; index <= rounds; index++) {
    counter.setUint32(salt.length, index, false);
    out.set(new Uint8Array(await cryptoSubtle.sign('HMAC', key, block)), (index - 1) * 32);
  }
  return out.subarray(0, length);
}

function rotateLeft(value, count) {
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}

/** Salsa20/8 코어 — 16워드를 제자리에서 섞는다(AEAD 없이 코어만). */
function salsa208(x) {
  const start = x.slice();
  for (let round = 0; round < 8; round += 2) {
    x[4] ^= rotateLeft((x[0] + x[12]) >>> 0, 7); x[8] ^= rotateLeft((x[4] + x[0]) >>> 0, 9);
    x[12] ^= rotateLeft((x[8] + x[4]) >>> 0, 13); x[0] ^= rotateLeft((x[12] + x[8]) >>> 0, 18);
    x[9] ^= rotateLeft((x[5] + x[1]) >>> 0, 7); x[13] ^= rotateLeft((x[9] + x[5]) >>> 0, 9);
    x[1] ^= rotateLeft((x[13] + x[9]) >>> 0, 13); x[5] ^= rotateLeft((x[1] + x[13]) >>> 0, 18);
    x[14] ^= rotateLeft((x[10] + x[6]) >>> 0, 7); x[2] ^= rotateLeft((x[14] + x[10]) >>> 0, 9);
    x[6] ^= rotateLeft((x[2] + x[14]) >>> 0, 13); x[10] ^= rotateLeft((x[6] + x[2]) >>> 0, 18);
    x[3] ^= rotateLeft((x[15] + x[11]) >>> 0, 7); x[7] ^= rotateLeft((x[3] + x[15]) >>> 0, 9);
    x[11] ^= rotateLeft((x[7] + x[3]) >>> 0, 13); x[15] ^= rotateLeft((x[11] + x[7]) >>> 0, 18);
    x[1] ^= rotateLeft((x[0] + x[3]) >>> 0, 7); x[2] ^= rotateLeft((x[1] + x[0]) >>> 0, 9);
    x[3] ^= rotateLeft((x[2] + x[1]) >>> 0, 13); x[0] ^= rotateLeft((x[3] + x[2]) >>> 0, 18);
    x[6] ^= rotateLeft((x[5] + x[4]) >>> 0, 7); x[7] ^= rotateLeft((x[6] + x[5]) >>> 0, 9);
    x[4] ^= rotateLeft((x[7] + x[6]) >>> 0, 13); x[5] ^= rotateLeft((x[4] + x[7]) >>> 0, 18);
    x[11] ^= rotateLeft((x[10] + x[9]) >>> 0, 7); x[8] ^= rotateLeft((x[11] + x[10]) >>> 0, 9);
    x[9] ^= rotateLeft((x[8] + x[11]) >>> 0, 13); x[10] ^= rotateLeft((x[9] + x[8]) >>> 0, 18);
    x[12] ^= rotateLeft((x[15] + x[14]) >>> 0, 7); x[13] ^= rotateLeft((x[12] + x[15]) >>> 0, 9);
    x[14] ^= rotateLeft((x[13] + x[12]) >>> 0, 13); x[15] ^= rotateLeft((x[14] + x[13]) >>> 0, 18);
  }
  for (let word = 0; word < 16; word++) x[word] = (x[word] + start[word]) >>> 0;
}

/** BlockMix — `x`(32·r 워드)를 제자리에서 섞고, 중간 결과는 `scratch`에 둔다. */
function blockMix(x, scratch, r) {
  const carry = new Uint32Array(16);
  carry.set(x.subarray((2 * r - 1) * 16, 2 * r * 16));
  for (let block = 0; block < 2 * r; block++) {
    for (let word = 0; word < 16; word++) carry[word] ^= x[block * 16 + word];
    salsa208(carry);
    scratch.set(carry, block * 16);
  }
  for (let block = 0; block < r; block++) x.set(scratch.subarray(block * 2 * 16, block * 2 * 16 + 16), block * 16);
  for (let block = 0; block < r; block++) x.set(scratch.subarray((block * 2 + 1) * 16, (block * 2 + 1) * 16 + 16), (r + block) * 16);
}

/** ROMix — 메모리 128·r·N 바이트를 채우고 다시 섞는다. N은 2의 거듭제곱이다. */
function romix(x, blockSize, N) {
  const words = 32 * blockSize;
  const memory = new Uint32Array(words * N);
  const scratch = new Uint32Array(words);
  for (let index = 0; index < N; index++) { memory.set(x, index * words); blockMix(x, scratch, blockSize); }
  for (let index = 0; index < N; index++) {
    const pick = x[(2 * blockSize - 1) * 16] & (N - 1);
    const offset = pick * words;
    for (let word = 0; word < words; word++) x[word] ^= memory[offset + word];
    blockMix(x, scratch, blockSize);
  }
}

/**
 * scrypt(password, salt, keyLen, {N, r, p}) — `node:crypto` 와 같은 입력 규칙(문자열은 UTF-8)이다.
 * 반환값은 `Uint8Array`다.
 */
export async function scryptJs(password, salt, keyLength, { N = 16384, r = 8, p = 1 } = {}) {
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0) throw new Error('scrypt N은 2의 거듭제곱이어야 합니다.');
  if (!Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) throw new Error('scrypt r·p가 올바르지 않습니다.');
  const passwordBytes = bytesOf(password), saltBytes = bytesOf(salt);
  const blockBytes = p * 128 * r;
  const mixed = await pbkdf2Sha256(passwordBytes, saltBytes, blockBytes);
  const words = 32 * r;
  for (let parallel = 0; parallel < p; parallel++) {
    const start = parallel * 128 * r;
    const block = new Uint32Array(words);
    for (let word = 0; word < words; word++) {
      const at = start + word * 4;
      block[word] = (mixed[at] | (mixed[at + 1] << 8) | (mixed[at + 2] << 16) | (mixed[at + 3] << 24)) >>> 0;
    }
    romix(block, r, N);
    for (let word = 0; word < words; word++) {
      const value = block[word], at = start + word * 4;
      mixed[at] = value & 255; mixed[at + 1] = (value >>> 8) & 255; mixed[at + 2] = (value >>> 16) & 255; mixed[at + 3] = (value >>> 24) & 255;
    }
  }
  return pbkdf2Sha256(passwordBytes, mixed, keyLength);
}
