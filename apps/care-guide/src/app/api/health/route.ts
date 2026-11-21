export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle } from '@/lib/http';

export async function GET() {
  return handle(async (ctx) => ({ status: 'ok', mode: ctx.db.mode }));
}
