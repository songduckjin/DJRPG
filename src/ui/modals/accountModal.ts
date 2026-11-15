import { expToNext, MAX_LEVEL } from '../../game/store';
import type { Interface } from '../interface';

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
    const role = document.createElement('div'); role.className = 'account-line'; role.innerHTML = '<span>직업</span><b>전사</b>'; content.appendChild(role);
    const gender = document.createElement('div'); gender.className = 'account-gender'; gender.innerHTML = '<span>성별</span>';
    for (const choice of ['male', 'female'] as const) {
      const button = document.createElement('button'); button.textContent = choice === 'male' ? '남' : '여';
      button.classList.toggle('active', save.gender === choice);
      button.onclick = () => { save.gender = choice; this.world.onChange(); };
      gender.appendChild(button);
    }
    content.appendChild(gender);
    const level = document.createElement('div'); level.className = 'account-progress';
    level.innerHTML = `<b>LV ${save.level >= MAX_LEVEL ? '30 MAX' : save.level}</b><span>${save.level >= MAX_LEVEL ? '100% / MAX' : `${save.exp} / ${expToNext(save.level)} EXP`} · SP ${save.skillPoints}</span><div><i style="width:${save.level >= MAX_LEVEL ? 100 : Math.min(100, save.exp / expToNext(save.level) * 100)}%"></i></div>`;
    content.appendChild(level);
    const floor = document.createElement('div'); floor.className = 'account-line'; floor.innerHTML = `<span>최고 도달 층수</span><b>${save.maxFloor}층</b>`; content.appendChild(floor);
    const kills = document.createElement('div'); kills.className = 'account-line'; kills.innerHTML = `<span>누적 처치 수</span><b>${save.kills}</b>`; content.appendChild(kills);
    const status = document.createElement('div'); status.className = 'account-line'; status.innerHTML = '<span>저장 상태</span><b></b>';
    status.querySelector('b')!.textContent = `서버 ${this.saveStatus}`; content.appendChild(status);
    const reset = document.createElement('div'); reset.className = 'account-reset';
    if (!this.confirmReset) {
      const button = document.createElement('button'); button.textContent = '데이터 초기화';
      button.onclick = () => { this.confirmReset = true; this.renderModal(); }; reset.appendChild(button);
    } else {
      const warning = document.createElement('p'); warning.textContent = '레벨, 장비, 골드 등 모든 진행 상황을 삭제할까요? 이 작업은 되돌릴 수 없습니다.';
      const yes = document.createElement('button'); yes.textContent = '모두 삭제'; yes.onclick = () => { void this.onReset(); };
      const no = document.createElement('button'); no.textContent = '취소'; no.onclick = () => { this.confirmReset = false; this.renderModal(); };
      reset.append(warning, yes, no);
    }
    content.appendChild(reset);
    const logout = document.createElement('button'); logout.className = 'account-logout'; logout.textContent = '로그아웃 · 계정 전환';
    logout.onclick = () => window.dispatchEvent(new Event('game-logout'));
    content.appendChild(logout); dialog.appendChild(content);
  }
