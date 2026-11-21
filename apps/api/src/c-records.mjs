import { createHash, randomUUID } from 'node:crypto';
import { isActiveAssignment } from './c-assignments.mjs';
import { createMemoryRecordStore } from './c-record-store.mjs';

const categoryRules = [
  ['소통', /의사소통|그림\s*카드|의사\s*표현|손짓/],
  ['식사', /밥|반찬|식사|음식|간식/],
  ['위생', /씻|양치|화장실|옷\s*갈아/],
  ['약', /복약|복용|약을|약은|약\s*먹/],
  ['일과', /수면|잠들|밤에\s*깨|기상|산책|낮잠/],
  ['정서·행동', /귀를\s*막|소리|불안|진정|안정|괜찮|힘들어|드라이기|헤어\s*드라이어/],
  ['안전', /위험|다쳤|넘어졌|안전/],
];
const categories = categoryRules.map(([category]) => category);
const importanceValues = ['low', 'medium', 'high'];
const maxTextLength = 2000;
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const distress = /싫어|힘들|불안|귀를\s*막|울었/;
const comfort = /도움|진정|안정|괜찮|편해/;
const sameTopic = [/드라이기|헤어\s*드라이어/, /청소기/, /기차\s*영상/, /그림\s*카드/];
const questionRules = [
  [/씻|양치|화장실|옷\s*갈아/, '위생', /씻|양치|화장실|옷\s*갈아/],
  [/밤에\s*깨|자다\s*깨/, '일과', /밤에\s*깨|자다\s*깨/],
  [/밥|식사|음식|반찬|간식/, '식사', /밥|식사|음식|반찬|간식/],
  [/말할 때|소통|그림\s*카드/, '소통', /그림\s*카드|고르|손짓|말/],
  [/힘들|불안|진정|안정/, '정서·행동', comfort],
  [/드라이기|헤어\s*드라이어/, '정서·행동', /드라이기|헤어\s*드라이어/],
];
const medicalJudgment = /발작|열이\s*나|고열|해열제|약.*(?:추가|더\s*먹|늘리|줄이)|용량|진단/;
const surveyQuestionRules = [
  [/약|복용|복약/, 'health_safety'],
  [/화장실|양치|씻|옷\s*갈아|위생/, 'hygiene'],
  [/밤에\s*깨|자다\s*깨|깨면/, 'routine_sleep', /깨|깼/],
  [/잠들|잠자|자기\s*전|수면/, 'routine_sleep'],
  [/밥|끼니|식사|음식|반찬|간식/, 'meal'],
  [/아플\s*때|아프|통증/, 'pain_signal'],
  [/드라이기|청소기|큰\s*소리/, 'distress', /드라이기|청소기|큰\s*소리|소음/],
  [/도움|진정|안정/, 'distress', /도움|진정|안정|조용|기다|영상을|쉬게/],
  [/힘들|불안/, 'distress'],
  [/좋아하|놀이|활동/, 'likes'],
  [/싫어|거절/, 'self_will'],
  [/표현|그림\s*카드|연락|의사\s*소통|어떻게\s*말/, 'communication'],
];
const noRecord = { result: 'no_record', answer: '설명서에 아직 없어요 · 짐작해서 답하지 않을게요', cited_item_ids: [] };
const medicalResponse = {
  ...noRecord,
  answer: '의료 판단은 하지 않아요. 급하면 센터 간호 담당이나 119에 연락해 주세요',
};

function reply(status, body) {
  return { status, body };
}

function reject(status, error) {
  return reply(status, { error });
}

function recordText(value) {
  return typeof value === 'string' && value.trim().length <= maxTextLength
    ? value.trim()
    : '';
}

function comparison(text, category, manual) {
  const words = (value) => value.trim().replace(/[.!?。！？]+$/, '').replace(/\s+/g, ' ');
  const sameCategory = manual.filter((item) => item.category === category);
  const same = sameCategory.find((item) => words(item.text) === words(text));
  if (same) return { relation: 'same', related_manual_item_id: same.id };

  const differs = sameCategory.find((item) =>
    sameTopic.some((topic) => topic.test(text) && topic.test(item.text)) &&
    ((comfort.test(text) && distress.test(item.text)) || (distress.test(text) && comfort.test(item.text))));
  return {
    relation: differs ? 'differs' : 'new',
    related_manual_item_id: differs?.id ?? null,
  };
}

