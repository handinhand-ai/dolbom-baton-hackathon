'use client';
// 마이 페이지: 종사자 정보, 지금 보고 있는 아이, 아이 바꾸기, 연동 상태. (시연용 간단 화면)
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { plainName } from '@/components/client';
import { ErrorBox, Loading, Screen } from '@/components/ui';
import { useRecipient } from '@/components/useRecipient';

export default function MyPage() {
  const rid = decodeURIComponent(useParams<{ rid: string }>().rid);
  const { status } = useApp();
  const { data, error, reload } = useRecipient(rid);

  if (error) return <Screen title="마이 페이지" back="/"><ErrorBox message={error} onRetry={reload} /><Link className="btn big" href="/">대상자 다시 고르기</Link></Screen>;
  if (!data) return <Screen title="마이 페이지" back="/"><Loading /></Screen>;

  return (
    <Screen title="마이 페이지" rid={rid} tab="my">
      <section className="card my-card" aria-label="내 정보">
        <div className="muted small">종사자</div>
        <div className="my-name">{status?.staff?.displayName ?? '종사자'}</div>
        <p className="muted small">로그인 없이 데모로 들어왔어요. 연습용 가상 계정이에요.</p>
      </section>
      <section className="card my-card" aria-label="지금 보는 아이">
        <div className="muted small">지금 보는 아이</div>
        <div className="my-name">{plainName(data.r.displayName)}</div>
        <Link className="btn primary" href="/">다른 아이 보기</Link>
      </section>
      {status?.guardianScreen && <Link className="btn big" href="/guardian">보호자 데모 화면 열기</Link>}
      <p className="muted small center" style={{ marginTop: 18 }}>
        {status ? `DB: ${status.database.label}` : ''}
      </p>
    </Screen>
  );
}
