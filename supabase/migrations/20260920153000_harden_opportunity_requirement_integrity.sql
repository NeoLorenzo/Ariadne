-- Repair legacy Opportunity requirement documents, preserve requirement metadata on promotion,
-- and reject malformed tuple/array nodes before they can recur.

create or replace function ariadne_internal.application_component_type_from_label(p_label text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_label, '') ~* '\\m(cv|resume|résumé)\\M' then 'cv_resume'
    when coalesce(p_label, '') ~* '\\mcover(ing)?[[:space:]]+letter\\M' then 'cover_letter'
    when coalesce(p_label, '') ~* '\\m(reference|references|referee|referees|recommender|recommenders|recommendation letter|recommendation letters)\\M' then 'references'
    when coalesce(p_label, '') ~* '\\mwriting sample\\M' then 'writing_sample'
    when coalesce(p_label, '') ~* '\\m(research proposal|statement of research interest)\\M' then 'research_proposal'
    when coalesce(p_label, '') ~* '\\mabstract\\M' then 'abstract'
    when coalesce(p_label, '') ~* '\\mportfolio\\M' then 'portfolio'
    when coalesce(p_label, '') ~* '\\mscreencast\\M' then 'screencast'
    when coalesce(p_label, '') ~* '\\m(online application|application form)\\M' then 'application_form'
    when coalesce(p_label, '') ~* '\\m(transcript|transcripts|degree transcript|degree transcripts|academic transcript|academic transcripts)\\M' then 'transcript'
    else 'other'
  end
$$;

create or replace function ariadne_internal.application_component_count_from_label(p_label text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_label, '') ~* '\\m(two|2)\\M' then 2
    when coalesce(p_label, '') ~* '\\m(three|3)\\M' then 3
    when coalesce(p_label, '') ~* '\\m(four|4)\\M' then 4
    else 1
  end
$$;

create or replace function ariadne_internal.repair_legacy_application_component_tuple(
  p_node jsonb,
  p_ordinal bigint
)
returns jsonb
language plpgsql
immutable
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_label text;
begin
  if jsonb_typeof(p_node) <> 'array' then
    return p_node;
  end if;

  select value #>> '{}'
  into v_label
  from jsonb_array_elements(p_node) with ordinality as e(value, ord)
  where jsonb_typeof(value) = 'string'
  order by ord
  limit 1;

  if nullif(btrim(coalesce(v_label, '')), '') is null
     or not exists (
       select 1
       from jsonb_array_elements(p_node) value
       where jsonb_typeof(value) = 'object'
         and value->>'kind' = 'application_component'
     ) then
    raise exception 'Malformed requirement array is not a recognized legacy application-component tuple: %', p_node
      using errcode = '23514';
  end if;

  v_label := btrim(v_label);

  return jsonb_build_object(
    'id', 'application-component-legacy-' || substr(md5(v_label || ':' || p_ordinal::text), 1, 16),
    'kind', 'application_component',
    'componentType', ariadne_internal.application_component_type_from_label(v_label),
    'count', ariadne_internal.application_component_count_from_label(v_label),
    'details', '',
    'sourceText', v_label
  );
end;
$$;

-- Repair every legacy tuple currently present in the canonical requirement documents.
with repaired as (
  select
    c.id,
    jsonb_agg(
      case
        when jsonb_typeof(e.value) = 'array'
          then ariadne_internal.repair_legacy_application_component_tuple(e.value, e.ord)
        else e.value
      end
      order by e.ord
    ) as document
  from public.opportunity_candidates c
  cross join lateral jsonb_array_elements(coalesce(c.standardized_requirements, '[]'::jsonb))
    with ordinality as e(value, ord)
  where exists (
    select 1
    from jsonb_array_elements(coalesce(c.standardized_requirements, '[]'::jsonb)) bad
    where jsonb_typeof(bad) = 'array'
  )
  group by c.id
)
update public.opportunity_candidates c
set standardized_requirements = repaired.document,
    updated_at = now()
from repaired
where c.id = repaired.id;

