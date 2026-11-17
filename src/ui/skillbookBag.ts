import { isSkillBook, type Item, type SkillBook } from '../game/items';

export function skillbookName(book: SkillBook): string {
  return book.name.replace(/\[?스킬북\]?\s*/g, '').trim();
}
// Group only the view; individual IDs remain intact for use, sale and save sync.
export function skillbookStacks(items: Item[]): { item: SkillBook; count: number }[] {
  const stacks = new Map<string, { item: SkillBook; count: number }>();
  for (const item of items) if (isSkillBook(item)) {
    const stack = stacks.get(item.skillId);
    if (stack) stack.count++;
    else stacks.set(item.skillId, { item, count: 1 });
  }
  return [...stacks.values()];
}
