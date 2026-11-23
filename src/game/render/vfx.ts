import { Container, Sprite, Text } from 'pixi.js';
import type { Rarity } from '../store';
import type { CombatEngine } from '../combat/engine';

const rarityColors: Record<Rarity, number> = { common: 0x9ca3af, magic: 0x60a5fa, rare: 0xfacc15, epic: 0xc084fc, unique: 0xfb923c, legendary: 0xf87171 };
const slashStrength: Record<Rarity, number> = { common: 0, magic: 1, rare: 2, epic: 3, unique: 4, legendary: 5 };
import { dragonOrbitFactor, dragonRise, slash2SecondHit } from '../skills';
import { destroyTravelProgress, projectedAreaRadii, skillArea } from '../battle/skillAreas';
import type { Effect } from '../world';
import type { Art, GameView } from '../render';

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** 판정 원·부채꼴을 월드 좌표에서 화면으로 투영해 정확한 바닥 경계를 그린다. */
function drawMeleeArea(this: GameView, effect: Effect, x: number, y: number): void {
  const id = effect.kind;
  if (id !== 'slash2' && id !== 'slam' && id !== 'destroy' && id !== 'hell' && id !== 'spin') return;
  const area = skillArea(id, effect.level ?? 1);
  const radius = id === 'spin' ? area.radius! * dragonOrbitFactor(effect.age / effect.duration) : area.radius!;
  const alpha = .28 * Math.max(0, 1 - effect.age / effect.duration);
  if (id === 'slash2' || id === 'destroy') {
    const distance = id === 'destroy' ? area.range * destroyTravelProgress(effect.age, effect.duration) : area.range;
    const forward = { x: Math.cos(effect.angle), y: Math.sin(effect.angle) };
    const side = { x: -forward.y, y: forward.x };
    const corners = [
      { distance: 0, lateral: -area.halfWidth! }, { distance, lateral: -area.halfWidth! },
      { distance, lateral: area.halfWidth! }, { distance: 0, lateral: area.halfWidth! }
    ];
    for (let index = 0; index < corners.length; index++) {
      const { distance, lateral } = corners[index];
      const dx = forward.x * distance + side.x * lateral;
      const dy = forward.y * distance + side.y * lateral;
      const px = x + (dx - dy) * .86, py = y + (dx + dy) * .43;
      if (index === 0) this.ground.moveTo(px, py); else this.ground.lineTo(px, py);
    }
    this.ground.closePath().stroke({ color: 0xffcf8a, width: 2, alpha });
    return;
  }
  if (id === 'hell' || id === 'spin' || id === 'slam') {
    const ellipse = projectedAreaRadii(radius);
    this.ground.ellipse(x, y, ellipse.x, ellipse.y).stroke({ color: id === 'spin' ? 0x6fb0ff : id === 'slam' ? 0xff8c48 : 0xd8392f, width: 2, alpha });
    return;
  }
  const arc = area.arc!;
  this.ground.moveTo(x, y);
  for (let index = 0; index <= 16; index++) {
    const angle = effect.angle - arc + 2 * arc * index / 16;
    const px = x + (Math.cos(angle) - Math.sin(angle)) * .86 * radius;
    const py = y + (Math.cos(angle) + Math.sin(angle)) * .43 * radius;
    this.ground.lineTo(px, py);
  }
  this.ground.lineTo(x, y).stroke({ color: 0xffcf8a, width: 2, alpha });
}

export function weaponSlashColor(world: Pick<CombatEngine, 'save'>): number {
  return world.save.equipment.weapon ? rarityColors[world.save.equipment.weapon.rarity] : 0xffffff;
}

/**
 * 휘두르기 검기 스프라이트의 틴트 — 무기 등급색을 12%만 섞는다.
 *
 * 확정 시안의 은빛 검기 + 황금빛 지면 충격파 색감이 기준이라 등급색으로 통째로 물들이지
 * 않고, 등급이 높을수록 아주 조금만 그 색으로 기울게 한다(맨손은 흰색 그대로).
 */
