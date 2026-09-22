-- Preserve application history when an Opportunity leaves the live Landscape.
-- Applications retain an immutable historical Opportunity id and snapshot while the live FK
-- becomes nullable and follows Landscape deletion with ON DELETE SET NULL.

alter table public.opportunity_applications
  add column if not exists historical_opportunity_id text,
  add column if not exists opportunity_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(opportunity_snapshot) = 'object');

update public.opportunity_applications a
set
  historical_opportunity_id = coalesce(a.historical_opportunity_id, a.opportunity_id),
  opportunity_snapshot = case
    when a.opportunity_snapshot = '{}'::jsonb then jsonb_build_object(
      'id', o.id,
      'title', o.title,
      'type', o.type,
      'organization', o.organization,
      'url', o.url,
      'deadline', o.deadline,
      'start_date', o.start_date
    )
    else a.opportunity_snapshot
  end
from public.opportunities o
where o.id = a.opportunity_id
  and o.user_id = a.user_id;

alter table public.opportunity_applications
  alter column historical_opportunity_id set not null;

alter table public.opportunity_applications
  drop constraint if exists opportunity_applications_opportunity_id_fkey;

alter table public.opportunity_applications
  alter column opportunity_id drop not null;

alter table public.opportunity_applications
  add constraint opportunity_applications_opportunity_id_fkey
  foreign key (opportunity_id)
  references public.opportunities(id)
  on delete set null;

create index if not exists opportunity_applications_historical_opportunity_idx
  on public.opportunity_applications (user_id, historical_opportunity_id);

create or replace function public.capture_opportunity_application_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  opportunity_row public.opportunities%rowtype;
begin
  if tg_op = 'UPDATE' and new.opportunity_id is null then
    new.historical_opportunity_id := old.historical_opportunity_id;
    new.opportunity_snapshot := old.opportunity_snapshot;
    return new;
  end if;

  if new.opportunity_id is not null
     and (tg_op = 'INSERT' or new.opportunity_id is distinct from old.opportunity_id) then
    select *
    into opportunity_row
    from public.opportunities
    where id = new.opportunity_id
      and user_id = new.user_id;

    if not found then
      raise exception 'Opportunity not found for application snapshot' using errcode = 'P0002';
    end if;

    new.historical_opportunity_id := opportunity_row.id;
    new.opportunity_snapshot := jsonb_build_object(
      'id', opportunity_row.id,
      'title', opportunity_row.title,
      'type', opportunity_row.type,
      'organization', opportunity_row.organization,
      'url', opportunity_row.url,
      'deadline', opportunity_row.deadline,
      'start_date', opportunity_row.start_date
    );
  elsif tg_op = 'UPDATE' then
    new.historical_opportunity_id := old.historical_opportunity_id;
    new.opportunity_snapshot := old.opportunity_snapshot;
  end if;

  return new;
end;
$$;

revoke all on function public.capture_opportunity_application_snapshot() from public;
revoke all on function public.capture_opportunity_application_snapshot() from anon;
revoke all on function public.capture_opportunity_application_snapshot() from authenticated;

drop trigger if exists capture_opportunity_application_snapshot_trigger
  on public.opportunity_applications;

create trigger capture_opportunity_application_snapshot_trigger
before insert or update of opportunity_id
on public.opportunity_applications
for each row
execute function public.capture_opportunity_application_snapshot();

drop policy if exists "Users manage own opportunity applications"
  on public.opportunity_applications;
drop policy if exists opportunity_applications_owner_select
  on public.opportunity_applications;
drop policy if exists opportunity_applications_owner_insert
  on public.opportunity_applications;
drop policy if exists opportunity_applications_owner_update
  on public.opportunity_applications;
drop policy if exists opportunity_applications_owner_delete
  on public.opportunity_applications;

create policy opportunity_applications_owner_select
on public.opportunity_applications
for select
to authenticated
using (user_id = (select auth.uid()) and public.is_ariadne_owner());

create policy opportunity_applications_owner_insert
on public.opportunity_applications
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_ariadne_owner()
  and opportunity_id is not null
  and exists (
    select 1
    from public.opportunities o
    where o.id = opportunity_id
      and o.user_id = (select auth.uid())
  )
);

create policy opportunity_applications_owner_update
on public.opportunity_applications
for update
to authenticated
using (user_id = (select auth.uid()) and public.is_ariadne_owner())
with check (
  user_id = (select auth.uid())
  and public.is_ariadne_owner()
  and (
    opportunity_id is null
    or exists (
      select 1
      from public.opportunities o
      where o.id = opportunity_id
        and o.user_id = (select auth.uid())
    )
  )
);

create policy opportunity_applications_owner_delete
on public.opportunity_applications
for delete
to authenticated
using (user_id = (select auth.uid()) and public.is_ariadne_owner());

create or replace function chatgpt.get_opportunity_applications(include_closed boolean default true)
returns jsonb
language sql
security definer
set search_path = public, chatgpt, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'opportunity_id', a.historical_opportunity_id,
    'live_opportunity_id', a.opportunity_id,
    'submitted_at', a.submitted_at,
    'status', a.status,
    'status_updated_at', a.status_updated_at,
    'notes', a.notes,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'opportunity', case
      when o.id is not null then jsonb_build_object(
        'id', o.id,
        'title', o.title,
        'type', o.type,
        'organization', o.organization,
        'url', o.url,
        'deadline', o.deadline,
        'start_date', o.start_date,
        'archived', o.archived,
        'historical', false
      )
      else a.opportunity_snapshot || jsonb_build_object(
        'archived', true,
        'historical', true
      )
    end
  ) order by a.submitted_at desc), '[]'::jsonb)
  from public.opportunity_applications a
  left join public.opportunities o
    on o.id = a.opportunity_id
   and o.user_id = a.user_id
  where a.user_id = chatgpt.owner_user_id()
    and (include_closed or a.status in ('submitted','interviewing','waitlisted','offer'));
$$;

revoke all on function chatgpt.get_opportunity_applications(boolean) from public;
revoke all on function chatgpt.get_opportunity_applications(boolean) from anon;
revoke all on function chatgpt.get_opportunity_applications(boolean) from authenticated;
grant execute on function chatgpt.get_opportunity_applications(boolean) to service_role;
