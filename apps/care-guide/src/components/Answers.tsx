'use client';
// 물어보기 답변 카드: 상황 분석(WF-01) 결과와 후속 답변(WF-02)
import Link from 'next/link';
import { fmtDate, fmtTime } from './client';
import { BasisChip, RefChip, SpeakButton } from './ui';

function EvidenceList({ items, numbered = true }: { items: any[]; numbered?: boolean }) {
  return (
    <ol className="evidence">
      {items.map((e, i) => (
        <li key={e.evidenceId} id={`ev-${e.evidenceId}`} tabIndex={-1} className={e.stance}>
          <div className="row">
            {numbered && <strong>근거 {i + 1}</strong>}
            <span className={`chip ${e.sourceType === 'official_care_guide' ? 'mint' : ''}`}>{e.sourceType === 'official_care_guide' ? '설명서 (보호자 확인)' : '종사자 확인 기록'}</span>
            {e.stance === 'contradicts' && <span className="chip peach">다른 기록과 달라요</span>}
          </div>
          <div>{e.excerpt}</div>
          <div className="src">{e.categoryName || ''} · 작성일 {fmtDate(e.createdAt)} · 출처 ID {e.sourceId}</div>
        </li>
      ))}
    </ol>
  );
}

export function AnalysisAnswer({ a }: { a: any }) {
  const index = new Map<string, number>(a.evidence.map((e: any, i: number) => [e.evidenceId, i + 1]));
  const Refs = ({ ids }: { ids?: string[] }) => (
    <div className="refs">{(ids || []).filter((id) => index.has(id)).map((id) => <RefChip key={id} e={a.evidence[index.get(id)! - 1]} n={index.get(id)} />)}</div>
  );
  const s = a.situation || {};
  const cmp = a.comparison || {};
  const conflict = cmp.status === 'conflicting_evidence';
  const kicker = a.noData ? '설명서에 아직 없어요' : conflict ? '찾았지만 기록이 서로 달라요' : '설명서와 기록에서 찾았어요';
  const cmpChip: Record<string, React.ReactNode> = {
    evidence_found: <span className="chip mint">비교할 기록 있음</span>,
    no_comparable_records: <span className="chip butter">비교할 기록 없음</span>,
    conflicting_evidence: <span className="chip peach">기록 충돌</span>,
  };
  let n = 0;
  // 설명서에 없는 질문은 짧게 답하고 바로 보호자께 물어보게 한다(비교·단계 안내를 늘어놓지 않는다).
  if (a.noData) {
    return (
      <article className="answer nodata" aria-label="AI 답변">
        <p>설명서에 아직 없어요.<br />짐작해서 알려드리지 않을게요.</p>
        {a.safety?.medicalConcern && <div className="notice danger" role="alert"><strong>의료 확인 필요 · </strong>진단·처방은 하지 않아요. 보호자나 의료진에게 확인해 주세요.</div>}
        <p className="ask-lead">보호자에게 연락할까요?</p>
      </article>
    );
  }
  return (
    <article className={`answer ${a.noData ? 'nodata' : ''}`} aria-label="AI 답변">
      <div className="kicker">{kicker}</div>
      {a.noData && <p className="muted">설명서에 아직 기록이 없어요. 짐작해서 알려드리지 않을게요. 보호자께 물어볼까요?</p>}
      {a.safety?.medicalConcern && <div className="notice danger" role="alert"><strong>의료 확인 필요 · </strong>진단·처방은 하지 않아요. 보호자나 의료진에게 확인해 주세요.</div>}
      {a.clarification?.needed && <div className="notice warn"><strong>조금 더 알려 주세요 · </strong>{a.clarification.question}</div>}

      <h3>지금 상황 (입력한 내용)</h3>
      <dl className="facts">
        <dt>활동</dt><dd>{s.activity || '확인 안 됨'}</dd>
        <dt>보인 행동</dt><dd>{s.observedBehavior?.length ? s.observedBehavior.join(', ') : '확인 안 됨'}</dd>
        {s.details?.length > 0 && <><dt>자세히</dt><dd>{s.details.join(', ')}</dd></>}
        {s.usualBehaviorMentioned && <><dt>말한 평소 모습</dt><dd>“{s.usualBehaviorMentioned}” (입력 내용, 기록 아님)</dd></>}
        <dt>시간</dt><dd>{s.timeMentioned || `입력 시점 ${fmtTime(a.input.observedAt)}`}</dd>
      </dl>

      <h3>평소와 비교 {cmpChip[cmp.status]}</h3>
      <p className="small">{cmp.summary}</p>
      <div className="compare">
        <div><strong>기록된 평소 모습</strong>
          {cmp.usualItems?.length ? cmp.usualItems.map((u: any, i: number) => <div key={i}>{u.text}<Refs ids={u.evidenceRefs} /></div>) : <div>비교할 기록 없음</div>}
        </div>
        <div><strong>지금 보인 모습</strong>
          {(s.observedBehavior?.length ? s.observedBehavior : [a.input.text]).map((b: string, i: number) => <div key={i}>{b}</div>)}
        </div>
      </div>

      <h3>이렇게 해 보세요</h3>
      <ol className="steps">
        {(a.guidance || []).map((g: any, i: number) => (
          <li key={i} className={`${g.basis === 'general_safety' ? 'safety' : ''} ${g.conflict ? 'conflict' : ''}`}>
            <span className="n" aria-hidden="true">{g.basis === 'general_safety' ? '!' : String(++n)}</span>
            <div><div>{g.text}</div><div className="refs"><BasisChip basis={g.basis} /></div><Refs ids={g.evidenceRefs} /></div>
          </li>
        ))}
      </ol>
      {conflict && (
        <div className="notice warn"><strong>기록이 서로 달라요 · </strong>어느 쪽이 맞는지 AI가 정하지 않아요. 날짜를 보고 판단하고, 필요하면 보호자에게 물어봐 주세요.
          {a.conflicts.map((c: any, i: number) => <div key={i}>{c.description}<Refs ids={c.evidenceRefs} /></div>)}
        </div>
      )}
      {a.evidence.length > 0 && <details><summary>근거 {a.evidence.length}개 원문 보기</summary><EvidenceList items={a.evidence} /></details>}
      <div className="row small muted">
        <span className="grow">{a.engine === 'local-rules' ? '규칙 기반 데모 분석 · 근거 원문을 그대로 보여 줘요' : `AI 분석 · ${a.engine}`}</span>
        <SpeakButton text={() => (a.guidance || []).map((g: any) => g.text).join(' ')} />
      </div>
    </article>
  );
}

