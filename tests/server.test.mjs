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

test('questionnaire endpoint combines active Supabase questions with their options', async (context) => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('questionnaire_question')) {
      return new Response(JSON.stringify([
        {
          question_id: 'q2',
          question_text: '두 번째 질문',
          helper_text: null,
          section: 'daily',
          question_type: 'single',
          is_required: false,
          display_order: 2,
        },
        {
          question_id: 'q1',
          question_text: '첫 번째 질문',
          helper_text: '도움말',
          section: 'must',
          question_type: 'multiple',
          is_required: true,
          display_order: 1,
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify([
      { option_id: 'o2', question_id: 'q1', option_text: '선택 2', option_group: null, display_order: 2 },
      { option_id: 'o1', question_id: 'q1', option_text: '선택 1', option_group: null, display_order: 1 },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const server = createApp({
    fetchImpl,
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'public-anon-key',
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/questionnaire`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    questions: [
      {
        question_id: 'q1',
        question_text: '첫 번째 질문',
        helper_text: '도움말',
        section: 'must',
        question_type: 'multiple',
        is_required: true,
        display_order: 1,
        options: [
          { option_id: 'o1', question_id: 'q1', option_text: '선택 1', option_group: null, display_order: 1 },
          { option_id: 'o2', question_id: 'q1', option_text: '선택 2', option_group: null, display_order: 2 },
        ],
      },
      {
        question_id: 'q2',
        question_text: '두 번째 질문',
        helper_text: null,
        section: 'daily',
        question_type: 'single',
        is_required: false,
        display_order: 2,
        options: [],
      },
    ],
  });
  assert.equal(requests.length, 2);
  assert.equal(requests.every(({ options }) => options.headers.apikey === 'public-anon-key'), true);
});

test('questionnaire endpoint reports missing Supabase configuration', async (context) => {
  const server = createApp({ supabaseUrl: '', supabaseAnonKey: '' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/questionnaire`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Supabase is not configured' });
});
