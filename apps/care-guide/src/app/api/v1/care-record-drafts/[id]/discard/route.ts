export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, type IdParams } from '@/lib/http';
import { discardDraft } from '@/lib/services/records';

export async function POST(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle((ctx, staffId) => discardDraft(ctx, staffId, id));
}
