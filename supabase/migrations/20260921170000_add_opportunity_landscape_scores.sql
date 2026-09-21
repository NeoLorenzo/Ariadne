-- Canonical Opportunity Landscape scoring.
-- The Review Agent supplies eight bounded 0-4 classifications.
-- Postgres deterministically derives the two 0-100 chart coordinates.

create table public.opportunity_landscape_scores (
  opportunity_id text primary key references public.opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  strategic_relevance smallint not null check (strategic_relevance between 0 and 4),
  upside smallint not null check (upside between 0 and 4),
  option_value smallint not null check (option_value between 0 and 4),
  opportunity_cost_efficiency smallint not null check (opportunity_cost_efficiency between 0 and 4),
  eligibility smallint not null check (eligibility between 0 and 4),
  competitiveness smallint not null check (competitiveness between 0 and 4),
  career_stage_fit smallint not null check (career_stage_fit between 0 and 4),
  timing_actionability smallint not null check (timing_actionability between 0 and 4),
  strategic_value numeric(5,2) generated always as (
    ((strategic_relevance + upside + option_value + opportunity_cost_efficiency)::numeric / 16::numeric) * 100::numeric
  ) stored,
  attainability numeric(5,2) generated always as (
    ((eligibility + competitiveness + career_stage_fit + timing_actionability)::numeric / 16::numeric) * 100::numeric
  ) stored,
  strategic_value_rationale text,
  attainability_rationale text,
  methodology_version text not null default '1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create index opportunity_landscape_scores_user_idx
  on public.opportunity_landscape_scores (user_id);

alter table public.opportunity_landscape_scores enable row level security;

create policy opportunity_landscape_scores_owner_select
  on public.opportunity_landscape_scores for select
  to authenticated
  using (user_id = auth.uid() and public.is_ariadne_owner());

revoke all on table public.opportunity_landscape_scores from anon;
revoke all on table public.opportunity_landscape_scores from authenticated;
grant select on table public.opportunity_landscape_scores to authenticated;
grant all on table public.opportunity_landscape_scores to service_role;

create or replace function chatgpt.get_opportunity_landscape_scores(
  include_archived boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = public, chatgpt, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      (to_jsonb(s) - 'user_id')
      || jsonb_build_object(
        'title', o.title,
        'organization', o.organization,
        'archived', o.archived
      )
      order by o.archived, o.title, o.id
    ),
    '[]'::jsonb
  )
  from public.opportunity_landscape_scores s
  join public.opportunities o
    on o.id = s.opportunity_id
   and o.user_id = s.user_id
  where s.user_id = chatgpt.owner_user_id()
    and (include_archived or not o.archived);
$$;

revoke all on function chatgpt.get_opportunity_landscape_scores(boolean) from public;
revoke all on function chatgpt.get_opportunity_landscape_scores(boolean) from anon;
revoke all on function chatgpt.get_opportunity_landscape_scores(boolean) from authenticated;
grant execute on function chatgpt.get_opportunity_landscape_scores(boolean) to service_role;

