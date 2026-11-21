import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DEMO_IDS } from '../care/demo-data.mjs';

// A 담당: 로그인 세션·계정 저장소(메모리). 서버를 다시 시작하면 세션과 가입한 계정이 모두 사라집니다.
// 시연 계정은 D의 시연 사용자(`care/demo-data.mjs`)와 같은 user_id를 씁니다(아이디·비밀번호는 합성 시연값).
// 회원가입 계정은 전화번호를 아이디로 쓰고, 비밀번호는 scrypt 해시로만 보관합니다.

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const ROLES = Object.freeze(['guardian', 'caregiver', 'center_admin']);
export const SIGNUP_ROLES = Object.freeze(['guardian', 'caregiver']);
export const CAREGIVER_TYPES = Object.freeze(['긴급돌봄센터 종사자', '돌봄SOS 매니저', '활동지원사', '특수학교 선생님', '민간돌봄 봉사자', '기타']);

const DEMO_PASSWORD = 'demo-1234';
const DEMO_ACCOUNTS = Object.freeze([
  { user_id: DEMO_IDS.guardian, username: 'guardian', password: DEMO_PASSWORD },
  { user_id: DEMO_IDS.caregiverGn, username: 'caregiver', password: DEMO_PASSWORD },
  { user_id: DEMO_IDS.adminGn, username: 'center', password: DEMO_PASSWORD },
  { user_id: DEMO_IDS.caregiverSos, username: 'caregiver-sos', password: DEMO_PASSWORD },
  { user_id: DEMO_IDS.adminSos, username: 'center-sos', password: DEMO_PASSWORD },
]);

export class SignupError extends Error {
  constructor(status, message, field = null) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

const hashPassword = (password, salt) => scryptSync(password, salt, 32);
// 존재하지 않는 계정도 같은 비용으로 비교해, 응답 시간으로 가입 여부가 드러나지 않게 합니다.
const DUMMY_SALT = randomBytes(16);

// 전화번호에서 숫자만 남깁니다(010-1234-5678 → 01012345678). 전화번호 형식이 아니면 입력을 그대로 돌려줍니다.
export function normalizeLogin(value) {
  const text = String(value ?? '').trim();
  const digits = text.replace(/[\s-]/g, '');
  return /^\d{10,11}$/.test(digits) ? digits : text;
}

// 회원가입 입력 검증. 통과하면 정리된 값을, 아니면 SignupError(400, 메시지, 필드)를 던집니다.
export function validateSignup(input, { centerIds = [] } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  if (!SIGNUP_ROLES.includes(body.role)) throw new SignupError(400, '역할을 골라 주세요.', 'role');
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!displayName) throw new SignupError(400, '이름을 입력해 주세요.', 'display_name');
  if (displayName.length > 20) throw new SignupError(400, '이름은 20자 이하로 입력해 주세요.', 'display_name');
  const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s-]/g, '') : '';
  if (!/^01[016789]\d{7,8}$/.test(phone)) throw new SignupError(400, '전화번호를 010-0000-0000 형식으로 입력해 주세요.', 'phone');
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) throw new SignupError(400, '비밀번호는 8자 이상 입력해 주세요.', 'password');
  if (password.length > 72) throw new SignupError(400, '비밀번호는 72자 이하로 입력해 주세요.', 'password');
  if (body.agree !== true) throw new SignupError(400, '이용 안내에 동의해 주세요.', 'agree');
  const result = { role: body.role, display_name: displayName, phone, password };
  if (body.role === 'caregiver') {
    if (!centerIds.includes(body.center_id)) throw new SignupError(400, '소속 센터를 골라 주세요.', 'center_id');
    if (!CAREGIVER_TYPES.includes(body.caregiver_type)) throw new SignupError(400, '종사자 구분을 골라 주세요.', 'caregiver_type');
    result.center_id = body.center_id;
    result.caregiver_type = body.caregiver_type;
  }
  return result;
}

// getUser(userId)는 D의 careStore.getUser입니다. 역할·프로필은 그쪽 데이터를 단일 출처로 씁니다.
// registerUser·listCenters를 주면 회원가입을 받습니다(없으면 가입 요청은 503).
export function createAuthStore({
  getUser, registerUser = null, listCenters = () => [], now = () => Date.now(), exposeDemoAccounts = process.env.AUTH_EXPOSE_DEMO_ACCOUNTS !== 'off',
} = {}) {
  const sessions = new Map();
  const accounts = new Map(); // 전화번호(숫자) → { user_id, salt, hash }

  return {
    exposeDemoAccounts,
    canSignUp: Boolean(registerUser),

    demoAccounts() {
      return DEMO_ACCOUNTS.flatMap(({ user_id: userId, username, password }) => {
        const user = getUser(userId);
        return user ? [{ role: user.role, display_name: user.display_name, username, password }] : [];
      });
    },

    // 회원가입: 계정을 만들고 사용자 ID를 돌려줍니다. 이미 있는 전화번호·시연 아이디면 409입니다.
    signUp(input) {
      if (!registerUser) throw new SignupError(503, '지금은 회원가입을 받지 않아요.');
      const valid = validateSignup(input, { centerIds: listCenters().map((center) => center.id) });
      if (accounts.has(valid.phone) || DEMO_ACCOUNTS.some((account) => account.username === valid.phone)) {
        throw new SignupError(409, '이미 가입된 전화번호예요. 로그인해 주세요.', 'phone');
      }
      const userId = randomUUID();
      const salt = randomBytes(16);
      registerUser({
        user_id: userId,
        role: valid.role,
        display_name: valid.display_name,
        ...(valid.role === 'caregiver' ? { caregiver_type: valid.caregiver_type, center_id: valid.center_id } : { relation: null }),
      });
      accounts.set(valid.phone, { user_id: userId, salt, hash: hashPassword(valid.password, salt) });
      return userId;
    },

    // 아이디(시연 아이디 또는 전화번호)·비밀번호가 맞으면 사용자 ID를 돌려줍니다. 모든 계정을 같은 방식으로 비교합니다.
    authenticate(username, password) {
      const login = normalizeLogin(username);
      const record = accounts.get(login) ?? null;
      const computed = hashPassword(password, record?.salt ?? DUMMY_SALT);
      const registeredMatch = record && timingSafeEqual(computed, record.hash);
      let demo = null;
      for (const account of DEMO_ACCOUNTS) {
        if (safeEqual(account.username, login) && safeEqual(account.password, password)) demo = account;
      }
      const userId = registeredMatch ? record.user_id : demo?.user_id ?? null;
      return userId && getUser(userId) ? userId : null;
    },

    createSession(userId) {
      const token = randomUUID();
      sessions.set(token, { userId, expiresAt: now() + SESSION_TTL_MS });
      return token;
    },

    // 유효한 세션이면 user_id, 아니면 null(만료된 세션은 지웁니다).
    userIdFor(token) {
      const entry = token ? sessions.get(token) : null;
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        sessions.delete(token);
        return null;
      }
      return entry.userId;
    },

    destroySession(token) {
      sessions.delete(token);
    },
  };
}
