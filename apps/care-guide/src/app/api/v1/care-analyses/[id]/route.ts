export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, type IdParams } from '@/lib/http';
import { getAnalysisView } from '@/lib/services/analysis';

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle((ctx, staffId) => getAnalysisView(ctx, staffId, id));
}
