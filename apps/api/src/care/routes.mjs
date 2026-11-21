import { CareError } from './store.mjs';

// /api/care/* 요청 처리. 처리했으면 true, 담당 경로가 아니면 false를 돌려줍니다.
// TODO(A): 로그인 세션이 병합되면 getSessionUser를 A의 getSession()으로 바꿉니다.
// 지금은 시연 계정 ID를 X-Demo-User 헤더로 받습니다(합성 계정만 존재).

const MAX_BODY_BYTES = 16 * 1024;

function getSessionUser(request, store) {
  const userId = request.headers['x-demo-user'];
  if (typeof userId !== 'string' || userId.length === 0) return null;
  return store.getUser(userId) ?? null;
}

async function readJson(request) {
  const type = request.headers['content-type'] ?? '';
  if (!type.includes('application/json')) throw new CareError(415, 'JSON으로 보내 주세요.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new CareError(413, '요청이 너무 커요.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed;
  } catch {
    throw new CareError(400, '요청 형식이 올바르지 않아요.');
  }
}

const routes = [
  ['GET', /^\/api\/care\/demo-users$/, ({ store }) => store.users()],
  ['GET', /^\/api\/care\/centers$/, ({ store }) => store.listCenters()],
  ['GET', /^\/api\/care\/recipients$/, ({ store, user }) => store.myRecipients(user)],
  ['GET', /^\/api\/care\/share-summary$/, ({ store, user, url }) => store.shareSummary(user, url.searchParams.get('care_recipient_id'))],
  ['GET', /^\/api\/care\/applications$/, ({ store, user }) => store.listApplications(user)],
  ['POST', /^\/api\/care\/applications$/, async ({ store, user, request }) => {
    const body = await readJson(request);
    return [201, store.createApplication(user, body)];
  }],
  ['POST', /^\/api\/care\/applications\/([\w-]+)\/assign$/, async ({ store, user, request, match }) => store.assign(user, match[1], await readJson(request))],
  ['POST', /^\/api\/care\/applications\/([\w-]+)\/reject$/, ({ store, user, match }) => store.reject(user, match[1])],
  ['POST', /^\/api\/care\/applications\/([\w-]+)\/cancel$/, ({ store, user, match }) => store.cancel(user, match[1])],
  ['POST', /^\/api\/care\/applications\/([\w-]+)\/complete$/, ({ store, user, match }) => store.complete(user, match[1])],
  ['GET', /^\/api\/care\/center-caregivers$/, ({ store, user }) => store.centerCaregivers(user)],
  ['GET', /^\/api\/care\/assignments$/, ({ store, user }) => store.listMyAssignments(user)],
  ['GET', /^\/api\/care\/access$/, ({ store, user, url }) => {
    if (!user) throw new CareError(401, '로그인이 필요해요.');
    return store.canViewManual(user, url.searchParams.get('care_recipient_id'));
  }],
  ['POST', /^\/api\/care\/demo-reset$/, ({ store }) => {
    store.reset();
    return { reset: true };
  }],
];

export async function handleCareRequest({ request, response, url, store, sendJson }) {
  if (!url.pathname.startsWith('/api/care/')) return false;

  const matching = routes.filter(([, pattern]) => pattern.test(url.pathname));
  if (matching.length === 0) {
    sendJson(response, 404, { error: 'Not found' });
    return true;
  }
  const route = matching.find(([method]) => method === request.method);
  if (!route) {
    response.setHeader('Allow', [...new Set(matching.map(([method]) => method))].join(', '));
    sendJson(response, 405, { error: 'Method not allowed' });
    return true;
  }

  try {
    const user = getSessionUser(request, store);
    const match = url.pathname.match(route[1]);
    const result = await route[2]({ store, user, request, url, match });
    const [status, body] = Array.isArray(result) && typeof result[0] === 'number' ? result : [200, result];
    sendJson(response, status, { data: body });
  } catch (error) {
    if (error instanceof CareError) {
      sendJson(response, error.status, { error: error.message });
    } else {
      sendJson(response, 500, { error: '요청을 처리하지 못했어요.' });
    }
  }
  return true;
}
