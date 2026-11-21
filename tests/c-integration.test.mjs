import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';

async function serve(t) {
  const server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

async function login(base, username, password = 'demo-1234') {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('C records API denies unauthenticated and wrong-origin requests', async (t) => {
  const base = await serve(t);
  assert.equal((await fetch(`${base}/api/c/records`)).status, 401);
  assert.equal((await fetch(`${base}/api/ai/structure`, {
    method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '산책할 때 좋아해요' }),
  })).status, 403);
});

test('A guardian session can structure synthetic care notes through C logic', async (t) => {
  const base = await serve(t);
  const cookie = await login(base, 'guardian');
  const sessionResponse = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } });
  const { data: session } = await sessionResponse.json();
  const response = await fetch(`${base}/api/ai/structure`, {
    method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '산책할 때 좋아해요.', care_recipient_id: session.care_recipient_id }),
  });
  assert.equal(response.status, 200);
  const suggestions = await response.json();
  assert.equal(Array.isArray(suggestions), true);
});

test('C client modules are served only as listed assets', async (t) => {
  const base = await serve(t);
  const script = await fetch(`${base}/a/c-integrated.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
});
