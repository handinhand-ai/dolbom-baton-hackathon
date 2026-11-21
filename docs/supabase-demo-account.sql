-- 해커톤 시연용 계정·프로필 저장 테이블입니다.
-- Supabase SQL Editor에서 전체를 한 번 실행하세요.

create table if not exists dolbom_demo.app_user (
  user_id uuid primary key,
  phone text not null unique,
  password_salt text not null,
  password_hash text not null,
  role text not null check (role in ('guardian', 'caregiver')),
  display_name text not null,
  relation text,
  caregiver_type text,
  center_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dolbom_demo.user_profile (
  user_id uuid primary key references dolbom_demo.app_user(user_id) on delete cascade,
  care_recipient_id uuid not null unique,
  recipient_name text,
  age integer,
  sex text,
  height_cm integer,
  weight_kg integer,
  impression text,
  photo_data text,
  avatar jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table dolbom_demo.app_user enable row level security;
alter table dolbom_demo.user_profile enable row level security;

drop policy if exists "demo app_user access" on dolbom_demo.app_user;
create policy "demo app_user access"
on dolbom_demo.app_user for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo user_profile access" on dolbom_demo.user_profile;
create policy "demo user_profile access"
on dolbom_demo.user_profile for all
to anon, authenticated
using (true)
with check (true);

grant usage on schema dolbom_demo to anon, authenticated;
grant select, insert, update, delete on dolbom_demo.app_user to anon, authenticated;
grant select, insert, update, delete on dolbom_demo.user_profile to anon, authenticated;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'dolbom_demo'
  and tablename in ('app_user', 'user_profile')
order by tablename;
