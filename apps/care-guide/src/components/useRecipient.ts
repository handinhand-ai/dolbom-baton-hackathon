'use client';
// 선택된 대상자의 기본 정보·9개 항목 가이드 조회 (권한 없으면 오류)
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

export function useRecipient(rid: string) {
  const [data, setData] = useState<{ r: any; guide: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const [r, guide] = await Promise.all([
        api(`/api/v1/recipients/${encodeURIComponent(rid)}`),
        api(`/api/v1/recipients/${encodeURIComponent(rid)}/care-guide`),
      ]);
      setData({ r, guide });
      try { sessionStorage.setItem('selectedRecipient', rid); } catch { /* 저장소 없음 */ }
    } catch (e: any) {
      setError(e.message);
    }
  }, [rid]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}
