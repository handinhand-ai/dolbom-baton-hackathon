export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle } from '@/lib/http';
import { AppError } from '@/lib/repo';

const MAX_AUDIO = 4 * 1024 * 1024; // Vercel 함수 요청 본문 한도(4.5MB) 안쪽

// 음성 → 텍스트 (OpenAI 받아쓰기). 음성 파일은 저장하지 않고 메모리에서만 처리한다.
// 받아쓴 글은 화면에서 사용자가 확인·수정한 뒤에만 분석·기록에 쓰인다.
export async function POST(req: Request) {
  return handle(async (ctx) => {
    if (!ctx.ai) throw new AppError(503, 'STT_UNAVAILABLE', '서버 받아쓰기가 설정되지 않았습니다. 글로 입력해 주세요.');
    const type = req.headers.get('content-type') || '';
    if (!type.startsWith('audio/')) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '음성(audio/*) 형식으로 보내 주세요.');
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '녹음된 소리가 없습니다.');
    if (buf.length > MAX_AUDIO) throw new AppError(413, 'PAYLOAD_TOO_LARGE', '녹음이 너무 깁니다. 짧게 나눠서 말해 주세요.');
    const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
    try {
      const text = await ctx.ai.transcribe(buf, `speech.${ext}`, type.split(';')[0]);
      if (!text) throw new AppError(422, 'STT_EMPTY', '말을 알아듣지 못했어요. 다시 말하거나 글로 써 주세요.');
      return { text };
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, error.code || 'UPSTREAM_ERROR', '받아쓰기에 실패했어요. 다시 말하거나 글로 써 주세요.');
    }
  });
}
