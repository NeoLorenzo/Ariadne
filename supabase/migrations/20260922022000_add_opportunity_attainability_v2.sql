-- Opportunity Landscape methodology v2: hierarchical Attainability.
--
-- Strategic Value remains on methodology v1 for now.
-- Attainability v2 separates formal eligibility from competitive strength:
--   Competitive Strength =
--     25% capability match
--     20% relevant experience
--     20% evidence strength
--     15% domain fit
--     15% competitive-bar fit
--      5% differentiation
--
-- Eligibility constrains rather than averages with competitive strength:
--   4 -> 1.00
--   3 -> 0.90
--   2 -> 0.70
--   1 -> 0.40
--   0 -> 0.00
--
-- Legacy v1 dimensions and a derived legacy_attainability value are retained
-- for migration/audit. A row switches to methodology_version=2 only through
-- the bounded v2 mutation after all v2 dimensions are supplied.

alter table public.opportunity_landscape_scores
  alter column competitiveness drop not null,
  alter column career_stage_fit drop not null,
  alter column timing_actionability drop not null;

alter table public.opportunity_landscape_scores
  add column if not exists capability_match smallint
    check (capability_match between 0 and 4),
  add column if not exists relevant_experience smallint
    check (relevant_experience between 0 and 4),
  add column if not exists evidence_strength smallint
    check (evidence_strength between 0 and 4),
  add column if not exists domain_fit smallint
    check (domain_fit between 0 and 4),
  add column if not exists competitive_bar_fit smallint
    check (competitive_bar_fit between 0 and 4),
  add column if not exists differentiation smallint
    check (differentiation between 0 and 4),
  add column if not exists eligibility_rationale text,
  add column if not exists capability_match_rationale text,
  add column if not exists relevant_experience_rationale text,
  add column if not exists evidence_strength_rationale text,
  add column if not exists domain_fit_rationale text,
  add column if not exists competitive_bar_fit_rationale text,
  add column if not exists differentiation_rationale text;

alter table public.opportunity_landscape_scores
  drop constraint if exists opportunity_landscape_scores_methodology_version_check;

alter table public.opportunity_landscape_scores
  add constraint opportunity_landscape_scores_methodology_version_check
  check (methodology_version in ('1', '2'));

alter table public.opportunity_landscape_scores
  add column if not exists legacy_attainability numeric(5,2)
  generated always as (
    case
      when competitiveness is null
        or career_stage_fit is null
        or timing_actionability is null
      then null
      else (
        (
          eligibility
          + competitiveness
          + career_stage_fit
          + timing_actionability
        )::numeric / 16
      ) * 100
    end
  ) stored;

alter table public.opportunity_landscape_scores
  add column if not exists competitive_strength numeric(5,2)
  generated always as (
    case
      when capability_match is null
        or relevant_experience is null
        or evidence_strength is null
        or domain_fit is null
        or competitive_bar_fit is null
        or differentiation is null
      then null
      else (
        (
          capability_match * 25
          + relevant_experience * 20
          + evidence_strength * 20
          + domain_fit * 15
          + competitive_bar_fit * 15
          + differentiation * 5
        )::numeric / 4
      )
    end
  ) stored;

alter table public.opportunity_landscape_scores
  drop column attainability;

alter table public.opportunity_landscape_scores
  add column attainability numeric(5,2)
  generated always as (
    case
      when methodology_version = '2' then
        case
          when capability_match is null
            or relevant_experience is null
            or evidence_strength is null
            or domain_fit is null
            or competitive_bar_fit is null
            or differentiation is null
          then null
          else
            (
              (
                capability_match * 25
                + relevant_experience * 20
                + evidence_strength * 20
                + domain_fit * 15
                + competitive_bar_fit * 15
                + differentiation * 5
              )::numeric / 4
            )
            *
            case eligibility
              when 4 then 1.00
              when 3 then 0.90
              when 2 then 0.70
              when 1 then 0.40
              else 0.00
            end
        end
      else
        case
          when competitiveness is null
            or career_stage_fit is null
            or timing_actionability is null
          then null
          else (
            (
              eligibility
              + competitiveness
              + career_stage_fit
              + timing_actionability
            )::numeric / 16
          ) * 100
        end
    end
  ) stored;

