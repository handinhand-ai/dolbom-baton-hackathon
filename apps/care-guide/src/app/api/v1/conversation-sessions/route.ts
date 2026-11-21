export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson } from '@/lib/http';
import { createSession } from '@/lib/services/conversation';

export async function POST(req: Request) {
  return handle(async (ctx, staffId) => createSession(ctx, staffId, await readJson(req)), 201);
}
