-- Issue #19: replace the singleton direction model with multidimensional directions.
--
-- This migration is intentionally additive around existing direction data. Existing directions
-- retain their identity and downstream objective/goal/task relationships. Legacy directions are
-- left with no vector links until the owner explicitly classifies them.

alter table public.directions add column if not exists status text;
alter table public.directions add column if not exists position integer;

update public.directions
set status = case when coalesce(is_active, true) then 'active' else 'paused' end
where status is null;

with ranked as (
  select id, row_number() over (partition by user_id order by created_at, id) - 1 as next_position
  from public.directions
)
update public.directions d
set position = ranked.next_position
from ranked
where d.id = ranked.id and d.position is null;

alter table public.directions alter column status set default 'active';
alter table public.directions alter column status set not null;
alter table public.directions alter column position set default 0;
alter table public.directions alter column position set not null;
alter table public.directions drop constraint if exists directions_status_check;
alter table public.directions add constraint directions_status_check
check (status in ('active', 'paused', 'archived'));
alter table public.directions drop constraint if exists directions_position_check;
alter table public.directions add constraint directions_position_check check (position >= 0);

drop index if exists public.one_active_direction_per_user;
create index if not exists directions_user_status_position
on public.directions (user_id, status, position, created_at);

create table if not exists public.direction_vector_links (
  direction_id text not null references public.directions(id) on delete cascade,
  vector_id text not null,
  created_at timestamptz not null default now(),
  primary key (direction_id, vector_id),
  constraint direction_vector_links_vector_check check (
    vector_id in (
      'physical',
      'psychological',
      'intellectual',
      'professional',
      'financial',
      'relational',
      'creative',
      'experiential'
    )
  )
);

create index if not exists direction_vector_links_vector_direction
on public.direction_vector_links (vector_id, direction_id);

alter table public.direction_vector_links enable row level security;
grant select, insert, delete on table public.direction_vector_links to authenticated;
revoke all on table public.direction_vector_links from anon;

drop policy if exists "Users read own direction vector links" on public.direction_vector_links;
create policy "Users read own direction vector links"
on public.direction_vector_links
for select
to authenticated
using (
  exists (
    select 1 from public.directions d
    where d.id = direction_id
      and d.user_id = auth.uid()
      and public.is_ariadne_owner()
  )
);

drop policy if exists "Users insert own direction vector links" on public.direction_vector_links;
create policy "Users insert own direction vector links"
on public.direction_vector_links
for insert
to authenticated
with check (
  exists (
    select 1 from public.directions d
    where d.id = direction_id
      and d.user_id = auth.uid()
      and public.is_ariadne_owner()
  )
);

drop policy if exists "Users delete own direction vector links" on public.direction_vector_links;
create policy "Users delete own direction vector links"
on public.direction_vector_links
for delete
to authenticated
using (
  exists (
    select 1 from public.directions d
    where d.id = direction_id
      and d.user_id = auth.uid()
      and public.is_ariadne_owner()
  )
);

alter table public.direction_revisions add column if not exists vector_ids text[];

create or replace function ariadne_internal.direction_vector_ids(p_direction_id text)
returns text[]
language sql
stable
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
  select coalesce(array_agg(dvl.vector_id order by case dvl.vector_id
    when 'physical' then 1
    when 'psychological' then 2
    when 'intellectual' then 3
    when 'professional' then 4
    when 'financial' then 5
    when 'relational' then 6
    when 'creative' then 7
    when 'experiential' then 8
    else 99 end), array[]::text[])
  from public.direction_vector_links dvl
  where dvl.direction_id = p_direction_id;
$$;

create or replace function ariadne_internal.normalize_direction_vector_ids(p_values jsonb)
returns text[]
language plpgsql
immutable
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  v_bad text;
  v_result text[];
