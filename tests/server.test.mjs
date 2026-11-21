import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';
import { createCareRecords } from '../apps/api/src/c-records.mjs';
import { createCareQuestions } from '../apps/api/src/c-questions.mjs';
import { createQuestionnaireReader } from '../apps/api/src/c-questionnaire-source.mjs';
import { createTranscriber } from '../apps/api/src/c-transcription.mjs';
import { createVoiceCapture } from '../apps/web/public/c-demo-voice.js';

async function startServer(context, options) {
  const server = createApp(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('health returns only the documented public status fields', async (context) => {
  const base = await startServer(context);
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  const schema = JSON.parse(await readFile(new URL('../packages/contracts/health.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(body).sort(), schema.required.toSorted());
  for (const [key, definition] of Object.entries(schema.properties)) {
    assert.equal(body[key], definition.const);
  }
});

test('the Korean web shell and its linked assets are served', async (context) => {
  const base = await startServer(context);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /돌봄 바통/);
  const paths = [...html.matchAll(/(?:src|href)="(\/[^\"]+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  for (const path of paths) {
    const asset = await fetch(`${base}${path}`);
    assert.equal(asset.status, 200);
    assert.ok((await asset.text()).length > 0);
  }
});

test('unlisted routes cannot expose repository or environment files', async (context) => {
  const base = await startServer(context);
  for (const path of ['/api/records', '/.env', '/package.json', '/AGENTS.md', '/%2e%2e/package.json']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
});

test('write requests are rejected without accepting care records', async (context) => {
  const base = await startServer(context);
  const response = await fetch(`${base}/api/health`, {
    method: 'POST',
    body: JSON.stringify({ synthetic: true }),
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});

test('record demo is unavailable by default', async (context) => {
  const base = await startServer(context);
  for (const path of ['/c-demo', '/api/c/records', '/api/c/questions']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});

test('C demo serves its design assets and navigation', async (context) => {
  const base = await startServer(context, { recordDemo: true });
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  const directPage = await fetch(base + '/c-demo');
  assert.equal(directPage.status, 200);
  assert.equal(await directPage.text(), html);
  assert.match(html, /<nav class="bottom-nav"/);
  assert.match(html, /id="demo-guardian-panel"/);
  assert.match(html, /id="assigned-list"/);
  assert.match(html, /id="review-title"/);
  assert.match(html, /id="received-questions-link"[^>]+href="#common-questions"/);
  assert.doesNotMatch(html, /<dialog id="account-confirm"/);
  assert.match(html, /id="home-mic"/);
  assert.match(html, /id="profile-logout"/);
  for (const [path, contentType] of [
    ['/c-demo.css', 'text/css'],
    ['/c-mascot.png', 'image/png'],
    ['/c-pretendard-1.3.9.woff2', 'font/woff2'],
  ]) {
    const asset = await fetch(base + path);
    assert.equal(asset.status, 200);
    assert.ok(asset.headers.get('content-type').startsWith(contentType));
    assert.ok((await asset.arrayBuffer()).byteLength > 0);
  }
});

test('voice sends supported audio as server-side transcription and rejects cross-origin calls', async (context) => {
  let unreadable = false;
  const transcribeAudio = createTranscriber({
    apiKey: 'test-key',
    async fetcher(url, options) {
      assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.equal(options.body.get('model'), 'gpt-transcribe');
      assert.equal(options.body.get('file').name, 'recording.webm');
      if (unreadable) {
        return Response.json({ error: { param: 'file', message: 'unreadable audio' } }, { status: 400 });
      }
      return Response.json({ text: '식사는 어떻게 하나요?' });
    },
  });
  const base = await startServer(context, { recordDemo: true, transcribeAudio });
  const send = (headers = {}) => fetch(base + '/api/ai/transcribe', {
    method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus', ...headers }, body: 'audio-bytes',
  });
  assert.equal((await send({ Origin: 'https://another.example' })).status, 403);
  assert.equal((await send({ 'Content-Type': 'application/json' })).status, 415);
  const response = await send();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: '식사는 어떻게 하나요?' });
  unreadable = true;
  const failure = await send();
  assert.equal(failure.status, 422);
  assert.match((await failure.json()).error, /녹음 파일을 읽을 수 없어요/);
});

test('voice capture stops the microphone before transcribing, then passes the original audio and text to review', async (context) => {
  let trackStopped = false;
  const stream = { getTracks: () => [{ stop() { trackStopped = true; } }] };
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalRecorder = globalThis.MediaRecorder;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true, value: { async getUserMedia() { return stream; } },
  });
  globalThis.MediaRecorder = class extends EventTarget {
    static isTypeSupported() { return true; }
    mimeType = 'audio/webm;codecs=opus';
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob(['sample audio']) }));
      this.dispatchEvent(new Event('stop'));
    }
  };
  context.after(() => {
    globalThis.MediaRecorder = originalRecorder;
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else delete navigator.mediaDevices;
  });
  const button = Object.assign(new EventTarget(), { dataset: {}, setAttribute() {}, querySelector: () => ({ setAttribute() {} }) });
  const status = { textContent: '' };
  const reviewed = new Promise((resolve) => {
    createVoiceCapture({
      button,
      status,
      async transcribe(audio) {
        assert.equal(trackStopped, true);
        assert.equal(audio.type, 'audio/webm;codecs=opus');
        assert.equal(await audio.text(), 'sample audio');
        return '식사는 어떻게 하나요?';
      },
      onTranscript: resolve,
    });
  });
  button.dispatchEvent(new Event('click'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button.dataset.state, 'recording');
  button.dispatchEvent(new Event('click'));
  const result = await reviewed;
  assert.equal(result.text, '식사는 어떻게 하나요?');
  assert.equal(result.seconds, 1);
  assert.equal(button.dataset.state, 'idle');
});

test('card and voice query read completed scoped Supabase survey answers without falling back to demo rows', async (context) => {
  let count = 0;
  const readQuestionnaire = createQuestionnaireReader({
    url: 'https://project.example',
    key: 'published-demo',
    async fetcher(url, options) {
      count += 1;
      assert.equal(url.pathname, '/rest/v1/questionnaire_answer');
      assert.equal(url.searchParams.get('care_recipient_id'), 'eq.00000000-0000-4000-8000-0000000000a1');
      assert.equal(url.searchParams.get('status'), 'eq.completed');
      assert.equal(options.headers['Accept-Profile'], 'dolbom_demo');
      assert.equal(options.cache, 'no-store');
      assert.match(url.searchParams.get('select'), /questionnaire_answer_option/);
      const row = (category, section, text) => ({
        answer_id: randomUUID(), created_at: '2026-11-21T00:00:00Z', answer_text: '',
        questionnaire_question: { question_id: category, category, section, question_text: '시연 질문' },
        questionnaire_answer_option: [{
          questionnaire_option: { question_id: category, option_text: text, display_order: 1 },
        }],
      });
      return Response.json([row('meal', 'daily', '밥과 반찬을 따로 담아요.'), row('hygiene', 'daily', '그림으로 순서를 알려 줘요.')]);
    },
  });
  const base = await startServer(context, { recordDemo: true, readQuestionnaire });
  const manual = async (role) => (await fetch(base + '/api/c/manual', { headers: { 'X-C-Demo-Role': role } })).json();
  const guardian = await manual('guardian');
  assert.equal(guardian.source, 'questionnaire');
  assert.deepEqual(guardian.items.map(({ category }) => category), ['식사', '위생']);
  const caregiver = await manual('caregiver');
  assert.deepEqual(caregiver.items.map(({ category }) => category), ['식사']);
  assert.deepEqual((await manual('guardian-2')).items, []);
  const answer = await fetch(base + '/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '식사는 어떻게 하나요?' }),
  });
  assert.equal((await answer.json()).answer, '밥과 반찬을 따로 담아요.');
  assert.equal(count, 3);
});

test('one guardian question collects an independent reply from each active caregiver', async (context) => {
  const recipient = randomUUID();
  const sessions = Object.fromEntries([
    ['guardian', 'guardian'],
    ['other-guardian', 'guardian'],
    ['kim', 'caregiver'],
    ['lee', 'caregiver'],
    ['unassigned', 'caregiver'],
  ].map(([key, role]) => [key, { user_id: randomUUID(), role, care_recipient_id: recipient }]));
  const active = {
    care_recipient_id: recipient, status: 'active',
    starts_at: '2026-11-21T00:00:00Z', ends_at: '2026-11-22T00:00:00Z',
  };
  const kim = { ...active, id: randomUUID(), caregiver_user_id: sessions.kim.user_id, caregiver_name: '시연 종사자 1' };
  const lee = { ...active, id: randomUUID(), caregiver_user_id: sessions.lee.user_id, caregiver_name: '시연 종사자 2' };
  const expired = {
    ...active, id: randomUUID(), caregiver_user_id: sessions.unassigned.user_id,
    caregiver_name: '다른 종사자', ends_at: '2026-11-21T11:59:00Z',
  };
  const careQuestions = createCareQuestions({
    getSession: (request) => sessions[request.headers['x-test-role']],
    listAssignments: () => [kim, lee, { ...kim, id: randomUUID() }, expired],
    now: () => Date.parse('2026-11-21T12:00:00Z'),
  });
  const base = await startServer(context, { careQuestions });
  const key = randomUUID();
  const post = (path, role, body) => fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Role': role, 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
  const list = async (role) => (await fetch(base + '/api/c/questions', { headers: { 'X-Test-Role': role } })).json();
  const text = '오늘 점심을 어떻게 먹었나요?';
  const send = (role, question = text, target = recipient) => post('/api/c/questions', role, {
    text: question, care_recipient_id: target, caregiver_ids: [sessions.unassigned.user_id],
  });

  assert.equal((await send('kim')).status, 403);
  assert.equal((await send('guardian', text, randomUUID())).status, 403);
  const first = await send('guardian');
  assert.equal(first.status, 201);
  const { item } = await first.json();
  assert.deepEqual(item.replies.map(({ caregiver_name, text: answer }) => [caregiver_name, answer]), [
    ['시연 종사자 1', null], ['시연 종사자 2', null],
  ]);
  const resend = await send('guardian');
  assert.equal(resend.status, 200);
  assert.equal((await resend.json()).item.id, item.id);
  assert.equal((await send('guardian', '다른 질문')).status, 409);
  assert.deepEqual((await list('unassigned')).items, []);
  assert.deepEqual((await list('other-guardian')).items, []);
  assert.equal((await list('kim')).items[0].text, text);
  assert.equal((await list('lee')).items[0].text, text);

  const answer = (role, content) => post('/api/c/question-replies', role, {
    text: content, question_id: item.id, care_recipient_id: recipient, caregiver_user_id: sessions.lee.user_id,
  });
  assert.equal((await answer('guardian', '권한 없음')).status, 403);
  assert.equal((await answer('unassigned', '배정 만료')).status, 403);
  const kimReply = '밥을 반 공기 먹었어요.';
  const leeReply = '반찬은 따로 담았어요.';
  const results = await Promise.all([answer('kim', kimReply), answer('lee', leeReply)]);
  assert.deepEqual(results.map(({ status }) => status), [201, 201]);
  assert.equal((await answer('kim', kimReply)).status, 200);
  assert.equal((await answer('kim', '다른 답변')).status, 409);
  const leeView = (await list('lee')).items[0];
  assert.equal(leeView.reply.text, leeReply);
  assert.equal(Object.hasOwn(leeView, 'replies'), false);
  assert.deepEqual((await list('guardian')).items[0].replies.map(({ caregiver_name, text: answer }) =>
    [caregiver_name, answer]), [['시연 종사자 1', kimReply], ['시연 종사자 2', leeReply]]);
});

test('demo guardians keep separate questions and candidates while caregivers select their assignment', async (context) => {
  const base = await startServer(context, { recordDemo: true });
  const request = (path, role, recipient, data) => fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(),
      'X-C-Demo-Role': role, 'X-C-Demo-Recipient': recipient,
    },
    body: data && JSON.stringify(data),
  });
  const list = async (path, role, recipient = role) =>
    (await request(path, role, recipient)).json();
  const first = await list('/api/c/records', 'guardian');
  const second = await list('/api/c/records', 'guardian-2');
  assert.equal(second.role, 'guardian');
  assert.notEqual(first.care_recipient_id, second.care_recipient_id);
  const text = '한 번 쉬고 나서 산책했어요.';
  const created = await request('/api/c/records', 'guardian-2', 'guardian', {
    care_recipient_id: second.care_recipient_id, source_text: text,
    items: [{ text, category: '일과', importance: 'medium' }],
  });
  assert.equal(created.status, 201);
  assert.deepEqual((await list('/api/c/demo-candidates', 'guardian')).items, []);
  assert.equal((await list('/api/c/demo-candidates', 'guardian-2')).items[0].text, text);

  const sent = await request('/api/c/questions', 'guardian-2', 'guardian', {
    care_recipient_id: second.care_recipient_id, text: '산책은 몇 시에 갔나요?',
  });
  assert.equal(sent.status, 201);
  assert.equal((await sent.json()).item.replies.length, 1);
  assert.deepEqual((await list('/api/c/questions', 'guardian')).items, []);
  assert.deepEqual((await list('/api/c/questions', 'caregiver', 'guardian')).items, []);
  assert.equal((await list('/api/c/questions', 'caregiver', 'guardian-2')).items.length, 1);
});

