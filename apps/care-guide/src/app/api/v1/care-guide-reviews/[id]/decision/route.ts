export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson, guardianOnly, type IdParams } from '@/lib/http';
import { decideGuideRequest } from '@/lib/services/records';

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(async (ctx) => {
    guardianOnly(ctx);
    return decideGuideRequest(ctx, id, await readJson(req));
  });
}
