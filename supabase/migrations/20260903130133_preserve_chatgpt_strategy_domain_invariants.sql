-- The production project already records this migration. Keep this repository copy
-- aligned with the deployed shared semantic operations; do not re-apply it there.
create schema if not exists ariadne_internal;

revoke all on schema ariadne_internal from public;
revoke all on schema ariadne_internal from anon;
revoke all on schema ariadne_internal from authenticated;
revoke all on schema ariadne_internal from service_role;
grant usage on schema ariadne_internal to postgres;

create or replace function ariadne_internal.sync_goal_linked_task(
  p_user_id uuid,
  p_goal_id text,
  p_title text,
  p_description text,
  p_target_date date,
  p_display_on_todo_list boolean
)
returns void
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_tasks jsonb;
  v_existing jsonb;
  v_task_id text := 'directional-goal-task-' || p_goal_id;
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_title text := btrim(coalesce(p_title, ''));
  v_resolved_title text;
  v_suffix integer := 1;
  v_linked_task jsonb;
begin
  select tasks into v_tasks
  from public.user_tasks
  where user_id = p_user_id
  for update;

  if not found then
    if not coalesce(p_display_on_todo_list, false) then return; end if;
    insert into public.user_tasks(user_id, tasks, version)
    values (p_user_id, '[]'::jsonb, 1)
    returning tasks into v_tasks;
  end if;

  v_tasks := coalesce(v_tasks, '[]'::jsonb);

  select task into v_existing
  from jsonb_array_elements(v_tasks) task
  where task->>'id' = v_task_id or task->>'sourceGoalId' = p_goal_id
  limit 1;

  if not coalesce(p_display_on_todo_list, false) then
    update public.user_tasks
    set tasks = coalesce((
      select jsonb_agg(
        case when task->>'id' = v_task_id or task->>'sourceGoalId' = p_goal_id
          then task || jsonb_build_object('deleted', true, 'deletedAt', v_now, 'updatedAt', v_now)
          else task
        end order by ord
      )
      from jsonb_array_elements(v_tasks) with ordinality as t(task, ord)
    ), '[]'::jsonb),
    version = version + 1,
    updated_at = now()
    where user_id = p_user_id;
    return;
  end if;

  if v_title = '' then v_title := 'Untitled goal'; end if;
  v_resolved_title := v_title;
  while exists (
    select 1
    from jsonb_array_elements(v_tasks) task
    where task->>'id' <> coalesce(v_existing->>'id', v_task_id)
      and coalesce(task->>'deleted', 'false') <> 'true'
      and lower(btrim(coalesce(task->>'title', ''))) = lower(v_resolved_title)
  ) loop
    v_resolved_title := v_title || ' (' || v_suffix || ')';
    v_suffix := v_suffix + 1;
  end loop;

  v_linked_task := coalesce(v_existing, '{}'::jsonb) || jsonb_build_object(
    'id', coalesce(v_existing->>'id', v_task_id),
    'completed', coalesce((v_existing->>'completed')::boolean, false),
    'title', v_resolved_title,
    'description', btrim(coalesce(p_description, '')),
    'dueDate', coalesce(p_target_date::text, ''),
    'dueTime', coalesce(v_existing->>'dueTime', ''),
    'priority', 1,
    'estimatedHours', coalesce(v_existing->>'estimatedHours', ''),
    'subtasks', coalesce(v_existing->'subtasks', '[]'::jsonb),
    'sourceType', 'directional-goal',
    'sourceGoalId', p_goal_id,
    'tags', jsonb_build_array('directional-goal'),
    'deleted', false,
    'deletedAt', 0,
    'createdAt', case when coalesce(v_existing->>'createdAt', '') ~ '^[0-9]+$'
      then (v_existing->>'createdAt')::bigint else v_now end,
    'updatedAt', v_now
  );

  update public.user_tasks
  set tasks = (
    select coalesce(jsonb_agg(task order by ord), '[]'::jsonb) || jsonb_build_array(v_linked_task)
    from jsonb_array_elements(v_tasks) with ordinality as t(task, ord)
    where coalesce(task->>'id', '') <> v_task_id
      and coalesce(task->>'sourceGoalId', '') <> p_goal_id
  ),
  version = version + 1,
  updated_at = now()
  where user_id = p_user_id;
