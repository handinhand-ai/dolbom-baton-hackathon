export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson, type IdParams } from '@/lib/http';
import { saveDraft } from '@/lib/services/records';

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(async (ctx, staffId) => saveDraft(ctx, staffId, id, await readJson(req)), 201);
}
