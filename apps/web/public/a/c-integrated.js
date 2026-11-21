import { h } from './dom.js';

function note(text) { return h('p', { class: 'f-note', text }); }
function title(view, value, subtitle) {
  view.classList.add('f-screen');
  view.append(h('p', { class: 'f-brand', text: '돌봄바통' }),
    h('h1', { tabindex: '-1', text: value }), h('p', { class: 'f-subtitle', text: subtitle }));
}
function button(label, callback, cls = '') {
  return h('button', { type: 'button', class: `f-button ${cls}`, text: label, onclick: callback });
}
function panel(...items) { return h('section', { class: 'f-panel' }, ...items); }
async function api(path, { method = 'GET', data = undefined, headers = {}, raw = undefined } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: data === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: raw ?? (data === undefined ? undefined : JSON.stringify(data)),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `HTTP ${response.status}`);
  return result;
}

function renderStatus(area, text, error = false) {
  area.textContent = text;
  area.className = error ? 'f-error' : 'f-note';
}

async function renderEntries(container) {
  container.replaceChildren(note('기록을 불러오는 중입니다.'));
  try {
    const result = await api('/api/c/records');
    if (!result.items?.length) { container.replaceChildren(note('아직 저장된 기록이 없습니다.')); return; }
    container.replaceChildren(...result.items.map((item) => panel(
      h('strong', { text: item.category }),
      h('p', { text: item.text }),
      h('p', { class: 'f-caption', text: '입력한 합성 시연 기록 · 서버 인스턴스 초기화 시 사라질 수 있음' }),
    )));
  } catch (error) { container.replaceChildren(h('p', { class: 'f-error', text: error.message })); }
}

