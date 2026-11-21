'use client';
// 공통 화면 요소: 상단바, 하단 탭, 오류·로딩, 근거 칩, 답변 듣기(TTS)
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { BASIS, fmtShort } from './client';
import { ModeBanner } from './AppProvider';

export function Topbar({ title, brand = false, back, side }: { title: string; brand?: boolean; back?: string; side?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="topbar">
      {back ? <button className="back" aria-label="뒤로" onClick={() => router.push(back)}>‹</button> : <span style={{ width: 48 }} />}
      <div className={`title ${brand ? 'brand' : ''}`}>{title}</div>
      <div className="side">{side}</div>
    </header>
  );
}

export type TabKey = 'home' | 'card' | 'visit' | 'my';

// 24px 선 아이콘(현재 글자색을 따른다). 장식용이라 스크린리더에서는 숨긴다.
const ICONS: Record<TabKey, string[]> = {
  home: ['M3.5 11 12 3.5 20.5 11V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z'],
  card: ['M3.5 6.5h17v11h-17z', 'M3.5 10.5h17', 'M7 14.5h4'],
  visit: ['M6.5 3h8l4 4v14h-12z', 'M14 3v5h4.5', 'M9.5 13h5', 'M9.5 17h5'],
  my: ['M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 21a7.5 7.5 0 0 1 15 0'],
};

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS | 'back' | 'mic' | 'phone' | 'check' | 'arrow' | 'moon' | 'bowl' | 'pill' | 'sparkle'; size?: number }) {
  const paths = {
    ...ICONS,
    arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
    moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
    bowl: ['M3.5 12h17a8.5 8.5 0 0 1-17 0z', 'M8 8.5c0-1 1-1.5 1-2.5', 'M12 8.5c0-1 1-1.5 1-2.5', 'M16 8.5c0-1 1-1.5 1-2.5'],
    pill: ['M10.5 4.5a4.2 4.2 0 0 1 6 6l-6 6a4.2 4.2 0 0 1-6-6z', 'M8 8l6 6'],
    sparkle: ['M12 3v5', 'M12 16v5', 'M3 12h5', 'M16 12h5', 'M6 6l3 3', 'M15 15l3 3', 'M18 6l-3 3', 'M9 15l-3 3'],
    back: ['M15 5l-7 7 7 7'],
    mic: ['M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 18v3'],
    phone: ['M6.6 3.5h2.7l1.4 3.8-1.8 1.2a11 11 0 0 0 5.6 5.6l1.2-1.8 3.8 1.4v2.7a2 2 0 0 1-2.1 2A15.5 15.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z'],
    check: ['M6 12.5l4 4 8-9'],
  }[name];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** 종사자 하단 탭: 홈 · 돌봄 카드 · 돌봄 일지 · 마이 페이지 */
export function TabBar({ rid, current }: { rid: string; current: TabKey }) {
  const tab = (key: TabKey, label: string) => (
    <Link href={`/${key}/${encodeURIComponent(rid)}`} aria-current={current === key ? 'page' : undefined}>
      <Icon name={key} />{label}
    </Link>
  );
  return (
    <nav className="tabbar" aria-label="종사자 메뉴">
      {tab('home', '홈')}{tab('card', '돌봄 카드')}{tab('visit', '돌봄 일지')}{tab('my', '마이 페이지')}
    </nav>
  );
}

export function Loading({ text = '불러오는 중' }: { text?: string }) {
  return <p role="status" className="muted"><span className="spinner" aria-hidden="true" /> {text}</p>;
}

export function ErrorBox({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div className="notice danger" role="alert">
      <strong>오류 · </strong>{message}
      {onRetry && <div className="row" style={{ marginTop: 8 }}><button onClick={onRetry}>다시 시도</button></div>}
      {children}
    </div>
  );
}

export function BasisChip({ basis }: { basis?: string | null }) {
  const [tone, text] = BASIS[basis || ''] || ['line', basis || ''];
  return <span className={`chip ${tone}`}>{text}</span>;
}

export function RefChip({ e, n }: { e: any; n?: number }) {
  const guide = e.sourceType === 'official_care_guide';
  return (
    <a
      className={`btn ref ${guide ? 'guide' : 'record'}`}
      href={`#ev-${e.evidenceId}`}
      onClick={(ev) => {
        ev.preventDefault();
        const t = document.getElementById(`ev-${e.evidenceId}`);
        t?.closest('details')?.setAttribute('open', '');
        t?.focus();
      }}
    >
      {n ? `근거 ${n} · ` : ''}{e.categoryName || ''} · {guide ? '보호자' : '종사자'} {fmtShort(e.createdAt)}
    </a>
  );
}

export function SpeakButton({ text }: { text: () => string }) {
  const [msg, setMsg] = useState('');
  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported('speechSynthesis' in window); }, []);
  if (!supported) return <button type="button" className="ghost" disabled>🔈 음성 재생 불가</button>;
  return (
    <span className="row">
      <button
        type="button"
        className="ghost"
        onClick={() => {
          try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text());
            u.lang = 'ko-KR';
            u.rate = 0.95;
            u.onerror = () => setMsg('음성 재생에 실패했어요. 글로 확인해 주세요.');
            u.onend = () => setMsg('');
            speechSynthesis.speak(u);
            setMsg('읽는 중…');
          } catch {
            setMsg('음성 재생에 실패했어요. 글로 확인해 주세요.');
          }
        }}
      >🔈 답변 듣기</button>
      <span className="small muted" role="status">{msg}</span>
    </span>
  );
}

/** 화면 틀: 상단바 → 시연 모드 띠 → 본문 → (대상자 화면이면) 하단 탭 */
export function Screen(props: {
  title: string; brand?: boolean; back?: string; side?: ReactNode;
  rid?: string; tab?: TabKey; mainClass?: string; children: ReactNode;
}) {
  return (
    <>
      <Topbar title={props.title} brand={props.brand} back={props.back} side={props.side} />
      <ModeBanner />
      <main id="main" tabIndex={-1} className={props.mainClass}>{props.children}</main>
      {props.rid && props.tab && <TabBar rid={props.rid} current={props.tab} />}
    </>
  );
}
