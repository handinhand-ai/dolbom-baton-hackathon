import { DEMO_IDS } from '../care/demo-data.mjs';
import { ROLES, SESSION_TTL_MS, SignupError } from './auth-store.mjs';

// /api/auth/* 요청 처리. 처리했으면 true, 담당 경로가 아니면 false를 돌려줍니다.
// 응답은 D와 같은 형식입니다: 성공 { data }, 실패 { error }.

const COOKIE = 'baton_session';
const MAX_BODY_BYTES = 2048;
const MAX_FAILED_LOGINS = 10;
const FAILED_WINDOW_MS = 60_000;
const MAX_SIGNUPS = 10;

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

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new AuthError(413, '요청이 너무 커요.');
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
  const signups = new Map();

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
      const userId = await authStore.authenticate(body.username, body.password);
      if (!userId) {
        failures.get(ip).push(Date.now());
        throw new AuthError(401, '아이디 또는 비밀번호가 올바르지 않아요.');
      }
      const token = authStore.createSession(userId);
      response.setHeader('Set-Cookie', cookieHeader(request, token, SESSION_TTL_MS / 1000));
      return { data: buildSession(careStore.getUser(userId), careStore) };
    }],
    // 회원가입: 계정을 만들고 바로 로그인 상태(쿠키)로 만듭니다. 입력 오류 400(+field), 이미 가입 409, 너무 잦은 시도 429.
    ['POST', '/api/auth/signup', async ({ request, response }) => {
      const ip = request.socket.remoteAddress ?? 'unknown';
      const recent = (signups.get(ip) ?? []).filter((time) => Date.now() - time < FAILED_WINDOW_MS);
      signups.set(ip, recent);
      if (recent.length >= MAX_SIGNUPS) throw new AuthError(429, '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.');
      const body = await readJson(request);
      let userId;
      try {
        userId = await authStore.signUp(body);
      } catch (error) {
        // 계정 생성까지 간 시도(이미 가입 409 포함)만 횟수에 넣습니다. 입력 오류(400)는 비용이 작아 세지 않습니다.
        if (error instanceof SignupError && error.status === 409) recent.push(Date.now());
        throw error;
      }
      recent.push(Date.now());
      const token = authStore.createSession(userId);
      response.setHeader('Set-Cookie', cookieHeader(request, token, SESSION_TTL_MS / 1000));
      return [201, { data: buildSession(careStore.getUser(userId), careStore) }];
    }],
    // 가입한 보호자의 돌봄 대상 이름을 저장합니다(온보딩 1/4). 이 값이 있어야 질문지·아이 맡기기가 대상을 찾습니다.
    ['POST', '/api/auth/recipient', async ({ request }) => {
      const user = currentUser(request);
      if (!user) throw new AuthError(401, '로그인이 필요해요.');
      if (user.role !== 'guardian') throw new AuthError(403, '보호자만 돌봄 대상을 등록할 수 있어요.');
      const body = await readJson(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 20) throw new AuthError(400, '이름은 1~20자로 입력해 주세요.');
      if (user.user_id === DEMO_IDS.guardian) throw new AuthError(403, '시연 계정의 돌봄 대상은 바꿀 수 없어요.');
      await authStore.saveProfile(user.user_id, { receiver: { name } });
      return { data: buildSession(user, careStore) };
    }],
    ['GET', '/api/auth/profile', async ({ request }) => {
      const user = currentUser(request);
      if (!user) throw new AuthError(401, '로그인이 필요해요.');
      if (user.role !== 'guardian') throw new AuthError(403, '보호자 프로필만 불러올 수 있어요.');
      return { data: await authStore.getProfile(user.user_id) };
    }],
    ['PUT', '/api/auth/profile', async ({ request }) => {
      const user = currentUser(request);
      if (!user) throw new AuthError(401, '로그인이 필요해요.');
      if (user.role !== 'guardian') throw new AuthError(403, '보호자 프로필만 저장할 수 있어요.');
      const body = await readJson(request, 2 * 1024 * 1024);
      if (body.photo !== undefined && body.photo !== null
        && (typeof body.photo !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/.test(body.photo))) {
        throw new AuthError(400, '이미지 형식이 올바르지 않아요.');
      }
      return { data: await authStore.saveProfile(user.user_id, body) };
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
      const [status, body] = Array.isArray(result) ? result : [200, result];
      sendJson(response, status, body);
    } catch (error) {
      if (error instanceof SignupError) sendJson(response, error.status, { error: error.message, ...(error.field ? { field: error.field } : {}) });
      else if (error instanceof AuthError) sendJson(response, error.status, { error: error.message });
      else sendJson(response, 500, { error: '요청을 처리하지 못했어요.' });
    }
    return true;
  };
}
