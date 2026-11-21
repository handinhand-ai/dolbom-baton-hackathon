import { createCareRecords } from './c-records.mjs';
import { createCareQuestions } from './c-questions.mjs';

export function createRecordDemo({ recordStore, readQuestionnaire, secondSurveyRecipient, transcribeAudio } = {}) {
  const recipient = '2fb0847d-dc80-4aad-a073-2d10b0b64143';
  const guardian = { user_id: '19f4d6b1-897c-4630-acba-3c79cdd61339', role: 'guardian', care_recipient_id: recipient };
  const otherGuardian = {
    user_id: '7f586623-0917-49e4-b9a4-1eed9679156f',
    role: 'guardian',
    care_recipient_id: '765486a7-f94b-464f-a081-47d1d35cec07',
  };
  const guardians = new Map([['guardian', guardian], ['guardian-2', otherGuardian]]);
  const caregiverId = 'bcd3b0f8-d97d-40b1-9d05-401614628b84';
  const assignmentIds = ['37d086a8-d1ec-4946-8c50-0fd4069c83b1', 'a859d712-a74b-4ad7-aaaf-8ab88a0c46ea'];
  const start = Date.now();
  const recipients = [recipient, otherGuardian.care_recipient_id];
  const questionnaireRecipients = new Map([
    [recipient, '00000000-0000-4000-8000-0000000000a1'],
    [otherGuardian.care_recipient_id, secondSurveyRecipient],
  ]);
  const assignments = recipients.map((id, index) => ({
    id: assignmentIds[index],
    status: 'active',
    caregiver_user_id: caregiverId,
    caregiver_name: '시연 종사자',
    care_recipient_id: id,
    starts_at: new Date(start - 3600000).toISOString(),
    ends_at: new Date(start + 86400000).toISOString(),
    shared_categories: ['소통', '식사', '일과', '정서·행동'],
  }));
  const confirmedItems = [
    ['1ec01ad6-8a1f-451f-95ae-2f050da8077c', '정서·행동', '드라이기 소리를 싫어해요.'],
    ['3036bb08-15a9-4bc6-9898-881069025ee3', '정서·행동', '작은 방에서 기차 영상을 보여 주면 괜찮아져요.'],
    ['3e766222-9c93-4ae1-a68e-71f427279a9d', '위생', '씻기 전에 그림으로 순서를 보여 줘요.'],
  ].map(([id, category, text]) => ({
    id, category, text, status: 'confirmed', care_recipient_id: recipient,
    last_updated: '2026-11-17T10:00:00+09:00',
  }));
  const candidates = new Map();

  // The role switch lives only in the local demo. Production must resolve A's server session.
  function getSession(request) {
    const roleKey = request.headers['x-c-demo-role'] ?? 'guardian';
    if (guardians.has(roleKey)) return guardians.get(roleKey);
    const requested = guardians.get(request.headers['x-c-demo-recipient'] ?? 'guardian');
    return roleKey === 'caregiver' && requested
      ? { user_id: caregiverId, role: 'caregiver', care_recipient_id: requested.care_recipient_id }
      : undefined;
  }
  const service = createCareRecords({
    recordStore,
    transcribeAudio,
    getSession,
    getAssignment: (session) => assignments.find((assignment) =>
      assignment.caregiver_user_id === session.user_id && assignment.care_recipient_id === session.care_recipient_id),
    listConfirmedItems: () => confirmedItems,
    listQuestionnaireItems: readQuestionnaire
      ? async (id) => (await readQuestionnaire(questionnaireRecipients.get(id))).map((item) => ({
        ...item, care_recipient_id: id, status: 'confirmed',
      }))
      : undefined,
    createManualCandidates(_session, items) {
      for (const item of items) {
        if (!candidates.has(item.id)) candidates.set(item.id, {
          ...item,
          display_order: confirmedItems.length + candidates.size + 1,
          last_updated: new Date().toISOString(),
        });
      }
    },
  });
  return {
    ...service,
    questions: createCareQuestions({ getSession, listAssignments: () => assignments }),
    listCandidates(request) {
      const session = getSession(request);
      if (session?.role !== 'guardian') return { status: 403, body: { error: '보호자만 후보를 볼 수 있습니다.' } };
      return {
        status: 200,
        body: { items: [...candidates.values()].filter((item) => item.care_recipient_id === session.care_recipient_id) },
      };
    },
  };
}
