import { Container, Sprite, Text } from 'pixi.js';
import type { Rarity } from '../store';
import type { World } from '../world';

const rarityColors: Record<Rarity, number> = { common: 0x9ca3af, magic: 0x60a5fa, rare: 0xfacc15, epic: 0xc084fc, unique: 0xfb923c, legendary: 0xf87171 };
const slashStrength: Record<Rarity, number> = { common: 0, magic: 1, rare: 2, epic: 3, unique: 4, legendary: 5 };
import { dragonOrbitFactor, dragonRise, slash2SecondHit } from '../skills';
import type { Effect } from '../world';
import type { Art, GameView } from '../render';

export function weaponSlashColor(world: Pick<World, 'save'>): number {
  return world.save.equipment.weapon ? rarityColors[world.save.equipment.weapon.rarity] : 0xffffff;
}

/**
 * 휘두르기 검기 스프라이트의 틴트 — 무기 등급색을 12%만 섞는다.
 *
 * 확정 시안의 은빛 검기 + 황금빛 지면 충격파 색감이 기준이라 등급색으로 통째로 물들이지
 * 않고, 등급이 높을수록 아주 조금만 그 색으로 기울게 한다(맨손은 흰색 그대로).
 */
export function slashTint(world: Pick<World, 'save'>): number {
  if (!world.save.equipment.weapon) return 0xffffff;
  const color = weaponSlashColor(world);
  const mix = (channel: number): number => Math.round(255 * .88 + channel * .12);
  return mix(color >> 16 & 255) << 16 | mix(color >> 8 & 255) << 8 | mix(color & 255);
}