comment on column public.opportunity_landscape_scores.legacy_attainability is
  'Methodology v1 Attainability retained for migration/audit: equal average of eligibility, competitiveness, career-stage fit and timing/actionability.';

comment on column public.opportunity_landscape_scores.competitive_strength is
  'Methodology v2 competitive strength on 0-100 scale, derived from six bounded 0-4 classifications.';

comment on column public.opportunity_landscape_scores.attainability is
  'Canonical Attainability. v1 rows use the legacy equal average; v2 rows use eligibility multiplier x competitive strength.';

create or replace function chatgpt.upsert_opportunity_landscape_scores(scores jsonb)
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

  for v_item in select value from jsonb_array_elements(scores)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each score must be a JSON object' using errcode = '22023';
    end if;

    v_opportunity_id := btrim(coalesce(v_item->>'opportunity_id', ''));
    if v_opportunity_id = '' then
      raise exception 'opportunity_id is required' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.opportunities
      where id = v_opportunity_id and user_id = v_owner
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
      raise exception 'all eight v1 score dimensions must be numeric integers from 0 through 4' using errcode = '22023';
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
        raise exception 'all eight v1 score dimensions must be numeric integers from 0 through 4' using errcode = '22023';
    end;

    if v_strategic_relevance not between 0 and 4
       or v_upside not between 0 and 4
       or v_option_value not between 0 and 4
       or v_opportunity_cost_efficiency not between 0 and 4
       or v_eligibility not between 0 and 4
       or v_competitiveness not between 0 and 4
       or v_career_stage_fit not between 0 and 4
       or v_timing_actionability not between 0 and 4 then
      raise exception 'all eight v1 score dimensions must be integers from 0 through 4' using errcode = '22023';
    end if;

    v_strategic_value_rationale := nullif(btrim(coalesce(v_item->>'strategic_value_rationale', '')), '');
    v_attainability_rationale := nullif(btrim(coalesce(v_item->>'attainability_rationale', '')), '');

    select * into v_existing
    from public.opportunity_landscape_scores
    where opportunity_id = v_opportunity_id and user_id = v_owner;

    if found and v_existing.methodology_version = '2' then
      v_result := v_existing;
      v_action := 'ignored_v2';
    elsif not found then
      insert into public.opportunity_landscape_scores (
        opportunity_id,user_id,
        strategic_relevance,upside,option_value,opportunity_cost_efficiency,
        eligibility,competitiveness,career_stage_fit,timing_actionability,
        strategic_value_rationale,attainability_rationale,methodology_version
      )
      values (
        v_opportunity_id,v_owner,
        v_strategic_relevance,v_upside,v_option_value,v_opportunity_cost_efficiency,
        v_eligibility,v_competitiveness,v_career_stage_fit,v_timing_actionability,
        v_strategic_value_rationale,v_attainability_rationale,'1'
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
       and v_existing.attainability_rationale is not distinct from v_attainability_rationale then
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
      where opportunity_id = v_opportunity_id and user_id = v_owner
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

create or replace function chatgpt.upsert_opportunity_landscape_scores_v2(scores jsonb)
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
  v_capability_match smallint;
  v_relevant_experience smallint;
  v_evidence_strength smallint;
  v_domain_fit smallint;
  v_competitive_bar_fit smallint;
  v_differentiation smallint;
  v_strategic_value_rationale text;
  v_attainability_rationale text;
  v_eligibility_rationale text;
  v_capability_match_rationale text;
  v_relevant_experience_rationale text;
  v_evidence_strength_rationale text;
  v_domain_fit_rationale text;
  v_competitive_bar_fit_rationale text;
  v_differentiation_rationale text;
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

  for v_item in select value from jsonb_array_elements(scores)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each score must be a JSON object' using errcode = '22023';
    end if;

    v_opportunity_id := btrim(coalesce(v_item->>'opportunity_id', ''));
    if v_opportunity_id = '' then
      raise exception 'opportunity_id is required' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.opportunities
      where id = v_opportunity_id and user_id = v_owner
    ) then
      raise exception 'Opportunity not found: %', v_opportunity_id using errcode = 'P0002';
    end if;

    if jsonb_typeof(v_item->'strategic_relevance') <> 'number'
       or jsonb_typeof(v_item->'upside') <> 'number'
       or jsonb_typeof(v_item->'option_value') <> 'number'
       or jsonb_typeof(v_item->'opportunity_cost_efficiency') <> 'number'
       or jsonb_typeof(v_item->'eligibility') <> 'number'
       or jsonb_typeof(v_item->'capability_match') <> 'number'
       or jsonb_typeof(v_item->'relevant_experience') <> 'number'
       or jsonb_typeof(v_item->'evidence_strength') <> 'number'
       or jsonb_typeof(v_item->'domain_fit') <> 'number'
       or jsonb_typeof(v_item->'competitive_bar_fit') <> 'number'
       or jsonb_typeof(v_item->'differentiation') <> 'number' then
      raise exception 'all methodology v2 dimensions must be numeric integers from 0 through 4' using errcode = '22023';
    end if;

    begin
      v_strategic_relevance := (v_item->>'strategic_relevance')::smallint;
      v_upside := (v_item->>'upside')::smallint;
      v_option_value := (v_item->>'option_value')::smallint;
      v_opportunity_cost_efficiency := (v_item->>'opportunity_cost_efficiency')::smallint;
      v_eligibility := (v_item->>'eligibility')::smallint;
      v_capability_match := (v_item->>'capability_match')::smallint;
      v_relevant_experience := (v_item->>'relevant_experience')::smallint;
      v_evidence_strength := (v_item->>'evidence_strength')::smallint;
      v_domain_fit := (v_item->>'domain_fit')::smallint;
      v_competitive_bar_fit := (v_item->>'competitive_bar_fit')::smallint;
      v_differentiation := (v_item->>'differentiation')::smallint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'all methodology v2 dimensions must be numeric integers from 0 through 4' using errcode = '22023';
    end;

    if v_strategic_relevance not between 0 and 4
       or v_upside not between 0 and 4
       or v_option_value not between 0 and 4
       or v_opportunity_cost_efficiency not between 0 and 4
       or v_eligibility not between 0 and 4
       or v_capability_match not between 0 and 4
       or v_relevant_experience not between 0 and 4
       or v_evidence_strength not between 0 and 4
       or v_domain_fit not between 0 and 4
       or v_competitive_bar_fit not between 0 and 4
       or v_differentiation not between 0 and 4 then
      raise exception 'all methodology v2 dimensions must be integers from 0 through 4' using errcode = '22023';
    end if;

    v_strategic_value_rationale := nullif(btrim(coalesce(v_item->>'strategic_value_rationale', '')), '');
    v_attainability_rationale := nullif(btrim(coalesce(v_item->>'attainability_rationale', '')), '');
    v_eligibility_rationale := nullif(btrim(coalesce(v_item->>'eligibility_rationale', '')), '');
    v_capability_match_rationale := nullif(btrim(coalesce(v_item->>'capability_match_rationale', '')), '');
    v_relevant_experience_rationale := nullif(btrim(coalesce(v_item->>'relevant_experience_rationale', '')), '');
    v_evidence_strength_rationale := nullif(btrim(coalesce(v_item->>'evidence_strength_rationale', '')), '');
    v_domain_fit_rationale := nullif(btrim(coalesce(v_item->>'domain_fit_rationale', '')), '');
    v_competitive_bar_fit_rationale := nullif(btrim(coalesce(v_item->>'competitive_bar_fit_rationale', '')), '');
    v_differentiation_rationale := nullif(btrim(coalesce(v_item->>'differentiation_rationale', '')), '');

    select * into v_existing
    from public.opportunity_landscape_scores
    where opportunity_id = v_opportunity_id and user_id = v_owner;

    if not found then
      insert into public.opportunity_landscape_scores (
        opportunity_id,user_id,
        strategic_relevance,upside,option_value,opportunity_cost_efficiency,
        eligibility,
        capability_match,relevant_experience,evidence_strength,
        domain_fit,competitive_bar_fit,differentiation,
        strategic_value_rationale,attainability_rationale,eligibility_rationale,
        capability_match_rationale,relevant_experience_rationale,evidence_strength_rationale,
        domain_fit_rationale,competitive_bar_fit_rationale,differentiation_rationale,
        methodology_version
      )
      values (
        v_opportunity_id,v_owner,
        v_strategic_relevance,v_upside,v_option_value,v_opportunity_cost_efficiency,
        v_eligibility,
        v_capability_match,v_relevant_experience,v_evidence_strength,
        v_domain_fit,v_competitive_bar_fit,v_differentiation,
        v_strategic_value_rationale,v_attainability_rationale,v_eligibility_rationale,
        v_capability_match_rationale,v_relevant_experience_rationale,v_evidence_strength_rationale,
        v_domain_fit_rationale,v_competitive_bar_fit_rationale,v_differentiation_rationale,
        '2'
      )
      returning * into v_result;
      v_action := 'created';
    elsif v_existing.methodology_version = '2'
       and v_existing.strategic_relevance is not distinct from v_strategic_relevance
       and v_existing.upside is not distinct from v_upside
       and v_existing.option_value is not distinct from v_option_value
       and v_existing.opportunity_cost_efficiency is not distinct from v_opportunity_cost_efficiency
       and v_existing.eligibility is not distinct from v_eligibility
       and v_existing.capability_match is not distinct from v_capability_match
       and v_existing.relevant_experience is not distinct from v_relevant_experience
       and v_existing.evidence_strength is not distinct from v_evidence_strength
       and v_existing.domain_fit is not distinct from v_domain_fit
       and v_existing.competitive_bar_fit is not distinct from v_competitive_bar_fit
       and v_existing.differentiation is not distinct from v_differentiation
       and v_existing.strategic_value_rationale is not distinct from v_strategic_value_rationale
       and v_existing.attainability_rationale is not distinct from v_attainability_rationale
       and v_existing.eligibility_rationale is not distinct from v_eligibility_rationale
       and v_existing.capability_match_rationale is not distinct from v_capability_match_rationale
       and v_existing.relevant_experience_rationale is not distinct from v_relevant_experience_rationale
       and v_existing.evidence_strength_rationale is not distinct from v_evidence_strength_rationale
       and v_existing.domain_fit_rationale is not distinct from v_domain_fit_rationale
       and v_existing.competitive_bar_fit_rationale is not distinct from v_competitive_bar_fit_rationale
       and v_existing.differentiation_rationale is not distinct from v_differentiation_rationale then
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
        capability_match = v_capability_match,
        relevant_experience = v_relevant_experience,
        evidence_strength = v_evidence_strength,
        domain_fit = v_domain_fit,
        competitive_bar_fit = v_competitive_bar_fit,
        differentiation = v_differentiation,
        strategic_value_rationale = v_strategic_value_rationale,
        attainability_rationale = v_attainability_rationale,
        eligibility_rationale = v_eligibility_rationale,
        capability_match_rationale = v_capability_match_rationale,
        relevant_experience_rationale = v_relevant_experience_rationale,
        evidence_strength_rationale = v_evidence_strength_rationale,
        domain_fit_rationale = v_domain_fit_rationale,
        competitive_bar_fit_rationale = v_competitive_bar_fit_rationale,
        differentiation_rationale = v_differentiation_rationale,
        methodology_version = '2',
        updated_at = now()
      where opportunity_id = v_opportunity_id and user_id = v_owner
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
    'methodology_version', '2',
    'count', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$$;

revoke all on function chatgpt.upsert_opportunity_landscape_scores_v2(jsonb)
from public, anon, authenticated;

grant execute on function chatgpt.upsert_opportunity_landscape_scores_v2(jsonb)
to service_role;
