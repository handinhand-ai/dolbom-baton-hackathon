import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';
import { createAuthStore, SESSION_TTL_MS } from '../apps/api/src/auth/auth-store.mjs';
import { createCareStore } from '../apps/api/src/care/store.mjs';
import { DEMO_IDS } from '../apps/api/src/care/demo-data.mjs';

// 모든 계정·값은 합성 시연 데이터입니다.
const HOUR = 60 * 60 * 1000;
const ACCOUNTS = {
  guardian: { username: 'guardian', role: 'guardian', user_id: DEMO_IDS.guardian },
  caregiver: { username: 'caregiver', role: 'caregiver', user_id: DEMO_IDS.caregiverGn },
  center: { username: 'center', role: 'center_admin', user_id: DEMO_IDS.adminGn },
};
const PASSWORD = 'demo-1234';

async function startServer(context, { now } = {}) {
  const careStore = createCareStore();
  const authStore = createAuthStore({ getUser: careStore.getUser, now, exposeDemoAccounts: true });
  const server = createApp({ careStore, authStore });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { cookie, method = 'GET', body, origin = base, headers = {} } = {}) => {
    const init = { method, headers: { ...headers } };
    if (cookie) init.headers.Cookie = cookie;
    if (method === 'POST') {
      if (origin) init.headers.Origin = origin;
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    }
    const response = await fetch(`${base}${path}`, init);
    return { status: response.status, headers: response.headers, json: await response.json() };
  };
  const login = async (key) => {
    const result = await call('/api/auth/login', { method: 'POST', body: { username: ACCOUNTS[key].username, password: PASSWORD } });
    return { ...result, cookie: result.headers.get('set-cookie')?.split(';')[0] };
  };
  return { base, call, login };
}

test('each demo role signs in, gets an HttpOnly session cookie, and can read the session back', async (context) => {
  const { call, login } = await startServer(context);
  for (const key of Object.keys(ACCOUNTS)) {
    const result = await login(key);
    assert.equal(result.status, 200);
    const cookieHeader = result.headers.get('set-cookie');
    assert.match(cookieHeader, /^baton_session=[0-9a-f-]{36};/);
    assert.match(cookieHeader, /HttpOnly/);
    assert.match(cookieHeader, /SameSite=Strict/);
    assert.match(cookieHeader, /Max-Age=28800/);
    assert.equal(result.json.data.user_id, ACCOUNTS[key].user_id);
    assert.equal(result.json.data.role, ACCOUNTS[key].role);
    const session = await call('/api/auth/session', { cookie: result.cookie });
    assert.equal(session.status, 200);
    assert.deepEqual(session.json, result.json);
  }
});

test('the session response matches the documented schema and never exposes credentials', async (context) => {
  const { login } = await startServer(context);
  const schema = JSON.parse(await readFile(new URL('../packages/contracts/auth-session.schema.json', import.meta.url), 'utf8'));
  for (const key of Object.keys(ACCOUNTS)) {
    const { json } = await login(key);
    assert.deepEqual(Object.keys(json.data).sort(), schema.required.toSorted());
    assert.ok(schema.properties.role.enum.includes(json.data.role));
    assert.equal(JSON.stringify(json).includes(PASSWORD), false);
    assert.equal('username' in json.data, false);
  }
});

test('role-specific values: guardian has a recipient, caregiver has none until assigned, center admin has a center', async (context) => {
  const { login } = await startServer(context);
  const guardian = (await login('guardian')).json.data;
  assert.deepEqual(guardian.care_recipient, { id: DEMO_IDS.recipient, name: '민준(시연)' });
  assert.equal(guardian.care_recipient_id, DEMO_IDS.recipient);
  assert.equal(guardian.relation, '어머니');
  const caregiver = (await login('caregiver')).json.data;
  assert.equal(caregiver.care_recipient_id, null);
  assert.equal(caregiver.care_recipient, null);
  assert.equal(caregiver.center_id, DEMO_IDS.centerGn);
  assert.ok(caregiver.center_name);
  const admin = (await login('center')).json.data;
  assert.equal(admin.role, 'center_admin');
  assert.equal(admin.care_recipient_id, null);
  assert.equal(admin.center_id, DEMO_IDS.centerGn);
});

test('a cookie session drives the D care API, and the caregiver gets the recipient once assigned', async (context) => {
  const { call, login } = await startServer(context);
  const guardian = await login('guardian');
  const start = new Date(Date.now() - HOUR);
  const created = await call('/api/care/applications', {
    cookie: guardian.cookie,
    method: 'POST',
    body: {
      care_recipient_id: DEMO_IDS.recipient,
      center_id: DEMO_IDS.centerGn,
      requested_start_at: start.toISOString(),
      requested_end_at: new Date(start.getTime() + 24 * HOUR).toISOString(),
      shared_categories: ['소통'],
    },
  });
  assert.equal(created.status, 201);

  const admin = await login('center');
  const assigned = await call(`/api/care/applications/${created.json.data.id}/assign`, { cookie: admin.cookie, method: 'POST', body: { caregiver_user_id: DEMO_IDS.caregiverGn } });
  assert.equal(assigned.status, 200);

  const caregiver = await login('caregiver');
  assert.equal(caregiver.json.data.care_recipient_id, DEMO_IDS.recipient);
  const session = await call('/api/auth/session', { cookie: caregiver.cookie });
  assert.equal(session.json.data.care_recipient.name, '민준(시연)');
  const access = await call(`/api/care/access?care_recipient_id=${DEMO_IDS.recipient}`, { cookie: caregiver.cookie });
  assert.equal(access.json.data.allowed, true);
  // 보호자 세션으로는 종사자 전용 값이 보이지 않습니다.
  const forbidden = await call('/api/care/assignments', { cookie: guardian.cookie });
  assert.equal(forbidden.status, 403);
});

