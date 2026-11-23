/**
 * 운영 공지 (2026-11-22, 대장님 확정 1안).
 *
 * 공지 원문은 `public/notices.json` 한 곳에 둔다 — `maintenance.json`과 같은 방식으로, 운영 중이나
 * 패치 시 **서버·빌드 없이 파일만 고쳐** 공지를 올리고 내린다. 파일을 읽지 못하거나 형식이 어긋나도
 * 게임은 그대로 열려 있어야 하므로, 이상한 줄은 버리고 건너뛴다(점검 파일과 같은 원칙).
 *
 * `NEW` 표시는 **이 기기에서 안 본 공지**만 붙인다. 읽은 기록은 서버 세이브가 아니라 이 기기의
 * localStorage(`djrpg_notice_read.v1`)에 공지 `id` 목록으로 남긴다 — 계정마다 따지는 정보가 아니라
 * "이 화면에서 봤는가"이고, 세이브 계약(`store.ts`)을 건드리지 않으려는 선택이다. 공지 목록이 길어지면
 * 본 목록에 없는 오래된 기록은 읽을 때마다 잘라 내고, 읽은 기록에 넣지 못하면 그 세션에만 NEW가 다시
 * 붙는다(기기 저장이 막힌 경우뿐이다).
 */
export const NOTICES_URL = '/notices.json';
/** 이 기기의 읽은 공지 기록 키 — `store.ts`의 다른 기기 저장 키와 같은 `djrpg-` 접두어를 따른다. */
export const NOTICES_READ_KEY = 'djrpg_notice_read.v1';

/** `notices.json`의 공지 한 줄 — 운영자가 파일에서 고치는 값이라 모두 문자열·boolean뿐이다. */
export type Notice = {
  /** 공지 구분값 — 읽은 기록의 기준이므로 내용을 고치더라도 바꾸지 않는다. */
  id: string;
  /** 목록 카드의 제목. */
  title: string;
  /** 목록·본문에 적히는 날짜 (`2026.11.22`처럼 사람이 읽는 형태 그대로). */
  date: string;
  /** 카드 왼쪽의 붉은 뱃지 (`NEW` 등, 없으면 뱃지를 두지 않는다). */
  tag: string;
  /** 고정 공지 — 목록 맨 위에 세운다. */
  pinned: boolean;
  /** 본문. 운영자가 `\n`으로 줄을 나눈다. */
  body: string;
  /** 카드 아래 작성자 줄 (`운영팀`). */
  author: string;
};

/** 파일이 없을 때의 기본값 — 공지창은 비어 보이고 게임은 그대로다. */
export const NOTICES_EMPTY: readonly Notice[] = [];

const text = (value: unknown, limit: number): string => typeof value === 'string' ? value.trim().slice(0, limit) : '';

/** 갈아 끼우지 않는 공지 뱃지 — `NEW`만 붉게 칠한다. */
export const NOTICE_TAG_NEW = 'NEW';

/**
 * `notices.json`을 공지 목록으로 읽는다.
 *
 * `version`·공지가 아니거나 형식이 어긋난 줄은 버린다(점검 파일 `parseMaintenance`와 같은 원칙 —
 * 오타 하나로 게임이 막히면 안 된다). 같은 `id`가 두 번 오면 먼저 온 것만 남긴다. 목록은 파일 순서를
 * 그대로 두되 `pinned` 공지가 앞으로 온다(같은 `pinned` 안에서는 파일 순서 유지).
 */
export function parseNotices(raw: unknown): Notice[] {
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(body.notices) ? body.notices : [];
  const seen = new Set<string>();
  const notices: Notice[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const id = text(item.id, 120);
    const title = text(item.title, 120);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    notices.push({
      id,
      title,
      date: text(item.date, 40),
      tag: text(item.tag, 20),
      pinned: item.pinned === true,
      body: text(item.body, 2000),
      author: text(item.author, 40),
    });
  }
  return notices.sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

/** 이 기기의 읽은 공지 `id` 목록 — 저장이 막혀 있거나 형식이 어긋나면 기록이 없는 것으로 본다. */
export function readSeenNoticeIds(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTICES_READ_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** 공지를 읽었다고 기록한다 — 실패해도 화면 표시는 그대로 진행한다(이 세션에서만 다시 붙는다). */
export function saveSeenNoticeIds(ids: ReadonlySet<string>): boolean {
  try {
    localStorage.setItem(NOTICES_READ_KEY, JSON.stringify([...ids].slice(0, 500)));
    return true;
  } catch {
    return false;
  }
}

/**
 * 아직 안 본 공지가 있는가 — 레일 버튼의 붉은 `NEW` 뱃지 조건.
 * 새 공지가 `notices.json`에 내려오면 기록에 없는 `id`만 새 것으로 센다.
 */
export function hasUnreadNotices(notices: readonly Notice[], seen: ReadonlySet<string>): boolean {
  return notices.some(notice => !seen.has(notice.id));
}

/** 공지 모달을 열어 모두 읽었을 때의 기록 — 지금 목록의 `id`를 모두 남긴다. */
export function markAllNoticesSeen(notices: readonly Notice[], seen: ReadonlySet<string>): Set<string> {
  const next = new Set(seen);
  for (const notice of notices) next.add(notice.id);
  return next;
}

/**
 * `notices.json`을 내려받는다 — 읽지 못하면 `null`을 돌려주고 호출한 쪽은 마지막 목록을 유지한다
 * (`fetchMaintenance`와 같은 모양). 배포가 새 공지 파일을 올리면 다음 열람에서 바로 보이도록
 * 캐시를 쓰지 않고 매번 다시 읽는다.
 */
export async function fetchNotices(fetcher?: typeof fetch): Promise<readonly Notice[] | null> {
  try {
    const response = await (fetcher ?? fetch)(`${NOTICES_URL}?t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) return null;
    return parseNotices(await response.json());
  } catch { return null; }
}
