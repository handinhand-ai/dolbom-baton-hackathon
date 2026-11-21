'use client';
// 기록하기는 물어보기와 하나로 합쳐졌다. 예전 주소는 통합 화면의 기록 모드로 보낸다.
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Loading } from '@/components/ui';

function Redirect() {
  const rid = decodeURIComponent(useParams<{ rid: string }>().rid);
  const text = useSearchParams().get('text');
  const router = useRouter();
  useEffect(() => { router.replace(`/ask/${encodeURIComponent(rid)}?mode=record${text ? `&text=${encodeURIComponent(text)}` : ''}`); }, [rid, text, router]);
  return <Loading text="물어보기·기록 화면으로 이동해요" />;
}

export default function RecordPage() {
  return <Suspense fallback={<Loading />}><Redirect /></Suspense>;
}
