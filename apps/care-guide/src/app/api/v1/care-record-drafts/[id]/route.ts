export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson, type IdParams } from '@/lib/http';
import { patchDraft } from '@/lib/services/records';

export async function PATCH(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(async (ctx, staffId) => patchDraft(ctx, staffId, id, await readJson(req)));
}
