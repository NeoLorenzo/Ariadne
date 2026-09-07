-- Issue #19 follow-up: preserve lost-response idempotency for direction creates issued by
-- a pre-#19 browser tab, which does not send the new position/vector_ids fields.

create or replace function public.create_direction_semantic(direction_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_direction public.directions%rowtype;
  v_id text;
  v_title text;
  v_statement text;
  v_status text;
  v_is_active boolean;
  v_position integer;
  v_created_at timestamptz;
  v_vector_ids text[] := array[]::text[];
  v_existing_vectors text[] := array[]::text[];
  v_has_vector_ids boolean;
  v_has_position boolean;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  if direction_record is null or jsonb_typeof(direction_record) <> 'object' then
    raise exception 'direction_record must be a JSON object';
  end if;

  v_id := btrim(coalesce(direction_record->>'id', ''));
  v_title := btrim(coalesce(direction_record->>'title', ''));
  v_statement := btrim(coalesce(direction_record->>'statement', ''));
  v_status := case
    when direction_record ? 'status' then btrim(coalesce(direction_record->>'status', ''))
    when direction_record ? 'is_active' then case when (direction_record->>'is_active')::boolean then 'active' else 'paused' end
    else 'active'
  end;
  v_is_active := v_status = 'active';
  v_has_position := direction_record ? 'position';
  v_position := case
    when v_has_position then (direction_record->>'position')::integer
    else null
  end;
  v_created_at := coalesce(nullif(direction_record->>'created_at', '')::timestamptz, clock_timestamp());
  v_has_vector_ids := direction_record ? 'vector_ids';

  if v_id = '' or v_title = '' or v_statement = '' then
    raise exception 'Direction id, title and statement are required';
  end if;
  if v_status not in ('active', 'paused', 'archived') then
    raise exception 'Unsupported direction status: %', v_status;
  end if;
  if v_has_position and v_position < 0 then
    raise exception 'Direction position must be non-negative';
  end if;

  if v_has_vector_ids then
    v_vector_ids := ariadne_internal.normalize_direction_vector_ids(direction_record->'vector_ids');
    if cardinality(v_vector_ids) = 0 then
      raise exception 'A direction must influence at least one vector';
    end if;
  end if;

  select * into v_direction
  from public.directions
  where id = v_id
  for update;

  if found then
    v_existing_vectors := ariadne_internal.direction_vector_ids(v_direction.id);
    if v_direction.user_id = v_user_id
      and v_direction.title is not distinct from v_title
      and v_direction.statement is not distinct from v_statement
      and v_direction.status is not distinct from v_status
      and (not v_has_position or v_direction.position is not distinct from v_position)
      and (not v_has_vector_ids or v_existing_vectors is not distinct from v_vector_ids) then
      return (to_jsonb(v_direction) - 'user_id')
        || jsonb_build_object('vector_ids', to_jsonb(v_existing_vectors));
    end if;
    perform ariadne_internal.raise_strategy_sync_conflict('direction', v_id, v_direction.updated_at);
  end if;

  if not v_has_position then
    select coalesce(max(position) + 1, 0)
    into v_position
    from public.directions
    where user_id = v_user_id;
  end if;

  insert into public.directions(
    id, user_id, title, statement, status, position, is_active, created_at, updated_at
  ) values (
    v_id, v_user_id, v_title, v_statement, v_status, v_position, v_is_active, v_created_at, clock_timestamp()
  ) returning * into v_direction;

  if v_has_vector_ids then
    insert into public.direction_vector_links(direction_id, vector_id)
    select v_direction.id, vector_id
    from unnest(v_vector_ids) as vector_id;
  end if;

  return (to_jsonb(v_direction) - 'user_id')
    || jsonb_build_object('vector_ids', to_jsonb(v_vector_ids));
end;
$$;
