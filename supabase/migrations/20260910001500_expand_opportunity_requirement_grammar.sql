alter table public.opportunities
  add column if not exists raw_requirements_text text,
  add column if not exists application_components jsonb not null default '[]'::jsonb;

alter table public.opportunity_candidates
  add column if not exists raw_requirements_text text,
  add column if not exists application_components jsonb not null default '[]'::jsonb;

alter table public.opportunities
  drop constraint if exists opportunities_application_components_array,
  add constraint opportunities_application_components_array
    check (jsonb_typeof(application_components) = 'array');

alter table public.opportunity_candidates
  drop constraint if exists opportunity_candidates_application_components_array,
  add constraint opportunity_candidates_application_components_array
    check (jsonb_typeof(application_components) = 'array');

update public.opportunities
set
  raw_requirements_text = coalesce(raw_requirements_text, requirements, misc_requirements, ''),
  standardized_requirements = regexp_replace(
    regexp_replace(
      regexp_replace(
        standardized_requirements::text,
        '"necessity"\s*:\s*"required"', '"necessity":"hard_requirement"', 'g'
      ),
      '"necessity"\s*:\s*"advantageous"', '"necessity":"competitive_signal"', 'g'
    ),
    '"necessity"\s*:\s*"permitted_exception"', '"necessity":"allowed_exception"', 'g'
  )::jsonb;

update public.opportunity_candidates
set
  raw_requirements_text = coalesce(raw_requirements_text, requirements, misc_requirements, ''),
  standardized_requirements = regexp_replace(
    regexp_replace(
      regexp_replace(
        standardized_requirements::text,
        '"necessity"\s*:\s*"required"', '"necessity":"hard_requirement"', 'g'
      ),
      '"necessity"\s*:\s*"advantageous"', '"necessity":"competitive_signal"', 'g'
    ),
    '"necessity"\s*:\s*"permitted_exception"', '"necessity":"allowed_exception"', 'g'
  )::jsonb;

update public.opportunities o
set standardized_requirements = coalesce(o.standardized_requirements, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object('id', 'requirements-source', 'kind', 'source_text', 'rawText', coalesce(o.raw_requirements_text, ''))
)
where not exists (
  select 1 from jsonb_array_elements(coalesce(o.standardized_requirements, '[]'::jsonb)) item
  where item->>'kind' = 'source_text'
);

update public.opportunity_candidates c
set standardized_requirements = coalesce(c.standardized_requirements, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object('id', 'requirements-source', 'kind', 'source_text', 'rawText', coalesce(c.raw_requirements_text, ''))
)
where not exists (
  select 1 from jsonb_array_elements(coalesce(c.standardized_requirements, '[]'::jsonb)) item
  where item->>'kind' = 'source_text'
);

update public.opportunities o
set application_components = coalesce((
  select jsonb_agg(item)
  from jsonb_array_elements(coalesce(o.standardized_requirements, '[]'::jsonb)) item
  where item->>'kind' = 'application_component'
), '[]'::jsonb);

update public.opportunity_candidates c
set application_components = coalesce((
  select jsonb_agg(item)
  from jsonb_array_elements(coalesce(c.standardized_requirements, '[]'::jsonb)) item
  where item->>'kind' = 'application_component'
), '[]'::jsonb);

create or replace function public.sync_opportunity_requirement_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  doc jsonb := coalesce(new.standardized_requirements, '[]'::jsonb);
  criteria jsonb := '[]'::jsonb;
  document_components jsonb := '[]'::jsonb;
  resolved_components jsonb := '[]'::jsonb;
  source_node jsonb;
  resolved_raw text;
  direct_raw_change boolean := false;
  direct_component_change boolean := false;
begin
  if jsonb_typeof(doc) <> 'array' then
    raise exception 'Standardized requirements must be a JSON array' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(new.application_components, '[]'::jsonb)) <> 'array' then
    raise exception 'Application components must be a JSON array' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into criteria
  from jsonb_array_elements(doc) item
  where coalesce(item->>'kind', '') not in ('source_text', 'application_component');

  select item into source_node
  from jsonb_array_elements(doc) item
  where item->>'kind' = 'source_text'
  limit 1;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into document_components
  from jsonb_array_elements(doc) item
  where item->>'kind' = 'application_component';

  if tg_op = 'UPDATE' then
    direct_raw_change := new.raw_requirements_text is distinct from old.raw_requirements_text;
    direct_component_change := new.application_components is distinct from old.application_components;
  end if;

  if tg_op = 'INSERT' then
    resolved_raw := coalesce(source_node->>'rawText', source_node->>'raw_text', new.raw_requirements_text, '');
    if jsonb_array_length(document_components) > 0 then
      resolved_components := document_components;
    else
      resolved_components := coalesce(new.application_components, '[]'::jsonb);
    end if;
  else
    if direct_raw_change then
      resolved_raw := coalesce(new.raw_requirements_text, '');
    elsif new.standardized_requirements is distinct from old.standardized_requirements and source_node is not null then
      resolved_raw := coalesce(source_node->>'rawText', source_node->>'raw_text', '');
    else
      resolved_raw := coalesce(old.raw_requirements_text, source_node->>'rawText', source_node->>'raw_text', '');
    end if;

    if direct_component_change then
      resolved_components := coalesce(new.application_components, '[]'::jsonb);
    elsif new.standardized_requirements is distinct from old.standardized_requirements then
      resolved_components := document_components;
    else
      resolved_components := coalesce(old.application_components, document_components, '[]'::jsonb);
    end if;
  end if;

  select coalesce(jsonb_agg(
    case
      when item->>'kind' = 'application_component' then item
      else item || jsonb_build_object('kind', 'application_component')
    end
  ), '[]'::jsonb)
  into resolved_components
  from jsonb_array_elements(coalesce(resolved_components, '[]'::jsonb)) item;

  new.raw_requirements_text := nullif(trim(coalesce(resolved_raw, '')), '');
  new.application_components := resolved_components;
  new.standardized_requirements := criteria || resolved_components || jsonb_build_array(
    jsonb_build_object('id', 'requirements-source', 'kind', 'source_text', 'rawText', coalesce(resolved_raw, ''))
  );
  return new;
end;
$$;

drop trigger if exists opportunities_sync_requirement_metadata on public.opportunities;
create trigger opportunities_sync_requirement_metadata
before insert or update of standardized_requirements, raw_requirements_text, application_components
on public.opportunities
for each row execute function public.sync_opportunity_requirement_metadata();

drop trigger if exists opportunity_candidates_sync_requirement_metadata on public.opportunity_candidates;
create trigger opportunity_candidates_sync_requirement_metadata
before insert or update of standardized_requirements, raw_requirements_text, application_components
on public.opportunity_candidates
for each row execute function public.sync_opportunity_requirement_metadata();

comment on column public.opportunities.raw_requirements_text is 'Immutable/reference source wording for opportunity requirements; user-facing misc_requirements contains only residual unstructured criteria.';
comment on column public.opportunities.application_components is 'Structured non-eligibility application deliverables such as CV, references, proposals, abstracts and writing samples.';
comment on column public.opportunity_candidates.raw_requirements_text is 'Reference source wording for candidate requirements; misc_requirements is reserved for residual unstructured criteria.';
comment on column public.opportunity_candidates.application_components is 'Structured non-eligibility application deliverables discovered during candidate ingestion.';
