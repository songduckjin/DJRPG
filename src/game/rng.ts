/**
 * 전투 결정적 난수 (작업 211).
 *
 * 던전은 `start`에서 서버가 준 시드를 받아 전투를 돌리고, 서버는 같은 시드로 그 전투를 다시 돌려
 * 클리어를 확인한다. 그러려면 전투에 쓰이는 난수가 **시드 + 스텝 수**만으로 정해져야 한다.
 * 그래서 전투 경로(`world.ts`·`items.ts`·`bossLoot.ts`·`dungeonBattle.ts`)는 `Math.random()` 대신
 * 이 파일의 `random()`을 쓰고, 던전은 자기 시드 난수를 `withRandom`으로 감싸서 돌린다.
 *
 * 기본값은 `Math.random`이라 시드를 쓰지 않는 화면(메인 사냥·연출)은 지금과 똑같이 움직인다.
 * 난수를 쓰는 함수는 **동기**여야 한다 — `withRandom`이 끝나면 이전 난수로 돌아가기 때문이다.
 */
export type Random = () => number;

// `undefined`이면 그때마다 `Math.random`을 쓴다 — 테스트가 `Math.random`을 바꿔 끼워도 그대로 따라간다.
let active: Random | undefined;

/** 시드 하나로 재현되는 난수(mulberry32). 같은 시드 + 같은 호출 순서 = 같은 값. */
export function seededRandom(seed: number): Random {
  let state = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 전투 경로가 쓰는 난수. 시드가 걸려 있으면 그 시드의 값이 나온다. */
export const random: Random = () => (active ?? Math.random)();

/** 지금 난수를 `next`로 바꾸고 이전 난수를 돌려준다(`undefined`면 기본 `Math.random`으로 돌아간다). */
export function useRandom(next?: Random): Random | undefined {
  const previous = active;
  active = next;
  return previous;
}

/** `run`을 하는 동안만 `next` 난수를 쓴다. 예외가 나도 이전 난수로 돌아간다. */
export function withRandom<T>(next: Random, run: () => T): T {
  const previous = useRandom(next);
  try {
    return run();
  } finally {
    useRandom(previous);
  }
}

/** 시드 없는 전투(게스트·시드 실패)도 재현 가능하도록 남기는 서버와 같은 32비트 시드. */
export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}