with repaired as (
  select
    o.id,
    jsonb_agg(
      case
        when jsonb_typeof(e.value) = 'array'
          then ariadne_internal.repair_legacy_application_component_tuple(e.value, e.ord)
        else e.value
      end
      order by e.ord
    ) as document
  from public.opportunities o
  cross join lateral jsonb_array_elements(coalesce(o.standardized_requirements, '[]'::jsonb))
    with ordinality as e(value, ord)
  where exists (
    select 1
    from jsonb_array_elements(coalesce(o.standardized_requirements, '[]'::jsonb)) bad
    where jsonb_typeof(bad) = 'array'
  )
  group by o.id
)
update public.opportunities o
set standardized_requirements = repaired.document,
    updated_at = now()
from repaired
where o.id = repaired.id;

-- If a malformed tuple survived only in the denormalized application_components column,
-- repair it there as well. The sync trigger then rebuilds the canonical document.
with repaired as (
  select
    c.id,
    jsonb_agg(
      case
        when jsonb_typeof(e.value) = 'array'
          then ariadne_internal.repair_legacy_application_component_tuple(e.value, e.ord)
        else e.value
      end
      order by e.ord
    ) as components
  from public.opportunity_candidates c
  cross join lateral jsonb_array_elements(coalesce(c.application_components, '[]'::jsonb))
    with ordinality as e(value, ord)
  where exists (
    select 1
    from jsonb_array_elements(coalesce(c.application_components, '[]'::jsonb)) bad
    where jsonb_typeof(bad) = 'array'
  )
  group by c.id
)
update public.opportunity_candidates c
set application_components = repaired.components,
    updated_at = now()
from repaired
where c.id = repaired.id;

with repaired as (
  select
    o.id,
    jsonb_agg(
      case
        when jsonb_typeof(e.value) = 'array'
          then ariadne_internal.repair_legacy_application_component_tuple(e.value, e.ord)
        else e.value
      end
      order by e.ord
    ) as components
  from public.opportunities o
  cross join lateral jsonb_array_elements(coalesce(o.application_components, '[]'::jsonb))
    with ordinality as e(value, ord)
  where exists (
    select 1
    from jsonb_array_elements(coalesce(o.application_components, '[]'::jsonb)) bad
    where jsonb_typeof(bad) = 'array'
  )
  group by o.id
)
update public.opportunities o
set application_components = repaired.components,
    updated_at = now()
from repaired
where o.id = repaired.id;

-- Repair the three consequential candidates exposed by the 2026-09-20 review run.
update public.opportunity_candidates
set
  raw_requirements_text = '2:1 relevant degree; strong quantitative background with linear algebra, calculus, probability, statistics and coding.',
  application_components = jsonb_build_array(
    jsonb_build_object('id','imperial-aep-cv','kind','application_component','componentType','cv_resume','count',1,'details','','sourceText','CV'),
    jsonb_build_object('id','imperial-aep-personal-statement','kind','application_component','componentType','other','count',1,'details','Personal statement questions','sourceText','personal statement questions'),
    jsonb_build_object('id','imperial-aep-transcripts','kind','application_component','componentType','transcript','count',1,'details','','sourceText','degree transcripts'),
    jsonb_build_object('id','imperial-aep-referees','kind','application_component','componentType','references','count',2,'details','','sourceText','two referees'),
    jsonb_build_object('id','imperial-aep-assessment','kind','application_component','componentType','other','count',1,'details','Admissions assessment','sourceText','admissions assessment')
  ),
  standardized_requirements = jsonb_build_array(
    jsonb_build_object(
      'id','imperial-aep-completed-education','kind','requirement','type','completed_education',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'level','bachelors','operator','at_least','sourceText','2:1 relevant degree'
    ),
    jsonb_build_object(
      'id','imperial-aep-academic-performance','kind','requirement','type','academic_performance',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'gradingSystem','UK_HONOURS','threshold','2:1','operator','at_least','equivalentAllowed',true,
      'sourceText','2:1 relevant degree'
    ),
    jsonb_build_object(
      'id','imperial-aep-degree-subject','kind','requirement','type','degree_subject',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'subjects',jsonb_build_array('relevant degree'),'matchMode','any_of','sourceText','2:1 relevant degree'
    ),
    jsonb_build_object(
      'id','imperial-aep-quantitative-background','kind','requirement','type','quantitative_ability',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'areas',jsonb_build_array('linear algebra','calculus','probability','statistics'),'minimumLevel','',
      'sourceText','strong quantitative background with linear algebra, calculus, probability, statistics'
    ),
    jsonb_build_object(
      'id','imperial-aep-coding','kind','requirement','type','technical_skill',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'skill','coding','minimumLevel','','evidenceRequired',false,'sourceText','coding'
    ),
    jsonb_build_object('id','requirements-source','kind','source_text','rawText','2:1 relevant degree; strong quantitative background with linear algebra, calculus, probability, statistics and coding.')
  ),
  updated_at = now()
