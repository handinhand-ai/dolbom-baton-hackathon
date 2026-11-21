export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson } from '@/lib/http';
import { runAnalysis } from '@/lib/services/analysis';

export async function POST(req: Request) {
  return handle(async (ctx, staffId) => runAnalysis(ctx, staffId, await readJson(req)), 201);
}
