import type { Action, Effect } from '../game/world';

export class SkillFeedback {
  private seen = new WeakSet<Effect>();
  private pulses = new WeakMap<HTMLElement, Animation>();
  private artPulses = new WeakMap<HTMLElement, Animation>();

  collect(effects: Effect[] = []): Set<Action> {
    const casts = new Set<Action>();
    for (const effect of effects) {
      if (this.seen.has(effect)) continue;
      this.seen.add(effect);
      // 피흡·회복·회피(작업 238)와 적의 반격(작업 245)은 스킬 버튼을 깜빡이는 대상이 아니다.
      if (effect.age > .25 || effect.kind === 'hit' || effect.kind === 'death' || effect.kind === 'heal' || effect.kind === 'evade' || effect.kind === 'enemyStrike' || effect.kind === 'impactArea' || effect.kind === 'iceBurst') continue;
      // 궁수 화살·화살비·호크아이와 마법사 폭발·노바·보호막은 버튼 아이콘을 깜빡이는 대상이 아니다(스킬 이펙트만 그린다).
      if (effect.kind === 'shot' || effect.kind === 'snipeMark' || effect.kind === 'volleyCast' || effect.kind === 'rain' || effect.kind === 'hawk' || effect.kind === 'burst' || effect.kind === 'nova' || effect.kind === 'ward') {
        if (effect.source) casts.add(effect.source);
        continue;
      }
      casts.add(effect.kind === 'slash' ? 'attack' : effect.kind);
    }
    return casts;
  }

  clear(button: HTMLButtonElement): void {
    this.pulses.get(button)?.cancel(); this.pulses.delete(button);
    const art = button.querySelector<HTMLElement>('.skill-art');
    if (art) { this.artPulses.get(art)?.cancel(); this.artPulses.delete(art); }
  }

  pulse(button: HTMLButtonElement, basic = false): void {
    if (typeof button.animate !== 'function') return;
    this.clear(button);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = basic ? 160 : 480;
    const shadow = basic ? '0 0 6px var(--skill-color)' : '0 0 0 2px var(--skill-color), 0 0 18px var(--skill-color)';
    const pulse = button.animate(reduced ? [
      { boxShadow: shadow }, { boxShadow: shadow }
    ] : [
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: basic ? 'scale(1.025)' : 'scale(1.1)', filter: basic ? 'brightness(1.18)' : 'brightness(1.65)', boxShadow: shadow, offset: .22 },
      { transform: 'scale(1)', filter: 'brightness(1)', boxShadow: '0 0 0 10px transparent, 0 0 0 transparent' }
    ], { duration, easing: 'ease-out' });
    this.pulses.set(button, pulse);
    pulse.onfinish = () => { if (this.pulses.get(button) === pulse) this.pulses.delete(button); };
    const art = button.querySelector<HTMLElement>('.skill-art');
    if (!reduced && art?.animate) {
      const animation = art.animate([{ transform: 'scale(1)' }, { transform: basic ? 'scale(1.07)' : 'scale(1.18)', offset: .22 }, { transform: 'scale(1)' }], { duration, easing: 'ease-out' });
      this.artPulses.set(art, animation);
      animation.onfinish = () => { if (this.artPulses.get(art) === animation) this.artPulses.delete(art); };
    }
  }
}