end;
$$;

create or replace function ariadne_internal.apply_direction_update(
  p_user_id uuid,
  p_direction_id text,
  p_patch jsonb,
  p_change_reason text default null
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
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be a JSON object'; end if;
  select key into v_bad_key from jsonb_object_keys(p_patch) key
  where key not in ('title', 'statement', 'is_active') limit 1;
  if v_bad_key is not null then raise exception 'Unsupported direction field: %', v_bad_key; end if;

  select * into v_direction from public.directions
  where id = p_direction_id and user_id = p_user_id for update;
  if not found then raise exception 'Direction % not found', p_direction_id; end if;

  v_title := case when p_patch ? 'title' then btrim(coalesce(p_patch->>'title', '')) else v_direction.title end;
  v_statement := case when p_patch ? 'statement' then btrim(coalesce(p_patch->>'statement', '')) else v_direction.statement end;
  v_is_active := case when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean else v_direction.is_active end;
  if v_title = '' then raise exception 'Direction title cannot be empty'; end if;
  if v_statement = '' then raise exception 'Direction statement cannot be empty'; end if;

  v_meaningful := v_title is distinct from v_direction.title or v_statement is distinct from v_direction.statement;
  if v_meaningful and btrim(coalesce(p_change_reason, '')) = '' then raise exception 'REVISION_REASON_REQUIRED'; end if;
  if v_meaningful then
    insert into public.direction_revisions(user_id, direction_id, title, statement, change_reason)
    values (p_user_id, v_direction.id, v_direction.title, v_direction.statement, btrim(p_change_reason));
  end if;

  update public.directions
  set title = v_title, statement = v_statement, is_active = v_is_active, updated_at = now()
  where id = v_direction.id
  returning * into v_direction;
  return to_jsonb(v_direction) - 'user_id';
end;
$$;

create or replace function ariadne_internal.apply_outcome_goal_update(
  p_user_id uuid,
  p_goal_id text,
  p_patch jsonb,
  p_change_reason text default null
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
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be a JSON object'; end if;
  select key into v_bad_key from jsonb_object_keys(p_patch) key
  where key not in ('title','description','metric_type','current_value','target_value','start_date','target_date','status','position','bare_minimum','display_on_todo_list') limit 1;
  if v_bad_key is not null then raise exception 'Unsupported goal field: %', v_bad_key; end if;

  select * into v_goal from public.outcome_goals where id = p_goal_id and user_id = p_user_id for update;
  if not found then raise exception 'Outcome goal % not found', p_goal_id; end if;
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

  v_meaningful := v_title is distinct from v_goal.title
    or v_target_value is distinct from v_goal.target_value
    or v_bare_minimum is distinct from v_goal.bare_minimum
    or v_start_date is distinct from v_goal.start_date
    or v_target_date is distinct from v_goal.target_date;
  if v_meaningful and btrim(coalesce(p_change_reason, '')) = '' then raise exception 'REVISION_REASON_REQUIRED'; end if;
  if v_meaningful then
    insert into public.outcome_goal_revisions(user_id, outcome_goal_id, previous_title, previous_metric_type, previous_target_value, previous_bare_minimum, previous_start_date, previous_target_date, change_reason)
    values (p_user_id, v_goal.id, v_goal.title, v_goal.metric_type, v_goal.target_value, v_goal.bare_minimum, v_goal.start_date, v_goal.target_date, btrim(p_change_reason));
  end if;

  v_should_sync_task := v_display is distinct from v_goal.display_on_todo_list
    or (v_display and (v_title is distinct from v_goal.title
      or v_description is distinct from coalesce(v_goal.description, '')
      or v_target_date is distinct from v_goal.target_date));
  select exists(
    select 1 from public.user_tasks ut, jsonb_array_elements(coalesce(ut.tasks, '[]'::jsonb)) task
    where ut.user_id = p_user_id
      and (task->>'id' = 'directional-goal-task-' || v_goal.id or task->>'sourceGoalId' = v_goal.id)
      and coalesce(task->>'deleted', 'false') <> 'true'
  ) into v_active_linked_task_exists;
  v_should_sync_task := v_should_sync_task or (v_display and not v_active_linked_task_exists);

  update public.outcome_goals
  set title = v_title, description = nullif(v_description, ''), metric_type = v_metric_type,
      current_value = v_current_value, target_value = v_target_value, bare_minimum = v_bare_minimum,
      start_date = v_start_date, target_date = v_target_date, status = v_status, position = v_position,
      display_on_todo_list = v_display, updated_at = now()
  where id = v_goal.id
  returning * into v_goal;

  perform ariadne_internal.sync_goal_linked_task(p_user_id, v_goal.id, v_goal.title, coalesce(v_goal.description, ''), v_goal.target_date, v_goal.display_on_todo_list)
  where v_should_sync_task;
  return to_jsonb(v_goal) - 'user_id';
end;
$$;

-- Browser callers authenticate as the owner, then use the same private operation as ChatGPT.
create or replace function public.update_direction_semantic(direction_id text, patch jsonb, change_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, ariadne_internal, pg_temp as $$
begin
  if auth.uid() is null or not public.is_ariadne_owner() then raise exception 'ARIADNE_OWNER_REQUIRED'; end if;
  return ariadne_internal.apply_direction_update(auth.uid(), direction_id, patch, change_reason);
end;
$$;

create or replace function public.update_outcome_goal_semantic(goal_id text, patch jsonb, change_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, ariadne_internal, pg_temp as $$
begin
  if auth.uid() is null or not public.is_ariadne_owner() then raise exception 'ARIADNE_OWNER_REQUIRED'; end if;
  return ariadne_internal.apply_outcome_goal_update(auth.uid(), goal_id, patch, change_reason);
end;
$$;

drop function if exists chatgpt.update_direction(text, jsonb);
create function chatgpt.update_direction(direction_id text, patch jsonb, change_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, ariadne_internal, chatgpt, pg_temp as $$
begin
  return ariadne_internal.apply_direction_update(chatgpt.owner_user_id(), direction_id, patch, change_reason);
end;
$$;

drop function if exists chatgpt.update_outcome_goal(text, jsonb);
create function chatgpt.update_outcome_goal(goal_id text, patch jsonb, change_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, ariadne_internal, chatgpt, pg_temp as $$
begin
  return ariadne_internal.apply_outcome_goal_update(chatgpt.owner_user_id(), goal_id, patch, change_reason);
end;
$$;

revoke all on all functions in schema ariadne_internal from public;
revoke all on all functions in schema ariadne_internal from anon;
revoke all on all functions in schema ariadne_internal from authenticated;
revoke all on all functions in schema ariadne_internal from service_role;
grant execute on all functions in schema ariadne_internal to postgres;

revoke all on function public.update_direction_semantic(text, jsonb, text) from public;
revoke all on function public.update_direction_semantic(text, jsonb, text) from anon;
revoke all on function public.update_direction_semantic(text, jsonb, text) from service_role;
grant execute on function public.update_direction_semantic(text, jsonb, text) to authenticated;
revoke all on function public.update_outcome_goal_semantic(text, jsonb, text) from public;
revoke all on function public.update_outcome_goal_semantic(text, jsonb, text) from anon;
revoke all on function public.update_outcome_goal_semantic(text, jsonb, text) from service_role;
grant execute on function public.update_outcome_goal_semantic(text, jsonb, text) to authenticated;

revoke all on function chatgpt.update_direction(text, jsonb, text) from public, anon, authenticated;
grant execute on function chatgpt.update_direction(text, jsonb, text) to postgres, service_role;
revoke all on function chatgpt.update_outcome_goal(text, jsonb, text) from public, anon, authenticated;
grant execute on function chatgpt.update_outcome_goal(text, jsonb, text) to postgres, service_role;
