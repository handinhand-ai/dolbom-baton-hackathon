// 보호자 온보딩 데이터: 검증, 기기 저장, 캐릭터 옷 색 계산. 브라우저와 테스트(Node)에서 함께 씁니다.
// 입력값은 이 기기(localStorage)에만 저장합니다. 증명사진은 서버로 보내지 않습니다.

export const BODY_TYPES = Object.freeze(['마른 편', '보통', '통통한 편']);
export const ITEMS = Object.freeze(['헤드폰', '안경', '모자', '휠체어', '보청기', '가방']);
// 옷 색: 이름, 화면 색, 캐릭터 옷에 적용할 색상(hue, 도). dark는 채도를 낮춥니다.
export const COLORS = Object.freeze([
  { id: 'orange', label: '주황', swatch: '#ff7a1a', hue: null },
  { id: 'red', label: '빨강', swatch: '#ef4452', hue: 355 },
  { id: 'blue', label: '파랑', swatch: '#3f63f3', hue: 228 },
  { id: 'green', label: '초록', swatch: '#22a065', hue: 150 },
  { id: 'purple', label: '보라', swatch: '#8b5cf6', hue: 262 },
  { id: 'dark', label: '검정', swatch: '#3b3f55', hue: 'dark' },
]);

const KEY = 'baton.onboarding.v1';
const PHOTO_KEY = 'baton.photo.v1';

function intInRange(value, min, max) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : NaN;
}

// 오류는 { 필드: 메시지 } 로 돌려줍니다. 비어 있으면 통과입니다.
export function validateReceiver({ name, age, sex, heightCm, weightKg, impression }) {
  const errors = {};
  const trimmed = String(name ?? '').trim();
  if (!trimmed) errors.name = '이름을 입력해 주세요.';
  else if (trimmed.length > 20) errors.name = '이름은 20자 이하로 입력해 주세요.';
  if (intInRange(age, 0, 120) === null) errors.age = '나이를 입력해 주세요.';
  else if (Number.isNaN(intInRange(age, 0, 120))) errors.age = '나이는 0~120 사이 숫자로 입력해 주세요.';
  if (!['남', '여'].includes(sex)) errors.sex = '성별을 골라 주세요.';
  if (Number.isNaN(intInRange(heightCm, 50, 250))) errors.heightCm = '키는 50~250cm 사이 숫자로 입력해 주세요.';
  if (Number.isNaN(intInRange(weightKg, 10, 300))) errors.weightKg = '몸무게는 10~300kg 사이 숫자로 입력해 주세요.';
  if (String(impression ?? '').length > 120) errors.impression = '인상착의는 120자 이하로 적어 주세요.';
  return errors;
}

// 받침 유무에 따라 '을/를'을 붙입니다(예: 민준이 → 민준이를, 민준 → 민준을).
export function withObjectParticle(name) {
  const last = String(name).trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${name}를`;
  return `${name}${(code - 0xac00) % 28 === 0 ? '를' : '을'}`;
}

export function normalizeReceiver(input) {
  return {
    name: String(input.name).trim(),
    age: Number(input.age),
    sex: input.sex,
    heightCm: input.heightCm === '' || input.heightCm == null ? null : Number(input.heightCm),
    weightKg: input.weightKg === '' || input.weightKg == null ? null : Number(input.weightKg),
    impression: String(input.impression ?? '').trim(),
  };
}

export function validateAvatar({ body, items, color }) {
  if (!BODY_TYPES.includes(body)) return false;
  if (!Array.isArray(items) || items.some((item) => !ITEMS.includes(item))) return false;
  return COLORS.some((entry) => entry.id === color);
}

export function defaultAvatar() {
  return { body: '보통', items: ['헤드폰'], color: 'orange' };
}

// userId마다 따로 저장합니다. storage는 localStorage처럼 getItem/setItem/removeItem을 가진 객체입니다.
export function createOnboardingStore(storage, userId) {
  const key = `${KEY}.${userId}`;
  const photoKey = `${PHOTO_KEY}.${userId}`;
  const read = (name) => {
    try {
      return JSON.parse(storage?.getItem(name) ?? 'null');
    } catch {
      return null;
    }
  };
  const write = (name, value) => {
    if (!storage) return false;
    try {
      storage.setItem(name, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  return {
    load() {
      const data = read(key);
      return data && typeof data === 'object' ? data : {};
    },
    save(patch) {
      return write(key, { ...this.load(), ...patch });
    },
    isOnboarded() {
      return Boolean(this.load().onboardedAt);
    },
    // 회원가입 직후에만 켜서, 온보딩을 끝낼 때까지 다른 화면으로 못 가게 합니다(기존 계정 로그인은 해당 없음).
    markSignupPending() {
      return this.save({ signupPending: true });
    },
    isSignupPending() {
      const data = this.load();
      return data.signupPending === true && !data.onboardedAt;
    },
    complete(now = new Date()) {
      return this.save({ onboardedAt: now.toISOString(), signupPending: false });
    },
    loadPhoto() {
      const photo = read(photoKey);
      return typeof photo === 'string' && photo.startsWith('data:image/') ? photo : null;
    },
    savePhoto(dataUrl) {
      return write(photoKey, dataUrl);
    },
    clear() {
      try {
        storage?.removeItem(key);
        storage?.removeItem(photoKey);
      } catch {
        // 저장소를 쓸 수 없으면 지울 것도 없습니다.
      }
    },
  };
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const rn = r / 255;
  const gn = g / 255;
  let h;
  if (max === rn) h = ((gn - b / 255) / d) % 6;
  else if (max === gn) h = (b / 255 - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// 캐릭터 그림에서 주황색 옷(색상 10~50도, 채도 높음)만 골라 새 색으로 바꿉니다. 머리·헤드폰은 그대로입니다.
export function recolorHoodie(pixels, colorId) {
  const color = COLORS.find((entry) => entry.id === colorId);
  if (!color || color.hue === null) return pixels;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (h < 10 || h > 50 || s < 0.45) continue;
    const [r, g, b] = color.hue === 'dark' ? hslToRgb(230, 0.18, l * 0.55) : hslToRgb(color.hue, s, l);
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
  return pixels;
}
