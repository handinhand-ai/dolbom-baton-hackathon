import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const publicRoot = new URL('../../web/public/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function loadQuestionnaire({ fetchImpl, supabaseUrl, supabaseAnonKey }) {
  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const headers = {
    apikey: supabaseAnonKey,
    'Accept-Profile': 'dolbom_demo',
  };
  const questionFields = [
    'question_id',
    'question_text',
    'helper_text',
    'section',
    'question_type',
    'is_required',
    'display_order',
  ].join(',');
  const optionFields = [
    'option_id',
    'question_id',
    'option_text',
    'option_group',
    'display_order',
  ].join(',');
  const [questionResponse, optionResponse] = await Promise.all([
    fetchImpl(`${baseUrl}/rest/v1/questionnaire_question?select=${questionFields}&is_active=eq.true&order=display_order.asc`, { headers }),
    fetchImpl(`${baseUrl}/rest/v1/questionnaire_option?select=${optionFields}&is_active=eq.true&order=display_order.asc`, { headers }),
  ]);

  if (!questionResponse.ok || !optionResponse.ok) {
    throw new Error('Supabase questionnaire request failed');
  }

  const [questions, options] = await Promise.all([
    questionResponse.json(),
    optionResponse.json(),
  ]);
  const optionsByQuestion = Map.groupBy(options, (option) => option.question_id);
  return questions
    .toSorted((left, right) => left.display_order - right.display_order)
    .map((question) => ({
      ...question,
      options: (optionsByQuestion.get(question.question_id) ?? [])
        .toSorted((left, right) => left.display_order - right.display_order),
    }));
}

export function createApp({
  fetchImpl = fetch,
  supabaseUrl = process.env.SUPABASE_URL ?? '',
  supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
} = {}) {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'none'");

    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL' });
      return;
    }

    if (pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok', mode: 'skeleton' });
      return;
    }

    if (pathname === '/api/questionnaire') {
      if (!supabaseUrl || !supabaseAnonKey) {
        sendJson(response, 503, { error: 'Supabase is not configured' });
        return;
      }
      try {
        const questions = await loadQuestionnaire({ fetchImpl, supabaseUrl, supabaseAnonKey });
        sendJson(response, 200, { questions });
      } catch {
        sendJson(response, 502, { error: 'Unable to load questionnaire' });
      }
      return;
    }

    const asset = assets.get(pathname);
    if (!asset) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    try {
      const content = await readFile(new URL(asset[0], publicRoot));
      response.writeHead(200, { 'Content-Type': asset[1] });
      response.end(content);
    } catch {
      sendJson(response, 500, { error: 'Unable to load application asset' });
    }
  });
}
