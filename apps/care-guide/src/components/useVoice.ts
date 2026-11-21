'use client';
// 음성 입력.
// 1) 서버 받아쓰기(OpenAI)가 켜져 있으면: 브라우저에서 녹음(MediaRecorder) → /api/v1/stt → 받아쓴 글 (음성은 저장하지 않음)
// 2) 아니면 브라우저 Web Speech API (Chrome·Edge 등)
// 3) 둘 다 안 되면 비활성화하고 글로 입력하도록 안내한다.
// 받아쓴 글은 항상 입력창에 넣기만 하고, 사용자가 확인한 뒤 보낸다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './AppProvider';

type Handlers = { onText: (text: string) => void; onError: (message: string) => void };

export function useVoice({ onText, onError }: Handlers) {
  const { status } = useApp();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [env, setEnv] = useState({ media: false, speech: false });
  const recRef = useRef<any>(null);
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };

  useEffect(() => {
    setEnv({
      media: typeof window !== 'undefined' && 'MediaRecorder' in window && Boolean(navigator.mediaDevices?.getUserMedia),
      speech: typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    });
  }, []);

  const mode: 'server' | 'browser' | 'none' = status?.stt.mode === 'openai' && env.media ? 'server' : env.speech ? 'browser' : 'none';

  const start = useCallback(async () => {
    if (recRef.current || busy) return;
    if (mode === 'server') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          recRef.current = null;
          setRecording(false);
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          if (blob.size === 0) { handlers.current.onError('녹음된 소리가 없어요. 다시 말해 주세요.'); return; }
          setBusy(true);
          try {
            const res = await fetch('/api/v1/stt', { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm' }, body: blob });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error?.message || '받아쓰기에 실패했어요.');
            handlers.current.onText(data.text);
          } catch (e: any) {
            handlers.current.onError(`${e.message} 글로 써 주셔도 돼요.`);
          } finally {
            setBusy(false);
          }
        };
        recRef.current = mr;
        mr.start();
        setRecording(true);
      } catch {
        handlers.current.onError('마이크를 쓸 수 없어요. 권한을 확인하거나 글로 써 주세요.');
      }
      return;
    }
    if (mode === 'browser') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SR();
      let finalText = '';
      rec.lang = 'ko-KR';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (ev: any) => { finalText = Array.from(ev.results).map((r: any) => r[0].transcript).join(' ').trim(); };
      rec.onerror = (ev: any) => handlers.current.onError(ev.error === 'not-allowed' ? '마이크 권한이 없어요. 글로 써 주세요.' : '말을 알아듣지 못했어요. 다시 말하거나 글로 써 주세요.');
      rec.onend = () => { recRef.current = null; setRecording(false); if (finalText) handlers.current.onText(finalText); };
      try { rec.start(); recRef.current = rec; setRecording(true); } catch { handlers.current.onError('음성 입력을 시작하지 못했어요. 글로 써 주세요.'); }
    }
  }, [mode, busy]);

  const stop = useCallback(() => { recRef.current?.stop(); }, []);

  return { mode, supported: mode !== 'none', recording, busy, start, stop };
}
