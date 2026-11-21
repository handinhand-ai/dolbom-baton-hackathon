import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRecordDemo } from './c-records-demo.mjs';
import { handleCareRequest } from './care/routes.mjs';
import { createCareStore } from './care/store.mjs';

const publicRoot = new URL('../../web/public/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  // D: 아이 맡기기 · 센터 화면(시연용). A의 탭 틀이 병합되면 탭 자리에 연결합니다.
  ['/care', ['care.html', 'text/html; charset=utf-8']],
  ['/care.css', ['care.css', 'text/css; charset=utf-8']],
  ['/care.js', ['care.js', 'text/javascript; charset=utf-8']],
]);
const recordDemoAssets = new Map([
  ['/c-demo', ['c-demo.html', 'text/html; charset=utf-8']],
  ['/c-demo.css', ['c-demo.css', 'text/css; charset=utf-8']],
  ['/c-demo.js', ['c-demo.js', 'text/javascript; charset=utf-8']],
  ['/c-demo-questions.js', ['c-demo-questions.js', 'text/javascript; charset=utf-8']],
  ['/c-demo-voice.js', ['c-demo-voice.js', 'text/javascript; charset=utf-8']],
  ['/c-mascot.png', ['c-mascot.png', 'image/png']],
  ['/c-pretendard-1.3.9.woff2', ['c-pretendard-1.3.9.woff2', 'font/woff2']],
]);
const recordRoutes = new Map([
  ['/api/ai/structure', { POST: (records, req, data) => records.structure(req, data) }],
  ['/api/ai/ask', { POST: (records, req, data) => records.ask(req, data) }],
  ['/api/c/manual', {
    GET: (records, req, query) => records.manual(req, query.get('care_recipient_id') ?? undefined),
  }],
  ['/api/c/records', {
    GET: (records, req, query) => records.list(req, query.get('care_recipient_id') ?? undefined),
    POST: (records, req, data) => records.save(req, data, req.headers['idempotency-key']),
  }],
  ['/api/c/handbacks', { POST: (records, req, data) => records.send(req, data) }],
]);
const candidateDemoRoute = '/api/c/demo-candidates';
const transcriptionRoute = '/api/ai/transcribe';
const questionRoutes = new Map([
  ['/api/c/questions', {
    GET: (questions, req) => questions.list(req),
    POST: (questions, req, data) => questions.send(req, data, req.headers['idempotency-key']),
  }],
  ['/api/c/question-replies', { POST: (questions, req, data) => questions.answer(req, data) }],
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > 128 * 1024) {
      request.resume();
      return { status: 413, body: { error: '요청이 너무 큽니다.' } };
    }
    chunks.push(chunk);
  }
  try {
    return { input: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { status: 400, body: { error: 'JSON 요청을 확인해 주세요.' } };
  }
}

async function handleJsonRoute(service, route, query, request, response) {
  if (!Object.hasOwn(route, request.method)) {
    response.setHeader('Allow', Object.keys(route).join(', '));
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }
  const handle = route[request.method];
  if (request.method === 'GET') {
    const { status, body } = await handle(service, request, query);
    sendJson(response, status, body);
    return;
  }
  if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    sendJson(response, 415, { error: 'JSON 형식으로 보내 주세요.' });
    return;
  }

  const json = await readJson(request);
  if (json.status) {
    sendJson(response, json.status, json.body);
    return;
  }
  const { status, body } = await handle(service, request, json.input);
  sendJson(response, status, body);
}

export function createApp({
  recordDemo = false, careRecords, careQuestions, recordStore, readQuestionnaire, secondSurveyRecipient, transcribeAudio,
  careStore = createCareStore(),
} = {}) {
  const demo = recordDemo && !careRecords
    ? createRecordDemo({ recordStore, readQuestionnaire, secondSurveyRecipient, transcribeAudio })
    : undefined;
  const records = careRecords ?? demo;
  const questions = careQuestions ?? demo?.questions;
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");

    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL' });
      return;
    }

    const { pathname, searchParams } = url;
    const demoAsset = demo && recordDemoAssets.get(pathname === '/' ? '/c-demo' : pathname);
    const demoCandidates = demo && pathname === candidateDemoRoute;
    const transcription = records && pathname === transcriptionRoute;
    const questionRoute = questions && questionRoutes.get(pathname);
    const route = questionRoute ?? (demoCandidates ? { GET: (service, req) => service.listCandidates(req) }
      : records && recordRoutes.get(pathname));
    if (demo && (demoAsset || route || transcription) &&
        !/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(request.headers.host ?? '')) {
      sendJson(response, 403, { error: '로컬 시연 주소에서 접근해 주세요.' });
      return;
    }
    if (transcription) {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }
      try {
        const { status, body } = await records.transcribe(request);
        sendJson(response, status, body);
      } catch {
        if (!response.destroyed) sendJson(response, 503, { error: '음성 변환에 연결하지 못했어요.' });
      }
      return;
    }
    if (route) {
      try {
        await handleJsonRoute(questionRoute ? questions : records, route, searchParams, request, response);
      } catch {
        if (!response.destroyed) sendJson(response, 503, { error: '잠시 후 다시 시도해 주세요.' });
      }
      return;
    }
    if (await handleCareRequest({ request, response, url, store: careStore, sendJson })) return;

    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    if (pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok', mode: 'skeleton' });
      return;
    }

    const asset = demoAsset ?? assets.get(pathname);
    if (!asset) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    try {
      const content = await readFile(new URL(asset[0], publicRoot));
      if (pathname === '/c-pretendard-1.3.9.woff2') {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      response.writeHead(200, { 'Content-Type': asset[1] });
      response.end(content);
    } catch {
      sendJson(response, 500, { error: 'Unable to load application asset' });
    }
  });
}