test('a valid session takes priority over the X-Demo-User header', async (context) => {
  const { call, login } = await startServer(context);
  const guardian = await login('guardian');
  const spoof = await call('/api/care/assignments', { cookie: guardian.cookie, headers: { 'X-Demo-User': DEMO_IDS.caregiverGn } });
  assert.equal(spoof.status, 403);
});

test('wrong credentials and malformed bodies are rejected the same way and set no cookie', async (context) => {
  const { call } = await startServer(context);
  const wrongPassword = await call('/api/auth/login', { method: 'POST', body: { username: 'guardian', password: 'nope' } });
  const unknownUser = await call('/api/auth/login', { method: 'POST', body: { username: 'nobody', password: 'nope' } });
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(wrongPassword.json, unknownUser.json);
  assert.equal(wrongPassword.headers.get('set-cookie'), null);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { username: 1, password: 2 } })).status, 400);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: 'not json' })).status, 400);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: '[]' })).status, 400);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { username: 'x'.repeat(65), password: 'y' } })).status, 400);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(5000) }) })).status, 413);
});

test('requests without a valid session get 401', async (context) => {
  const { call } = await startServer(context);
  assert.equal((await call('/api/auth/session')).status, 401);
  assert.equal((await call('/api/auth/session', { cookie: 'baton_session=00000000-0000-0000-0000-000000000000' })).status, 401);
  assert.equal((await call('/api/auth/session', { cookie: 'baton_session=not-a-token' })).status, 401);
  assert.equal((await call('/api/auth/check-role?roles=guardian')).status, 401);
});

test('check-role allows matching roles, rejects others with 403, and validates the query', async (context) => {
  const { call, login } = await startServer(context);
  const { cookie } = await login('caregiver');
  const ok = await call('/api/auth/check-role?roles=caregiver,center_admin', { cookie });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.data, { allowed: true, role: 'caregiver' });
  assert.equal((await call('/api/auth/check-role?roles=guardian', { cookie })).status, 403);
  assert.equal((await call('/api/auth/check-role', { cookie })).status, 400);
  assert.equal((await call('/api/auth/check-role?roles=admin', { cookie })).status, 400);
});

test('logout invalidates the session on the server and clears the cookie', async (context) => {
  const { call, login } = await startServer(context);
  const { cookie } = await login('guardian');
  const out = await call('/api/auth/logout', { cookie, method: 'POST' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.json, { data: { logged_out: true } });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await call('/api/auth/session', { cookie })).status, 401);
  assert.equal((await call('/api/auth/logout', { method: 'POST' })).status, 200);
});

test('sessions expire after the time limit', async (context) => {
  let time = Date.now();
  const { call, login } = await startServer(context, { now: () => time });
  const { cookie } = await login('guardian');
  time += SESSION_TTL_MS - 1000;
  assert.equal((await call('/api/auth/session', { cookie })).status, 200);
  time += 2000;
  assert.equal((await call('/api/auth/session', { cookie })).status, 401);
});

test('cross-origin writes are rejected and unsupported methods return 405', async (context) => {
  const { call, login } = await startServer(context);
  const { cookie } = await login('guardian');
  const evilLogin = await call('/api/auth/login', { method: 'POST', origin: 'https://evil.example', body: { username: 'guardian', password: PASSWORD } });
  assert.equal(evilLogin.status, 403);
  const evilLogout = await call('/api/auth/logout', { method: 'POST', origin: 'https://evil.example', cookie });
  assert.equal(evilLogout.status, 403);
  assert.equal((await call('/api/auth/session', { cookie })).status, 200);
  const wrongMethod = await call('/api/auth/login');
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  assert.equal((await call('/api/auth/session', { method: 'POST' })).status, 405);
  assert.equal((await call('/api/auth/unknown')).status, 404);
});

test('repeated failed sign-ins are throttled', async (context) => {
  const { call } = await startServer(context);
  let last;
  for (let i = 0; i < 12; i += 1) last = await call('/api/auth/login', { method: 'POST', body: { username: 'guardian', password: `wrong-${i}` } });
  assert.equal(last.status, 429);
});

test('demo accounts can be listed for prefilled sign-in and hidden by configuration', async (context) => {
  const { call } = await startServer(context);
  const listed = await call('/api/auth/demo-accounts');
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.json.data.map((item) => item.role).sort(), ['caregiver', 'caregiver', 'center_admin', 'center_admin', 'guardian']);
  const careStore = createCareStore();
  const hiddenStore = createAuthStore({ getUser: careStore.getUser, exposeDemoAccounts: false });
  const server = createApp({ careStore, authStore: hiddenStore });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const hidden = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/demo-accounts`);
  assert.equal(hidden.status, 404);
});
