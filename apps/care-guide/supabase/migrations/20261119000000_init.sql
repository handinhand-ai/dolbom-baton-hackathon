-- 돌봄 바통 MVP 초기 스키마 (Supabase Postgres + pgvector)
-- 이 파일은 Supabase CLI(`supabase db push`)와 앱 자체 마이그레이션 스크립트(`npm run db:migrate`)
-- 양쪽에서 그대로 실행할 수 있도록 Supabase 전용 스키마(auth 등)에 의존하지 않는다.
-- 모든 데이터는 합성 데이터만 사용한다.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 고정 카테고리 (9개, 명칭·순서 변경 금지)
-- ---------------------------------------------------------------------------
create table if not exists care_category (
  code            text primary key,
  name            text not null unique,
  easy_label      text,
  priority_group  text not null check (priority_group in ('RED','ORANGE','GREEN')),
  display_order   int  not null unique check (display_order between 1 and 9),
  is_active       boolean not null default true
);

insert into care_category (code, name, easy_label, priority_group, display_order) values
  ('COMMUNICATION',                '의사소통',               '말과 표현',        'RED',    1),
  ('ANXIETY_CHALLENGING_BEHAVIOR', '불안·도전행동',          '힘들어할 때',      'RED',    2),
  ('PAIN_DISCOMFORT_SIGN',         '아픔·불편 신호',         '아프거나 불편할 때','RED',    3),
  ('HEALTH_SAFETY_INFO',           '건강 안전 정보',         '건강·안전',        'RED',    4),
  ('MEAL',                         '식사',                   '밥 먹기',          'ORANGE', 5),
  ('HYGIENE_TOILETING_DRESSING',   '위생·화장실·옷 입기',    '씻기·화장실·옷',   'ORANGE', 6),
  ('DAILY_ROUTINE_SLEEP',          '하루 일과·수면',         '하루 순서·잠',     'ORANGE', 7),
  ('LIKES_DISLIKES',               '좋아하는 것·싫어하는 것','좋아하고 싫어하는 것','GREEN', 8),
  ('OWN_WISH',                     '본인의 의사',            '스스로 정하고 싶은 것','GREEN', 9)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 대상자와 접근 권한
