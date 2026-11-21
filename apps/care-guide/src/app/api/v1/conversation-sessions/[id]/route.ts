export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, type IdParams } from '@/lib/http';
import { getSession } from '@/lib/services/conversation';

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle((ctx, staffId) => getSession(ctx, staffId, id));
}
