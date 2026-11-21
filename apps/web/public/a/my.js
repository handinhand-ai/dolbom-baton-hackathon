// 16 마이페이지(P1): 이름·역할·소속, 로그아웃, 시연 데이터 초기화.
import { ROLE_LABEL } from './access.js';
import { h } from './dom.js';
import { createOnboardingStore } from './onboarding.js';
import { logout, resetDemo } from './api.js';

export function renderMyPage(view, { session, navigate }) {
  const status = h('p', { class: 'notice info', role: 'status', hidden: true });
  const resetButton = h('button', { type: 'button', class: 'secondary', text: '시연 데이터 초기화' });
  const confirmRow = h('div', { class: 'card', hidden: true },
    h('p', { text: '시연 데이터를 처음 상태로 되돌릴까요? 지금까지 만든 시연용 기록이 사라져요.' }));
  const confirmButton = h('button', { type: 'button', text: '초기화하기' });
  const cancelButton = h('button', { type: 'button', class: 'secondary', text: '취소' });
  confirmRow.append(confirmButton, cancelButton);

  resetButton.addEventListener('click', () => { confirmRow.hidden = false; confirmButton.focus(); });
  cancelButton.addEventListener('click', () => { confirmRow.hidden = true; resetButton.focus(); });
  confirmButton.addEventListener('click', async () => {
    confirmButton.disabled = true;
    try {
      await resetDemo();
      // 이 기기에 저장한 온보딩 입력(기본 정보·사진·캐릭터)도 지웁니다. 다음에 홈으로 가면 온보딩이 다시 시작돼요.
      createOnboardingStore(globalThis.localStorage, session.user_id).clear();
      status.textContent = '시연 데이터를 처음 상태로 되돌렸어요.';
      confirmRow.hidden = true;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      status.hidden = false;
      confirmButton.disabled = false;
    }
  });

  const rows = [
    ['이름', session.display_name],
    ['역할', ROLE_LABEL[session.role]],
    session.center_name ? ['소속', session.center_name] : null,
    session.caregiver_type ? ['구분', session.caregiver_type] : null,
    session.relation ? ['관계', session.relation] : null,
  ].filter(Boolean);

  view.append(
    h('p', { class: 'logo brand', text: '돌봄바통' }),
    h('h1', { class: 'center', tabindex: '-1', text: '마이페이지' }),
    h('dl', { class: 'card info' }, rows.flatMap(([term, value]) => [h('dt', { text: term }), h('dd', { text: value })])),
    ...(session.role === 'caregiver' ? [h('a', { class: 'button secondary', href: '#/c/center-admin', text: '센터 화면 (시연용)' })] : []),
    resetButton, confirmRow, status,
    h('button', { type: 'button', class: 'link', text: '로그아웃', onclick: async () => { await logout(); navigate('/login'); } }),
  );
}
