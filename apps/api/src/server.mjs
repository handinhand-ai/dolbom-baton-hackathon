import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { handleCareRequest } from './care/routes.mjs';
import { createCareStore } from './care/store.mjs';
import { createAuthStore } from './auth/auth-store.mjs';
import { createSupabaseAccountStore } from './auth/supabase-account-store.mjs';
import { createAuthHandler, readSessionToken } from './auth/routes.mjs';
import { handleQuestionnaireAnswerRequest } from './questionnaire/routes.mjs';

const publicRoot = new URL('../../web/public/', import.meta.url);
const assets = new Map([
  ['/', ['a/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  // D: 아이 맡기기 · 센터 화면(시연용). A의 탭 틀이 병합되면 탭 자리에 연결합니다.
  ['/care', ['care.html', 'text/html; charset=utf-8']],
  ['/care.css', ['care.css', 'text/css; charset=utf-8']],
  ['/care.js', ['care.js', 'text/javascript; charset=utf-8']],
  ['/a/', ['a/index.html', 'text/html; charset=utf-8']],
  ['/a/manifest.json', ['a/manifest.json', 'application/manifest+json; charset=utf-8']],
  ['/b/questionnaire.js', ['b/questionnaire.js', 'text/javascript; charset=utf-8']],
  ['/b/questionnaire.css', ['b/questionnaire.css', 'text/css; charset=utf-8']],
]);
const uiTypes = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  png: 'image/png',
  woff2: 'font/woff2',
};

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
  careStore = createCareStore(),
  authStore = null,
  accountRepository = null,
  fetchImpl = fetch,
  supabaseUrl = process.env.SUPABASE_URL ?? '',
  supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
} = {}) {
  const cloudAccounts = accountRepository ?? (supabaseUrl && supabaseAnonKey
    ? createSupabaseAccountStore({ fetchImpl, supabaseUrl, supabaseAnonKey })
    : null);
  const activeAuthStore = authStore ?? createAuthStore({
    getUser: careStore.getUser,
    registerUser: careStore.registerUser,
    registerRecipient: careStore.registerRecipient,
    listCenters: careStore.listCenters,
    accountRepository: cloudAccounts,
  });
  const handleAuthRequest = createAuthHandler({ authStore: activeAuthStore, careStore, sendJson });
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");

    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL' });
      return;
    }

    // A: 로그인·세션·역할 확인(/api/auth/*). D의 /api/care/*는 로그인 세션이 있으면 그 사용자로 처리합니다.
    if (await handleAuthRequest({ request, response, url })) return;
    const sessionUserId = activeAuthStore.userIdFor(readSessionToken(request));
    if (await handleCareRequest({ request, response, url, store: careStore, sendJson, sessionUserId })) return;
    if (await handleQuestionnaireAnswerRequest({
      request,
      response,
      url,
      sessionUserId,
      careStore,
      fetchImpl,
      supabaseUrl,
      supabaseAnonKey,
      sendJson,
    })) return;

    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    const { pathname } = url;

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

    // A 공통 화면: /a/ 아래 파일은 이름 규칙에 맞는 것만 제공합니다(영문 소문자·숫자·'-', 폴더 1단계).
    // 규칙에 '..'과 점으로 시작하는 이름이 들어갈 수 없어 저장소의 다른 파일은 노출되지 않습니다.
    const uiMatch = /^\/a\/((?:[a-z0-9-]+\/)?[a-z0-9-]+)\.(js|css|html|png|woff2)$/.exec(pathname);
    const asset = assets.get(pathname) ?? (uiMatch ? [`a/${uiMatch[1]}.${uiMatch[2]}`, uiTypes[uiMatch[2]]] : null);
    if (!asset) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    try {
      const content = await readFile(new URL(asset[0], publicRoot));
      response.writeHead(200, { 'Content-Type': asset[1] });
      response.end(content);
    } catch (error) {
      if (uiMatch && error.code === 'ENOENT') {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }
      sendJson(response, 500, { error: 'Unable to load application asset' });
    }
  });
}
