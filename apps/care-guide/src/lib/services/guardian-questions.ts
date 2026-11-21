// 설명서에 없는 내용을 종사자가 보호자에게 묻고, 보호자가 답하는 흐름.
// 질문·답은 공식 설명서와 분리 저장한다. 설명서에 넣으려면 기록 저장 후 기존 승인 흐름을 쓴다.
import { AppError } from '../repo';
import { requireText } from './common';

export async function askGuardian(ctx, staffId, body) {
  const questionText = requireText(body.question, 'question', '질문');
  await ctx.repo.getRecipient(staffId, body.recipientId); // 접근 권한 확인 (없으면 404)
  return ctx.repo.createGuardianQuestion({ recipientId: body.recipientId, staffId, questionText });
}

export async function listQuestionsForStaff(ctx, staffId, recipientId) {
  await ctx.repo.getRecipient(staffId, recipientId);
  return { items: await ctx.repo.listGuardianQuestions(recipientId) };
}

export async function listQuestionsForGuardian(ctx, recipientId) {
  return { items: await ctx.repo.listGuardianQuestions(recipientId || null) };
}

export async function answerQuestion(ctx, questionId, body) {
  const answer = requireText(body.answer, 'answer', '답변');
  const r = await ctx.repo.answerGuardianQuestion(questionId, answer);
  if (!r) throw new AppError(409, 'CONFLICT', '이미 답했거나 찾을 수 없는 질문이에요.');
  return r;
}
