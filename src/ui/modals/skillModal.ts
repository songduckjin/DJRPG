/**
 * 스킬 창 — 4단계 스킬 트리(2026-11-22 스펙, 파트 A).
 *
 * 창은 위에서 아래로 세 칸이고, **스크롤은 트리만** 갖는다:
 *   ① `.skill-top-bar` — `SP N` · `초기화 (무료)`
 *   ② `.skill-tree` — 티어 4줄(3-3-3-2)과 연결선, 각 노드에 아이콘·`N/10`
 *   ③ `.skill-detail` — 고른 스킬의 아이콘·이름·`Lv.N/10`·선행 조건·현재/다음 수치·`장착`·`SP 1 투자`
 *
 * 그리기·판정은 `ui/skillTreeView.ts`가 하고, 이 파일은 세 칸을 순서대로 붙이는 일만 한다.
 * 예전 B안(2열 타일 그리드 + 스킬북 칸)은 이 창에서 빠졌다 — 스킬은 이제 스킬북이 아니라 SP로 오른다.
 */
import type { Interface } from '../interface';
import { jobOrDefault } from '../../game/skills';
import { resolveSkillSelection, skillDetailPanel, skillTopBar, skillTreePanel } from '../skillTreeView';

export { resolveSkillSelection } from '../skillTreeView';

export function renderSkills(this: Interface, dialog: HTMLElement): void {
  const save = this.world.save;
  const job = jobOrDefault(save.job);
  // 고른 스킬은 창을 닫기 전까지 살아 있고, 없으면 장착 중 → 습득 → 첫 노드 순으로 잡는다.
  const selection = resolveSkillSelection(save, job, this.skillSelected);
  this.skillSelected = selection;
  dialog.append(
    skillTopBar(this),
    skillTreePanel(this, save, job, selection),
    skillDetailPanel(this, save, selection)
  );
}
