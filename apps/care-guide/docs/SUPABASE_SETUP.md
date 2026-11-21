# Supabase · pgvector 설정

현재 저장소에는 Supabase 프로젝트 정보, 키, 연동 코드가 **없었습니다**. 이 앱은 키가 없으면 로컬 PGlite로 동작하고, `DATABASE_URL`을 넣으면 같은 SQL로 Supabase Postgres를 사용합니다. 아래 절차는 실제 Supabase 연결 방법이며, **이번 작업에서는 실제 Supabase 프로젝트에 연결해 검증하지 못했습니다**(키 없음, Supabase CLI·Docker 미실행). 로컬 검증은 PGlite(Postgres 18 + pgvector)에서 했습니다.

## 1. 연결 방식 (왜 supabase-js 가 아닌가)

- 브라우저는 Supabase에 직접 접근하지 않습니다. **Next.js API 라우트(서버, Node 런타임)만** DB에 접속합니다.
- 서버는 Supabase가 제공하는 Postgres 접속 문자열(`DATABASE_URL`, 서버 전용 비밀값)로 `pg` 드라이버를 씁니다. 그래서 로컬 PGlite와 Supabase에서 **같은 SQL**(마이그레이션, `hybrid_search()` 함수)을 실행합니다.
- 모든 테이블에 RLS를 켜고 정책을 두지 않았습니다. `anon` / `authenticated` 키로 PostgREST를 거쳐 들어오는 접근은 전부 막힙니다. 검색·권한 함수의 `execute` 권한도 `anon`, `authenticated`, `public`에서 회수했습니다.
- 테이블 소유자(`postgres`)로 접속한 서버는 RLS를 우회합니다. 그래서 대상자 권한은 **앱 코드와 SQL 함수(`app_allowed_categories`, `hybrid_search`)에서** 확인합니다.

## 2. 클라우드 Supabase에 적용

1. Supabase 프로젝트를 만듭니다 (계정과 프로젝트 생성은 직접 해야 합니다).
2. 대시보드에서 **Connect → Connection string**의 Session pooler 문자열을 복사합니다.
3. `apps/care-guide/.env.local`을 만들고 값을 넣습니다. 마이그레이션에는 **Session pooler(5432)** 주소를 씁니다.
   ```
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   DATABASE_SSL=true
   ```
4. 마이그레이션과 합성 데이터를 넣고 실행합니다.
   ```powershell
   npm run db:migrate
   npm run db:seed -- --yes
   npm run dev
   ```
5. **Vercel**에는 같은 이름의 환경변수를 넣되, 서버리스 함수에서는 연결이 자주 새로 생기므로 **Transaction pooler(6543)** 주소를 권장합니다. 앱의 쿼리는 세션 설정(`search_path` 등)에 기대지 않도록 작성되어 있어 트랜잭션 풀러에서도 동작하도록 설계했습니다. 다만 실제 Supabase에서는 검증하지 못했습니다.
   `db:migrate`는 `create extension vector with schema extensions`로 pgvector를 켭니다. 대시보드 **Database → Extensions**에서 `vector`가 켜졌는지 확인할 수 있습니다.

### Supabase CLI를 쓸 경우 (대안)

`supabase/migrations/` 폴더는 Supabase CLI 형식을 따릅니다.

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

CLI로 적용한 뒤 `npm run db:migrate`를 실행해도 안전합니다. 모든 구문이 `if not exists`, `create or replace`, `on conflict do nothing` 형태입니다. 앱은 자체 기록 테이블 `_app_migrations`에 적용 이력을 남깁니다.

### 로컬 Supabase (Docker)

```powershell
npx supabase init
npx supabase start
```

`supabase start` 출력의 DB URL(보통 `postgresql://postgres:postgres@127.0.0.1:54322/postgres`)을 `DATABASE_URL`로 넣고 `DATABASE_SSL=false`로 둡니다.

## 3. 스키마 요약

