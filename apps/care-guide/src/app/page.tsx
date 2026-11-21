'use client';
// 대상자 선택 (SCR-301 · FR-301): 접근 권한이 있는 대상자만 보인다.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { api, plainName } from '@/components/client';
import { ErrorBox, Loading, Screen } from '@/components/ui';

export default function RecipientsPage() {
  const { status } = useApp();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { try { setSelected(sessionStorage.getItem('selectedRecipient')); if (sessionStorage.getItem('visitDone')) { setDone(true); sessionStorage.removeItem('visitDone'); } } catch { /* 저장소 없음 */ } }, []);

  const load = useCallback(async (query: string) => {
    try {
      setError(null);
      const r = await api(`/api/v1/recipients${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      setItems(r.items);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q.trim()), 250); return () => clearTimeout(t); }, [q, load]);

  return (
    <Screen title="성북 돌봄SOS" brand side={status?.guardianScreen ? <Link className="btn ghost small" href="/guardian">보호자</Link> : null}>
      {done && <div className="notice ok small" role="status">방문 정리를 마쳤어요. 수고하셨어요.</div>}
      <h1 className="big-title">오늘 만날 아이</h1>
      <p className="muted">{status?.staff?.displayName} · 센터는 번호로 자동 연결돼요 · 로그인 없이 데모로 들어왔어요</p>
      <div aria-live="polite">
        {error ? <ErrorBox message={error} onRetry={() => load(q.trim())} />
          : !items ? <Loading />
            : items.length === 0 ? <div className="card dashed center muted">{q ? '찾는 분이 없어요.' : '볼 수 있는 대상자가 없어요.'}</div>
              : (
                <div className="kid-list">
                  {items.map((x) => (
                    <Link key={x.recipientId} className={`kid-card ${x.recipientId === selected ? 'selected' : ''}`} href={`/home/${x.recipientId}`}>
                      <span className="avatar" aria-hidden="true">{plainName(x.displayName).slice(0, 1)}</span>
                      <span className="kid-name">{plainName(x.displayName)}<span className="muted small"> (가상)</span></span>
                      <span className="muted">{x.basicInfo?.age ? `${x.basicInfo.age}세` : ''}</span>
                      <span className="chip">공유 항목 {x.sharedCategoryCount}개</span>
                    </Link>
                  ))}
                </div>
              )}
      </div>
      {items && items.length > 3 && <div style={{ margin: '14px 0' }}><input type="search" placeholder="이름으로 찾기" aria-label="대상자 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      <p className="center muted small" style={{ marginTop: 24 }}>아이를 누르면 바로 시작돼요</p>
    </Screen>
  );
}