create or replace function chatgpt.upsert_opportunity_landscape_scores(
  scores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, chatgpt, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_item jsonb;
  v_opportunity_id text;
  v_strategic_relevance smallint;
  v_upside smallint;
  v_option_value smallint;
  v_opportunity_cost_efficiency smallint;
  v_eligibility smallint;
  v_competitiveness smallint;
  v_career_stage_fit smallint;
  v_timing_actionability smallint;
  v_strategic_value_rationale text;
  v_attainability_rationale text;
  v_existing public.opportunity_landscape_scores%rowtype;
  v_result public.opportunity_landscape_scores%rowtype;
  v_action text;
  v_results jsonb := '[]'::jsonb;
begin
  if scores is null or jsonb_typeof(scores) <> 'array' then
    raise exception 'scores must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(scores) > 200 then
    raise exception 'score batch may contain at most 200 items' using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(scores)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each score must be a JSON object' using errcode = '22023';
    end if;

    v_opportunity_id := btrim(coalesce(v_item->>'opportunity_id', ''));
    if v_opportunity_id = '' then
      raise exception 'opportunity_id is required' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.opportunities
      where id = v_opportunity_id
        and user_id = v_owner
    ) then
      raise exception 'Opportunity not found: %', v_opportunity_id using errcode = 'P0002';
    end if;

    if jsonb_typeof(v_item->'strategic_relevance') <> 'number'
       or jsonb_typeof(v_item->'upside') <> 'number'
       or jsonb_typeof(v_item->'option_value') <> 'number'
       or jsonb_typeof(v_item->'opportunity_cost_efficiency') <> 'number'
       or jsonb_typeof(v_item->'eligibility') <> 'number'
       or jsonb_typeof(v_item->'competitiveness') <> 'number'
       or jsonb_typeof(v_item->'career_stage_fit') <> 'number'
       or jsonb_typeof(v_item->'timing_actionability') <> 'number' then
      raise exception 'all eight canonical score dimensions must be numeric integers from 0 through 4' using errcode = '22023';
    end if;

    begin
      v_strategic_relevance := (v_item->>'strategic_relevance')::smallint;
      v_upside := (v_item->>'upside')::smallint;
      v_option_value := (v_item->>'option_value')::smallint;
      v_opportunity_cost_efficiency := (v_item->>'opportunity_cost_efficiency')::smallint;
      v_eligibility := (v_item->>'eligibility')::smallint;
      v_competitiveness := (v_item->>'competitiveness')::smallint;
      v_career_stage_fit := (v_item->>'career_stage_fit')::smallint;
      v_timing_actionability := (v_item->>'timing_actionability')::smallint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'all eight canonical score dimensions must be numeric integers from 0 through 4' using errcode = '22023';
    end;

    if v_strategic_relevance not between 0 and 4
       or v_upside not between 0 and 4
       or v_option_value not between 0 and 4
       or v_opportunity_cost_efficiency not between 0 and 4
       or v_eligibility not between 0 and 4
       or v_competitiveness not between 0 and 4
       or v_career_stage_fit not between 0 and 4
       or v_timing_actionability not between 0 and 4 then
      raise exception 'all eight canonical score dimensions must be integers from 0 through 4' using errcode = '22023';
    end if;

    v_strategic_value_rationale := nullif(btrim(coalesce(v_item->>'strategic_value_rationale', '')), '');
    v_attainability_rationale := nullif(btrim(coalesce(v_item->>'attainability_rationale', '')), '');

    select *
    into v_existing
    from public.opportunity_landscape_scores
    where opportunity_id = v_opportunity_id
      and user_id = v_owner;

    if not found then
      insert into public.opportunity_landscape_scores (
        opportunity_id,
        user_id,
        strategic_relevance,
        upside,
        option_value,
        opportunity_cost_efficiency,
        eligibility,
        competitiveness,
        career_stage_fit,
        timing_actionability,
        strategic_value_rationale,
        attainability_rationale,
        methodology_version
      )
      values (
        v_opportunity_id,
        v_owner,
        v_strategic_relevance,
        v_upside,
        v_option_value,
        v_opportunity_cost_efficiency,
        v_eligibility,
        v_competitiveness,
        v_career_stage_fit,
        v_timing_actionability,
        v_strategic_value_rationale,
        v_attainability_rationale,
        '1'
      )
      returning * into v_result;
      v_action := 'created';
    elsif v_existing.strategic_relevance is not distinct from v_strategic_relevance
       and v_existing.upside is not distinct from v_upside
       and v_existing.option_value is not distinct from v_option_value
       and v_existing.opportunity_cost_efficiency is not distinct from v_opportunity_cost_efficiency
       and v_existing.eligibility is not distinct from v_eligibility
       and v_existing.competitiveness is not distinct from v_competitiveness
       and v_existing.career_stage_fit is not distinct from v_career_stage_fit
       and v_existing.timing_actionability is not distinct from v_timing_actionability
       and v_existing.strategic_value_rationale is not distinct from v_strategic_value_rationale
       and v_existing.attainability_rationale is not distinct from v_attainability_rationale
       and v_existing.methodology_version = '1' then
      v_result := v_existing;
      v_action := 'unchanged';
    else
      update public.opportunity_landscape_scores
      set
        strategic_relevance = v_strategic_relevance,
        upside = v_upside,
        option_value = v_option_value,
        opportunity_cost_efficiency = v_opportunity_cost_efficiency,
        eligibility = v_eligibility,
        competitiveness = v_competitiveness,
        career_stage_fit = v_career_stage_fit,
        timing_actionability = v_timing_actionability,
        strategic_value_rationale = v_strategic_value_rationale,
        attainability_rationale = v_attainability_rationale,
        methodology_version = '1',
        updated_at = now()
      where opportunity_id = v_opportunity_id
        and user_id = v_owner
      returning * into v_result;
      v_action := 'updated';
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'opportunity_id', v_opportunity_id,
        'action', v_action,
        'score', to_jsonb(v_result) - 'user_id'
      )
    );
  end loop;

  return jsonb_build_object(
    'methodology_version', '1',
    'count', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$$;

revoke all on function chatgpt.upsert_opportunity_landscape_scores(jsonb) from public;
revoke all on function chatgpt.upsert_opportunity_landscape_scores(jsonb) from anon;
revoke all on function chatgpt.upsert_opportunity_landscape_scores(jsonb) from authenticated;
grant execute on function chatgpt.upsert_opportunity_landscape_scores(jsonb) to service_role;