where id = 'opportunity-candidate-scout-20260920-01'
  and review_status = 'pending';

update public.opportunity_candidates
set
  raw_requirements_text = 'Undergraduate degree candidate; office-specific requirements may apply.',
  application_components = jsonb_build_array(
    jsonb_build_object('id','mck-ba-application','kind','application_component','componentType','application_form','count',1,'details','','sourceText','online application'),
    jsonb_build_object('id','mck-ba-cv','kind','application_component','componentType','cv_resume','count',1,'details','','sourceText','CV/resume'),
    jsonb_build_object('id','mck-ba-academic-info','kind','application_component','componentType','other','count',1,'details','Academic information','sourceText','academic information'),
    jsonb_build_object('id','mck-ba-interview','kind','application_component','componentType','other','count',1,'details','Interview process','sourceText','interview process')
  ),
  standardized_requirements = jsonb_build_array(
    jsonb_build_object(
      'id','mck-ba-undergraduate-status','kind','requirement','type','current_education',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'level','undergraduate','status','currently_enrolled','sourceText','Undergraduate degree candidate'
    ),
    jsonb_build_object('id','requirements-source','kind','source_text','rawText','Undergraduate degree candidate; office-specific requirements may apply.')
  ),
  updated_at = now()
where id = 'opportunity-candidate-scout-20260920-03'
  and review_status = 'pending';

update public.opportunity_candidates
set
  raw_requirements_text = 'Advanced degree; no more than 3 years relevant experience; Portuguese and English fluency; travel flexibility.',
  application_components = jsonb_build_array(
    jsonb_build_object('id','mck-techai-application','kind','application_component','componentType','application_form','count',1,'details','','sourceText','online application'),
    jsonb_build_object('id','mck-techai-cv','kind','application_component','componentType','cv_resume','count',1,'details','','sourceText','CV/resume'),
    jsonb_build_object('id','mck-techai-record','kind','application_component','componentType','other','count',1,'details','Academic and professional record','sourceText','academic and professional record'),
    jsonb_build_object('id','mck-techai-interview','kind','application_component','componentType','other','count',1,'details','Interview process','sourceText','interview process')
  ),
  standardized_requirements = jsonb_build_array(
    jsonb_build_object(
      'id','mck-techai-advanced-degree','kind','requirement','type','completed_education',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'level','masters','operator','at_least','sourceText','Advanced degree'
    ),
    jsonb_build_object(
      'id','mck-techai-experience-cap','kind','requirement','type','professional_experience',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'minYears',null,'maxYears',3,'careerStage','early_career','experienceArea','relevant experience',
      'sourceText','no more than 3 years relevant experience'
    ),
    jsonb_build_object(
      'id','mck-techai-portuguese','kind','requirement','type','language_proficiency',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'language','Portuguese','minimumLevel','','framework','','skillScope','general','rawLevel','fluency',
      'sourceText','Portuguese fluency'
    ),
    jsonb_build_object(
      'id','mck-techai-english','kind','requirement','type','language_proficiency',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','application_date',
      'language','English','minimumLevel','','framework','','skillScope','general','rawLevel','fluency',
      'sourceText','English fluency'
    ),
    jsonb_build_object(
      'id','mck-techai-travel','kind','requirement','type','travel_requirement',
      'necessity','hard_requirement','requirementState','constraint','evaluationTime','throughout_programme',
      'destination','','frequency','flexibility required','minimumTrips',null,
      'sourceText','travel flexibility'
    ),
    jsonb_build_object('id','requirements-source','kind','source_text','rawText','Advanced degree; no more than 3 years relevant experience; Portuguese and English fluency; travel flexibility.')
  ),
  updated_at = now()
