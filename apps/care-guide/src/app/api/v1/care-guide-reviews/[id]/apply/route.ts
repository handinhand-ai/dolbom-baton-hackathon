export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, guardianOnly, type IdParams } from '@/lib/http';
import { applyGuideRequest } from '@/lib/services/records';

export async function POST(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(async (ctx) => {
    guardianOnly(ctx);
    return applyGuideRequest(ctx, id);
  });
}
