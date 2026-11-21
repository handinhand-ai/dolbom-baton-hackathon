// D 담당: 아이 맡기기(06~09) · 센터 화면(15) · 종사자 배정 목록(11 일부)
// TODO(A): 로그인·탭 틀이 병합되면 시연 계정 선택을 A의 세션으로 바꿉니다.

const SENSITIVE = ['위생'];
const POLL_MS = 15000;
const state = { userId: null, user: null, users: [], screen: 'status', draft: null, pollTimer: null, busy: false };

const view = document.getElementById('view');
const toastBox = document.getElementById('toast');

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// false·null 같은 조건부 자식은 빼고 화면을 바꿉니다.
function show(...nodes) {
  view.replaceChildren(...nodes.filter((node) => node !== null && node !== undefined && node !== false));
}

function toast(message) {
  toastBox.textContent = message;
  toastBox.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastBox.hidden = true; }, 2600);
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'X-Demo-User': state.userId ?? '' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? '요청을 처리하지 못했어요.');
  return payload.data;
}

const dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmt = (iso) => dateFmt.format(new Date(iso));

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setScreen(screen) {
  state.screen = screen;
  render();
}

// ---------- 보호자: 09 맡기기 상태 ----------
const STEP_LABELS = ['전달함', '선생님 배정', '돌봄 중', '끝'];

function stepIndex(application) {
  const assignment = application.assignment;
  if (assignment?.status === 'completed') return 4;
  if (application.status === 'assigned') {
    return new Date() >= new Date(assignment.starts_at) ? 3 : 2;
  }
  return 1;
}

function statusText(application) {
  const assignment = application.assignment;
  if (application.status === 'rejected') return ['센터가 이번 요청을 받지 못했어요. 다른 센터에 다시 전달해 주세요.', 'red'];
  if (application.status === 'cancelled') return ['요청을 취소했어요.', 'gray'];
  if (assignment?.status === 'completed') return ['돌봄이 끝났어요. 선생님은 이제 설명서를 볼 수 없어요.', 'gray'];
  if (application.status === 'assigned') {
    return [`${assignment.caregiver_name} 선생님(${assignment.caregiver_type})이 맡아요.`, 'green'];
  }
  return ['센터에 전달했어요. 센터가 확인하고 선생님을 배정해요.', ''];
}

function applicationCard(application) {
  const [text, tone] = statusText(application);
  const step = stepIndex(application);
  const active = !['rejected', 'cancelled'].includes(application.status);
  const actions = [];
  if (application.status === 'submitted') {
    actions.push(el('button', { class: 'btn ghost', type: 'button', onclick: () => act(`/api/care/applications/${application.id}/cancel`, '요청을 취소했어요.') }, '요청 취소'));
  }
  if (application.status === 'assigned' && application.assignment?.status === 'active') {
    actions.push(el('button', { class: 'btn danger', type: 'button', onclick: () => act(`/api/care/applications/${application.id}/complete`, '돌봄을 끝냈어요.') }, '돌봄 끝내기'));
  }
  return el('article', { class: 'card' }, [
    el('h3', { text: application.center_name }),
    el('p', { class: 'meta', text: `${fmt(application.requested_start_at)} ~ ${fmt(application.requested_end_at)}` }),
    active && el('div', { class: 'steps', 'aria-hidden': 'true' }, STEP_LABELS.map((_, index) => el('span', { class: index < step ? 'done' : '' }))),
    active && el('div', { class: 'step-labels', 'aria-hidden': 'true' }, STEP_LABELS.map((label) => el('span', { text: label }))),
    el('p', {}, el('span', { class: `badge ${tone}`, text })),
    el('p', { class: 'meta', text: `보낸 정보: ${application.shared_categories.join(' · ')}` }),
    // TODO(B): 14 새 정보 확인이 병합되면 `새 정보 N개` 진입 버튼을 여기에 둡니다.
    ...actions,
  ]);
}

async function renderGuardianStatus() {
  const applications = await api('/api/care/applications');
  show(
    el('h1', { text: '아이 맡기기' }),
    el('p', { class: 'sub', text: '센터에 보낼 정보는 직접 골라요. 배정된 선생님만, 맡긴 기간 동안만 볼 수 있어요.' }),
    el('button', { class: 'btn', type: 'button', onclick: () => startDraft() }, '새로 맡기기'),
    el('h2', { text: '내 요청' }),
    applications.length === 0
      ? el('div', { class: 'empty', text: '아직 전달한 요청이 없어요.' })
      : el('div', {}, applications.map(applicationCard)),
  );
}