begin
  if p_values is null or jsonb_typeof(p_values) <> 'array' then
    raise exception 'vector_ids must be a JSON array';
  end if;

  select value into v_bad
  from jsonb_array_elements_text(p_values) as item(value)
  where value not in (
    'physical', 'psychological', 'intellectual', 'professional',
    'financial', 'relational', 'creative', 'experiential'
  )
  limit 1;
  if v_bad is not null then
    raise exception 'Unsupported vector id: %', v_bad;
  end if;

  select coalesce(array_agg(vector_id order by vector_order), array[]::text[])
  into v_result
  from (
    select distinct value as vector_id,
      case value
        when 'physical' then 1
        when 'psychological' then 2
        when 'intellectual' then 3
        when 'professional' then 4
        when 'financial' then 5
        when 'relational' then 6
        when 'creative' then 7
        when 'experiential' then 8
        else 99
      end as vector_order
    from jsonb_array_elements_text(p_values) as item(value)
  ) normalized;

  return v_result;
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
  v_status text;
  v_is_active boolean;
  v_bad_key text;
  v_meaningful boolean;
  v_revision_id text;
  v_current_vectors text[];
  v_next_vectors text[];
  v_vectors_changed boolean := false;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a JSON object';
  end if;

  select key into v_bad_key
  from jsonb_object_keys(p_patch) key
  where key not in ('title', 'statement', 'status', 'is_active', 'vector_ids')
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

  v_current_vectors := ariadne_internal.direction_vector_ids(v_direction.id);
  v_title := case when p_patch ? 'title' then btrim(coalesce(p_patch->>'title', '')) else v_direction.title end;
  v_statement := case when p_patch ? 'statement' then btrim(coalesce(p_patch->>'statement', '')) else v_direction.statement end;
  v_status := case
    when p_patch ? 'status' then btrim(coalesce(p_patch->>'status', ''))
    when p_patch ? 'is_active' then case when (p_patch->>'is_active')::boolean then 'active' else 'paused' end
    else v_direction.status
  end;
  v_is_active := v_status = 'active';

  if v_title = '' then raise exception 'Direction title cannot be empty'; end if;
  if v_statement = '' then raise exception 'Direction statement cannot be empty'; end if;
  if v_status not in ('active', 'paused', 'archived') then raise exception 'Unsupported direction status: %', v_status; end if;
  if p_patch ? 'status' and p_patch ? 'is_active'
    and ((p_patch->>'is_active')::boolean is distinct from (v_status = 'active')) then
    raise exception 'status and is_active disagree';
  end if;

  if p_patch ? 'vector_ids' then
    v_next_vectors := ariadne_internal.normalize_direction_vector_ids(p_patch->'vector_ids');
    if cardinality(v_next_vectors) = 0 then
      raise exception 'A direction must influence at least one vector';
    end if;
    v_vectors_changed := v_next_vectors is distinct from v_current_vectors;
  else
    v_next_vectors := v_current_vectors;
  end if;

  -- Lost-response retry: if the requested state is already committed, treat it as complete before
  -- checking the stale expected timestamp. The original transaction already wrote its revision.
  if v_title is not distinct from v_direction.title
    and v_statement is not distinct from v_direction.statement
    and v_status is not distinct from v_direction.status
    and v_vectors_changed = false then
    return (to_jsonb(v_direction) - 'user_id') || jsonb_build_object('vector_ids', to_jsonb(v_current_vectors));
  end if;

  if p_expected_updated_at is not null
    and v_direction.updated_at is distinct from p_expected_updated_at then
    perform ariadne_internal.raise_strategy_sync_conflict('direction', p_direction_id, v_direction.updated_at);
  end if;

  v_meaningful := v_title is distinct from v_direction.title
    or v_statement is distinct from v_direction.statement
    or v_vectors_changed;
  if v_meaningful and btrim(coalesce(p_change_reason, '')) = '' then
    raise exception 'REVISION_REASON_REQUIRED';
  end if;

  if v_meaningful then
    v_revision_id := coalesce(
      nullif(btrim(coalesce(p_revision_id, '')), ''),
      'direction-revision-' || gen_random_uuid()::text
    );
    insert into public.direction_revisions(
      id, user_id, direction_id, title, statement, change_reason, vector_ids
    ) values (
      v_revision_id,
      p_user_id,
      v_direction.id,
      v_direction.title,
      v_direction.statement,
      btrim(p_change_reason),
      v_current_vectors
    ) on conflict (id) do nothing;
  end if;

  update public.directions
  set title = v_title,
      statement = v_statement,
      status = v_status,
      is_active = v_is_active,
      updated_at = clock_timestamp()
  where id = v_direction.id
  returning * into v_direction;

  if v_vectors_changed then
    delete from public.direction_vector_links
    where direction_id = v_direction.id
      and not (vector_id = any(v_next_vectors));

    insert into public.direction_vector_links(direction_id, vector_id)
    select v_direction.id, vector_id
    from unnest(v_next_vectors) as vector_id
    on conflict (direction_id, vector_id) do nothing;
  end if;

  return (to_jsonb(v_direction) - 'user_id') || jsonb_build_object('vector_ids', to_jsonb(v_next_vectors));
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
  v_status text;
  v_is_active boolean;
  v_position integer;
  v_created_at timestamptz;
  v_vector_ids text[] := array[]::text[];
  v_existing_vectors text[] := array[]::text[];
  v_has_vector_ids boolean;
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
  v_position := coalesce((direction_record->>'position')::integer, (
    select coalesce(max(position) + 1, 0) from public.directions where user_id = v_user_id
  ));
  v_created_at := coalesce(nullif(direction_record->>'created_at', '')::timestamptz, clock_timestamp());
  v_has_vector_ids := direction_record ? 'vector_ids';

  if v_id = '' or v_title = '' or v_statement = '' then
    raise exception 'Direction id, title and statement are required';
  end if;
  if v_status not in ('active', 'paused', 'archived') then raise exception 'Unsupported direction status: %', v_status; end if;
  if v_position < 0 then raise exception 'Direction position must be non-negative'; end if;

  if v_has_vector_ids then
    v_vector_ids := ariadne_internal.normalize_direction_vector_ids(direction_record->'vector_ids');
    if cardinality(v_vector_ids) = 0 then
      raise exception 'A direction must influence at least one vector';
    end if;
  end if;

  select * into v_direction from public.directions where id = v_id for update;
  if found then
    v_existing_vectors := ariadne_internal.direction_vector_ids(v_direction.id);
    if v_direction.user_id = v_user_id
      and v_direction.title is not distinct from v_title
      and v_direction.statement is not distinct from v_statement
      and v_direction.status is not distinct from v_status
      and v_direction.position is not distinct from v_position
      and (not v_has_vector_ids or v_existing_vectors is not distinct from v_vector_ids) then
      return (to_jsonb(v_direction) - 'user_id') || jsonb_build_object('vector_ids', to_jsonb(v_existing_vectors));
    end if;
    perform ariadne_internal.raise_strategy_sync_conflict('direction', v_id, v_direction.updated_at);
  end if;

  insert into public.directions(
    id, user_id, title, statement, status, position, is_active, created_at, updated_at
  ) values (
    v_id, v_user_id, v_title, v_statement, v_status, v_position, v_is_active, v_created_at, clock_timestamp()
  ) returning * into v_direction;

  if v_has_vector_ids then
    insert into public.direction_vector_links(direction_id, vector_id)
    select v_direction.id, vector_id from unnest(v_vector_ids) as vector_id;
  end if;

  return (to_jsonb(v_direction) - 'user_id') || jsonb_build_object('vector_ids', to_jsonb(v_vector_ids));