export function slashTint(world: Pick<CombatEngine, 'save'>): number {
  if (!world.save.equipment.weapon) return 0xffffff;
  const color = weaponSlashColor(world);
  const mix = (channel: number): number => Math.round(255 * .88 + channel * .12);
  return mix(color >> 16 & 255) << 16 | mix(color >> 8 & 255) << 8 | mix(color & 255);
}

export function drawSkillVfx(this: GameView, world: CombatEngine, effect: Effect, x: number, y: number, t: number, screenAngle: number, time: number): boolean {
    if (effect.kind === 'slash') return true;
    if (effect.kind === 'hell') { drawWhirlSlash.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'shot') { drawArrow.call(this, effect, x, y, screenAngle); return true; }
    if (effect.kind === 'volleyCast') return true;
    if (effect.kind === 'iceBurst') { drawIceBurst.call(this, effect, x, y, t); return true; }
    if (effect.kind === 'snipeMark') {
      const cy = y - 46, radius = 24 - t * 5, alpha = Math.min(1, (1 - t) * 3);
      this.glow.circle(x, cy, radius + 5).stroke({ color: 0xff2929, width: 5, alpha: .2 * alpha });
      this.effects.circle(x, cy, radius).stroke({ color: 0xe83432, width: 2.5, alpha });
      this.effects.moveTo(x - radius - 7, cy).lineTo(x - 7, cy)
        .moveTo(x + 7, cy).lineTo(x + radius + 7, cy)
        .moveTo(x, cy - radius - 7).lineTo(x, cy - 7)
        .moveTo(x, cy + 7).lineTo(x, cy + radius + 7)
        .stroke({ color: 0xff4140, width: 2, alpha });
      this.effects.circle(x, cy, 2.5).fill({ color: 0xff3939, alpha });
      return true;
    }
    if (effect.kind === 'impactArea') {
      const { x: rx, y: ry } = projectedAreaRadii(effect.radius ?? 0);
      const color = effect.variant === 'fire' ? 0xff8a3c : effect.variant === 'frost' ? 0xbfe6ff : effect.variant === 'chain' ? 0xd0b4ff : 0xffcf8a;
      this.ground.ellipse(x, y, rx, ry).stroke({ color, width: 2, alpha: .48 * (1 - t) });
      return true;
    }
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
      const firstPhase = phase(0, .5);
      const backPhase = phase(slash2SecondHit, .35);
      // 두 검기의 중심을 같은 전방 지점에 두고 반대 대각선으로 그려 X자를 만든다.
      const crossX = x + forwardX * 55, crossY = y + forwardY * 31 - 38;
      const crossWidth = 166 + strength * 5;
      const firstWidth = crossWidth * (.84 + firstPhase * .28);
      const firstScale = firstWidth / first.texture.width;
      first.position.set(crossX - forwardX * (8 - firstPhase * 8), crossY - forwardY * 4);
      first.rotation = screenAngle - 1.15;
      first.scale.set(firstScale, firstScale * .82);
      first.alpha = firstPhase > 0 && firstPhase < 1 ? Math.sin(Math.PI * firstPhase) : 0;
      first.tint = tint;
      // 2타는 같은 중심을 반대 대각선으로 가른다. 1타가 남아 있는 동안 교차한다.
      const backWidth = crossWidth * (.84 + backPhase * .28);
      const backScale = backWidth / back.texture.width;
      back.position.set(crossX + forwardX * (backPhase * 8), crossY + forwardY * 4);
      back.rotation = screenAngle + .55;
      back.scale.set(-backScale, backScale * .86);
      back.alpha = backPhase > 0 && backPhase < 1 ? Math.sin(Math.PI * backPhase) : 0;
      back.tint = tint;
      const shockWidth = (148 + strength * 4) * (.86 + backPhase * .32);
      shock.position.set(crossX, crossY + 32);
      shock.scale.set(shockWidth / shock.texture.width, shockWidth / shock.texture.width * .62);
      shock.alpha = backPhase > 0 && backPhase < 1 ? Math.sin(Math.PI * backPhase) : 0;
      shock.tint = tint;
      return true;
    }
    if (effect.kind === 'warcry') return true;
    if (effect.kind === 'hit' || effect.kind === 'death' || effect.kind === 'evade' || effect.kind === 'heal' || effect.kind === 'enemyStrike') return false;
    if (effect.kind === 'spin') { this.drawDragon(effect, x, y, t, time); return true; }
    // `hell`(회전참격)은 위에서 전용 이펙트로 처리한다(작업 215).
    const art: Art = effect.kind === 'slam' ? 'fxSlam' : effect.kind === 'crushing' ? 'fxCrushing' : effect.kind === 'power' ? 'fxPower' : effect.kind === 'destroy' ? 'fxDestroy' : 'fxSlash';
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      const sprite = new Sprite(this.textures[art]);
      sprite.anchor.set(.5);
      sprite.blendMode = effect.kind === 'slam' || effect.kind === 'power' ? 'normal' : 'add';
      (effect.kind === 'slam' ? this.groundVfx : this.skillVfx).addChild(sprite);
      sprites = [sprite];
      this.vfxSprites.set(effect, sprites);
    }
    const size = effect.kind === 'destroy' ? 190 : effect.kind === 'crushing' ? 245 : effect.kind === 'power' ? 165 : 150;
    for (const sprite of sprites) {
      if (effect.kind === 'slam') {
        const radius = projectedAreaRadii(skillArea('slam', effect.level ?? 1).radius!);
        sprite.position.set(x, y);
        sprite.scale.set(radius.x * 2 / sprite.texture.width, radius.y * 2 / sprite.texture.height);
        sprite.rotation = 0;
        sprite.alpha = Math.min(1, t * 6, (1 - t) * 6);
        sprite.tint = 0xffffff;
        continue;
      }
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
      if (effect.kind === 'power') {
        const drop = Math.min(1, t * 5);
        sprite.anchor.set(.5, .86);
        sprite.position.set(x, y - 35 + drop * 30);
        const scale = 190 / sprite.texture.width * (.76 + drop * .24);
        sprite.scale.set(scale);
        sprite.rotation = 0;
        sprite.alpha = Math.min(1, t * 12) * Math.min(1, (1 - t) * 2.4);
        sprite.tint = 0xffffff;
        if (drop >= 1) this.ground.ellipse(x, y, 22 + (t - .2) * 65, 11 + (t - .2) * 32).stroke({ color: 0xffd06c, width: 2.5, alpha: .65 * (1 - t) });
        continue;
      }
      const phase = t;
      const scale = size / sprite.texture.width * (.65 + phase * .55);
      const advance = effect.kind === 'destroy' ? skillArea('destroy', effect.level ?? 1).range * destroyTravelProgress(effect.age, effect.duration) : 0;
      const forwardX = Math.cos(effect.angle) * advance, forwardY = Math.sin(effect.angle) * advance;
      if (effect.kind === 'destroy') {
        const tipX = x + (forwardX - forwardY) * .86, tipY = y + (forwardX + forwardY) * .43;
        const fade = Math.min(1, t * 12) * Math.min(1, (1 - t) * 2.5);
        this.glow.moveTo(x, y - 18).lineTo(tipX, tipY - 18).stroke({ color: 0xc11657, width: 24, alpha: .28 * fade });
        this.glow.moveTo(x, y - 18).lineTo(tipX, tipY - 18).stroke({ color: 0xff8ca8, width: 5, alpha: .72 * fade });
      }
      sprite.position.set(x + (forwardX - forwardY) * .86 * .72, y + (forwardX + forwardY) * .43 * .72 - 18);
      sprite.scale.set(scale);
      sprite.rotation = screenAngle;
      sprite.alpha = effect.kind === 'destroy' ? Math.min(1, t * 12, (1 - t) * 2.5) : Math.min(1, (1 - phase) * 1.5);
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
    const radius = projectedAreaRadii(skillArea('hell', level).radius!).x;
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
    for (let index = 0; index < (reducedMotion() ? 3 : 12); index++) {
      const angle = index * 2.4 + effect.age * 2.6;
      const reach = radius * (.55 + ((index * 37) % 100) / 100 * .75);
      const px = x + Math.cos(angle) * reach;
      const py = y + Math.sin(angle) * reach * .52 - 10 - ((index * 13) % 7) * 4 - t * 18;
      const size = 1.8 + ((index * 29) % 10) / 10 * 2.4;
      this.effects.circle(px, py, Math.max(.6, size * (1 - t * .4))).fill({ color: index % 3 === 0 ? 0xff9a6a : 0xc2231c, alpha: .7 * fade });
    }
  }

