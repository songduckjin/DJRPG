import { isSkillBook, rollSkillBookFor, skillBookJob, type SkillBook } from './items';
import { jobNames, jobOrDefault } from './skills';
import { random } from './rng';
import type { Save } from './store';
import { addItemToBag } from './rewardGrant';

/**
 * 타직업 스킬북 5권 → 내 직업 랜덤 스킬북 1권 (작업 251, 사용자 확정).
 *
 * 사용자 지시: "가방에 합성버튼추가해서 타직업스킬북 5개당 내직업 랜덤1개로 합성가능 …
 * 5개합성모션넣고 랜덤으로 한개뜨게할껀데", 이어서 "자동 합성"으로 남은 만큼(5권 묶음마다) 한 번에
 * 돌리고 결과를 한 화면에 나열해 달라고 했다.
 *
 * 규칙(세이브 계약):
 *  - 재료는 **가방 안의 타직업 전용 스킬북**만 — 내 직업 책은 스킬 창에서 쓰는 것이고, 잠긴 아이템은 재료에서 뺀다.
 *  - 5권을 소모하고 내 직업 스킬북 1권을 만든다(비용 없음). 가방 칸은 **5칸 줄고 1칸 늘어 순감 -4칸**이라
 *    40칸 상한과 서버 `reconcileItems`("지금 개수 이하 유지" 허용) 모두 안전하다.
 *  - 결과는 내 직업 11종(액티브 8 + 패시브 3)에서 **같은 확률(1/11)** 로 뽑는다. 드롭용 `rollSkillBook`은
 *    직업을 1/3로 먼저 뽑으므로(33종 1/33) 여기서는 쓰지 않고 `rollSkillBookFor(job)`을 쓴다.
 *
 * 이 모듈은 순수 계산만 한다 — 저장(`onChange`)·화면 갱신은 호출부(`ui/modals/synthModal.ts`,
 * `ui/modals/equipModal.ts`)가 한다. 그래야 테스트가 UI 없이 규칙만 검사할 수 있다.
 */

/** 합성 한 번에 드는 타직업 스킬북 수. */
export const SYNTH_BOOK_COST = 5;

/** 스킬북은 장비가 아니라 `locked` 필드가 없다 — 예전/미래 세이브에 값이 있어도 잠긴 것으로 본다. */
function lockedBook(item: SkillBook): boolean {
  return (item as SkillBook & { locked?: boolean }).locked === true;
}

/** 합성 재료 — 가방의 **타직업** 스킬북 중 잠기지 않은 것(가방 순서 그대로). */
export function synthMaterials(save: Pick<Save, 'bag' | 'job'>): SkillBook[] {
  const myJob = jobOrDefault(save.job);
  return save.bag.filter((item): item is SkillBook => isSkillBook(item)
    && !lockedBook(item)
    && (skillBookJob(item) ?? myJob) !== myJob);
}

/** 지금 바로 돌릴 수 있는 합성 횟수 `Math.floor(재료 / 5)`. */
export function synthCapacity(save: Pick<Save, 'bag' | 'job'>): number {
  return Math.floor(synthMaterials(save).length / SYNTH_BOOK_COST);
}

/** 합성 결과 — 무엇을 먹고 무엇이 나왔는지 화면이 그대로 보여 준다. */
export type SynthOutcome =
  | { ok: true; consumed: SkillBook[]; books: SkillBook[] }
  | { ok: false; message: string };

/** 고른 5권을 실제로 소모하고 내 직업 책 1권을 만든다. 호출 전에 세이브를 저장하지 않는다(호출부가 저장). */
function applySynth(save: Save, chosen: SkillBook[], crafts: number, draw: () => number): SynthOutcome {
  const ids = new Set(chosen.map(item => item.id));
  save.bag = save.bag.filter(item => !ids.has(item.id));
  const books: SkillBook[] = [];
  for (let round = 0; round < crafts; round++) {
    const book = rollSkillBookFor(jobOrDefault(save.job), draw);
    books.push(book); addItemToBag(save, book, 'craft');
  }
  return { ok: true, consumed: chosen, books };
}

/** 수동 합성 — 고른 스킬북 **정확히 5권**을 소모해 1권을 만든다. */
export function synthesizeSkillBooks(save: Save, ids: readonly string[], draw: () => number = random): SynthOutcome {
  const myJob = jobOrDefault(save.job);
  const unique = [...new Set(ids)];
  if (unique.length !== SYNTH_BOOK_COST) {
    return { ok: false, message: `타직업 스킬북 ${SYNTH_BOOK_COST}권을 채워 주세요. (${unique.length}/${SYNTH_BOOK_COST})` };
  }
  const chosen: SkillBook[] = [];
  for (const id of unique) {
    const item = save.bag.find(entry => entry.id === id);
    if (!item || !isSkillBook(item)) return { ok: false, message: '가방에 없는 스킬북이 있습니다. 다시 골라 주세요.' };
    if (lockedBook(item)) return { ok: false, message: '잠긴 스킬북은 합성 재료로 쓸 수 없습니다.' };
    if ((skillBookJob(item) ?? myJob) === myJob) {
      return { ok: false, message: `${jobNames[myJob]} 전용 스킬북은 합성 재료로 쓸 수 없습니다.` };
    }
    chosen.push(item);
  }
  return applySynth(save, chosen, 1, draw);
}

/**
 * `자동 합성` — 남은 타직업 스킬북을 5권 묶음마다 한 번에 돌린다(사용자 확정).
 * 재료 12권이면 2회분(10권)을 소모하고 내 직업 책 2권이 나오며, 남은 2권은 가방에 그대로 둔다.
 */
export function synthesizeAllAvailable(save: Save, draw: () => number = random): SynthOutcome {
  const capacity = synthCapacity(save);
  if (capacity < 1) {
    return { ok: false, message: `타직업 스킬북이 ${SYNTH_BOOK_COST}권 이상 있어야 합성할 수 있습니다.` };
  }
  const chosen = synthMaterials(save).slice(0, capacity * SYNTH_BOOK_COST);
  return applySynth(save, chosen, capacity, draw);
}

/** 결과를 한 칸에 모아 보여 주기 위한 묶음 — 같은 책이 여러 권 나오면 `×N` 하나로 센다. */
export type SynthStack = { book: SkillBook; count: number };

/** 결과 책들을 `skillId`별로 묶는다(처음 나온 순서 유지). */
export function stackSynthBooks(books: readonly SkillBook[]): SynthStack[] {
  const stacks: SynthStack[] = [];
  const byId = new Map<string, SynthStack>();
  for (const book of books) {
    const found = byId.get(book.skillId);
    if (found) { found.count++; continue; }
    const entry: SynthStack = { book, count: 1 };
    byId.set(book.skillId, entry); stacks.push(entry);
  }
  return stacks;
}
