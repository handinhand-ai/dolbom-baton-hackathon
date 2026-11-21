import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';
import { CAREGIVER_TYPES, SignupError, normalizeLogin, validateSignup } from '../apps/api/src/auth/auth-store.mjs';
import { createCareStore } from '../apps/api/src/care/store.mjs';
import { DEMO_IDS } from '../apps/api/src/care/demo-data.mjs';
import { checkSignup } from '../apps/web/public/a/signup.js';

// 모든 값은 합성 시연 데이터입니다(가상의 이름·전화번호).
const GUARDIAN = { role: 'guardian', display_name: '가상보호자', phone: '010-0000-0001', password: 'synthetic-pass-1', agree: true };
const CAREGIVER = { role: 'caregiver', display_name: '가상선생님', phone: '01000000002', password: 'synthetic-pass-2', agree: true, center_id: DEMO_IDS.centerGn, caregiver_type: '활동지원사' };

async function startServer(context) {
  const careStore = createCareStore();
  const server = createApp({ careStore });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { cookie, method = 'GET', body, origin = base } = {}) => {
    const init = { method, headers: {} };
    if (cookie) init.headers.Cookie = cookie;
    if (method === 'POST') {
      if (origin) init.headers.Origin = origin;
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    }
    const response = await fetch(`${base}${path}`, init);
    return { status: response.status, headers: response.headers, json: await response.json() };
  };
  const cookieOf = (result) => result.headers.get('set-cookie')?.split(';')[0];
  return { call, cookieOf, careStore };
}

test('a guardian can sign up and is signed in right away', async (context) => {
  const { call, cookieOf } = await startServer(context);
  const result = await call('/api/auth/signup', { method: 'POST', body: GUARDIAN });
  assert.equal(result.status, 201);
  const cookie = cookieOf(result);
  assert.match(result.headers.get('set-cookie'), /^baton_session=[0-9a-f-]{36};.*HttpOnly.*SameSite=Strict/);
  const session = result.json.data;
  assert.equal(session.role, 'guardian');
  assert.equal(session.display_name, '가상보호자');
  assert.equal(session.care_recipient_id, null);
  assert.equal(JSON.stringify(result.json).includes(GUARDIAN.password), false);
  assert.equal(JSON.stringify(result.json).includes('0000'), false, 'the phone number is not echoed back');
  assert.deepEqual((await call('/api/auth/session', { cookie })).json.data, session);
});

test('a caregiver signs up with a center and a type, and gets those in the session', async (context) => {
  const { call } = await startServer(context);
  const result = await call('/api/auth/signup', { method: 'POST', body: CAREGIVER });
  assert.equal(result.status, 201);
  assert.equal(result.json.data.role, 'caregiver');
  assert.equal(result.json.data.center_id, DEMO_IDS.centerGn);
  assert.equal(result.json.data.caregiver_type, '활동지원사');
  assert.ok(result.json.data.center_name);
  assert.equal(result.json.data.care_recipient_id, null);
});

test('after signing up, the same phone number logs in again with or without hyphens', async (context) => {
  const { call, cookieOf } = await startServer(context);
  const signup = await call('/api/auth/signup', { method: 'POST', body: GUARDIAN });
  await call('/api/auth/logout', { method: 'POST', cookie: cookieOf(signup) });
  for (const username of ['010-0000-0001', '01000000001', ' 010 0000 0001 ']) {
    const login = await call('/api/auth/login', { method: 'POST', body: { username, password: GUARDIAN.password } });
    assert.equal(login.status, 200, username);
    assert.equal(login.json.data.user_id, signup.json.data.user_id);
  }
  const wrong = await call('/api/auth/login', { method: 'POST', body: { username: '010-0000-0001', password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
  const unknown = await call('/api/auth/login', { method: 'POST', body: { username: '010-9999-9999', password: 'wrong-password' } });
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.json, unknown.json);
});

test('signup rejects a phone number that is already registered or reserved by a demo account', async (context) => {
  const { call } = await startServer(context);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: GUARDIAN })).status, 201);
  const duplicate = await call('/api/auth/signup', { method: 'POST', body: { ...GUARDIAN, display_name: '다른이름', password: 'another-pass-99' } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.field, 'phone');
  assert.equal(duplicate.headers.get('set-cookie'), null);
});

