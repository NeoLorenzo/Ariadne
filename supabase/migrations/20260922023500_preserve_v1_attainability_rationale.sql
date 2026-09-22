-- Preserve the pre-v2 Attainability rationale when a score row migrates.
-- Numeric v1 inputs and legacy_attainability are already retained; this completes
-- the audit trail for the legacy explanation as well.

alter table public.opportunity_landscape_scores
  add column if not exists legacy_attainability_rationale text;

update public.opportunity_landscape_scores
set legacy_attainability_rationale = attainability_rationale
where methodology_version = '1'
  and legacy_attainability_rationale is null
  and attainability_rationale is not null;

create or replace function public.preserve_opportunity_score_v1_rationale()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.methodology_version = '1'
     and new.methodology_version = '2'
     and new.legacy_attainability_rationale is null then
    new.legacy_attainability_rationale := old.attainability_rationale;
  end if;

  return new;
end;
$$;

drop trigger if exists preserve_opportunity_score_v1_rationale_trigger
  on public.opportunity_landscape_scores;

create trigger preserve_opportunity_score_v1_rationale_trigger
before update of methodology_version
on public.opportunity_landscape_scores
for each row
execute function public.preserve_opportunity_score_v1_rationale();
