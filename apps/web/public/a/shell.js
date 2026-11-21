// 기능 A 진입점: 해시 라우터 + 로그인·역할 확인 + 역할별 하단 탭 틀.
import { HOME, TABS, isOnboardingPath, parseHash, resolveOnboarding, resolveRoute } from './access.js';
import { createOnboardingStore } from './onboarding.js';
import { getSession } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { screens } from './screens.js';

const app = document.getElementById('app');
let renderId = 0;

try {
  document.documentElement.classList.toggle('large-text', localStorage.getItem('baton.large-text.v1') === 'true');
} catch {
  // 저장소를 사용할 수 없어도 기본 글자 크기로 실행합니다.
}

function navigate(path) {
  const target = `#${path}`;
  if (location.hash === target) route();
  else location.hash = target;
}

function tabBar(session, path) {
  const tabs = TABS[session.role];
  if (!tabs.length) return null;
  return h('nav', { class: 'tabbar', 'aria-label': '주요 메뉴' }, tabs.map((tab) => h('a', {
    href: `#${tab.path}`,
    'aria-current': path === tab.path || path.startsWith(`${tab.path}/`) ? 'page' : null,
  }, icon(tab.icon, 22), tab.label)));
}

async function route() {
  const id = ++renderId;
  const { path, query } = parseHash(location.hash);
  let session;
  try {
    session = await getSession();
  } catch (error) {
    app.replaceChildren(h('main', {}, h('p', { class: 'notice error', role: 'alert', text: error.message }), h('button', { type: 'button', text: '다시 시도', onclick: route })));
    return;
  }
  if (id !== renderId) return;

  const decision = resolveRoute(session, path);
  if (decision.action === 'redirect') {
    location.replace(`#${decision.to}`);
    return;
  }

  // 회원가입을 막 마친 보호자는 온보딩을 끝내기 전에는 어느 화면으로 가도 온보딩 첫 화면으로 보냅니다.
  const signupPending = session?.role === 'guardian' && createOnboardingStore(globalThis.localStorage, session.user_id).isSignupPending();
  const onboarding = resolveOnboarding(session, path, signupPending);
  if (onboarding) {
    location.replace(`#${onboarding.to}`);
    return;
  }

  const hasTabs = Boolean(session && TABS[session.role].length) && !isOnboardingPath(path);
  const view = h('main', { id: 'view', class: hasTabs ? 'with-tabs' : '' });
  const render = screens.get(path) ?? screens.get(HOME[session?.role]);
  try {
    await render(view, { session, query, navigate });
  } catch {
    view.replaceChildren(h('p', { class: 'notice error', role: 'alert', text: '화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }));
  }
  if (id !== renderId) return;

  document.title = `${view.querySelector('h1')?.textContent ?? '돌봄바통'} | 돌봄바통`;
  app.replaceChildren(view, ...(hasTabs ? [tabBar(session, path)] : []).filter(Boolean));
  view.querySelector('h1')?.focus();
}

addEventListener('hashchange', route);
route();