// ---------- 보호자: 06~08 요청 화면(한 화면) ----------
async function startDraft() {
  const [centers, recipients] = await Promise.all([api('/api/care/centers'), api('/api/care/recipients')]);
  if (recipients.length === 0) {
    toast('먼저 돌봄 대상을 등록해 주세요.');
    return;
  }
  const recipient = recipients[0];
  const summary = await api(`/api/care/share-summary?care_recipient_id=${encodeURIComponent(recipient.id)}`);
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  state.draft = {
    centers,
    recipient,
    summary,
    center_id: null,
    start: toLocalInput(start),
    end: toLocalInput(end),
    categories: new Set(summary.filter((item) => item.confirmed_count > 0 && !SENSITIVE.includes(item.category)).map((item) => item.category)),
    note: '',
    error: '',
  };
  setScreen('new');
}

function readDraftForm() {
  const draft = state.draft;
  draft.center_id = view.querySelector('input[name="center"]:checked')?.value ?? null;
  draft.start = view.querySelector('#start').value;
  draft.end = view.querySelector('#end').value;
  draft.note = view.querySelector('#note').value;
  draft.categories = new Set([...view.querySelectorAll('input[name="category"]:checked')].map((input) => input.value));
}

function validateDraft() {
  const draft = state.draft;
  if (!draft.center_id) return '센터를 골라 주세요.';
  if (!draft.start || !draft.end) return '기간을 입력해 주세요.';
  if (new Date(draft.end) <= new Date(draft.start)) return '끝나는 시각은 시작 시각보다 늦어야 해요.';
  if (draft.categories.size === 0) return '보낼 정보를 하나 이상 골라 주세요.';
  return '';
}

function renderDraft() {
  const draft = state.draft;
  const centerOptions = draft.centers.map((center) => el('label', { class: 'option' }, [
    el('input', { type: 'radio', name: 'center', value: center.id, checked: draft.center_id === center.id }),
    el('span', {}, [
      el('strong', { text: center.name }), el('br'),
      el('span', { class: 'meta', text: `${center.center_type} · ${center.region} ` }),
      el('span', { class: 'badge synthetic', text: '시연용' }),
    ]),
  ]));

  const chips = draft.summary.map(({ category, confirmed_count: count }) => {
    const sensitive = SENSITIVE.includes(category);
    const input = el('input', { type: 'checkbox', name: 'category', value: category, checked: draft.categories.has(category), disabled: count === 0 });
    if (sensitive) {
      input.addEventListener('change', () => {
        if (input.checked && !window.confirm(`${category} 정보는 민감 정보예요. 선생님께 보낼까요?`)) input.checked = false;
      });
    }
    const label = count === 0 ? `${category} · 기록 없음` : `${sensitive ? '🔒 ' : ''}${category} ${count}`;
    return el('label', { class: `chip${sensitive ? ' sensitive' : ''}` }, [input, el('span', { text: label })]);
  });

  show(
    el('button', { class: 'btn ghost', type: 'button', onclick: () => { state.draft = null; setScreen('status'); } }, '‹ 돌아가기'),
    el('h1', { text: `${draft.recipient.name} 맡기기` }),
    el('p', { class: 'sub', text: '센터와 기간, 보낼 정보를 골라 센터에 전달해요.' }),
    el('h2', { text: '1. 센터' }),
    el('div', {}, centerOptions),
    el('h2', { text: '2. 기간' }),
    el('label', { class: 'field' }, ['시작', el('input', { id: 'start', type: 'datetime-local', value: draft.start, required: true })]),
    el('label', { class: 'field' }, ['끝', el('input', { id: 'end', type: 'datetime-local', value: draft.end, required: true })]),
    el('h2', { text: '3. 보낼 정보' }),
    el('div', { class: 'chips' }, chips),
    el('p', { class: 'hint', text: '위생은 기본으로 보내지 않아요. 기록이 없는 항목은 고를 수 없어요.' }),
    el('h2', { text: '4. 남길 말 (선택)' }),
    el('label', { class: 'field' }, ['요청사항', el('textarea', { id: 'note', rows: '2', maxlength: '300', placeholder: '예) 오늘 저녁부터 부탁드려요' }, draft.note)]),
    draft.error && el('p', { class: 'error', role: 'alert', text: draft.error }),
    el('button', {
      class: 'btn', type: 'button', onclick: () => {
        readDraftForm();
        draft.error = validateDraft();
        if (draft.error) { renderDraft(); return; }
        setScreen('confirm');
      },
    }, '다음'),
  );
}