export function drawSkillVfx(this: GameView, world: World, effect: Effect, x: number, y: number, t: number, screenAngle: number, time: number): boolean {
    if (effect.kind === 'slash') return true;
    if (effect.kind === 'hell') { drawWhirlSlash.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'shot') { drawArrow.call(this, effect, x, y, screenAngle); return true; }
    if (effect.kind === 'rain') { drawArrowRain.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'hawk') { drawHawkEye.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'burst') { drawBurst.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'nova') { drawNova.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'ward') { drawWard.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'slash2') {
      // [작업 213] 이단참 — 은빛·강철빛 이중 초승달 횡베기.
      // 1타(0초)는 정방향으로 크게 지나가고, 2타(`slash2SecondHit`초)는 같은 검기를 좌우 반전해
      // 되받아 베는 역방향으로 잔상처럼 얹는다. 지면 충격파는 2타가 들어갈 때 발밑에서 번진다.
      let sprites = this.vfxSprites.get(effect);
      if (!sprites) {
        const first = new Sprite(this.textures.fxSlash2Dual);
        first.anchor.set(.5);
        first.blendMode = 'add';
        const back = new Sprite(this.textures.fxSlash2Dual);
        back.anchor.set(.5);
        back.blendMode = 'add';
        const shock = new Sprite(this.textures.fxSlash2Ground);
        shock.anchor.set(.5);
        shock.blendMode = 'add';
        this.skillVfx.addChild(back, shock, first);
        sprites = [first, back, shock];
        this.vfxSprites.set(effect, sprites);
      }
      const [first, back, shock] = sprites;
      const tint = slashTint(world);
      const strength = world.save.equipment.weapon ? slashStrength[world.save.equipment.weapon.rarity] : 0;
      const forwardX = Math.cos(screenAngle), forwardY = Math.sin(screenAngle);
      const age = Number.isFinite(effect.age) ? effect.age : t * (effect.duration || .55);
      const phase = (start: number, life: number): number => Math.max(0, Math.min(1, (age - start) / life));
      const firstPhase = phase(0, .2);
      const backPhase = phase(slash2SecondHit, .26);
      // 1타: 정방향 횡베기 — 히어로 앞쪽에서 뻗어 나가며 사라진다.
      const firstWidth = (176 + strength * 7) * (.84 + firstPhase * .34);
      const firstScale = firstWidth / first.texture.width;
      const reach = 18 + firstPhase * 26;
      first.position.set(x + forwardX * reach, y + forwardY * reach * .55 - 36);
      first.rotation = screenAngle - .17;
      first.scale.set(firstScale, firstScale * .82);
      first.alpha = firstPhase > 0 && firstPhase < 1 ? Math.sin(Math.PI * firstPhase) : 0;
      first.tint = tint;
      // 2타: 되받아 베기 — 좌우를 뒤집고 반대 각도로 그어 두 궤적이 X자로 교차한다.
      const backWidth = (204 + strength * 8) * (.8 + backPhase * .34);
      const backScale = backWidth / back.texture.width;
      const backReach = 24 + backPhase * 30;
      back.position.set(x + forwardX * backReach, y + forwardY * backReach * .55 - 44);
      back.rotation = screenAngle + .2;
      back.scale.set(-backScale, backScale * .86);
      back.alpha = backPhase > 0 && backPhase < 1 ? Math.sin(Math.PI * backPhase) : 0;
      back.tint = tint;
      const shockWidth = (186 + strength * 6) * (.86 + backPhase * .32);
      shock.position.set(x + forwardX * shockWidth * .34, y + forwardY * shockWidth * .34 * .55);
      shock.scale.set(shockWidth / shock.texture.width, shockWidth / shock.texture.width * .62);
      shock.alpha = backPhase > 0 && backPhase < 1 ? Math.sin(Math.PI * backPhase) : 0;
      shock.tint = tint;
      return true;
    }
    if (effect.kind === 'warcry') return true;
    if (effect.kind === 'hit' || effect.kind === 'death') return false;
    if (effect.kind === 'spin') { this.drawDragon(effect, x, y, t, time); return true; }
    // `hell`(회전참격)은 위에서 전용 이펙트로 처리한다(작업 215).
    const art: Art = effect.kind === 'slam' || effect.kind === 'crushing' ? 'fxSlam' : effect.kind === 'power' ? 'fxPower' : effect.kind === 'destroy' ? 'fxDestroy' : 'fxSlash';
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      const sprite = new Sprite(this.textures[art]);
      sprite.anchor.set(.5);
      sprite.blendMode = 'add';
      this.skillVfx.addChild(sprite);
      sprites = [sprite];
      this.vfxSprites.set(effect, sprites);
    }
    const size = effect.kind === 'destroy' ? 260 : effect.kind === 'slam' ? 335 : effect.kind === 'crushing' ? 245 : effect.kind === 'power' ? 165 : 150;
    for (const sprite of sprites) {
      if (effect.kind === 'crushing') {
        // [작업 212] 10연타 — 타격 간격(62ms)마다 지면 링과 내려찍기 스프라이트가 한 번씩 깜빡인다.
        // 처음부터 때리므로 예고용 링 단계는 없고, 한 타가 끝날 때마다 다음 타가 시작된다.
        const interval = Math.max(.02, effect.strikeInterval ?? .062);
        const step = Math.min(1, (effect.age % interval) / interval);
        const swing = 1 - step;
        this.ground.ellipse(x, y + 3, 30 + step * 42, 15 + step * 21).stroke({ color: 0xa8d4ff, width: 2.5, alpha: .7 * swing });
        this.glow.circle(x, y, 44).fill({ color: 0x8abfff, alpha: .1 * swing });
        sprite.position.set(x, y - 8);
        const scale = size / sprite.texture.width * (.42 + step * .5);
        sprite.scale.set(scale, scale * .62);
        sprite.rotation = 0;
        sprite.alpha = .95 * swing;
        sprite.tint = 0xb1d8ff;
        continue;
      }
      const phase = t;
      const scale = size / sprite.texture.width * (.65 + phase * .55);
      const distance = effect.kind === 'destroy' ? 40 + t * 125 : effect.kind === 'power' ? 70 : 0;
      sprite.position.set(x + Math.cos(screenAngle) * distance, y + Math.sin(screenAngle) * distance - (effect.kind === 'power' ? 45 : effect.kind === 'slam' ? 4 : 18));
      sprite.scale.set(scale, scale * (effect.kind === 'slam' ? .6 : 1));
      sprite.rotation = effect.kind === 'slam' || effect.kind === 'power' ? 0 : screenAngle;
      const sustained = effect.kind === 'slam';
      sprite.alpha = sustained ? Math.min(1, phase * 6, (1 - phase) * 6) : Math.min(1, (1 - phase) * 1.5);
      sprite.tint = 0xffffff;
    }
    return true;
  }

