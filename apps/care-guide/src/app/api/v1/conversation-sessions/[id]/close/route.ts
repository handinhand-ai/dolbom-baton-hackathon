export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, type IdParams } from '@/lib/http';
import { closeSession } from '@/lib/services/conversation';

export async function POST(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle((ctx, staffId) => closeSession(ctx, staffId, id));
}
