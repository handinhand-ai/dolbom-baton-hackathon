export function createQuestionsPanel(request, withBusy, onUnreadChange) {
  const panel = document.querySelector('#common-questions');
  const title = document.querySelector('#common-title');
  const form = document.querySelector('#common-question-form');
  const recipients = document.querySelector('#common-recipients');
  const input = document.querySelector('#common-question');
  const submit = form.querySelector('button');
  const refresh = document.querySelector('#common-refresh');
  const feedback = document.querySelector('#common-feedback');
  const list = document.querySelector('#common-items');

  let role;
  let target;
  let pending;
  let items = [];
  const replyDrafts = new Map();

  function updateUnread() {
    onUnreadChange(role === 'caregiver' ? items.filter((item) => !item.reply).length : 0);
  }

  function textElement(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  function replyForm(item) {
    const answerForm = document.createElement('form');
    const label = textElement('label', '내 답변');
    label.className = 'field-label';
    const answer = document.createElement('textarea');
    answer.rows = 2;
    answer.maxLength = 2000;
    answer.required = true;
    answer.value = replyDrafts.get(item.id) ?? '';
    answer.addEventListener('input', () => replyDrafts.set(item.id, answer.value));
    label.append(answer);
    const button = textElement('button', '답변 보내기');
    button.className = 'primary-button';
    answerForm.append(label, button);
    answerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void withBusy(async () => {
        button.disabled = true;
        try {
          const { item: saved } = await request('/api/c/question-replies', {
            question_id: item.id, care_recipient_id: target, text: answer.value,
          });
          replyDrafts.delete(item.id);
          items = items.map((question) => question.id === saved.id ? saved : question);
          updateUnread();
          answerForm.replaceWith(textElement('p', `내 답변 · ${saved.reply.text}`));
          feedback.textContent = '답변을 보호자에게 보냈어요.';
        } catch (error) {
          feedback.textContent = error.message;
          button.disabled = false;
        }
      });
    });
    return answerForm;
  }

  function questionCard(item) {
    const card = document.createElement('article');
    card.append(textElement('h3', item.text));
    if (role === 'guardian') {
      const answered = item.replies.filter((reply) => reply.answered_at).length;
      card.append(textElement('p', `${answered}/${item.replies.length}명 답변 완료`));
      const replies = document.createElement('ul');
      for (const reply of item.replies) {
        replies.append(textElement('li', `${reply.caregiver_name} · ${reply.text ?? '답변 대기'}`));
      }
      card.append(replies);
    } else {
      card.append(item.reply ? textElement('p', `내 답변 · ${item.reply.text}`) : replyForm(item));
    }
    return card;
  }

  function addQuestion(item) {
    list.querySelector('#no-common-questions')?.remove();
    list.prepend(questionCard(item));
  }

  async function reload() {
    const result = await request('/api/c/questions');
    items = result.items;
    updateUnread();
    if (role === 'guardian') {
      recipients.textContent = result.recipient_names.length
        ? `받는 종사자 · ${result.recipient_names.join(', ')}`
        : '현재 질문을 보낼 수 있는 배정 종사자가 없어요.';
      submit.disabled = !result.recipient_names.length;
    }
    list.replaceChildren(...items.map(questionCard));
    if (!list.childElementCount) {
      const empty = textElement('p', role === 'guardian' ? '아직 보낸 질문이 없어요.' : '선택한 대상에 받은 질문이 없어요.');
      empty.id = 'no-common-questions';
      empty.className = 'empty-state';
      list.append(empty);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (pending?.text !== text) pending = { text, key: crypto.randomUUID() };
    void withBusy(async () => {
      submit.disabled = true;
      try {
        const { item } = await request('/api/c/questions', {
          care_recipient_id: target, text,
        }, pending.key);
        addQuestion(item);
        pending = undefined;
        input.value = '';
        feedback.textContent = `종사자 ${item.replies.length}명에게 질문을 보냈어요.`;
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
  });

  function refreshList(showStatus = false) {
    if (panel.hidden) return;
    return withBusy(async () => {
      try {
        await reload();
        if (showStatus) feedback.textContent = '목록을 새로 불러왔어요.';
      } catch (error) {
        feedback.textContent = error.message;
      }
    });
  }
  refresh.addEventListener('click', () => { void refreshList(true); });

  return {
    refresh: refreshList,
    hide() {
      panel.hidden = true;
      form.hidden = true;
      list.replaceChildren();
      input.value = '';
      feedback.textContent = '';
      pending = undefined;
      items = [];
      replyDrafts.clear();
      updateUnread();
    },
    async load(currentRole, recipient) {
      role = currentRole;
      target = recipient;
      title.textContent = role === 'guardian' ? '종사자에게 질문하기' : '보호자가 보낸 질문';
      try {
        await reload();
        form.hidden = role !== 'guardian';
      } catch (error) {
        feedback.textContent = error.message;
      }
      panel.hidden = false;
    },
  };
}
