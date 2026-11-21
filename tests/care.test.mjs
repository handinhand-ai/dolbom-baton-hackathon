import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';
import { createCareStore } from '../apps/api/src/care/store.mjs';
import { DEMO_IDS } from '../apps/api/src/care/demo-data.mjs';

// 모든 데이터는 합성 시연 데이터입니다.
const HOUR = 60 * 60 * 1000;

async function startServer(context, { now } = {}) {
  const careStore = createCareStore(now ? { now } : {});
  const server = createApp({ careStore });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { as, method = 'GET', body } = {}) => {
    const headers = {};
    if (as) headers['X-Demo-User'] = as;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  };
  return { base, call };
}

function applicationBody(overrides = {}) {
  const start = new Date(Date.now() - HOUR);
  return {
    care_recipient_id: DEMO_IDS.recipient,
    center_id: DEMO_IDS.centerGn,
    requested_start_at: start.toISOString(),
    requested_end_at: new Date(start.getTime() + 7 * 24 * HOUR).toISOString(),
    shared_categories: ['소통', '식사', '정서·행동'],
    ...overrides,
  };
}

async function submitAndAssign(call, overrides) {
  const created = await call('/api/care/applications', { as: DEMO_IDS.guardian, method: 'POST', body: applicationBody(overrides) });
  assert.equal(created.status, 201);
  const assigned = await call(`/api/care/applications/${created.json.data.id}/assign`, {
    as: DEMO_IDS.adminGn, method: 'POST', body: { caregiver_user_id: DEMO_IDS.caregiverGn },
  });
  assert.equal(assigned.status, 200);
  return assigned.json.data;
}

test('guardian submits a care request; server sets guardian and status', async (context) => {
  const { call } = await startServer(context);
  const result = await call('/api/care/applications', {
    as: DEMO_IDS.guardian, method: 'POST', body: applicationBody({ guardian_user_id: DEMO_IDS.adminGn, status: 'assigned' }),
  });
  assert.equal(result.status, 201);
  assert.equal(result.json.data.status, 'submitted');
  assert.equal(result.json.data.guardian_user_id, DEMO_IDS.guardian);
  const list = await call('/api/care/applications', { as: DEMO_IDS.guardian });
  assert.equal(list.json.data.length, 1);
});

test('request validation: auth, period, categories, center, duplicates', async (context) => {
  const { call } = await startServer(context);
  const post = (body, as = DEMO_IDS.guardian) => call('/api/care/applications', { as: as ?? undefined, method: 'POST', body });

  assert.equal((await post(applicationBody(), null)).status, 401);
  assert.equal((await post(applicationBody(), DEMO_IDS.caregiverGn)).status, 403);

  const start = new Date().toISOString();
  assert.equal((await post(applicationBody({ requested_start_at: start, requested_end_at: start }))).status, 400);
  assert.equal((await post(applicationBody({ shared_categories: [] }))).status, 400);
  assert.equal((await post(applicationBody({ shared_categories: ['진단'] }))).status, 400);
  assert.equal((await post(applicationBody({ center_id: '00000000-0000-4000-8000-00000000ffff' }))).status, 404);
  assert.equal((await post(applicationBody({ care_recipient_id: '00000000-0000-4000-8000-00000000ffff' }))).status, 404);

  const body = applicationBody();
  assert.equal((await post(body)).status, 201);
  assert.equal((await post(body)).status, 409);
});

test('only the center admin of that center can assign its own caregivers', async (context) => {
  const { call } = await startServer(context);
  const created = await call('/api/care/applications', { as: DEMO_IDS.guardian, method: 'POST', body: applicationBody() });
  const path = `/api/care/applications/${created.json.data.id}/assign`;
  const body = { caregiver_user_id: DEMO_IDS.caregiverGn };

  assert.equal((await call(path, { as: DEMO_IDS.guardian, method: 'POST', body })).status, 403);
  assert.equal((await call(path, { as: DEMO_IDS.caregiverGn, method: 'POST', body })).status, 403);
  assert.equal((await call(path, { as: DEMO_IDS.adminSos, method: 'POST', body })).status, 404);
  assert.equal((await call(path, { as: DEMO_IDS.adminGn, method: 'POST', body: { caregiver_user_id: DEMO_IDS.caregiverSos } })).status, 400);

  const ok = await call(path, { as: DEMO_IDS.adminGn, method: 'POST', body });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.status, 'assigned');
  assert.equal(ok.json.data.assignment.caregiver_user_id, DEMO_IDS.caregiverGn);
  assert.equal((await call(path, { as: DEMO_IDS.adminGn, method: 'POST', body })).status, 409);
});

test('assigned caregiver sees the recipient and only the shared categories', async (context) => {
  const { call } = await startServer(context);
  await submitAndAssign(call, { shared_categories: ['정서·행동', '소통'] });

  const mine = await call('/api/care/assignments', { as: DEMO_IDS.caregiverGn });
  assert.equal(mine.json.data.length, 1);
  assert.deepEqual(mine.json.data[0].shared_categories, ['소통', '정서·행동']);

  const access = await call(`/api/care/access?care_recipient_id=${DEMO_IDS.recipient}`, { as: DEMO_IDS.caregiverGn });
  assert.equal(access.json.data.allowed, true);
  assert.ok(!access.json.data.shared_categories.includes('위생'));

  const other = await call(`/api/care/access?care_recipient_id=${DEMO_IDS.recipient}`, { as: DEMO_IDS.caregiverSos });
  assert.equal(other.json.data.allowed, false);
  assert.equal((await call('/api/care/assignments', { as: DEMO_IDS.caregiverSos })).json.data.length, 0);
});

