/**
 * 가방 칸 묶음 (작업 246) — 같은 스킬북·같은 보물 주머니는 **한 칸에 `×N`**으로 보여 준다.
 *
 * 예전 `equipModal`은 보물 주머니만 묶고 스킬북은 `count: 1`로 하나씩 늘어놓아, 같은 책이 세 권
 * 있어도 `×1` 칸 세 개로 보였다(사용자 제보). 공용창고는 이미 `warehouseModal`의 `stacksOf`가
 * 같은 규칙으로 묶고 있으므로 **두 화면의 묶는 기준을 여기 한 곳에 맞춘다**.
 *
 * 묶음은 **보기만** 묶는다 — 칸이 들고 있는 `item.id`는 그 묶음의 첫 아이템이고, 사용·판매·창고
 * 이동·저장 동기화는 지금처럼 개별 `item.id`로 처리된다(`useSkillBook`은 같은 `skillId` 책을
 * 필요한 권수만큼 한 번에 소모한다).
 *
 * [작업 247] 사용자가 가방 칸 순서를 확정했다 — **보물 주머니(첫 칸) → 장비 → 스킬북(맨 뒤)**.
 * 등급순 정렬을 켜고 꺼도 이 3단은 그대로이고, 등급순은 **같은 묶음 안에서만** 적용된다.
 * 스킬북 구간은 다시 **직업별로 묶는다** — 내 직업 책이 먼저, 그다음 `전사 → 궁수 → 마법사`
 * 고정 순서이고, 같은 직업 안에서는 그 직업의 스킬 표 순서(`skillOrderFor`) → 이름 순이다.
 * 장비창 가방(`equipModal`)과 공용창고 목록(`warehouseModal`)이 같은 비교 함수를 쓴다.
 */
import { isPouch, isSkillBook, rarityRanks, skillBookJob, type Item } from '../game/items';
import { skillOrderFor, type Job } from '../game/skills';

export type BagStack = {
  /** 같은 묶음의 첫 아이템 — 칸(`data-item-id`)·상세 보기가 이 id를 쓴다. */
  item: Item;
  /** 그 칸에 모인 개수(1이면 배지를 달지 않는다). */
  count: number;
  /** 묶음 키 — 주머니는 하나, 스킬북은 `skillId`, 장비는 아이템 id. */
  key: string;
};

/** 아이템 목록을 화면 칸 단위로 묶는다 — 순서는 **처음 나온 차례**를 지킨다. */
export function bagStacks(items: Item[]): BagStack[] {
  const order: string[] = [];
  const map = new Map<string, BagStack>();
  for (const item of items) {
    const key = stackKey(item);
    const stack = map.get(key);
    if (stack) { stack.count++; continue; }
    map.set(key, { item, count: 1, key });
    order.push(key);
  }
  return order.map(key => map.get(key)!);
}

/**
 * 한 묶음 칸에 모인 실제 아이템들(가방 순서, 작업 249).
 *
 * 묶음 판매 등록은 칸의 대표 id 하나가 아니라 **이 아이템들의 id 전부**를 서버로 보낸다
 * (`market.act('register', { itemIds })`) — 서버도 같은 기준(`skillId`)으로 묶음을 확인한다.
 */
export function stackMembers(items: Item[], stack: BagStack): Item[] {
  return items.filter(item => stackKey(item) === stack.key);
}

/**
 * 가방 3단 순서(작업 247) — 보물 주머니 0 · 장비 1 · 스킬북 2.
 * 받은 주머니는 어디서든 첫 칸에 있어야 열어 볼 수 있고, 스킬북은 스킬 창에서 다루는 물건이라
 * 장비 뒤로 모은다(사용자 확정).
 */
export function bagKindRank(item: Item): number {
  return isPouch(item) ? 0 : isSkillBook(item) ? 2 : 1;
}

/** 스킬북 직업 묶음 순서 — 내 직업이 0, 나머지는 `전사 → 궁수 → 마법사` 고정(작업 247). */
const JOB_BOOK_ORDER: Job[] = ['warrior', 'archer', 'mage'];
export function skillBookJobRank(item: Item, myJob: Job): number {
  const job = skillBookJob(item) ?? myJob;
  if (job === myJob) return 0;
  const index = JOB_BOOK_ORDER.filter(entry => entry !== myJob).indexOf(job);
  return 1 + (index < 0 ? JOB_BOOK_ORDER.length : index);
}

/** 같은 직업 스킬북끼리의 순서 — 그 직업 스킬 표 순서, 그다음 이름·id(결정적). */
function skillBookOrder(item: Item, myJob: Job): number {
  if (!isSkillBook(item)) return 0;
  const job = skillBookJob(item) ?? myJob;
  const index = skillOrderFor(job).indexOf(item.skillId as never);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * 가방 칸 정렬 비교 함수 — 3단(주머니 → 장비 → 스킬북)이 **항상 먼저**고, 스킬북은 직업별로 묶는다.
 * `raritySort`를 켰을 때만 같은 묶음 안에서 등급 높은 순으로 놓는다(안정 정렬이라 나머지는 원래 차례).
 */
export function compareBagItems(raritySort: boolean, myJob: Job = 'warrior'): (a: Item, b: Item) => number {
  return (a, b) => {
    const kind = bagKindRank(a) - bagKindRank(b);
    if (kind) return kind;
    if (isSkillBook(a) && isSkillBook(b)) {
      const job = skillBookJobRank(a, myJob) - skillBookJobRank(b, myJob);
      if (job) return job;
      const order = skillBookOrder(a, myJob) - skillBookOrder(b, myJob);
      if (order) return order;
      const name = String(a.name).localeCompare(String(b.name), 'ko');
      if (name) return name;
      return String(a.id).localeCompare(String(b.id));
    }
    return raritySort ? (rarityRanks[b.rarity] ?? 0) - (rarityRanks[a.rarity] ?? 0) : 0;
  };
}

/** 아이템 배열을 가방 화면 순서로 정렬한 **새 배열**을 돌려준다(원본은 건드리지 않는다). */
export function orderedBagItems(items: Item[], raritySort: boolean, myJob: Job = 'warrior'): Item[] {
  return [...items].sort(compareBagItems(raritySort, myJob));
}

function stackKey(item: Item): string {
  if (isPouch(item)) return 'pouch';
  if (isSkillBook(item)) return `book:${item.skillId ?? item.name}`;
  return `item:${item.id}`;
}
