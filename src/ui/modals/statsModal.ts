/**
 * 상세 스탯 창 (LV 배지 → `상세 스탯`)
 *
 * 사용자 요청(2026-11-21): "LV 누르면 내 전체 상세 스탯 보여주기". 예전에는 LV 배지를 누르면
 * `캐릭터 선택` 창이 열렸는데, 같은 동작이 **오른쪽 아이콘 레일의 `캐릭터` 버튼**으로 옮겨 갔으므로
 * LV 배지는 제 몫(내 스탯)을 맡는다.
 *
 * 숫자는 전부 `src/game/statSheet.ts`가 계산한다 — 이 파일은 그리고 배선만 한다. 평타 기본 간격은
 * 전투가 쓰는 `cooldowns.attack`을 그대로 읽어, 공격속도가 실제 몇 초에 한 번인지 어긋나지 않는다.
 */
import { cooldowns } from '../../game/world';
import { statSheet, type StatSheetRow } from '../../game/statSheet';
import { jobNames, jobOrDefault } from '../../game/skills';
import { MAX_LEVEL } from '../../game/store';
import type { Interface } from '../interface';

export function renderStats(this: Interface, dialog: HTMLElement): void {
  const save = this.world.save;
  const sheet = statSheet(save, { currentHp: this.world.player.hp, attackInterval: cooldowns.attack });
  const content = document.createElement('div'); content.className = 'stats-content';

  // 머리 — `전사 · 모험가` / `LV 5 · 7층` / 큰 전투력. 전투력은 HUD 닉네임 아래와 같은 숫자다.
  const head = document.createElement('div'); head.className = 'stats-head';
  const who = document.createElement('div'); who.className = 'stats-who';
  const name = document.createElement('b'); name.textContent = typeof save.name === 'string' && save.name.trim() ? save.name.trim() : '모험가';
  const job = document.createElement('span'); job.textContent = jobNames[jobOrDefault(save.job)];
  who.append(job, name);
  const meta = document.createElement('div'); meta.className = 'stats-meta';
  meta.textContent = `LV ${save.level >= MAX_LEVEL ? `${MAX_LEVEL} MAX` : save.level} · ${save.floor}층 · HP ${sheet.currentHp.toLocaleString('ko-KR')}/${sheet.maxHp.toLocaleString('ko-KR')}`;
  head.append(who, meta);

  const power = document.createElement('div'); power.className = 'stats-power';
  const glyph = document.createElement('span'); glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = '⚔';
  const powerLabel = document.createElement('span'); powerLabel.textContent = '전투력';
  const powerValue = document.createElement('b'); powerValue.textContent = sheet.power.toLocaleString('ko-KR');
  power.append(glyph, powerLabel, powerValue);
  power.setAttribute('aria-label', `전투력 ${sheet.power}`);
  content.append(head, power);

  // 그룹마다 제목 한 줄 + 2열 칸. 칸은 `이름 … 값` + 작은 안내(상한·1타당 피해·초당 공격).
  for (const group of sheet.groups) {
    const section = document.createElement('section'); section.className = 'stats-group';
    section.dataset.group = group.key;
    const title = document.createElement('h3'); title.textContent = group.title;
    const grid = document.createElement('div'); grid.className = 'stats-grid';
    for (const row of group.rows) grid.appendChild(statCell(row));
    section.append(title, grid);
    content.appendChild(section);
  }

  const hint = document.createElement('p'); hint.className = 'stats-hint';
  hint.textContent = '장비·패시브·추가옵션을 모두 더한 값입니다. 장비의 % 옵션에는 상한이 있습니다.';
  content.appendChild(hint);
  dialog.appendChild(content);
}

/** 스탯 한 칸 — 값은 `textContent`로만 넣는다(장비·세이브 문자열이 태그로 해석되지 않게). */
function statCell(row: StatSheetRow): HTMLElement {
  const cell = document.createElement('div'); cell.className = 'stats-row';
  cell.dataset.stat = row.key;
  const label = document.createElement('span'); label.textContent = row.label;
  const value = document.createElement('b'); value.textContent = row.value;
  cell.append(label, value);
  if (row.note) {
    const note = document.createElement('small'); note.textContent = row.note;
    cell.appendChild(note);
  }
  cell.setAttribute('aria-label', row.note ? `${row.label} ${row.value} (${row.note})` : `${row.label} ${row.value}`);
  return cell;
}
