import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';
import { DEMO_IDS } from '../apps/api/src/care/demo-data.mjs';

async function startServer(context, fetchImpl) {
  const server = createApp({
    fetchImpl,
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'public-key',
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function login(base) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username: 'guardian', password: 'demo-1234' }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('questionnaire answers require a guardian session', async (context) => {
  const base = await startServer(context, async () => new Response('[]'));

  assert.equal((await fetch(`${base}/api/questionnaire/answers`)).status, 401);
  assert.equal((await fetch(`${base}/api/questionnaire/answers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ answers: [] }),
  })).status, 401);
});
test('saved answers are loaded for the care recipient from the login session', async (context) => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('questionnaire_answer_option')) {
      return new Response(JSON.stringify([
        { answer_id: '10000000-0000-4000-8000-000000000001', option_id: 'option-1' },
      ]), { status: 200 });
    }
    return new Response(JSON.stringify([
      {
        answer_id: '10000000-0000-4000-8000-000000000001',
        question_id: 'question-1',
        answer_text: '추가 설명',
        status: 'draft',
      },
    ]), { status: 200 });
  };
  const base = await startServer(context, fetchImpl);
  const cookie = await login(base);

  const response = await fetch(`${base}/api/questionnaire/answers`, { headers: { Cookie: cookie } });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: [{ question_id: 'question-1', answer_text: '추가 설명', option_ids: ['option-1'], status: 'draft' }],
  });
  assert.match(requests[0].url, new RegExp(`care_recipient_id=eq\\.${DEMO_IDS.recipient}`));
});

test('saving answers uses the care recipient from the session and replaces selected options', async (context) => {
  const requests = [];
  const answerId = '10000000-0000-4000-8000-000000000002';
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === 'POST' && String(url).includes('questionnaire_answer?')) {
      return new Response(JSON.stringify([{ answer_id: answerId, question_id: 'question-1' }]), { status: 201 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const base = await startServer(context, fetchImpl);
  const cookie = await login(base);

  const response = await fetch(`${base}/api/questionnaire/answers`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({
      care_recipient_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      answers: [{ question_id: 'question-1', answer_text: '직접 입력', option_ids: ['option-1', 'option-2'] }],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { saved: 1 } });
  const upsert = requests.find(({ url, options }) => options.method === 'POST' && url.includes('questionnaire_answer?'));
  assert.deepEqual(JSON.parse(upsert.options.body), [{
    care_recipient_id: DEMO_IDS.recipient,
    question_id: 'question-1',
    answer_text: '직접 입력',
    input_type: 'mixed',
    status: 'completed',
  }]);
  const optionInsert = requests.find(({ url, options }) => options.method === 'POST' && url.includes('questionnaire_answer_option'));
  assert.deepEqual(JSON.parse(optionInsert.options.body), [
    { answer_id: answerId, option_id: 'option-1' },
    { answer_id: answerId, option_id: 'option-2' },
  ]);
  const optionDelete = requests.find(({ url, options }) => options.method === 'DELETE' && url.includes('questionnaire_answer_option'));
  assert.equal(optionDelete.options.headers['Content-Profile'], 'dolbom_demo');
  assert.equal('Accept-Profile' in optionDelete.options.headers, false);
});

test('care share summary counts completed questionnaire answers by manual category', async (context) => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/rest/v1/questionnaire_answer?')) {
      return new Response(JSON.stringify([{
        answer_id: '10000000-0000-4000-8000-000000000003',
        answer_text: '아침에 먹어요.',
        created_at: '2026-11-21T00:00:00.000Z',
        questionnaire_question: {
          question_id: 'initial-health-safety-04',
          category: 'health_safety',
          section: 'must',
          question_text: '약은 언제, 어떻게 먹나요?',
        },
        questionnaire_answer_option: [],
      }]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const base = await startServer(context, fetchImpl);
  const cookie = await login(base);

  const response = await fetch(`${base}/api/care/share-summary?care_recipient_id=${DEMO_IDS.recipient}`, {
    headers: { Cookie: cookie },
  });

  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.find((item) => item.category === '약').confirmed_count, 1);
  assert.equal(data.find((item) => item.category === '소통').confirmed_count, 0);
});

