-- Normalize legacy object-shaped application components at the write boundary.
-- This preserves backwards compatibility with older control-surface payloads while
-- continuing to reject tuple/array nodes.

create or replace function ariadne_internal.normalize_application_component_object(
  p_node jsonb,
  p_ordinal bigint
)
returns jsonb
language plpgsql
immutable
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_source_text text;
  v_details text;
  v_component_type text;
  v_id text;
  v_count integer;
begin
  if jsonb_typeof(p_node) <> 'object'
     or lower(coalesce(p_node->>'kind', '')) <> 'application_component' then
    return p_node;
  end if;

  v_source_text := nullif(btrim(coalesce(
    p_node->>'sourceText',
    p_node->>'source_text',
    p_node->>'label',
    p_node->>'details',
    ''
  )), '');
  v_details := nullif(btrim(coalesce(p_node->>'details', p_node->>'label', '')), '');
  v_component_type := coalesce(p_node->>'componentType', p_node->>'component_type', '');

  if v_component_type not in (
    'cv_resume','cover_letter','references','writing_sample','research_proposal',
    'abstract','transcript','portfolio','screencast','application_form','other'
  ) then
    v_component_type := ariadne_internal.application_component_type_from_label(
      coalesce(v_source_text, v_details, '')
    );
  end if;

  v_id := nullif(btrim(coalesce(p_node->>'id', '')), '');
  if v_id is null then
    v_id := 'application-component-normalized-' ||
      substr(md5(coalesce(v_source_text, v_details, v_component_type, '') || ':' || p_ordinal::text), 1, 16);
  end if;

  begin
    v_count := greatest(1, coalesce((p_node->>'count')::integer, 1));
  exception when others then
    v_count := ariadne_internal.application_component_count_from_label(
      coalesce(v_source_text, v_details, '')
    );
  end;

  return jsonb_build_object(
    'id', v_id,
    'kind', 'application_component',
    'componentType', v_component_type,
    'count', v_count,
    'details', coalesce(v_details, ''),
    'sourceText', coalesce(v_source_text, '')
  );
end;
$$;

create or replace function public.sync_opportunity_requirement_metadata()
returns trigger
language plpgsql
set search_path = public, ariadne_internal
as $$
declare
  doc jsonb := coalesce(new.standardized_requirements, '[]'::jsonb);
  input_components jsonb := coalesce(new.application_components, '[]'::jsonb);
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
  if jsonb_typeof(input_components) <> 'array' then
    raise exception 'Application components must be a JSON array' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(item.value) = 'object'
       and lower(coalesce(item.value->>'kind', '')) = 'application_component'
        then ariadne_internal.normalize_application_component_object(item.value, item.ord)
      else item.value
    end
    order by item.ord
  ), '[]'::jsonb)
  into doc
  from jsonb_array_elements(doc) with ordinality as item(value, ord);

  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(item.value) = 'object'
        then ariadne_internal.normalize_application_component_object(item.value, item.ord)
      else item.value
    end
    order by item.ord
  ), '[]'::jsonb)
  into input_components
  from jsonb_array_elements(input_components) with ordinality as item(value, ord);

  perform ariadne_internal.assert_requirement_document_integrity(doc, input_components);

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
      resolved_components := input_components;
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
      resolved_components := input_components;
    elsif new.standardized_requirements is distinct from old.standardized_requirements then
      resolved_components := document_components;
    else
      resolved_components := coalesce(old.application_components, document_components, '[]'::jsonb);
    end if;
  end if;

  -- Old rows may supply canonical components only through OLD during an unrelated update.
  select coalesce(jsonb_agg(
    ariadne_internal.normalize_application_component_object(item.value, item.ord)
    order by item.ord
  ), '[]'::jsonb)
  into resolved_components
  from jsonb_array_elements(coalesce(resolved_components, '[]'::jsonb))
    with ordinality as item(value, ord);

  perform ariadne_internal.assert_requirement_document_integrity(doc, resolved_components);

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

comment on function ariadne_internal.normalize_application_component_object(jsonb, bigint)
is 'Normalizes legacy object-shaped application components into the canonical application_component schema.';
