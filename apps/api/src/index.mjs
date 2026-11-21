import { createApp } from './server.mjs';
import { createQuestionnaireReader } from './c-questionnaire-source.mjs';
import { createTranscriber } from './c-transcription.mjs';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`${file} 환경 설정을 읽지 못했습니다.`);
      process.exit(1);
    }
  }
}

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

const recordDemo = (process.env.C_RECORDS_DEMO ?? (process.argv.includes('--c-demo') ? '1' : '0')) === '1';
const recordStorage = process.env.C_RECORDS_STORAGE ?? 'memory';
let database;
if (!['memory', 'postgres'].includes(recordStorage) || (recordStorage === 'postgres' && !recordDemo)) {
  console.error('C_RECORDS_STORAGE: memory 또는 C_RECORDS_DEMO=1에서 postgres를 사용해 주세요.');
  process.exit(1);
}
if (recordStorage === 'postgres') {
  try {
    const { openPostgresRecordStore } = await import('./c-record-postgres.mjs');
    database = await openPostgresRecordStore(process.env.DATABASE_URL);
  } catch (error) {
    const code = typeof error.code === 'string' ? error.code : undefined;
    console.error(
      'C 기록 저장소 연결 실패. DATABASE_URL, TLS, public.care_records 테이블을 확인해 주세요.',
      code ?? '',
    );
    process.exit(1);
  }
}

const readQuestionnaire = createQuestionnaireReader({
  url: process.env.SUPABASE_URL?.trim(),
  key: (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY)?.trim(),
});
const transcribeAudio = createTranscriber({
  apiKey: process.env.OPENAI_API_KEY?.trim(),
  model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || undefined,
});
const server = createApp({
  recordDemo,
  recordStore: database?.store,
  readQuestionnaire,
  secondSurveyRecipient: process.env.C_QUESTIONNAIRE_RECIPIENT_GUARDIAN_2,
  transcribeAudio,
});
server.once('close', () => { void database?.close(); });
server.on('error', (error) => {
  console.error(`Server failed to start: ${error.message}`);
  process.exitCode = 1;
  void database?.close();
});
server.listen(port, '127.0.0.1', () => {
  console.log(recordDemo
    ? `돌봄바통 시연 http://127.0.0.1:${port} · 저장소 ${recordStorage}`
    : `Local skeleton available at http://127.0.0.1:${port}`);
});
