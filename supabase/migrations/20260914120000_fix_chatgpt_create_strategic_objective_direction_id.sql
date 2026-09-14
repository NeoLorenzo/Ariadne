-- Fix ambiguous direction_id resolution in the ChatGPT strategic-objective creation RPC.
-- Preserve the existing RPC signature so named callers remain compatible.

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
  v_direction_id text := direction_id;
  v_position integer;
  v_result jsonb;
begin
  title := btrim(coalesce(title, ''));
  success_condition := btrim(coalesce(success_condition, ''));
  if title = '' then raise exception 'Objective title is required'; end if;
  if success_condition = '' then raise exception 'success_condition is required'; end if;

  if not exists (
    select 1
    from public.directions d
    where d.id = v_direction_id
      and d.user_id = v_owner
  ) then
    raise exception 'Direction % not found', v_direction_id;
  end if;

  select coalesce(max(o.position) + 1, 0)
  into v_position
  from public.strategic_objectives o
  where o.user_id = v_owner
    and o.direction_id = v_direction_id;

  v_position := coalesce(p_position, v_position);

  insert into public.strategic_objectives(
    id,
    user_id,
    direction_id,
    title,
    description,
    success_condition,
    status,
    position
  )
  values (
    v_id,
    v_owner,
    v_direction_id,
    title,
    description,
    success_condition,
    coalesce(status, 'active'),
    v_position
  )
  returning to_jsonb(strategic_objectives) - 'user_id' into v_result;

  return v_result;
end;
$$;
