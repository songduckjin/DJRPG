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
 *
 * 머리글 오른쪽(`×` 닫기 왼쪽)에는 **`⚡ 추천 장착`** 버튼이 붙는다(스킬 추천 자동 장착 A안). 누르면 창을 닫지
 * 않고 습득한 액티브 스킬의 초당 피해 상위 3개가 퀵슬롯에 들어가고, 트리의 `장착` 배지·필드 스킬 원도 함께 갱신된다.
 */
import type { Interface } from '../interface';
import { jobOrDefault } from '../../game/skills';
import { autoEquipRecommendedSkills } from '../../game/loadout';
import { resolveSkillSelection, skillDetailPanel, skillTopBar, skillTreePanel } from '../skillTreeView';

export { resolveSkillSelection } from '../skillTreeView';

export function renderSkills(this: Interface, dialog: HTMLElement): void {
  const save = this.world.save;
  const job = jobOrDefault(save.job);
  // 고른 스킬은 창을 닫기 전까지 살아 있고, 없으면 장착 중 → 습득 → 첫 노드 순으로 잡는다.
  const selection = resolveSkillSelection(save, job, this.skillSelected);
  this.skillSelected = selection;
  const tree = skillTreePanel(this, save, job, selection);
  dialog.append(
    skillTopBar(this),
    tree,
    skillDetailPanel(this, save, selection)
  );
  // 새 패널이 레이아웃에 붙기 전 scrollTop을 쓰면 브라우저가 최대 스크롤 0으로 잘라 버린다.
  // `offsetHeight`를 읽어 레이아웃을 먼저 확정한 뒤에 위치를 되돌린다(2026-11-25 스크롤 개선 D).
  void tree.offsetHeight;
  tree.scrollTop = this.skillScroll;
  // 창틀(`modalChrome`)이 만든 머리글에 버튼을 끼운다 — 제목과 `×` 사이, 시안대로 오른쪽에 붙는다.
  const header = dialog.querySelector<HTMLElement>('header');
  const close = header?.querySelector<HTMLElement>('.modal-close');
  if (header && close) header.insertBefore(skillSuggestButton(this), close);
}

/**
 * 머리글의 `⚡ 추천 장착` 버튼 — 한 번 누르면 추천 조합을 바로 장착하고 토스트로 결과를 알린다(A안).
 *
 * 다른 스킬 조작과 같은 잠금 가드(사냥 일시정지·거래소 작업·동기화)를 먼저 지나고, 바뀐 것이 있을 때만
 * `world.onChange()`로 저장·HUD·이 창을 함께 다시 그린다. 습득한 스킬이 없거나 이미 추천 조합이면
 * 세이브는 그대로 두고 안내 문구만 띄운다.
 */
export function skillSuggestButton(ui: Interface): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'skill-suggest-btn';
  button.setAttribute('aria-label', '추천 조합 자동 장착');
  button.title = '습득한 스킬 중 초당 피해가 높은 3개를 스킬 원에 장착합니다';
  const icon = document.createElement('i');
  icon.textContent = '⚡';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = '추천 장착';
  button.append(icon, label);
  button.onclick = () => equipRecommendedSkills(ui);
  return button;
}

function equipRecommendedSkills(ui: Interface): void {
  if (ui.world.paused || ui.market.busy || ui.market.sync.locked) {
    ui.message('동기화 중에는 스킬을 장착할 수 없습니다. 잠시 후 다시 시도하세요.');
    return;
  }
  const result = autoEquipRecommendedSkills(ui.world.save);
  // 사냥 중에는 이 창을 다시 그리지 않는다(`quietWhileHunting`) — 내가 누른 조작은 여기서 직접 반영한다.
  if (result.changed) { ui.world.onChange(); ui.renderModal(); }
  ui.message(result.message);
}
