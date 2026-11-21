// 01 로그인(역할 선택): 시연 계정의 아이디·비밀번호를 미리 채워 줍니다(시연용 합성 계정).
import { HOME, ROLE_LABEL, safeNext } from './access.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { listDemoAccounts, login } from './api.js';

const ROLE_INFO = {
  guardian: { icon: 'user', sub: '설명서를 말로 만들어요' },
  caregiver: { icon: 'building', sub: '맡은 아이를 확인해요' },
};

export async function renderLogin(view, { query, navigate }) {
  // 같은 역할 계정이 여러 개(센터별)면 첫 계정만 보여 줍니다.
  const accounts = (await listDemoAccounts()).filter((account, index, all) => all.findIndex((item) => item.role === account.role) === index);
  const username = h('input', { id: 'username', name: 'username', autocomplete: 'username', autocapitalize: 'none', placeholder: '010-0000-0000', required: true });
  const password = h('input', { id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', placeholder: '비밀번호', required: true });
  const message = h('p', { class: 'notice error', role: 'alert', hidden: true });
  const button = h('button', { type: 'submit' });
  const roleButtons = new Map();
  let selected = null;

  let lastDemo = null;
  function choose(account) {
    selected = account;
    // 시연 계정 값은 칸이 비었거나 방금 채운 시연 값 그대로일 때만 채웁니다(직접 입력한 전화번호·비밀번호는 덮어쓰지 않습니다).
    const untouched = (!username.value && !password.value) || (lastDemo && username.value === lastDemo.username && password.value === lastDemo.password);
    if (untouched) {
      username.value = account.username;
      password.value = account.password;
      lastDemo = account;
    }
    for (const [role, node] of roleButtons) node.setAttribute('aria-pressed', String(role === account.role));
    button.textContent = `${ROLE_LABEL[account.role]}로 로그인`;
    message.hidden = true;
  }

  const form = h('form', { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'username', text: '전화번호 또는 아이디' }), username),
    h('div', { class: 'field' }, h('label', { for: 'password', text: '비밀번호' }), password),
    message,
    h('div', { class: 'spacer' }),
    button);

  // 시안의 역할 카드는 2개(보호자·돌봄 선생님)입니다. 센터 관리자는 시연용이라 별도 버튼으로 둡니다.
  const cards = [];
  const extra = [];
  for (const account of accounts) {
    if (account.role === 'center_admin') {
      extra.push(h('button', { type: 'button', class: 'secondary', onclick: () => { choose(account); form.requestSubmit(); }, text: '센터 관리자(시연용)로 로그인' }));
      continue;
    }
    const info = ROLE_INFO[account.role];
    const tick = h('span', { class: 'tick', 'aria-hidden': 'true' }, icon('check', 14));
    tick.querySelector('svg').setAttribute('stroke-width', '3');
    const node = h('button', { type: 'button', class: 'role', 'aria-pressed': 'false', onclick: () => choose(account) },
      icon(info.icon, 22),
      h('span', { class: 'role-title', text: ROLE_LABEL[account.role] }),
      h('span', { class: 'role-sub', text: info.sub }),
      tick);
    roleButtons.set(account.role, node);
    cards.push(node);
  }
  if (accounts[0]) choose(accounts[0]);

  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!username.value.trim() || !password.value) {
      message.textContent = '아이디와 비밀번호를 입력해 주세요.';
      message.hidden = false;
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = '로그인 중…';
    try {
      const session = await login(username.value.trim(), password.value);
      navigate(safeNext(query.get('next'), session) ?? HOME[session.role]);
    } catch (error) {
      message.textContent = error.message;
      message.hidden = false;
      button.textContent = selected && roleButtons.has(selected.role) ? `${ROLE_LABEL[selected.role]}로 로그인` : '로그인';
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  view.classList.add('login');
  view.append(
    h('h1', { class: 'logo', tabindex: '-1', text: '돌봄바통' }),
    h('p', { class: 'tagline' }, '아이를 가장 잘 아는 사람의 말을,', h('br'), '돌보는 사람에게 그대로 이어줘요'),
    h('p', { class: 'ask', text: '어떤 분이세요?' }),
    h('div', { class: 'roles', role: 'group', 'aria-label': '역할 선택' }, cards),
    form,
    ...extra,
    h('button', { type: 'button', class: 'link', text: '처음이세요? 회원가입', onclick: () => navigate('/signup') }),
    h('p', { class: 'link-row', text: '시연용 서비스예요. 역할을 고르면 시연 계정이 채워져요.' }),
  );
}
