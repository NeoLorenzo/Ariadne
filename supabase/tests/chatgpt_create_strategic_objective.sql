-- Regression coverage for chatgpt.create_strategic_objective.
-- Intended to run against a representative database with the Ariadne schema loaded.

begin;

create temporary table _test_owner_context(owner_id uuid) on commit drop;
insert into _test_owner_context(owner_id)
select id
from auth.users
order by created_at
limit 1;

do $$
declare
  v_owner uuid;
  v_direction_id text := 'direction-test-' || gen_random_uuid()::text;
  v_existing_id text := 'strategic-objective-test-existing-' || gen_random_uuid()::text;
  v_created jsonb;
  v_created_explicit jsonb;
  v_strategy jsonb;
  v_invalid_rejected boolean := false;
begin
  select owner_id into v_owner from _test_owner_context;
  if v_owner is null then
    raise exception 'Regression test requires at least one auth.users row';
  end if;

  insert into public.directions(id, user_id, title, statement, is_active)
  values (v_direction_id, v_owner, 'RPC regression direction', 'Temporary regression fixture', false);

  insert into public.strategic_objectives(
    id, user_id, direction_id, title, success_condition, status, position
  )
  values (
    v_existing_id, v_owner, v_direction_id, 'Existing sibling', 'Remain present', 'active', 4
  );

  -- The function derives its owner internally. If the environment's owner helper does not
  -- resolve to this fixture owner, fail rather than silently testing the wrong ownership path.
  if chatgpt.owner_user_id() <> v_owner then
    raise exception 'Regression fixture owner does not match chatgpt.owner_user_id()';
  end if;

  v_created := chatgpt.create_strategic_objective(
    v_direction_id,
    'Created through RPC',
    'Round-trips through strategy',
    'Regression fixture',
    'active',
    null
  );

  if (v_created ->> 'direction_id') is distinct from v_direction_id then
    raise exception 'Created objective has wrong direction_id: %', v_created;
  end if;
  if (v_created ->> 'position')::integer <> 5 then
    raise exception 'Default sibling position expected 5, got %', v_created ->> 'position';
  end if;

  v_created_explicit := chatgpt.create_strategic_objective(
    v_direction_id,
    'Explicit position objective',
    'Preserves explicit p_position',
    null,
    'active',
    2
  );

  if (v_created_explicit ->> 'position')::integer <> 2 then
    raise exception 'Explicit position expected 2, got %', v_created_explicit ->> 'position';
  end if;

  v_strategy := chatgpt.get_strategy();
  if position((v_created ->> 'id') in v_strategy::text) = 0 then
    raise exception 'Created objective did not round-trip through chatgpt.get_strategy()';
  end if;

  begin
    perform chatgpt.create_strategic_objective(
      'direction-missing-' || gen_random_uuid()::text,
      'Should fail',
      'Invalid direction is rejected'
    );
  exception
    when others then
      if sqlerrm like 'Direction % not found' then
        v_invalid_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_invalid_rejected then
    raise exception 'Invalid direction was not rejected';
  end if;
end;
$$;

rollback;