test('signup validation names the failing field and never creates a session', async (context) => {
  const { call } = await startServer(context);
  const cases = [
    [{ ...GUARDIAN, role: 'center_admin' }, 'role'],
    [{ ...GUARDIAN, role: undefined }, 'role'],
    [{ ...GUARDIAN, display_name: '  ' }, 'display_name'],
    [{ ...GUARDIAN, display_name: '가'.repeat(21) }, 'display_name'],
    [{ ...GUARDIAN, phone: '12345' }, 'phone'],
    [{ ...GUARDIAN, phone: '02-123-4567' }, 'phone'],
    [{ ...GUARDIAN, phone: undefined }, 'phone'],
    [{ ...GUARDIAN, password: 'short' }, 'password'],
    [{ ...GUARDIAN, password: 'x'.repeat(73) }, 'password'],
    [{ ...GUARDIAN, agree: false }, 'agree'],
    [{ ...GUARDIAN, agree: 'true' }, 'agree'],
    [{ ...CAREGIVER, center_id: 'nope' }, 'center_id'],
    [{ ...CAREGIVER, center_id: undefined }, 'center_id'],
    [{ ...CAREGIVER, caregiver_type: '마법사' }, 'caregiver_type'],
  ];
  for (const [body, field] of cases) {
    const result = await call('/api/auth/signup', { method: 'POST', body });
    assert.equal(result.status, 400, field);
    assert.equal(result.json.field, field);
    assert.equal(result.headers.get('set-cookie'), null);
  }
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: 'not json' })).status, 400);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: '[]' })).status, 400);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(5000) }) })).status, 413);
});

test('signup only accepts same-origin POSTs and throttles repeated attempts', async (context) => {
  const { call } = await startServer(context);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: GUARDIAN, origin: 'https://evil.example' })).status, 403);
  const get = await call('/api/auth/signup');
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  // 입력 오류(400)는 횟수에 세지 않고, 계정을 만드는 시도가 1분에 10번을 넘으면 429입니다.
  for (let i = 0; i < 12; i += 1) assert.equal((await call('/api/auth/signup', { method: 'POST', body: { ...GUARDIAN, phone: '12345' } })).status, 400);
  const statuses = [];
  for (let i = 0; i < 12; i += 1) statuses.push((await call('/api/auth/signup', { method: 'POST', body: { ...GUARDIAN, phone: `0105550${String(i).padStart(4, '0')}` } })).status);
  assert.deepEqual(statuses, [...Array(10).fill(201), 429, 429]);
});

test('a new guardian can save a care recipient, and it becomes the session recipient', async (context) => {
  const { call, cookieOf } = await startServer(context);
  const signup = await call('/api/auth/signup', { method: 'POST', body: GUARDIAN });
  const cookie = cookieOf(signup);
  const saved = await call('/api/auth/recipient', { method: 'POST', cookie, body: { name: '가상아이' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.data.care_recipient.name, '가상아이');
  const recipientId = saved.json.data.care_recipient_id;
  assert.ok(recipientId);
  const renamed = await call('/api/auth/recipient', { method: 'POST', cookie, body: { name: '새이름' } });
  assert.equal(renamed.json.data.care_recipient_id, recipientId, 'the same recipient is renamed, not duplicated');
  assert.equal(renamed.json.data.care_recipient.name, '새이름');
  const mine = await call('/api/care/recipients', { cookie });
  assert.deepEqual(mine.json.data.map((item) => item.id), [recipientId]);
  assert.equal((await call('/api/auth/recipient', { method: 'POST', cookie, body: { name: '' } })).status, 400);
  assert.equal((await call('/api/auth/recipient', { method: 'POST', cookie, body: { name: '가'.repeat(21) } })).status, 400);
});

test('only a signed-in non-demo guardian can save a recipient', async (context) => {
  const { call, cookieOf } = await startServer(context);
  assert.equal((await call('/api/auth/recipient', { method: 'POST', body: { name: '가상아이' } })).status, 401);
  const caregiver = await call('/api/auth/signup', { method: 'POST', body: CAREGIVER });
  assert.equal((await call('/api/auth/recipient', { method: 'POST', cookie: cookieOf(caregiver), body: { name: '가상아이' } })).status, 403);
  const demo = await call('/api/auth/login', { method: 'POST', body: { username: 'guardian', password: 'demo-1234' } });
  const demoSave = await call('/api/auth/recipient', { method: 'POST', cookie: cookieOf(demo), body: { name: '바꾸기' } });
  assert.equal(demoSave.status, 403);
  assert.equal((await call('/api/auth/session', { cookie: cookieOf(demo) })).json.data.care_recipient.name, '민준(시연)');
});

test('a signed-up guardian cannot touch another guardian\'s recipient', async (context) => {
  const { call, cookieOf } = await startServer(context);
  const a = cookieOf(await call('/api/auth/signup', { method: 'POST', body: GUARDIAN }));
  const b = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { ...GUARDIAN, phone: '01000000003' } }));
  const first = await call('/api/auth/recipient', { method: 'POST', cookie: a, body: { name: '첫째' } });
  const second = await call('/api/auth/recipient', { method: 'POST', cookie: b, body: { name: '둘째' } });
  assert.notEqual(first.json.data.care_recipient_id, second.json.data.care_recipient_id);
  assert.equal((await call('/api/auth/session', { cookie: a })).json.data.care_recipient.name, '첫째');
  const share = await call(`/api/care/share-summary?care_recipient_id=${second.json.data.care_recipient_id}`, { cookie: a });
  assert.equal(share.status, 404);
});

