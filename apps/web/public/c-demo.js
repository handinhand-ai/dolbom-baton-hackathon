import { createQuestionsPanel } from './c-demo-questions.js';
import { createVoiceCapture } from './c-demo-voice.js';

const input = document.querySelector('#record-input');
const demoRole = document.querySelector('#demo-role');
const demoGuardian = document.querySelector('#demo-guardian');
const demoGuardianPanel = document.querySelector('#demo-guardian-panel');
const demoRecipient = document.querySelector('#demo-recipient');
const assignedList = document.querySelector('#assigned-list');
const accountContinue = document.querySelector('#account-continue');
const profileRole = document.querySelector('#profile-role');
const profileName = document.querySelector('#profile-name');
const profileDetails = document.querySelector('#profile-details');
const profileAvatar = document.querySelector('#profile-avatar');
const profileNameDialog = document.querySelector('#profile-name-dialog');
const profileNameInput = document.querySelector('#profile-name-input');
const profileAvatarDialog = document.querySelector('#profile-avatar-dialog');
const profileLarge = document.querySelector('#profile-large');
const heroContext = document.querySelector('#hero-context');
const homeTitle = document.querySelector('#home-title');
const mic = document.querySelector('#home-mic');
const voiceStatus = document.querySelector('#voice-status');
const voiceBack = document.querySelector('#voice-back');
const voicePreview = document.querySelector('#voice-preview');
const voicePlay = document.querySelector('#voice-play');
const voiceAudio = document.querySelector('#voice-audio');
const voiceDuration = document.querySelector('#voice-duration');
const voiceTranscript = document.querySelector('#voice-transcript');
const voiceAnswer = document.querySelector('#voice-answer');
const receivedQuestionsCount = document.querySelector('#received-questions-count');
const contextTab = document.querySelector('[data-nav=context]');
const contextTabLabel = document.querySelector('#context-tab-label');
const nav = document.querySelector('.bottom-nav');
const screens = [...document.querySelectorAll('[data-screens]')];
const tabs = [...document.querySelectorAll('[data-nav]')];
const shell = document.querySelector('.record-demo');
const source = document.querySelector('#source');
const structureButton = document.querySelector('#structure');
const manualButton = document.querySelector('#manual');
const feedback = document.querySelector('#feedback');
const writeBack = document.querySelector('#write-back');
const review = document.querySelector('#review');
const rawPreview = document.querySelector('#raw-preview');
const saveRecord = document.querySelector('#save-record');
const manualItems = document.querySelector('#manual-items');
const manualState = document.querySelector('#manual-state');
const manualContext = document.querySelector('#manual-context');
const manualPerson = document.querySelector('#manual-person');
const manualDate = document.querySelector('#manual-date');
const manualCount = document.querySelector('#manual-count');
const manualSituations = document.querySelector('#manual-situations');
const manualTips = document.querySelector('#manual-tips');
const manualExtra = document.querySelector('#manual-extra');
const manualExtraItems = document.querySelector('#manual-extra-items');
const drafts = document.querySelector('#drafts');
const records = document.querySelector('#records');
const recordsPageTitle = document.querySelector('#records-page-title');
const recordsContext = document.querySelector('#records-context');
const recordsTitle = document.querySelector('#saved-title');
const recordsEmpty = document.querySelector('#records-empty');
const template = document.querySelector('#draft-template');
const candidatePanel = document.querySelector('#candidate-panel');
const caregiverRecordLink = document.querySelector('#caregiver-record-link');
const candidates = document.querySelector('#candidates');
const candidatesEmpty = document.querySelector('#candidates-empty');
const ask = document.querySelector('#ask');
const question = document.querySelector('#question');
const answer = document.querySelector('#answer');
const citations = document.querySelector('#citations');
const questionsTitle = document.querySelector('#questions-page-title');
const questionsContext = document.querySelector('#questions-context');
const timeLabel = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const surveyDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric',
});
let categories = [];
let target;
let draftSource;
let pendingSave;
let busy = false;
let manualRequest = 0;
let manualSignature;
let audioUrl;

