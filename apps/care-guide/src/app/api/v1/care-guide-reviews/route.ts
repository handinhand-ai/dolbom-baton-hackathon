export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle, guardianOnly } from '@/lib/http';
import { listGuideRequests } from '@/lib/services/records';

// 보호자 승인 흐름 (데모: 인증 미구현, DEMO_GUARDIAN_SCREEN=false 로 끈다)
export async function GET(req: Request) {
  const recipientId = new URL(req.url).searchParams.get('recipientId');
  return handle(async (ctx) => {
    guardianOnly(ctx);
    return listGuideRequests(ctx, recipientId);
  });
}