test('signed-up accounts are not listed publicly and survive the demo data reset', async (context) => {
  const { call, cookieOf } = await startServer(context);
  const signup = await call('/api/auth/signup', { method: 'POST', body: GUARDIAN });
  const cookie = cookieOf(signup);
  await call('/api/auth/recipient', { method: 'POST', cookie, body: { name: '가상아이' } });
  const listed = await call('/api/care/demo-users');
  assert.equal(listed.json.data.some((user) => user.user_id === signup.json.data.user_id), false);
  assert.equal(listed.json.data.some((user) => user.display_name === '가상보호자'), false);
  assert.equal((await call('/api/care/demo-reset', { method: 'POST' })).status, 200);
  const after = await call('/api/auth/session', { cookie });
  assert.equal(after.status, 200);
  assert.equal(after.json.data.care_recipient.name, '가상아이');
  const login = await call('/api/auth/login', { method: 'POST', body: { username: GUARDIAN.phone, password: GUARDIAN.password } });
  assert.equal(login.status, 200);
});

test('a signed-up guardian can use the D care API with the session', async (context) => {
  const { call, cookieOf } = await startServer(context);
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: GUARDIAN }));
  const saved = await call('/api/auth/recipient', { method: 'POST', cookie, body: { name: '가상아이' } });
  const start = new Date(Date.now() - 60 * 60 * 1000);
  const created = await call('/api/care/applications', {
    method: 'POST',
    cookie,
    body: {
      care_recipient_id: saved.json.data.care_recipient_id,
      center_id: DEMO_IDS.centerGn,
      requested_start_at: start.toISOString(),
      requested_end_at: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      shared_categories: ['소통'],
    },
  });
  assert.equal(created.status, 201);
});

test('signup input rules match between the server and the screen', () => {
  assert.equal(normalizeLogin('010-1234-5678'), '01012345678');
  assert.equal(normalizeLogin(' guardian '), 'guardian');
  assert.equal(normalizeLogin('02-123-4567'), '02-123-4567', 'non-mobile numbers are left as typed');
  assert.equal(CAREGIVER_TYPES.length, 6);
  const centerIds = [DEMO_IDS.centerGn];
  assert.deepEqual(validateSignup(GUARDIAN, { centerIds }), { role: 'guardian', display_name: '가상보호자', phone: '01000000001', password: 'synthetic-pass-1' });
  assert.throws(() => validateSignup({ ...GUARDIAN, password: 'short' }, { centerIds }), SignupError);

  const screen = { role: 'guardian', displayName: '가상', phone: '010-0000-0001', password: 'synthetic-pass-1', confirm: 'synthetic-pass-1', agree: true, centerId: '', caregiverType: '' };
  assert.deepEqual(checkSignup(screen), {});
  assert.ok(checkSignup({ ...screen, displayName: ' ' }).display_name);
  assert.ok(checkSignup({ ...screen, phone: '123' }).phone);
  assert.ok(checkSignup({ ...screen, password: 'short', confirm: 'short' }).password);
  assert.ok(checkSignup({ ...screen, confirm: 'different-pass-1' }).confirm);
  assert.ok(checkSignup({ ...screen, agree: false }).agree);
  assert.ok(checkSignup({ ...screen, role: 'caregiver' }).center_id);
  assert.deepEqual(checkSignup({ ...screen, role: 'caregiver', centerId: 'c1', caregiverType: '활동지원사' }), {});
});