const sessionKey = 'dolbom.c-demo.confirmed-account';
const initialParams = new URLSearchParams(location.search);
const requestedRole = initialParams.get('role') ?? sessionStorage.getItem(sessionKey);
const requestedRecipient = initialParams.get('recipient');
if (requestedRole === 'caregiver' || requestedRole === 'caregiver-2') {
  demoRole.querySelector('[value=caregiver]').checked = true;
}
if (requestedRole === 'guardian-2' || initialParams.get('guardian') === 'guardian-2') demoGuardian.value = 'guardian-2';
demoRecipient.value = ['guardian', 'guardian-2'].includes(requestedRecipient) ? requestedRecipient : demoGuardian.value;

function roleValue() {
  return demoRole.querySelector(':checked').value;
}

function selectedAccount() {
  return roleValue() === 'guardian' ? demoGuardian.value : 'caregiver';
}

const screenByHash = new Map([
  ['start', 'start'],
  ['assigned', 'assigned'],
  ['home', 'home'],
  ['record-input', 'write'],
  ['review-title', 'review'],
  ['saved-title', 'records'],
  ['manual', 'manual'],
  ['candidate-title', 'manual'],
  ['ask', 'questions'],
  ['common-questions', 'questions'],
  ['settings', 'settings'],
]);