/**
 * 회전참격(작업 215) — 암흑·진홍 혈풍 회오리.
 *
 * 확정 시안(3번 `opt_c.png`)의 360° 혈풍 회오리를 그대로 옮긴다.
 *
 * ① **지면 회오리**: 회오리 텍스처를 담은 컨테이너를 세로로 눌러(scale.y ≈ .52) 바닥 원근을
 *    만들고, 그 **안에서** 두 겹을 서로 반대로 빠르게 돌린다. 스프라이트를 직접 돌리면 눌린
 *    타원이 통째로 기울어(모양이 고무판처럼 흔들려) 바닥이 아니라 공중에서 도는 것처럼 보인다.
 * ② **몸을 감싸는 혈풍 벽**: 같은 텍스처를 누르지 않고 히어로 허리 높이에서 낮은 알파로
 *    천천히 반대로 돌려, 대검을 휘두르는 몸 주위로 혈풍이 감기는 느낌을 준다.
 * ③ **칼끝 괄적**: 회오리 반경을 따라 빠르게 도는 밝은 호 두 줄과, 밖으로 튀는 혈점·불티.
 */
export function drawWhirlSlash(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const level = Math.max(1, Math.min(10, effect.level ?? 1));
    const radius = Math.min(this.app.screen.width * .46, 168) + (level - 1) * 5;
    const fade = Math.min(1, t * 7, (1 - t) * 6);
    let floor = this.vfxLayers.get(effect)?.[0];
    let sprites = this.vfxSprites.get(effect);
    if (!floor || !sprites) {
      // 지면 회오리 — 눌린 컨테이너의 자식으로 넣어야 회전이 바닥 평면에서 일어난다.
      floor = new Container();
      floor.scale.set(1, .52);
      // 진홍 본체는 일반 합성 — `add` 로만 얹으면 어두운 안개가 사라져 분홍 번짐만 남는다.
      // 텍스처 알파가 곧 밝기라 어두운 혈풍은 반투명한 검붉은 연기로 깔린다.
      const ringOuter = new Sprite(this.textures.fxWhirl);
      ringOuter.anchor.set(.5);
      const ringInner = new Sprite(this.textures.fxWhirl);
      ringInner.anchor.set(.5);
      ringInner.blendMode = 'add';
      ringInner.tint = 0xff7a66;
      // 위로 갈수록 작아지는 고리 — 눌린 컨테이너 안에서 y를 올리면 화면에서도 그만큼 솟아,
      // 바닥 회오리가 전사 주위를 감싸고 도는 깔때기(혈풍)가 된다.
      const ringMid = new Sprite(this.textures.fxWhirl);
      ringMid.anchor.set(.5);
      const ringTop = new Sprite(this.textures.fxWhirl);
      ringTop.anchor.set(.5);
      floor.addChild(ringOuter, ringInner, ringMid, ringTop);
      // 몸을 감싸는 혈풍 벽 — 누르지 않으므로 지면 컨테이너 밖에 둔다.
      const wall = new Sprite(this.textures.fxWhirl);
      wall.anchor.set(.5);
      wall.blendMode = 'add';
      // 바닥 회오리는 **캐릭터 뒤**(`dragonBack`)에 깐다 — skillVfx 는 액터 위라, 거기 두면
      // 회오리가 전사 몸을 덮어 버린다. 몸을 감싸는 혈풍 벽만 캐릭터 위에 얹는다.
      this.dragonBack.addChild(floor);
      this.skillVfx.addChild(wall);
      this.vfxLayers.set(effect, [floor]);
      sprites = [wall];
      this.vfxSprites.set(effect, sprites);
    }
    const [outer, inner, mid, top] = floor.children as [Sprite, Sprite, Sprite, Sprite];
    const wall = sprites[0];
    const diameter = radius * 2;
    floor.position.set(x, y - 2);
    // 바깥 회오리와 안쪽 회오리는 반대 방향으로 돈다 — 혈풍이 서로를 휘감는 느낌.
    outer.position.set(0, 0);
    outer.rotation = -.6 - effect.age * 7.4;
    const outerScale = diameter * 1.02 / outer.texture.width;
    outer.scale.set(outerScale);
    outer.alpha = fade * .92;
    inner.rotation = effect.age * 10.5;
    const innerScale = diameter * .62 / inner.texture.width;
    inner.scale.set(innerScale);
    // 안쪽은 같은 텍스처를 `add` 로 한 번 더 얹어 밝은 혈흔 하이라이트만 살린다.
    inner.alpha = fade * .62;
    // 위로 솟는 고리 두 겹(서로 반대로 돈다) — 혈풍이 전사를 감싸고 도는 깔때기.
    mid.position.set(0, -44);
    mid.rotation = -.2 + effect.age * 6.2;
    mid.scale.set(diameter * .76 / mid.texture.width);
    mid.alpha = fade * .5;
    mid.tint = 0xff8f7a;
    top.position.set(0, -88);
    top.rotation = effect.age * 8.4;
    top.scale.set(diameter * .52 / top.texture.width);
    top.alpha = fade * .34;
    wall.position.set(x, y - 44);
    wall.rotation = effect.age * 3.1;
    const wallScale = diameter * .8 / wall.texture.width;
    wall.scale.set(wallScale, wallScale * 1.06);
    wall.alpha = fade * .26;
    // 바닥의 암흑·진홍 기운 — 여러 겹의 타원으로 부드럽게 깔아 물웅덩이 같은 하드 엣지를 없앤다.
    const pulse = .88 + Math.sin(time * 9) * .12;
    for (const [scale, alpha] of [[1.12, .1], [.94, .12], [.76, .14], [.56, .16], [.34, .18]] as const) {
      this.glow.ellipse(x, y - 2, radius * scale, radius * scale * .54)
        .fill({ color: scale > .9 ? 0x240104 : 0x560509, alpha: alpha * fade });
    }
    this.glow.ellipse(x, y - 2, radius * .5, radius * .27).fill({ color: 0x8a1015, alpha: .2 * fade * pulse });
    // 조여드는 테두리 — 회오리가 돌수록 짙어졌다가 옅어진다.
    const ringIn = Math.min(1, .35 + t * 1.4);
    this.ground.ellipse(x, y, radius * ringIn, radius * ringIn * .52).stroke({ color: 0xd8392f, width: 2.2, alpha: .34 * fade });
    // 칼날 궤적 — 회오리 반경을 따라 도는 칼자국. 머리로 갈수록 굵고 밝고, 꼬리는 가늘게 사라진다.
    const sweep = effect.age * 10;
    for (const base of [sweep, sweep + Math.PI]) {
      for (let seg = 0; seg < 7; seg++) {
        const head = base - seg * .07;
        const arcRadius = radius * .88;
        const hx = x + Math.cos(head) * arcRadius, hy = y + Math.sin(head) * arcRadius * .52 - 8;
        const tx = x + Math.cos(head - .07) * arcRadius, ty = y + Math.sin(head - .07) * arcRadius * .52 - 8;
        const keep = 1 - seg / 7;
        this.effects.moveTo(tx, ty).lineTo(hx, hy)
          .stroke({ color: 0xff8e64, width: 1.2 + 3.4 * keep, alpha: .65 * keep * fade });
      }
    }
    // 밖으로 튀는 혈점·불티 — 회오리에 휩쓸려 조금씩 위로 솟는다.
    for (let index = 0; index < 12; index++) {
      const angle = index * 2.4 + effect.age * 2.6;
      const reach = radius * (.55 + ((index * 37) % 100) / 100 * .75);
      const px = x + Math.cos(angle) * reach;
      const py = y + Math.sin(angle) * reach * .52 - 10 - ((index * 13) % 7) * 4 - t * 18;
      const size = 1.8 + ((index * 29) % 10) / 10 * 2.4;
      this.effects.circle(px, py, Math.max(.6, size * (1 - t * .4))).fill({ color: index % 3 === 0 ? 0xff9a6a : 0xc2231c, alpha: .7 * fade });
    }
  }

