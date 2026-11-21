export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handle } from '@/lib/http';

export async function GET() {
  return handle(async (ctx, staffId) => {
    const staff = await ctx.repo.getStaff(staffId);
    const ephemeral = ctx.config.db.mode === 'local-pglite' && ctx.config.db.ephemeral;
    return {
      database: ctx.db.mode === 'supabase'
        ? { mode: 'supabase', label: 'Supabase Postgres + pgvector' }
        : { mode: 'local-pglite', label: ephemeral ? '메모리 시연 DB (PGlite + pgvector, 재시작하면 초기화, Supabase 미연결)' : '로컬 시연 DB (PGlite + pgvector, Supabase 미연결)' },
      ai: ctx.ai ? { mode: 'openai', label: `OpenAI (${ctx.ai.model})` } : { mode: 'local', label: '규칙 기반 데모 분석 (OpenAI 키 미설정)' },
      embedding: ctx.embedder.semantic
        ? { mode: 'openai', label: `OpenAI 임베딩 (${ctx.embedder.model})` }
        : { mode: 'local-hash', label: '문자 n-gram 해시 벡터 (의미 검색 아님, 로컬 시연용)' },
      stt: ctx.ai ? { mode: 'openai', label: `OpenAI 받아쓰기 (${ctx.config.ai.sttModel})` } : { mode: 'browser', label: '브라우저 음성 인식 (지원 브라우저에서만)' },
      staff: staff && { staffId: staff.staff_id, displayName: staff.display_name },
      guardianScreen: ctx.config.demo.guardianScreen,
      sessionIdleMinutes: ctx.config.session.idleMinutes,
    };
  });
}
