import type { Metadata, Viewport } from 'next';
import { AppProvider } from '@/components/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: '돌봄바통',
  description: '돌봄바통 — 종사자용 한 장 카드·물어보기·기록하기 (연습용 MVP, 합성 데이터)',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: '돌봄바통', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#3F63F3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>
        <a className="skip" href="#main">본문으로 건너뛰기</a>
        <div className="app">
          <AppProvider>{children}</AppProvider>
          <p className="foot">합성 데이터로 만든 연습용 MVP입니다. 실제 인물 정보가 아닙니다. 돌봄바통은 의료 진단·치료·처방을 하지 않습니다.</p>
        </div>
      </body>
    </html>
  );
}