const arrowColors: Record<NonNullable<Effect['variant']>, number> = {
  normal: 0xe1e5df, ice: 0xa8dcff, pierce: 0xf0f3ef, snipe: 0xffffff, volley: 0xd8ddd6,
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
    const launch = effect.launch ?? 0;
    const progress = Math.max(0, Math.min(1, (effect.age - launch) / Math.max(.01, effect.duration - launch)));
    const px = x + (dx - dy) * .86 * progress;
    // 몸통 높이에서 고정된 발사 방향으로 직진한다. 이동 중 회전하거나 위로 휘지 않는다.
    const py = y + (dx + dy) * .43 * progress - 46;
    const angle = Math.atan2((dx + dy) * .43, (dx - dy) * .86);
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      const sprite = new Sprite(effect.variant === 'ice' ? this.textures.fxIceArrow : this.textures.fxArcherArrow);
      sprite.anchor.set(.97, .49);
      this.skillVfx.addChild(sprite);
      sprites = [sprite];
      this.vfxSprites.set(effect, sprites);
    }
    const sprite = sprites[0];
    // 52px는 모바일 미리보기에서 활의 보이는 길이에 맞춘다. 고해상도 원본을 축소해 결을 보존한다.
    const length = effect.variant === 'snipe' ? 58 : effect.variant === 'pierce' ? 55 : 52;
    sprite.scale.set(length / sprite.texture.width);
    sprite.position.set(px, py);
    sprite.rotation = angle;
    sprite.tint = effect.variant === 'snipe' ? 0xffb5ac : 0xffffff;
    if (effect.variant === 'ice') this.glow.circle(px, py, 9).fill({ color: 0x7fd6ff, alpha: .2 });
    if (effect.variant === 'snipe' && progress > 0) this.glow.moveTo(px - Math.cos(angle) * 48, py - Math.sin(angle) * 48)
      .lineTo(px, py).stroke({ color: 0xe83230, width: 3, alpha: .3 });
  }

