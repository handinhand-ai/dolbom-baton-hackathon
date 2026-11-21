import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // 이 폴더(apps/care-guide/)를 프로젝트 루트로 고정한다(상위 폴더의 lockfile 추론 방지).
  turbopack: { root },
  outputFileTracingRoot: root,
  // PGlite(WASM)·pg 는 번들하지 않고 Node 런타임에서 그대로 불러온다.
  serverExternalPackages: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector', 'pg'],
  // Vercel 함수 번들에 마이그레이션 SQL을 포함한다(DATABASE_URL 없는 시연 배포에서 메모리 DB 초기화에 사용).
  outputFileTracingIncludes: {
    '/api/**/*': ['./supabase/migrations/**/*'],
  },
  poweredByHeader: false,
};

export default nextConfig;
