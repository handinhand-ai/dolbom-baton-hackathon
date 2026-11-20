import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';

async function startServer(context) {
  const server = createApp();
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
