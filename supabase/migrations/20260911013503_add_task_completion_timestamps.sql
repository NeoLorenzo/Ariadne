-- Add explicit task completion timestamps without inferring historical completion times.
-- `completedAt` is a millisecond Unix timestamp when a task transitions to complete,
-- and null when it is incomplete. Existing task JSON is left untouched and normalizes
-- to null in the application layer when the field is absent.

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
    'completedAt', null,
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

create or replace function chatgpt.update_task(task_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_tasks jsonb;
  v_new_tasks jsonb;
  v_result jsonb;
  v_existing_task jsonb;
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

  select tasks into v_tasks
  from public.user_tasks
  where user_id = v_owner
  for update;

  select task into v_existing_task
  from jsonb_array_elements(coalesce(v_tasks, '[]'::jsonb)) task
  where task->>'id' = task_id
  limit 1;

  if v_existing_task is null then raise exception 'Task % not found', task_id; end if;

  if lower(coalesce(v_existing_task->>'sourceType', '')) = 'github-issue'
     and (patch ? 'title' or patch ? 'description' or patch ? 'completed') then
    raise exception 'GitHub-owned task fields cannot be modified in Ariadne';
  end if;

  select jsonb_agg(
    case when task->>'id' = task_id then
      task || patch || jsonb_build_object('updatedAt', v_now) ||
      case
        when patch ? 'deleted' and (patch->>'deleted')::boolean then jsonb_build_object('deletedAt', v_now)
        when patch ? 'deleted' and not (patch->>'deleted')::boolean then jsonb_build_object('deletedAt', 0)
        else '{}'::jsonb
      end ||
      case
        when patch ? 'completed' and (patch->>'completed')::boolean
          and coalesce(task->>'completed', 'false') <> 'true'
          then jsonb_build_object('completedAt', v_now)
        when patch ? 'completed' and not (patch->>'completed')::boolean
          then jsonb_build_object('completedAt', null)
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

  update public.user_tasks
  set tasks = v_new_tasks,
      version = version + 1,
      updated_at = now()
  where user_id = v_owner;

  return v_result;
end;
$function$;
