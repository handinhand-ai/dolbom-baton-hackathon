# 돌봄바통 MVP (연습용)

발달장애인 긴급돌봄센터 종사자가 선택한 대상자의 **공식 돌봄 가이드**와 **종사자 확인 기록**을 근거로 현재 상황에 대한 대응 안내를 받고, 새로 알게 된 경험을 **확인한 뒤에** 기록으로 남기는 웹앱입니다.

- **기술 스택**: 사전 산출물(2026-11-18) 기준. **Next.js(React) + TypeScript · PWA · Vercel · Supabase(pgvector) · OpenAI API(분석·임베딩·받아쓰기)**
- **화면 범위**: FRD-03 관련 화면만 구현 (종사자 ①한 장 카드 ②물어보기 ③기록하기, 보호자 ⑤새 정보 승인)
- **데이터**: 모두 **합성 데이터**입니다. 이름 뒤에 `(가상)`이 붙어 있습니다.
- 의료 진단·치료·처방을 하지 않습니다.
- 문서 간 차이와 구현 가정: [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)
- Supabase·pgvector 설정: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

## 빠른 실행 (키 없이 로컬 시연)

Node.js 22 이상이 필요합니다.

```powershell
Set-Location apps/care-guide
npm install
npm run db:reset-local
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 키가 없으면 화면 위쪽 노란 띠에 **시연 모드**가 표시됩니다. 운영 빌드로 확인하려면 `npm run build` 다음 `npm start`를 실행합니다.

| 구성 | 키가 있을 때 | 키가 없을 때 (시연 모드) |
|---|---|---|
| DB | `DATABASE_URL` → Supabase Postgres + pgvector | 로컬: PGlite(WASM Postgres + pgvector)를 `.local-db/`에 저장. Vercel: 메모리 PGlite(시작할 때 합성 데이터를 넣고, 인스턴스가 바뀌면 초기화). 모두 **같은 마이그레이션 SQL·검색 함수**를 씀 |
| 분석·답변·기록 정리 | `OPENAI_API_KEY` → OpenAI Responses API + Structured Outputs (`OPENAI_MODEL`) | 규칙 기반 분석. 입력에 쓰인 표현만 뽑고, 새 문장을 만들지 않고 근거 원문을 그대로 보여 줌 |
| 임베딩 | OpenAI `text-embedding-3-small` (1024차원) | 문자 n-gram 해시 벡터. **의미 검색이 아님** |
| 받아쓰기(STT) | 브라우저에서 녹음 → `/api/v1/stt` → OpenAI 받아쓰기. **음성 파일은 저장하지 않음** | 브라우저 Web Speech API (Chrome·Edge 등). 둘 다 안 되면 버튼을 끄고 글로 입력하도록 안내 |
| 답변 듣기(TTS) | 브라우저 음성 합성 | 같음 |

## Vercel 배포

이 폴더(`apps/care-guide/`)가 Next.js 프로젝트 루트입니다.

1. 저장소 관리자가 배포 대상 브랜치와 시점을 정합니다(운영 배포는 `main` 병합 후 팀장 승인 기준).
2. Vercel에서 **New Project → 저장소 선택**을 합니다. **Root Directory**를 `apps/care-guide`로 지정합니다. Framework Preset은 Next.js로 자동 인식됩니다.
3. **Settings → Environment Variables**에 `.env.example`의 값을 넣습니다. 최소 구성은 `DATABASE_URL`(Supabase **Transaction pooler**, 6543)과 `OPENAI_API_KEY`입니다.
4. Supabase에 스키마를 먼저 적용합니다. 로컬에서 `.env.local`에 **Session pooler**(5432) 주소를 넣고 `npm run db:migrate`, `npm run db:seed -- --yes`를 실행합니다.
5. Deploy를 누릅니다. CLI를 쓴다면 `npx vercel` → `npx vercel --prod`입니다.

- `DATABASE_URL` 없이 배포하면 메모리 DB로 시연할 수는 있습니다. 다만 저장한 기록은 함수 인스턴스가 바뀌면 사라집니다.
- 인증이 없으므로 외부에 공개하는 배포에서는 `DEMO_GUARDIAN_SCREEN=false`로 보호자 데모 화면을 끄는 것을 권장합니다.
- 받아쓰기 녹음은 Vercel 함수 요청 본문 한도(4.5MB) 때문에 4MB까지만 받습니다. 짧게 나눠 말해 주세요.

## 화면

팀 디자인(UI 레퍼런스 v0.3)을 휴대폰 한 열 레이아웃으로 반영했습니다. 하단 탭은 카드 · 물어보기 · 기록입니다. 반영 기준은 [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) 4절에 있습니다.

| 경로 | 화면 | FRD-03 | 내용 |
|---|---|---|---|
| `/` | 대상자 선택 | SCR-301 · FR-301 | 접근 권한이 있는 대상자만 보이고, 이름으로 찾을 수 있음 |
| `/card/{id}` | ① 한 장 카드 | SCR-301 · FR-302 | 보호자 확인 날짜, "꼭 알아야 할 것"(빨강 4개 항목, 미작성·비공유 표시), "이럴 땐 이렇게"(나머지 5개 항목), 최근 종사자 확인 기록 |
| `/ask/{id}` | ② 물어보기 | SCR-302 · FR-303~308 | 첫 입력은 상황 분석(지금 상황 → 평소와 비교 → 이렇게 해 보세요, 근거 칩·작성일). 이후 질문은 같은 상황 맥락으로 답함. "설명서에 아직 없어요", 기록 충돌, 새 상황 분리 선택, 의료 확인 안내, 답변 듣기 |
| `/record/{id}` | ③ 기록하기 | SCR-303 · FR-309 | 누른 채로 말하기(손을 떼면 받아쓴 글 확인), 빠른 기록 4종(입력만 시작), 후보 수정, **확인 체크 후에만 저장**, 오늘 남긴 기록 |
| `/guardian` | ⑤ 새로 알게 된 것 (보호자, 데모) | AI Workflow 7.4 | 원래 기록(A)과 새 기록(B) 비교 → 원래대로 / 새로 바꾸기 / 둘 다 남겨 둘게요 / 나중에 볼게요. 승인과 반영은 서버에 따로 기록. **인증 미구현** |

## 시연 시나리오 (합성 데이터)

1. `민준 (가상)` 선택 → 한 장 카드 → "다 읽었어요"
2. 물어보기에서 "민준이가 오늘 밥을 먹으려고 하지 않고 계속 고개를 돌려." 입력 → 근거와 작성일이 붙은 단계별 안내
3. "밤에 깨면 어떻게 해요?" → **설명서에 아직 없어요 · 짐작해서 답하지 않을게요**
4. "큰 소리 나서 귀를 막고 소리를 질러요" → 새 상황 분리 선택 → **기록 충돌**(헤드폰: 11/05 진정 vs 11/12 오히려 던짐) 양쪽 표시
5. 기록하기 → [식사] → "카레를 밥과 따로 담아 주니까 다 먹었어요." → 확인 체크(+ 보호자에게 보내기) → 저장. 설명서는 그대로임
6. 대상자 화면 오른쪽 위 [보호자] → A/B 비교 → 반영
7. `서연 (가상)`: '건강 안전 정보' 비공유. `도윤 (가상)`: 데모 종사자 A에게 권한이 없어 보이지 않음

## 명령

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (`.env.local`을 자동으로 읽음) |
| `npm run build` / `npm start` | 운영 빌드 / 실행 |
| `npm run typecheck` | TypeScript 검사 |
| `npm test` | 핵심 흐름 테스트 16개. 메모리 PGlite에서 **실제 API 라우트 핸들러**를 호출하며 외부 API는 부르지 않음 |
| `npm run db:migrate` | `supabase/migrations/*.sql` 적용 (Supabase 또는 로컬) |
| `npm run db:seed` | 합성 데이터 적재. 앱 테이블을 비움. Supabase에서는 `npm run db:seed -- --yes` 필요 |
| `npm run db:reset-local` | 로컬 PGlite 초기화 + 마이그레이션 + 합성 데이터. 개발 서버를 먼저 끌 것 |
| `npm run db:reembed` | 임베딩 공급자를 바꾼 뒤 벡터 재계산 |

## 구조

```
apps/care-guide/
  supabase/migrations/20261119000000_init.sql  스키마, RLS, 권한 함수, hybrid_search()
  src/app/                 Next.js App Router
    page.tsx, card/[rid], ask/[rid], record/[rid], guardian   화면 (React 클라이언트 컴포넌트)
    api/health, api/v1/**  API 라우트 (Node 런타임)
  src/components/          화면 공통 요소, 음성 입력 훅, 답변·기록 후보 컴포넌트
  src/lib/                 서버 로직 (TypeScript)
    config, db, context, http, repo, categories, seed
    ai/openai.ts           Responses API(Structured Outputs) + 받아쓰기, 안전 프롬프트
    ai/embeddings.ts       OpenAI 임베딩 / 로컬 해시 벡터
    services/              analysis(WF-01), conversation(WF-02), records(WF-03 + 가이드 승인)
    text/                  규칙 기반 분석기 (시연용)
  public/                  manifest.webmanifest, icon.svg, sw.js (PWA)
  scripts/                 DB 마이그레이션·시드 (tsx)
  specs/                   node:test (tsx). 저장소 루트의 `node --test`와 섞이지 않도록 `*.spec.ts`로 둠
```

## API 요약

`GET /api/health` · `GET /api/v1/system/status` · `GET /api/v1/categories`
`GET /api/v1/recipients[?q=]` · `GET /api/v1/recipients/{id}` · `.../care-guide` · `.../care-records[?limit=&category=]`
`POST /api/v1/care-analyses` (201, 동기) · `GET /api/v1/care-analyses/{id}`
`POST /api/v1/conversation-sessions` · `GET .../{id}` · `POST|GET .../{id}/messages` · `POST .../{id}/close`
`POST /api/v1/care-record-drafts` · `PATCH .../{id}` · `POST .../{id}/save` · `POST .../{id}/discard`
`POST /api/v1/stt` (본문: `audio/*`, 응답 `{ text }`, 음성은 저장하지 않음)
`GET /api/v1/care-guide-reviews` · `POST .../{id}/decision` · `POST .../{id}/apply` (데모, `DEMO_GUARDIAN_SCREEN=false`로 끔)

오류 형식은 API 명세의 `{ "error": { code, message, details, requestId } }`를 따릅니다. 권한 없는 대상자는 존재 여부를 드러내지 않도록 404로 응답합니다. 허용되지 않은 메서드에는 Next.js가 405로 응답합니다.