function renderConfirm() {
  const draft = state.draft;
  const center = draft.centers.find((item) => item.id === draft.center_id);
  const skipped = draft.summary.filter((item) => item.confirmed_count > 0 && !draft.categories.has(item.category)).map((item) => item.category);
  const submit = el('button', { class: 'btn', type: 'button', onclick: () => submitDraft(submit) }, '센터에 전달하기');
  show(
    el('h1', { text: '이대로 전달할까요?' }),
    el('article', { class: 'card confirm' }, [
      el('p', { class: 'meta', text: '돌봄 대상' }), el('h3', { text: draft.recipient.name }),
      el('p', { class: 'meta', text: '센터' }), el('h3', { text: center.name }),
      el('p', { class: 'meta', text: '기간' }), el('h3', { text: `${fmt(draft.start)} ~ ${fmt(draft.end)}` }),
      el('p', { class: 'meta', text: `보낼 정보 ${draft.categories.size}가지` }),
      el('h3', { text: [...draft.categories].join(' · ') }),
      skipped.length > 0 && el('p', { class: 'hint', text: `보내지 않는 정보: ${skipped.join(' · ')}` }),
      draft.note && el('p', { class: 'meta', text: `남길 말: ${draft.note}` }),
    ]),
    el('p', { class: 'hint', text: '센터가 확인하고 선생님을 배정하면 이 화면에서 알려 드려요.' }),
    submit,
    el('button', { class: 'btn ghost', type: 'button', onclick: () => setScreen('new') }, '고치기'),
  );
}

async function submitDraft(button) {
  if (state.busy) return;
  state.busy = true;
  button.disabled = true;
  const draft = state.draft;
  try {
    await api('/api/care/applications', {
      method: 'POST',
      body: {
        care_recipient_id: draft.recipient.id,
        center_id: draft.center_id,
        requested_start_at: new Date(draft.start).toISOString(),
        requested_end_at: new Date(draft.end).toISOString(),
        shared_categories: [...draft.categories],
        request_note: draft.note.trim() || undefined,
      },
    });
    state.draft = null;
    toast('센터에 전달했어요.');
    setScreen('status');
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  } finally {
    state.busy = false;
  }
}

// ---------- 센터 화면(15, 시연용) ----------
async function renderCenterAdmin() {
  const [applications, caregivers] = await Promise.all([api('/api/care/applications'), api('/api/care/center-caregivers')]);
  const pending = applications.filter((item) => item.status === 'submitted');
  const done = applications.filter((item) => item.status !== 'submitted');

  const pendingCard = (application) => {
    const select = el('select', { 'aria-label': '배정할 종사자' }, caregivers.map((caregiver) => el('option', { value: caregiver.user_id, text: `${caregiver.display_name} · ${caregiver.caregiver_type}` })));
    return el('article', { class: 'card' }, [
      el('h3', { text: '새 맡기기 요청' }),
      el('p', { class: 'meta', text: `${fmt(application.requested_start_at)} ~ ${fmt(application.requested_end_at)}` }),
      el('p', { class: 'meta', text: `보호자가 보낸 정보: ${application.shared_categories.join(' · ')}` }),
      application.request_note && el('p', { class: 'meta', text: `남긴 말: ${application.request_note}` }),
      el('label', { class: 'field' }, ['배정할 선생님', select]),
      caregivers.length === 0 && el('p', { class: 'error', text: '이 센터에 배정할 수 있는 종사자가 없어요.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn soft', type: 'button', onclick: () => act(`/api/care/applications/${application.id}/reject`, '요청을 거절했어요.') }, '거절'),
        el('button', {
          class: 'btn', type: 'button', disabled: caregivers.length === 0,
          onclick: () => act(`/api/care/applications/${application.id}/assign`, '수락하고 배정했어요.', { caregiver_user_id: select.value }),
        }, '수락하고 배정'),
      ]),
    ]);
  };

  show(
    el('h1', {}, ['센터 화면 ', el('span', { class: 'badge synthetic', text: '시연용' })]),
    el('p', { class: 'sub', text: '실제 기관 관리자 화면이 아니에요. 들어온 요청을 수락하고 소속 선생님을 배정해요.' }),
    el('h2', { text: `들어온 요청 ${pending.length}` }),
    pending.length === 0 ? el('div', { class: 'empty', text: '새 요청이 없어요.' }) : el('div', {}, pending.map(pendingCard)),
    done.length > 0 && el('h2', { text: '처리한 요청' }),
    ...done.map((application) => el('article', { class: 'card' }, [
      el('p', { class: 'meta', text: `${fmt(application.requested_start_at)} ~ ${fmt(application.requested_end_at)}` }),
      el('span', { class: 'badge gray', text: application.status === 'assigned' ? `${application.assignment.caregiver_name} 선생님 배정${application.assignment.status === 'completed' ? ' · 돌봄 끝' : ''}` : application.status === 'rejected' ? '거절함' : '보호자가 취소함' }),
    ])),
  );
}

