'use client';
// 종사자 홈 (SCR-300): 꼭 알아야 할 한 문장 + 대상자 캐릭터 + 물어보기 입력바.
// 입력바에 쓰면 물어보기·기록 화면으로 이어지고(질문으로 보내기), 마이크를 누르면 받아쓴 글을 확인한 뒤 보낸다.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { basicFacts, buildHeadline, plainName } from '@/components/client';
import { ErrorBox, Icon, Loading, Screen } from '@/components/ui';
import { useRecipient } from '@/components/useRecipient';
import { useVoice } from '@/components/useVoice';

export default function HomePage() {
  const rid = decodeURIComponent(useParams<{ rid: string }>().rid);
  const router = useRouter();
  const { data, error, reload } = useRecipient(rid);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const voice = useVoice({
    onText: (t) => router.push(`/ask/${encodeURIComponent(rid)}?mode=ask&text=${encodeURIComponent(t)}`),
    onError: (m) => setNote(m),
  });

  if (error) return <Screen title="돌봄바통" brand><ErrorBox message={error} onRetry={reload} /><Link className="btn big" href="/">대상자 다시 고르기</Link></Screen>;
  if (!data) return <Screen title="돌봄바통" brand><Loading /></Screen>;

  const name = plainName(data.r.displayName);
  const headline = buildHeadline(data.guide.categories);
  const send = () => {
    const q = text.trim();
    if (q) router.push(`/ask/${encodeURIComponent(rid)}?mode=ask&text=${encodeURIComponent(q)}&send=1`);
  };

  return (
    <Screen
      title="돌봄바통" brand rid={rid} tab="home" mainClass="home-main"
      side={<Link className="avatar-btn" href={`/my/${encodeURIComponent(rid)}`} aria-label="마이 페이지"><img src="/minjun.png" alt="" width="36" height="43" /></Link>}
    >
      <section className="home-hero" aria-label={`${name} 소개`}>
        <h1 className="headline">{headline || `${name}에 대해 알려드릴게요`}</h1>
        <img className="home-character" src="/minjun.png" alt={`${name} 캐릭터`} width="190" height="229" />
        <div className="home-name">{name}</div>
        <div className="home-facts">{basicFacts(data.r.basicInfo)}</div>
        {data.r.basicInfo?.impression && <div className="home-impression">{data.r.basicInfo.impression}</div>}
      </section>
      <p className="home-note" role="status">{voice.busy ? '받아쓰는 중…' : voice.recording ? '듣고 있어요… 다 말했으면 다시 눌러 주세요' : note}</p>
      <form className="home-ask" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          type="text"
          placeholder={`${name}에 대해 물어봐요`}
          aria-label={`${name}에 대해 물어보기`}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className="mic-round"
          aria-label={voice.supported ? (voice.recording ? '녹음 끝내기' : '말로 물어보기') : '이 브라우저는 음성 입력을 지원하지 않아요'}
          aria-pressed={voice.recording}
          disabled={!voice.supported || voice.busy}
          onClick={() => (voice.recording ? voice.stop() : voice.start())}
        ><Icon name="mic" size={22} /></button>
      </form>
    </Screen>
  );
}
