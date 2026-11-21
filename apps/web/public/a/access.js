// 기능 A: 역할별 탭·시작 화면·접근 규칙. 브라우저와 테스트(Node)에서 함께 씁니다.

export const ROLE_LABEL = { guardian: '보호자', caregiver: '돌봄 선생님', center_admin: '센터 관리자' };

export const HOME = { guardian: '/g/home', caregiver: '/c/home', center_admin: '/c/center-admin' };

// 하단 탭 4개. 센터 관리자는 탭 없이 센터 화면 하나만 씁니다.
export const TABS = {
  guardian: [
    { path: '/g/home', label: '홈', icon: 'home' },
    { path: '/g/manual', label: '설명서', icon: 'doc' },
    { path: '/g/care', label: '아이 맡기기', icon: 'heart' },
    { path: '/g/my', label: '마이페이지', icon: 'user' },
  ],
  caregiver: [
    { path: '/c/home', label: '홈', icon: 'home' },
    { path: '/c/manual', label: '설명서', icon: 'doc' },
    { path: '/c/records', label: '돌봄기록', icon: 'mic' },
    { path: '/c/my', label: '마이페이지', icon: 'user' },
  ],
  center_admin: [],
};

// 하위 경로(예: /g/care/new)도 같은 규칙을 따릅니다.
export function allowedRoles(path) {
  if (path === '/login' || path === '/signup') return 'public';
  if (path === '/c/center-admin') return ['center_admin', 'caregiver'];
  if (path.startsWith('/g/')) return ['guardian'];
  if (path.startsWith('/c/')) return ['caregiver'];
  return null;
}

export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(query) };
}

// 어떤 화면을 보여 줄지 정합니다. 세션이 없거나 역할이 다르면 로그인·자기 홈으로 보냅니다.
export function resolveRoute(session, path) {
  const rule = allowedRoles(path);
  if (rule === 'public') return session ? { action: 'redirect', to: HOME[session.role] } : { action: 'render' };
  if (!session) {
    return { action: 'redirect', to: path === '/' || !rule ? '/login' : `/login?next=${encodeURIComponent(path)}` };
  }
  if (!rule || !rule.includes(session.role)) return { action: 'redirect', to: HOME[session.role] };
  return { action: 'render' };
}

// 보호자 온보딩: 기본 정보(1/4) → 증명사진(2/4) → 캐릭터(3/4) → 처음 질문지(4/4, B의 /g/manual).
export const ONBOARDING_STEPS = Object.freeze(['/g/onboarding/profile', '/g/onboarding/photo', '/g/onboarding/avatar']);

export function isOnboardingPath(path) {
  return path.startsWith('/g/onboarding/');
}

// 회원가입을 막 마친 보호자(signupPending)는 온보딩을 끝낼 때까지 온보딩 첫 화면으로 보냅니다.
// 기존 계정으로 로그인하는 흐름은 온보딩을 거치지 않습니다. 온보딩을 마친 뒤에는 온보딩 화면도 다시 열 수 있습니다(정보 고치기).
export function resolveOnboarding(session, path, signupPending) {
  if (session?.role !== 'guardian' || !signupPending || isOnboardingPath(path)) return null;
  return { action: 'redirect', to: ONBOARDING_STEPS[0] };
}

// 로그인 뒤 돌아갈 주소. 이 사용자가 열 수 있는 앱 안의 경로일 때만 씁니다.
export function safeNext(next, session) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return HOME[session.role];
  return resolveRoute(session, next).action === 'render' && next !== '/login' ? next : HOME[session.role];
}