-- MVP는 실제 인증 없이 서버 환경변수로 지정한 데모 종사자(staff_id)를 사용한다.
-- 실서비스 전환 시 staff_id 를 Supabase Auth 사용자 ID(auth.uid())와 연결한다.
-- ---------------------------------------------------------------------------
create table if not exists recipient (
  recipient_id  text primary key,
  display_name  text not null,
  basic_info    jsonb,
  status        text not null default 'active' check (status in ('active','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists staff_member (
  staff_id      text primary key,
  display_name  text not null,
  role          text not null default 'caregiver' check (role in ('caregiver','guardian')),
  created_at    timestamptz not null default now()
);

-- 대상자별 접근 권한과 허용 카테고리(공유 범위). 기획서의 "공유 링크 + 선택 카테고리"를 대신한다.
create table if not exists recipient_access (
  access_id           text primary key default ('acc_' || replace(gen_random_uuid()::text, '-', '')),
  staff_id            text not null references staff_member(staff_id),
  recipient_id        text not null references recipient(recipient_id),
  allowed_categories  text[] not null,
  status              text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  unique (staff_id, recipient_id)
);

-- ---------------------------------------------------------------------------
-- 공식 돌봄 가이드 (보호자 확인 정보). 종사자 기록 저장으로는 절대 변경하지 않는다.
-- ---------------------------------------------------------------------------
create table if not exists care_guide_item (
  guide_item_id        text primary key default ('gi_' || replace(gen_random_uuid()::text, '-', '')),
  recipient_id         text not null references recipient(recipient_id),
  category_code        text not null references care_category(code),
  content              text,
  status               text not null default 'missing' check (status in ('missing','published','archived')),
  current_revision_no  int  not null default 0,
  confirmed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  embedding            extensions.vector(1024),
  embedding_model      text,
  unique (recipient_id, category_code)
);

create table if not exists care_guide_revision (
  revision_id    text primary key default ('gr_' || replace(gen_random_uuid()::text, '-', '')),
  guide_item_id  text not null references care_guide_item(guide_item_id),
  revision_no    int  not null,
  content        text not null,
  status         text not null check (status in ('published','superseded')),
  change_reason  text,
  request_id     text,
  effective_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (guide_item_id, revision_no)
);

-- ---------------------------------------------------------------------------
-- 대화 세션과 돌봄 상황(서로 다른 엔터티)
-- ---------------------------------------------------------------------------
create table if not exists conversation_session (
  session_id           text primary key default ('cs_' || replace(gen_random_uuid()::text, '-', '')),
  recipient_id         text not null references recipient(recipient_id),
  staff_id             text not null references staff_member(staff_id),
  status               text not null default 'active' check (status in ('active','closed','expired')),
  active_situation_id  text,
  created_at           timestamptz not null default now(),
  last_activity_at     timestamptz not null default now(),
  expires_at           timestamptz,
  closed_at            timestamptz
);

create table if not exists care_situation (
  situation_id  text primary key default ('sit_' || replace(gen_random_uuid()::text, '-', '')),
  session_id    text references conversation_session(session_id),
  recipient_id  text not null references recipient(recipient_id),
  input_text    text not null,
  activity      text,
  status        text not null default 'open' check (status in ('open','closed')),
  created_at    timestamptz not null default now()
);

-- WF-01 분석 결과. 원본 입력(input_text)과 AI 결과를 분리해 보존한다.
create table if not exists situation_analysis (
  analysis_id       text primary key default ('an_' || replace(gen_random_uuid()::text, '-', '')),
  recipient_id      text not null references recipient(recipient_id),
  situation_id      text references care_situation(situation_id),
  staff_id          text not null references staff_member(staff_id),
  input_text        text not null,
  input_type        text not null check (input_type in ('text','voice_transcribed')),
  observed_at       timestamptz,
  status            text not null default 'processing'
                    check (status in ('queued','processing','completed','needs_confirmation','failed')),
  structured_input  jsonb,
  comparison        jsonb,
  guidance          jsonb,
  safety            jsonb,
  clarification     jsonb,
  no_data_flag      boolean not null default false,
  conflict_flag     boolean not null default false,
  engine            text,
  error_code        text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create table if not exists conversation_message (
  message_id     text primary key default ('msg_' || replace(gen_random_uuid()::text, '-', '')),
  session_id     text not null references conversation_session(session_id),
  situation_id   text references care_situation(situation_id),
  sequence_no    int  not null,
  speaker        text not null check (speaker in ('caregiver','assistant','system')),
  message_text   text not null,
  input_type     text check (input_type in ('text','voice_transcribed')),
  answer_status  text check (answer_status in ('answered','needs_confirmation','no_data','failed')),
  basis          text,
  no_data_flag   boolean not null default false,
  conflict_flag  boolean not null default false,
  engine         text,
  created_at     timestamptz not null default now(),
  unique (session_id, sequence_no)
);

-- ---------------------------------------------------------------------------
-- 종사자 확인 경험 기록. 영속 기록은 staff_confirmed 만 허용한다.
-- AI 초안은 care_record_draft 에만 존재하며 공식 기록으로 취급하지 않는다.
-- ---------------------------------------------------------------------------
create table if not exists care_record (
  record_id        text primary key default ('cr_' || replace(gen_random_uuid()::text, '-', '')),
  recipient_id     text not null references recipient(recipient_id),
  situation_id     text references care_situation(situation_id),
  observed_at      timestamptz not null,
  source_text      text not null,
  normalized_text  text not null,
  observation      jsonb not null default '[]'::jsonb,
  response_taken   jsonb not null default '[]'::jsonb,
  outcome          text,
  context          jsonb,
  input_type       text not null default 'text' check (input_type in ('text','voice_transcribed','quick_button')),
  author_staff_id  text not null references staff_member(staff_id),
  author_label     text not null,
  review_status    text not null default 'staff_confirmed' check (review_status = 'staff_confirmed'),
  ai_assisted      boolean not null default true,
  confirmed_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  embedding        extensions.vector(1024),
  embedding_model  text
);

create table if not exists care_record_category (
  record_id      text not null references care_record(record_id) on delete cascade,
  category_code  text not null references care_category(code),
  is_primary     boolean not null default false,
  assigned_by    text not null default 'ai_suggested_staff_confirmed'
                 check (assigned_by in ('ai_suggested_staff_confirmed','staff')),
  created_at     timestamptz not null default now(),
  primary key (record_id, category_code)
);
create unique index if not exists care_record_one_primary
  on care_record_category (record_id) where is_primary;

create table if not exists care_record_draft (
  draft_id         text primary key default ('draft_' || replace(gen_random_uuid()::text, '-', '')),
  recipient_id     text not null references recipient(recipient_id),
  staff_id         text not null references staff_member(staff_id),
  situation_id     text references care_situation(situation_id),
  raw_text         text not null,
  input_type       text not null default 'text' check (input_type in ('text','voice_transcribed','quick_button')),
  activity_hint    text,
  observed_at      timestamptz not null default now(),
  proposal         jsonb not null,
  edited           jsonb,
  reviewed         boolean not null default false,
  status           text not null default 'needs_review' check (status in ('needs_review','reviewed','saved','discarded')),
  saved_record_id  text references care_record(record_id),
  engine           text,
  version          int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 공식 가이드 반영 요청 (종사자 기록과 별도 승인 흐름)
-- 승인(decided_at)과 실제 반영(applied_at)을 분리해 기록한다.
-- ---------------------------------------------------------------------------
create table if not exists guide_update_request (
  request_id        text primary key default ('gur_' || replace(gen_random_uuid()::text, '-', '')),
  record_id         text not null references care_record(record_id),
  recipient_id      text not null references recipient(recipient_id),
  category_code     text not null references care_category(code),
  proposed_content  text not null,
  status            text not null default 'proposed'
                    check (status in ('proposed','on_hold','approved','rejected','applied')),
  decision_note     text,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  applied_at        timestamptz,
  apply_error       text
);

-- 분석·대화 답변의 근거. 출처 ID와 작성일을 스냅샷으로 보존한다.
create table if not exists analysis_evidence (
  evidence_id        text primary key default ('ev_' || replace(gen_random_uuid()::text, '-', '')),
  analysis_id        text references situation_analysis(analysis_id),
  message_id         text references conversation_message(message_id),
  source_type        text not null check (source_type in ('official_care_guide','care_record')),
  source_id          text not null,
  category_code      text references care_category(code),
  excerpt            text not null,
  source_created_at  timestamptz,
  author_role        text,
  approval_status    text,
  stance             text not null default 'supports' check (stance in ('supports','contradicts','context')),
  keyword_score      double precision,
  vector_score       double precision,
  rrf_score          double precision,
  created_at         timestamptz not null default now(),
  check (analysis_id is not null or message_id is not null)
);

create index if not exists care_record_recipient_idx on care_record (recipient_id, confirmed_at desc);
create index if not exists care_guide_item_recipient_idx on care_guide_item (recipient_id);
create index if not exists analysis_evidence_analysis_idx on analysis_evidence (analysis_id);
create index if not exists analysis_evidence_message_idx on analysis_evidence (message_id);
create index if not exists conversation_message_session_idx on conversation_message (session_id, sequence_no);

-- 대상자당 데이터가 적은 MVP에서는 정확 검색(순차 스캔)으로 충분하다.
-- 데이터가 늘면 아래 HNSW 인덱스를 추가한다(대상자 필터가 먼저 적용된다는 점에 유의).
-- create index on care_record using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- 접근 권한 함수: 활성 권한이 없으면 NULL
-- ---------------------------------------------------------------------------
create or replace function app_allowed_categories(p_staff_id text, p_recipient_id text)
returns text[]
language sql stable
set search_path = public, extensions
as $$
  select a.allowed_categories
  from recipient_access a
  join recipient r on r.recipient_id = a.recipient_id and r.status = 'active'
  where a.staff_id = p_staff_id
    and a.recipient_id = p_recipient_id
    and a.status = 'active'
    and (a.expires_at is null or a.expires_at > now())
$$;

-- ---------------------------------------------------------------------------
-- 하이브리드 검색: 키워드 일치 + pgvector 코사인 유사도를 RRF로 결합.
-- 반드시 (종사자, 대상자) 접근 권한과 허용 카테고리 범위 안에서만 검색한다.
-- 공식 가이드와 종사자 확인 기록을 출처 유형으로 구분해 반환한다.
-- ---------------------------------------------------------------------------
create or replace function hybrid_search(
  p_staff_id           text,
  p_recipient_id       text,
  p_keywords           text[],
  p_query_embedding    extensions.vector(1024),
  p_embedding_model    text,
  p_limit              int default 8,
  p_rrf_k              int default 60,
  p_min_vector_score   double precision default 0.3,
  p_candidates         int default 30
)
returns table (
  source_type        text,
  source_id          text,
  category_code      text,
  related_categories text[],
  content            text,
  source_created_at  timestamptz,
  author_role        text,
  author_label       text,
  approval_status    text,
  keyword_score      double precision,
  vector_score       double precision,
  keyword_rank       int,
  vector_rank        int,
  rrf_score          double precision
)
language plpgsql stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_allowed text[];
  v_kw text[];
begin
  v_allowed := app_allowed_categories(p_staff_id, p_recipient_id);
  if v_allowed is null then
    raise exception 'ACCESS_DENIED' using errcode = '42501';
  end if;
  v_kw := coalesce(array(select distinct k from unnest(coalesce(p_keywords, '{}'::text[])) k where length(trim(k)) >= 1), '{}'::text[]);

  return query
  with docs as (
    select 'official_care_guide'::text as d_type,
           g.guide_item_id as d_id,
           g.category_code as d_cat,
           '{}'::text[] as d_rel,
           g.content as d_content,
           coalesce(g.confirmed_at, g.updated_at) as d_ts,
           'guardian'::text as d_role,
           '보호자 작성 공식 가이드'::text as d_label,
           'guardian_confirmed'::text as d_approval,
           g.embedding as d_emb,
           g.embedding_model as d_model
    from care_guide_item g
    where g.recipient_id = p_recipient_id
      and g.status = 'published'
      and g.content is not null
      and g.category_code = any (v_allowed)
    union all
    select 'care_record'::text,
           r.record_id,
           pc.category_code,
           coalesce((select array_agg(x.category_code order by x.category_code)
                     from care_record_category x
                     where x.record_id = r.record_id and not x.is_primary), '{}'::text[]),
           r.normalized_text,
           r.confirmed_at,
           'caregiver'::text,
           r.author_label,
           r.review_status,
           r.embedding,
           r.embedding_model
    from care_record r
    join care_record_category pc on pc.record_id = r.record_id and pc.is_primary
    where r.recipient_id = p_recipient_id
      and r.review_status = 'staff_confirmed'
      and pc.category_code = any (v_allowed)
  ),
  kw as (
    select d.d_type, d.d_id,
           (select count(*) from unnest(v_kw) k where position(k in d.d_content) > 0)::double precision
             / greatest(cardinality(v_kw), 1) as s
    from docs d
  ),
  kw_ranked as (
    select kw.d_type, kw.d_id, kw.s,
           row_number() over (order by kw.s desc, kw.d_id)::int as rk
    from kw
    where kw.s > 0
    order by kw.s desc
    limit p_candidates
  ),
  vec as (
    select d.d_type, d.d_id, (1 - (d.d_emb <=> p_query_embedding))::double precision as s
    from docs d
    where p_query_embedding is not null
      and d.d_emb is not null
      and d.d_model = p_embedding_model
  ),
  vec_ranked as (
    select vec.d_type, vec.d_id, vec.s,
           row_number() over (order by vec.s desc, vec.d_id)::int as rk
    from vec
    where vec.s >= p_min_vector_score
    order by vec.s desc
    limit p_candidates
  )
  select d.d_type, d.d_id, d.d_cat, d.d_rel, d.d_content, d.d_ts, d.d_role, d.d_label, d.d_approval,
         k.s, v.s, k.rk, v.rk,
         (coalesce(1.0 / (p_rrf_k + k.rk), 0) + coalesce(1.0 / (p_rrf_k + v.rk), 0))::double precision
  from docs d
  left join kw_ranked k on k.d_type = d.d_type and k.d_id = d.d_id
  left join vec_ranked v on v.d_type = d.d_type and v.d_id = d.d_id
  where k.rk is not null or v.rk is not null
  order by 14 desc, d.d_ts desc
  limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 보안: 브라우저(anon/authenticated)는 테이블에 직접 접근하지 않는다.
-- 서버만 DB 접속 문자열(서버 전용 비밀값)로 접근한다. RLS를 켜고 정책을 두지 않아
-- PostgREST 경유 접근을 모두 차단한다. (테이블 소유자 연결은 RLS를 우회한다.)
-- ---------------------------------------------------------------------------
alter table care_category          enable row level security;
alter table recipient              enable row level security;
alter table staff_member           enable row level security;
alter table recipient_access       enable row level security;
alter table care_guide_item        enable row level security;
alter table care_guide_revision    enable row level security;
alter table conversation_session   enable row level security;
alter table care_situation         enable row level security;
alter table situation_analysis     enable row level security;
alter table conversation_message   enable row level security;
alter table care_record            enable row level security;
alter table care_record_category   enable row level security;
alter table care_record_draft      enable row level security;
alter table guide_update_request   enable row level security;
alter table analysis_evidence      enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function app_allowed_categories(text, text) from anon, authenticated';
    execute 'revoke execute on function hybrid_search(text, text, text[], extensions.vector, text, int, int, double precision, int) from anon, authenticated';
  end if;
  revoke execute on function app_allowed_categories(text, text) from public;
  revoke execute on function hybrid_search(text, text, text[], extensions.vector, text, int, int, double precision, int) from public;
end
$$;