test('record demo proposes categories from the input without storing drafts', async (context) => {
  const base = await startServer(context, { recordDemo: true });
  const post = (text) => fetch(base + '/api/ai/structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const original = ['청소기 소리가 나면 귀를 막아요', '작은 방에서 기차 영상을 보여 주면 괜찮아져요'];
  const response = await post(original.join('. '));
  assert.equal(response.status, 200);
  const suggestions = await response.json();
  assert.deepEqual(suggestions.map((item) => item.text), original);
  assert.deepEqual(suggestions.map((item) => item.category), ['정서·행동', '정서·행동']);
  const meals = await (await post('밥과 반찬을 따로 먹었어요')).json();
  assert.equal(meals[0].category, '식사');
  assert.deepEqual(await (await post('')).json(), []);
  assert.deepEqual(await (await post('잘 지냈어요. 밥을 먹었어요')).json(), []);
  const list = await (await fetch(base + '/api/c/records')).json();
  assert.deepEqual(list.items, []);
  assert.equal(list.categories.length, 7);
});

test('confirmed records enforce the data contract and support safe retries', async (context) => {
  const base = await startServer(context, { recordDemo: true });
  const key = randomUUID();
  const save = (items) => fetch(base + '/api/c/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ items, source_text: '물을 조금 마셨어요. 새 기록' }),
  });
  const valid = { text: '물을 조금 마셨어요', category: '식사', importance: 'medium' };
  assert.equal((await save([valid, { ...valid, category: '공유되지 않은 카테고리' }])).status, 400);

  const created = await save([{ ...valid, author: '종사자', author_user_id: 'forged' }]);
  assert.equal(created.status, 201);
  const original = await created.json();
  const retry = await save([valid]);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), original);
  assert.equal((await save([{ ...valid, text: '새 기록' }])).status, 409);
  const list = await (await fetch(base + '/api/c/records')).json();
  assert.deepEqual(list.items, original.items);
  assert.equal(list.items[0].author, '보호자');
  assert.notEqual(list.items[0].author_user_id, 'forged');
});

