/**
 * 부활 대기 상태 카드(B안) — 쓰러진 5초 동안 화면 중앙에 남은 초를 그린다(2026-11-25).
 *
 * 판정·문구는 `src/game/reviveNotice.ts`가 갖고, 이 파일은 **DOM만** 만진다:
 *  · 카드는 처음 필요할 때 `.battle` 안에 한 번 붙이고, 플래시가 끝나면 지운다(없으면 매 프레임 아무 일도 안 한다).
 *  · 매 프레임 바뀌는 것은 링 호 길이·진행 막대 폭·남은 초뿐이다 — 값이 달라졌을 때만 쓴다.
 *  · 화면을 막지 않는다(`pointer-events: none`) — 자동 사냥 화면 위에 얹히는 상태 표시다.
 *
 * 0초가 되면 엔진이 곧바로 `reviveHero()`로 만혈 부활시키므로, 타이머만 보고는 `부활!`을 보여 줄 수
 * 없다. 그래서 "대기 중이었다"를 이 클래스가 기억했다가 0이 된 순간부터 `REVIVE_FLASH_SECONDS`(0.9초)
 * 동안 플래시를 유지한다.
 */
import {
  REVIVE_CARD_DOWN, REVIVE_CARD_NOTE, REVIVE_CARD_RESTART, REVIVE_CARD_REVIVED, REVIVE_FLASH_SECONDS,
  reviveChipText, reviveCountdownText, reviveNoticeState, reviveScreenReaderText
} from '../game/reviveNotice';
import type { Interface } from './interface';

/** 92px 링의 반지름(시안 `02_revive_b_card.png`의 `r="42"`). */
const RING_RADIUS = 42;
/** 링 둘레 — `stroke-dasharray`의 전체 길이(2πr ≈ 263.89). */
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
/** 화면 틱이 몇 초 쉬었든 플래시는 한 번만 — 탭이 숨겨졌다 돌아와도 0.9초 안에 끝난다. */
const MAX_FLASH_STEP = .1;

const cardMarkup = (): string => `<div class="revive-card" role="status" aria-live="polite">
  <div class="rvc-ring" aria-hidden="true"><svg viewBox="0 0 92 92"><circle class="rvc-track" cx="46" cy="46" r="${RING_RADIUS}"></circle><circle class="rvc-arc" cx="46" cy="46" r="${RING_RADIUS}"></circle></svg><b class="rvc-count"><span class="rvc-num">5</span><span class="rvc-unit">초</span></b></div>
  <div class="rvc-title" aria-hidden="true">${REVIVE_CARD_DOWN}</div>
  <span class="rvc-chip" aria-hidden="true"></span>
  <p class="rvc-desc" aria-hidden="true"><b class="rvc-desc-count">5초</b> 뒤 만혈로 부활합니다.<br>${REVIVE_CARD_RESTART}</p>
  <div class="rvc-bar" aria-hidden="true"><i class="rvc-fill"></i></div>
  <p class="rvc-note" aria-hidden="true">${REVIVE_CARD_NOTE}</p>
  <p class="rvc-sr"></p>
</div>`;

/** 쓰러진 동안 전투 화면을 살짝 탈색·어둡게 하는 클래스(시안과 같은 톤). */
const DOWN_CLASS = 'is-revive-down';

export class ReviveNotice {
  private card?: HTMLElement;
  private num?: HTMLElement;
  private chip?: HTMLElement;
  private descCount?: HTMLElement;
  private arc?: SVGCircleElement;
  private fill?: HTMLElement;
  private sr?: HTMLElement;
  /** 화면에 카드가 떠 있는가 — `Interface.message()`가 같은 문장의 토스트를 접는 데 쓴다. */
  private on = false;
  /** 부활 대기에서 막 깨어난 순간의 플래시 잔여 시간(초). */
  private flashLeft = 0;
  /** 지난 프레임에 대기 중이었는가 — 0초 전이를 잡는다. */
  private wasDown = false;
  /** 쓰러진 순간 붙잡아 둔 값 — 플래시 동안에도 같은 문구를 보여 준다. */
  private lostGold = 0;
  private floor = 1;
  /** 마지막 틱 시각(ms) — 플래시 감소에 쓴다. */
  private lastAt = 0;
  private lastLeft = -1;
  private lastStatus = '';

  /** 지금 카드가 떠 있는가(토스트 중복 억제 판정). */
  get visible(): boolean { return this.on; }

