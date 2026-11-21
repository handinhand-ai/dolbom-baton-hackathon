export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson } from '@/lib/http';
import { createDraft } from '@/lib/services/records';

export async function POST(req: Request) {
  return handle(async (ctx, staffId) => createDraft(ctx, staffId, await readJson(req)), 201);
}