const arrowColors: Record<NonNullable<Effect['variant']>, number> = {
  normal: 0xffd9a0, ice: 0xa8dcff, pierce: 0xffe6a0, snipe: 0xfff4d0, volley: 0xffc27a,
  // 마법사 탄환(작업 198) — 남성은 푸른 마력, 여성은 붉은 화염, 스킬은 속성별 색을 쓴다.
  arcane: 0x8fb4ff, fire: 0xff7a3c, frost: 0xbfe6ff, chain: 0xd0b4ff, meteor: 0xffb266
};
const magicVariants = new Set<NonNullable<Effect['variant']>>(['arcane', 'fire', 'frost', 'chain', 'meteor']);

/**
 * 궁수 화살 — 출발점에서 도착점으로 화면 좌표를 직선 보간해 날아간다(작업 157).
 * 이펙트 좌표는 활을 쏜 자리이고 도착지는 `tx`·`ty`(월드 좌표)다. 아이소메트릭 투영이
 * 선형이라 두 점의 화면 변위만큼만 진행도로 밀면 실제로 날아가는 것처럼 보인다.
 */
export function drawArrow(this: GameView, effect: Effect, x: number, y: number, _screenAngle: number): void {
    if (magicVariants.has(effect.variant ?? 'normal')) { drawMagicBolt.call(this, effect, x, y); return; }
    const dx = (effect.tx ?? effect.x) - effect.x, dy = (effect.ty ?? effect.y) - effect.y;
    const progress = Math.max(0, Math.min(1, effect.age / Math.max(.01, effect.duration)));
    const px = x + (dx - dy) * .86 * progress;
    const py = y + (dx + dy) * .43 * progress - 20;
    const angle = Math.atan2((dx + dy) * .43, (dx - dy) * .86);
    const color = arrowColors[effect.variant ?? 'normal'];
    const length = effect.variant === 'snipe' ? 34 : effect.variant === 'pierce' ? 28 : 20;
    // 잔상 궤적
    const tail = 1 - Math.abs(progress - .5) * 2;
    this.effects.moveTo(px - Math.cos(angle) * length * 3.2, py - Math.sin(angle) * length * 3.2)
      .lineTo(px, py).stroke({ color, width: 2 + tail * 2.4, alpha: .16 + tail * .24 });
    // 화살대와 촉
    this.effects.moveTo(px - Math.cos(angle) * length, py - Math.sin(angle) * length)
      .lineTo(px, py).stroke({ color, width: 2.6, alpha: .95 });
    this.effects.moveTo(px + Math.cos(angle) * 5, py + Math.sin(angle) * 5)
      .lineTo(px - Math.sin(angle) * 3.5, py + Math.cos(angle) * 3.5)
      .lineTo(px + Math.sin(angle) * 3.5, py - Math.cos(angle) * 3.5).closePath().fill({ color, alpha: 1 });
    if (effect.variant === 'ice') this.glow.circle(px, py, 10 + tail * 8).fill({ color: 0x8fd0ff, alpha: .12 });
    if (effect.variant === 'snipe') this.glow.circle(px, py, 14).fill({ color: 0xfff0c8, alpha: .18 });
  }