export function FollowAnswer({ m, rid }: { m: any; rid: string }) {
  const nodata = m.basis === 'no_data';
  const kicker = nodata ? '설명서에 아직 없어요' : m.basis === 'guide_based' ? '설명서에서 찾았어요' : m.basis === 'record_based' ? '종사자 기록에서 찾았어요' : '일반 안내예요 · 개인 기록은 아니에요';
  const body = nodata ? '설명서에 아직 없어요. 짐작해서 알려드리지 않을게요.' : m.content;
  if (nodata) {
    return (
      <article className="answer nodata" aria-label="AI 답변">
        <p>설명서에 아직 없어요.<br />짐작해서 알려드리지 않을게요.</p>
        <p className="ask-lead">보호자에게 연락할까요?</p>
      </article>
    );
  }
  return (
    <article className={`answer ${nodata ? 'nodata' : ''}`} aria-label="AI 답변">
      <div className="kicker">{kicker}</div>
      <div className="body">{body}</div>
      {m.conflict && <div className="notice warn small">참고한 기록끼리 내용이 달라요. 날짜를 확인해 주세요.</div>}
      <div className="refs"><BasisChip basis={m.basis} />{(m.evidence || []).map((e: any) => <RefChip key={e.evidenceId} e={e} />)}</div>
      {(m.evidence || []).length > 0 && <details><summary>근거 원문 보기</summary><EvidenceList items={m.evidence} numbered={false} /></details>}
      {m.suggestRecord && <Link className="btn primary" href={`/ask/${rid}?mode=record&text=${encodeURIComponent(m.suggestedRecordText || '')}`}>기록으로 남기기 (확인 후 저장)</Link>}
      <div className="row"><span className="grow" /><SpeakButton text={() => body} /></div>
    </article>
  );
}

