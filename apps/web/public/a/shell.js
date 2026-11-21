// 기능 A 진입점: 해시 라우터 + 로그인·역할 확인 + 역할별 하단 탭 틀.
import { HOME, TABS, parseHash, resolveRoute } from './access.js';
import { getSession } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { screens } from './screens.js';

const app = document.getElementById('app');
let renderId = 0;

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

  const hasTabs = Boolean(session && TABS[session.role].length);
  const view = h('main', { id: 'view', class: hasTabs ? 'with-tabs' : '' });
  const render = screens.get(path) ?? screens.get(HOME[session?.role]);
  try {
    await render(view, { session, query, navigate });
  } catch {
    view.replaceChildren(h('p', { class: 'notice error', role: 'alert', text: '화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }));
  }
  if (id !== renderId) return;

  document.title = `${view.querySelector('h1')?.textContent ?? '돌봄바통'} | 돌봄바통`;
  app.replaceChildren(view, ...(session ? [tabBar(session, path)] : []).filter(Boolean));
  view.querySelector('h1')?.focus();
}

addEventListener('hashchange', route);
route();
