'use client';
// ① 한 장 카드 (SCR-301 · FR-302): 처음 만나기 전에 읽는 카드. 빨강 항목 우선, 미작성·비공유 구분, 최근 확인 기록.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, CAT_ICON, CAT_TONE, fmtDate, fmtShort, plainName } from '@/components/client';
import { ErrorBox, Loading, Screen } from '@/components/ui';
import { useRecipient } from '@/components/useRecipient';

function splitLead(text: string): [string, string | null] {
  const m = String(text).match(/^(.+?[.!?。])\s+([\s\S]+)$/);
  return m ? [m[1], m[2]] : [text, null];
}

export default function CardPage() {
  const rid = decodeURIComponent(useParams<{ rid: string }>().rid);
  const { data, error, reload } = useRecipient(rid);
  const [records, setRecords] = useState<any[] | null>(null);
  useEffect(() => {
    api(`/api/v1/recipients/${encodeURIComponent(rid)}/care-records?limit=5`).then((r) => setRecords(r.items)).catch(() => setRecords([]));
  }, [rid]);

  if (error) {
    return <Screen title="한 장 카드" back="/"><ErrorBox message={error} onRetry={reload} /><Link className="btn big" href="/">대상자 다시 고르기</Link></Screen>;
  }
  if (!data) return <Screen title="한 장 카드" back="/"><Loading /></Screen>;

  const { r, guide } = data;
  const cats: any[] = guide.categories;
  const red = cats.filter((c) => c.priorityGroup === 'RED');
  const redAvail = red.filter((c) => c.status === 'available');
  const others = cats.filter((c) => c.priorityGroup !== 'RED');
  const lastConfirmed = cats.map((c) => c.source?.createdAt).filter(Boolean).sort().pop();

  // 꼭 알아야 할 3가지: 조심할 것(불안·아픔·안전) / 평소 생활(의사소통) / 좋아하는 것
  const byCode = new Map(cats.map((c) => [c.code, c]));
  const pick = (codes: string[]) => codes.map((k) => byCode.get(k)).find((c) => c?.status === 'available') || byCode.get(codes[0]);
  const three = [
    { tone: 'red', label: '조심할 것', c: pick(['ANXIETY_CHALLENGING_BEHAVIOR', 'PAIN_DISCOMFORT_SIGN', 'HEALTH_SAFETY_INFO']) },
    { tone: 'blue', label: '평소 생활', c: pick(['COMMUNICATION']) },
    { tone: 'green', label: '좋아하는 것', c: pick(['LIKES_DISLIKES']) },
  ];

  return (
    <Screen title={plainName(r.displayName)} back="/" side={<Link className="btn ghost small" href="/">대상자 변경</Link>} rid={rid} tab="card">
      <section className="profile" aria-label="대상자 정보">
        <span className="avatar big" aria-hidden="true">{plainName(r.displayName).slice(0, 1)}</span>
        <div>
          <div className="kid-name">{plainName(r.displayName)}<span className="muted small"> (가상)</span></div>
          <div className="muted">{r.basicInfo?.age ? `${r.basicInfo.age}세 · ` : ''}합성 시연 데이터</div>
          {lastConfirmed && <div className="small" style={{ color: 'var(--primary-soft-ink)', fontWeight: 700 }}>✓ 보호자 확인 · {fmtDate(lastConfirmed)}</div>}
        </div>
      </section>
      <h2 className="three-title">꼭 알아야 할 3가지</h2>
      <ul className="three">
        {three.map(({ tone, label, c }) => (
          <li key={label} className={tone}>
            <span className="tag">{label}</span>
            <span>{c?.status === 'available' ? splitLead(c.content)[0] : c?.status === 'not_shared' ? '공유되지 않은 항목이에요' : '기록 없음 · 보호자 확인 필요'}</span>
          </li>
        ))}
      </ul>
      <div className="mic-one">
        <Link href={`/ask/${rid}`} className="mic-big" aria-label="물어보거나 기록하기"><span aria-hidden="true">🎤</span></Link>
        <strong>물어보거나 기록할 때 누르기</strong>
        <span className="muted small">질문인지 기록인지 AI가 알아서 나눠요</span>
      </div>
      <p className="center muted small">방문 시간이 끝나면 일지가 자동으로 정리돼요 · <Link href={`/visit/${rid}`}>방문 끝내기</Link></p>

      <details className="full-card">
      <summary>전체 설명서 보기 (9개 항목)</summary>
      <section className="hero" aria-labelledby="card-name">
        <div className="eyebrow">처음 만나기 전에 읽어 주세요</div>
        <h1 id="card-name">{r.displayName}</h1>
        <div className="eyebrow">{r.basicInfo?.age ? `${r.basicInfo.age}세 · ` : ''}돌봄 대상자 · 합성 데이터</div>
        {lastConfirmed && <div style={{ marginTop: 10 }}><span className="confirmed">✓ 보호자 확인 · {fmtDate(lastConfirmed)}</span></div>}
      </section>
      <div className="sheet">
        <h2>꼭 알아야 할 것 <span className="count">{redAvail.length}</span></h2>
        <ol className="must">
          {red.map((c, i) => {
            if (c.status !== 'available') {
              return (
                <li key={c.code}><span className="num">{i + 1}</span>
                  <div><div className="head">{c.easyLabel}</div><div className="sub muted">{c.status === 'not_shared' ? '공유되지 않은 항목이에요' : '기록 없음 · 보호자 확인 필요'}</div></div>
                </li>
              );
            }
            const [lead, rest] = splitLead(c.content);
            return (
              <li key={c.code}><span className="num">{i + 1}</span>
                <div>
                  <div className="head">{lead}</div>
                  {rest && <div className="sub">{rest}</div>}
                  <div className="src">{c.easyLabel} · 보호자 확인 {fmtShort(c.source.createdAt)}</div>
                </div>
              </li>
            );
          })}
        </ol>

        <h2>이럴 땐 이렇게</h2>
        <div className="tiles">
          {others.map((c) => (
            <div key={c.code} className={`tile ${c.status === 'available' ? CAT_TONE[c.code] || '' : 'missing'}`}>
              <div className="ico" aria-hidden="true">{CAT_ICON[c.code] || '•'}</div>
              <div className="label">{c.easyLabel}</div>
              <div>{c.status === 'available' ? c.content : c.status === 'not_shared' ? '공유되지 않은 항목이에요' : '기록 없음 · 보호자 확인 필요'}</div>
              {c.status === 'available' && <div className="src">{c.category} · 보호자 확인 {fmtShort(c.source.createdAt)}</div>}
            </div>
          ))}
        </div>

        <h2>최근 돌봄 기록</h2>
        {!records ? <Loading /> : records.length === 0 ? <div className="card dashed muted">종사자가 확인한 기록이 아직 없어요.</div> : (
          <ul className="timeline">
            {records.map((x) => (
              <li key={x.recordId}>
                <span className="time">{fmtShort(x.createdAt)}</span>
                <div className="item"><span className="chip">{x.categoryName}</span><div>{x.content}</div><div className="src">{x.author.label} · 종사자 확인 기록</div></div>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 20 }}><Link className="btn primary big" href={`/ask/${rid}`}>다 읽었어요 · 물어보기·기록으로</Link></div>
      </div>
      </details>
    </Screen>
  );
}
