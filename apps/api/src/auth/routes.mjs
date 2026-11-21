import { ROLES, SESSION_TTL_MS } from './auth-store.mjs';

// /api/auth/* 요청 처리. 처리했으면 true, 담당 경로가 아니면 false를 돌려줍니다.
// 응답은 D와 같은 형식입니다: 성공 { data }, 실패 { error }.

const COOKIE = 'baton_session';
const MAX_BODY_BYTES = 2048;
const MAX_FAILED_LOGINS = 10;
const FAILED_WINDOW_MS = 60_000;

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function readSessionToken(request) {
  return /(?:^|;\s*)baton_session=([0-9a-f-]{36})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1] ?? null;
}

function cookieHeader(request, token, maxAgeSeconds) {
  const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

// 브라우저가 보낸 같은 출처 요청인지 확인합니다. Origin이 있으면 Host와 같아야 합니다.
function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return request.headers['sec-fetch-site'] !== 'cross-site';
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new AuthError(413, '요청이 너무 커요.');
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed;
  } catch {
    throw new AuthError(400, '요청 형식이 올바르지 않아요.');
  }
}

// 화면이 바로 쓰는 세션 정보. care_recipient_id는 보호자는 본인 돌봄 대상, 종사자는 지금 볼 수 있는 첫 배정 대상입니다.
export function buildSession(user, careStore) {
  const center = user.center_id ? careStore.listCenters().find((item) => item.id === user.center_id) : null;
  let recipient = null;
  if (user.role === 'guardian') {
    const mine = careStore.myRecipients(user)[0];
    if (mine) recipient = { id: mine.id, name: mine.name };
  } else if (user.role === 'caregiver') {
    const assignment = careStore.listMyAssignments(user).find((item) => item.can_view_now);
    if (assignment) recipient = { id: assignment.care_recipient_id, name: assignment.care_recipient_name };
  }
  return {
    user_id: user.user_id,
    role: user.role,
    display_name: user.display_name,
    relation: user.relation ?? null,
    caregiver_type: user.caregiver_type ?? null,
    center_id: user.center_id ?? null,
    center_name: center?.name ?? null,
    care_recipient_id: recipient?.id ?? null,
    care_recipient: recipient,
  };
}

export function createAuthHandler({ authStore, careStore, sendJson }) {
  const failures = new Map();

  function currentUser(request) {
    const userId = authStore.userIdFor(readSessionToken(request));
    return userId ? careStore.getUser(userId) ?? null : null;
  }

  function tooManyFailures(ip) {
    const recent = (failures.get(ip) ?? []).filter((time) => Date.now() - time < FAILED_WINDOW_MS);
    failures.set(ip, recent);
    return recent.length >= MAX_FAILED_LOGINS;
  }

  const routes = [
    ['GET', '/api/auth/demo-accounts', () => {
      if (!authStore.exposeDemoAccounts) throw new AuthError(404, 'Not found');
      return { data: authStore.demoAccounts() };
    }],
    ['GET', '/api/auth/session', ({ request }) => {
      const user = currentUser(request);
      if (!user) throw new AuthError(401, '로그인이 필요해요.');
      return { data: buildSession(user, careStore) };
    }],
    // ?roles=guardian,caregiver 형태로 화면·서버가 역할을 한 번에 확인합니다. 로그인 없음 401, 역할 다름 403.
    ['GET', '/api/auth/check-role', ({ request, url }) => {
      const user = currentUser(request);
      if (!user) throw new AuthError(401, '로그인이 필요해요.');
      const wanted = (url.searchParams.get('roles') ?? '').split(',').map((role) => role.trim()).filter(Boolean);
      if (wanted.length === 0 || wanted.some((role) => !ROLES.includes(role))) throw new AuthError(400, 'roles에는 guardian, caregiver, center_admin만 쓸 수 있어요.');
      if (!wanted.includes(user.role)) throw new AuthError(403, '이 화면을 볼 수 있는 역할이 아니에요.');
      return { data: { allowed: true, role: user.role } };
    }],
    ['POST', '/api/auth/login', async ({ request, response }) => {
      const ip = request.socket.remoteAddress ?? 'unknown';
      if (tooManyFailures(ip)) throw new AuthError(429, '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.');
      const body = await readJson(request);
      if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 64 || body.password.length > 128) {
        throw new AuthError(400, '아이디와 비밀번호를 입력해 주세요.');
      }
      const userId = authStore.authenticate(body.username, body.password);
      if (!userId) {
        failures.get(ip).push(Date.now());
        throw new AuthError(401, '아이디 또는 비밀번호가 올바르지 않아요.');
      }
      const token = authStore.createSession(userId);
      response.setHeader('Set-Cookie', cookieHeader(request, token, SESSION_TTL_MS / 1000));
      return { data: buildSession(careStore.getUser(userId), careStore) };
    }],
    ['POST', '/api/auth/logout', ({ request, response }) => {
      const token = readSessionToken(request);
      if (token) authStore.destroySession(token);
      response.setHeader('Set-Cookie', cookieHeader(request, '', 0));
      return { data: { logged_out: true } };
    }],
  ];

  return async function handleAuthRequest({ request, response, url }) {
    if (!url.pathname.startsWith('/api/auth/')) return false;
    const matching = routes.filter(([, path]) => path === url.pathname);
    if (matching.length === 0) {
      sendJson(response, 404, { error: 'Not found' });
      return true;
    }
    const route = matching.find(([method]) => method === request.method);
    if (!route) {
      response.setHeader('Allow', matching.map(([method]) => method).join(', '));
      sendJson(response, 405, { error: 'Method not allowed' });
      return true;
    }
    try {
      if (request.method === 'POST' && !sameOrigin(request)) throw new AuthError(403, '같은 사이트에서 보낸 요청만 받아요.');
      const result = await route[2]({ request, response, url });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof AuthError) sendJson(response, error.status, { error: error.message });
      else sendJson(response, 500, { error: '요청을 처리하지 못했어요.' });
    }
    return true;
  };
}
