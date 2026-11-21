import { apiHeaders } from '../game/appVersion';
import { LEGEND_BANNER_MS, LegendBoard, legendAnnouncementText, readLegendAnnouncement } from '../game/legendBoard';
import type { Interface } from './interface';

/** 전광판을 새로 확인하는 간격 — 접속 중인 모두에게 30초 안에 닿는다.
 *  (작업 245: 5초→30초, 이번 정리: 30초→60초. 무료 Functions 한도(10만 건/일)를 넘긴 주된 호출 중
 *  하나였고, 전광판은 1분 늦어도 게임에 지장이 없다. 숨김 탭에서는 확인하지 않고 돌아오면 즉시 한 번 본다.) */
export const LEGEND_POLL_MS = 60000;
/** 배너가 바뀌는지 확인하는 화면 갱신 간격. */
const LEGEND_PAINT_MS = 200;

/**
 * 보물 주머니 레전드 전광판 (작업 208, `#3965`).
 *
 * 화면 위쪽에 황금빛 띠 하나를 얹고, 대기열에 들어온 공지를 5.5초씩 보여 준다. 공지는 서버
 * `djrpg_announcements`를 5초마다 확인해 받고(게스트는 확인하지 않는다), 내가 뽑은 레전드는
 * 서버에 올린 뒤 그 줄을 바로 띄운다.
 */
export function mountLegendBar(ui: Interface, options: { poll?: boolean } = {}): void {
  const bar = document.createElement('div');
  bar.className = 'legend-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  const text = document.createElement('span');
  text.className = 'legend-bar-text';
  bar.append(text);
  ui.root.append(bar);

  const paint = (now = Date.now()): void => {
    const current = ui.legend.current(now);
    bar.hidden = !current;
    if (current) text.textContent = legendAnnouncementText(current.character, current.item);
  };
  paint();
  const painter = window.setInterval(paint, LEGEND_PAINT_MS);
  window.addEventListener('pagehide', () => clearInterval(painter), { once: true });

  if (options.poll === false || ui.session.guest) return;
  const check = async (): Promise<void> => {
    if (document.hidden) return;
    try {
      const response = await fetch('/api/market', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${ui.session.token}` }), body: JSON.stringify({ action: 'announcements' }) });
      if (!response.ok) return;
      const data = await response.json();
      if (ui.legend.accept(Array.isArray(data?.announcements) ? data.announcements : []) > 0) paint();
    } catch { /* 다음 차례에 다시 확인한다(전광판은 없어도 게임에 지장이 없다). */ }
  };
  void check();
  const poller = window.setInterval(() => { void check(); }, LEGEND_POLL_MS);
  // 숨은 탭에서는 확인하지 않고(위 check), 탭이 돌아오면 60초를 기다리지 않고 한 번 본다.
  const wake = (): void => { void check(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pagehide', () => { clearInterval(poller); document.removeEventListener('visibilitychange', wake); }, { once: true });
}

/**
 * 내가 주머니에서 레전드를 뽑았을 때 — 정식 계정은 서버에 공지를 올려 모두의 화면에 띄우고,
 * 게스트는 자기 화면에만 보여 준다. 서버에 못 올렸더라도 내 화면에는 띄운다.
 */
export async function sharePouchLegend(ui: Interface, itemName: string): Promise<void> {
  const character = ui.world.save.name?.trim() || '모험가';
  const local = (): void => { ui.legend.show({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, character, item: itemName, createdAt: Date.now() }); };
  if (ui.session.guest) { local(); return; }
  try {
    const response = await fetch('/api/market', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${ui.session.token}` }), body: JSON.stringify({ action: 'announcePouchLegend', itemName }) });
    const data = await response.json().catch(() => undefined);
    const row = response.ok ? readLegendAnnouncement(data?.announcement) : undefined;
    if (row) { ui.legend.show(row); return; }
  } catch { /* 서버 연결이 없어도 내 화면 표시는 계속한다. */ }
  local();
}

export { LEGEND_BANNER_MS, LegendBoard };