/**
 * 마법사 마법 구슬 — 화살 대신 빛나는 구슬이 잔상 꼬리를 끌며 날아간다(작업 198).
 * 궤적 계산(아이소메트릭 선형 이동)은 화살과 같고, 그리기만 구슬+광채로 바꾼다.
 */
export function drawMagicBolt(this: GameView, effect: Effect, x: number, y: number): void {
    const dx = (effect.tx ?? effect.x) - effect.x, dy = (effect.ty ?? effect.y) - effect.y;
    // [작업 216] `launch`는 발사 전 머리 위에 떠 있는 시간이다 — 그동안은 제자리에서 숨쉬듯 작아졌다
    // 커지고, 남은 시간(duration−launch)에만 곧장 일직선으로 날아간다(궤적은 선형 보간 그대로).
    const launch = effect.launch ?? 0;
    const progress = Math.max(0, Math.min(1, (effect.age - launch) / Math.max(.01, effect.duration - launch)));
    const scale = effect.size ?? 1;
    const px = x + (dx - dy) * .86 * progress;
    const py = y + (dx + dy) * .43 * progress - 20;
    const color = arrowColors[effect.variant ?? 'arcane'];
    const tail = 1 - Math.abs(progress - .5) * 2;
    const hover = effect.age < launch ? .82 + Math.sin(effect.age * 34) * .18 : 1;
    const radius = (effect.variant === 'meteor' ? 11 : effect.variant === 'chain' ? 7 : 6 + tail * 2) * scale * hover;
    // 꼬리 — 진행 반대 방향으로 짧게 번지는 빛.
    const angle = Math.atan2((dx + dy) * .43, (dx - dy) * .86);
    if (progress > 0) this.glow.moveTo(px - Math.cos(angle) * 26 * scale, py - Math.sin(angle) * 26 * scale).lineTo(px, py)
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
    const { x: radius } = projectedAreaRadii(effect.radius ?? skillArea(effect.variant === 'meteor' ? 'meteorStrike' : 'manaBurst', effect.level ?? 1).radius!);
    this.ground.ellipse(x, y, radius, radius * .5).stroke({ color, width: 2, alpha: .2 * (1 - t) });
    if (t < .5) {
      // 예고 — 바닥에 조여드는 원.
      const squeeze = .35 + t * 1.3;
      this.ground.ellipse(x, y, radius * squeeze, radius * squeeze * .5).stroke({ color, width: 2, alpha: .55 });
      return;
    }
    const burst = (t - .5) / .5;
    this.glow.ellipse(x, y - 8, radius * (1 + burst * .5), radius * (1 + burst * .5) * .55).fill({ color, alpha: .3 * (1 - burst) });
    this.ground.ellipse(x, y, radius * (1 + burst * .4), radius * (1 + burst * .4) * .5).stroke({ color, width: 3 - burst * 2, alpha: .7 * (1 - burst) });
    for (let index = 0; index < (reducedMotion() ? 0 : 7); index++) {
      const angle = index * 2.1 + time * .4;
      const reach = radius * burst * 1.1;
      const px = x + Math.cos(angle) * reach, py = y + Math.sin(angle) * reach * .5 - burst * 46;
      this.effects.circle(px, py, 3 + (1 - burst) * 4).fill({ color, alpha: .7 * (1 - burst) });
    }
  }

