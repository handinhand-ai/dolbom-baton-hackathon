export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, type IdParams } from '@/lib/http';

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle((ctx, staffId) => ctx.repo.getRecipient(staffId, id));
}
