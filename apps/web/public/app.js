const state = {
  questions: [],
  currentIndex: 0,
  answers: new Map(),
};

const elements = {
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  errorDetail: document.getElementById('error-detail'),
  retryButton: document.getElementById('retry-button'),
  form: document.getElementById('question-form'),
  backButton: document.getElementById('back-button'),
  skipButton: document.getElementById('skip-button'),
  nextButton: document.getElementById('next-button'),
  progress: document.getElementById('progress'),
  questionCount: document.getElementById('question-count'),
  requiredBadge: document.getElementById('required-badge'),
  currentQuestion: document.getElementById('current-question'),
  questionHelper: document.getElementById('question-helper'),
  optionGroups: document.getElementById('option-groups'),
  answerDetail: document.getElementById('answer-detail'),
  validationMessage: document.getElementById('validation-message'),
};

function currentQuestion() {
  return state.questions[state.currentIndex];
}

function currentAnswer() {
  const question = currentQuestion();
  if (!state.answers.has(question.question_id)) {
    state.answers.set(question.question_id, { optionIds: new Set(), detail: '' });
  }
  return state.answers.get(question.question_id);
}

function optionGroups(options) {
  return Map.groupBy(options, (option) => option.option_group || '선택해 주세요');
}

function updateNextButton() {
  const answer = currentAnswer();
  elements.nextButton.disabled = answer.optionIds.size === 0 && !answer.detail.trim();
}

function renderOptions(question, answer) {
  elements.optionGroups.replaceChildren();
  for (const [groupName, options] of optionGroups(question.options)) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = groupName;
    group.append(legend);

    const choices = document.createElement('div');
    choices.className = 'choices';
    for (const option of options) {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = question.question_type === 'single' ? 'radio' : 'checkbox';
      input.name = `question-${question.question_id}`;
      input.value = option.option_id;
      input.checked = answer.optionIds.has(option.option_id);
      input.addEventListener('change', () => {
        if (input.type === 'radio') answer.optionIds.clear();
        if (input.checked) answer.optionIds.add(option.option_id);
        else answer.optionIds.delete(option.option_id);
        renderQuestion();
      });
      const text = document.createElement('span');
      text.textContent = option.option_text;
      label.append(input, text);
      choices.append(label);
    }
    group.append(choices);
    elements.optionGroups.append(group);
  }
}

function renderProgress() {
  elements.progress.replaceChildren();
  state.questions.forEach((_, index) => {
    const segment = document.createElement('span');
    if (index <= state.currentIndex) segment.className = 'active';
    elements.progress.append(segment);
  });
}

function renderQuestion() {
  const question = currentQuestion();
  const answer = currentAnswer();
  elements.questionCount.textContent = `${state.currentIndex + 1} / ${state.questions.length}`;
  elements.requiredBadge.hidden = !question.is_required;
  elements.currentQuestion.textContent = question.question_text;
  elements.questionHelper.textContent = question.helper_text || '가까운 답을 모두 골라도 괜찮아요.';
  elements.answerDetail.value = answer.detail;
  elements.backButton.disabled = state.currentIndex === 0;
  elements.skipButton.hidden = question.is_required;
  elements.nextButton.textContent = state.currentIndex === state.questions.length - 1 ? '답변 확인' : '다음';
  elements.validationMessage.textContent = '';
  renderProgress();
  renderOptions(question, answer);
  updateNextButton();
}

function showError(message) {
  elements.loading.hidden = true;
  elements.form.hidden = true;
  elements.error.hidden = false;
  elements.errorDetail.textContent = message;
}

async function loadQuestionnaire() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.form.hidden = true;
  elements.nextButton.disabled = true;
  try {
    const response = await fetch('/api/questionnaire');
    const data = await response.json();
    if (!response.ok) {
      const message = response.status === 503
        ? '프로젝트 루트의 .env에 Supabase 연결 정보를 설정해 주세요.'
        : 'Supabase 연결과 RLS 조회 정책을 확인해 주세요.';
      throw new Error(message);
    }
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error('현재 표시할 활성 질문이 없습니다.');
    }
    state.questions = data.questions;
    state.currentIndex = 0;
    elements.loading.hidden = true;
    elements.form.hidden = false;
    renderQuestion();
  } catch (error) {
    showError(error.message ?? '잠시 후 다시 시도해 주세요.');
  }
}

elements.answerDetail.addEventListener('input', () => {
  currentAnswer().detail = elements.answerDetail.value;
  updateNextButton();
});

elements.backButton.addEventListener('click', () => {
  if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    renderQuestion();
  }
});

elements.skipButton.addEventListener('click', () => {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
  }
});

elements.nextButton.addEventListener('click', () => {
  const question = currentQuestion();
  const answer = currentAnswer();
  if (question.is_required && answer.optionIds.size === 0 && !answer.detail.trim()) {
    elements.validationMessage.textContent = '필수 질문에 답해 주세요.';
    return;
  }
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
    return;
  }
  elements.nextButton.textContent = '로그인 연동 후 저장할 수 있어요';
  elements.nextButton.disabled = true;
});

elements.retryButton.addEventListener('click', loadQuestionnaire);

loadQuestionnaire();