  /** 매 프레임(`Interface.tick`) 한 번 — 남은 초를 읽어 카드를 그리고, 다 끝나면 지운다. */
  render(ui: Interface): void {
    const now = Date.now();
    const dt = this.lastAt ? Math.min(MAX_FLASH_STEP, Math.max(0, (now - this.lastAt) / 1000)) : 0;
    this.lastAt = now;
    const world = ui.world;
    const floor = world.save.floor;
    const timer = world.reviveTimer;
    if (timer > 0) {
      this.wasDown = true;
      this.flashLeft = REVIVE_FLASH_SECONDS;
      this.floor = floor;
      this.lostGold = world.reviveLostGold;
    } else if (this.wasDown) {
      // 방금 만혈로 돌아왔다 — 여기서부터 `부활!` 플래시 0.9초.
      this.wasDown = false;
    } else this.flashLeft = Math.max(0, this.flashLeft - dt);

    const state = reviveNoticeState(timer, floor, this.flashLeft);
    const battle = ui.root?.querySelector?.<HTMLElement>('.battle');
    // 쓰러져 있는 동안(체력 0) 전투 화면을 탈색하고 HP 바를 붉게 — 1~4층은 즉시 부활이라 눈에 띄지 않는다.
    const down = world.player.hp <= 0;
    battle?.classList.toggle(DOWN_CLASS, down);
    battle?.querySelector<HTMLElement>('.health-bar.hp')?.classList.toggle('is-down', down);
    if (!state || !battle) { this.hide(); return; }

    const card = this.mount(battle);
    card.classList.toggle('is-revived', state.kind === 'flash');
    if (state.kind === 'flash') {
      // 링·막대는 가득 찬 채로 한 번 번쩍이고 사라진다.
      if (this.num && this.num.textContent !== REVIVE_CARD_REVIVED) this.num.textContent = REVIVE_CARD_REVIVED;
      this.setLeft(1);
      this.status(`부활했습니다. ${reviveChipText(this.lostGold, this.floor)}`);
      return;
    }
    this.lastLeft = -1;
    const seconds = String(state.seconds);
    if (this.num && this.num.textContent !== seconds) this.num.textContent = seconds;
    const desc = reviveCountdownText(state.seconds);
    if (this.descCount && this.descCount.textContent !== desc) this.descCount.textContent = desc;
    const chip = reviveChipText(this.lostGold, this.floor);
    if (this.chip && this.chip.textContent !== chip) this.chip.textContent = chip;
    this.setLeft(state.ratio);
    this.status(reviveScreenReaderText(this.lostGold, this.floor, state.seconds));
  }

  /** 링 호·진행 막대를 `ratio`(0~1)로 — 0.5% 넘게 달라졌을 때만 다시 쓴다(매 프레임 DOM 쓰기 방지). */
  private setLeft(ratio: number): void {
    const value = Math.max(0, Math.min(1, ratio));
    if (Math.abs(value - this.lastLeft) < .005) return;
    this.lastLeft = value;
    if (this.arc) this.arc.style.strokeDasharray = `${(value * RING_LENGTH).toFixed(1)} ${RING_LENGTH.toFixed(1)}`;
    if (this.fill) this.fill.style.width = `${(value * 100).toFixed(1)}%`;
  }

  /** 스크린리더 문장은 **바뀔 때만** 쓴다 — 매초 숫자를 읽어 주면 시끄럽다. */
  private status(text: string): void {
    if (!this.sr || this.lastStatus === text) return;
    this.lastStatus = text;
    this.sr.textContent = text;
  }

  private mount(battle: HTMLElement): HTMLElement {
    if (this.card?.isConnected) return this.card;
    battle.insertAdjacentHTML('beforeend', cardMarkup());
    const card = battle.querySelector<HTMLElement>('.revive-card');
    if (!card) throw new Error('부활 대기 카드를 만들지 못했습니다.');
    this.card = card;
    this.num = card.querySelector<HTMLElement>('.rvc-num') ?? undefined;
    this.chip = card.querySelector<HTMLElement>('.rvc-chip') ?? undefined;
    this.descCount = card.querySelector<HTMLElement>('.rvc-desc-count') ?? undefined;
    this.arc = card.querySelector<SVGCircleElement>('.rvc-arc') ?? undefined;
    this.fill = card.querySelector<HTMLElement>('.rvc-fill') ?? undefined;
    this.sr = card.querySelector<HTMLElement>('.rvc-sr') ?? undefined;
    this.lastLeft = -1; this.lastStatus = '';
    this.on = true;
    return card;
  }

  private hide(): void {
    if (!this.card) return;
    this.card.remove();
    this.card = this.num = this.chip = this.descCount = this.fill = this.sr = undefined;
    this.arc = undefined;
    this.on = false; this.lastLeft = -1; this.lastStatus = '';
  }
}
