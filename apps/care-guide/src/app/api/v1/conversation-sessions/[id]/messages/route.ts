export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson, type IdParams } from '@/lib/http';
import { listMessages, postMessage } from '@/lib/services/conversation';

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle((ctx, staffId) => listMessages(ctx, staffId, id));
}

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(async (ctx, staffId) => postMessage(ctx, staffId, id, await readJson(req)));
}
