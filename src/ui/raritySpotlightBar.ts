import { SPOTLIGHT_BANNER_MS, spotlightAnnouncementText } from '../game/raritySpotlight';
import type { Item } from '../game/items';
import type { Interface } from './interface';

/**
 * 유니크·전설 획득 띠 (백로그 3번) — 화면 **위쪽**에 3.5초 한 줄.
 *
 * 전설 전광판(`legendBar.ts`)은 접속 중인 **모두**에게 보이는 서버 공지고, 이 띠는 **내 화면에만**
 * 뜨는 획득 알림이다. 사냥(필드)·던전·방치·보물 주머니 어디서 나와도 같은 자리·같은 문장을 쓴다
 * (`domainBindings.ts`의 `itemGranted` 한 곳에서 부른다).
 *
 * 모션 감소 설정을 존중한다 — CSS가 `prefers-reduced-motion`에서 흔들림·빛 번짐을 끈다.
 */
export type SpotlightBoard = {
  /** 상위 등급(유니크·전설)이면 띠를 띄우고, 아니면 아무 일도 하지 않는다. */
  show: (item: Item) => void;
  /** 지금 떠 있는 띠를 바로 닫는다(창을 닫거나 다른 화면으로 갈 때). */
  hide: () => void;
};

/** 아직 띠를 만들지 않았을 때 쓰는 빈 보드 — 화면 밖(테스트·초기화 전)에서도 호출이 안전하다. */
export const emptySpotlightBoard: SpotlightBoard = { show() { /* 화면 없음 */ }, hide() { /* 화면 없음 */ } };

/** 띠를 화면에 한 번 붙이고 `ui.spotlight`에 연결한다(생성자에서 한 번). */
export function mountRaritySpotlight(ui: Interface, options: { duration?: number } = {}): SpotlightBoard {
  const duration = options.duration ?? SPOTLIGHT_BANNER_MS;
  const bar = document.createElement('div');
  bar.className = 'rarity-spotlight';
  bar.hidden = true;
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  const text = document.createElement('span');
  text.className = 'rarity-spotlight-text';
  bar.append(text);
  (ui.root ?? document.body).append(bar);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    bar.hidden = true;
    text.textContent = '';
  };
  const show = (item: Item): void => {
    if (item.rarity !== 'unique' && item.rarity !== 'legendary') return;
    text.textContent = spotlightAnnouncementText(item);
    bar.dataset.rarity = item.rarity;
    bar.hidden = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(hide, duration);
  };
  const board: SpotlightBoard = { show, hide };
  ui.spotlight = board;
  return board;
}
