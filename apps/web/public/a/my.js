import { ROLE_LABEL } from './access.js';
import { getCareApplications, getProfile, getQuestionnaireAnswers, logout, resetDemo } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { installApp } from './install.js';
import { createOnboardingStore } from './onboarding.js';
import { characterUrl } from './onboarding-screens.js';

const CHARACTER = '/a/assets/minjun.png';
const LARGE_TEXT_KEY = 'baton.large-text.v1';

export function activeShares(applications, now = new Date()) {
  const at = now.getTime();
  return applications.filter((item) => item.status === 'assigned'
    && item.assignment?.status === 'active'
    && new Date(item.requested_start_at).getTime() <= at
    && at <= new Date(item.requested_end_at).getTime());
}

export function buildBackup({ exportedAt = new Date().toISOString(), session, profile, answers, applications }) {
  return {
    exported_at: exportedAt,
    guardian: { user_id: session.user_id, display_name: session.display_name },
    profile,
    questionnaire_answers: answers,
    sent_records: applications,
  };
}

function shortDate(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function downloadJson(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function rowIcon(name, text = null) {
  return h('span', { class: 'my-row-icon', 'aria-hidden': 'true' }, text ?? icon(name, 20));
}

function actionRow({ iconName, iconText, title, sub, onclick, toggle = null }) {
  const control = toggle ?? icon('chevron', 20);
  return h('button', { type: 'button', class: 'my-row', onclick },
    rowIcon(iconName, iconText),
    h('span', { class: 'my-row-copy' }, h('strong', { text: title }), h('small', { text: sub })),
    control);
}

function renderLegacyMyPage(view, { session, navigate }) {
  const status = h('p', { class: 'notice info', role: 'status', hidden: true });
  const resetButton = h('button', { type: 'button', class: 'secondary', text: '시연 데이터 초기화' });
  resetButton.addEventListener('click', async () => {
    try {
      await resetDemo();
      createOnboardingStore(globalThis.localStorage, session.user_id).clear();
      status.textContent = '시연 데이터를 처음 상태로 되돌렸어요.';
    } catch (error) {
      status.textContent = error.message;
    }
    status.hidden = false;
  });
  const rows = [
    ['이름', session.display_name], ['역할', ROLE_LABEL[session.role]],
    session.center_name ? ['소속', session.center_name] : null,
    session.caregiver_type ? ['구분', session.caregiver_type] : null,
  ].filter(Boolean);
  view.append(
    h('h1', { tabindex: '-1', text: '마이페이지' }),
    h('dl', { class: 'card info' }, rows.flatMap(([term, value]) => [h('dt', { text: term }), h('dd', { text: value })])),
    h('a', { class: 'button secondary', href: '#/c/center-admin', text: '센터 화면 (시연용)' }),
    resetButton, status,
    h('button', { type: 'button', class: 'link', text: '로그아웃', onclick: async () => { await logout(); navigate('/login'); } }),
  );
}

export async function renderMyPage(view, { session, navigate }) {
  if (session.role !== 'guardian') {
    renderLegacyMyPage(view, { session, navigate });
    return;
  }

  const [profileResult, applicationsResult] = await Promise.allSettled([getProfile(), getCareApplications()]);
  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
  const applications = applicationsResult.status === 'fulfilled' ? applicationsResult.value : [];
  const receiver = profile?.receiver;
  const shares = activeShares(applications);
  const status = h('p', { class: 'notice info my-status', role: 'status', hidden: true });
  const largeEnabled = globalThis.localStorage?.getItem(LARGE_TEXT_KEY) === 'true';
  const toggle = h('span', { class: `my-toggle${largeEnabled ? ' on' : ''}`, role: 'switch', 'aria-checked': String(largeEnabled) }, h('span'));

  let character = CHARACTER;
  if (profile?.avatar?.color) {
    try { character = await characterUrl(profile.avatar.color); } catch { character = CHARACTER; }
  }
  const facts = receiver
    ? [`${receiver.age}세`, receiver.sex, receiver.heightCm ? `${receiver.heightCm}cm` : null, receiver.weightKg ? `${receiver.weightKg}kg` : null].filter(Boolean).join(' · ')
    : '아이 기본 정보를 등록해 주세요';
  const shareSub = shares.length
    ? shares.map((item) => `${item.center_name} ${shortDate(item.requested_end_at)}까지`).join(' · ')
    : '현재 공유 중인 센터가 없어요';

  const profileCard = h('section', { class: 'my-card my-profile' },
    h('div', { class: 'my-profile-main' },
      h('img', { src: character, alt: receiver ? `${receiver.name} 캐릭터` : '돌봄 대상 캐릭터', width: '76', height: '76' }),
      h('div', {}, h('strong', { text: receiver?.name ?? session.care_recipient?.name ?? '아이 정보 없음' }), h('p', { text: facts })),
      h('button', { type: 'button', class: 'my-edit', text: '수정', onclick: () => navigate('/g/onboarding/profile?mode=edit') })),
    h('div', { class: 'my-profile-actions' },
      h('button', { type: 'button', onclick: () => navigate('/g/onboarding/avatar?mode=edit') }, icon('user', 19), '캐릭터 꾸미기'),
      h('button', { type: 'button', onclick: () => navigate('/g/onboarding/photo?mode=edit') }, icon('lock', 18), profile?.photo ? '증명사진 · 등록됨' : '증명사진 · 미등록')));

  const infoCard = h('section', { class: 'my-card my-list' },
    actionRow({
      iconName: 'phone', title: `보호자 · ${session.display_name}`,
      sub: session.relation ? `아이와의 관계: ${session.relation}` : '현재 로그인한 보호자 정보예요',
      onclick: () => { status.textContent = `${session.display_name}님이 현재 보호자로 등록되어 있어요.`; status.hidden = false; },
    }),
    actionRow({ iconName: 'clock', title: `공유 중 ${shares.length}곳`, sub: shareSub, onclick: () => navigate('/g/my/shares') }),
    actionRow({ iconName: 'menu', title: '보낸 기록', sub: '언제, 누구에게, 어떤 항목을 보냈는지 봐요', onclick: () => navigate('/g/my/sent') }));

  const settingsCard = h('section', { class: 'my-card my-list' },
    actionRow({
      iconText: 'Aa', title: '글자 크게 보기', sub: '화면 글씨를 한 단계 크게', toggle,
      onclick: () => {
        const enabled = !document.documentElement.classList.contains('large-text');
        document.documentElement.classList.toggle('large-text', enabled);
        globalThis.localStorage?.setItem(LARGE_TEXT_KEY, String(enabled));
        toggle.classList.toggle('on', enabled);
        toggle.setAttribute('aria-checked', String(enabled));
      },
    }),
    actionRow({
      iconName: 'download', title: '기록 백업하기', sub: '휴대폰을 바꿔도 돌봄카드를 지킬 수 있어요',
      onclick: async () => {
        status.hidden = true;
        try {
          const answers = await getQuestionnaireAnswers();
          downloadJson(buildBackup({ session, profile, answers, applications }), `돌봄바통-${receiver?.name ?? '백업'}.json`);
          status.textContent = '기록 백업 파일을 저장했어요.';
        } catch (error) { status.textContent = error.message; }
        status.hidden = false;
      },
    }),
    actionRow({
      iconName: 'mobile', title: '홈 화면에 추가하기', sub: '앱처럼 쓰고, 기록이 지워지지 않아요',
      onclick: async () => { status.textContent = await installApp(); status.hidden = false; },
    }));

  view.classList.add('mypage');
  view.append(
    h('header', { class: 'my-heading' }, h('h1', { tabindex: '-1', text: '마이페이지' }), h('span', { class: 'my-role', text: session.relation ? `보호자 · ${session.relation}` : '보호자' })),
    profileCard, infoCard, settingsCard, status,
    h('div', { class: 'my-account-actions' },
      h('button', { type: 'button', class: 'link', text: '역할 바꾸기', onclick: async () => { await logout(); navigate('/login'); } }),
      h('span', { text: '|' }),
      h('button', { type: 'button', class: 'link', text: '로그아웃', onclick: async () => { await logout(); navigate('/login'); } })),
  );
}

function recordStatus(item) {
  if (item.assignment?.status === 'completed') return '돌봄 완료';
  if (item.status === 'assigned') return '공유 중';
  if (item.status === 'submitted') return '센터 확인 중';
  if (item.status === 'cancelled') return '취소됨';
  if (item.status === 'rejected') return '거절됨';
  return item.status;
}

async function renderRecordPage(view, { navigate }, currentOnly) {
  const applications = await getCareApplications();
  const records = currentOnly ? activeShares(applications) : applications;
  view.classList.add('mypage', 'my-records');
  view.append(
    h('button', { type: 'button', class: 'back', 'aria-label': '마이페이지로 돌아가기', onclick: () => navigate('/g/my') }, icon('back', 24)),
    h('h1', { tabindex: '-1', text: currentOnly ? '공유 중인 곳' : '보낸 기록' }),
    h('p', { class: 'muted', text: currentOnly ? '현재 설명서를 볼 수 있는 센터예요.' : '센터에 보낸 요청과 항목을 확인해요.' }),
    records.length ? records.map((item) => h('article', { class: 'my-card my-record' },
      h('div', { class: 'my-record-head' }, h('strong', { text: item.center_name ?? '센터' }), h('span', { text: recordStatus(item) })),
      h('p', { text: `${shortDate(item.requested_start_at)} ~ ${shortDate(item.requested_end_at)}` }),
      h('p', { text: `보낸 항목: ${(item.shared_categories ?? []).join(' · ') || '없음'}` })))
      : h('div', { class: 'my-card card empty' }, h('p', { text: currentOnly ? '현재 공유 중인 곳이 없어요.' : '아직 보낸 기록이 없어요.' })),
  );
}

export function renderActiveShares(view, context) {
  return renderRecordPage(view, context, true);
}

export function renderSentRecords(view, context) {
  return renderRecordPage(view, context, false);
}