function showScreen() {
  const anchor = location.hash.slice(1);
  const caregiver = roleValue() === 'caregiver';
  let screen = screenByHash.get(anchor) ?? 'home';
  if (screen === 'assigned' && !caregiver) screen = 'home';
  if (screen === 'review' && review.hidden) screen = 'write';
  const context = screen === 'records' || screen === 'write' || screen === 'review';
  const isAsk = anchor === 'ask';
  const activeTab = context ? (caregiver ? 'context' : 'home')
    : screen === 'questions' ? (caregiver || isAsk ? 'home' : 'context')
    : screen === 'assigned' ? 'home' : screen;
  shell.dataset.page = screen;
  shell.dataset.role = roleValue();
  shell.dataset.questionView = isAsk ? 'manual' : 'inbox';
  questionsTitle.textContent = isAsk ? (audioUrl ? '이렇게 정리했어요' : '설명서에 물어보기')
    : caregiver ? '받은 질문' : '아이 맡기기';
  voiceBack.hidden = !isAsk;
  voicePreview.hidden = !isAsk || !audioUrl;
  if (!isAsk) voiceAudio.pause();
  if (screen !== 'home') voiceCapture.cancel();
  nav.hidden = ['start', 'write', 'review'].includes(screen);
  for (const section of screens) section.hidden = !section.dataset.screens.split(' ').includes(screen);
  for (const tab of tabs) {
    if (tab.dataset.nav === activeTab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const detail = ['saved-title', 'candidate-title'].includes(anchor)
    ? document.getElementById(anchor) : null;
  if (detail) {
    detail.scrollIntoView({ block: 'start' });
    detail.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, 0);
  }
}

function goTo(anchor) {
  if (location.hash !== `#${anchor}`) location.hash = anchor;
  showScreen();
}

async function request(path, body, idempotencyKey) {
  const headers = { 'X-C-Demo-Role': selectedAccount(), 'X-C-Demo-Recipient': demoRecipient.value };
  const options = body === undefined ? {} : {
    method: 'POST',
    body: JSON.stringify(body),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(path, { ...options, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
  return result;
}

function recordRow(item) {
  const row = document.createElement('li');
  const category = document.createElement('span');
  category.className = 'item-meta';
  category.textContent = item.category;
  const content = document.createElement('p');
  content.textContent = item.text;
  row.append(category, content);
  const date = new Date(item.created_at);
  if (!Number.isNaN(date.getTime())) {
    const time = document.createElement('time');
    time.className = 'item-status';
    time.dateTime = date.toISOString();
    time.textContent = timeLabel.format(date);
    row.append(time);
  }
  const statuses = {
    differs: '설명서와 달라요',
    same: '설명서와 같은 기록이에요',
  };
  const status = item.sent_to_guardian_at ? '보호자께 보냈어요' : statuses[item.relation];
  if (status) {
    const label = document.createElement('span');
    label.className = item.relation === 'differs' && !item.sent_to_guardian_at ? 'item-status warning' : 'item-status';
    label.textContent = status;
    row.append(label);
  }
  if (!item.sent_to_guardian_at && (item.relation === 'new' || item.relation === 'differs')) {
    const send = document.createElement('button');
    send.className = 'text-link';
    send.textContent = '보호자께 보내기';
    send.addEventListener('click', async () => {
      if (busy) return;
      send.disabled = true;
      setInputBusy(true);
      try {
        const result = await request('/api/c/handbacks', { care_recipient_id: target, record_id: item.id });
        row.replaceWith(recordRow(result.item));
        feedback.textContent = '보호자 설명서 후보로 보냈어요.';
      } catch (error) {
        feedback.textContent = error.message;
        send.disabled = false;
      } finally {
        setInputBusy(false);
      }
    });
    row.append(send);
  }
  return row;
}

function setInputBusy(value) {
  busy = value;
  demoRole.disabled = value;
  demoGuardian.disabled = value;
  demoRecipient.disabled = value;
  accountContinue.disabled = value;
  source.readOnly = value;
  for (const button of assignedList.querySelectorAll('button')) button.disabled = value;
  structureButton.disabled = value;
  manualButton.disabled = value;
}

function clearVoicePreview() {
  voiceCapture.cancel();
  voiceAudio.pause();
  voiceAudio.removeAttribute('src');
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = undefined;
  voicePreview.hidden = true;
  voiceAnswer.hidden = true;
}

const voiceCapture = createVoiceCapture({
  button: mic,
  status: voiceStatus,
  async transcribe(audio, signal) {
    const response = await fetch('/api/ai/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': audio.type,
        'X-C-Demo-Role': selectedAccount(),
        'X-C-Demo-Recipient': demoRecipient.value,
      },
      body: audio,
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result.text;
  },
  onTranscript({ audio, text, seconds }) {
    clearVoicePreview();
    audioUrl = URL.createObjectURL(audio);
    voiceAudio.src = audioUrl;
    voiceTranscript.textContent = text;
    voiceDuration.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    question.value = text.slice(0, question.maxLength);
    goTo('ask');
    ask.requestSubmit();
  },
});

for (let index = 0; index < 25; index += 1) {
  document.querySelector('#voice-waveform').append(document.createElement('i'));
}
voicePlay.addEventListener('click', async () => {
  if (!voiceAudio.paused) {
    voiceAudio.pause();
    return;
  }
  try {
    await voiceAudio.play();
  } catch {
    feedback.textContent = '녹음을 재생할 수 없어요.';
  }
});
for (const event of ['play', 'pause', 'ended']) {
  voiceAudio.addEventListener(event, () => {
    const playing = !voiceAudio.paused && !voiceAudio.ended;
    voicePlay.querySelector('use').setAttribute('href', playing ? '#icon-pause' : '#icon-play');
    voicePlay.setAttribute('aria-label', playing ? '녹음 일시 정지' : '녹음 재생');
  });
}

const questions = createQuestionsPanel(request, async (action) => {
  if (busy) return;
  setInputBusy(true);
  try {
    await action();
  } finally {
    setInputBusy(false);
  }
}, (count) => {
  receivedQuestionsCount.hidden = count === 0;
  receivedQuestionsCount.textContent = count ? `미답변 ${count}건` : '';
});

function showDrafts(items, original) {
  draftSource = original;
  rawPreview.textContent = original;
  pendingSave = undefined;
  drafts.replaceChildren();
  for (const item of items) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.dataset.sourceText = item.source_text ?? original;
    if (item.relation === 'differs') {
      const relation = document.createElement('p');
      relation.className = 'item-status warning';
      relation.textContent = '설명서와 달라요 · 저장할 때 다시 비교합니다.';
      row.prepend(relation);
    }
    row.querySelector('[name=text]').value = item.text;
    row.querySelector('[name=importance]').value = item.importance ?? 'medium';
    const category = row.querySelector('[name=category]');
    category.add(new Option('카테고리 선택', ''));
    for (const name of categories) category.add(new Option(name, name));
    category.value = item.category ?? '';
    row.querySelector('.remove-draft').addEventListener('click', () => {
      row.remove();
      review.hidden = !drafts.children.length;
      if (review.hidden) goTo('record-input');
    });
    drafts.append(row);
  }
  review.hidden = false;
  goTo('review-title');
  document.querySelector('#review-title').focus({ preventScroll: true });
}

function surveyRow(item) {
  const row = document.createElement('li');
  const content = document.createElement('strong');
  content.textContent = item.text;
  const label = document.createElement('span');
  label.className = 'card-help';
  label.textContent = item.label ?? item.category;
  row.append(content, label);
  return row;
}

async function refreshManual() {
  const id = ++manualRequest;
  try {
    const result = await request('/api/c/manual');
    if (id !== manualRequest) return;
    const signature = JSON.stringify(result);
    if (signature === manualSignature) {
      manualState.hidden = result.items.length > 0;
      return;
    }
    manualSignature = signature;
    const top = result.items.slice(0, 3);
    const used = new Set(top.map((item) => item.id));
    manualCount.textContent = top.length ? String(top.length) : '';
    manualItems.replaceChildren(...top.map(surveyRow));
    manualItems.hidden = !top.length;
    manualState.hidden = result.items.length > 0;
    manualState.textContent = '아직 확인한 설명서 항목이 없어요.';
    const latest = Math.max(...result.items.map((item) => Date.parse(item.last_updated)).filter(Number.isFinite));
    manualDate.hidden = !Number.isFinite(latest);
    if (!manualDate.hidden) {
      manualDate.textContent = result.source === 'questionnaire'
        ? `✓ 설문 응답 · ${surveyDate.format(latest)}`
        : `✓ 확인된 설명서 · ${surveyDate.format(latest)}`;
    }
    manualTips.replaceChildren();
    for (const [label, category, topic] of [['말할 때', '소통', 'communication'], ['힘들 때', '정서·행동', 'distress']]) {
      const item = result.items.find((answer) => result.source === 'questionnaire'
        ? answer.topic === topic : answer.category === category);
      if (!item) continue;
      used.add(item.id);
      const tip = document.createElement('article');
      tip.className = 'panel situation-card';
      const heading = document.createElement('h3');
      heading.textContent = label;
      const content = document.createElement('p');
      content.textContent = item.text;
      tip.append(heading, content);
      manualTips.append(tip);
    }
    manualSituations.hidden = !manualTips.childElementCount;
    const extra = result.items.filter((item) => !used.has(item.id));
    manualExtraItems.replaceChildren(...extra.map(surveyRow));
    manualExtra.hidden = !extra.length;
  } catch (error) {
    if (id !== manualRequest) return;
    manualState.hidden = false;
    manualState.textContent = error.message;
  }
}

function renderAssignments() {
  assignedList.replaceChildren();
  for (const option of demoRecipient.options) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'panel assignment-card';
    card.disabled = busy;
    const label = document.createElement('strong');
    label.textContent = option.textContent;
    const indicator = document.createElement('span');
    indicator.className = 'assignment-arrow';
    indicator.textContent = '›';
    indicator.setAttribute('aria-hidden', 'true');
    card.append(label, indicator);
    card.addEventListener('click', () => {
      demoRecipient.value = option.value;
      updateView();
      goTo('home');
    });
    assignedList.append(card);
  }
}

async function refreshCandidates() {
  const result = await request('/api/c/demo-candidates');
  candidatesEmpty.hidden = result.items.length > 0;
  candidates.replaceChildren(...result.items.map((item) => {
    const row = document.createElement('li');
    const category = document.createElement('span');
    category.className = 'item-meta';
    category.textContent = `${item.source === 'caregiver' ? '종사자' : '보호자'} · ${item.category}`;
    const content = document.createElement('p');
    content.textContent = item.text;
    row.append(category, content);
    return row;
  }));
}

async function loadRole() {
  setInputBusy(true);
  const caregiver = roleValue() === 'caregiver';
  demoGuardianPanel.hidden = caregiver;
  const minjun = (caregiver ? demoRecipient.value : demoGuardian.value) === 'guardian';
  homeTitle.textContent = minjun ? '민준이 돌봄 설명서' : '돌봄 설명서';
  heroContext.textContent = minjun ? '24세 남 · 172cm · 65kg'
    : caregiver ? demoRecipient.selectedOptions[0].textContent : `${demoGuardian.selectedOptions[0].textContent} 보호자`;
  accountContinue.textContent = caregiver ? '배정 대상 보기' : '보호자 홈으로';
  contextTab.href = caregiver ? '#saved-title' : '#common-questions';
  contextTabLabel.textContent = caregiver ? '돌봄 일지' : '아이 맡기기';
  writeBack.href = caregiver ? '#saved-title' : '#home';
  saveRecord.textContent = caregiver ? '돌봄 일지에 저장' : '설명서 후보로 저장';
  recordsPageTitle.textContent = caregiver ? '돌봄 일지' : '내가 남긴 기록';
  const contextLabel = caregiver ? demoRecipient.selectedOptions[0].textContent : `${demoGuardian.selectedOptions[0].textContent} 보호자`;
  recordsContext.textContent = manualContext.textContent = questionsContext.textContent = contextLabel;
  manualPerson.textContent = minjun ? '민준이를 소개해요' : '돌봄 대상을 소개해요';
  renderAssignments();
  manualRequest += 1;
  manualSignature = undefined;
  manualItems.hidden = manualSituations.hidden = manualExtra.hidden = manualDate.hidden = true;
  manualCount.textContent = '';
  manualState.hidden = false;
  manualState.textContent = '불러오는 중…';
  source.value = '';
  clearVoicePreview();
  question.value = '';
  feedback.textContent = '';
  answer.textContent = '';
  review.hidden = true;
  ask.hidden = true;
  candidatePanel.hidden = true;
  recordsEmpty.hidden = true;
  questions.hide();
  records.replaceChildren();
  candidates.replaceChildren();
  citations.replaceChildren();
  drafts.replaceChildren();
  updateProfile();
  showScreen();
  try {
    const result = await request('/api/c/records');
    categories = result.categories;
    target = result.care_recipient_id;
    recordsTitle.textContent = result.role === 'caregiver' ? '종사자 저장 기록' : '보호자 저장 기록';
    records.replaceChildren(...result.items.map(recordRow));
    recordsEmpty.hidden = result.items.length > 0;
    ask.hidden = false;
    if (result.role === 'guardian') {
      const params = new URLSearchParams({ role: 'caregiver', guardian: demoGuardian.value, recipient: demoGuardian.value });
      caregiverRecordLink.href = `/c-demo?${params}#saved-title`;
      await refreshCandidates();
      candidatePanel.hidden = false;
    }
    await Promise.all([questions.load(result.role, target), refreshManual()]);
    setInputBusy(false);
  } catch (error) {
    feedback.textContent = error.message;
    demoRole.disabled = false;
    demoGuardian.disabled = false;
    demoRecipient.disabled = false;
  }
}

function syncAccountUrl() {
  const url = new URL(location.href);
  url.searchParams.set('role', roleValue());
  url.searchParams.set('guardian', demoGuardian.value);
  url.searchParams.set('recipient', demoRecipient.value);
  history.replaceState(null, '', url);
}

function profilePreference(field) {
  return `dolbom.c-demo.${selectedAccount()}.${field}`;
}

function updateProfile() {
  const caregiver = roleValue() === 'caregiver';
  const guardianName = demoGuardian.selectedOptions[0].textContent;
  const firstGuardian = demoGuardian.value === 'guardian';
  profileRole.textContent = caregiver ? '종사자 · 시연' : `보호자 · ${guardianName}`;
  profileName.textContent = caregiver ? '시연 종사자'
    : localStorage.getItem(profilePreference('name')) || (firstGuardian ? '김민준' : '시연 돌봄 대상');
  profileDetails.textContent = caregiver ? demoRecipient.selectedOptions[0].textContent
    : firstGuardian ? '24세 · 남 · 172cm · 65kg' : `${guardianName} 보호자의 돌봄 대상`;
  profileAvatar.dataset.color = localStorage.getItem(profilePreference('avatar')) ?? 'cream';
}

document.querySelector('#profile-edit').addEventListener('click', () => {
  profileNameInput.value = profileName.textContent;
  profileNameDialog.returnValue = '';
  profileNameDialog.showModal();
  profileNameInput.select();
});
profileNameDialog.addEventListener('close', () => {
  const name = profileNameInput.value.trim();
  if (profileNameDialog.returnValue !== 'save' || !name) return;
  localStorage.setItem(profilePreference('name'), name);
  updateProfile();
});

document.querySelector('#profile-avatar-edit').addEventListener('click', () => {
  for (const color of profileAvatarDialog.querySelectorAll('input')) {
    color.checked = color.value === profileAvatar.dataset.color;
  }
  profileAvatarDialog.returnValue = '';
  profileAvatarDialog.showModal();
});
profileAvatarDialog.addEventListener('close', () => {
  if (profileAvatarDialog.returnValue !== 'save') return;
  const color = profileAvatarDialog.querySelector('input:checked')?.value;
  if (!color) return;
  localStorage.setItem(profilePreference('avatar'), color);
  updateProfile();
});

const largeTextKey = 'dolbom.c-demo.large-text';
profileLarge.checked = localStorage.getItem(largeTextKey) === 'true';
document.documentElement.classList.toggle('large-text', profileLarge.checked);
profileLarge.addEventListener('change', () => {
  localStorage.setItem(largeTextKey, String(profileLarge.checked));
  document.documentElement.classList.toggle('large-text', profileLarge.checked);
});

document.querySelector('#profile-install').addEventListener('click', () => {
  document.querySelector('#profile-install-dialog').showModal();
});

document.querySelector('#profile-export').addEventListener('click', async (event) => {
  if (busy) return;
  const button = event.currentTarget;
  button.disabled = true;
  setInputBusy(true);
  try {
    const [recordData, questionData] = await Promise.all([
      request('/api/c/records'), request('/api/c/questions'),
    ]);
    const backup = { records: recordData.items, questions: questionData.items };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const download = document.createElement('a');
    download.href = url;
    download.download = 'dolbom-c-demo-backup.json';
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
    setInputBusy(false);
  }
});

function updateView() {
  syncAccountUrl();
  void loadRole();
}
demoRole.addEventListener('change', () => {
  if (roleValue() === 'caregiver') demoRecipient.value = demoGuardian.value;
  updateView();
});
demoGuardian.addEventListener('change', () => {
  updateView();
});
accountContinue.addEventListener('click', () => {
  sessionStorage.setItem(sessionKey, selectedAccount());
  syncAccountUrl();
  goTo(roleValue() === 'caregiver' ? 'assigned' : 'home');
});

function leaveApp(logout) {
  if (busy) return;
  sessionStorage.removeItem(sessionKey);
  if (logout) {
    demoRole.querySelector('[value=guardian]').checked = true;
    demoGuardian.value = 'guardian';
    demoRecipient.value = 'guardian';
  }
  syncAccountUrl();
  goTo('start');
  void loadRole();
}
document.querySelector('#profile-switch').addEventListener('click', () => leaveApp(false));
document.querySelector('#profile-logout').addEventListener('click', () => leaveApp(true));
shell.addEventListener('click', (event) => {
  if (event.target.closest('a[href^="#"]')) feedback.textContent = '';
});
function refreshReceivedQuestions() {
  if (roleValue() !== 'caregiver') return;
  if (shell.dataset.page === 'home' || location.hash === '#common-questions') void questions.refresh();
}
window.addEventListener('hashchange', () => {
  showScreen();
  refreshReceivedQuestions();
  if (!busy && shell.dataset.page === 'manual') void refreshManual();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && shell.dataset.page === 'home') refreshReceivedQuestions();
  if (!document.hidden && !busy && shell.dataset.page === 'manual') void refreshManual();
});
window.addEventListener('pagehide', clearVoicePreview);
setInterval(() => {
  if (!document.hidden && !busy && shell.dataset.page === 'manual') void refreshManual();
}, 5000);
showScreen();
await loadRole();
showScreen();

input.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !source.value.trim()) return;
  const text = source.value;
  setInputBusy(true);
  review.hidden = true;
  try {
    const proposals = await request('/api/ai/structure', { text, care_recipient_id: target });
    showDrafts(proposals.length ? proposals : [{ text }], text);
    feedback.textContent = proposals.length
      ? '원문과 대조해 문장과 분류를 확인해 주세요.'
      : '분류 제안이 없습니다. 카테고리를 직접 골라 주세요.';
  } catch {
    showDrafts([{ text }], text);
    feedback.textContent = '정리 요청이 실패했습니다. 카테고리를 직접 골라 저장할 수 있어요.';
  } finally {
    setInputBusy(false);
  }
});

