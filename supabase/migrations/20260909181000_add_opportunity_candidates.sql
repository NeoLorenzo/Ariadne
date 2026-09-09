-- Opportunity ingestion inbox: private candidate records and atomic acceptance.

create table if not exists public.opportunity_candidates (
  id text primary key check (length(trim(id)) > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('manual', 'agent', 'scraper', 'api', 'import')),
  source_name text not null check (length(trim(source_name)) > 0),
  source_external_id text,
  source_url text,
  canonical_url text,
  source_payload jsonb not null default '{}'::jsonb,
  title text not null check (length(trim(title)) > 0),
  type text not null check (type in ('job', 'internship', 'fellowship', 'masters', 'course', 'program', 'other')),
  organization text,
  description text,
  requirements text,
  deadline date,
  start_date date,
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  content_hash text not null check (length(trim(content_hash)) > 0),
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected', 'duplicate')),
  rejection_reason text,
  matched_opportunity_id text references public.opportunities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunity_candidates_user_status_deadline_idx
on public.opportunity_candidates (user_id, review_status, deadline);

create index if not exists opportunity_candidates_user_type_idx
on public.opportunity_candidates (user_id, type);

create index if not exists opportunity_candidates_user_canonical_url_idx
on public.opportunity_candidates (user_id, canonical_url)
where canonical_url is not null;

create index if not exists opportunity_candidates_user_content_hash_idx
on public.opportunity_candidates (user_id, content_hash);

create unique index if not exists opportunity_candidates_source_external_id_uidx
on public.opportunity_candidates (user_id, source_type, source_name, source_external_id)
where source_external_id is not null and length(trim(source_external_id)) > 0;

drop trigger if exists set_opportunity_candidate_updated_at_trigger on public.opportunity_candidates;
create trigger set_opportunity_candidate_updated_at_trigger
before update on public.opportunity_candidates
for each row
execute function public.set_opportunity_updated_at();

alter table public.opportunity_candidates enable row level security;

revoke all privileges on table public.opportunity_candidates from public;
revoke all privileges on table public.opportunity_candidates from anon;
revoke all privileges on table public.opportunity_candidates from authenticated;
grant select, insert, update, delete on table public.opportunity_candidates to authenticated;
grant all privileges on table public.opportunity_candidates to service_role;

drop policy if exists "Users manage own opportunity candidates" on public.opportunity_candidates;
create policy "Users manage own opportunity candidates"
on public.opportunity_candidates
for all
to authenticated
using (auth.uid() = user_id and public.is_ariadne_owner())
with check (auth.uid() = user_id and public.is_ariadne_owner());

create or replace function public.accept_opportunity_candidate(
  p_candidate_id text,
  p_opportunity_id text,
  p_title text,
  p_type text,
  p_organization text default null,
  p_url text default null,
  p_description text default null,
  p_requirements text default null,
  p_deadline date default null,
  p_start_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  candidate_row public.opportunity_candidates%rowtype;
  opportunity_row public.opportunities%rowtype;
begin
  if not public.is_ariadne_owner() then
    raise exception 'Not authorized to accept opportunity candidates' using errcode = '42501';
  end if;

  select *
  into candidate_row
  from public.opportunity_candidates
  where id = p_candidate_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Opportunity candidate not found' using errcode = 'P0002';
  end if;

  if candidate_row.review_status = 'accepted' and candidate_row.matched_opportunity_id is not null then
    select *
    into opportunity_row
    from public.opportunities
    where id = candidate_row.matched_opportunity_id
      and user_id = auth.uid();

    if found then
      return jsonb_build_object(
        'candidate', to_jsonb(candidate_row),
        'opportunity', to_jsonb(opportunity_row)
      );
    end if;
  end if;

  if candidate_row.review_status <> 'pending' then
    raise exception 'Opportunity candidate has already been reviewed' using errcode = '23514';
  end if;

  insert into public.opportunities (
    id,
    user_id,
    title,
    type,
    organization,
    url,
    description,
    requirements,
    deadline,
    start_date,
    archived
  )
  values (
    p_opportunity_id,
    auth.uid(),
    trim(p_title),
    p_type,
    nullif(trim(coalesce(p_organization, '')), ''),
    nullif(trim(coalesce(p_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_requirements, '')), ''),
    p_deadline,
    p_start_date,
    false
  )
  returning * into opportunity_row;

  update public.opportunity_candidates
  set
    title = opportunity_row.title,
    type = opportunity_row.type,
    organization = opportunity_row.organization,
    canonical_url = coalesce(nullif(trim(coalesce(p_url, '')), ''), canonical_url),
    description = opportunity_row.description,
    requirements = opportunity_row.requirements,
    deadline = opportunity_row.deadline,
    start_date = opportunity_row.start_date,
    review_status = 'accepted',
    rejection_reason = null,
    matched_opportunity_id = opportunity_row.id
  where id = candidate_row.id
    and user_id = auth.uid()
  returning * into candidate_row;

  return jsonb_build_object(
    'candidate', to_jsonb(candidate_row),
    'opportunity', to_jsonb(opportunity_row)
  );
end;
$$;

revoke all on function public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date) from public;
revoke all on function public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date) from anon;
grant execute on function public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date) to service_role;