test('connected C routes enforce the A session and D assignment and hand candidates to B', async (context) => {
  const recipient = randomUUID();
  const otherRecipient = randomUUID();
  const guardian = { user_id: randomUUID(), role: 'guardian', care_recipient_id: recipient };
  const caregiver = { user_id: randomUUID(), role: 'caregiver', care_recipient_id: recipient };
  const dryer = { id: randomUUID(), care_recipient_id: recipient, status: 'confirmed', category: '정서·행동', text: '드라이기 소리를 싫어해요.' };
  const comfort = { ...dryer, id: randomUUID(), text: '작은 방에서 기차 영상을 보여 주면 괜찮아져요.', last_updated: '2026-11-17T10:00:00+09:00' };
  const manual = [
    dryer,
    comfort,
    { ...comfort, id: randomUUID(), category: '위생', text: '씻기 전에 순서를 알려 주세요.' },
    { ...comfort, id: randomUUID(), status: 'candidate', category: '일과', text: '밤에 깨면 불을 켜요.' },
    { ...comfort, id: randomUUID(), care_recipient_id: otherRecipient, category: '일과', text: '밤에 깨면 물을 마셔요.' },
  ];
  const candidates = new Map();
  const assignment = {
    id: randomUUID(), status: 'active', care_recipient_id: recipient, caregiver_user_id: caregiver.user_id,
    starts_at: '2026-11-21T00:00:00Z', ends_at: '2026-11-22T00:00:00Z',
    shared_categories: ['정서·행동', '일과'],
  };
  let timestamp = Date.parse('2026-11-21T12:00:00Z');
  let failOnce = true;
  const careRecords = createCareRecords({
    getSession: (request) => ({ guardian, caregiver })[request.headers['x-test-role']],
    getAssignment: () => assignment,
    listConfirmedItems: () => manual,
    createManualCandidates(_session, items) {
      for (const item of items) if (!candidates.has(item.id)) candidates.set(item.id, item);
      if (failOnce) {
        failOnce = false;
        throw new Error('response lost');
      }
    },
    now: () => timestamp,
  });
  const base = await startServer(context, { careRecords });
  const post = (path, role, data, key = randomUUID()) => fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Role': role, 'Idempotency-Key': key },
    body: JSON.stringify({ care_recipient_id: recipient, ...data }),
  });
  const ask = (question, data) => post('/api/ai/ask', 'caregiver', { question, ...data });
  const saveInput = (text, data) => ({
    source_text: text, items: [{ text, category: '정서·행동', importance: 'medium', ...data }],
  });

  assert.equal((await post('/api/ai/structure', '', { text: '밥을 먹었어요' })).status, 401);
  assert.equal((await ask('힘들어할 때 뭐가 도움이 돼요?', { care_recipient_id: otherRecipient })).status, 403);
  const answered = await (await ask('힘들어할 때 뭐가 도움이 돼요?')).json();
  assert.equal(answered.answer, comfort.text);
  assert.deepEqual(answered.cited_item_ids, [comfort.id]);
  assert.equal(answered.citations[0].last_updated, comfort.last_updated);
  const getManual = (role, target = recipient) => fetch(base + '/api/c/manual?care_recipient_id=' + target, {
    headers: { 'X-Test-Role': role },
  });
  const guardianManual = await (await getManual('guardian')).json();
  assert.deepEqual(guardianManual.items.map(({ category }) => category), ['정서·행동', '정서·행동', '위생']);
  const caregiverManual = await (await getManual('caregiver')).json();
  assert.deepEqual(caregiverManual.items.map(({ id }) => id), [dryer.id, comfort.id]);
  assert.equal((await getManual('caregiver', otherRecipient)).status, 403);
  for (const question of ['씻기 전에 어떻게 해요?', '밤에 깨면 어떻게 해요?', '약을 더 먹여도 돼요?']) {
    const result = await (await ask(question)).json();
    assert.equal(result.result, 'no_record');
    assert.deepEqual(result.cited_item_ids, []);
  }

  const guardianInput = saveInput('청소기 소리에 귀를 막아요.', { text: '청소기 소리가 나면 귀를 막아요.' });
  const guardianKey = randomUUID();
  assert.equal((await post('/api/c/records', 'guardian', guardianInput, guardianKey)).status, 503);
  const failedCandidateId = [...candidates.keys()][0];
  const confirmed = await post('/api/c/records', 'guardian', guardianInput, guardianKey);
  assert.equal(confirmed.status, 200);
  const guardianRecord = (await confirmed.json()).items[0];
  assert.equal(guardianRecord.id, failedCandidateId);
  assert.equal(candidates.size, 1);
  assert.equal(candidates.get(guardianRecord.id).status, 'candidate');
  assert.equal(candidates.get(guardianRecord.id).source_text, guardianInput.source_text);

  const caregiverInput = saveInput('드라이기를 약하게 트니 괜찮았어요.', {
    assignment_id: 'forged', related_manual_item_id: 'forged', relation: 'same',
  });
  const proposals = await (await post('/api/ai/structure', 'caregiver', { text: caregiverInput.source_text })).json();
  assert.equal(proposals[0].relation, 'differs');
  const caregiverSave = await post('/api/c/records', 'caregiver', caregiverInput);
  assert.equal(caregiverSave.status, 201);
  const observed = (await caregiverSave.json()).items[0];
  assert.equal(observed.assignment_id, assignment.id);
  assert.equal(observed.relation, 'differs');
  assert.equal(observed.related_manual_item_id, dryer.id);
  assert.equal(candidates.size, 1);

  const handback = { record_id: observed.id };
  assert.equal((await post('/api/c/handbacks', 'guardian', handback)).status, 403);
  const sent = await Promise.all([post('/api/c/handbacks', 'caregiver', handback), post('/api/c/handbacks', 'caregiver', handback)]);
  assert.deepEqual(sent.map((response) => response.status), [200, 200]);
  assert.equal(candidates.size, 2);
  const candidate = candidates.get(observed.id);
  assert.equal(candidate.source, 'caregiver');
  assert.equal(candidate.source_record_id, observed.id);
  assert.equal(candidate.replaces_item_id, dryer.id);
  assert.equal(candidate.setting, 'center');
  assert.equal(candidate.status, 'candidate');
  const guardianList = await fetch(base + '/api/c/records', { headers: { 'X-Test-Role': 'guardian' } });
  assert.deepEqual((await guardianList.json()).items.map(({ id }) => id), [guardianRecord.id]);

  timestamp = Date.parse('2026-11-22T00:00:01Z');
  assert.equal((await getManual('caregiver')).status, 403);
  assert.equal((await ask('힘들어할 때 뭐가 도움이 돼요?')).status, 403);
  assert.equal((await post('/api/c/records', 'caregiver', caregiverInput)).status, 403);
  assert.equal((await post('/api/c/handbacks', 'caregiver', handback)).status, 403);
});