/**
 * 마법사 마법 구슬 — 화살 대신 빛나는 구슬이 잔상 꼬리를 끌며 날아간다(작업 198).
 * 궤적 계산(아이소메트릭 선형 이동)은 화살과 같고, 그리기만 구슬+광채로 바꾼다.
 */
export function drawMagicBolt(this: GameView, effect: Effect, x: number, y: number): void {
    const dx = (effect.tx ?? effect.x) - effect.x, dy = (effect.ty ?? effect.y) - effect.y;
    const progress = Math.max(0, Math.min(1, effect.age / Math.max(.01, effect.duration)));
    const px = x + (dx - dy) * .86 * progress;
    const py = y + (dx + dy) * .43 * progress - 20;
    const color = arrowColors[effect.variant ?? 'arcane'];
    const tail = 1 - Math.abs(progress - .5) * 2;
    const radius = effect.variant === 'meteor' ? 11 : effect.variant === 'chain' ? 7 : 6 + tail * 2;
    // 꼬리 — 진행 반대 방향으로 짧게 번지는 빛.
    const angle = Math.atan2((dx + dy) * .43, (dx - dy) * .86);
    this.glow.moveTo(px - Math.cos(angle) * 26, py - Math.sin(angle) * 26).lineTo(px, py)
      .stroke({ color, width: 5 + tail * 3, alpha: .1 + tail * .22 });
    this.glow.circle(px, py, radius * 2.2).fill({ color, alpha: .12 + tail * .1 });
    this.effects.circle(px, py, radius).fill({ color, alpha: .92 });
    this.effects.circle(px, py, radius * .45).fill({ color: 0xffffff, alpha: .85 });
    if (effect.variant === 'frost') this.effects.circle(px, py, radius * 2.6).stroke({ color: 0xdff2ff, width: 1.4, alpha: .35 * tail });
    if (effect.variant === 'fire' || effect.variant === 'meteor') this.glow.circle(px, py, radius * 3.4).fill({ color: 0xff8a3c, alpha: .1 * tail });
  }

