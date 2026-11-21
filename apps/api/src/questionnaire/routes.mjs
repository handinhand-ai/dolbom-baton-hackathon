const MAX_BODY_BYTES = 64 * 1024;
const MAX_ANSWERS = 100;

class QuestionnaireError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return request.headers['sec-fetch-site'] !== 'cross-site';
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readJson(request) {
  if (!(request.headers['content-type'] ?? '').includes('application/json')) {
    throw new QuestionnaireError(415, 'JSON으로 보내 주세요.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new QuestionnaireError(413, '요청이 너무 커요.');
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not object');
    return body;
  } catch (error) {
    if (error instanceof QuestionnaireError) throw error;
    throw new QuestionnaireError(400, '요청 형식이 올바르지 않아요.');
  }
}

function validateAnswers(value) {
  if (!Array.isArray(value) || value.length > MAX_ANSWERS) {
    throw new QuestionnaireError(400, '답변 목록이 올바르지 않아요.');
  }
  return value.map((answer) => {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
      throw new QuestionnaireError(400, '답변 형식이 올바르지 않아요.');
    }
    const questionId = typeof answer.question_id === 'string' ? answer.question_id.trim() : '';
    const answerText = typeof answer.answer_text === 'string' ? answer.answer_text.trim() : '';
    const optionIds = Array.isArray(answer.option_ids)
      ? [...new Set(answer.option_ids.filter((id) => typeof id === 'string' && id.length > 0))]
      : null;
    if (!questionId || questionId.length > 100 || answerText.length > 4000 || optionIds === null || optionIds.length > 50) {
      throw new QuestionnaireError(400, '답변 형식이 올바르지 않아요.');
    }
    return { question_id: questionId, answer_text: answerText, option_ids: optionIds };
  });
}

function profileHeaders(supabaseAnonKey, content = false) {
  return {
    apikey: supabaseAnonKey,
    [content ? 'Content-Profile' : 'Accept-Profile']: 'dolbom_demo',
  };
}

async function expectOk(response) {
  if (!response.ok) throw new QuestionnaireError(502, '답변 저장소에 연결하지 못했어요.');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function guardianRecipient(sessionUserId, careStore) {
  const user = sessionUserId ? careStore.getUser(sessionUserId) : null;
  if (!user) throw new QuestionnaireError(401, '로그인이 필요해요.');
  if (user.role !== 'guardian') throw new QuestionnaireError(403, '보호자만 질문지를 작성할 수 있어요.');
  const recipient = careStore.myRecipients(user)[0];
  if (!recipient) throw new QuestionnaireError(409, '연결된 돌봄 대상이 없어요.');
  return recipient.id;
}

async function loadAnswers({ fetchImpl, baseUrl, supabaseAnonKey, careRecipientId }) {
  const answerUrl = `${baseUrl}/rest/v1/questionnaire_answer?select=answer_id,question_id,answer_text,status&care_recipient_id=eq.${careRecipientId}&order=created_at.asc`;
  const answers = await expectOk(await fetchImpl(answerUrl, { headers: profileHeaders(supabaseAnonKey) }));
  if (answers.length === 0) return [];
  const answerIds = answers.map((answer) => answer.answer_id).join(',');
  const optionUrl = `${baseUrl}/rest/v1/questionnaire_answer_option?select=answer_id,option_id&answer_id=in.(${answerIds})`;
  const selectedOptions = await expectOk(await fetchImpl(optionUrl, { headers: profileHeaders(supabaseAnonKey) }));
  const optionsByAnswer = Map.groupBy(selectedOptions, (option) => option.answer_id);
  return answers.map((answer) => ({
    question_id: answer.question_id,
    answer_text: answer.answer_text,
    option_ids: (optionsByAnswer.get(answer.answer_id) ?? []).map((option) => option.option_id),
    status: answer.status,
  }));
}

async function saveAnswers({ fetchImpl, baseUrl, supabaseAnonKey, careRecipientId, answers }) {
  if (answers.length === 0) return 0;
  const rows = answers.map((answer) => ({
    care_recipient_id: careRecipientId,
    question_id: answer.question_id,
    answer_text: answer.answer_text,
    input_type: answer.option_ids.length > 0 && answer.answer_text ? 'mixed' : answer.option_ids.length > 0 ? 'selection' : 'text',
    status: 'completed',
  }));
  const upsertUrl = `${baseUrl}/rest/v1/questionnaire_answer?on_conflict=care_recipient_id,question_id&select=answer_id,question_id`;
  const saved = await expectOk(await fetchImpl(upsertUrl, {
    method: 'POST',
    headers: {
      ...profileHeaders(supabaseAnonKey, true),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  }));
  const answerIds = saved.map((answer) => answer.answer_id).join(',');
  const optionUrl = `${baseUrl}/rest/v1/questionnaire_answer_option?answer_id=in.(${answerIds})`;
  await expectOk(await fetchImpl(optionUrl, {
    method: 'DELETE',
    headers: profileHeaders(supabaseAnonKey, true),
  }));
  const savedByQuestion = new Map(saved.map((answer) => [answer.question_id, answer.answer_id]));
  const optionRows = answers.flatMap((answer) => answer.option_ids.map((optionId) => ({
    answer_id: savedByQuestion.get(answer.question_id),
    option_id: optionId,
  })));
  if (optionRows.length > 0) {
    await expectOk(await fetchImpl(`${baseUrl}/rest/v1/questionnaire_answer_option`, {
      method: 'POST',
      headers: {
        ...profileHeaders(supabaseAnonKey, true),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(optionRows),
    }));
  }
  return answers.length;
}

export async function handleQuestionnaireAnswerRequest({
  request,
  response,
  url,
  sessionUserId,
  careStore,
  fetchImpl,
  supabaseUrl,
  supabaseAnonKey,
  sendJson,
}) {
  if (url.pathname !== '/api/questionnaire/answers') return false;
  try {
    if (!supabaseUrl || !supabaseAnonKey) throw new QuestionnaireError(503, 'Supabase가 설정되지 않았어요.');
    const careRecipientId = guardianRecipient(sessionUserId, careStore);
    const baseUrl = supabaseUrl.replace(/\/$/, '');
    if (request.method === 'GET') {
      const data = await loadAnswers({ fetchImpl, baseUrl, supabaseAnonKey, careRecipientId });
      sendJson(response, 200, { data });
      return true;
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) throw new QuestionnaireError(403, '같은 사이트에서 보낸 요청만 받아요.');
      const body = await readJson(request);
      const answers = validateAnswers(body.answers);
      const saved = await saveAnswers({ fetchImpl, baseUrl, supabaseAnonKey, careRecipientId, answers });
      sendJson(response, 200, { data: { saved } });
      return true;
    }
    response.setHeader('Allow', 'GET, PUT');
    sendJson(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    if (error instanceof QuestionnaireError) sendJson(response, error.status, { error: error.message });
    else sendJson(response, 500, { error: '질문지 요청을 처리하지 못했어요.' });
  }
  return true;
}

