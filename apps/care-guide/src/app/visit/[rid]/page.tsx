'use client';
// 돌봄 일지 한눈에 보기 (방문 끝): 오늘 종사자가 확인해 저장한 기록에서 수면·식사·복약 칸을 채워 보여 준다.
// 별도 일지 데이터는 만들지 않는다. 글에서 찾지 못한 칸은 '기록 필요'로 두고 짐작해서 채우지 않는다.
// "새롭게 알게 된 것"은 오늘 설명서 반영을 요청한 기록이다. 보호자가 승인해야 설명서에 들어간다.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, fmtTime, isToday, plainName } from '@/components/client';
import { ErrorBox, Icon, Loading, Screen } from '@/components/ui';
import { useRecipient } from '@/components/useRecipient';
import { buildDailyLog, type LogGroup } from '@/lib/daily-log';

const GROUP_ICON: Record<LogGroup['id'], 'moon' | 'bowl' | 'pill'> = { sleep: 'moon', meal: 'bowl', medicine: 'pill' };

export default function VisitEndPage() {
  const rid = decodeURIComponent(useParams<{ rid: string }>().rid);
  const router = useRouter();
  const { data, error, reload } = useRecipient(rid);
  const [records, setRecords] = useState<any[] | null>(null);
  const [asks, setAsks] = useState<any[]>([]);
  const [fresh, setFresh] = useState<any[] | null>(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const noteKey = `handoffNote:${rid}:${new Date().toDateString()}`;

  useEffect(() => {
    api(`/api/v1/recipients/${encodeURIComponent(rid)}/care-records?limit=50`).then((r) => setRecords(r.items)).catch(() => setRecords([]));
    api(`/api/v1/guardian-questions?recipientId=${encodeURIComponent(rid)}`).then((r) => setAsks(r.items)).catch(() => setAsks([]));
    // 보호자 데모 화면이 꺼져 있으면 이 목록은 가져오지 못한다 (그 구역은 숨긴다)
    api(`/api/v1/care-guide-reviews?recipientId=${encodeURIComponent(rid)}`).then((r) => setFresh(r.items.filter((x: any) => isToday(x.createdAt)))).catch(() => setFresh(null));
  }, [rid]);
  useEffect(() => { try { setNote(localStorage.getItem(noteKey) ?? ''); } catch { /* 저장소 없음 */ } }, [noteKey]);

  if (error) return <Screen title="" back="/"><ErrorBox message={error} onRetry={reload} /><Link className="btn big" href="/">대상자 다시 고르기</Link></Screen>;
  if (!data || !records) return <Screen title="" back={`/home/${rid}`}><Loading /></Screen>;

  const name = plainName(data.r.displayName);
  const today = records.filter((x) => isToday(x.observedAt ?? x.createdAt)).sort((a, b) => (a.observedAt ?? a.createdAt).localeCompare(b.observedAt ?? b.createdAt));
  const log = buildDailyLog(records.map((x) => ({ category: x.category, content: x.content, observedAt: x.observedAt ?? x.createdAt })));
  const todayAsks = asks.filter((x) => isToday(x.askedAt));
  const missingTotal = log.groups.reduce((n, g) => n + g.missing, 0);
  const dateLabel = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

  function saveNote(value: string) {
    setNote(value);
    try { value ? localStorage.setItem(noteKey, value) : localStorage.removeItem(noteKey); } catch { /* 저장소 없음 */ }
  }

  return (
    <Screen title="" back={`/home/${rid}`} mainClass="log-main">
      <span className="log-chip">{name} · 합성 시연</span>
      <div className="log-title-row">
        <h1 className="log-title">{dateLabel} 오늘 하루</h1>
        <span className="log-filled"><Icon name="sparkle" size={14} />기록으로 채움</span>
      </div>

      {log.groups.map((g) => (
        <section key={g.id} className="log-card" aria-label={g.title}>
          <header>
            <span className="log-ico"><Icon name={GROUP_ICON[g.id]} size={20} /></span>
            <h2>{g.title}</h2>
            {g.missing > 0
              ? <span className="log-badge">{g.missing}개 기록 필요</span>
              : <span className="log-done" aria-label="모두 기록됨"><Icon name="check" size={14} /></span>}
          </header>
          <div className={`log-cells cols-${g.cells.length}`}>
            {g.cells.map((c) => (
              <div key={c.key} className={`log-cell ${c.state}`}>
                <span className="lbl">{c.label}</span>
                <strong>{c.value}</strong>
              </div>
            ))}
          </div>
        </section>
      ))}

      {missingTotal > 0 && <p className="log-hint">비어 있는 칸은 <Link href={`/ask/${encodeURIComponent(rid)}?mode=record`}>기록 남기기</Link>로 채울 수 있어요. 짐작해서 채우지 않아요.</p>}

      <div className="log-other">
        <span>씻기·화장실·기분·몸 상태 : {log.other > 0 ? `오늘 기록 ${log.other}건` : '오늘 기록 없음'}</span>
        <button type="button" className="linklike" aria-expanded={open} onClick={() => setOpen(!open)}>자세히</button>
      </div>
      {open && (
        <section className="log-detail" aria-label="오늘 기록 전체">
          {today.length === 0 ? <p className="muted small">오늘 확인해 저장한 기록이 아직 없어요.</p> : (
            <ul className="log-list">
              {today.map((x) => <li key={x.recordId}>{x.content}<span className="src"> · {x.categoryName} {fmtTime(x.observedAt ?? x.createdAt)}</span></li>)}
            </ul>
          )}
        </section>
      )}

      <label className="handoff">
        <span>다음 근무자에게</span>
        <input type="text" maxLength={80} placeholder="한 줄 남기기" autoComplete="off" value={note} onChange={(e) => saveNote(e.target.value)} />
      </label>
      {note && <p className="log-hint">이 기기에만 저장돼요. 서버로 보내지 않아요.</p>}

      {fresh && fresh.length > 0 && (
        <section className="learned" aria-label="새롭게 알게 된 것">
          <strong>✦ 새롭게 알게 된 것 {fresh.length}개</strong>
          <p className="small">보호자께 확인받고 설명서에 넣을게요. 보호자가 넣기로 해야 설명서가 바뀌어요.</p>
          <ul>{fresh.map((x) => <li key={x.requestId}>{x.proposedContent}</li>)}</ul>
        </section>
      )}
      {todayAsks.length > 0 && (
        <section className="learned" aria-label="보호자께 물어본 것">
          <strong>보호자께 물어본 것 {todayAsks.length}개</strong>
          <ul>{todayAsks.map((x) => <li key={x.questionId}>{x.question} — {x.status === 'answered' ? `답: ${x.answer}` : '답을 기다리는 중'}</li>)}</ul>
        </section>
      )}

      <button className="primary big submit-log" onClick={() => { try { sessionStorage.setItem('visitDone', '1'); } catch { /* 저장소 없음 */ } router.push('/'); }}>이 일지로 제출하기</button>
    </Screen>
  );
}