/** 마법 폭발·메테오 — 대상 지점이 예고 뒤에 터진다(작업 198). */
export function drawBurst(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const color = effect.variant === 'meteor' ? 0xffa04a : 0x9ab8ff;
    const radius = (effect.radius ?? 96) * .86;
    if (t < .5) {
      // 예고 — 바닥에 조여드는 원.
      const squeeze = .35 + t * 1.3;
      this.ground.ellipse(x, y, radius * squeeze, radius * squeeze * .5).stroke({ color, width: 2, alpha: .55 });
      return;
    }
    const burst = (t - .5) / .5;
    this.glow.ellipse(x, y - 8, radius * (1 + burst * .5), radius * (1 + burst * .5) * .55).fill({ color, alpha: .3 * (1 - burst) });
    this.ground.ellipse(x, y, radius * (1 + burst * .4), radius * (1 + burst * .4) * .5).stroke({ color, width: 3 - burst * 2, alpha: .7 * (1 - burst) });
    for (let index = 0; index < 7; index++) {
      const angle = index * 2.1 + time * .4;
      const reach = radius * burst * 1.1;
      const px = x + Math.cos(angle) * reach, py = y + Math.sin(angle) * reach * .5 - burst * 46;
      this.effects.circle(px, py, 3 + (1 - burst) * 4).fill({ color, alpha: .7 * (1 - burst) });
    }
  }

/** 프로스트 노바·아르카나 오버로드 — 발밑에서 파동이 퍼진다(작업 198). */
export function drawNova(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const color = effect.variant === 'frost' ? 0xbfe6ff : 0xb79bff;
    const radius = (effect.radius ?? 150) * .86;
    const spread = Math.min(1, t * 1.4);
    this.glow.ellipse(x, y - 6, radius * spread, radius * spread * .5).fill({ color, alpha: .16 * (1 - t) });
    for (const [lag, width] of [[0, 3], [.18, 2], [.36, 1.4]] as const) {
      const ring = Math.max(0, Math.min(1, spread - lag));
      if (ring <= 0) continue;
      this.ground.ellipse(x, y + 2, radius * ring, radius * ring * .5).stroke({ color, width, alpha: .6 * (1 - ring) });
    }
    for (let index = 0; index < 10; index++) {
      const angle = index * .63 + time * .5;
      const reach = radius * spread;
      const px = x + Math.cos(angle) * reach, py = y + Math.sin(angle) * reach * .5;
      this.effects.circle(px, py, 2.5 + Math.sin(time * 12 + index) * 1).fill({ color, alpha: .55 * (1 - t) });
    }
  }

/** 아케인 실드 — 몸을 감싸는 비전 보호막(작업 198). */
export function drawWard(this: GameView, _effect: Effect, x: number, y: number, t: number, time: number): void {
    const color = 0x9ab8ff;
    const radius = 30 + t * 16;
    this.glow.circle(x, y - 34, radius).fill({ color, alpha: .12 * (1 - t) });
    this.effects.circle(x, y - 34, radius).stroke({ color, width: 2, alpha: .75 * (1 - t) });
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3 + time * .8;
      const px = x + Math.cos(angle) * radius * .9, py = y - 34 + Math.sin(angle) * radius * .62;
      this.effects.circle(px, py, 2.4).fill({ color: 0xffffff, alpha: .6 * (1 - t) });
    }
  }

