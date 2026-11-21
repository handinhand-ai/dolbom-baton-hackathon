// 보호자 온보딩 화면 3장: 기본 정보(1/4) · 증명사진(2/4) · 캐릭터(3/4). 4/4 처음 질문지는 B의 /g/manual입니다.
// 입력값은 이 기기에만 저장합니다(onboarding.js). 증명사진은 서버로 보내지 않습니다.
import { ONBOARDING_STEPS } from './access.js';
import { saveRecipient } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import {
  BODY_TYPES, COLORS, ITEMS, createOnboardingStore, defaultAvatar, normalizeReceiver, recolorHoodie, validateAvatar, validateReceiver, withObjectParticle,
} from './onboarding.js';

const CHARACTER = '/a/assets/minjun.png';
const QUESTIONNAIRE_PATH = '/g/manual';
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function storeFor(session) {
  let storage = null;
  try {
    storage = globalThis.localStorage;
  } catch {
    storage = null;
  }
  return createOnboardingStore(storage, session.user_id);
}

function topBar(step, onBack) {
  const back = h('button', { type: 'button', class: 'back', 'aria-label': '이전', onclick: onBack }, icon('back', 24));
  if (!onBack) back.disabled = true;
  return h('div', { class: 'ob-top' },
    h('div', { class: 'ob-row' }, back, h('span', { class: 'ob-count', text: `${step}/4` })),
    h('div', { class: 'ob-progress', role: 'img', 'aria-label': `4단계 중 ${step}단계` },
      [1, 2, 3, 4].map((index) => h('span', { class: index <= step ? 'on' : '' }))));
}

function heading(lines, sub) {
  const title = h('h1', { class: 'ob-title', tabindex: '-1' });
  lines.forEach((line, index) => {
    if (index) title.append(' ', h('br'));
    title.append(line);
  });
  return [title, h('p', { class: 'ob-sub', text: sub })];
}

function textField({ id, label, value = '', suffix, inputmode, maxlength, error }) {
  const input = h('input', { id, name: id, value: String(value ?? ''), inputmode, maxlength, 'aria-describedby': `${id}-err`, autocomplete: 'off' });
  const message = h('p', { class: 'field-error', id: `${id}-err`, hidden: true });
  const box = h('div', { class: 'ob-input' }, input, suffix ? h('span', { class: 'suffix', text: suffix }) : null);
  return {
    input,
    node: h('div', { class: 'ob-field' }, label ? h('label', { for: id, text: label }) : null, box, message),
    setError(text) {
      message.hidden = !text;
      message.textContent = text ?? '';
      input.setAttribute('aria-invalid', text ? 'true' : 'false');
    },
  };
}