function structureRecord(text, manual) {
  const parts = text.split(/(?:[.!?。！？]+(?=\s|$)|\n)+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 20) return [];
  const items = parts.flatMap((part) => {
    const matches = categoryRules.filter(([, pattern]) => pattern.test(part));
    if (matches.length !== 1) return [];
    const category = matches[0][0];
    return [{
      text: part,
      source_text: part,
      category,
      importance: 'medium',
      safety_flag: false,
      safety_reference: null,
      ...(manual ? comparison(part, category, manual) : { relation: null, related_manual_item_id: null }),
    }];
  });
  return items.length === parts.length ? items : [];
}

function candidateOf(record, sourceText, comparisonAtSend) {
  const caregiver = record.author === '종사자';
  return {
    id: record.id,
    care_recipient_id: record.care_recipient_id,
    label: record.category,
    text: record.text,
    source_text: sourceText,
    category: record.category,
    suggested_importance: record.importance,
    importance: caregiver ? null : record.importance,
    status: 'candidate',
    safety_flag: record.safety_flag,
    safety_reference: record.safety_reference,
    source: caregiver ? 'caregiver' : 'guardian',
    source_record_id: caregiver ? record.id : null,
    replaces_item_id: comparisonAtSend?.related_manual_item_id ?? null,
    setting: caregiver ? 'center' : 'any',
  };
}

function scopeOf({ session, assignment }) {
  return [session.user_id, session.care_recipient_id, assignment?.id ?? null];
}