// ---------- 종사자: 배정된 대상(11 일부) ----------
async function renderCaregiver() {
  const assignments = await api('/api/care/assignments');
  show(
    el('h1', { text: '내가 맡은 대상' }),
    el('p', { class: 'sub', text: '배정된 기간 동안, 보호자가 보낸 정보만 볼 수 있어요.' }),
    assignments.length === 0
      ? el('div', { class: 'empty', text: '아직 배정된 대상이 없어요. 센터에서 배정하면 여기에 보여요.' })
      : el('div', {}, assignments.map((assignment) => el('article', { class: 'card' }, [
        el('h3', { text: assignment.care_recipient_name }),
        el('p', { class: 'meta', text: assignment.center_name }),
        el('p', { class: 'meta', text: `${fmt(assignment.starts_at)} ~ ${fmt(assignment.ends_at)}` }),
        el('span', { class: `badge ${assignment.can_view_now ? 'green' : 'gray'}`, text: assignment.can_view_now ? '돌봄 중 · 설명서 열람 가능' : `${fmt(assignment.starts_at)}부터 설명서를 볼 수 있어요` }),
        el('p', { class: 'meta', text: `볼 수 있는 정보: ${assignment.shared_categories.join(' · ')}` }),
        assignment.request_note && el('p', { class: 'meta', text: `보호자 말: ${assignment.request_note}` }),
        // TODO(B·C): 설명서 탭(한 장 카드)·물어보기로 이어지는 진입점을 여기에 둡니다.
      ]))),
  );
}

// ---------- 공통 ----------
async function act(path, message, body) {
  if (state.busy) return;
  state.busy = true;
  try {
    await api(path, { method: 'POST', body: body ?? {} });
    toast(message);
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
    render();
  }
}

async function render() {
  try {
    if (!state.user) {
      show(el('div', { class: 'empty', text: '시연 계정을 골라 주세요.' }));
      return;
    }
    if (state.user.role === 'guardian') {
      if (state.screen === 'new' && state.draft) renderDraft();
      else if (state.screen === 'confirm' && state.draft) renderConfirm();
      else await renderGuardianStatus();
    } else if (state.user.role === 'center_admin') {
      await renderCenterAdmin();
    } else {
      await renderCaregiver();
    }
  } catch (error) {
    show(el('div', { class: 'empty', text: error.message }));
  }
}

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (document.hidden || state.busy) return;
    if (state.user?.role === 'guardian' && state.screen !== 'status') return; // 입력 중인 폼은 덮어쓰지 않음
    render();
  }, POLL_MS);
}

async function init() {
  const roleLabel = { guardian: '보호자', caregiver: '종사자', center_admin: '센터 관리자' };
  state.users = await api('/api/care/demo-users');
  const picker = document.getElementById('demo-user');
  picker.replaceChildren(...state.users.map((user) => el('option', { value: user.user_id, text: `${roleLabel[user.role]} · ${user.display_name}` })));
  const requested = new URLSearchParams(location.search).get('as');
  const initial = state.users.find((user) => user.role === requested) ?? state.users[0];
  picker.value = initial.user_id;
  const select = (userId) => {
    state.userId = userId;
    state.user = state.users.find((user) => user.user_id === userId) ?? null;
    state.screen = 'status';
    state.draft = null;
    render();
  };
  picker.addEventListener('change', () => select(picker.value));
  select(initial.user_id);
  startPolling();
}

init().catch(() => {
  show(el('div', { class: 'empty', text: '서버에 연결할 수 없어요. 실행 상태를 확인해 주세요.' }));
});
