// UI completion on top of the A+B integration branch.
// All care requests use the existing authenticated D API; no fabricated availability or AI results.
import { h } from './dom.js';
import { createOnboardingStore } from './onboarding.js';
import { getProfile } from './api.js';
import { characterUrl } from './onboarding-screens.js';

const badge = (text, tone = '') => h('span', { class: `f-chip ${tone}`, text });
const button = (label, action, className = '') => h('button', { type: 'button', class: `f-button ${className}`, text: label, onclick: action });
const anchor = (label, path, className = '') => h('a', { class: `f-button ${className}`, href: `#${path}`, text: label });
const heading = (label) => h('h1', { tabindex: '-1', text: label });
const paragraph = (value, className = '') => h('p', { class: className, text: value });
const card = (...children) => h('section', { class: 'f-panel' }, ...children);
const caption = (text) => h('p', { class: 'f-caption', text });

async function careApi(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new Error('네트워크에 연결하지 못했어요. 다시 시도해 주세요.'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '요청을 처리하지 못했어요.');
  return payload.data;
}

function errorPanel(view, error) {
  view.replaceChildren(heading('다시 확인해 주세요'),
    h('div', { class: 'f-panel f-error', role: 'alert', text: error?.message || '화면을 불러오지 못했어요.' }),
    anchor('홈으로', '/g/home', 'f-secondary'));
}
function frame(view, title, subtitle) {
  view.classList.add('f-screen');
  view.append(h('header', { class: 'f-brand' }, h('span', { text: '돌봄바통' })), heading(title));
  if (subtitle) view.append(paragraph(subtitle, 'f-subtitle'));
}
function datetimeLocal(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fmt(iso) {
  if (!iso) return '시간 미정';
  const time = new Date(iso);
  return Number.isNaN(time.valueOf()) ? '시간 미정' : new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(time);
}
function field(label, control) { return h('label', { class: 'f-field' }, h('span', { text: label }), control); }
function notice(text) { return h('p', { class: 'f-note', role: 'status', text }); }
function selectField(label, options, name) {
  const select = h('select', { name, required: true });
  select.append(h('option', { value: '', text: '선택해 주세요' }));
  for (const option of options) select.append(h('option', { value: option.value, text: option.label }));
  return field(label, select);
}

export async function renderGuardianHome(view, { session, navigate }) {
  view.classList.add('f-screen', 'f-home');
  view.append(h('header', { class: 'f-brand' }, h('span', { text: '돌봄바통' })),
    h('h1', { tabindex: '-1', class: 'f-greeting', text: '큰소리를 힘들어하고,\n그림 카드로 마음을 표현해요' }));
  const child = session.care_recipient;
  const onboardingStore = createOnboardingStore(globalThis.localStorage, session.user_id);
  let onboarding = onboardingStore.load();
  try {
    const cloud = await getProfile();
    if (cloud) {
      onboarding = { ...onboarding, receiver: cloud.receiver ?? onboarding.receiver, avatar: cloud.avatar ?? onboarding.avatar };
      onboardingStore.save(onboarding);
      if (cloud.photo) onboardingStore.savePhoto(cloud.photo);
    }
  } catch { /* Retain the last local profile when the cloud is unavailable. */ }
  const recipientName = onboarding.receiver?.name || child?.name || '돌봄 대상 등록이 필요해요';
  const recipientFacts = onboarding.receiver
    ? [onboarding.receiver.age, onboarding.receiver.sex].filter(Boolean).join(' · ')
    : null;
  let portrait = '/a/assets/figma-mascot.png';
  if (onboarding.avatar?.color) {
    try { portrait = await characterUrl(onboarding.avatar.color); } catch { /* Use the bundled Figma mascot. */ }
  }
  view.append(
    h('section', { class: 'f-hero' },
      h('img', { src: portrait, width: '153', height: '183', alt: '주황색 옷과 빨간 헤드폰을 쓴 돌봄바통 캐릭터' }),
      h('h2', { text: recipientName }),
      caption(recipientFacts || (child ? '보호자가 확인한 기록을 돌봄에 연결해요' : '아이 정보를 먼저 확인해 주세요'))),
    h('section', { class: 'f-quick' },
      anchor('아이 설명서 작성·수정', '/g/manual', 'f-secondary'),
      anchor('아이 맡기기', '/g/care')),
    h('section', { class: 'f-tile-grid' },
      h('a', { href: '#/g/voice', class: 'f-tile' }, h('strong', { text: '🎤 한마디 기록' }), caption('말로 남기는 돌봄 경험')),
      h('a', { href: '#/g/care', class: 'f-tile' }, h('strong', { text: '💙 돌봄 신청' }), caption('센터에 선택한 정보 전달'))),
    notice('질문지 저장과 돌봄 신청은 기존 A·B·D API를 사용합니다. AI 받아쓰기는 C 연결 후 사용할 수 있어요.'));
}

export function renderVoicePending(view, { navigate }) {
  frame(view, '한마디 기록', '최신 Figma 화면의 빠른 기록 진입점입니다.');
  view.append(card(h('h2', { text: '음성 받아쓰기 연결 대기' }),
    paragraph('녹음·AI 분류 API는 담당 기능이 통합되면 이 화면에 연결됩니다. 현재 입력 내용을 서버에 저장했다고 표시하지 않습니다.'),
    anchor('기존 질문지에서 기록하기', '/g/manual', 'f-secondary')),
    button('홈으로 돌아가기', () => navigate('/g/home')));
}

export async function renderCareStatus(view, { navigate }) {
  frame(view, '아이 맡기기', '센터와 기간을 정하고, 보호자가 선택한 정보만 전달해요.');
  const rows = h('div', { class: 'f-list' });
  view.append(anchor('+ 새로 맡기기', '/g/care/new'), h('h2', { text: '내 요청' }), rows);
  try {
    const applications = await careApi('/api/care/applications');
    if (!applications.length) rows.append(card(paragraph('아직 센터에 전달한 요청이 없어요.')));
    for (const item of applications) {
      const state = item.status === 'assigned' ? '선생님 배정' : item.status === 'submitted' ? '센터 확인 대기' : item.status === 'rejected' ? '센터 거절' : item.status === 'cancelled' ? '요청 취소' : '돌봄 종료';
      const panel = card(h('div', { class: 'f-panel-head' }, h('strong', { text: item.center_name }), badge(state)),
        caption(`${fmt(item.requested_start_at)} ~ ${fmt(item.requested_end_at)}`),
        caption(`공유 항목: ${(item.shared_categories || []).join(' · ') || '없음'}`));
      if (item.status === 'submitted') panel.append(button('요청 취소', async () => {
        if (!confirm('이 요청을 취소할까요?')) return;
        try { await careApi(`/api/care/applications/${item.id}/cancel`, { method: 'POST', body: {} }); navigate('/g/care'); }
        catch (error) { alert(error.message); }
      }, 'f-outline'));
      if (item.status === 'assigned' && item.assignment?.status === 'active') panel.append(button('돌봄 종료하기', async () => {
        if (!confirm('돌봄을 종료할까요? 종료하면 종사자의 정보 접근이 중지됩니다.')) return;
        try { await careApi(`/api/care/applications/${item.id}/complete`, { method: 'POST', body: {} }); navigate('/g/care'); }
        catch (error) { alert(error.message); }
      }, 'f-outline'));
      rows.append(panel);
    }
  } catch (error) { rows.append(h('p', { class: 'f-error', role: 'alert', text: error.message })); }
}

export async function renderCareNew(view, { session, navigate }) {
  frame(view, '돌봄 신청', '실제 센터 접수가 아닌 합성 계정 기반 시연 API에 전달합니다.');
  const form = h('form', { class: 'f-form' });
  const error = h('p', { class: 'f-error', role: 'alert', hidden: true });
  view.append(form);
  try {
    const [centers, recipients] = await Promise.all([careApi('/api/care/centers'), careApi('/api/care/recipients')]);
    const recipient = recipients.find((item) => item.id === session.care_recipient_id) || recipients[0];
    if (!recipient) { form.append(card(paragraph('등록된 돌봄 대상이 없습니다.'))); return; }
    const summary = await careApi(`/api/care/share-summary?care_recipient_id=${encodeURIComponent(recipient.id)}`);
    const today = new Date();
    const end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const center = selectField('돌봄센터', centers.map((item) => ({ value: item.id, label: `${item.name} (${item.center_type})` })), 'center_id');
    const startInput = h('input', { type: 'datetime-local', name: 'starts_at', required: true, value: datetimeLocal(today) });
    const endInput = h('input', { type: 'datetime-local', name: 'ends_at', required: true, value: datetimeLocal(end) });
    const group = h('fieldset', { class: 'f-sharing' }, h('legend', { text: '공유할 돌봄 정보 선택' }));
    for (const item of summary) {
      const sensitive = item.category === '위생';
      const input = h('input', { type: 'checkbox', name: 'shared_categories', value: item.category });
      input.checked = !sensitive && item.confirmed_count > 0;
      input.disabled = item.confirmed_count === 0;
      group.append(h('label', { class: 'f-check' }, input, h('span', { text: `${sensitive ? '🔒 ' : ''}${item.category} (${item.confirmed_count}건)` })));
    }
    const preference = h('input', { name: 'preferred_caregiver', maxlength: '60', placeholder: '희망 사항이 있다면 적어 주세요' });
    const note = h('textarea', { name: 'request_note', rows: '3', maxlength: '230', placeholder: '센터에 남길 말 (선택)' });
    const submit = h('button', { class: 'f-button', type: 'submit', text: '센터에 전달하기' });
    form.append(card(h('h2', { text: `${recipient.name} 님` }), center,
      field('시작', startInput), field('종료', endInput), group,
      caption('위생 정보는 기본으로 공유하지 않아요. 공유 여부를 직접 선택해 주세요.'),
      field('희망 돌봄자 · 선호 사항 (선택)', preference),
      caption('희망 돌봄자 정보는 요청사항으로 전달되며, 배정이 보장되지는 않습니다.'),
      field('남길 말', note)), error, submit, anchor('취소', '/g/care', 'f-outline'));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const choices = [...group.querySelectorAll('input:checked')].map((input) => input.value);
      const started = new Date(startInput.value);
      const ended = new Date(endInput.value);
      if (choices.length === 0) { error.textContent = '공유할 정보를 하나 이상 선택해 주세요.'; error.hidden = false; return; }
      if (Number.isNaN(+started) || Number.isNaN(+ended) || ended <= started) { error.textContent = '기간을 확인해 주세요.'; error.hidden = false; return; }
      if (choices.includes('위생') && !confirm('위생 정보는 민감할 수 있어요. 정말 공유하시겠어요?')) return;
      submit.disabled = true;
      try {
        const requestNote = [preference.value.trim() ? `희망 돌봄자: ${preference.value.trim()}` : '', note.value.trim()].filter(Boolean).join(' / ');
        await careApi('/api/care/applications', { method: 'POST', body: {
          care_recipient_id: recipient.id, center_id: center.querySelector('select').value,
          requested_start_at: started.toISOString(), requested_end_at: ended.toISOString(),
          shared_categories: choices, request_note: requestNote.slice(0, 300),
        } });
        navigate('/g/care');
      } catch (caught) { error.textContent = caught.message; error.hidden = false; submit.disabled = false; }
    });
  } catch (caught) { errorPanel(view, caught); }
}