export function renderCRecord(view, { session }) {
  title(view, session.role === 'caregiver' ? '돌봄 기록' : '한마디 기록', '경험을 남기고 카테고리별로 정리해요.');
  const area = h('textarea', { rows: '4', placeholder: '예: 큰 소리가 나면 귀를 막고, 조용한 방에서 쉬면 진정돼요.' });
  const status = h('p', { class: 'f-note', role: 'status', text: '실제 돌봄 개인정보는 입력하지 마세요. 기록은 현재 시연 서버에만 임시 저장됩니다.' });
  const proposals = h('div', { class: 'f-list' });
  const records = h('div', { class: 'f-list' });
  const category = h('select', { 'aria-label': '분류할 카테고리' }, ...['소통', '식사', '위생', '약', '일과', '정서·행동', '안전'].map((value) => h('option', { value, text: value })));
  let recordedBlob = null;
  let recorder = null;
  let stream = null;
  let parts = [];
  const recordButton = button('녹음 시작', async () => {
    if (recorder?.state === 'recording') {
      recorder.stop();
      recordButton.textContent = '녹음 시작';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      renderStatus(status, '이 브라우저는 음성 녹음을 지원하지 않습니다. 글로 입력해 주세요.', true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type));
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      parts = [];
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) parts.push(event.data); });
      recorder.addEventListener('stop', () => {
        recordedBlob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' });
        stream?.getTracks().forEach((track) => track.stop());
        renderStatus(status, `녹음 완료 (${Math.ceil(recordedBlob.size / 1024)} KB). 변환 버튼을 눌러 주세요.`);
      }, { once: true });
      recorder.start();
      recordButton.textContent = '녹음 종료';
      renderStatus(status, '녹음 중입니다. 완료되면 녹음 종료를 눌러 주세요.');
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      renderStatus(status, '마이크 권한을 확인하거나 글로 입력해 주세요.', true);
    }
  }, 'f-secondary');
  const transcribeButton = button('음성을 글로 변환', async () => {
    if (!recordedBlob) { renderStatus(status, '먼저 녹음해 주세요.', true); return; }
    if (!confirm('음성 변환은 유료 OpenAI API를 사용할 수 있습니다. 지금 변환할까요?')) return;
    transcribeButton.disabled = true;
    try {
      const transcript = await api('/api/ai/transcribe', {
        method: 'POST', raw: recordedBlob, headers: { 'Content-Type': recordedBlob.type },
      });
      area.value = transcript.text ?? '';
      renderStatus(status, '받아쓰기를 완료했습니다. 내용을 확인한 후 분석해 주세요.');
    } catch (error) { renderStatus(status, error.message, true); }
    finally { transcribeButton.disabled = false; }
  }, 'f-secondary');

  const analyzeButton = button('AI 기록 분류 확인', async () => {
    const source = area.value.trim();
    if (!source) { renderStatus(status, '기록할 문장을 입력해 주세요.', true); return; }
    if (!session.care_recipient_id) { renderStatus(status, '로그인 후 돌봄 대상을 확인해 주세요.', true); return; }
    analyzeButton.disabled = true;
    try {
      const suggested = await api('/api/ai/structure', { method: 'POST', data: {
        care_recipient_id: session.care_recipient_id, text: source,
      } });
      proposals.replaceChildren();
      const normalized = Array.isArray(suggested) && suggested.length ? suggested : [{
        text: source, source_text: source, category: category.value, importance: 'medium',
      }];
      if (!Array.isArray(suggested) || !suggested.length) {
        renderStatus(status, '자동 분류가 확실하지 않아 직접 선택한 카테고리로 기록합니다. AI 분류 성공으로 표시하지 않습니다.');
      } else { renderStatus(status, `분류 후보 ${suggested.length}건을 확인했습니다.`); }
      proposals.append(...normalized.map((item) => panel(
        h('strong', { text: item.category }), h('p', { text: item.text }),
      )));
      proposals.append(button('검토한 기록 저장', async () => {
        const save = proposals.querySelector('button');
        save.disabled = true;
        try {
          await api('/api/c/records', { method: 'POST', data: {
            care_recipient_id: session.care_recipient_id,
            source_text: source,
            items: normalized.map((item) => ({ text: item.text, source_text: item.source_text || source,
              category: item.category, importance: item.importance || 'medium' })),
          }, headers: { 'Idempotency-Key': crypto.randomUUID() } });
          renderStatus(status, '기록 요청을 서버에서 처리했습니다. 시연 서버 인스턴스 초기화 시 사라질 수 있습니다.');
          await renderEntries(records);
        } catch (error) { renderStatus(status, error.message, true); save.disabled = false; }
      }));
    } catch (error) { renderStatus(status, error.message, true); }
    finally { analyzeButton.disabled = false; }
  });
  view.append(panel(h('h2', { text: '기록하기' }), area, note('자동 분류가 불확실하면 아래에서 직접 카테고리를 골라 저장할 수 있습니다.'),
    h('label', { class: 'f-field' }, h('span', { text: '직접 선택할 분류' }), category), recordButton, transcribeButton, analyzeButton, status),
  proposals, h('h2', { text: '최근 기록' }), records);
  void renderEntries(records);
}

export async function renderCManual(view, { session }) {
  title(view, '한 장 카드', '현재 배정에 따라 허용된 돌봄 정보만 확인할 수 있습니다.');
  const container = h('section', { class: 'f-list' });
  view.append(container);
  try {
    const result = await api('/api/c/manual');
    if (!result.items?.length) {
      container.append(note('현재 열람 가능한 설명서 본문이 없습니다. 공유 권한 또는 저장된 답변을 확인해 주세요.'));
    } else {
      container.append(...result.items.map((item) => panel(h('strong', { text: item.category }),
        h('p', { text: item.text }), h('p', { class: 'f-caption', text: item.label || '보호자가 확인한 정보' }))));
    }
  } catch (error) { container.append(h('p', { class: 'f-error', text: error.message })); }
  const question = h('textarea', { rows: '3', placeholder: '예: 불편해할 때 평소 어떤 도움을 받나요?' });
  const answer = h('p', { class: 'f-note', role: 'status' });
  container.append(panel(h('h2', { text: '기록 기반 질문' }), question,
    button('보호자 기록에서 답변 찾기', async () => {
      if (!question.value.trim()) { renderStatus(answer, '질문을 입력해 주세요.', true); return; }
      try {
        const data = await api('/api/ai/ask', { method: 'POST', data: {
          care_recipient_id: session.care_recipient_id,
          question: question.value.trim(),
        } });
        renderStatus(answer, `${data.answer || '답변 없음'}${data.cited_item_ids?.length ? ` · 근거 ${data.cited_item_ids.length}건` : ''}`);
      } catch (error) { renderStatus(answer, error.message, true); }
    }), answer));
}
