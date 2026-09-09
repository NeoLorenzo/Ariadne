create table public.opportunity_requirement_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('candidate', 'opportunity')),
  entity_id text not null,
  requirement_id text not null,
  status text not null check (status in ('met', 'not_met', 'uncertain')),
  assessed_by text not null check (assessed_by in ('user', 'ai')),
  confidence double precision check (confidence is null or (confidence >= 0 and confidence <= 1)),
  rationale text,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id, requirement_id, assessed_by)
);

create index opportunity_requirement_assessments_entity_idx
  on public.opportunity_requirement_assessments (user_id, entity_type, entity_id);
create index opportunity_requirement_assessments_requirement_idx
  on public.opportunity_requirement_assessments (user_id, requirement_id);

alter table public.opportunity_requirement_assessments enable row level security;

create policy opportunity_requirement_assessments_owner_select
  on public.opportunity_requirement_assessments for select
  to authenticated
  using (user_id = auth.uid() and public.is_ariadne_owner());

create policy opportunity_requirement_assessments_owner_insert
  on public.opportunity_requirement_assessments for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_ariadne_owner());

create policy opportunity_requirement_assessments_owner_update
  on public.opportunity_requirement_assessments for update
  to authenticated
  using (user_id = auth.uid() and public.is_ariadne_owner())
  with check (user_id = auth.uid() and public.is_ariadne_owner());

create policy opportunity_requirement_assessments_owner_delete
  on public.opportunity_requirement_assessments for delete
  to authenticated
  using (user_id = auth.uid() and public.is_ariadne_owner());

revoke all on table public.opportunity_requirement_assessments from anon;
grant select, insert, update, delete on table public.opportunity_requirement_assessments to authenticated;
grant all on table public.opportunity_requirement_assessments to service_role;

create or replace function public.copy_candidate_requirement_assessments_to_opportunity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.review_status = 'accepted'
     and new.matched_opportunity_id is not null
     and (old.review_status is distinct from 'accepted' or old.matched_opportunity_id is distinct from new.matched_opportunity_id) then
    insert into public.opportunity_requirement_assessments (
      user_id, entity_type, entity_id, requirement_id, status, assessed_by,
      confidence, rationale, evidence, created_at, updated_at
    )
    select
      user_id, 'opportunity', new.matched_opportunity_id, requirement_id, status, assessed_by,
      confidence, rationale, evidence, created_at, updated_at
    from public.opportunity_requirement_assessments
    where user_id = new.user_id
      and entity_type = 'candidate'
      and entity_id = new.id
    on conflict (user_id, entity_type, entity_id, requirement_id, assessed_by)
    do update set
      status = excluded.status,
      confidence = excluded.confidence,
      rationale = excluded.rationale,
      evidence = excluded.evidence,
      updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists copy_candidate_requirement_assessments_on_accept on public.opportunity_candidates;
create trigger copy_candidate_requirement_assessments_on_accept
after update of review_status, matched_opportunity_id on public.opportunity_candidates
for each row execute function public.copy_candidate_requirement_assessments_to_opportunity();
