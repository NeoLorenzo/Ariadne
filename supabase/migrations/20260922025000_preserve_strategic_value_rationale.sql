-- Protect Strategic Value rationale during score-methodology transitions and
-- restore a bounded rationale for rows whose unchanged Strategic Value rationale
-- was cleared during the one-off Attainability v2 population.

create or replace function public.preserve_opportunity_score_strategic_rationale()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.strategic_value_rationale is null
     and old.strategic_value_rationale is not null then
    new.strategic_value_rationale := old.strategic_value_rationale;
  end if;

  return new;
end;
$$;

drop trigger if exists preserve_opportunity_score_strategic_rationale_trigger
  on public.opportunity_landscape_scores;

create trigger preserve_opportunity_score_strategic_rationale_trigger
before update
on public.opportunity_landscape_scores
for each row
execute function public.preserve_opportunity_score_strategic_rationale();

update public.opportunity_landscape_scores
set strategic_value_rationale =
  'Strategic relevance=' || strategic_relevance || ': ' ||
  case strategic_relevance
    when 4 then 'directly consequential or unusually strong strategic leverage.'
    when 3 then 'strongly relevant to an important direction or objective.'
    when 2 then 'meaningfully relevant with defensible strategic or independent value.'
    when 1 then 'weakly or tangentially relevant.'
    else 'negligible strategic relevance.'
  end || ' ' ||
  'Upside=' || upside || ': ' ||
  case upside
    when 4 then 'very high potential to materially change the available trajectory or option set.'
    when 3 then 'high potential for substantial career, educational, technical, institutional, financial, or network value.'
    when 2 then 'moderate, primarily incremental benefit.'
    when 1 then 'limited marginal benefit.'
    else 'negligible upside.'
  end || ' ' ||
  'Option value=' || option_value || ': ' ||
  case option_value
    when 4 then 'could substantially expand several valuable future paths.'
    when 3 then 'creates meaningful access to multiple later opportunities.'
    when 2 then 'provides useful future flexibility.'
    when 1 then 'value is mostly immediate.'
    else 'no meaningful option value.'
  end || ' ' ||
  'Opportunity-cost efficiency=' || opportunity_cost_efficiency || ': ' ||
  case opportunity_cost_efficiency
    when 4 then 'very favorable cost relative to potential value.'
    when 3 then 'meaningful costs remain proportionate to potential value.'
    when 2 then 'substantial cost may still be justified.'
    when 1 then 'major sacrifice or displacement.'
    else 'costs substantially undermine more important commitments or opportunities.'
  end
where strategic_value_rationale is null;

comment on function public.preserve_opportunity_score_strategic_rationale() is
  'Prevents omission of an optional score rationale from erasing an existing Strategic Value explanation.';
