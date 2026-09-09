-- Add machine-readable standardized requirements while preserving legacy free-text eligibility.

alter table public.opportunities
  add column standardized_requirements jsonb not null default '[]'::jsonb,
  add column misc_requirements text;

alter table public.opportunity_candidates
  add column standardized_requirements jsonb not null default '[]'::jsonb,
  add column misc_requirements text;

alter table public.opportunities
  add constraint opportunities_standardized_requirements_array_check
  check (jsonb_typeof(standardized_requirements) = 'array');

alter table public.opportunity_candidates
  add constraint opportunity_candidates_standardized_requirements_array_check
  check (jsonb_typeof(standardized_requirements) = 'array');

update public.opportunities
set misc_requirements = requirements
where misc_requirements is null and requirements is not null;

update public.opportunity_candidates
set misc_requirements = requirements
where misc_requirements is null and requirements is not null;

create index opportunities_standardized_requirements_gin_idx
on public.opportunities using gin (standardized_requirements jsonb_path_ops);

create index opportunity_candidates_standardized_requirements_gin_idx
on public.opportunity_candidates using gin (standardized_requirements jsonb_path_ops);

-- Replace the acceptance RPC so structured requirements survive promotion atomically.
drop function if exists public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date);

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
  p_start_date date default null,
  p_standardized_requirements jsonb default '[]'::jsonb,
  p_misc_requirements text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  candidate_row public.opportunity_candidates%rowtype;
  opportunity_row public.opportunities%rowtype;
  normalized_structured jsonb := coalesce(p_standardized_requirements, '[]'::jsonb);
  normalized_misc text := nullif(trim(coalesce(p_misc_requirements, p_requirements, '')), '');
begin
  if not public.is_ariadne_owner() then
    raise exception 'Not authorized to accept opportunity candidates' using errcode = '42501';
  end if;

  if jsonb_typeof(normalized_structured) <> 'array' then
    raise exception 'Standardized requirements must be a JSON array' using errcode = '23514';
  end if;

  select * into candidate_row
  from public.opportunity_candidates
  where id = p_candidate_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Opportunity candidate not found' using errcode = 'P0002';
  end if;

  if candidate_row.review_status = 'accepted' and candidate_row.matched_opportunity_id is not null then
    select * into opportunity_row
    from public.opportunities
    where id = candidate_row.matched_opportunity_id and user_id = auth.uid();
    if found then
      return jsonb_build_object('candidate', to_jsonb(candidate_row), 'opportunity', to_jsonb(opportunity_row));
    end if;
  end if;

  if candidate_row.review_status <> 'pending' then
    raise exception 'Opportunity candidate has already been reviewed' using errcode = '23514';
  end if;

  insert into public.opportunities (
    id, user_id, title, type, organization, url, description, requirements,
    standardized_requirements, misc_requirements, deadline, start_date, archived
  ) values (
    p_opportunity_id, auth.uid(), trim(p_title), p_type,
    nullif(trim(coalesce(p_organization, '')), ''),
    nullif(trim(coalesce(p_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    normalized_misc,
    normalized_structured,
    normalized_misc,
    p_deadline, p_start_date, false
  ) returning * into opportunity_row;

  update public.opportunity_candidates
  set
    title = opportunity_row.title,
    type = opportunity_row.type,
    organization = opportunity_row.organization,
    canonical_url = coalesce(nullif(trim(coalesce(p_url, '')), ''), canonical_url),
    description = opportunity_row.description,
    requirements = opportunity_row.requirements,
    standardized_requirements = opportunity_row.standardized_requirements,
    misc_requirements = opportunity_row.misc_requirements,
    deadline = opportunity_row.deadline,
    start_date = opportunity_row.start_date,
    review_status = 'accepted',
    rejection_reason = null,
    matched_opportunity_id = opportunity_row.id
  where id = candidate_row.id and user_id = auth.uid()
  returning * into candidate_row;

  return jsonb_build_object('candidate', to_jsonb(candidate_row), 'opportunity', to_jsonb(opportunity_row));
end;
$$;

revoke all on function public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date, jsonb, text) from public;
revoke all on function public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date, jsonb, text) from anon;
grant execute on function public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date, jsonb, text) to authenticated;
grant execute on function public.accept_opportunity_candidate(text, text, text, text, text, text, text, text, date, date, jsonb, text) to service_role;
