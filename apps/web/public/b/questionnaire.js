import { h } from '../a/dom.js';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new Error(body?.error ?? '질문지 정보를 불러오지 못했어요.');
  return body;
}
function groupOptions(options) {
  const groups = new Map();
  for (const option of options) {
    const key = option.option_group || '선택해 주세요';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(option);
  }
  return groups;
}

function answerFor(answers, questionId) {
  if (!answers.has(questionId)) answers.set(questionId, { optionIds: new Set(), text: '' });
  return answers.get(questionId);
}

export async function renderQuestionnaire(view, { session, navigate }) {
  view.classList.add('b-questionnaire');
  if (!session.care_recipient_id) {
    view.append(
      h('h1', { tabindex: '-1', text: '아이에 대해 알려주세요' }),
      h('p', { class: 'notice error', role: 'alert', text: '연결된 돌봄 대상이 없어 질문지를 작성할 수 없어요.' }),
    );
    return;
  }

  const loading = h('div', { class: 'b-state', role: 'status', text: '질문을 불러오고 있어요.' });
  view.append(loading);
  let questions;
  let saved;
  try {
    const [questionBody, answerBody] = await Promise.all([
      api('/api/questionnaire'),
      api('/api/questionnaire/answers'),
    ]);
    questions = questionBody.questions;
    saved = answerBody.data;
    if (!Array.isArray(questions) || questions.length === 0) throw new Error('현재 표시할 질문이 없어요.');
  } catch (error) {
    view.replaceChildren(
      h('h1', { tabindex: '-1', text: '아이에 대해 알려주세요' }),
      h('p', { class: 'notice error', role: 'alert', text: error.message }),
      h('button', { type: 'button', class: 'secondary', text: '다시 시도', onclick: () => renderQuestionnaire(view, { session, navigate }) }),
    );
    return;
  }

  const answers = new Map(saved.map((answer) => [answer.question_id, {
    optionIds: new Set(answer.option_ids),
    text: answer.answer_text,
  }]));
  let index = 0;

  function finish() {
    const payload = [...answers.entries()]
      .map(([questionId, answer]) => ({
        question_id: questionId,
        answer_text: answer.text,
        option_ids: [...answer.optionIds],
      }))
      .filter((answer) => answer.answer_text || answer.option_ids.length > 0);
    return api('/api/questionnaire/answers', {
      method: 'PUT',
      body: JSON.stringify({ answers: payload }),
    });
  }

  function render() {
    const question = questions[index];
    const answer = answerFor(answers, question.question_id);
    const message = h('p', { class: 'b-validation', role: 'alert' });
    const progress = h('div', { class: 'b-progress', 'aria-label': `질문 ${index + 1}/${questions.length}` },
      ...questions.map((_, position) => h('span', { class: position <= index ? 'active' : null })));
    const choices = h('div', { class: 'b-option-groups' });

    for (const [groupName, options] of groupOptions(question.options)) {
      const fieldset = h('fieldset', {}, h('legend', { text: groupName }));
      const grid = h('div', { class: 'b-choices' });
      for (const option of options) {
        const input = h('input', {
          type: question.question_type === 'single' ? 'radio' : 'checkbox',
          name: `question-${question.question_id}`,
          value: option.option_id,
          checked: answer.optionIds.has(option.option_id),
        });
        input.addEventListener('change', () => {
          if (input.type === 'radio') answer.optionIds.clear();
          if (input.checked) answer.optionIds.add(option.option_id);
          else answer.optionIds.delete(option.option_id);
          render();
        });
        grid.append(h('label', { class: 'b-choice' }, input, h('span', { text: option.option_text })));
      }
      fieldset.append(grid);
      choices.append(fieldset);
    }

    const detail = h('textarea', { rows: '3', placeholder: '직접 입력해 주세요' });
    detail.value = answer.text;
    detail.addEventListener('input', () => { answer.text = detail.value; });

    const back = h('button', {
      type: 'button',
      class: 'secondary',
      text: '이전',
      disabled: index === 0,
      onclick: () => { index -= 1; render(); },
    });
    const next = h('button', {
      type: 'button',
      text: index === questions.length - 1 ? '답변 저장' : '다음',
      onclick: async () => {
        if (question.is_required && answer.optionIds.size === 0 && !answer.text.trim()) {
          message.textContent = '필수 질문에 답해 주세요.';
          return;
        }
        if (index < questions.length - 1) {
          index += 1;
          render();
          return;
        }
        next.disabled = true;
        next.textContent = '저장 중…';
        try {
          await finish();
          view.replaceChildren(
            h('p', { class: 'b-eyebrow', text: '돌봄 설명서 만들기' }),
            h('h1', { tabindex: '-1', text: '답변을 저장했어요' }),
            h('div', { class: 'card b-complete' },
              h('p', { class: 'strong', text: `${session.care_recipient?.name ?? '아이'}의 답변이 안전하게 저장됐어요.` }),
              h('p', { class: 'muted', text: '다시 들어오면 저장한 답변을 이어서 확인할 수 있어요.' })),
            h('button', { type: 'button', text: '홈으로', onclick: () => navigate('/g/home') }),
          );
          view.querySelector('h1')?.focus();
        } catch (error) {
          next.disabled = false;
          next.textContent = '답변 저장';
          message.textContent = error.message;
        }
      },
    });
    const skip = question.is_required || index === questions.length - 1 ? null : h('button', {
      type: 'button',
      class: 'link b-skip',
      text: '건너뛰기',
      onclick: () => {
        if (index < questions.length - 1) { index += 1; render(); }
      },
    });

    view.replaceChildren(
      h('div', { class: 'b-top' },
        h('p', { class: 'b-eyebrow', text: '돌봄 설명서 만들기' }),
        skip),
      h('h1', { tabindex: '-1', text: '아이에 대해 알려주세요' }),
      h('p', { class: 'muted', text: '몰라도 괜찮아요. 가까운 걸 골라 주세요.' }),
      progress,
      h('p', { class: 'b-count', text: `${index + 1} / ${questions.length}` }),
      h('section', { class: 'b-question' },
        question.is_required ? h('span', { class: 'b-required', text: '필수' }) : null,
        h('h2', { text: question.question_text }),
        h('p', { class: 'muted', text: question.helper_text || '가까운 답을 모두 골라도 괜찮아요.' }),
        choices,
        h('label', { class: 'b-detail' },
          h('span', { text: '더 알려 줄 게 있다면 (선택)' }), detail),
        message),
      h('div', { class: 'b-actions' }, back, next),
    );
  }

  render();
}

