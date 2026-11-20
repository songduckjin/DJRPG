/**
 * 보물 주머니 개봉의 **빛과 입자** (작업 214 `#5204`·`#5222`·`#5241`).
 *
 * 사용자가 "빛이 그냥 빛이어야 되는데 뭔 흰색 모형이 있어?"라고 한 뒤, "1차원적인 효과 넣지 말고
 * 최대한 부드럽고 세련되게"라고 했다. 각진 `conic-gradient` 부채꼴·단단한 흰 원판(`radial-gradient`)을
 * CSS로 그리던 것을 모두 걷어 내고, 무대 위에 투명 Canvas 한 장을 올려 **60fps `requestAnimationFrame`** 으로
 * 경계선이 없는 빛만 그린다.
 *
 * - **쪼으는 구간(~1.075초)**: 주머니 입구 주변으로 흰빛 가루(모트)가 **모여들고**, 여러 겹의
 *   가우시안 백색 글로우가 아주 천천히 고조된다(작은 원 4겹을 `lighter`로 더해 가장자리가 없다).
 * - **절정(활짝 열리는 순간)**: 순백색 방사형 빛이 130 → 370px로 빠르게 번졌다가 0.42초 만에
 *   가라앉고, **흰빛 입자 36개가 사방으로 흩어지며** 0.5~0.9초 동안 사라진다.
 * - `prefers-reduced-motion`이면 이 모듈을 아예 만들지 않는다(호출부가 건너뛴다).
 *
 * 캔버스는 팝업(330px)보다 살짝 큰 560×560 CSS px이고 `pointer-events: none` + `mix-blend-mode: screen`이라
 * 누름을 막지 않고 어두운 카드 위에서 빛으로만 얹힌다. 기기 픽셀비는 2까지 쓴다(모바일 발열·메모리).
 */

/** 캔버스 한 변(CSS px) — 팝업 330px보다 살짝 큰 정도. */
export const POUCH_LIGHT_SIZE = 560;
/** 쪼으는 구간에 모여드는 흰빛 가루의 개수. */
export const POUCH_LIGHT_MOTES = 26;
/** 절정에 사방으로 흩어지는 흰빛 입자의 개수. */
export const POUCH_LIGHT_SPARKS = 36;
/** 기기 픽셀비 상한 — 3배 화면에서도 2배까지만 그린다. */
const MAX_DPR = 2;
const TAU = Math.PI * 2;

export type PouchLightHandle = {
  canvas: HTMLCanvasElement;
  /** [열기]를 누른 순간부터 `burstAt`까지 빛이 고조되고, `endAt`에 멈춘다(ms). 다시 부르면 처음부터. */
  start: (burstAt: number, endAt: number) => void;
  stop: () => void;
};

type Mote = { angle: number; spin: number; radius: number; size: number; period: number; offset: number };
type Spark = { angle: number; speed: number; ttl: number; size: number; twist: number; streak: boolean };

