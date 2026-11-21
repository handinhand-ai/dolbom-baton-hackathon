export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, readJson, guardianOnly } from '@/lib/http';
import { askGuardian, listQuestionsForStaff, listQuestionsForGuardian } from '@/lib/services/guardian-questions';

// POST: 종사자가 보호자에게 묻기 / GET ?recipientId= : 종사자(대상자 지정) 또는 보호자 데모 화면(전체)
export async function POST(req: Request) {
  return handle(async (ctx, staffId) => askGuardian(ctx, staffId, await readJson(req)), 201);
}

export async function GET(req: Request) {
  const recipientId = new URL(req.url).searchParams.get('recipientId');
  const scope = new URL(req.url).searchParams.get('scope');
  return handle(async (ctx, staffId) => {
    if (scope === 'guardian') {
      guardianOnly(ctx);
      return listQuestionsForGuardian(ctx, recipientId);
    }
    return listQuestionsForStaff(ctx, staffId, recipientId);
  });
}