export async function renderCaregiverHome(view, { navigate }) {
  frame(view, '맡은 분', '현재 배정된 분과 공유 가능한 정보를 확인해요.');
  const container = h('section', { class: 'f-list' });
  view.append(container);
  try {
    const assigned = await careApi('/api/care/assignments');
    if (!assigned.length) { container.append(card(paragraph('아직 배정된 분이 없어요. 센터에서 배정하면 이곳에 나타나요.'))); return; }
    for (const item of assigned) container.append(card(
      h('h2', { text: item.care_recipient_name || '돌봄 대상' }),
      badge(item.can_view_now ? '열람 가능' : '이용 시작 전', item.can_view_now ? 'f-good' : ''),
      caption(item.center_name || '센터'), caption(`${fmt(item.starts_at)} ~ ${fmt(item.ends_at)}`),
      caption(`공유: ${(item.shared_categories || []).join(' · ')}`),
      item.can_view_now ? button('한 장 카드 보기', () => navigate('/c/manual')) : notice('시작 시각 전에는 설명서를 열람할 수 없습니다.')));
  } catch (error) { container.append(h('p', { class: 'f-error', role: 'alert', text: error.message })); }
}

export async function renderCaregiverCard(view, { navigate }) {
  frame(view, '한 장 카드', '보호자가 선택한 항목만 표시합니다.');
  const container = h('section', { class: 'f-list' });
  view.append(container);
  try {
    const assignments = await careApi('/api/care/assignments');
    const active = assignments.find((item) => item.can_view_now);
    if (!active) { container.append(card(paragraph('현재 열람 가능한 대상이 없습니다. 이용 기간 및 배정을 확인해 주세요.'))); return; }
    const access = await careApi(`/api/care/access?care_recipient_id=${encodeURIComponent(active.care_recipient_id)}`);
    if (!access.allowed) { container.append(card(paragraph('현재 열람 권한이 없습니다.'))); return; }
    container.append(card(h('h2', { text: active.care_recipient_name }),
      caption('공유된 정보 종류'),
      h('div', { class: 'f-chips' }, ...(access.shared_categories || []).map((category) => badge(category))),
      notice('항목별 실제 설명서 본문 조회 API는 아직 제공되지 않았습니다. 제공되지 않은 돌봄 조언을 AI가 만들어 보여주지 않습니다.')),
      anchor('돌봄 기록 남기기', '/c/records', 'f-secondary'));
  } catch (error) { container.append(h('p', { class: 'f-error', role: 'alert', text: error.message })); }
}

