// 회원가입: 로그인과 같은 첫 화면 구성(로고 → 역할 선택 → 입력 → 버튼). 가입하면 바로 로그인되고,
// 보호자는 온보딩(아이 정보 입력)으로, 돌봄 선생님은 홈으로 이동합니다. 로그인 흐름과 달리 온보딩은 가입 직후에만 거칩니다.
import { HOME, ONBOARDING_STEPS, ROLE_LABEL } from './access.js';
import { signup, listCenters } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { createOnboardingStore } from './onboarding.js';

const ROLES = [
  { role: 'guardian', icon: 'user', sub: '설명서를 말로 만들어요' },
  { role: 'caregiver', icon: 'building', sub: '맡은 아이를 확인해요' },
];
const CAREGIVER_TYPES = ['긴급돌봄센터 종사자', '돌봄SOS 매니저', '활동지원사', '특수학교 선생님', '민간돌봄 봉사자', '기타'];

// 서버(auth-store.mjs의 validateSignup)와 같은 규칙입니다. 서버가 최종 검증합니다.
export function checkSignup({ role, displayName, phone, password, confirm, agree, centerId, caregiverType }) {
  const errors = {};
  if (!displayName.trim()) errors.display_name = '이름을 입력해 주세요.';
  else if (displayName.trim().length > 20) errors.display_name = '이름은 20자 이하로 입력해 주세요.';
  if (!/^01[016789]\d{7,8}$/.test(phone.replace(/[\s-]/g, ''))) errors.phone = '전화번호를 010-0000-0000 형식으로 입력해 주세요.';
  if (password.length < 8) errors.password = '비밀번호는 8자 이상 입력해 주세요.';
  else if (password.length > 72) errors.password = '비밀번호는 72자 이하로 입력해 주세요.';
  if (!errors.password && confirm !== password) errors.confirm = '비밀번호가 서로 달라요.';
  if (role === 'caregiver') {
    if (!centerId) errors.center_id = '소속 센터를 골라 주세요.';
    if (!caregiverType) errors.caregiver_type = '종사자 구분을 골라 주세요.';
  }
  if (!agree) errors.agree = '이용 안내에 동의해 주세요.';
  return errors;
}

function field({ id, label, type = 'text', autocomplete, placeholder, inputmode, maxlength }) {
  const input = h('input', { id, name: id, type, autocomplete, placeholder, inputmode, maxlength, 'aria-describedby': `${id}-err` });
  const message = h('p', { class: 'field-error', id: `${id}-err`, hidden: true });
  return {
    input,
    node: h('div', { class: 'ob-field' }, h('label', { for: id, text: label }), h('div', { class: 'ob-input' }, input), message),
    setError(text) {
      message.hidden = !text;
      message.textContent = text ?? '';
      input.setAttribute('aria-invalid', text ? 'true' : 'false');
    },
  };
}

function selectField({ id, label, options, placeholder }) {
  const select = h('select', { id, name: id, 'aria-describedby': `${id}-err` },
    h('option', { value: '', text: placeholder }),
    options.map(({ value, text }) => h('option', { value, text })));
  const message = h('p', { class: 'field-error', id: `${id}-err`, hidden: true });
  return {
    select,
    node: h('div', { class: 'ob-field', hidden: true }, h('label', { for: id, text: label }), select, message),
    setError(text) {
      message.hidden = !text;
      message.textContent = text ?? '';
    },
  };
}

