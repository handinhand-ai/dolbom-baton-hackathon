import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../apps/web/public/a/api.js';

test('profile client saves and loads cloud onboarding data', async (context) => {
  assert.equal(typeof api.saveProfile, 'function', 'saveProfile export is required');
  assert.equal(typeof api.getProfile, 'function', 'getProfile export is required');
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (path, options = {}) => {
    requests.push({ path, options });
    return new Response(JSON.stringify({ data: { care_recipient_id: 'recipient-1', photo: 'data:image/jpeg;base64,AAAA' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  context.after(() => { globalThis.fetch = original; });

  const saved = await api.saveProfile({ photo: 'data:image/jpeg;base64,AAAA' });
  const loaded = await api.getProfile();

  assert.equal(saved.care_recipient_id, 'recipient-1');
  assert.equal(loaded.photo, 'data:image/jpeg;base64,AAAA');
  assert.deepEqual(requests.map(({ path, options }) => [path, options.method ?? 'GET']), [
    ['/api/auth/profile', 'PUT'],
    ['/api/auth/profile', 'GET'],
  ]);
});

test('mypage client loads sent applications and questionnaire answers', async (context) => {
  assert.equal(typeof api.getCareApplications, 'function', 'getCareApplications export is required');
  assert.equal(typeof api.getQuestionnaireAnswers, 'function', 'getQuestionnaireAnswers export is required');
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (path, options = {}) => {
    requests.push([path, options.method ?? 'GET']);
    return new Response(JSON.stringify({ data: path.includes('answers') ? [{ question_id: 'q1' }] : [{ id: 'request-1' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  context.after(() => { globalThis.fetch = original; });

  assert.equal((await api.getCareApplications())[0].id, 'request-1');
  assert.equal((await api.getQuestionnaireAnswers())[0].question_id, 'q1');
  assert.deepEqual(requests, [['/api/care/applications', 'GET'], ['/api/questionnaire/answers', 'GET']]);
});