| 테이블 | 역할 |
|---|---|
| `care_category` | 9개 고정 카테고리 (코드·명칭·RED/ORANGE/GREEN·순서) |
| `recipient`, `staff_member`, `recipient_access` | 대상자, 데모 종사자, 대상자별 접근 권한·허용 카테고리 |
| `care_guide_item`, `care_guide_revision` | 공식 가이드(보호자 확인)와 버전 이력. `embedding vector(1024)` |
| `care_record`, `care_record_category` | 종사자 확인 기록(`review_status = 'staff_confirmed'`만 허용)과 주·관련 항목. `embedding vector(1024)` |
| `care_record_draft` | AI 기록 후보. 공식 기록과 분리 |
| `conversation_session`, `care_situation`, `conversation_message` | 세션과 상황 분리, 질문·답변 전체 이력 |
| `situation_analysis`, `analysis_evidence` | WF-01 결과, 근거 스냅샷(출처 유형·ID·카테고리·작성일·발췌·상충 여부·점수) |
| `guide_update_request` | 공식 가이드 반영 요청. `decided_at`(승인)과 `applied_at`(반영)을 분리해 기록 |

## 4. 하이브리드 검색 `hybrid_search()`

```
hybrid_search(staff_id, recipient_id, keywords[], query_embedding vector(1024), embedding_model,
              limit=8, rrf_k=60, min_vector_score=0.3, candidates=30)
```

1. `app_allowed_categories(staff, recipient)`가 NULL이면 `ACCESS_DENIED` 예외를 냅니다. 이 경우 검색 자체를 하지 않습니다.
2. 검색 원천은 해당 대상자의 **게시된 공식 가이드**와 **종사자 확인 기록** 가운데 허용 카테고리 안의 것만입니다. 초안·다른 대상자·비공유 항목은 제외됩니다.
3. 키워드 점수: 검색어가 본문에 부분 문자열로 들어 있는 비율입니다. 한국어 조사 문제 때문에 tsvector 대신 이 방식을 썼습니다. 한 글자 검색어는 앱에서 걸러냅니다.
4. 벡터 점수: `1 - (embedding <=> query)`(코사인)입니다. **같은 `embedding_model`로 만든 벡터끼리만** 비교하고, `min_vector_score` 미만은 버립니다.
5. RRF로 결합합니다: `1/(k + 키워드 순위) + 1/(k + 벡터 순위)`.
6. 반환 값에는 출처 유형, 출처 ID, 카테고리, 작성일(`source_created_at`), 작성자 역할, 승인 상태, 각 점수가 들어갑니다. 앱은 이를 `analysis_evidence`에 스냅샷으로 저장합니다.

대상자당 데이터가 적은 MVP에서는 정확 검색(순차 스캔)으로 충분합니다. 데이터가 늘면 마이그레이션의 주석에 있는 HNSW 인덱스를 추가하고, 대상자 필터와 함께 쓸 때의 성능을 확인해야 합니다.

## 5. 임베딩 공급자 변경

`OPENAI_API_KEY`를 넣으면 OpenAI `text-embedding-3-small`(`dimensions=1024`)을 사용합니다. 기존 행은 로컬 해시 벡터로 저장되어 있으므로 다음 명령으로 다시 계산합니다.

```powershell
npm run db:reembed
```

모델이 다른 벡터는 검색에서 자동으로 제외됩니다(`embedding_model` 비교). 그래서 재계산 전에는 벡터 검색 없이 키워드 검색만 동작합니다.

## 6. 실서비스 전환 시 검토할 것

- **인증**: Supabase Auth(또는 기획의 공유 링크 + 6자리 코드)를 도입하고, `staff_id`를 `auth.uid()`와 연결합니다. 서버가 사용자 JWT로 접속하는 구조로 바꾸면 RLS 정책(`recipient_access` 기반)을 추가합니다.
- **보호자 승인 API 보호**: 현재 `/api/v1/care-guide-reviews*`에는 인증이 없습니다. 보호자 역할 확인이 필요합니다.
- **보관·삭제 정책**: 대화 이력·근거 스냅샷의 보관 기간, 익명화, 감사 로그를 정해야 합니다.
- **개인정보 처리**: OpenAI(분석·임베딩·받아쓰기)로 보내는 데이터의 동의와 위탁 근거를 검토해야 합니다. 요청에는 `store: false`를 지정했지만 공급자의 데이터 보관 정책도 확인해야 합니다. 서버 받아쓰기가 꺼져 있으면 쓰는 Chrome의 Web Speech API는 음성을 Google 서버로 보냅니다. 사전 산출물 파이프라인의 '비식별화(이름·연락처 가림)' 단계는 아직 구현하지 않았습니다.