export function renderProfile(view, { session, navigate }) {
  const store = storeFor(session);
  const saved = store.load().receiver ?? {};
  let sex = saved.sex ?? null;

  const name = textField({ id: 'name', label: '이름', value: saved.name, maxlength: 20 });
  const age = textField({ id: 'age', value: saved.age, suffix: '세', inputmode: 'numeric', maxlength: 3 });
  const height = textField({ id: 'height', value: saved.heightCm, suffix: 'cm', inputmode: 'numeric', maxlength: 3 });
  const weight = textField({ id: 'weight', value: saved.weightKg, suffix: 'kg', inputmode: 'numeric', maxlength: 3 });
  const impression = h('textarea', { id: 'impression', rows: '3', maxlength: '120', placeholder: '예: 보통 체형, 왼쪽 볼에 작은 점이 있어요.', 'aria-describedby': 'impression-err' });
  impression.value = saved.impression ?? '';
  const impressionError = h('p', { class: 'field-error', id: 'impression-err', hidden: true });

  const sexButtons = ['남', '여'].map((value) => h('button', {
    type: 'button', class: 'seg', 'aria-pressed': String(sex === value), text: value,
    onclick: () => { sex = value; sexButtons.forEach((node) => node.setAttribute('aria-pressed', String(node.textContent === value))); sexError.hidden = true; },
  }));
  const sexError = h('p', { class: 'field-error', hidden: true });

  // 말로 입력: 브라우저가 음성 인식을 지원할 때만 보입니다. 인식한 글은 인상착의 끝에 덧붙입니다.
  const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
  let listening = null;
  const mic = Recognition ? h('button', { type: 'button', class: 'mic', 'aria-label': '말로 입력하기', 'aria-pressed': 'false' }, icon('mic', 20)) : null;
  mic?.addEventListener('click', () => {
    if (listening) { listening.stop(); return; }
    const recognition = new Recognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = [...event.results].map((result) => result[0].transcript).join(' ').trim();
      if (text) impression.value = `${impression.value.trim()} ${text}`.trim().slice(0, 120);
    };
    recognition.onend = () => { listening = null; mic.setAttribute('aria-pressed', 'false'); };
    recognition.onerror = () => { listening = null; mic.setAttribute('aria-pressed', 'false'); };
    listening = recognition;
    mic.setAttribute('aria-pressed', 'true');
    recognition.start();
  });

  const button = h('button', { type: 'button', text: '다음' });
  button.addEventListener('click', async () => {
    const input = { name: name.input.value, age: age.input.value.trim(), sex, heightCm: height.input.value.trim(), weightKg: weight.input.value.trim(), impression: impression.value };
    const errors = validateReceiver(input);
    name.setError(errors.name);
    age.setError(errors.age);
    height.setError(errors.heightCm);
    weight.setError(errors.weightKg);
    sexError.textContent = errors.sex ?? '';
    sexError.hidden = !errors.sex;
    impressionError.textContent = errors.impression ?? '';
    impressionError.hidden = !errors.impression;
    if (Object.keys(errors).length) { view.querySelector('[aria-invalid="true"], .field-error:not([hidden])')?.scrollIntoView?.({ block: 'center' }); return; }
    const receiver = normalizeReceiver(input);
    if (!store.save({ receiver })) {
      impressionError.textContent = '이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.';
      impressionError.hidden = false;
      return;
    }
    // 서버에는 돌봄 대상 이름만 보냅니다(질문지·아이 맡기기가 대상을 찾는 데 필요). 시연 계정은 403이라 건너뜁니다.
    button.disabled = true;
    try {
      await saveRecipient(receiver.name);
    } catch (error) {
      if (error.status !== 403) {
        button.disabled = false;
        impressionError.textContent = error.message;
        impressionError.hidden = false;
        return;
      }
    }
    button.disabled = false;
    navigate(ONBOARDING_STEPS[1]);
  });

  view.classList.add('onboarding');
  view.append(
    topBar(1, store.isOnboarded() ? () => navigate('/g/home') : null),
    ...heading(['아이에 대해', '기본 정보를 알려주세요'], '종사자가 처음 만났을 때 알아볼 수 있게 해줘요'),
    name.node,
    h('div', { class: 'ob-field' }, h('span', { class: 'ob-label', text: '나이 · 성별' }),
      h('div', { class: 'ob-pair' }, age.node, h('div', { class: 'segmented', role: 'group', 'aria-label': '성별' }, sexButtons)), sexError),
    h('div', { class: 'ob-field' }, h('span', { class: 'ob-label', text: '키 · 몸무게' }), h('div', { class: 'ob-pair' }, height.node, weight.node)),
    h('div', { class: 'ob-field' }, h('label', { for: 'impression', text: '인상착의' }),
      h('div', { class: 'ob-textarea' }, impression, mic), impressionError,
      h('p', { class: 'ob-hint', text: Recognition ? '말로 말해도 돼요. 인식한 글을 확인하고 고쳐 주세요.' : '짧게 적어 주세요. 미아가 생겼을 때 알아보는 데 쓰여요.' })),
    h('div', { class: 'ob-spacer' }),
    button,
  );
}

// 사진을 3:4 비율 안으로 줄여 JPEG 데이터로 바꿉니다. 이 기기 밖으로 보내지 않습니다.
async function compressPhoto(file) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error('JPG, PNG, WEBP 사진만 올릴 수 있어요.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('사진은 10MB 이하로 올려 주세요.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 600 / bitmap.width, 800 / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function renderPhoto(view, { session, navigate }) {
  const store = storeFor(session);
  let photo = store.loadPhoto();
  const fileInput = h('input', { type: 'file', accept: PHOTO_TYPES.join(','), class: 'visually-hidden', 'aria-label': '증명사진 파일 선택' });
  const message = h('p', { class: 'notice error', role: 'alert', hidden: true });
  const slot = h('button', { type: 'button', class: 'photo-slot', onclick: () => fileInput.click() });

  function paintSlot() {
    slot.replaceChildren();
    if (photo) {
      slot.append(h('img', { src: photo, alt: '등록한 증명사진 미리보기' }), h('span', { class: 'photo-change', text: '다시 올리기' }));
    } else {
      slot.append(icon('camera', 28), h('span', { class: 'photo-cta', text: '사진 올리기' }), h('span', { class: 'photo-hint', text: '3×4 정면 사진' }));
    }
  }
  paintSlot();

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    message.hidden = true;
    try {
      photo = await compressPhoto(file);
      paintSlot();
    } catch (error) {
      message.textContent = error.message?.includes('만') || error.message?.includes('이하') ? error.message : '사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.';
      message.hidden = false;
    }
    fileInput.value = '';
  });

  const protect = ['평소 화면엔 캐릭터만 보여요', '미아가 생겼을 때만 센터에서 열람해요', '누가 언제 봤는지 기록이 남아요', '이용 기간이 끝나면 자동으로 닫혀요', 'AI에는 보내지 않아요'];
  const next = h('button', { type: 'button', text: '등록하고 다음' });
  next.addEventListener('click', () => {
    if (!photo) { message.textContent = '사진을 올리거나 \'나중에 할게요\'를 눌러 주세요.'; message.hidden = false; return; }
    if (!store.savePhoto(photo)) { message.textContent = '이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.'; message.hidden = false; return; }
    navigate(ONBOARDING_STEPS[2]);
  });

  view.classList.add('onboarding');
  view.append(
    topBar(2, () => navigate(ONBOARDING_STEPS[0])),
    ...heading(['미아 방지용', '증명사진을 등록해요'], '정말 필요할 때만 센터에서 열어볼 수 있어요'),
    slot, fileInput, message,
    h('section', { class: 'card protect', 'aria-labelledby': 'protect-title' },
      h('p', { class: 'protect-title', id: 'protect-title' }, icon('lock', 18), '사진은 이렇게 보호돼요'),
      h('ul', {}, protect.map((text) => h('li', {}, h('span', { class: 'dot' }, icon('check', 12)), text)))),
    h('div', { class: 'ob-spacer' }),
    next,
    h('button', { type: 'button', class: 'link', text: '나중에 할게요', onclick: () => navigate(ONBOARDING_STEPS[2]) }),
  );
}

