'use client';
// 설명서에 없는 질문의 답변 + 보호자께 묻기. 질문은 입력한 그대로 보호자 데모 화면에 올라가고, 답은 이 화면에서 바로 본다.
// 답은 설명서와 분리되어 있다. 설명서에 넣으려면 기록으로 남긴 뒤 보호자 승인을 거친다.
import { useEffect, useState } from 'react';
import { api } from './client';
import { ErrorBox, Icon } from './ui';

export function NoDataReply({ rid, question, medical = false }: { rid: string; question: string; medical?: boolean }) {
  const [q, setQ] = useState<any>(null);
  const [text, setText] = useState(question);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(content: string) {
    const body = content.trim();
    if (!body) { setErr('보호자께 보낼 질문을 적어 주세요.'); return; }
    setBusy(true); setErr(null);
    try { setQ(await api('/api/v1/guardian-questions', { method: 'POST', body: { recipientId: rid, question: body } })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  // 답이 올 때까지 10초마다 확인 (화면이 열려 있는 동안만)
  useEffect(() => {
    if (!q || q.status === 'answered') return;
    const t = setInterval(async () => {
      try {
        const r = await api(`/api/v1/guardian-questions?recipientId=${encodeURIComponent(rid)}`);
        const mine = r.items.find((x: any) => x.questionId === q.questionId);
        if (mine?.status === 'answered') setQ(mine);
      } catch { /* 다음 확인 때 다시 시도 */ }
    }, 10000);
    return () => clearInterval(t);
  }, [q, rid]);

  return (
    <>
      <article className="answer nodata outlined" aria-label="AI 답변">
        <p>설명서에 기재되지 않은 내용이에요.<br />짐작해서 알려드리지 않을게요.</p>
        {medical && <div className="notice danger" role="alert"><strong>의료 확인 필요 · </strong>진단·처방은 하지 않아요. 보호자나 의료진에게 확인해 주세요.</div>}
        {!q && <button type="button" className="outline-btn" disabled={busy} onClick={() => send(question)}>보호자에게 물어보기</button>}
      </article>

      {q?.status === 'answered' ? (
        <section className="reply-card answered" role="status" aria-label="보호자의 답">
          <h3>보호자가 답했어요</h3>
          <p>{q.answer}</p>
          <p className="small muted">이 답은 설명서와 별개예요. 설명서에 넣으려면 기록으로 남겨 주세요.</p>
        </section>
      ) : q ? (
        <section className="reply-card" role="status" aria-label="보호자께 보냈어요">
          <h3>보호자께 보냈어요</h3>
          <p className="sent-q">“{q.question}”</p>
          <p className="small muted">답이 오면 여기에 바로 알려드려요. 이 화면을 열어 두세요.</p>
        </section>
      ) : (
        <div className="guardian-ask">
          <section className="reply-card" aria-label="답이 오면">
            <h3>답이 오면</h3>
            <p>여기에 바로 알려드려요.<br />답은 설명서와 별개로 보여요. 설명서에 넣으려면 기록으로 남겨 주세요.</p>
          </section>
          <form className="send-row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input type="text" aria-label="보호자께 보낼 질문" placeholder="보낼 질문을 적어 주세요" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="send-arrow" aria-label="보호자께 질문 보내기" disabled={busy || !text.trim()}><Icon name="arrow" size={20} /></button>
          </form>
          <p className="ask-foot">질문은 입력한 그대로 보호자 화면으로 보내요 · 보호자 연락처는 보이지 않아요</p>
          {err && <ErrorBox message={err} onRetry={() => send(text)} />}
        </div>
      )}
    </>
  );
}