/** `#rrggbb` → 0~255 세 값(빛 색). 형식이 다르면 순백. */
function inkRgb(ink: string): [number, number, number] {
  const value = ink.trim().replace('#', '');
  const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  const parsed = Number.parseInt(full.slice(0, 6), 16);
  return Number.isFinite(parsed) ? [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255] : [255, 255, 255];
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

/**
 * 개봉 무대에 얹을 투명 Canvas를 만든다. 2D 컨텍스트가 없는 환경(테스트 스텁 등)에서는 `null` —
 * 호출부는 조용히 빛 없이 연출한다.
 */
export function createPouchLight(ink = '#ffffff'): PouchLightHandle | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  if (!canvas || typeof (canvas as HTMLCanvasElement).getContext !== 'function') return null;
  const context = (canvas as HTMLCanvasElement).getContext('2d');
  if (!context) return null;
  const dpr = Math.min(MAX_DPR, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  canvas.width = Math.round(POUCH_LIGHT_SIZE * dpr);
  canvas.height = Math.round(POUCH_LIGHT_SIZE * dpr);
  canvas.className = 'pouch-light';
  canvas.setAttribute('aria-hidden', 'true');
  const paint = context;
  paint.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [red, green, blue] = inkRgb(ink);
  const white = (alpha: number): string => `rgba(${red},${green},${blue},${alpha.toFixed(3)})`;
  const center = POUCH_LIGHT_SIZE / 2;

  // 가루·입자는 매번 같은 모양이 되도록 만들 때 한 번만 흩뿌린다.
  const motes: Mote[] = Array.from({ length: POUCH_LIGHT_MOTES }, (_, index) => ({
    angle: (index * 2.399963) % TAU,
    spin: 0.5 + ((index * 37) % 11) / 18,
    radius: 78 + ((index * 53) % 62),
    size: 0.7 + ((index * 29) % 7) / 6,
    period: 560 + ((index * 41) % 260),
    offset: ((index * 17) % 23) / 23,
  }));
  const makeSparks = (): Spark[] => Array.from({ length: POUCH_LIGHT_SPARKS }, (_, index) => ({
    angle: (index / POUCH_LIGHT_SPARKS) * TAU + ((index * 13) % 7) * 0.03,
    speed: 96 + ((index * 71) % 190),
    ttl: 480 + ((index * 47) % 420),
    size: 0.9 + ((index * 23) % 8) / 4,
    twist: (index % 9) * 0.7,
    streak: index % 3 === 0,
  }));
  let sparks: Spark[] = makeSparks();

  let frameHandle = 0;
  let startedAt = 0;
  let burstAt = 0;
  let endAt = 0;

  /** 여러 겹의 가우시안 백색 글로우 — 겹쳐 더해도 가장자리가 보이지 않는다. */
  const paintGlow = (radius: number, alpha: number): void => {
    if (radius <= 1 || alpha <= 0.002) return;
    for (let layer = 0; layer < 4; layer++) {
      const spread = radius * (1 - layer * 0.17);
      const strength = alpha * (0.30 - layer * 0.055);
      if (spread <= 1 || strength <= 0.002) continue;
      const gradient = paint.createRadialGradient(center, center, 0, center, center, spread);
      gradient.addColorStop(0, white(strength));
      gradient.addColorStop(0.42, white(strength * 0.34));
      gradient.addColorStop(0.68, white(strength * 0.11));
      gradient.addColorStop(1, white(0));
      paint.fillStyle = gradient;
      paint.beginPath();
      paint.arc(center, center, spread, 0, TAU);
      paint.fill();
    }
  };

  const paintMotes = (time: number, build: number): void => {
    for (const mote of motes) {
      const life = ((time / mote.period) + mote.offset) % 1;
      const radius = mote.radius * (1 - life) + 6 * life;
      const angle = mote.angle + mote.spin * life;
      const alpha = Math.sin(Math.PI * life) ** 1.4 * (0.18 + 0.62 * build);
      if (alpha <= 0.01) continue;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius * 0.74;
      paint.fillStyle = white(alpha);
      paint.beginPath();
      paint.arc(x, y, mote.size, 0, TAU);
      paint.fill();
      // 가장 밝은 가루에는 아주 옅은 번짐을 덧대 '빛 알갱이'처럼 보이게 한다.
      if (alpha > 0.4) {
        const halo = paint.createRadialGradient(x, y, 0, x, y, mote.size * 4.5);
        halo.addColorStop(0, white(alpha * 0.35));
        halo.addColorStop(1, white(0));
        paint.fillStyle = halo;
        paint.beginPath();
        paint.arc(x, y, mote.size * 4.5, 0, TAU);
        paint.fill();
      }
    }
  };

  const paintSparks = (age: number): void => {
    for (const spark of sparks) {
      if (age > spark.ttl) continue;
      const travel = spark.speed * (1 - Math.exp(-age / 260));
      const x = center + Math.cos(spark.angle) * travel;
      const y = center + Math.sin(spark.angle) * travel * 0.92 - 12 * (age / spark.ttl);
      const fade = (1 - age / spark.ttl) ** 1.5;
      const size = spark.size * (0.72 + 0.28 * Math.cos(age / 85 + spark.twist));
      if (spark.streak) {
        const tail = Math.min(travel * 0.28, 16);
        paint.strokeStyle = white(fade * 0.28);
        paint.lineWidth = Math.max(0.6, size * 0.7);
        paint.beginPath();
        paint.moveTo(x - Math.cos(spark.angle) * tail, y - Math.sin(spark.angle) * tail * 0.92);
        paint.lineTo(x, y);
        paint.stroke();
      }
      if (size > 1.8) {
        const bloom = paint.createRadialGradient(x, y, 0, x, y, size * 3.2);
        bloom.addColorStop(0, white(fade * 0.22));
        bloom.addColorStop(1, white(0));
        paint.fillStyle = bloom;
        paint.beginPath();
        paint.arc(x, y, size * 3.2, 0, TAU);
        paint.fill();
      }
      paint.fillStyle = white(fade * 0.9);
      paint.beginPath();
      paint.arc(x, y, size, 0, TAU);
      paint.fill();
    }
  };

  const paintFrame = (time: number): void => {
    paint.clearRect(0, 0, POUCH_LIGHT_SIZE, POUCH_LIGHT_SIZE);
    paint.globalCompositeOperation = 'lighter';
    // 쪼으는 구간 — 아주 천천히 고조되고 숨쉬듯 미세하게 흔들린다.
    const build = clamp01(time / Math.max(1, burstAt));
    const breath = 1 + 0.07 * Math.sin(time / 80) * build;
    paintGlow(78 + 56 * easeOutCubic(build), (0.05 + 0.38 * build * build) * breath);
    if (time <= burstAt + 90) paintMotes(time, build);
    const age = time - burstAt;
    if (age >= 0) {
      // 절정 — 순백색이 팝업 바깥까지 번졌다가 빠르게 가라앉는다.
      const flash = clamp01(1 - age / 420);
      paintGlow(130 + 240 * easeOutCubic(Math.min(1, age / 200)), 0.92 * flash * flash);
      paintGlow(240 + 190 * easeOutCubic(Math.min(1, age / 400)), 0.4 * clamp01(1 - age / 640) ** 2);
      paintSparks(age);
    }
  };

  const tick = (now: number): void => {
    frameHandle = 0;
    if (!startedAt) return;
    const time = now - startedAt;
    paintFrame(time);
    if (time < endAt) schedule();
    else paint.clearRect(0, 0, POUCH_LIGHT_SIZE, POUCH_LIGHT_SIZE);
  };

  const schedule = (): void => {
    if (frameHandle || typeof requestAnimationFrame !== 'function') return;
    frameHandle = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (frameHandle && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    startedAt = 0;
    paint.clearRect(0, 0, POUCH_LIGHT_SIZE, POUCH_LIGHT_SIZE);
  };

  const start = (burst: number, end: number): void => {
    stop();
    sparks = makeSparks();
    burstAt = burst;
    endAt = Math.max(end, burst + 1);
    startedAt = (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()) || 1;
    schedule();
  };

  return { canvas: canvas as HTMLCanvasElement, start, stop };
}
