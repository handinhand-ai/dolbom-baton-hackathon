// API 라우트 공통 처리: 오류 형식(API 명세 3.3), JSON 본문 검증, 컨텍스트 주입
import crypto from 'node:crypto';
import { AppError } from './repo';
import { getContext, type AppContext } from './context';

const MAX_BODY = 64 * 1024;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function readJson(req: Request): Promise<any> {
  const type = req.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON 형식으로 보내 주세요.');
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY) throw new AppError(413, 'PAYLOAD_TOO_LARGE', '요청 내용이 너무 큽니다.');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('not object');
    return v;
  } catch {
    throw new AppError(400, 'INVALID_JSON', '요청 형식(JSON)이 올바르지 않습니다.');
  }
}

type Handler = (ctx: AppContext, staffId: string) => Promise<unknown>;

/** 요청 본문의 사용자 식별값은 신뢰하지 않고, 서버 설정의 데모 종사자를 사용한다. */
export async function handle(fn: Handler, successStatus = 200): Promise<Response> {
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;
  try {
    const ctx = await getContext();
    const out = await fn(ctx, ctx.config.demo.staffId);
    return json(successStatus, out);
  } catch (error) {
    if (error instanceof AppError) {
      return json(error.status, { error: { code: error.code, message: error.message, details: error.details, requestId } });
    }
    console.error(`[${requestId}]`, error);
    return json(500, { error: { code: 'INTERNAL_ERROR', message: '예상하지 못한 오류가 발생했습니다. 다시 시도해 주세요.', requestId } });
  }
}

export function guardianOnly(ctx: AppContext) {
  if (!ctx.config.demo.guardianScreen) throw new AppError(404, 'NOT_FOUND', '경로를 찾을 수 없습니다.');
}

export type IdParams = { params: Promise<{ id: string }> };