let characterPixels = null;
async function loadCharacter() {
  if (characterPixels) return characterPixels;
  const image = new Image();
  image.src = CHARACTER;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  characterPixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return characterPixels;
}

// 선택한 옷 색을 입힌 캐릭터 그림(데이터 URL). 색 계산은 onboarding.js의 recolorHoodie입니다.
export async function characterUrl(colorId) {
  const original = await loadCharacter();
  const copy = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
  recolorHoodie(copy.data, colorId);
  const canvas = document.createElement('canvas');
  canvas.width = copy.width;
  canvas.height = copy.height;
  canvas.getContext('2d').putImageData(copy, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function renderAvatar(view, { session, navigate }) {
  const store = storeFor(session);
  const stored = store.load().avatar;
  const avatar = validateAvatar(stored ?? {}) ? { ...stored, items: [...stored.items] } : defaultAvatar();
  const name = store.load().receiver?.name ?? '아이';

  const picture = h('img', { class: 'character-big', alt: `${name} 캐릭터`, width: '190', height: '229', src: CHARACTER });
  async function paint() {
    picture.style.transform = `scaleX(${avatar.body === '마른 편' ? 0.92 : avatar.body === '통통한 편' ? 1.1 : 1})`;
    try {
      picture.src = await characterUrl(avatar.color);
    } catch {
      picture.src = CHARACTER;
    }
  }

  const bodyButtons = BODY_TYPES.map((value) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(avatar.body === value), text: value }));
  bodyButtons.forEach((node) => node.addEventListener('click', () => {
    avatar.body = node.textContent;
    bodyButtons.forEach((other) => other.setAttribute('aria-pressed', String(other === node)));
    paint();
  }));
  const itemButtons = ITEMS.map((value) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(avatar.items.includes(value)), text: value }));
  itemButtons.forEach((node) => node.addEventListener('click', () => {
    const value = node.textContent;
    avatar.items = avatar.items.includes(value) ? avatar.items.filter((item) => item !== value) : [...avatar.items, value];
    node.setAttribute('aria-pressed', String(avatar.items.includes(value)));
  }));
  const colorButtons = COLORS.map((color) => h('button', {
    type: 'button', class: 'swatch', 'data-color': color.id, 'aria-label': `옷 색 ${color.label}`, 'aria-pressed': String(avatar.color === color.id),
  }));
  colorButtons.forEach((node, index) => node.addEventListener('click', () => {
    avatar.color = COLORS[index].id;
    colorButtons.forEach((other) => other.setAttribute('aria-pressed', String(other === node)));
    paint();
  }));

  const message = h('p', { class: 'notice error', role: 'alert', hidden: true });
  const next = h('button', { type: 'button', text: '다음' });
  next.addEventListener('click', () => {
    if (!validateAvatar(avatar) || !store.save({ avatar }) || !store.complete()) {
      message.textContent = '이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.';
      message.hidden = false;
      return;
    }
    navigate(QUESTIONNAIRE_PATH);
  });

  view.classList.add('onboarding');
  view.append(
    topBar(3, () => navigate(ONBOARDING_STEPS[1])),
    ...heading(['사진 대신', `캐릭터로 ${withObjectParticle(name)} 표현해요`], '평소 화면에는 이 캐릭터만 보여요'),
    h('div', { class: 'character-stage' }, picture),
    h('div', { class: 'ob-field' }, h('span', { class: 'ob-label', text: '체형' }), h('div', { class: 'pills', role: 'group', 'aria-label': '체형' }, bodyButtons)),
    h('div', { class: 'ob-field' }, h('span', { class: 'ob-label', text: '늘 하고 다니는 것' }), h('div', { class: 'pills', role: 'group', 'aria-label': '늘 하고 다니는 것' }, itemButtons)),
    h('div', { class: 'ob-field' }, h('span', { class: 'ob-label', text: '옷 색' }), h('div', { class: 'swatches', role: 'group', 'aria-label': '옷 색' }, colorButtons)),
    message,
    h('div', { class: 'ob-spacer' }),
    next,
  );
  await paint();
}
