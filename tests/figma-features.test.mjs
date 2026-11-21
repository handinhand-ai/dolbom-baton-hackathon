import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';

async function withServer(t) {
  const server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('Figma functional assets are served without changing original routes', async (t) => {
  const base = await withServer(t);
  const page = await fetch(`${base}/a/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /figma-features\.css/);
  for (const path of ['/a/figma-features.js', '/a/figma-features.css', '/a/assets/figma-mascot.png']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 100, path);
  }
  assert.equal((await fetch(`${base}/care`)).status, 200);
});

test('API endpoints remain restricted and do not fabricate care access', async (t) => {
  const base = await withServer(t);
  const access = await fetch(`${base}/api/care/access?care_recipient_id=demo`);
  assert.equal(access.status, 401);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
});
