-- Simplify Ariadne strategy to Directions -> Strategic Objectives -> Tasks.
-- Existing goal-backed tasks are preserved as ordinary tasks before the goal tables are removed.

-- Convert every legacy goal-backed task in-place. This is intentionally idempotent:
-- after conversion none of the predicates below match the task again.
update public.user_tasks as task_store
set
  tasks = (
    select coalesce(jsonb_agg(
      case
        when lower(coalesce(task_item.value->>'sourceType', '')) in ('directional-goal', 'outcome_goal')
          or btrim(coalesce(task_item.value->>'sourceGoalId', '')) <> ''
          or coalesce(task_item.value->>'id', '') like 'directional-goal-task-%'
        then
          (task_item.value - 'sourceType' - 'sourceGoalId' - 'tags' - 'priority')
          || jsonb_build_object(
            'sourceType', '',
            'sourceGoalId', '',
            'priority', case
              when coalesce(task_item.value->>'priority', '') ~ '^[0-4]$'
                then (task_item.value->>'priority')::integer
              else 0
            end,
            'tags', coalesce((
              select jsonb_agg(to_jsonb(tag_value))
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(task_item.value->'tags') = 'array' then task_item.value->'tags'
                  else '[]'::jsonb
                end
              ) as tag_value
              where lower(btrim(tag_value)) not in ('directional-goal', 'outcome_goal')
            ), '[]'::jsonb)
          )
        else task_item.value
      end
      order by task_item.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(task_store.tasks, '[]'::jsonb)) with ordinality as task_item(value, ordinality)
  ),
  version = task_store.version + 1,
  updated_at = now()
where exists (
  select 1
  from jsonb_array_elements(coalesce(task_store.tasks, '[]'::jsonb)) as candidate(value)
  where lower(coalesce(candidate.value->>'sourceType', '')) in ('directional-goal', 'outcome_goal')
    or btrim(coalesce(candidate.value->>'sourceGoalId', '')) <> ''
    or coalesce(candidate.value->>'id', '') like 'directional-goal-task-%'
);

-- Remove Outcome Goal-specific ChatGPT entry points before dropping the underlying tables.
drop function if exists chatgpt.create_outcome_goal(text,text,numeric,text,text,numeric,date,date,text,integer,numeric,boolean);
drop function if exists chatgpt.update_outcome_goal(text,jsonb,text);

-- Remove Outcome Goal semantic operations and internal helpers.
drop function if exists public.create_outcome_goal_semantic(jsonb);
drop function if exists public.update_outcome_goal_semantic(text,jsonb,text,text,timestamptz);
drop function if exists public.delete_outcome_goal_semantic(text,timestamptz);
drop function if exists public.delete_outcome_goal_revision_semantic(text,text);
drop function if exists public.reorder_outcome_goals_semantic(text,jsonb,jsonb);
drop function if exists public.sync_outcome_goal_task_semantic(text);
drop function if exists ariadne_internal.apply_outcome_goal_update(uuid,text,jsonb,text);
drop function if exists ariadne_internal.apply_outcome_goal_update_checked(uuid,text,jsonb,text,text,timestamptz);
drop function if exists public.enforce_outcome_goal_owner();

-- The active strategy model no longer depends on Outcome Goals when resolving its owner.
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

revoke all on function chatgpt.owner_user_id() from public, anon, authenticated;
grant execute on function chatgpt.owner_user_id() to postgres, service_role;

-- Expose only Directions and Strategic Objectives as strategy nodes.
create or replace function chatgpt.get_strategy()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, chatgpt, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
begin
  return jsonb_build_object(
    'directions', coalesce((
      select jsonb_agg(
        (to_jsonb(d) - 'user_id') || jsonb_build_object(
          'vector_ids', coalesce((
            select jsonb_agg(dvl.vector_id order by case dvl.vector_id
              when 'physical' then 1 when 'psychological' then 2 when 'intellectual' then 3
              when 'professional' then 4 when 'financial' then 5 when 'relational' then 6
              when 'creative' then 7 when 'experiential' then 8 else 99 end)
            from public.direction_vector_links dvl
            where dvl.direction_id = d.id
          ), '[]'::jsonb)
        )
        order by d.position, d.created_at
      )
      from public.directions d where d.user_id = v_owner
    ), '[]'::jsonb),
    'strategic_objectives', coalesce((
      select jsonb_agg(to_jsonb(o) - 'user_id' order by o.position, o.created_at)
      from public.strategic_objectives o where o.user_id = v_owner
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function chatgpt.get_strategy() from public, anon, authenticated;
grant execute on function chatgpt.get_strategy() to postgres, service_role;

-- Replace the legacy create_task signature so new tasks cannot be created from an Outcome Goal.
drop function if exists chatgpt.create_task(text,text,integer,text,text,jsonb,text,text);
create function chatgpt.create_task(
  title text,
  description text default '',
  priority integer default 0,
  due_date text default '',
  due_time text default '',
  tags jsonb default '[]'::jsonb,
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
    'sourceType', '',
    'description', coalesce(description, ''),
    'sourceGoalId', '',
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

revoke all on function chatgpt.create_task(text,text,integer,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function chatgpt.create_task(text,text,integer,text,text,jsonb,text) to postgres, service_role;

-- sourceGoalId/sourceType are migration-only legacy fields and are no longer writable.
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
  where key not in ('title','description','priority','dueDate','dueTime','tags','estimatedHours','completed','deleted')
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

revoke all on function chatgpt.update_task(text,jsonb) from public, anon, authenticated;
grant execute on function chatgpt.update_task(text,jsonb) to postgres, service_role;

-- Finally remove the retired data model. Revisions reference goals with ON DELETE CASCADE,
-- so dropping revisions first avoids relying on CASCADE for unrelated objects.
drop table if exists public.outcome_goal_revisions;
drop table if exists public.outcome_goals;
