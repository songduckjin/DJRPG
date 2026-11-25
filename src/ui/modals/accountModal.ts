import { expToNext, MAX_LEVEL } from '../../game/store';
import { jobNames, jobOrDefault } from '../../game/skills';
import type { Interface } from '../interface';
import { openDeleteAccount } from './accountDelete';

export function renderAccount(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save;
    const content = document.createElement('div'); content.className = 'account-content';
    const login = document.createElement('div'); login.className = 'account-line'; login.innerHTML = '<span>로그인 ID</span><b></b>';
    login.querySelector('b')!.textContent = this.session.loginId; content.appendChild(login);
    const nameLabel = document.createElement('label'); nameLabel.textContent = '모험가 이름';
    const nameRow = document.createElement('div'); nameRow.className = 'account-name';
    const input = document.createElement('input'); input.value = save.name; input.maxLength = 16; input.setAttribute('aria-label', '모험가 이름');
    const rename = document.createElement('button'); rename.textContent = '이름 저장';
    rename.onclick = () => {
      const name = input.value.trim();
      if (!name) { this.message('이름은 비워둘 수 없습니다.'); return; }
      save.name = name; this.world.onChange(); this.message('모험가 이름을 저장했습니다.');
    };
    nameRow.append(input, rename); content.append(nameLabel, nameRow);
    const identity = document.createElement('div'); identity.className = 'account-line';
    identity.innerHTML = '<span>계정 ID</span><b></b>';
    identity.querySelector('b')!.textContent = save.accountId;
    content.appendChild(identity);
    const role = document.createElement('div'); role.className = 'account-line'; role.innerHTML = `<span>직업</span><b>${jobNames[jobOrDefault(save.job)]}</b>`; content.appendChild(role);
    const level = document.createElement('div'); level.className = 'account-progress';
    level.innerHTML = `<b>LV ${save.level}</b><span>${save.level >= MAX_LEVEL ? '100%' : `${save.exp} / ${expToNext(save.level)} EXP`}</span><div><i style="width:${save.level >= MAX_LEVEL ? 100 : Math.min(100, save.exp / expToNext(save.level) * 100)}%"></i></div>`;
    content.appendChild(level);
    const floor = document.createElement('div'); floor.className = 'account-line'; floor.innerHTML = `<span>최고 도달 층수</span><b>${save.maxFloor}층</b>`; content.appendChild(floor);
    const kills = document.createElement('div'); kills.className = 'account-line'; kills.innerHTML = `<span>누적 처치 수</span><b>${save.kills}</b>`; content.appendChild(kills);
    const status = document.createElement('div'); status.className = 'account-line'; status.innerHTML = '<span>저장 상태</span><b></b>';
    status.querySelector<HTMLElement>('b')!.dataset.saveStatus = '';
    status.querySelector('b')!.textContent = `서버 ${this.saveStatus}`; content.appendChild(status);
    const reset = document.createElement('div'); reset.className = 'account-reset';
    if (!this.confirmReset) {
      const button = document.createElement('button'); button.textContent = '데이터 초기화';
      button.onclick = () => { this.confirmReset = true; this.renderModal(); }; reset.appendChild(button);
    } else {
      const warning = document.createElement('p'); warning.textContent = '레벨, 장비, 금화 등 모든 진행 상황을 삭제할까요? 이 작업은 되돌릴 수 없습니다.';
      const yes = document.createElement('button'); yes.textContent = '모두 삭제'; yes.onclick = () => { void this.onReset(); };
      const no = document.createElement('button'); no.textContent = '취소'; no.onclick = () => { this.confirmReset = false; this.renderModal(); };
      reset.append(warning, yes, no);
    }
    content.appendChild(reset);
    const logout = document.createElement('button'); logout.className = 'account-logout'; logout.textContent = '로그아웃 · 계정 전환';
    logout.onclick = () => window.dispatchEvent(new Event('game-logout'));
    content.appendChild(logout);
    // 계정 탈퇴(아이디 삭제, 작업 223) — 가장 위험한 동작이라 맨 아래에 작고 어둡게 둔다.
    const withdraw = document.createElement('div'); withdraw.className = 'account-withdraw';
    const withdrawButton = document.createElement('button'); withdrawButton.type = 'button'; withdrawButton.textContent = '계정 탈퇴 (아이디 삭제)';
    withdrawButton.setAttribute('aria-label', '계정 탈퇴 — 아이디와 모든 기록 삭제');
    withdrawButton.onclick = () => { openDeleteAccount(this); };
    const withdrawNote = document.createElement('p'); withdrawNote.textContent = '탈퇴하면 같은 아이디로 바로 다시 가입할 수 있습니다.';
    withdraw.append(withdrawButton, withdrawNote);
    content.appendChild(withdraw);
    dialog.appendChild(content);
  }
