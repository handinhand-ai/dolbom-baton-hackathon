'use client';
// 시스템 상태(연동 모드)와 9개 카테고리를 한 번 불러와 모든 화면에서 쓴다. 시연 모드는 상단 띠로 항상 표시한다.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './client';

export interface SystemStatus {
  database: { mode: string; label: string };
  ai: { mode: string; label: string };
  embedding: { mode: string; label: string };
  stt: { mode: string; label: string };
  staff: { staffId: string; displayName: string } | null;
  guardianScreen: boolean;
  sessionIdleMinutes: number;
}
export interface Category { code: string; name: string; easyLabel: string; group: string; order: number }

interface AppState { status: SystemStatus | null; categories: Category[]; error: string | null; retry: () => void }
const Ctx = createContext<AppState>({ status: null, categories: [], error: null, retry: () => {} });
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, c] = await Promise.all([api<SystemStatus>('/api/v1/system/status'), api<{ items: Category[] }>('/api/v1/categories')]);
      setStatus(s);
      setCategories(c.items);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA 등록 실패는 앱 사용을 막지 않는다 */ });
    }
  }, []);

  return (
    <Ctx.Provider value={{ status, categories, error, retry: load }}>
      {children}
    </Ctx.Provider>
  );
}

/** 키가 없어 대체 수단으로 동작하는 연동을 항상 표시한다. */
export function ModeBanner() {
  const { status } = useApp();
  if (!status) return null;
  // 화면을 어지럽히지 않게 한 줄로 줄여 보여 주고, 자세한 연동 상태는 마우스를 올리거나 마이 페이지에서 본다.
  const parts: string[] = [];
  const details: string[] = [];
  if (status.database.mode !== 'supabase') { parts.push('로컬 시연 DB'); details.push(`DB: ${status.database.label}`); }
  if (status.ai.mode !== 'openai') { parts.push('규칙 기반 분석'); details.push(`분석: ${status.ai.label}`); }
  if (status.embedding.mode !== 'openai') { parts.push('해시 검색'); details.push(`벡터: ${status.embedding.label}`); }
  if (!parts.length) return null;
  return <div className="mode-banner" role="status" title={details.join('\n')}><strong>시연 모드 · </strong>{parts.join(' · ')}</div>;
}
