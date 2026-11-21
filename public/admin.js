const byId = id => document.getElementById(id);
const localTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(date);
};
let username = '';
let password = '';
let currentPage = 1;
let accountQuery = '';
let totalAccounts = 0;

async function requestAdmin(view, params = {}) {
  const url = new URL('/api/admin', location.origin);
  url.searchParams.set('view', view);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}` },
    cache: 'no-store'
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) logout();
    if (response.status === 404 || !body) throw new Error('관리자 API가 아직 운영 사이트에 배포되지 않았습니다.');
    if (body.code === 'ADMIN_NOT_CONFIGURED') throw new Error('운영 서버에 관리자 비밀번호가 아직 설정되지 않았습니다.');
    throw new Error(body.error || `요청 실패 (${response.status})`);
  }
  return body;
}

function logout() {
  username = '';
  password = '';
  byId('password').value = '';
  byId('top-search').value = '';
  byId('dashboard').hidden = true;
  byId('login-panel').hidden = false;
}

function stat(label, value, positive = false) {
  const card = document.createElement('div');
  card.className = 'stat';
  const name = document.createElement('span');
  name.className = 'label';
  name.textContent = label;
  const number = document.createElement('strong');
  number.className = `value${positive ? ' ok' : ''}`;
  number.textContent = value;
  card.append(name, number);
  return card;
}
const count = value => value == null ? '—' : Number(value).toLocaleString('ko-KR');

function renderStatus(data) {
  byId('status-grid').replaceChildren(
    stat('데이터베이스', data.database === 'ok' ? '정상' : data.database === 'unconfigured' ? '설정 필요' : '연결 오류', data.database === 'ok'),
    stat('등록 계정', count(data.accounts)),
    stat('캐릭터', count(data.characters)),
    stat('최근 24시간 활동 계정', count(data.active24h)),
    // 작업 259: 이번 조회 전에 24시간 지난 게스트를 지운 수(포털을 열 때마다 최대 25건).
    stat('게스트 자동 정리', data.guestsCleaned == null ? '—' : `${count(data.guestsCleaned)}건`),
    stat('DB 응답', data.databaseMs == null ? '—' : `${data.databaseMs} ms`),
    stat('배포 버전', data.version),
    stat('확인 시각', localTime(data.checkedAt))
  );
}

async function loadStatus() {
  byId('status-error').textContent = '';
  try {
    const data = await requestAdmin('status');
    renderStatus(data);
  } catch (error) { byId('status-error').textContent = error.message; }
}

async function loadAccounts() {
  byId('accounts-error').textContent = '';
  byId('accounts-summary').textContent = '조회 중…';
  try {
    const data = await requestAdmin('accounts', { q: accountQuery, page: String(currentPage) });
    totalAccounts = data.total;
    const body = byId('accounts-body');
    body.replaceChildren();
    for (const account of data.accounts) {
      const row = document.createElement('tr');
      for (const value of [account.id, account.guest ? '게스트' : '일반', String(account.characters), String(account.maxFloor), localTime(account.updatedAt)]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    }
    if (!data.accounts.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'empty-row';
      cell.textContent = '검색 결과가 없습니다.';
      row.append(cell);
      body.append(row);
    }
    byId('accounts-summary').textContent = `${totalAccounts.toLocaleString('ko-KR')}개 계정${totalAccounts ? '' : ' · 결과 없음'}`;
    byId('page-label').textContent = `${currentPage} / ${Math.max(1, Math.ceil(totalAccounts / data.size))}`;
    byId('prev-page').disabled = currentPage <= 1;
    byId('next-page').disabled = currentPage * data.size >= totalAccounts;
  } catch (error) {
    byId('accounts-summary').textContent = '';
    byId('accounts-error').textContent = error.message;
  }
}

async function loadUpdates() {
  byId('updates-error').textContent = '';
  const deployment = byId('deployment');
  deployment.textContent = '배포 정보 조회 중…';
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('배포 정보 없음');
    const data = await response.json();
    deployment.replaceChildren(stat('운영 배포 버전', String(data.version ?? '—')), stat('배포 시각', localTime(data.builtAt)));
  } catch { deployment.textContent = '배포 정보를 가져오지 못했습니다.'; }
  try {
    const response = await fetch('/admin-updates.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`작업 기록 조회 실패 (${response.status})`);
    const commits = await response.json();
    const list = byId('commits');
    list.replaceChildren();
    for (const item of commits) {
      const link = document.createElement('div');
      link.className = 'commit';
      link.textContent = item.title;
      const meta = document.createElement('small');
      meta.textContent = item.date;
      link.append(meta);
      list.append(link);
    }
  } catch (error) { byId('updates-error').textContent = `${error.message}. 전체 작업 기록 링크를 이용하세요.`; }
}

function showView(view, skipLoad = false) {
  const labels = { status: '서버 상태', accounts: '계정 관리', logs: '운영 로그', updates: '업데이트 기록' };
  byId('current-view-label').textContent = labels[view];
  for (const button of document.querySelectorAll('.tab')) {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== `${view}-view`;
  if (view === 'status' && !skipLoad) loadStatus();
  if (view === 'accounts') loadAccounts();
  if (view === 'updates') loadUpdates();
}

byId('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  username = byId('username').value.trim();
  password = byId('password').value;
  byId('login-error').textContent = '';
  try {
    const data = await requestAdmin('status');
    byId('password').value = '';
    byId('login-panel').hidden = true;
    byId('dashboard').hidden = false;
    renderStatus(data);
    showView('status', true);
  } catch (error) { byId('login-error').textContent = error.message; }
});
byId('logout').addEventListener('click', logout);
byId('refresh-status').addEventListener('click', loadStatus);
byId('top-search-form').addEventListener('submit', event => { event.preventDefault(); accountQuery = byId('top-search').value.trim(); byId('search').value = accountQuery; currentPage = 1; showView('accounts'); });
byId('search-form').addEventListener('submit', event => { event.preventDefault(); accountQuery = byId('search').value.trim(); currentPage = 1; loadAccounts(); });
byId('prev-page').addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadAccounts(); } });
byId('next-page').addEventListener('click', () => { if (currentPage * 25 < totalAccounts) { currentPage++; loadAccounts(); } });
for (const button of document.querySelectorAll('.tab')) button.addEventListener('click', () => showView(button.dataset.view));
for (const button of document.querySelectorAll('[data-go]')) button.addEventListener('click', () => showView(button.dataset.go));
