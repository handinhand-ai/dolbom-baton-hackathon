const formats = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function createVoiceCapture({ button, status, transcribe, onTranscript }) {
  let active;
  const icon = button.querySelector('use');

  function showState(state, message) {
    button.dataset.state = state;
    button.disabled = state === 'starting' || state === 'processing';
    button.setAttribute('aria-label', state === 'recording' ? '녹음 끝내기' : '녹음 시작');
    icon.setAttribute('href', state === 'recording' ? '#icon-stop' : '#icon-mic');
    status.textContent = message;
  }

  function stopTracks(session) {
    session.stream?.getTracks().forEach((track) => track.stop());
    clearTimeout(session.timer);
  }

  function cancel() {
    const session = active;
    if (!session) return;
    active = undefined;
    session.controller.abort();
    if (session.recorder?.state === 'recording') session.recorder.stop();
    stopTracks(session);
    showState('idle', '버튼을 누르면 녹음이 시작돼요');
  }

  async function finish(session) {
    stopTracks(session);
    if (session !== active) return;
    showState('processing', '음성을 글로 바꾸는 중이에요');
    try {
      const audio = new Blob(session.chunks, { type: session.recorder.mimeType || session.chunks[0]?.type });
      if (!audio.size) throw new Error('녹음된 음성이 없어요. 다시 녹음해 주세요.');
      const text = await transcribe(audio, session.controller.signal);
      if (session !== active) return;
      active = undefined;
      showState('idle', '버튼을 누르면 녹음이 시작돼요');
      onTranscript({ audio, text, seconds: session.duration });
    } catch (error) {
      if (active !== session) return;
      active = undefined;
      showState('idle', error.message);
    }
  }

  function endRecording(session) {
    if (session.recorder?.state !== 'recording') return;
    session.duration = Math.max(1, Math.round((performance.now() - session.startedAt) / 1000));
    showState('processing', '녹음을 마치는 중이에요');
    session.recorder.stop();
  }

  button.addEventListener('click', async () => {
    if (active?.recorder?.state === 'recording') {
      endRecording(active);
      return;
    }
    if (active) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showState('idle', '이 브라우저에서 마이크를 사용할 수 없어요. 글로 질문해 주세요.');
      return;
    }
    const session = { controller: new AbortController(), chunks: [] };
    active = session;
    showState('starting', '마이크를 준비하고 있어요');
    try {
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== active) {
        stopTracks(session);
        return;
      }
      const mimeType = formats.find((format) => MediaRecorder.isTypeSupported(format));
      session.recorder = mimeType
        ? new MediaRecorder(session.stream, { mimeType })
        : new MediaRecorder(session.stream);
      session.recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) session.chunks.push(event.data);
      });
      session.recorder.addEventListener('stop', () => { void finish(session); }, { once: true });
      session.recorder.addEventListener('error', () => {
        if (session !== active) return;
        cancel();
        showState('idle', '녹음에 문제가 생겼어요. 다시 녹음해 주세요.');
      }, { once: true });
      session.recorder.start();
      session.startedAt = performance.now();
      session.timer = setTimeout(() => endRecording(session), 60000);
      showState('recording', '듣고 있어요 · 버튼을 다시 누르면 끝나요');
    } catch (error) {
      if (session !== active) return;
      cancel();
      showState('idle', ['NotAllowedError', 'NotFoundError'].includes(error.name)
        ? '마이크를 사용할 수 없어요. 브라우저 권한을 확인하거나 글로 질문해 주세요.'
        : '마이크를 시작하지 못했어요. 다시 시도해 주세요.');
    }
  });

  return { cancel };
}