end;
$$;

create or replace function public.update_direction_semantic(
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

create or replace function public.reorder_directions_semantic(
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
  v_direction public.directions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if v_user_id is null or not public.is_ariadne_owner() then
    raise exception 'ARIADNE_OWNER_REQUIRED';
  end if;
  if positions is null or jsonb_typeof(positions) <> 'object' then
    raise exception 'positions must be a JSON object';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':directions', 0));

  for v_id, v_position_text in select key, value from jsonb_each_text(positions) loop
    v_position := v_position_text::integer;
    if v_position < 0 then raise exception 'Direction position must be non-negative'; end if;

    select * into v_direction
    from public.directions
    where id = v_id and user_id = v_user_id
    for update;
    if not found then raise exception 'Direction % not found', v_id; end if;

    if v_direction.position is distinct from v_position then
      v_expected := expected_updated_at_by_id->>v_id;
      if nullif(v_expected, '') is not null
        and v_direction.updated_at is distinct from v_expected::timestamptz then
        perform ariadne_internal.raise_strategy_sync_conflict('direction', v_id, v_direction.updated_at);
      end if;
    end if;
  end loop;

  for v_id, v_position_text in select key, value from jsonb_each_text(positions) loop
    v_position := v_position_text::integer;
    update public.directions
    set position = v_position,
        updated_at = case when position is distinct from v_position then v_now else updated_at end
    where id = v_id and user_id = v_user_id;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'position', d.position, 'updated_at', d.updated_at
  ) order by d.position), '[]'::jsonb)
  into v_result
  from public.directions d
  where d.user_id = v_user_id and positions ? d.id;

  return v_result;
end;
$$;

-- Remove the old arbitrary maximum of three active strategic objectives while preserving the
-- same-owner direction invariant.
create or replace function public.enforce_strategic_objective_rules()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.directions
    where id = new.direction_id and user_id = new.user_id
  ) then
    raise exception 'Strategic objective must belong to the user direction';
  end if;
  return new;
end;
$$;

-- Keep the bounded ChatGPT/Ari Bot read surface aligned with the new direction contract.
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
    ), '[]'::jsonb),
    'outcome_goals', coalesce((
      select jsonb_agg(to_jsonb(g) - 'user_id' order by g.position, g.created_at)
      from public.outcome_goals g where g.user_id = v_owner
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists chatgpt.update_direction(text, jsonb, text);
create function chatgpt.update_direction(
  direction_id text,
  patch jsonb,
  change_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, chatgpt, pg_temp
as $$
begin
  return ariadne_internal.apply_direction_update_checked(
    chatgpt.owner_user_id(), direction_id, patch, change_reason, null, null
  );
end;
$$;

revoke all on function public.reorder_directions_semantic(jsonb, jsonb) from public, anon, service_role;
grant execute on function public.reorder_directions_semantic(jsonb, jsonb) to authenticated;
revoke all on function chatgpt.update_direction(text, jsonb, text) from public, anon, authenticated;
grant execute on function chatgpt.update_direction(text, jsonb, text) to postgres, service_role;

comment on table public.direction_vector_links is 'Ariadne-owned many-to-many direction to canonical life-vector membership for issue #19.';
comment on column public.direction_revisions.vector_ids is 'Previous canonical vector membership captured for direction revisions created after issue #19.';
