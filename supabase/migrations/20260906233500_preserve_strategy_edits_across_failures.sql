-- Harden Ariadne's local-first strategy writes.
--
-- Browser repositories persist intent locally before calling these operations. Every RPC is
-- transactional and idempotent enough to retry after a lost response. Existing-row writes use
-- the client's last observed updated_at as an optimistic-concurrency boundary; a newer remote
-- row raises STRATEGY_SYNC_CONFLICT instead of silently overwriting another session.

create schema if not exists ariadne_internal;

create or replace function ariadne_internal.raise_strategy_sync_conflict(
  p_entity_type text,
  p_entity_id text,
  p_actual_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
begin
  raise exception 'STRATEGY_SYNC_CONFLICT'
    using errcode = '40001',
      detail = jsonb_build_object(
        'entity_type', p_entity_type,
        'entity_id', p_entity_id,
        'updated_at', p_actual_updated_at
      )::text;
end;
$$;

create or replace function ariadne_internal.apply_direction_update_checked(
  p_user_id uuid,
  p_direction_id text,
  p_patch jsonb,
  p_change_reason text default null,
  p_revision_id text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_direction public.directions%rowtype;
  v_title text;
  v_statement text;
  v_is_active boolean;
  v_bad_key text;
  v_meaningful boolean;
  v_revision_id text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a JSON object';
  end if;

  select key into v_bad_key
  from jsonb_object_keys(p_patch) key
  where key not in ('title', 'statement', 'is_active')
  limit 1;
  if v_bad_key is not null then
    raise exception 'Unsupported direction field: %', v_bad_key;
  end if;

  select * into v_direction
  from public.directions
  where id = p_direction_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Direction % not found', p_direction_id;
  end if;

  v_title := case when p_patch ? 'title' then btrim(coalesce(p_patch->>'title', '')) else v_direction.title end;
  v_statement := case when p_patch ? 'statement' then btrim(coalesce(p_patch->>'statement', '')) else v_direction.statement end;
  v_is_active := case when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean else v_direction.is_active end;

  if v_title = '' then raise exception 'Direction title cannot be empty'; end if;
  if v_statement = '' then raise exception 'Direction statement cannot be empty'; end if;

  -- Lost-response retry: if the desired state is already committed, treat the operation as done
  -- before checking the stale expected timestamp. The original transaction already wrote history.
  if v_title is not distinct from v_direction.title
    and v_statement is not distinct from v_direction.statement
    and v_is_active is not distinct from v_direction.is_active then
    return to_jsonb(v_direction) - 'user_id';
  end if;

  if p_expected_updated_at is not null
    and v_direction.updated_at is distinct from p_expected_updated_at then
    perform ariadne_internal.raise_strategy_sync_conflict('direction', p_direction_id, v_direction.updated_at);
  end if;

  v_meaningful := v_title is distinct from v_direction.title
    or v_statement is distinct from v_direction.statement;
  if v_meaningful and btrim(coalesce(p_change_reason, '')) = '' then
    raise exception 'REVISION_REASON_REQUIRED';
  end if;

  if v_meaningful then
    v_revision_id := coalesce(
      nullif(btrim(coalesce(p_revision_id, '')), ''),
      'direction-revision-' || gen_random_uuid()::text
    );
    insert into public.direction_revisions(
      id, user_id, direction_id, title, statement, change_reason
    ) values (
      v_revision_id, p_user_id, v_direction.id, v_direction.title, v_direction.statement, btrim(p_change_reason)
    ) on conflict (id) do nothing;
  end if;

  update public.directions
  set title = v_title,
      statement = v_statement,
      is_active = v_is_active,
      updated_at = clock_timestamp()
  where id = v_direction.id
  returning * into v_direction;

  return to_jsonb(v_direction) - 'user_id';
end;
$$;

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
  v_is_active boolean;
  v_created_at timestamptz;
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
  v_is_active := coalesce((direction_record->>'is_active')::boolean, true);
  v_created_at := coalesce(nullif(direction_record->>'created_at', '')::timestamptz, clock_timestamp());
  if v_id = '' or v_title = '' or v_statement = '' then
    raise exception 'Direction id, title and statement are required';
  end if;

  select * into v_direction from public.directions where id = v_id for update;
  if found then
    if v_direction.user_id = v_user_id
      and v_direction.title is not distinct from v_title
      and v_direction.statement is not distinct from v_statement
      and v_direction.is_active is not distinct from v_is_active then
      return to_jsonb(v_direction) - 'user_id';
    end if;
    perform ariadne_internal.raise_strategy_sync_conflict('direction', v_id, v_direction.updated_at);
  end if;

  insert into public.directions(id, user_id, title, statement, is_active, created_at, updated_at)
  values (v_id, v_user_id, v_title, v_statement, v_is_active, v_created_at, clock_timestamp())
  returning * into v_direction;
  return to_jsonb(v_direction) - 'user_id';
end;
$$;

drop function if exists public.update_direction_semantic(text, jsonb, text);
drop function if exists public.update_direction_semantic(text, jsonb, text, text, timestamptz);
create function public.update_direction_semantic(
  direction_id text,
  patch jsonb,
  change_reason text default null,
  revision_id text default null,
  expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  return ariadne_internal.apply_direction_update_checked(
    auth.uid(), direction_id, patch, change_reason, revision_id, expected_updated_at
  );
end;
$$;

create or replace function public.save_strategic_objective_semantic(
  objective_record jsonb,
  expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_objective public.strategic_objectives%rowtype;
  v_id text;
  v_direction_id text;
  v_title text;
  v_description text;
  v_success_condition text;
  v_status text;
  v_position integer;
  v_created_at timestamptz;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  if objective_record is null or jsonb_typeof(objective_record) <> 'object' then
    raise exception 'objective_record must be a JSON object';
  end if;

  v_id := btrim(coalesce(objective_record->>'id', ''));
  v_direction_id := btrim(coalesce(objective_record->>'direction_id', ''));
  v_title := btrim(coalesce(objective_record->>'title', ''));
  v_description := coalesce(objective_record->>'description', '');
  v_success_condition := btrim(coalesce(objective_record->>'success_condition', ''));
  v_status := coalesce(nullif(objective_record->>'status', ''), 'active');
  v_position := coalesce((objective_record->>'position')::integer, 0);
  v_created_at := coalesce(nullif(objective_record->>'created_at', '')::timestamptz, clock_timestamp());

  if v_id = '' or v_direction_id = '' or v_title = '' or v_success_condition = '' then
    raise exception 'Objective id, direction, title and success condition are required';
  end if;
  if not exists (
    select 1 from public.directions where id = v_direction_id and user_id = v_user_id
  ) then
    raise exception 'Strategic objective must belong to the user direction';
  end if;

  select * into v_objective
  from public.strategic_objectives
  where id = v_id
  for update;

  if found then
    if v_objective.user_id <> v_user_id then
      perform ariadne_internal.raise_strategy_sync_conflict('strategic-objective', v_id, v_objective.updated_at);
    end if;

    if v_objective.direction_id is not distinct from v_direction_id
      and v_objective.title is not distinct from v_title
      and coalesce(v_objective.description, '') is not distinct from v_description
      and v_objective.success_condition is not distinct from v_success_condition
      and v_objective.status is not distinct from v_status
      and v_objective.position is not distinct from v_position then
      return to_jsonb(v_objective) - 'user_id';
    end if;

    if expected_updated_at is not null
      and v_objective.updated_at is distinct from expected_updated_at then
      perform ariadne_internal.raise_strategy_sync_conflict('strategic-objective', v_id, v_objective.updated_at);
    end if;

    update public.strategic_objectives
    set direction_id = v_direction_id,
        title = v_title,
        description = nullif(v_description, ''),
        success_condition = v_success_condition,
        status = v_status,
        position = v_position,
        updated_at = clock_timestamp()
    where id = v_id
    returning * into v_objective;
  else
    insert into public.strategic_objectives(
      id, user_id, direction_id, title, description, success_condition, status, position, created_at, updated_at
    ) values (
      v_id, v_user_id, v_direction_id, v_title, nullif(v_description, ''), v_success_condition,
      v_status, v_position, v_created_at, clock_timestamp()
    ) returning * into v_objective;
  end if;

  return to_jsonb(v_objective) - 'user_id';
end;
$$;

create or replace function public.delete_strategic_objective_semantic(
  objective_id text,
  expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_objective public.strategic_objectives%rowtype;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;

  select * into v_objective
  from public.strategic_objectives
  where id = objective_id and user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('id', objective_id, 'deleted', true);
  end if;

  if expected_updated_at is not null
    and v_objective.updated_at is distinct from expected_updated_at then
    perform ariadne_internal.raise_strategy_sync_conflict('strategic-objective', objective_id, v_objective.updated_at);
  end if;

  delete from public.strategic_objectives
  where id = objective_id and user_id = v_user_id;
  return jsonb_build_object('id', objective_id, 'deleted', true);
end;
$$;

create or replace function public.reorder_strategic_objectives_semantic(
  direction_id text,
  positions jsonb,
  expected_updated_at_by_id jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_id text;
  v_position_text text;
  v_position integer;
  v_expected text;
  v_objective public.strategic_objectives%rowtype;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  if positions is null or jsonb_typeof(positions) <> 'object' then
    raise exception 'positions must be a JSON object';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || direction_id, 0));

  for v_id, v_position_text in select key, value from jsonb_each_text(positions) loop
    v_position := v_position_text::integer;
    if v_position < 0 then raise exception 'Objective position must be non-negative'; end if;

    select * into v_objective
    from public.strategic_objectives
    where id = v_id and user_id = v_user_id and direction_id = reorder_strategic_objectives_semantic.direction_id
    for update;
    if not found then raise exception 'Strategic objective % not found in direction', v_id; end if;

    if v_objective.position is distinct from v_position then
      v_expected := expected_updated_at_by_id->>v_id;
      if nullif(v_expected, '') is not null
        and v_objective.updated_at is distinct from v_expected::timestamptz then
        perform ariadne_internal.raise_strategy_sync_conflict('strategic-objective', v_id, v_objective.updated_at);
      end if;
    end if;
  end loop;

  for v_id, v_position_text in select key, value from jsonb_each_text(positions) loop
    v_position := v_position_text::integer;
    update public.strategic_objectives
    set position = v_position,
        updated_at = case when position is distinct from v_position then v_now else updated_at end
    where id = v_id and user_id = v_user_id and direction_id = reorder_strategic_objectives_semantic.direction_id;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', so.id, 'position', so.position, 'updated_at', so.updated_at
  ) order by so.position), '[]'::jsonb)
  into v_result
  from public.strategic_objectives so
  where so.user_id = v_user_id
    and so.direction_id = reorder_strategic_objectives_semantic.direction_id
    and positions ? so.id;

  return v_result;
end;
$$;

create or replace function public.create_outcome_goal_semantic(goal_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal public.outcome_goals%rowtype;
  v_id text;
  v_objective_id text;
  v_title text;
  v_description text;
  v_metric_type text;
  v_current_value numeric;
  v_target_value numeric;
  v_bare_minimum numeric;
  v_display boolean;
  v_start_date date;
  v_target_date date;
  v_status text;
  v_position integer;
  v_created_at timestamptz;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  if goal_record is null or jsonb_typeof(goal_record) <> 'object' then
    raise exception 'goal_record must be a JSON object';
  end if;

  v_id := btrim(coalesce(goal_record->>'id', ''));
  v_objective_id := btrim(coalesce(goal_record->>'strategic_objective_id', ''));
  v_title := btrim(coalesce(goal_record->>'title', ''));
  v_description := coalesce(goal_record->>'description', '');
  v_metric_type := coalesce(nullif(goal_record->>'metric_type', ''), 'count');
  v_current_value := coalesce((goal_record->>'current_value')::numeric, 0);
  v_target_value := (goal_record->>'target_value')::numeric;
  v_bare_minimum := coalesce((goal_record->>'bare_minimum')::numeric, 0);
  v_display := coalesce((goal_record->>'display_on_todo_list')::boolean, false);
  v_start_date := nullif(goal_record->>'start_date', '')::date;
  v_target_date := nullif(goal_record->>'target_date', '')::date;
  v_status := coalesce(nullif(goal_record->>'status', ''), 'active');
  v_position := coalesce((goal_record->>'position')::integer, 0);
  v_created_at := coalesce(nullif(goal_record->>'created_at', '')::timestamptz, clock_timestamp());

  if v_id = '' or v_objective_id = '' or v_title = '' then
    raise exception 'Goal id, strategic objective and title are required';
  end if;
  if not exists (
    select 1 from public.strategic_objectives where id = v_objective_id and user_id = v_user_id
  ) then
    raise exception 'Outcome goal must belong to the user strategic objective';
  end if;

  select * into v_goal from public.outcome_goals where id = v_id for update;
  if found then
    if v_goal.user_id = v_user_id
      and v_goal.strategic_objective_id is not distinct from v_objective_id
      and v_goal.title is not distinct from v_title
      and coalesce(v_goal.description, '') is not distinct from v_description
      and v_goal.metric_type is not distinct from v_metric_type
      and v_goal.current_value is not distinct from v_current_value
      and v_goal.target_value is not distinct from v_target_value
      and v_goal.bare_minimum is not distinct from v_bare_minimum
      and v_goal.display_on_todo_list is not distinct from v_display
      and v_goal.start_date is not distinct from v_start_date
      and v_goal.target_date is not distinct from v_target_date
      and v_goal.status is not distinct from v_status
      and v_goal.position is not distinct from v_position then
      perform ariadne_internal.sync_goal_linked_task(
        v_user_id, v_goal.id, v_goal.title, coalesce(v_goal.description, ''), v_goal.target_date, v_goal.display_on_todo_list
      );
      return to_jsonb(v_goal) - 'user_id';
    end if;
    perform ariadne_internal.raise_strategy_sync_conflict('outcome-goal', v_id, v_goal.updated_at);
  end if;

  insert into public.outcome_goals(
    id, user_id, strategic_objective_id, title, description, metric_type, current_value,
    target_value, bare_minimum, display_on_todo_list, start_date, target_date, status,
    position, created_at, updated_at
  ) values (
    v_id, v_user_id, v_objective_id, v_title, nullif(v_description, ''), v_metric_type, v_current_value,
    v_target_value, v_bare_minimum, v_display, v_start_date, v_target_date, v_status,
    v_position, v_created_at, clock_timestamp()
  ) returning * into v_goal;

  perform ariadne_internal.sync_goal_linked_task(
    v_user_id, v_goal.id, v_goal.title, coalesce(v_goal.description, ''), v_goal.target_date, v_goal.display_on_todo_list
  );
  return to_jsonb(v_goal) - 'user_id';
end;
$$;

create or replace function ariadne_internal.apply_outcome_goal_update_checked(
  p_user_id uuid,
  p_goal_id text,
  p_patch jsonb,
  p_change_reason text default null,
  p_revision_id text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_goal public.outcome_goals%rowtype;
  v_bad_key text;
  v_meaningful boolean;
  v_objective_id text;
  v_title text;
  v_description text;
  v_metric_type text;
  v_current_value numeric;
  v_target_value numeric;
  v_bare_minimum numeric;
  v_start_date date;
  v_target_date date;
  v_status text;
  v_position integer;
  v_display boolean;
  v_should_sync_task boolean;
  v_active_linked_task_exists boolean;
  v_revision_id text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a JSON object';
  end if;
  select key into v_bad_key from jsonb_object_keys(p_patch) key
  where key not in (
    'strategic_objective_id','title','description','metric_type','current_value','target_value',
    'start_date','target_date','status','position','bare_minimum','display_on_todo_list'
  ) limit 1;
  if v_bad_key is not null then raise exception 'Unsupported goal field: %', v_bad_key; end if;

  select * into v_goal
  from public.outcome_goals
  where id = p_goal_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Outcome goal % not found', p_goal_id; end if;

  v_objective_id := case when p_patch ? 'strategic_objective_id' then p_patch->>'strategic_objective_id' else v_goal.strategic_objective_id end;
  v_title := case when p_patch ? 'title' then btrim(coalesce(p_patch->>'title', '')) else v_goal.title end;
  v_description := case when p_patch ? 'description' then coalesce(p_patch->>'description', '') else coalesce(v_goal.description, '') end;
  v_metric_type := case when p_patch ? 'metric_type' then p_patch->>'metric_type' else v_goal.metric_type end;
  v_current_value := case when p_patch ? 'current_value' then (p_patch->>'current_value')::numeric else v_goal.current_value end;
  v_target_value := case when p_patch ? 'target_value' then (p_patch->>'target_value')::numeric else v_goal.target_value end;
  v_bare_minimum := case when p_patch ? 'bare_minimum' then (p_patch->>'bare_minimum')::numeric else v_goal.bare_minimum end;
  v_start_date := case when p_patch ? 'start_date' then nullif(p_patch->>'start_date', '')::date else v_goal.start_date end;
  v_target_date := case when p_patch ? 'target_date' then nullif(p_patch->>'target_date', '')::date else v_goal.target_date end;
  v_status := case when p_patch ? 'status' then p_patch->>'status' else v_goal.status end;
  v_position := case when p_patch ? 'position' then (p_patch->>'position')::integer else v_goal.position end;
  v_display := case when p_patch ? 'display_on_todo_list' then (p_patch->>'display_on_todo_list')::boolean else v_goal.display_on_todo_list end;

  if v_title = '' then raise exception 'Goal title cannot be empty'; end if;
  if not exists (
    select 1 from public.strategic_objectives where id = v_objective_id and user_id = p_user_id
  ) then raise exception 'Outcome goal must belong to the user strategic objective'; end if;

  select exists(
    select 1 from public.user_tasks ut, jsonb_array_elements(coalesce(ut.tasks, '[]'::jsonb)) task
    where ut.user_id = p_user_id
      and (task->>'id' = 'directional-goal-task-' || v_goal.id or task->>'sourceGoalId' = v_goal.id)
      and coalesce(task->>'deleted', 'false') <> 'true'
  ) into v_active_linked_task_exists;

  if v_objective_id is not distinct from v_goal.strategic_objective_id
    and v_title is not distinct from v_goal.title
    and v_description is not distinct from coalesce(v_goal.description, '')
    and v_metric_type is not distinct from v_goal.metric_type
    and v_current_value is not distinct from v_goal.current_value
    and v_target_value is not distinct from v_goal.target_value
    and v_bare_minimum is not distinct from v_goal.bare_minimum
    and v_start_date is not distinct from v_goal.start_date
    and v_target_date is not distinct from v_goal.target_date
    and v_status is not distinct from v_goal.status
    and v_position is not distinct from v_goal.position
    and v_display is not distinct from v_goal.display_on_todo_list then
    if (v_display and not v_active_linked_task_exists) or (not v_display and v_active_linked_task_exists) then
      perform ariadne_internal.sync_goal_linked_task(
        p_user_id, v_goal.id, v_goal.title, coalesce(v_goal.description, ''), v_goal.target_date, v_goal.display_on_todo_list
      );
    end if;
    return to_jsonb(v_goal) - 'user_id';
  end if;

  if p_expected_updated_at is not null
    and v_goal.updated_at is distinct from p_expected_updated_at then
    perform ariadne_internal.raise_strategy_sync_conflict('outcome-goal', p_goal_id, v_goal.updated_at);
  end if;

  v_meaningful := v_title is distinct from v_goal.title
    or v_target_value is distinct from v_goal.target_value
    or v_bare_minimum is distinct from v_goal.bare_minimum
    or v_start_date is distinct from v_goal.start_date
    or v_target_date is distinct from v_goal.target_date;
  if v_meaningful and btrim(coalesce(p_change_reason, '')) = '' then
    raise exception 'REVISION_REASON_REQUIRED';
  end if;
  if v_meaningful then
    v_revision_id := coalesce(
      nullif(btrim(coalesce(p_revision_id, '')), ''),
      'outcome-goal-revision-' || gen_random_uuid()::text
    );
    insert into public.outcome_goal_revisions(
      id, user_id, outcome_goal_id, previous_title, previous_metric_type,
      previous_target_value, previous_bare_minimum, previous_start_date,
      previous_target_date, change_reason
    ) values (
      v_revision_id, p_user_id, v_goal.id, v_goal.title, v_goal.metric_type,
      v_goal.target_value, v_goal.bare_minimum, v_goal.start_date,
      v_goal.target_date, btrim(p_change_reason)
    ) on conflict (id) do nothing;
  end if;

  v_should_sync_task := v_display is distinct from v_goal.display_on_todo_list
    or (v_display and (
      v_title is distinct from v_goal.title
      or v_description is distinct from coalesce(v_goal.description, '')
      or v_target_date is distinct from v_goal.target_date
    ))
    or (v_display and not v_active_linked_task_exists)
    or (not v_display and v_active_linked_task_exists);

  update public.outcome_goals
  set strategic_objective_id = v_objective_id,
      title = v_title,
      description = nullif(v_description, ''),
      metric_type = v_metric_type,
      current_value = v_current_value,
      target_value = v_target_value,
      bare_minimum = v_bare_minimum,
      start_date = v_start_date,
      target_date = v_target_date,
      status = v_status,
      position = v_position,
      display_on_todo_list = v_display,
      updated_at = clock_timestamp()
  where id = v_goal.id
  returning * into v_goal;

  if v_should_sync_task then
    perform ariadne_internal.sync_goal_linked_task(
      p_user_id, v_goal.id, v_goal.title, coalesce(v_goal.description, ''), v_goal.target_date, v_goal.display_on_todo_list
    );
  end if;

  return to_jsonb(v_goal) - 'user_id';
end;
$$;

drop function if exists public.update_outcome_goal_semantic(text, jsonb, text);
drop function if exists public.update_outcome_goal_semantic(text, jsonb, text, text, timestamptz);
create function public.update_outcome_goal_semantic(
  goal_id text,
  patch jsonb,
  change_reason text default null,
  revision_id text default null,
  expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  return ariadne_internal.apply_outcome_goal_update_checked(
    auth.uid(), goal_id, patch, change_reason, revision_id, expected_updated_at
  );
end;
$$;

create or replace function public.delete_outcome_goal_semantic(
  goal_id text,
  expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal public.outcome_goals%rowtype;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;

  select * into v_goal
  from public.outcome_goals
  where id = goal_id and user_id = v_user_id
  for update;

  if found then
    if expected_updated_at is not null
      and v_goal.updated_at is distinct from expected_updated_at then
      perform ariadne_internal.raise_strategy_sync_conflict('outcome-goal', goal_id, v_goal.updated_at);
    end if;
    delete from public.outcome_goals where id = goal_id and user_id = v_user_id;
  end if;

  perform ariadne_internal.sync_goal_linked_task(v_user_id, goal_id, '', '', null, false);
  return jsonb_build_object('id', goal_id, 'deleted', true);
end;
$$;

create or replace function public.reorder_outcome_goals_semantic(
  objective_id text,
  positions jsonb,
  expected_updated_at_by_id jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_id text;
  v_position_text text;
  v_position integer;
  v_expected text;
  v_goal public.outcome_goals%rowtype;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  if positions is null or jsonb_typeof(positions) <> 'object' then
    raise exception 'positions must be a JSON object';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || objective_id, 0));

  for v_id, v_position_text in select key, value from jsonb_each_text(positions) loop
    v_position := v_position_text::integer;
    if v_position < 0 then raise exception 'Goal position must be non-negative'; end if;
    select * into v_goal
    from public.outcome_goals
    where id = v_id and user_id = v_user_id and strategic_objective_id = reorder_outcome_goals_semantic.objective_id
    for update;
    if not found then raise exception 'Outcome goal % not found in objective', v_id; end if;

    if v_goal.position is distinct from v_position then
      v_expected := expected_updated_at_by_id->>v_id;
      if nullif(v_expected, '') is not null
        and v_goal.updated_at is distinct from v_expected::timestamptz then
        perform ariadne_internal.raise_strategy_sync_conflict('outcome-goal', v_id, v_goal.updated_at);
      end if;
    end if;
  end loop;

  for v_id, v_position_text in select key, value from jsonb_each_text(positions) loop
    v_position := v_position_text::integer;
    update public.outcome_goals
    set position = v_position,
        updated_at = case when position is distinct from v_position then v_now else updated_at end
    where id = v_id and user_id = v_user_id and strategic_objective_id = reorder_outcome_goals_semantic.objective_id;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', og.id, 'position', og.position, 'updated_at', og.updated_at
  ) order by og.position), '[]'::jsonb)
  into v_result
  from public.outcome_goals og
  where og.user_id = v_user_id
    and og.strategic_objective_id = reorder_outcome_goals_semantic.objective_id
    and positions ? og.id;
  return v_result;
end;
$$;

create or replace function public.sync_outcome_goal_task_semantic(goal_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal public.outcome_goals%rowtype;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  select * into v_goal
  from public.outcome_goals
  where id = goal_id and user_id = v_user_id
  for update;
  if not found then raise exception 'Outcome goal % not found', goal_id; end if;

  perform ariadne_internal.sync_goal_linked_task(
    v_user_id, v_goal.id, v_goal.title, coalesce(v_goal.description, ''), v_goal.target_date, v_goal.display_on_todo_list
  );
  return jsonb_build_object('id', goal_id, 'synced', true);
end;
$$;

create or replace function public.delete_direction_revision_semantic(
  direction_id text,
  revision_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  delete from public.direction_revisions
  where id = revision_id and user_id = auth.uid() and direction_id = delete_direction_revision_semantic.direction_id;
  return jsonb_build_object('id', revision_id, 'deleted', true);
end;
$$;

create or replace function public.delete_outcome_goal_revision_semantic(
  goal_id text,
  revision_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  delete from public.outcome_goal_revisions
  where id = revision_id and user_id = auth.uid() and outcome_goal_id = delete_outcome_goal_revision_semantic.goal_id;
  return jsonb_build_object('id', revision_id, 'deleted', true);
end;
$$;

revoke all on function ariadne_internal.raise_strategy_sync_conflict(text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function ariadne_internal.apply_direction_update_checked(uuid, text, jsonb, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function ariadne_internal.apply_outcome_goal_update_checked(uuid, text, jsonb, text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function ariadne_internal.raise_strategy_sync_conflict(text, text, timestamptz) to postgres;
grant execute on function ariadne_internal.apply_direction_update_checked(uuid, text, jsonb, text, text, timestamptz) to postgres;
grant execute on function ariadne_internal.apply_outcome_goal_update_checked(uuid, text, jsonb, text, text, timestamptz) to postgres;

revoke all on function public.create_direction_semantic(jsonb) from public, anon, service_role;
revoke all on function public.update_direction_semantic(text, jsonb, text, text, timestamptz) from public, anon, service_role;
revoke all on function public.save_strategic_objective_semantic(jsonb, timestamptz) from public, anon, service_role;
revoke all on function public.delete_strategic_objective_semantic(text, timestamptz) from public, anon, service_role;
revoke all on function public.reorder_strategic_objectives_semantic(text, jsonb, jsonb) from public, anon, service_role;
revoke all on function public.create_outcome_goal_semantic(jsonb) from public, anon, service_role;
revoke all on function public.update_outcome_goal_semantic(text, jsonb, text, text, timestamptz) from public, anon, service_role;
revoke all on function public.delete_outcome_goal_semantic(text, timestamptz) from public, anon, service_role;
revoke all on function public.reorder_outcome_goals_semantic(text, jsonb, jsonb) from public, anon, service_role;
revoke all on function public.sync_outcome_goal_task_semantic(text) from public, anon, service_role;
revoke all on function public.delete_direction_revision_semantic(text, text) from public, anon, service_role;
revoke all on function public.delete_outcome_goal_revision_semantic(text, text) from public, anon, service_role;

grant execute on function public.create_direction_semantic(jsonb) to authenticated;
grant execute on function public.update_direction_semantic(text, jsonb, text, text, timestamptz) to authenticated;
grant execute on function public.save_strategic_objective_semantic(jsonb, timestamptz) to authenticated;
grant execute on function public.delete_strategic_objective_semantic(text, timestamptz) to authenticated;
grant execute on function public.reorder_strategic_objectives_semantic(text, jsonb, jsonb) to authenticated;
grant execute on function public.create_outcome_goal_semantic(jsonb) to authenticated;
grant execute on function public.update_outcome_goal_semantic(text, jsonb, text, text, timestamptz) to authenticated;
grant execute on function public.delete_outcome_goal_semantic(text, timestamptz) to authenticated;
grant execute on function public.reorder_outcome_goals_semantic(text, jsonb, jsonb) to authenticated;
grant execute on function public.sync_outcome_goal_task_semantic(text) to authenticated;
grant execute on function public.delete_direction_revision_semantic(text, text) to authenticated;
grant execute on function public.delete_outcome_goal_revision_semantic(text, text) to authenticated;