export function createCareRecords({
  getSession,
  getAssignment,
  listConfirmedItems,
  listQuestionnaireItems,
  createManualCandidates,
  transcribeAudio,
  recordStore = createMemoryRecordStore(),
  now = Date.now,
}) {
  async function authorize(request, target, caregiverOnly = false) {
    const session = await getSession(request);
    if (!session?.user_id) return reject(401, '로그인해 주세요.');
    if (!session.care_recipient_id ||
        (target !== undefined && target !== session.care_recipient_id)) {
      return reject(403, '현재 돌봄 대상에 접근할 수 없습니다.');
    }
    if (session.role === 'guardian' && !caregiverOnly) return { session };
    if (session.role !== 'caregiver') return reject(403, '이 기능을 사용할 권한이 없습니다.');

    const assignment = await getAssignment(session, session.care_recipient_id);
    if (!isActiveAssignment(assignment, session.care_recipient_id, now()) ||
        assignment.caregiver_user_id !== session.user_id) {
      return reject(403, '기간 내 활성 배정이 필요합니다.');
    }
    return { session, assignment };
  }

  async function visibleManual({ session, assignment }, listItems = listConfirmedItems) {
    const shared = assignment ? new Set(assignment.shared_categories ?? []) : undefined;
    const items = await listItems(session.care_recipient_id, session);
    return items.filter((item) => item.id && item.care_recipient_id === session.care_recipient_id &&
      item.status === 'confirmed' && (!shared || shared.has(item.category)) &&
      typeof item.text === 'string' && Boolean(item.text.trim()));
  }

  return {
    async transcribe(request) {
      const access = await authorize(request);
      if (access.status) return access;
      if (!transcribeAudio) return reject(503, '음성 변환이 설정되지 않았어요.');
      return transcribeAudio(request);
    },

    async manual(request, target) {
      const access = await authorize(request, target);
      if (access.status) return access;
      const items = (await visibleManual(access, listQuestionnaireItems)).map(({ id, category, text, last_updated, topic, section, label }) =>
        ({ id, category, text, last_updated: last_updated ?? null, topic, section, label }));
      return reply(200, { items, source: listQuestionnaireItems ? 'questionnaire' : 'local' });
    },

    async structure(request, input) {
      const access = await authorize(request, input?.care_recipient_id);
      if (access.status) return access;
      if (typeof input?.text !== 'string' || input.text.trim().length > maxTextLength) {
        return reject(400, '기록은 2,000자까지 입력할 수 있습니다.');
      }
      const text = recordText(input.text);
      const manual = text && access.assignment ? await visibleManual(access) : undefined;
      return reply(200, structureRecord(text, manual));
    },

    async list(request, target) {
      const access = await authorize(request, target);
      if (access.status) return access;
      return reply(200, {
        categories,
        role: access.session.role,
        care_recipient_id: access.session.care_recipient_id,
        items: await recordStore.list(scopeOf(access)),
      });
    },

    async save(request, input, key) {
      const access = await authorize(request, input?.care_recipient_id);
      if (access.status) return access;
      const { session, assignment } = access;
      if (!Array.isArray(input?.items) || input.items.length < 1 || input.items.length > 20) {
        return reject(400, '확인한 기록을 1개 이상 20개 이하로 보내 주세요.');
      }
      const original = recordText(input.source_text);
      const items = input.items.map((item) => ({
        text: recordText(item?.text),
        source_text: recordText(item?.source_text ?? original),
        category: item?.category,
        importance: item?.importance,
      }));
      if (!original || items.some(({ text, source_text: source, category, importance }) =>
        !text || !source || !original.includes(source) ||
        !categories.includes(category) || !importanceValues.includes(importance))) {
        return reject(400, '기록 문장, 원문 근거, 카테고리, 중요도를 확인해 주세요.');
      }
      if (typeof key !== 'string' || !uuid.test(key)) {
        return reject(400, '저장 요청 식별자가 필요합니다.');
      }

      const fingerprint = createHash('sha256').update(JSON.stringify(items)).digest('hex');
      const manual = assignment ? await visibleManual(access) : [];
      const createdAt = new Date(now()).toISOString();
      const batch = items.map(({ text, source_text: sourceText, category, importance }) => ({
        sourceText,
        record: {
          id: randomUUID(),
          care_recipient_id: session.care_recipient_id,
          author: assignment ? '종사자' : '보호자',
          author_user_id: session.user_id,
          assignment_id: assignment?.id ?? null,
          input_method: 'text',
          event_time: null,
          created_at: createdAt,
          text,
          category,
          importance,
          safety_flag: false,
          safety_reference: null,
          ...(assignment ? comparison(text, category, manual) : { relation: null, related_manual_item_id: null }),
          sent_to_guardian_at: null,
        },
      }));
      const saved = await recordStore.save(scopeOf(access), key.toLowerCase(), fingerprint, batch);
      if (saved.conflict) {
        return reject(409, '같은 저장 요청에 다른 내용이 들어 있습니다.');
      }
      if (!assignment) {
        await createManualCandidates(session, saved.entries.map(({ record, sourceText }) =>
          candidateOf(record, sourceText)));
      }
      return reply(saved.created ? 201 : 200, { items: saved.entries.map(({ record }) => record) });
    },

    async send(request, input) {
      const access = await authorize(request, input?.care_recipient_id, true);
      if (access.status) return access;
      const id = input?.record_id;
      const scope = scopeOf(access);
      const entry = typeof id === 'string' && uuid.test(id) ? await recordStore.find(scope, id) : undefined;
      if (!entry) return reject(404, '현재 배정에 해당하는 기록이 없습니다.');
      const { record, sourceText } = entry;
      if (record.sent_to_guardian_at) return reply(200, { item: record, candidate_id: record.id });
      if (record.relation === 'same') return reject(409, '설명서와 같은 기록입니다.');

      const compared = comparison(record.text, record.category, await visibleManual(access));
      if (compared.relation === 'same') return reject(409, '설명서와 같은 기록입니다.');
      const candidate = candidateOf(record, sourceText, compared);
      await createManualCandidates(access.session, [candidate]);
      const sent = await recordStore.markSent(scope, record.id, new Date(now()).toISOString());
      return reply(200, { item: sent, candidate_id: candidate.id });
    },

    async ask(request, input) {
      const access = await authorize(request, input?.care_recipient_id);
      if (access.status) return access;
      const question = recordText(input?.question);
      if (!question) return reject(400, '질문을 입력해 주세요.');
      if (medicalJudgment.test(question)) return reply(200, medicalResponse);

      const rule = (listQuestionnaireItems ? surveyQuestionRules : questionRules).find(([pattern]) => pattern.test(question));
      if (!rule) return reply(200, noRecord);
      const [, topic, evidencePattern] = rule;
      const evidence = (await visibleManual(access, listQuestionnaireItems)).find((item) =>
        (listQuestionnaireItems ? item.topic : item.category) === topic && (!evidencePattern || evidencePattern.test(item.text)));
      if (!evidence) return reply(200, noRecord);
      return reply(200, {
        result: 'answered',
        answer: evidence.text,
        cited_item_ids: [evidence.id],
        citations: [{ id: evidence.id, category: evidence.category, last_updated: evidence.last_updated ?? null }],
      });
    },
  };
}