/** 애로우 레인 — 적 지점에 화살이 비처럼 떨어진다(작업 157). */
export function drawArrowRain(this: GameView, _effect: Effect, x: number, y: number, t: number, time: number): void {
    const radius = 92 * .86;
    this.ground.ellipse(x, y, radius, radius * .5).stroke({ color: 0xffcf8a, width: 2, alpha: .18 + .22 * Math.sin(t * Math.PI) });
    const arrows = 16;
    for (let index = 0; index < arrows; index++) {
      const spread = ((index * 37) % 100) / 100 - .5;
      const depth = ((index * 53) % 100) / 100 - .5;
      const fall = ((t * 2.6 + index / arrows) % 1);
      const ax = x + spread * radius * 1.7;
      const ay = y + depth * radius * .9;
      const height = 150 * (1 - fall);
      this.effects.moveTo(ax + height * .22, ay - height).lineTo(ax, ay).stroke({ color: 0xffcf8a, width: 2, alpha: .1 + .5 * fall });
      if (fall > .86) this.effects.circle(ax, ay, 3 + Math.sin(time * 30 + index) * 1.2).fill({ color: 0xffe3b0, alpha: .5 * (1 - t) });
    }
  }

/** 호크아이 — 매의 눈 표식이 퍼진다(작업 157). */
export function drawHawkEye(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const level = Math.max(1, Math.min(10, effect.level ?? 1));
    const radius = 26 + t * (46 + level * 2);
    this.effects.circle(x, y - 34, radius).stroke({ color: 0xffd27a, width: 2.4, alpha: .7 * (1 - t) });
    this.effects.circle(x, y - 34, radius * .62).stroke({ color: 0xfff0c0, width: 1.4, alpha: .5 * (1 - t) });
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3 + time * .6;
      const px = x + Math.cos(angle) * radius * .9, py = y - 34 + Math.sin(angle) * radius * .55;
      this.effects.moveTo(px, py).lineTo(px + Math.cos(angle) * 9, py + Math.sin(angle) * 6).stroke({ color: 0xffe1a0, width: 2, alpha: .55 * (1 - t) });
    }
  }

export function drawDragon(this: GameView, effect: Effect, x: number, y: number, progress: number, time: number): void {
    const level = Math.max(1, Math.min(10, effect.level ?? 1));
    const bodyCount = 6 + (level - 1) * 2;
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      sprites = Array.from({ length: bodyCount + 1 }, (_, index) => {
        const sprite = new Sprite(index === 0 ? this.textures.fxDragonHead : this.textures.fxDragonBody);
        sprite.anchor.set(.5);
        sprite.blendMode = 'add';
        this.skillVfx.addChild(sprite);
        return sprite;
      });
      this.vfxSprites.set(effect, sprites);
    }
    const radius = Math.min(this.app.screen.width * .43, 170);
    // [작업 157] 묵직하게 선회하도록 회전을 절반 이하로 늦췄다(한 바퀴 1.1초 → 2.4초).
    // 후반에는 궤도를 좁히며 144°만 더 돌아 하늘로 솟는다.
    const theta = effect.age * Math.PI * 2 / 2.4 + progress * progress * Math.PI * .8;
    const fade = Math.min(1, progress * 8, (1 - progress) * 7);
    // 청룡이 도는 동안 발밑 지면에 짙은 파란 기운이 번진다(확정 시안의 바닥 회오리).
    this.glow.ellipse(x, y - 6, radius * 1.05, radius * .48).fill({ color: 0x1f4fff, alpha: .1 * fade });
    this.ground.ellipse(x, y + 2, radius * .95, radius * .4).stroke({ color: 0x6fb0ff, width: 2, alpha: .2 * fade });
    this.ground.ellipse(x, y + 2, radius * .55, radius * .23).stroke({ color: 0x9ad0ff, width: 1.5, alpha: .14 * fade });
    for (const [index, sprite] of sprites.entries()) {
      const segmentProgress = Math.max(0, Math.min(1, progress - index * .012));
      const orbit = dragonOrbitFactor(segmentProgress);
      const ascent = dragonRise(segmentProgress);
      const angle = theta - index * .26;
      const wobble = Math.sin(time * 10 - index * .6) * 4;
      const r = orbit * (radius + wobble);
      const tail = 1 - index / (bodyCount + 1);
      sprite.position.set(x + Math.cos(angle) * r, y - 12 + Math.sin(angle) * r * .65 - ascent);
      sprite.rotation = angle + Math.PI / 2;
      const width = index === 0 ? 102 : 46 + tail * 36;
      const scale = width / sprite.texture.width;
      // 몸통은 궤도 접선 방향으로 길고, 방사 방향으로 1.25배 두껍게 그려 이음매가 벌어지지 않게 한다.
      sprite.scale.set(scale, scale * (index === 0 ? 1 : 1.25));
      sprite.alpha = fade * Math.min(1, segmentProgress * 10) * (index === 0 ? 1 : .35 + tail * .6);
      const layer = Math.sin(angle) < 0 ? this.dragonBack : this.skillVfx;
      if (sprite.parent !== layer) layer.addChild(sprite);
    }
  }

