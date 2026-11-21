'use client';
// ⑤ 새로 알게 된 것 (보호자 · 데모): 종사자 기록 저장과 분리된 공식 가이드 반영 승인 흐름.
// 승인(decision)과 설명서 반영(apply)은 서버에 따로 기록된다. 보호자 인증은 구현하지 않았다.
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '@/components/client';
import { ErrorBox, Loading, Screen } from '@/components/ui';

function ItemCard({ q, onDone }: { q: any; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const newText: string = q.record.content || q.record.sourceText;

  async function act(decision: 'approved' | 'rejected' | 'on_hold', content: string | null) {
    setBusy(true);
    setErr(null);
    try {
      if (q.status !== 'approved') await api(`/api/v1/care-guide-reviews/${q.requestId}/decision`, { method: 'POST', body: { decision, content } });
      if (decision === 'approved') await api(`/api/v1/care-guide-reviews/${q.requestId}/apply`, { method: 'POST', body: {} });
      onDone();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }
  const out = <div aria-live="polite">{err && <ErrorBox message={err} />}</div>;

  if (q.status === 'approved') {
    return (
      <section className="card">
        <div className="row"><span className="chip mint">{q.categoryName}</span><span className="grow" /><span className="chip">넣기로 함 · 반영 전</span></div>
        <p>{q.proposedContent}</p>
        {q.applyError && <div className="notice danger">설명서 반영 실패: {q.applyError}</div>}
        <button className="primary big" disabled={busy} onClick={() => act('approved', null)}>설명서에 반영하기</button>
        {out}
      </section>
    );
  }
  if (q.currentGuideContent) {
    return (
      <section className="card">
        <div className="row"><strong className="grow">{q.categoryName} · 어느 쪽이 맞나요?</strong><span className="chip peach">원래 기록이 있어요</span></div>
        {q.status === 'on_hold' && <span className="chip butter">나중에 보기로 함</span>}
        <div className="ab">
          <div className="opt">
            <span className="tagAB">A</span><span className="src">원래 기록</span>
            <div className="content">{q.currentGuideContent}</div>
            <span className="src">보호자 · {fmtDate(q.currentGuideConfirmedAt)}</span>
            <button disabled={busy} onClick={() => act('rejected', null)}>원래대로</button>
          </div>
          <div className="opt new">
            <span className="tagAB">B</span><span className="src">새 기록</span>
            <div className="content">{newText}</div>
            <span className="src">{q.record.authorLabel} · {fmtDate(q.record.confirmedAt)}</span>
            <button className="primary" disabled={busy} onClick={() => act('approved', newText)}>새로 바꾸기</button>
          </div>
        </div>
        <div className="stack">
          <button className="ghost" disabled={busy} onClick={() => act('approved', `${q.currentGuideContent}\n${newText}`)}>둘 다 남겨 둘게요</button>
          <button className="ghost" disabled={busy} onClick={() => act('on_hold', null)}>나중에 볼게요</button>
        </div>
        {out}
      </section>
    );
  }
  return (
    <section className="card">
      <div className="row"><span className="chip mint">{q.categoryName}</span><span className="grow" />{q.status === 'on_hold' && <span className="chip butter">나중에 보기로 함</span>}</div>
      <p style={{ fontWeight: 700 }}>{newText}</p>
      <p className="src">{q.record.authorLabel} · {fmtDate(q.record.confirmedAt)} · 설명서의 이 항목은 아직 비어 있어요</p>
      <div className="stack">
        <button className="primary" disabled={busy} onClick={() => act('approved', newText)}>설명서에 넣을게요</button>
        <button disabled={busy} onClick={() => act('rejected', null)}>넣지 않을래요</button>
        <button className="ghost" disabled={busy} onClick={() => act('on_hold', null)}>나중에 볼게요</button>
      </div>
      {out}
    </section>
  );
}

function QuestionCard({ q, onDone }: { q: any; onDone: () => void }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setBusy(true); setErr(null);
    try { await api(`/api/v1/guardian-questions/${q.questionId}/answer`, { method: 'POST', body: { answer: answer.trim() } }); onDone(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <section className="card">
      <div className="row"><span className="chip butter">선생님의 질문</span><span className="grow" /><span className="src">{q.recipientName} · {fmtDate(q.askedAt)}</span></div>
      <p style={{ fontWeight: 700 }}>{q.question}</p>
      <label className="field-label" htmlFor={`ans-${q.questionId}`}>답해 주세요</label>
      <textarea id={`ans-${q.questionId}`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="아는 대로 짧게 적어 주세요" />
      <div style={{ marginTop: 10 }}><button className="primary big" disabled={busy || !answer.trim()} onClick={send}>답하기</button></div>
      {err && <ErrorBox message={err} />}
    </section>
  );
}

export default function GuardianPage() {
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const load = useCallback(async () => {
    try { setError(null); setItems((await api('/api/v1/care-guide-reviews')).items); } catch (e: any) { setError(e.message); }
    try { setQuestions((await api('/api/v1/guardian-questions?scope=guardian')).items); } catch { setQuestions([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = (items || []).filter((q) => ['proposed', 'on_hold', 'approved'].includes(q.status));
  const done = (items || []).filter((q) => ['rejected', 'applied'].includes(q.status));
  return (
    <Screen title="새로 알게 된 것" back="/">
      <div className="notice warn small">데모 화면이에요. 보호자 인증은 구현하지 않았어요. 넣기로 한 것만 설명서에 반영되고, 넣지 않아도 종사자 기록은 그대로 남아요.</div>
      {error ? <ErrorBox message={error} onRetry={load} /> : !items ? <Loading /> : (
        <>
          {questions.filter((x) => x.status === 'pending').map((x) => <QuestionCard key={x.questionId} q={x} onDone={load} />)}
          <h1 className="center">{pending.length ? `선생님이 ${pending.length}가지를 알려 줬어요` : '확인할 새 정보가 없어요'}</h1>
          <p className="center muted">넣은 것만 설명서에 남아요</p>
          {pending.map((q) => <ItemCard key={q.requestId} q={q} onDone={load} />)}
          {done.length > 0 && (
            <>
              <h2>확인 끝난 것</h2>
              {done.map((q) => (
                <div key={q.requestId} className="card">
                  <div className="row"><span className="chip mint">{q.categoryName}</span><span className="grow" />
                    <span className={`chip ${q.status === 'applied' ? 'solid' : 'line'}`}>{q.status === 'applied' ? '✓ 넣었어요' : '넣지 않았어요'}</span></div>
                  <p>{q.status === 'applied' ? q.proposedContent : q.record.content || q.record.sourceText}</p>
                  <p className="src">{q.record.authorLabel} · {fmtDate(q.record.confirmedAt)}{q.appliedAt ? ` · 반영 ${fmtDate(q.appliedAt)}` : ''}</p>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
