const categories = new Map([
  ['communication', '소통'], ['distress', '정서·행동'], ['pain_signal', '안전'],
  ['health_safety', '약'], ['hygiene', '위생'], ['likes', '정서·행동'],
  ['meal', '식사'], ['routine_sleep', '일과'], ['self_will', '소통'],
]);
const sectionOrder = ['must', 'daily', 'relation'];
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function createQuestionnaireReader({ url, key, fetcher = fetch }) {
  if (!url || !key) return undefined;
  const endpoint = new URL('/rest/v1/questionnaire_answer', url);

  return async (recipientId) => {
    if (!uuid.test(recipientId ?? '')) return [];
    const query = new URL(endpoint);
    query.search = new URLSearchParams({
      select: 'answer_id,answer_text,created_at,questionnaire_question!inner(question_id,category,section,question_text),questionnaire_answer_option(questionnaire_option!inner(question_id,option_text,display_order))',
      care_recipient_id: `eq.${recipientId}`,
      status: 'eq.completed',
    });
    const response = await fetcher(query, {
      headers: { apikey: key, 'Accept-Profile': 'dolbom_demo' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Supabase questionnaire read failed');
    }

    const rows = await response.json();
    const items = rows.flatMap((row) => {
      const question = row.questionnaire_question;
      const category = categories.get(question?.category);
      if (!category || !row.answer_id) return [];
      const options = (row.questionnaire_answer_option ?? []).map((answer) => answer.questionnaire_option)
        .filter((option) => option?.question_id === question.question_id && option.option_text?.trim())
        .sort((a, b) => a.display_order - b.display_order);
      const text = [...new Set([row.answer_text?.trim(), ...options.map((option) => option.option_text.trim())].filter(Boolean))].join(' · ');
      if (!text) return [];
      return [{
        id: row.answer_id,
        category,
        topic: question.category,
        section: question.section,
        label: question.question_text,
        text,
        last_updated: row.created_at,
      }];
    });
    const rank = (section) => sectionOrder.includes(section) ? sectionOrder.indexOf(section) : sectionOrder.length;
    return items.sort((a, b) => rank(a.section) - rank(b.section));
  };
}