export function drawHit(this: GameView, x: number, y: number, t: number, seed: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = seed + i * Math.PI * 2 / 10;
      const radius = 5 + t * (21 + i % 3 * 5);
      const px = x + Math.cos(angle) * radius, py = y - 18 + Math.sin(angle) * radius * .7;
      const length = 6 * (1 - t);
      this.effects.moveTo(px, py).lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length).stroke({ color: i % 2 ? 0xffa14d : 0xffffff, width: 2.5 * (1 - t), alpha: 1 - t });
    }
  }

export function updateDamageLabels(this: GameView, effects: Effect[], project: (x: number, y: number) => [number, number]): void {
    const hits = new Set(effects.filter(effect => effect.kind === 'hit'));
    for (const [effect, label] of this.damageLabels) if (!hits.has(effect)) { this.labels.removeChild(label); label.destroy(); this.damageLabels.delete(effect); }
    for (const effect of hits) {
      let label = this.damageLabels.get(effect);
      if (!label) {
        label = new Text({ text: `-${effect.amount ?? 0}`, style: { fontFamily: 'Cinzel', fontSize: 16, fontWeight: 'bold', fill: 0xffd6a0 } });
        label.anchor.set(.5, 1); this.labels.addChild(label); this.damageLabels.set(effect, label);
      }
      const t = effect.age / effect.duration, [x, y] = project(effect.x, effect.y);
      // [작업 212] 10연타 숫자는 한 점에 겹치지 않도록 타마다 다른 자리에서 떠오른다.
      const driftX = effect.labelOffsetX ?? Math.cos(effect.angle) * 6;
      const driftY = effect.labelOffsetY ?? 0;
      label.position.set(x + driftX, y - 24 - t * 25 + driftY);
      label.scale.set(1 + Math.sin(Math.PI * t) * .25);
      label.alpha = Math.max(0, 1 - t);
    }
  }

export function drawDeath(this: GameView, x: number, y: number, t: number, seed: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = seed + i * Math.PI * 2 / 10;
      const px = x + Math.cos(angle) * 36 * t, py = y - 26 * t + Math.sin(angle) * 16 * t;
      if (i % 2 === 0) this.effects.circle(px, py, (8 + i % 3 * 3) * (1 - t)).fill({ color: 0x9a9390, alpha: .32 * (1 - t) });
      else this.effects.moveTo(px - 4, py - 2).lineTo(px + 4, py + 2).stroke({ color: 0xe1d8c4, width: 3 * (1 - t), alpha: 1 - t });
    }
  }


export function drawEffects(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number): void {
    const liveEffects = new Set(world.effects);
    for (const [effect, sprites] of this.vfxSprites) if (!liveEffects.has(effect)) { for (const sprite of sprites) sprite.destroy(); this.vfxSprites.delete(effect); }
    for (const [effect, layers] of this.vfxLayers) if (!liveEffects.has(effect)) { for (const layer of layers) layer.destroy({ children: true }); this.vfxLayers.delete(effect); }
    for (const effect of world.effects) {
      const [x, y] = project(effect.x, effect.y), t = effect.age / effect.duration;
      const screenAngle = Math.atan2(Math.sin(effect.angle) * .43 + Math.cos(effect.angle) * .43, Math.cos(effect.angle) * .86 - Math.sin(effect.angle) * .86);
      if (this.drawSkillVfx(world, effect, x, y, t, screenAngle, time)) continue;
      if (effect.kind === 'death') this.drawDeath(x, y, t, effect.angle);
      else this.drawHit(x, y, t, effect.angle);
    }
    this.updateDamageLabels(world.effects, project);
  }
