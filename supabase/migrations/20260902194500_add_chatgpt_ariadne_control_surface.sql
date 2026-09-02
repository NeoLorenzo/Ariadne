create schema if not exists chatgpt;

revoke all on schema chatgpt from public;
revoke all on schema chatgpt from anon;
revoke all on schema chatgpt from authenticated;
grant usage on schema chatgpt to postgres, service_role;

create or replace function chatgpt.owner_user_id()
returns uuid
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_count integer;
begin
  with ids as (
    select user_id from public.user_tasks
    union
    select user_id from public.user_projects
    union
    select user_id from public.directions
    union
    select user_id from public.strategic_objectives
    union
    select user_id from public.outcome_goals
  )
  select (array_agg(user_id))[1], count(*) into v_owner, v_count
  from ids
  where user_id is not null;

  if v_count <> 1 then
    raise exception 'Ariadne ChatGPT interface requires exactly one owner; found %', v_count;
  end if;

  return v_owner;
end;
$$;

create or replace function chatgpt.get_tasks(
  include_completed boolean default false,
  include_deleted boolean default false,
  max_items integer default 200
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_tasks jsonb;
  v_version bigint;
  v_updated_at timestamptz;
begin
  max_items := greatest(1, least(coalesce(max_items, 200), 500));

  select tasks, version, updated_at
    into v_tasks, v_version, v_updated_at
  from public.user_tasks
  where user_id = v_owner;

  return jsonb_build_object(
    'version', v_version,
    'updated_at', v_updated_at,
    'tasks', coalesce((
      select jsonb_agg(task order by ord)
      from (
        select task, ord
        from jsonb_array_elements(coalesce(v_tasks, '[]'::jsonb)) with ordinality as t(task, ord)
        where (include_completed or coalesce(task->>'completed', 'false') <> 'true')
          and (include_deleted or coalesce(task->>'deleted', 'false') <> 'true')
        order by ord
        limit max_items
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function chatgpt.get_projects(include_archived boolean default false)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_projects jsonb;
  v_version bigint;
  v_updated_at timestamptz;
begin
  select projects, version, updated_at
    into v_projects, v_version, v_updated_at
  from public.user_projects
  where user_id = v_owner;

  return jsonb_build_object(
    'version', v_version,
    'updated_at', v_updated_at,
    'projects', coalesce((
      select jsonb_agg(project order by ord)
      from jsonb_array_elements(coalesce(v_projects, '[]'::jsonb)) with ordinality as p(project, ord)
      where include_archived or coalesce(project->>'isArchived', 'false') <> 'true'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function chatgpt.get_strategy()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
begin
  return jsonb_build_object(
    'directions', coalesce((
      select jsonb_agg(to_jsonb(d) - 'user_id' order by d.created_at)
      from public.directions d where d.user_id = v_owner
    ), '[]'::jsonb),
    'strategic_objectives', coalesce((
      select jsonb_agg(to_jsonb(o) - 'user_id' order by o.position, o.created_at)
      from public.strategic_objectives o where o.user_id = v_owner
    ), '[]'::jsonb),
    'outcome_goals', coalesce((
      select jsonb_agg(to_jsonb(g) - 'user_id' order by g.position, g.created_at)
      from public.outcome_goals g where g.user_id = v_owner
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function chatgpt.get_signals()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc), '[]'::jsonb)
  from public.external_signal_cache s;
$$;

create or replace function chatgpt.get_workspace_state(
  include_completed_tasks boolean default false,
  include_deleted_tasks boolean default false,
  include_archived_projects boolean default false,
  max_tasks integer default 200
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'strategy', chatgpt.get_strategy(),
    'projects', chatgpt.get_projects(include_archived_projects),
    'tasks', chatgpt.get_tasks(include_completed_tasks, include_deleted_tasks, max_tasks),
    'signals', chatgpt.get_signals()
  );
$$;

create or replace function chatgpt.create_task(
  title text,
  description text default '',
  priority integer default 0,
  due_date text default '',
  due_time text default '',
  tags jsonb default '[]'::jsonb,
  source_goal_id text default '',
  estimated_hours text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_task jsonb;
begin
  title := btrim(coalesce(title, ''));
  if title = '' then raise exception 'Task title is required'; end if;
  if priority < 0 or priority > 4 then raise exception 'Task priority must be between 0 and 4'; end if;
  if jsonb_typeof(tags) <> 'array' then raise exception 'Task tags must be a JSON array'; end if;

  v_task := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'tags', tags,
    'title', title,
    'deleted', false,
    'dueDate', coalesce(due_date, ''),
    'dueTime', coalesce(due_time, ''),
    'priority', priority,
    'subtasks', '[]'::jsonb,
    'completed', false,
    'createdAt', v_now,
    'deletedAt', 0,
    'updatedAt', v_now,
    'sourceType', case when coalesce(source_goal_id, '') = '' then '' else 'outcome_goal' end,
    'description', coalesce(description, ''),
    'sourceGoalId', coalesce(source_goal_id, ''),
    'estimatedHours', coalesce(estimated_hours, '')
  );

  update public.user_tasks
  set tasks = coalesce(tasks, '[]'::jsonb) || jsonb_build_array(v_task),
      version = version + 1,
      updated_at = now()
  where user_id = v_owner;

  if not found then raise exception 'Ariadne task store not found'; end if;
  return v_task;
end;
$$;

create or replace function chatgpt.update_task(task_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_tasks jsonb;
  v_new_tasks jsonb;
  v_result jsonb;
  v_bad_key text;
begin
  if coalesce(task_id, '') = '' then raise exception 'task_id is required'; end if;
  if patch is null or jsonb_typeof(patch) <> 'object' then raise exception 'patch must be a JSON object'; end if;

  select key into v_bad_key
  from jsonb_object_keys(patch) key
  where key not in ('title','description','priority','dueDate','dueTime','tags','sourceGoalId','sourceType','estimatedHours','completed','deleted')
  limit 1;
  if v_bad_key is not null then raise exception 'Unsupported task field: %', v_bad_key; end if;

  if patch ? 'title' and btrim(coalesce(patch->>'title','')) = '' then raise exception 'Task title cannot be empty'; end if;
  if patch ? 'priority' and ((patch->>'priority')::integer < 0 or (patch->>'priority')::integer > 4) then raise exception 'Task priority must be between 0 and 4'; end if;
  if patch ? 'tags' and jsonb_typeof(patch->'tags') <> 'array' then raise exception 'Task tags must be a JSON array'; end if;
  if patch ? 'completed' and jsonb_typeof(patch->'completed') <> 'boolean' then raise exception 'completed must be boolean'; end if;
  if patch ? 'deleted' and jsonb_typeof(patch->'deleted') <> 'boolean' then raise exception 'deleted must be boolean'; end if;

  select tasks into v_tasks from public.user_tasks where user_id = v_owner for update;

  select jsonb_agg(
    case when task->>'id' = task_id then
      task || patch || jsonb_build_object('updatedAt', v_now) ||
      case
        when patch ? 'deleted' and (patch->>'deleted')::boolean then jsonb_build_object('deletedAt', v_now)
        when patch ? 'deleted' and not (patch->>'deleted')::boolean then jsonb_build_object('deletedAt', 0)
        else '{}'::jsonb
      end
    else task end
    order by ord
  ) into v_new_tasks
  from jsonb_array_elements(coalesce(v_tasks, '[]'::jsonb)) with ordinality as t(task, ord);

  select task into v_result
  from jsonb_array_elements(coalesce(v_new_tasks, '[]'::jsonb)) task
  where task->>'id' = task_id
  limit 1;

  if v_result is null then raise exception 'Task % not found', task_id; end if;

  update public.user_tasks
  set tasks = v_new_tasks,
      version = version + 1,
      updated_at = now()
  where user_id = v_owner;

  return v_result;
end;
$$;

create or replace function chatgpt.complete_task(task_id text, completed boolean default true)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select chatgpt.update_task(task_id, jsonb_build_object('completed', completed));
$$;

create or replace function chatgpt.update_project(project_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_projects jsonb;
  v_new_projects jsonb;
  v_result jsonb;
  v_bad_key text;
begin
  if coalesce(project_id, '') = '' then raise exception 'project_id is required'; end if;
  if patch is null or jsonb_typeof(patch) <> 'object' then raise exception 'patch must be a JSON object'; end if;

  select key into v_bad_key
  from jsonb_object_keys(patch) key
  where key not in ('title','desc','dueDate','category','estimatedHours','isArchived','repoStatusTag','completionStatus')
  limit 1;
  if v_bad_key is not null then raise exception 'Unsupported project field: %', v_bad_key; end if;
  if patch ? 'title' and btrim(coalesce(patch->>'title','')) = '' then raise exception 'Project title cannot be empty'; end if;
  if patch ? 'isArchived' and jsonb_typeof(patch->'isArchived') <> 'boolean' then raise exception 'isArchived must be boolean'; end if;

  select projects into v_projects from public.user_projects where user_id = v_owner for update;

  select jsonb_agg(
    case when project->>'id' = project_id then project || patch || jsonb_build_object('updatedAt', v_now)
         else project end
    order by ord
  ) into v_new_projects
  from jsonb_array_elements(coalesce(v_projects, '[]'::jsonb)) with ordinality as p(project, ord);

  select project into v_result
  from jsonb_array_elements(coalesce(v_new_projects, '[]'::jsonb)) project
  where project->>'id' = project_id
  limit 1;

  if v_result is null then raise exception 'Project % not found', project_id; end if;

  update public.user_projects
  set projects = v_new_projects,
      version = version + 1,
      updated_at = now()
  where user_id = v_owner;

  return v_result;
end;
$$;

create or replace function chatgpt.update_direction(direction_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_result jsonb;
  v_bad_key text;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then raise exception 'patch must be a JSON object'; end if;
  select key into v_bad_key from jsonb_object_keys(patch) key where key not in ('title','statement','is_active') limit 1;
  if v_bad_key is not null then raise exception 'Unsupported direction field: %', v_bad_key; end if;
  if patch ? 'title' and btrim(coalesce(patch->>'title','')) = '' then raise exception 'Direction title cannot be empty'; end if;
  if patch ? 'statement' and btrim(coalesce(patch->>'statement','')) = '' then raise exception 'Direction statement cannot be empty'; end if;

  update public.directions d
  set title = case when patch ? 'title' then patch->>'title' else d.title end,
      statement = case when patch ? 'statement' then patch->>'statement' else d.statement end,
      is_active = case when patch ? 'is_active' then (patch->>'is_active')::boolean else d.is_active end,
      updated_at = now()
  where d.id = direction_id and d.user_id = v_owner
  returning to_jsonb(d) - 'user_id' into v_result;

  if v_result is null then raise exception 'Direction % not found', direction_id; end if;
  return v_result;
end;
$$;

create or replace function chatgpt.create_strategic_objective(
  direction_id text,
  title text,
  success_condition text,
  description text default null,
  status text default 'active',
  p_position integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_id text := 'strategic-objective-' || gen_random_uuid()::text;
  v_position integer;
  v_result jsonb;
begin
  title := btrim(coalesce(title, ''));
  success_condition := btrim(coalesce(success_condition, ''));
  if title = '' then raise exception 'Objective title is required'; end if;
  if success_condition = '' then raise exception 'success_condition is required'; end if;
  if not exists (select 1 from public.directions d where d.id = direction_id and d.user_id = v_owner) then raise exception 'Direction % not found', direction_id; end if;

  select coalesce(max(o.position) + 1, 0) into v_position
  from public.strategic_objectives o where o.user_id = v_owner and o.direction_id = direction_id;
  v_position := coalesce(p_position, v_position);

  insert into public.strategic_objectives(id,user_id,direction_id,title,description,success_condition,status,position)
  values (v_id,v_owner,direction_id,title,description,success_condition,coalesce(status,'active'),v_position)
  returning to_jsonb(strategic_objectives) - 'user_id' into v_result;
  return v_result;
end;
$$;

create or replace function chatgpt.update_strategic_objective(objective_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_result jsonb;
  v_bad_key text;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then raise exception 'patch must be a JSON object'; end if;
  select key into v_bad_key from jsonb_object_keys(patch) key where key not in ('title','description','success_condition','status','position') limit 1;
  if v_bad_key is not null then raise exception 'Unsupported objective field: %', v_bad_key; end if;

  update public.strategic_objectives o
  set title = case when patch ? 'title' then patch->>'title' else o.title end,
      description = case when patch ? 'description' then patch->>'description' else o.description end,
      success_condition = case when patch ? 'success_condition' then patch->>'success_condition' else o.success_condition end,
      status = case when patch ? 'status' then patch->>'status' else o.status end,
      position = case when patch ? 'position' then (patch->>'position')::integer else o.position end,
      updated_at = now()
  where o.id = objective_id and o.user_id = v_owner
  returning to_jsonb(o) - 'user_id' into v_result;

  if v_result is null then raise exception 'Strategic objective % not found', objective_id; end if;
  return v_result;
end;
$$;

create or replace function chatgpt.create_outcome_goal(
  strategic_objective_id text,
  title text,
  target_value numeric,
  description text default null,
  metric_type text default 'count',
  current_value numeric default 0,
  start_date date default null,
  target_date date default null,
  status text default 'active',
  p_position integer default null,
  bare_minimum numeric default 0,
  display_on_todo_list boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_id text := 'outcome-goal-' || gen_random_uuid()::text;
  v_position integer;
  v_result jsonb;
begin
  title := btrim(coalesce(title, ''));
  if title = '' then raise exception 'Goal title is required'; end if;
  if not exists (select 1 from public.strategic_objectives o where o.id = strategic_objective_id and o.user_id = v_owner) then raise exception 'Strategic objective % not found', strategic_objective_id; end if;

  select coalesce(max(g.position) + 1, 0) into v_position
  from public.outcome_goals g where g.user_id = v_owner and g.strategic_objective_id = strategic_objective_id;
  v_position := coalesce(p_position, v_position);

  insert into public.outcome_goals(id,user_id,strategic_objective_id,title,description,metric_type,current_value,target_value,start_date,target_date,status,position,bare_minimum,display_on_todo_list)
  values (v_id,v_owner,strategic_objective_id,title,description,coalesce(metric_type,'count'),coalesce(current_value,0),target_value,start_date,target_date,coalesce(status,'active'),v_position,coalesce(bare_minimum,0),coalesce(display_on_todo_list,false))
  returning to_jsonb(outcome_goals) - 'user_id' into v_result;
  return v_result;
end;
$$;

create or replace function chatgpt.update_outcome_goal(goal_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_result jsonb;
  v_bad_key text;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then raise exception 'patch must be a JSON object'; end if;
  select key into v_bad_key from jsonb_object_keys(patch) key
  where key not in ('title','description','metric_type','current_value','target_value','start_date','target_date','status','position','bare_minimum','display_on_todo_list')
  limit 1;
  if v_bad_key is not null then raise exception 'Unsupported goal field: %', v_bad_key; end if;

  update public.outcome_goals g
  set title = case when patch ? 'title' then patch->>'title' else g.title end,
      description = case when patch ? 'description' then patch->>'description' else g.description end,
      metric_type = case when patch ? 'metric_type' then patch->>'metric_type' else g.metric_type end,
      current_value = case when patch ? 'current_value' then (patch->>'current_value')::numeric else g.current_value end,
      target_value = case when patch ? 'target_value' then (patch->>'target_value')::numeric else g.target_value end,
      start_date = case when patch ? 'start_date' then nullif(patch->>'start_date','')::date else g.start_date end,
      target_date = case when patch ? 'target_date' then nullif(patch->>'target_date','')::date else g.target_date end,
      status = case when patch ? 'status' then patch->>'status' else g.status end,
      position = case when patch ? 'position' then (patch->>'position')::integer else g.position end,
      bare_minimum = case when patch ? 'bare_minimum' then (patch->>'bare_minimum')::numeric else g.bare_minimum end,
      display_on_todo_list = case when patch ? 'display_on_todo_list' then (patch->>'display_on_todo_list')::boolean else g.display_on_todo_list end,
      updated_at = now()
  where g.id = goal_id and g.user_id = v_owner
  returning to_jsonb(g) - 'user_id' into v_result;

  if v_result is null then raise exception 'Outcome goal % not found', goal_id; end if;
  return v_result;
end;
$$;

revoke all on all functions in schema chatgpt from public;
revoke all on all functions in schema chatgpt from anon;
revoke all on all functions in schema chatgpt from authenticated;
grant execute on all functions in schema chatgpt to postgres, service_role;

comment on schema chatgpt is 'Bounded Ariadne control surface intended for ChatGPT through the connected Supabase management integration. Not exposed to browser roles.';
comment on function chatgpt.get_workspace_state(boolean, boolean, boolean, integer) is 'Read the core Ariadne workspace state for ChatGPT.';
comment on function chatgpt.create_task(text,text,integer,text,text,jsonb,text,text) is 'Create one Ariadne task using the canonical user_tasks JSON store.';
comment on function chatgpt.update_task(text,jsonb) is 'Apply an allowlisted patch to one Ariadne task.';
comment on function chatgpt.complete_task(text,boolean) is 'Mark one Ariadne task complete or incomplete.';
