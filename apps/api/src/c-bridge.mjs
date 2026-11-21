import { readSessionToken } from './auth/routes.mjs';
import { createCareRecords } from './c-records.mjs';
import { createCareQuestions } from './c-questions.mjs';
import { createQuestionnaireReader } from './c-questionnaire-source.mjs';
import { createTranscriber } from './c-transcription.mjs';

const MAX_JSON_BYTES = 128 * 1024;
const METHODS = new Map([
  ['/api/ai/structure', 'POST'],
  ['/api/ai/ask', 'POST'],
  ['/api/ai/transcribe', 'POST'],
  ['/api/c/manual', 'GET'],
  ['/api/c/records', 'GET,POST'],
  ['/api/c/handbacks', 'POST'],
  ['/api/c/questions', 'GET,POST'],
  ['/api/c/question-replies', 'POST'],
]);

function isSameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; }
  catch { return false; }
}

async function readJson(request) {
  if (!(request.headers['content-type'] ?? '').toLowerCase().includes('application/json')) {
    return { status: 415, error: 'JSON 형식으로 보내 주세요.' };
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) return { status: 413, error: '요청 크기 제한을 초과했습니다.' };
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Not an object');
    return { data };
  } catch { return { status: 400, error: '요청 JSON이 올바르지 않습니다.' }; }
}

export function createCBridge({ careStore, authStore, supabaseUrl, supabaseAnonKey, fetchImpl, sendJson }) {
  const questionnaireReader = createQuestionnaireReader({
    url: supabaseUrl,
    key: supabaseAnonKey,
    fetcher: fetchImpl,
  });
  const candidates = new Map();

  async function getSession(request) {
    const userId = authStore.userIdFor(readSessionToken(request));
    const user = userId ? careStore.getUser(userId) : null;
    if (!user || !['guardian', 'caregiver'].includes(user.role)) return null;
    let recipientId = null;
    if (user.role === 'guardian') recipientId = careStore.myRecipients(user)[0]?.id ?? null;
    if (user.role === 'caregiver') {
      const current = careStore.listMyAssignments(user).find((item) => item.can_view_now);
      recipientId = current?.care_recipient_id ?? null;
    }
    return { user_id: user.user_id, role: user.role, care_recipient_id: recipientId };
  }

  async function getAssignment(session, recipientId) {
    if (session.role !== 'caregiver') return null;
    const user = careStore.getUser(session.user_id);
    return careStore.listMyAssignments(user).find((item) =>
      item.care_recipient_id === recipientId && item.can_view_now) ?? null;
  }

  async function listAssignments(session, recipientId) {
    const user = careStore.getUser(session.user_id);
    if (!user) return [];
    if (session.role === 'caregiver') {
      return careStore.listMyAssignments(user).filter((item) => item.care_recipient_id === recipientId);
    }
    return careStore.listApplications(user)
      .filter((application) => application.care_recipient_id === recipientId && application.status === 'assigned')
      .flatMap((application) => application.assignment ? [{
        ...application.assignment,
        shared_categories: application.shared_categories,
      }] : []);
  }

  async function listQuestionnaireItems(recipientId) {
    if (!questionnaireReader) return [];
    const items = await questionnaireReader(recipientId);
    return items.map((item) => ({ ...item, care_recipient_id: recipientId, status: 'confirmed' }));
  }

  const records = createCareRecords({
    getSession,
    getAssignment,
    listConfirmedItems: listQuestionnaireItems,
    listQuestionnaireItems,
    createManualCandidates: async (session, items) => {
      for (const item of items) {
        candidates.set(`${session.user_id}:${item.id}`, { ...item, status: 'candidate' });
      }
    },
    transcribeAudio: createTranscriber({
      apiKey: process.env.OPENAI_API_KEY?.trim(),
      model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe',
    }),
  });
  const questions = createCareQuestions({ getSession, listAssignments });

  return async function handleCRequest({ request, response, url }) {
    const allowed = METHODS.get(url.pathname);
    if (!allowed) return false;
    if (!allowed.split(',').includes(request.method)) {
      response.setHeader('Allow', allowed.replace(',', ', '));
      sendJson(response, 405, { error: 'Method not allowed' });
      return true;
    }
    if (request.method !== 'GET' && !isSameOrigin(request)) {
      sendJson(response, 403, { error: '같은 사이트에서 보낸 요청만 허용합니다.' });
      return true;
    }
    try {
      let result;
      if (url.pathname === '/api/ai/transcribe') {
        const session = await getSession(request);
        if (!session) result = { status: 401, body: { error: '로그인해 주세요.' } };
        else result = await records.transcribe(request);
      } else {
        const parsed = request.method === 'GET' ? { data: {} } : await readJson(request);
        if (parsed.error) {
          sendJson(response, parsed.status, { error: parsed.error });
          return true;
        }
        const input = parsed.data;
        const target = url.searchParams.get('care_recipient_id') ?? undefined;
        switch (`${request.method} ${url.pathname}`) {
          case 'GET /api/c/manual': result = await records.manual(request, target); break;
          case 'GET /api/c/records': result = await records.list(request, target); break;
          case 'GET /api/c/questions': result = await questions.list(request); break;
          case 'POST /api/ai/structure': result = await records.structure(request, input); break;
          case 'POST /api/ai/ask': result = await records.ask(request, input); break;
          case 'POST /api/c/records': result = await records.save(request, input, request.headers['idempotency-key']); break;
          case 'POST /api/c/handbacks': result = await records.send(request, input); break;
          case 'POST /api/c/questions': result = await questions.send(request, input, request.headers['idempotency-key']); break;
          case 'POST /api/c/question-replies': result = await questions.answer(request, input); break;
          default: result = { status: 404, body: { error: 'Not found' } };
        }
      }
      sendJson(response, result.status ?? 500, result.body ?? { error: 'Unknown error' });
    } catch {
      sendJson(response, 502, { error: '돌봄 기록 API 연결을 확인해 주세요.' });
    }
    return true;
  };
}
