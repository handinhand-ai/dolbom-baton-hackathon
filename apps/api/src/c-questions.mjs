import { randomUUID } from 'node:crypto';
import { isActiveAssignment } from './c-assignments.mjs';

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function reply(status, body) {
  return { status, body };
}

function reject(status, error) {
  return reply(status, { error });
}

function message(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= 2000 ? text : '';
}

function guardianView(question) {
  return {
    id: question.id,
    text: question.text,
    created_at: question.created_at,
    replies: question.deliveries.map(({ caregiver_name, text, answered_at }) =>
      ({ caregiver_name, text, answered_at })),
  };
}

function caregiverView(question, delivery) {
  return {
    id: question.id,
    text: question.text,
    created_at: question.created_at,
    reply: delivery.answered_at ? { text: delivery.text, answered_at: delivery.answered_at } : null,
  };
}

export function createCareQuestions({ getSession, listAssignments, now = Date.now }) {
  const questions = new Map();
  const sentRequests = new Map();

  async function authorize(request, target, role) {
    const session = await getSession(request);
    if (!session?.user_id) return reject(401, '로그인해 주세요.');
    if (!['guardian', 'caregiver'].includes(session.role) || (role && role !== session.role) ||
        !session.care_recipient_id || (target !== undefined && target !== session.care_recipient_id)) {
      return reject(403, '이 돌봄 대상의 질문에 접근할 수 없습니다.');
    }
    return session;
  }

  async function activeAssignments(session) {
    const assignments = await listAssignments(session, session.care_recipient_id);
    const timestamp = now();
    return assignments.filter((assignment) =>
      isActiveAssignment(assignment, session.care_recipient_id, timestamp) &&
      Boolean(assignment.caregiver_user_id) &&
      (session.role === 'guardian' || assignment.caregiver_user_id === session.user_id));
  }

  function recipientsOf(assignments) {
    const recipients = new Map();
    for (const assignment of assignments) {
      const caregiverId = assignment.caregiver_user_id;
      if (!recipients.has(caregiverId)) recipients.set(caregiverId, assignment);
    }
    return [...recipients.values()];
  }

  function myDelivery(question, session, assignmentIds) {
    return question.deliveries.find((delivery) =>
      delivery.caregiver_user_id === session.user_id && assignmentIds.has(delivery.assignment_id));
  }

  return {
    async list(request) {
      const session = await authorize(request);
      if (session.status) return session;
      const assignments = await activeAssignments(session);
      const currentQuestions = [...questions.values()]
        .filter((question) => question.recipient_id === session.care_recipient_id).reverse();
      if (session.role === 'guardian') {
        return reply(200, {
          recipient_names: recipientsOf(assignments).map((assignment) => assignment.caregiver_name),
          items: currentQuestions.filter((question) => question.guardian_id === session.user_id).map(guardianView),
        });
      }
      const ids = new Set(assignments.map(({ id }) => id));
      return reply(200, { items: currentQuestions.flatMap((question) => {
        const delivery = myDelivery(question, session, ids);
        return delivery ? [caregiverView(question, delivery)] : [];
      }) });
    },

    async send(request, input, key) {
      const session = await authorize(request, input?.care_recipient_id, 'guardian');
      if (session.status) return session;
      const text = message(input?.text);
      if (!text) return reject(400, '질문을 1자 이상 2,000자 이하로 입력해 주세요.');
      if (typeof key !== 'string' || !uuid.test(key)) return reject(400, '질문 요청 식별자가 필요합니다.');

      const recipients = recipientsOf(await activeAssignments(session));
      const identity = JSON.stringify([session.user_id, session.care_recipient_id, key.toLowerCase()]);
      const previous = sentRequests.get(identity);
      if (previous) {
        if (previous.text !== text) return reject(409, '같은 요청에 다른 질문이 들어 있습니다.');
        return reply(200, { item: guardianView(previous) });
      }
      if (!recipients.length) return reject(409, '현재 질문을 보낼 수 있는 배정 종사자가 없습니다.');

      const question = {
        id: randomUUID(),
        guardian_id: session.user_id,
        recipient_id: session.care_recipient_id,
        text,
        created_at: new Date(now()).toISOString(),
        deliveries: recipients.map((assignment) => ({
          assignment_id: assignment.id,
          caregiver_user_id: assignment.caregiver_user_id,
          caregiver_name: assignment.caregiver_name,
          text: null,
          answered_at: null,
        })),
      };
      questions.set(question.id, question);
      sentRequests.set(identity, question);
      return reply(201, { item: guardianView(question) });
    },

    async answer(request, input) {
      const session = await authorize(request, input?.care_recipient_id, 'caregiver');
      if (session.status) return session;
      const text = message(input?.text);
      if (!text) return reject(400, '답변을 1자 이상 2,000자 이하로 입력해 주세요.');

      const question = questions.get(input?.question_id);
      const assignments = await activeAssignments(session);
      if (!assignments.length) return reject(403, '기간 내 활성 배정이 필요합니다.');
      const delivery = question?.recipient_id === session.care_recipient_id
        ? myDelivery(question, session, new Set(assignments.map(({ id }) => id)))
        : undefined;
      if (!delivery) return reject(404, '현재 배정으로 받은 질문이 없습니다.');

      if (delivery.answered_at) {
        if (delivery.text !== text) return reject(409, '이 질문에 이미 답변을 보냈습니다.');
        return reply(200, { item: caregiverView(question, delivery) });
      }
      delivery.text = text;
      delivery.answered_at = new Date(now()).toISOString();
      return reply(201, { item: caregiverView(question, delivery) });
    },
  };
}