where id = 'opportunity-candidate-scout-20260920-04'
  and review_status = 'pending';

-- Structural assertion intentionally remains tolerant of historical requirement type vocabularies,
-- but rejects non-object nodes and malformed application components.
create or replace function ariadne_internal.assert_requirement_document_integrity(
  p_document jsonb,
  p_application_components jsonb default '[]'::jsonb
)
returns void
language plpgsql
stable
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_item jsonb;
  v_component_type text;
begin
  if p_document is null or jsonb_typeof(p_document) <> 'array' then
    raise exception 'Standardized requirements must be a JSON array' using errcode = '23514';
  end if;
  if p_application_components is null or jsonb_typeof(p_application_components) <> 'array' then
    raise exception 'Application components must be a JSON array' using errcode = '23514';
  end if;

  for v_item in select value from jsonb_array_elements(p_document)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Every standardized requirement node must be a JSON object; legacy tuple/array nodes are not allowed'
        using errcode = '23514';
    end if;

    if lower(coalesce(v_item->>'kind','')) = 'application_component' then
      if nullif(btrim(coalesce(v_item->>'id','')), '') is null then
        raise exception 'Application component id is required' using errcode = '23514';
      end if;
      v_component_type := coalesce(v_item->>'componentType', v_item->>'component_type', '');
      if v_component_type not in (
        'cv_resume','cover_letter','references','writing_sample','research_proposal',
        'abstract','transcript','portfolio','screencast','application_form','other'
      ) then
        raise exception 'Invalid application component type: %', v_component_type using errcode = '23514';
      end if;
    end if;

    if lower(coalesce(v_item->>'kind','')) = 'group' and v_item ? 'children' then
      if jsonb_typeof(v_item->'children') <> 'array' then
        raise exception 'Requirement group children must be a JSON array' using errcode = '23514';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_item->'children') child
        where jsonb_typeof(child) <> 'object'
      ) then
        raise exception 'Requirement group children must be JSON objects' using errcode = '23514';
      end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_application_components)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Every application component must be a JSON object' using errcode = '23514';
    end if;
    if lower(coalesce(v_item->>'kind','')) <> 'application_component' then
      raise exception 'Application component rows must have kind application_component' using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(v_item->>'id','')), '') is null then
      raise exception 'Application component id is required' using errcode = '23514';
    end if;
    v_component_type := coalesce(v_item->>'componentType', v_item->>'component_type', '');
    if v_component_type not in (
      'cv_resume','cover_letter','references','writing_sample','research_proposal',
      'abstract','transcript','portfolio','screencast','application_form','other'
    ) then
      raise exception 'Invalid application component type: %', v_component_type using errcode = '23514';
    end if;
  end loop;
end;
$$;

create or replace function public.sync_opportunity_requirement_metadata()
returns trigger
language plpgsql
set search_path = public, ariadne_internal
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
  perform ariadne_internal.assert_requirement_document_integrity(
    doc,
    coalesce(new.application_components, '[]'::jsonb)
  );

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

  perform ariadne_internal.assert_requirement_document_integrity(
    doc,
    coalesce(resolved_components, '[]'::jsonb)
  );

  new.raw_requirements_text := nullif(trim(coalesce(resolved_raw, '')), '');
  new.application_components := resolved_components;
  new.standardized_requirements := criteria || resolved_components || jsonb_build_array(
    jsonb_build_object('id', 'requirements-source', 'kind', 'source_text', 'rawText', coalesce(resolved_raw, ''))
  );

  perform ariadne_internal.assert_requirement_document_integrity(
    new.standardized_requirements,
    new.application_components
  );

  return new;
end;
$$;

