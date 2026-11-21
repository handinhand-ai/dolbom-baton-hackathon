// 화면 자리표. B·C·D는 자기 화면을 만든 뒤 아래 표의 해당 경로 한 줄만 교체합니다.
//   예) '/g/manual': (view, ctx) => renderManual(view, ctx),
// render(view, { session })는 view 안에 화면을 그립니다. 탭 틀·로그인 확인은 shell.js가 맡습니다.
import { h } from './dom.js';
import { renderLogin } from './login.js';
import { renderSignup } from './signup.js';
import { renderMyPage } from './my.js';
import { renderQuestionnaire } from '../b/questionnaire.js';
import { characterUrl, renderAvatar, renderPhoto, renderProfile } from './onboarding-screens.js';
import { createOnboardingStore } from './onboarding.js';

const CHARACTER = '/a/assets/minjun.png';

// link를 주면 이미 만들어진 D의 시연 화면(/care)으로 가는 버튼을 함께 보여 줍니다.
function placeholder(title, owner, note, link) {
  return (view) => {
    view.append(
      h('h1', { tabindex: '-1', text: title }),
      h('div', { class: 'card empty' },
        h('p', { class: 'strong', text: note ?? '이 화면은 아직 만들어지지 않았어요.' }),
        h('p', { class: 'muted', text: `담당: ${owner}` })),
      ...(link ? [h('a', { class: 'button secondary', href: link.href, text: link.label })] : []),
    );
  };
}

const D_SCREEN = { href: '/care', label: 'D 시연 화면 열기' };

// 온보딩에서 입력한 정보(이 기기에 저장)가 있으면 그것을, 없으면 로그인 세션의 돌봄 대상 이름을 보여 줍니다.
async function guardianHome(view, { session }) {
  const saved = createOnboardingStore(globalThis.localStorage, session.user_id).load();
  const receiver = saved.receiver;
  const name = receiver?.name ?? session.care_recipient?.name;
  const facts = receiver ? [`${receiver.age}세 ${receiver.sex}`, receiver.heightCm ? `${receiver.heightCm}cm` : null, receiver.weightKg ? `${receiver.weightKg}kg` : null].filter(Boolean).join(' · ') : null;
  let source = CHARACTER;
  if (saved.avatar?.color) {
    try {
      source = await characterUrl(saved.avatar.color);
    } catch {
      source = CHARACTER;
    }
  }
  view.append(
    h('p', { class: 'logo brand', text: '돌봄바통' }),
    h('section', { class: 'hero' },
      h('h1', { tabindex: '-1', text: name ? `${name} 돌봄 설명서` : '돌봄 설명서' }),
      facts ? h('p', { class: 'muted', text: facts }) : null,
      name ? h('img', { class: 'character', src: source, alt: `${name} 캐릭터`, width: '190', height: '229' }) : h('p', { class: 'muted', text: '등록된 돌봄 대상이 없어요.' }),
      receiver?.impression ? h('p', { class: 'muted', text: receiver.impression }) : null),
    h('div', { class: 'card empty' }, h('p', { class: 'muted', text: '말로 기록하는 입력바는 C, 꼭 알아야 할 정보는 B가 이 자리에 붙입니다.' })),
  );
}

function caregiverHome(view, { session }) {
  view.append(h('p', { class: 'logo brand', text: '돌봄바통' }), h('h1', { class: 'center', tabindex: '-1', text: '홈' }));
  if (!session.care_recipient_id) {
    view.append(h('div', { class: 'card empty' },
      h('p', { class: 'strong', text: '아직 배정된 대상이 없어요' }),
      h('p', { class: 'muted', text: '센터에서 배정하면 여기에 보여요.' })));
    return;
  }
  view.append(h('div', { class: 'card empty' }, h('p', { class: 'muted', text: '배정된 대상 화면은 C·D가 이 자리에 붙입니다.' })));
}

export const screens = new Map([
  ['/login', renderLogin],
  ['/signup', renderSignup],
  ['/g/home', guardianHome],
  ['/g/onboarding/profile', renderProfile],
  ['/g/onboarding/photo', renderPhoto],
  ['/g/onboarding/avatar', renderAvatar],
  ['/g/manual', renderQuestionnaire],
  ['/g/care', placeholder('아이 맡기기', 'D', '아이 맡기기 화면을 이 탭에 연결할 예정이에요.', D_SCREEN)],
  ['/g/my', renderMyPage],
  ['/c/home', caregiverHome],
  ['/c/manual', placeholder('설명서', 'B (한 장 카드)', '배정된 대상이 보내 준 설명서가 여기에 보여요.')],
  ['/c/records', placeholder('돌봄기록', 'C')],
  ['/c/my', renderMyPage],
  ['/c/center-admin', placeholder('센터 화면 (시연용)', 'D', '들어온 요청을 수락하고 종사자를 배정하는 화면이에요.', D_SCREEN)],
]);
