// 임베딩 공급자 (vector(1024) 고정)
// - openai: text-embedding-3-small, dimensions=1024 (OPENAI_API_KEY 필요)
// - local-hash: 문자 n-gram 해시 벡터. 의미 임베딩이 아니며 로컬 시연용 대체 수단이다.
import crypto from 'node:crypto';
import OpenAI from 'openai';
import type { AppConfig } from '../config';

const DIM = 1024;

export interface Embedder {
  model: string;
  semantic: boolean;
  embed(texts: string[], inputType?: 'query' | 'document'): Promise<(number[] | null)[]>;
}

function hashIndex(s: string) {
  const h = crypto.createHash('md5').update(s).digest();
  return { idx: h.readUInt32LE(0) % DIM, sign: (h[4] & 1) === 0 ? 1 : -1 };
}

export function localHashEmbedding(text: string): number[] | null {
  const clean = String(text ?? '').replace(/[^0-9A-Za-z가-힣]+/g, ' ').trim();
  const vec = new Array<number>(DIM).fill(0);
  for (const w of clean.split(/\s+/).filter(Boolean)) {
    const padded = ` ${w} `;
    for (let n = 2; n <= 3; n += 1) {
      for (let i = 0; i + n <= padded.length; i += 1) {
        const { idx, sign } = hashIndex(padded.slice(i, i + n));
        vec[idx] += sign;
      }
    }
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? null : vec.map((x) => x / norm);
}

export function createEmbedder(cfg: AppConfig['embedding']): Embedder {
  if (cfg.provider === 'openai') {
    const client = new OpenAI({ apiKey: cfg.apiKey, timeout: 20000, maxRetries: 1 });
    return {
      model: cfg.model,
      semantic: true,
      async embed(texts) {
        try {
          const r = await client.embeddings.create({ model: cfg.model, input: texts, dimensions: DIM });
          return [...r.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
        } catch {
          const err = new Error('임베딩 요청에 실패했습니다.') as Error & { code?: string };
          err.code = 'UPSTREAM_ERROR';
          throw err;
        }
      },
    };
  }
  return {
    model: cfg.model,
    semantic: false,
    async embed(texts) {
      return texts.map((t) => localHashEmbedding(t));
    },
  };
}
