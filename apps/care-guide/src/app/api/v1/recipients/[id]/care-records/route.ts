export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, type IdParams } from '@/lib/http';

export async function GET(req: Request, { params }: IdParams) {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  return handle(async (ctx, staffId) => ({
    items: await ctx.repo.listCareRecords(staffId, id, { limit: sp.get('limit'), category: sp.get('category') }),
    nextCursor: null,
  }));
}