export async function renderSignup(view, { navigate }) {
  const centers = await listCenters();
  let role = 'guardian';

  const name = field({ id: 'display_name', label: '이름', autocomplete: 'off', placeholder: '가상의 이름', maxlength: 20 });
  const phone = field({ id: 'phone', label: '전화번호', type: 'tel', autocomplete: 'off', placeholder: '010-0000-0000', inputmode: 'tel', maxlength: 13 });
  const password = field({ id: 'new_password', label: '비밀번호', type: 'password', autocomplete: 'new-password', placeholder: '8자 이상' });
  const confirm = field({ id: 'confirm_password', label: '비밀번호 확인', type: 'password', autocomplete: 'new-password', placeholder: '한 번 더 입력' });
  const center = selectField({ id: 'center_id', label: '소속 센터', placeholder: '센터를 골라 주세요', options: centers.map((item) => ({ value: item.id, text: item.name })) });
  const type = selectField({ id: 'caregiver_type', label: '종사자 구분', placeholder: '구분을 골라 주세요', options: CAREGIVER_TYPES.map((item) => ({ value: item, text: item })) });
  const agree = h('input', { id: 'agree', type: 'checkbox', 'aria-describedby': 'agree-err' });
  const agreeError = h('p', { class: 'field-error', id: 'agree-err', hidden: true });
  const message = h('p', { class: 'notice error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit' });

  const roleButtons = new Map();
  function choose(next) {
    role = next;
    for (const [value, node] of roleButtons) node.setAttribute('aria-pressed', String(value === next));
    center.node.hidden = next !== 'caregiver';
    type.node.hidden = next !== 'caregiver';
    submit.textContent = `${ROLE_LABEL[next]}로 회원가입`;
    message.hidden = true;
  }
  const cards = ROLES.map((item) => {
    const tick = h('span', { class: 'tick', 'aria-hidden': 'true' }, icon('check', 14));
    tick.querySelector('svg').setAttribute('stroke-width', '3');
    const node = h('button', { type: 'button', class: 'role', 'aria-pressed': 'false', onclick: () => choose(item.role) },
      icon(item.icon, 22), h('span', { class: 'role-title', text: ROLE_LABEL[item.role] }), h('span', { class: 'role-sub', text: item.sub }), tick);
    roleButtons.set(item.role, node);
    return node;
  });
  choose('guardian');

  const errorTargets = { display_name: name, phone, password, confirm, center_id: center, caregiver_type: type };
  function showErrors(errors) {
    for (const [key, target] of Object.entries(errorTargets)) target.setError(errors[key]);
    agreeError.textContent = errors.agree ?? '';
    agreeError.hidden = !errors.agree;
  }

  const form = h('form', { novalidate: true },
    name.node, phone.node, password.node, confirm.node, center.node, type.node,
    h('div', { class: 'checkline' }, agree, h('label', { for: 'agree', text: '시연용 서비스 이용 안내에 동의해요' })),
    agreeError, message,
    h('div', { class: 'spacer' }),
    submit);

  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = {
      role, displayName: name.input.value, phone: phone.input.value, password: password.input.value, confirm: confirm.input.value,
      agree: agree.checked, centerId: center.select.value, caregiverType: type.select.value,
    };
    const errors = checkSignup(values);
    showErrors(errors);
    message.hidden = true;
    if (Object.keys(errors).length) return;

    busy = true;
    submit.disabled = true;
    submit.textContent = '가입하는 중…';
    try {
      const session = await signup({
        role, display_name: values.displayName.trim(), phone: values.phone, password: values.password, agree: true,
        ...(role === 'caregiver' ? { center_id: values.centerId, caregiver_type: values.caregiverType } : {}),
      });
      if (session.role === 'guardian') {
        createOnboardingStore(globalThis.localStorage, session.user_id).markSignupPending();
        navigate(ONBOARDING_STEPS[0]);
      } else {
        navigate(HOME[session.role]);
      }
    } catch (error) {
      if (error.field === 'agree') {
        agreeError.textContent = error.message;
        agreeError.hidden = false;
      } else if (error.field && errorTargets[error.field]) {
        errorTargets[error.field].setError(error.message);
      } else {
        message.textContent = error.message;
        message.hidden = false;
      }
      submit.textContent = `${ROLE_LABEL[role]}로 회원가입`;
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });

  view.classList.add('login', 'signup');
  view.append(
    h('h1', { class: 'logo', tabindex: '-1', text: '돌봄바통' }),
    h('p', { class: 'tagline' }, '회원가입하고 시작해요'),
    h('p', { class: 'notice info', role: 'note', text: '시연용 서비스예요. 실제 이름·전화번호 대신 가상의 값을 입력해 주세요.' }),
    h('p', { class: 'ask', text: '어떤 분이세요?' }),
    h('div', { class: 'roles', role: 'group', 'aria-label': '역할 선택' }, cards),
    form,
    h('button', { type: 'button', class: 'link', text: '이미 계정이 있으세요? 로그인', onclick: () => navigate('/login') }),
  );
}