-- Preserve raw source wording and application components explicitly during candidate promotion.
create or replace function ariadne_internal.accept_opportunity_candidate_for_user(
  p_user_id uuid,
  p_candidate_id text,
  p_opportunity_id text,
  p_title text,
  p_type text,
  p_organization text,
  p_url text,
  p_description text,
  p_requirements text,
  p_deadline date,
  p_start_date date,
  p_standardized_requirements jsonb,
  p_misc_requirements text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  candidate_row public.opportunity_candidates%rowtype;
  opportunity_row public.opportunities%rowtype;
  normalized_structured jsonb := coalesce(p_standardized_requirements, '[]'::jsonb);
  normalized_misc text := nullif(trim(coalesce(p_misc_requirements, p_requirements, '')), '');
  resolved_components jsonb := '[]'::jsonb;
  resolved_raw text;
begin
  if p_user_id is null then
    raise exception 'Owner user id is required' using errcode = '22023';
  end if;

  p_candidate_id := btrim(coalesce(p_candidate_id, ''));
  p_opportunity_id := btrim(coalesce(p_opportunity_id, ''));

  if p_candidate_id = '' then
    raise exception 'Opportunity candidate id is required' using errcode = '22023';
  end if;
  if p_opportunity_id = '' then
    raise exception 'Opportunity id is required' using errcode = '22023';
  end if;

  select *
  into candidate_row
  from public.opportunity_candidates
  where id = p_candidate_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Opportunity candidate not found' using errcode = 'P0002';
  end if;

  if candidate_row.review_status = 'accepted'
     and candidate_row.matched_opportunity_id is not null then
    select *
    into opportunity_row
    from public.opportunities
    where id = candidate_row.matched_opportunity_id
      and user_id = p_user_id;

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

  perform ariadne_internal.assert_requirement_document_integrity(
    normalized_structured,
    candidate_row.application_components
  );

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into resolved_components
  from jsonb_array_elements(normalized_structured) item
  where item->>'kind' = 'application_component';

  if jsonb_array_length(resolved_components) = 0 then
    resolved_components := coalesce(candidate_row.application_components, '[]'::jsonb);
  end if;

  select coalesce(item->>'rawText', item->>'raw_text')
  into resolved_raw
  from jsonb_array_elements(normalized_structured) item
  where item->>'kind' = 'source_text'
  limit 1;

  resolved_raw := coalesce(resolved_raw, candidate_row.raw_requirements_text);

  perform ariadne_internal.assert_requirement_document_integrity(
    normalized_structured,
    resolved_components
  );

  insert into public.opportunities (
    id,
    user_id,
    title,
    type,
    organization,
    url,
    description,
    requirements,
    standardized_requirements,
    misc_requirements,
    raw_requirements_text,
    application_components,
    deadline,
    start_date,
    archived
  )
  values (
    p_opportunity_id,
    p_user_id,
    trim(p_title),
    p_type,
    nullif(trim(coalesce(p_organization, '')), ''),
    nullif(trim(coalesce(p_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    normalized_misc,
    normalized_structured,
    normalized_misc,
    resolved_raw,
    resolved_components,
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
    standardized_requirements = opportunity_row.standardized_requirements,
    misc_requirements = opportunity_row.misc_requirements,
    raw_requirements_text = opportunity_row.raw_requirements_text,
    application_components = opportunity_row.application_components,
    deadline = opportunity_row.deadline,
    start_date = opportunity_row.start_date,
    review_status = 'accepted',
    rejection_reason = null,
    matched_opportunity_id = opportunity_row.id
  where id = candidate_row.id
    and user_id = p_user_id
  returning * into candidate_row;

  return jsonb_build_object(
    'candidate', to_jsonb(candidate_row),
    'opportunity', to_jsonb(opportunity_row)
  );
end;
$$;

comment on function ariadne_internal.assert_requirement_document_integrity(jsonb, jsonb)
is 'Rejects malformed requirement-document shapes while remaining tolerant of historical requirement type vocabularies.';

comment on function ariadne_internal.repair_legacy_application_component_tuple(jsonb, bigint)
is 'Converts historical [label,{kind:application_component}] tuples into canonical application_component objects.';
