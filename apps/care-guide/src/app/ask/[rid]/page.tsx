'use client';
// 물어보기·기록하기 통합 (SCR-302 + SCR-303 · FR-303~309)
// 입력 하나로 시작한다. 질문이면 분석·답변(WF-01·02), 기록이면 정리 → 종사자 확인 후 저장(WF-03).
// 질문인지 기록인지는 서버가 나누고, 사용자가 바로 바꿀 수 있다. 기록은 확인 전에는 저장하지 않는다.
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, longDate, plainName } from '@/components/client';
import { AnalysisAnswer, FollowAnswer } from '@/components/Answers';
import { DraftEditor } from '@/components/DraftEditor';
import { NoDataReply } from '@/components/GuardianAsk';
import { ErrorBox, Loading, Screen } from '@/components/ui';
import { useRecipient } from '@/components/useRecipient';
import { useVoice } from '@/components/useVoice';

type Item = { id: number; node: ReactNode };
type Intent = 'question' | 'record';

const QUICK = [
  { key: '식사', ico: '🍚' },
  { key: '수면', ico: '🌙' },
  { key: '화장실', ico: '🚻' },
  { key: '불안 발생', ico: '⚠' },
];

function AskScreen() {
  const rid = decodeURIComponent(useParams<{ rid: string }>().rid);
  const search = useSearchParams();
  const { data, error, reload } = useRecipient(rid);
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState(search.get('text') || '');
  const [inputType, setInputType] = useState<'text' | 'voice_transcribed'>('text');
  const [hint, setHint] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const session = useRef<{ sessionId: string; activeSituationId: string | null; firstAnalysisId: string | null } | null>(null);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const voice = useVoice({
    onText: (t) => { setText(t); setInputType('voice_transcribed'); setNote('받아쓴 글이에요. 틀린 곳은 고친 뒤 보내 주세요. (자동으로 보내지 않아요)'); },
    onError: (m) => setNote(m),
  });

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [items]);

  // 홈 입력바에서 온 글(mode=ask)은 질문으로, 기록 남기기(mode=record)는 기록으로 시작한다. 이후 입력은 서버가 나눈다.
  const firstIntent = (): Intent | null => (items.length !== 0 ? null : search.get('mode') === 'record' ? 'record' : search.get('mode') === 'ask' ? 'question' : null);

  const push = (node: ReactNode) => { const id = ++seq.current; setItems((xs) => [...xs, { id, node }]); return id; };
  const replace = (id: number, node: ReactNode | null) => setItems((xs) => (node === null ? xs.filter((x) => x.id !== id) : xs.map((x) => (x.id === id ? { id, node } : x))));

  /** 질문: 처음이면 상황 분석, 이후는 같은 상황의 후속 질문 */
  async function ask(content: string, waitId: number, decision: 'continue_existing' | 'start_new' | null = null) {
    if (!session.current) {
      const a = await api('/api/v1/care-analyses', {
        method: 'POST',
        body: { recipientId: rid, situation: content, inputType, transcriptConfirmed: inputType === 'voice_transcribed', observedAt: new Date().toISOString() },
      });
      replace(waitId, a.noData ? <NoDataReply rid={rid} question={content} medical={a.safety?.medicalConcern} /> : <AnalysisAnswer a={a} />);
      const s = await api('/api/v1/conversation-sessions', { method: 'POST', body: { recipientId: rid, analysisId: a.analysisId } });
      session.current = { sessionId: s.sessionId, activeSituationId: s.activeSituationId, firstAnalysisId: a.analysisId };
      return;
    }
    const res = await api(`/api/v1/conversation-sessions/${session.current.sessionId}/messages`, {
      method: 'POST',
      body: { content, inputType, situationId: session.current.activeSituationId, decision },
    });
    if (res.needsUserDecision) {
      const d = res.needsUserDecision;
      replace(waitId, (
        <div className="answer" role="group" aria-label="상황 처리 방식 선택">
          <div className="kicker">새로운 상황인가요?</div>
          <p>{d.reason || '지금 상황과 다른 내용이 있어요.'}</p>
          <p className="small muted">고르기 전에는 이전 상황의 근거와 섞어서 답하지 않아요.</p>
          <div className="stack">
            <button className="primary" onClick={() => { replace(waitId, null); run(content, 'question', 'start_new'); }}>새 상황으로 나눠서 볼게요</button>
            <button onClick={() => { replace(waitId, null); run(content, 'question', 'continue_existing'); }}>지금 상황과 이어서 볼게요</button>
          </div>
        </div>
      ));
    } else if (res.analysis) {
      session.current.activeSituationId = res.analysis.situationId;
      replace(waitId, <><div className="notice info small">새 상황으로 나눴어요. 이 상황의 근거는 이전 상황과 따로 봐요.</div>{res.analysis.noData ? <NoDataReply rid={rid} question={content} medical={res.analysis.safety?.medicalConcern} /> : <AnalysisAnswer a={res.analysis} />}</>);
    } else {
      replace(waitId, res.assistantMessage?.basis === 'no_data' ? <NoDataReply rid={rid} question={content} /> : <FollowAnswer m={res.assistantMessage} rid={rid} />);
    }
  }

  /** 기록: 정리한 기록 후보를 보여 주고, 종사자가 확인한 뒤에만 저장한다 */
  async function record(content: string, waitId: number, activityHint: string | null) {
    const d = await api('/api/v1/care-record-drafts', {
      method: 'POST',
      body: { recipientId: rid, rawText: content, inputType, transcriptConfirmed: inputType === 'voice_transcribed', activityHint, observedAt: new Date().toISOString() },
    });
    replace(waitId, (
      <div className="answer">
        <div className="kicker">기록으로 정리했어요 · 확인 후에만 저장돼요</div>
        <DraftEditor rid={rid} recipient={data!.r} draft={d}
          onSaved={() => push(<div className="notice ok small" role="status">기록을 저장했어요. 방문이 끝나면 일지에 자동으로 들어가요.</div>)}
          onCancel={() => replace(waitId, <div className="notice info small">기록 후보를 저장하지 않았어요.</div>)} />
      </div>
    ));
  }

  async function run(content: string, forced: Intent | null = null, decision: 'continue_existing' | 'start_new' | null = null, again = false) {
    if (!content || busy || !data) return;
    setBusy(true);
    const activityHint = hint;
    if (!decision && !again) push(<div className="bubble-q">{content}</div>);
    const waitId = push(<div className="answer" role="status"><span className="spinner" aria-hidden="true" /> 질문인지 기록인지 나누는 중이에요</div>);
    try {
      let intent: Intent = forced || (decision ? 'question' : (await api('/api/v1/input-intent', { method: 'POST', body: { text: content, activityHint } })).intent);
      const other: Intent = intent === 'question' ? 'record' : 'question';
      if (!decision && !again) {
        push(
          <div className="intent-note small" role="status">
            {intent === 'question' ? '질문으로 이해했어요' : '기록으로 이해했어요'} ·{' '}
            <button type="button" className="linklike" onClick={() => run(content, other, null, true)}>{other === 'question' ? '질문으로 보내기' : '기록으로 남기기'}</button>
          </div>,
        );
      }
      replace(waitId, <div className="answer" role="status"><span className="spinner" aria-hidden="true" /> {intent === 'question' ? '설명서와 기록을 찾고 있어요' : '기록을 정리하고 있어요'}</div>);
      if (intent === 'question') await ask(content, waitId, decision);
      else await record(content, waitId, activityHint);
      setText(''); setInputType('text'); setNote(''); setHint(null);
    } catch (e: any) {
      const expired = e.code === 'SESSION_EXPIRED' || e.code === 'SESSION_CLOSED';
      replace(waitId, (
        <ErrorBox message={e.message} onRetry={() => { replace(waitId, null); run(content, forced, decision, again); }}>
          {expired && (
            <button className="primary" onClick={async () => {
              const s = await api('/api/v1/conversation-sessions', { method: 'POST', body: { recipientId: rid, analysisId: session.current?.firstAnalysisId } });
              session.current = { sessionId: s.sessionId, activeSituationId: s.activeSituationId, firstAnalysisId: session.current?.firstAnalysisId || null };
              replace(waitId, null);
              setNote('새 대화를 시작했어요.');
            }}>새 대화 시작</button>
          )}
        </ErrorBox>
      ));
    } finally {
      setBusy(false);
    }
  }

  // 홈 입력바에서 글을 써서 넘어온 경우(send=1)에만, 대상 정보가 준비되면 한 번 자동으로 보낸다. 받아쓴 글(text만)은 자동으로 보내지 않는다.
  const autoSent = useRef(false);
  useEffect(() => {
    if (autoSent.current || !data || search.get('send') !== '1' || !text.trim()) return;
    autoSent.current = true;
    run(text.trim(), firstIntent());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (error) return <Screen title="물어보기·기록" back="/"><ErrorBox message={error} onRetry={reload} /><Link className="btn big" href="/">대상자 다시 고르기</Link></Screen>;
  if (!data) return <Screen title="물어보기·기록" back={`/home/${rid}`}><Loading /></Screen>;
  const name = plainName(data.r.displayName);
  const chips = [`${name}이 밥을 안 먹어요`, '다른 방법은 없을까?', '밥은 어떻게 줘요?', '씻을 때 어떻게 해요?'];

  return (
    <Screen title={name} back={`/home/${rid}`} rid={rid} tab="home" mainClass="ask-main">
      <p className="chat-date">{longDate()}</p>
      <div className="scope-pill"><span className="chip">✦ 보호자가 확인한 설명서와 종사자 기록 안에서만 답해요</span></div>
      {items.length === 0 && <p className="center muted small">궁금한 걸 물어보거나, 있었던 일을 남겨 주세요. 질문인지 기록인지 AI가 나눠요.</p>}
      <div className="chat" aria-live="polite">{items.map((x) => <div key={x.id} style={{ display: 'contents' }}>{x.node}</div>)}</div>
      <div ref={endRef} />
      {items.length === 0 && <div className="chips ask-chips">{chips.map((c) => <button key={c} type="button" disabled={busy} onClick={() => run(c)}>{c}</button>)}</div>}
      <div className="quick-row" role="group" aria-label="빠른 기록 (입력 시작)">
        <span className="small muted">빠른 기록</span>
        {QUICK.map((q) => (
          <button key={q.key} type="button" className="mini" aria-pressed={hint === q.key}
            onClick={() => { const next = hint === q.key ? null : q.key; setHint(next); setNote(next ? `'${next}' 기록을 시작해요. 있었던 일을 말하거나 써 주세요. 버튼만으로는 저장되지 않아요.` : ''); }}>
            <span aria-hidden="true">{q.ico}</span> {q.key}
          </button>
        ))}
      </div>
      <p className="small muted" role="status">{voice.busy ? '받아쓰는 중…' : voice.recording ? '듣고 있어요… 다 말했으면 다시 눌러 주세요' : note}</p>
      <div className="composer">
        <button
          type="button"
          className="round"
          aria-label={voice.supported ? (voice.recording ? '녹음 끝내기' : '말로 입력') : '이 브라우저는 음성 입력을 지원하지 않아요'}
          aria-pressed={voice.recording}
          disabled={!voice.supported || voice.busy}
          onClick={() => (voice.recording ? voice.stop() : voice.start())}
        >{voice.recording ? '⏹' : '🎤'}</button>
        <input
          type="text"
          placeholder="물어보거나 기록할 내용을 적어 주세요"
          aria-label="질문 또는 기록 입력"
          autoComplete="off"
          value={text}
          onChange={(e) => { setText(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && text.trim()) run(text.trim(), firstIntent()); }}
        />
        <button className="primary round" aria-label="보내기" disabled={!text.trim() || busy} onClick={() => run(text.trim(), firstIntent())}>↑</button>
      </div>
    </Screen>
  );
}

export default function AskPage() {
  return <Suspense fallback={<Loading />}><AskScreen /></Suspense>;
}
