// 화면 자리표. B·C·D는 자기 화면을 만든 뒤 아래 표의 해당 경로 한 줄만 교체합니다.
//   예) '/g/manual': (view, ctx) => renderManual(view, ctx),
// render(view, { session })는 view 안에 화면을 그립니다. 탭 틀·로그인 확인은 shell.js가 맡습니다.
import { h } from './dom.js';
import { renderLogin } from './login.js';
import { renderSignup } from './signup.js';
import { renderProfile, renderPhoto, renderAvatar } from './onboarding-screens.js';
import { renderMyPage } from './my.js';
import { renderQuestionnaire } from '../b/questionnaire.js';
import {
  renderGuardianHome, renderVoicePending, renderCareStatus, renderCareNew,
  renderCaregiverHome, renderCaregiverCard, renderCaregiverRecords,
  renderCenterAdmin, renderUnconfirmedFeature,
} from './figma-features.js';

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

function guardianHome(view, { session }) {
  const child = session.care_recipient;
  view.append(
    h('p', { class: 'logo brand', text: '돌봄바통' }),
    h('section', { class: 'hero' },
      h('h1', { tabindex: '-1', text: child ? `${child.name} 돌봄 설명서` : '돌봄 설명서' }),
      child ? h('img', { class: 'character', src: CHARACTER, alt: `${child.name} 캐릭터`, width: '190', height: '229' }) : h('p', { class: 'muted', text: '등록된 돌봄 대상이 없어요.' })),
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
  ['/g/onboarding/profile', renderProfile],
  ['/g/onboarding/photo', renderPhoto],
  ['/g/onboarding/avatar', renderAvatar],
  ['/g/home', renderGuardianHome],
  ['/g/voice', renderVoicePending],
  ['/g/manual', renderQuestionnaire],
  ['/g/care', renderCareStatus],
  ['/g/care/new', renderCareNew],
  ['/g/care/availability', (view, ctx) => renderUnconfirmedFeature(view, ctx, '센터 잔여 현황', '실시간 센터 잔여 인원 API가 아직 연동되지 않았습니다.')],
  ['/g/care/preference', (view, ctx) => renderUnconfirmedFeature(view, ctx, '희망 돌봄자', '희망 사항은 아이 맡기기 신청의 요청사항으로 전달할 수 있습니다.')],
  ['/g/my', renderMyPage],
  ['/c/home', renderCaregiverHome],
  ['/c/manual', renderCaregiverCard],
  ['/c/records', renderCaregiverRecords],
  ['/c/my', renderMyPage],
  ['/c/center-admin', renderCenterAdmin],
]);