/** 프로스트 노바·아르카나 오버로드 — 발밑에서 파동이 퍼진다(작업 198). */
export function drawNova(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const color = effect.variant === 'frost' ? 0xbfe6ff : 0xb79bff;
    const { x: radius } = projectedAreaRadii(effect.radius ?? skillArea(effect.variant === 'frost' ? 'frostNova' : 'arcaneOverlord', effect.level ?? 1).radius!);
    this.ground.ellipse(x, y, radius, radius * .5).stroke({ color, width: 2, alpha: .22 * (1 - t) });
    const spread = Math.min(1, t * 1.4);
    this.glow.ellipse(x, y - 6, radius * spread, radius * spread * .5).fill({ color, alpha: .16 * (1 - t) });
    for (const [lag, width] of [[0, 3], [.18, 2], [.36, 1.4]] as const) {
      const ring = Math.max(0, Math.min(1, spread - lag));
      if (ring <= 0) continue;
      this.ground.ellipse(x, y + 2, radius * ring, radius * ring * .5).stroke({ color, width, alpha: .6 * (1 - ring) });
    }
    for (let index = 0; index < (reducedMotion() ? 0 : 10); index++) {
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
export function drawArrowRain(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const radius = projectedAreaRadii(effect.radius ?? skillArea('arrowRain', effect.level ?? 1).radius!);
    this.ground.ellipse(x, y, radius.x, radius.y).stroke({ color: 0xffcf8a, width: 2, alpha: .18 + .22 * Math.sin(t * Math.PI) });
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      sprites = Array.from({ length: reducedMotion() ? 5 : 14 }, () => {
        const sprite = new Sprite(this.textures.fxArcherArrow);
        sprite.anchor.set(.97, .49);
        sprite.scale.set(52 / sprite.texture.width);
        sprite.rotation = Math.PI / 2;
        this.skillVfx.addChild(sprite);
        return sprite;
      });
      this.vfxSprites.set(effect, sprites);
    }
    for (let index = 0; index < sprites.length; index++) {
      const angle = index * 2.39996, spread = Math.sqrt((index + .5) / sprites.length) * .86;
      const ax = x + Math.cos(angle) * radius.x * spread;
      const ay = y + Math.sin(angle) * radius.y * spread;
      const fall = (effect.age * 2.5 + index / sprites.length) % 1;
      const tipY = ay - 145 * (1 - fall);
      sprites[index].position.set(ax, tipY);
      sprites[index].alpha = Math.min(1, fall * 5, (1 - t) * 6);
      if (fall > .9) this.effects.circle(ax, ay, 3 + Math.sin(time * 30 + index) * .6)
        .fill({ color: 0xc99c66, alpha: .28 * (1 - t) });
    }
  }

/** 빙결 착탄 — 실제 둔화 반경을 따라 얼음 파열과 눈싸라기가 퍼진다. */
export function drawIceBurst(this: GameView, effect: Effect, x: number, y: number, t: number): void {
    const radius = projectedAreaRadii(effect.radius ?? skillArea('iceArrow', 1).projectileRadius!);
    const spread = Math.min(1, t * 2.4), fade = 1 - t;
    this.ground.ellipse(x, y, radius.x * spread, radius.y * spread)
      .stroke({ color: 0xa5e8ff, width: 3, alpha: .95 * fade });
    this.ground.ellipse(x, y, radius.x * spread * .78, radius.y * spread * .78)
      .stroke({ color: 0x5cbaf0, width: 1.5, alpha: .55 * fade });
    this.glow.ellipse(x, y - 12, radius.x * spread * .7, radius.y * spread * .7)
      .fill({ color: 0x74cfff, alpha: .18 * fade });
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      const sx = x + Math.cos(angle) * radius.x * spread * .7;
      const sy = y + Math.sin(angle) * radius.y * spread * .7 - 11;
      const size = 7 + index % 3 * 2;
      this.effects.moveTo(sx, sy - size).lineTo(sx + size * .55, sy)
        .lineTo(sx, sy + size * .4).lineTo(sx - size * .55, sy)
        .closePath().fill({ color: index % 2 ? 0xa9e7fc : 0x70c8ef, alpha: .58 * fade });
      this.effects.moveTo(sx, sy - size).lineTo(sx + size * .3, sy - 1)
        .stroke({ color: 0xe0faff, width: 1, alpha: .85 * fade });
    }
    const flakes = reducedMotion() ? 7 : 22;
    for (let index = 0; index < flakes; index++) {
      const angle = index * 2.39996;
      const reach = (.35 + (index % 5) * .13) * spread;
      const fx = x + Math.cos(angle) * radius.x * reach;
      const fy = y + Math.sin(angle) * radius.y * reach - 17 - t * 18;
      const size = index % 3 === 0 ? 6 : 3.5;
      this.effects.moveTo(fx - size, fy).lineTo(fx + size, fy)
        .moveTo(fx, fy - size).lineTo(fx, fy + size)
        .stroke({ color: index % 3 === 0 ? 0xe7fbff : 0x8cdafa, width: 1.6, alpha: .95 * fade });
      if (index % 3 === 0) this.glow.circle(fx, fy, size * 2).fill({ color: 0xa7e6ff, alpha: .24 * fade });
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
    // 날개·머리·발톱이 읽히는 독수리 원화 한 마리만 머리 위로 띄운다.
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      const sprite = new Sprite(this.textures.fxHawkEagle);
      sprite.anchor.set(.5);
      this.skillVfx.addChild(sprite);
      sprites = [sprite];
      this.vfxSprites.set(effect, sprites);
    }
    const eagle = sprites[0];
    eagle.scale.set((116 + t * 14) / eagle.texture.width);
    eagle.position.set(x, y - 82 - t * (reducedMotion() ? 0 : 66));
    eagle.alpha = Math.min(1, t * 9, (1 - t) * 2.4);
    // [작업 261] 표식이 퍼지는 동안 발밑에서 옅은 바람 나선이 감기며 솟는다 — 버프 중 오라의 시작.
    const fade = 1 - t;
    this.glow.circle(x, y - 10, 26 + t * 34).fill({ color: 0x9ee8ff, alpha: .07 * fade });
    for (let index = 0; index < 2; index++) {
      const phase = time * (2.6 + index * .9) + index * Math.PI;
      let previous: [number, number] | null = null;
      for (let step = 0; step <= 11; step++) {
        const u = step / 11;
        const angle = phase + u * Math.PI * 2.1;
        const spiral = (5 + u * 17) * (.75 + t * .55);
        const px = x + Math.cos(angle) * spiral;
        const py = y - 3 - u * 48 - t * 12 + Math.sin(angle) * spiral * .22;
        if (previous) this.effects.moveTo(previous[0], previous[1]).lineTo(px, py).stroke({ color: index ? 0xdcf7ff : 0x9ee8ff, width: 1.6, alpha: .5 * fade * (1 - u * .45) });
        previous = [px, py];
      }
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
    const radius = projectedAreaRadii(skillArea('spin', level).radius!).x;
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

/**
 * 피해 숫자 색(작업 260, 사용자 지시 "일반데미지는 흰색 크리티컬은 빨간색 추가데미지는 노랑색").
 *
 * 내가 넣은 피해는 흰색(일반)·빨강(치명타)·노랑(추가 데미지) 세 가지로 읽히고, 맞는 피해는 주황,
 * 회피는 하늘, 회복은 초록으로 서로 겹치지 않는다. 맞는 피해를 빨강에 두면 내 치명타와 헷갈리므로
 * 한 단계 따뜻한 주황(`0xff7a6a`보다 노랑·빨강 사이가 분명하다)을 쓴다.
 */
export const DAMAGE_LABEL_COLORS = {
  hit: 0xffffff, crit: 0xff4d4d, bonus: 0xffdf40,
  enemyStrike: 0xff8a4c, evade: 0xbfe4ff, heal: 0x86f0a2
} as const;

/** 숫자 한 장의 글자색 — 추가 데미지가 치명타보다 먼저다(추가 몫은 치명타와 별개로 항상 노랑). */
export function damageLabelColor(effect: Pick<Effect, 'kind' | 'crit' | 'bonus'>): number {
  if (effect.kind === 'evade') return DAMAGE_LABEL_COLORS.evade;
  if (effect.kind === 'heal') return DAMAGE_LABEL_COLORS.heal;
  if (effect.kind === 'enemyStrike') return DAMAGE_LABEL_COLORS.enemyStrike;
  if (effect.bonus) return DAMAGE_LABEL_COLORS.bonus;
  return effect.crit ? DAMAGE_LABEL_COLORS.crit : DAMAGE_LABEL_COLORS.hit;
}

/** 숫자 한 장의 글자 — 피해·회복은 **정수**만 적는다(맞은 피해 `-7.2` 방지, 작업 260). */
export function damageLabelText(effect: Pick<Effect, 'kind' | 'amount'>): string {
  if (effect.kind === 'evade') return '회피';
  return `${effect.kind === 'heal' ? '+' : '-'}${Math.round(effect.amount ?? 0)}`;
}

export function updateDamageLabels(this: GameView, effects: Effect[], project: (x: number, y: number) => [number, number]): void {
    // 추가옵션(작업 238): 피해 숫자에 회피(`회피`)와 회복(`+N`, 피흡·5초 회복)을 더한다.
    // 적의 반격(작업 245)도 같은 숫자판을 써서 잃은 체력을 보여 준다.
    const labeled = effects.filter(effect => effect.kind === 'hit' || effect.kind === 'evade' || effect.kind === 'heal' || effect.kind === 'enemyStrike');
    const hits = new Set(labeled);
    for (const [effect, label] of this.damageLabels) if (!hits.has(effect)) { this.labels.removeChild(label); label.destroy(); this.damageLabels.delete(effect); }
    for (const effect of labeled) {
      let label = this.damageLabels.get(effect);
      if (!label) {
        const text = damageLabelText(effect);
        // 일반 피해 흰색·치명타 빨강·추가 데미지 노랑(작업 260). 사용자 확정 1안 — 외곽선 없이 기본
        // `Cinzel` 굵은 글씨 그대로 두고 색만으로 구분한다(맞은 피해 주황은 내 치명타 빨강과 갈린다).
        const fill = damageLabelColor(effect);
        const size = effect.kind === 'evade' ? 14 : effect.crit ? 21 : 16;
        label = new Text({ text, style: { fontFamily: 'Cinzel', fontSize: size, fontWeight: 'bold', fill } });
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


export function drawEnemyStrike(this: GameView, x: number, y: number, t: number, angle: number): void {
    // 적의 반격(작업 245) — 플레이어 몸 위를 스치는 세 줄 할퀴기와 짧은 충격 섬광.
    const alpha = 1 - t;
    for (let i = 0; i < 3; i++) {
      const lean = (i - 1) * .26, a = angle + lean;
      const cx = x + Math.cos(a) * 3, cy = y - 24 + Math.sin(a) * 3;
      const reach = 18 + t * 16;
      this.effects.moveTo(cx - Math.cos(a) * reach * .7, cy - 11 + Math.sin(a) * reach * .3)
        .lineTo(cx + Math.cos(a) * reach, cy + 9 + Math.sin(a) * reach * .3)
        .stroke({ color: i === 1 ? 0xfff1e0 : 0xff5a4a, width: .8 + 2.4 * alpha, alpha: .9 * alpha });
    }
    this.effects.circle(x, y - 22, 8 + t * 14).fill({ color: 0xffb0a0, alpha: .22 * alpha });
  }

export function drawEffects(this: GameView, world: CombatEngine, project: (x: number, y: number) => [number, number], time: number): void {
    const liveEffects = new Set(world.effects);
    for (const [effect, sprites] of this.vfxSprites) if (!liveEffects.has(effect)) { for (const sprite of sprites) sprite.destroy(); this.vfxSprites.delete(effect); }
    for (const [effect, layers] of this.vfxLayers) if (!liveEffects.has(effect)) { for (const layer of layers) layer.destroy({ children: true }); this.vfxLayers.delete(effect); }
    for (const effect of world.effects) {
      const [x, y] = project(effect.x, effect.y), t = effect.age / effect.duration;
      drawMeleeArea.call(this, effect, x, y);
      const screenAngle = Math.atan2(Math.sin(effect.angle) * .43 + Math.cos(effect.angle) * .43, Math.cos(effect.angle) * .86 - Math.sin(effect.angle) * .86);
      if (this.drawSkillVfx(world, effect, x, y, t, screenAngle, time)) continue;
      if (effect.kind === 'evade' || effect.kind === 'heal') continue;
      if (effect.kind === 'enemyStrike') { this.drawEnemyStrike(x, y, t, effect.angle); continue; }
      if (effect.kind === 'death') this.drawDeath(x, y, t, effect.angle);
      else this.drawHit(x, y, t, effect.angle);
    }
    this.updateDamageLabels(world.effects, project);
  }