export function renderCaregiverRecords(view, { navigate }) {
  frame(view, '한마디 돌봄 기록', '돌봄 중 알게 된 것을 간편하게 남기는 화면입니다.');
  view.append(card(h('h2', { text: '기록 연결 준비 중' }),
    paragraph('담당 C의 녹음·분류·일지 저장 API가 통합되면 이 화면에 연결됩니다. 현재 임의로 기록을 서버에 저장하거나 보호자에게 승인 요청을 보내지 않습니다.'),
    anchor('맡은 분 확인', '/c/home', 'f-secondary')));
}

export async function renderCenterAdmin(view, { navigate }) {
  frame(view, '센터 접수·배정', '센터에 들어온 요청을 확인하고 담당 종사자를 배정해요.');
  const container = h('section', { class: 'f-list' });
  view.append(container);
  try {
    const [applications, caregivers] = await Promise.all([
      careApi('/api/care/applications'), careApi('/api/care/center-caregivers'),
    ]);
    if (!applications.length) { container.append(card(paragraph('접수된 요청이 없어요.'))); return; }
    for (const item of applications) {
      const panel = card(h('div', { class: 'f-panel-head' }, h('strong', { text: item.center_name }), badge(item.status)),
        caption(`${fmt(item.requested_start_at)} ~ ${fmt(item.requested_end_at)}`),
        caption(`공유 항목: ${(item.shared_categories || []).join(' · ')}`));
      if (item.status === 'submitted') {
        const select = selectField('담당 종사자', caregivers.map((person) => ({ value: person.user_id, label: `${person.display_name} · ${person.caregiver_type}` })), 'caregiver');
        const alertNode = h('p', { class: 'f-error', hidden: true, role: 'alert' });
        panel.append(select, alertNode, button('수락하고 배정하기', async () => {
          const choice = select.querySelector('select').value;
          if (!choice) { alertNode.textContent = '종사자를 선택해 주세요.'; alertNode.hidden = false; return; }
          try { await careApi(`/api/care/applications/${item.id}/assign`, { method: 'POST', body: { caregiver_user_id: choice } }); navigate('/c/center-admin'); }
          catch (error) { alertNode.textContent = error.message; alertNode.hidden = false; }
        }), button('수락하지 않기', async () => {
          if (!confirm('이 요청을 거절할까요?')) return;
          try { await careApi(`/api/care/applications/${item.id}/reject`, { method: 'POST', body: {} }); navigate('/c/center-admin'); }
          catch (error) { alertNode.textContent = error.message; alertNode.hidden = false; }
        }, 'f-outline'));
      }
      container.append(panel);
    }
  } catch (error) { container.append(h('p', { class: 'f-error', role: 'alert', text: error.message })); }
}

export function renderUnconfirmedFeature(view, { navigate }, title, text) {
  frame(view, title, '최신 Figma 추가 화면');
  view.append(card(paragraph(text),
    notice('실시간 데이터나 승인되지 않은 내용을 만들어 표시하지 않습니다.'),
    button('이전 화면으로', () => navigate('/g/care'), 'f-secondary')));
}