test('access ends when the guardian completes care or the period is outside now', async (context) => {
  const { call } = await startServer(context);
  const application = await submitAndAssign(call);
  const accessPath = `/api/care/access?care_recipient_id=${DEMO_IDS.recipient}`;
  assert.equal((await call(accessPath, { as: DEMO_IDS.caregiverGn })).json.data.allowed, true);

  assert.equal((await call(`/api/care/applications/${application.id}/cancel`, { as: DEMO_IDS.guardian, method: 'POST', body: {} })).status, 409);
  const completed = await call(`/api/care/applications/${application.id}/complete`, { as: DEMO_IDS.guardian, method: 'POST', body: {} });
  assert.equal(completed.status, 200);
  assert.equal((await call(accessPath, { as: DEMO_IDS.caregiverGn })).json.data.allowed, false);
  assert.equal((await call('/api/care/assignments', { as: DEMO_IDS.caregiverGn })).json.data.length, 0);
});

test('a future assignment is not visible until it starts', async (context) => {
  let clock = new Date();
  const { call } = await startServer(context, { now: () => clock });
  const start = new Date(clock.getTime() + 24 * HOUR);
  await submitAndAssign(call, { requested_start_at: start.toISOString(), requested_end_at: new Date(start.getTime() + 2 * 24 * HOUR).toISOString() });
  const accessPath = `/api/care/access?care_recipient_id=${DEMO_IDS.recipient}`;
  assert.equal((await call(accessPath, { as: DEMO_IDS.caregiverGn })).json.data.allowed, false);
  const upcoming = await call('/api/care/assignments', { as: DEMO_IDS.caregiverGn });
  assert.equal(upcoming.json.data.length, 1);
  assert.equal(upcoming.json.data[0].can_view_now, false);
  clock = new Date(start.getTime() + HOUR);
  assert.equal((await call(accessPath, { as: DEMO_IDS.caregiverGn })).json.data.allowed, true);
  clock = new Date(start.getTime() + 3 * 24 * HOUR);
  assert.equal((await call(accessPath, { as: DEMO_IDS.caregiverGn })).json.data.allowed, false);
  assert.equal((await call('/api/care/assignments', { as: DEMO_IDS.caregiverGn })).json.data.length, 0);
});

test('rejected and cancelled requests never create access', async (context) => {
  const { call } = await startServer(context);
  const first = await call('/api/care/applications', { as: DEMO_IDS.guardian, method: 'POST', body: applicationBody() });
  assert.equal((await call(`/api/care/applications/${first.json.data.id}/reject`, { as: DEMO_IDS.adminGn, method: 'POST', body: {} })).json.data.status, 'rejected');

  const second = await call('/api/care/applications', { as: DEMO_IDS.guardian, method: 'POST', body: applicationBody({ shared_categories: ['소통'] }) });
  const cancelled = await call(`/api/care/applications/${second.json.data.id}/cancel`, { as: DEMO_IDS.guardian, method: 'POST', body: {} });
  assert.equal(cancelled.json.data.status, 'cancelled');
  assert.equal((await call(`/api/care/applications/${second.json.data.id}/assign`, {
    as: DEMO_IDS.adminGn, method: 'POST', body: { caregiver_user_id: DEMO_IDS.caregiverGn },
  })).status, 409);

  const access = await call(`/api/care/access?care_recipient_id=${DEMO_IDS.recipient}`, { as: DEMO_IDS.caregiverGn });
  assert.equal(access.json.data.allowed, false);
});

test('center admin only lists requests for their own center', async (context) => {
  const { call } = await startServer(context);
  await call('/api/care/applications', { as: DEMO_IDS.guardian, method: 'POST', body: applicationBody() });
  assert.equal((await call('/api/care/applications', { as: DEMO_IDS.adminGn })).json.data.length, 1);
  assert.equal((await call('/api/care/applications', { as: DEMO_IDS.adminSos })).json.data.length, 0);
  assert.equal((await call('/api/care/applications', { as: DEMO_IDS.caregiverGn })).status, 403);
});

test('share summary marks empty categories and is guardian-only', async (context) => {
  const { call } = await startServer(context);
  const summary = await call(`/api/care/share-summary?care_recipient_id=${DEMO_IDS.recipient}`, { as: DEMO_IDS.guardian });
  assert.equal(summary.status, 200);
  assert.equal(summary.json.data.length, 7);
  assert.ok(summary.json.data.some((item) => item.confirmed_count === 0));
  assert.equal((await call(`/api/care/share-summary?care_recipient_id=${DEMO_IDS.recipient}`, { as: DEMO_IDS.caregiverGn })).status, 403);
});

test('care routes reject bad methods, bodies and unknown paths', async (context) => {
  const { base, call } = await startServer(context);
  const wrongMethod = await call('/api/care/applications', { as: DEMO_IDS.guardian, method: 'DELETE' });
  assert.equal(wrongMethod.status, 405);
  assert.equal((await call('/api/care/unknown', { as: DEMO_IDS.guardian })).status, 404);

  const notJson = await fetch(`${base}/api/care/applications`, {
    method: 'POST', headers: { 'X-Demo-User': DEMO_IDS.guardian, 'Content-Type': 'text/plain' }, body: 'x',
  });
  assert.equal(notJson.status, 415);
  const broken = await fetch(`${base}/api/care/applications`, {
    method: 'POST', headers: { 'X-Demo-User': DEMO_IDS.guardian, 'Content-Type': 'application/json' }, body: '{bad',
  });
  assert.equal(broken.status, 400);
});

test('the care page and its assets are served', async (context) => {
  const { base } = await startServer(context);
  const page = await fetch(`${base}/care`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<html lang="ko">/);
  for (const path of ['/care.css', '/care.js']) {
    const asset = await fetch(`${base}${path}`);
    assert.equal(asset.status, 200);
  }
});
