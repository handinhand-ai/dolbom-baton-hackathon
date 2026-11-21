-- 종사자가 설명서에 없는 내용을 보호자에게 묻는 질문 (물어보기·기록하기 통합 화면의 "어머니께 물어보기").
-- 질문과 답은 공식 설명서와 분리해 저장한다. 설명서에 넣는 일은 기존 승인 흐름에서 따로 한다.
create table if not exists guardian_question (
  question_id    text primary key default ('gq_' || replace(gen_random_uuid()::text, '-', '')),
  recipient_id   text not null references recipient(recipient_id),
  asked_by       text not null references staff_member(staff_id),
  question_text  text not null,
  status         text not null default 'pending' check (status in ('pending','answered')),
  answer_text    text,
  created_at     timestamptz not null default now(),
  answered_at    timestamptz
);
create index if not exists guardian_question_recipient_idx on guardian_question (recipient_id, created_at desc);
alter table guardian_question enable row level security;
