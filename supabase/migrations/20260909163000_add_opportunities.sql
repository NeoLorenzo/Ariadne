-- Opportunity Landscape: normalized owner-only career and education opportunity storage.

create table if not exists public.opportunities (
  id text primary key check (length(trim(id)) > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  type text not null check (
    type in ('job', 'internship', 'fellowship', 'masters', 'course', 'program', 'other')
  ),
  organization text,
  url text,
  description text,
  requirements text,
  deadline date,
  start_date date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_user_archived_deadline_idx
on public.opportunities (user_id, archived, deadline);

create index if not exists opportunities_user_type_idx
on public.opportunities (user_id, type);

create or replace function public.set_opportunity_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_opportunity_updated_at_trigger on public.opportunities;
create trigger set_opportunity_updated_at_trigger
before update on public.opportunities
for each row
execute function public.set_opportunity_updated_at();

alter table public.opportunities enable row level security;

grant select, insert, update, delete on table public.opportunities to authenticated;
revoke all on table public.opportunities from anon;

drop policy if exists "Users manage own opportunities" on public.opportunities;
create policy "Users manage own opportunities"
on public.opportunities
for all
to authenticated
using (auth.uid() = user_id and public.is_ariadne_owner())
with check (auth.uid() = user_id and public.is_ariadne_owner());