manualButton.addEventListener('click', () => {
  if (busy || !input.reportValidity() || !source.value.trim()) return;
  showDrafts([{ text: source.value }], source.value);
  feedback.textContent = '카테고리를 직접 골라 주세요.';
});

review.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const items = [...drafts.children].map((row) => ({
    text: row.querySelector('[name=text]').value,
    source_text: row.dataset.sourceText,
    category: row.querySelector('[name=category]').value,
    importance: row.querySelector('[name=importance]').value,
  }));
  const body = { care_recipient_id: target, source_text: draftSource, items };
  const payload = JSON.stringify(body);
  if (pendingSave?.payload !== payload) pendingSave = { payload, key: crypto.randomUUID() };
  const saveButton = review.querySelector('[type=submit]');
  drafts.disabled = true;
  saveButton.disabled = true;
  setInputBusy(true);
  try {
    const saved = await request('/api/c/records', body, pendingSave.key);
    pendingSave = undefined;
    records.prepend(...saved.items.map(recordRow));
    recordsEmpty.hidden = true;
    source.value = '';
    drafts.replaceChildren();
    review.hidden = true;
    feedback.textContent = `${saved.items.length}개 기록을 저장했어요.`;
    if (roleValue() === 'guardian') {
      await refreshCandidates().catch(() => {
        feedback.textContent = '기록을 저장했어요. 후보 목록을 보려면 화면을 새로고침해 주세요.';
      });
    }
    goTo(roleValue() === 'guardian' ? 'candidate-title' : 'saved-title');
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    drafts.disabled = false;
    saveButton.disabled = false;
    setInputBusy(false);
  }
});

ask.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const askButton = ask.querySelector('button');
  askButton.disabled = true;
  setInputBusy(true);
  voiceAnswer.hidden = false;
  answer.textContent = '설문 응답에서 답을 찾고 있어요.';
  citations.replaceChildren();
  try {
    const result = await request('/api/ai/ask', { care_recipient_id: target, question: question.value });
    answer.textContent = result.answer;
    for (const evidence of result.citations ?? []) {
      const row = document.createElement('li');
      const date = evidence.last_updated ? ` · ${evidence.last_updated.slice(0, 10)}` : '';
      row.textContent = `근거 · ${evidence.category}${date}`;
      citations.append(row);
    }
  } catch (error) {
    answer.textContent = error.message;
  } finally {
    askButton.disabled = false;
    setInputBusy(false);
  }
});

