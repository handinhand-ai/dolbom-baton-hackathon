export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle } from '@/lib/http';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() || null;
  return handle(async (ctx, staffId) => ({ items: await ctx.repo.listRecipients(staffId, q), nextCursor: null }));
}
