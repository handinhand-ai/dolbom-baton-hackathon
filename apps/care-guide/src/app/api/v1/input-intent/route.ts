export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson } from '@/lib/http';
import { AppError } from '@/lib/repo';
import { looksLikeQuestion } from '@/lib/text/local-engine';
import { QUICK_RECORD_HINTS } from '@/lib/categories';

// 물어보기·기록하기 통합 입력: 질문인지 기록인지 나눈다. 최종 선택은 사용자가 바꿀 수 있다.
// 지금은 규칙 기반(물음 표현 여부)이다. 빠른 기록 버튼을 누른 입력은 항상 기록으로 본다.
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) throw new AppError(400, 'VALIDATION_ERROR', '내용을 입력해 주세요.', [{ field: 'text', reason: '필수 값입니다.' }]);
    if (body.activityHint && QUICK_RECORD_HINTS[body.activityHint]) return { intent: 'record', reason: 'quick_record_hint', engine: 'local-rules' };
    return { intent: looksLikeQuestion(text) ? 'question' : 'record', reason: 'question_pattern', engine: 'local-rules' };
  });
}
