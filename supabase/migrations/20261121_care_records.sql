begin;

create table public.care_records (
  id uuid primary key,
  care_recipient_id uuid not null,
  author text not null check (author in ('보호자', '종사자')),
  author_user_id uuid not null,
  assignment_id uuid,
  input_method text not null check (input_method in ('text', 'voice', 'quick')),
  event_time timestamptz,
  created_at timestamptz not null,
  text text not null check (char_length(text) between 1 and 2000),
  category text not null check (category in ('소통', '식사', '위생', '약', '일과', '정서·행동', '안전')),
  importance text not null check (importance in ('low', 'medium', 'high')),
  safety_flag boolean not null default false,
  safety_reference text,
  relation text check (relation in ('same', 'new', 'differs')),
  related_manual_item_id uuid,
  sent_to_guardian_at timestamptz,
  source_text text not null check (char_length(source_text) between 1 and 2000),
  save_key uuid not null,
  save_index integer not null check (save_index between 0 and 19),
  save_fingerprint text not null,
  constraint care_records_request_item_key unique nulls not distinct
    (author_user_id, care_recipient_id, assignment_id, save_key, save_index),
  check (
    (author = '보호자' and assignment_id is null and relation is null
      and related_manual_item_id is null and sent_to_guardian_at is null)
    or
    (author = '종사자' and assignment_id is not null and relation is not null)
  )
);

alter table public.care_records enable row level security;
revoke all on public.care_records from public, anon, authenticated;

commit;
