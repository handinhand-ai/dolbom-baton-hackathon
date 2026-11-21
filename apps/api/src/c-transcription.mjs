const fileTypes = new Map([
  ['audio/webm', 'webm'], ['audio/mp4', 'mp4'], ['audio/ogg', 'ogg'], ['audio/wav', 'wav'],
]);
const limit = 8 * 1024 * 1024;

export function createTranscriber({ apiKey, model = 'gpt-transcribe', fetcher = fetch } = {}) {
  return async (request) => {
    const origin = request.headers.origin;
    if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && origin !== `http://${request.headers.host}`)) {
      return { status: 403, body: { error: '돌봄바통 화면에서 음성 변환을 이용해 주세요.' } };
    }
    if (!apiKey) return { status: 503, body: { error: '서버에 OpenAI 키가 설정되면 음성을 변환할 수 있어요.' } };
    const type = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
    const ext = fileTypes.get(type);
    if (!ext) return { status: 415, body: { error: '이 녹음 형식은 지원하지 않아요.' } };
    if (Number(request.headers['content-length']) > limit) {
      return { status: 413, body: { error: '녹음 파일이 너무 커요.' } };
    }

    const chunks = [];
    let bytes = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      bytes += chunk.length;
      if (bytes > limit) {
        request.resume();
        return { status: 413, body: { error: '녹음 파일이 너무 커요.' } };
      }
      chunks.push(chunk);
    }
    if (!bytes) return { status: 400, body: { error: '녹음된 음성이 없어요.' } };
    const body = new FormData();
    body.set('file', new Blob(chunks, { type }), `recording.${ext}`);
    body.set('model', model);
    const response = await fetcher('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      if (response.status === 400 && failure?.error?.param === 'file') {
        return { status: 422, body: { error: '녹음 파일을 읽을 수 없어요. 한 문장 이상 녹음한 뒤 다시 시도해 주세요.' } };
      }
      if (response.status === 401 || response.status === 403) {
        return { status: 503, body: { error: 'OpenAI 키 또는 프로젝트의 음성 변환 권한을 확인해 주세요.' } };
      }
      if (response.status === 429) {
        return { status: 429, body: { error: '음성 변환 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.' } };
      }
      return { status: 502, body: { error: '음성을 글로 바꾸지 못했어요. 다시 녹음하거나 글로 입력해 주세요.' } };
    }
    const result = await response.json();
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    if (!text) return { status: 422, body: { error: '인식된 말이 없어요. 다시 녹음해 주세요.' } };
    return { status: 200, body: { text } };
  };
}
