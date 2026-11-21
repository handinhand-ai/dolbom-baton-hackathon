export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle } from '@/lib/http';
import { CATEGORIES } from '@/lib/categories';

export async function GET() {
  return handle(async () => ({ items: CATEGORIES }));
}
