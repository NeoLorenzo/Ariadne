-- Track submitted applications separately from canonical Opportunities.

create table if not exists public.opportunity_applications (
  id text primary key check (length(trim(id)) > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id text not null references public.opportunities(id) on delete restrict,
  submitted_at timestamptz not null,
  status text not null default 'submitted' check (status in ('submitted','interviewing','waitlisted','offer','accepted','rejected','withdrawn','declined')),
  status_updated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create index if not exists opportunity_applications_user_status_idx
on public.opportunity_applications (user_id, status, status_updated_at desc);

create index if not exists opportunity_applications_opportunity_idx
on public.opportunity_applications (opportunity_id);

drop trigger if exists set_opportunity_application_updated_at_trigger on public.opportunity_applications;
create trigger set_opportunity_application_updated_at_trigger
before update on public.opportunity_applications
for each row execute function public.set_opportunity_updated_at();

alter table public.opportunity_applications enable row level security;
revoke all privileges on table public.opportunity_applications from public;
revoke all privileges on table public.opportunity_applications from anon;
revoke all privileges on table public.opportunity_applications from authenticated;
grant select, insert, update, delete on table public.opportunity_applications to authenticated;
grant all privileges on table public.opportunity_applications to service_role;

drop policy if exists "Users manage own opportunity applications" on public.opportunity_applications;
create policy "Users manage own opportunity applications"
on public.opportunity_applications
for all
to authenticated
using (auth.uid() = user_id and public.is_ariadne_owner())
with check (
  auth.uid() = user_id
  and public.is_ariadne_owner()
  and exists (
    select 1 from public.opportunities o
    where o.id = opportunity_id and o.user_id = auth.uid()
  )
);

create or replace function chatgpt.get_opportunity_applications(include_closed boolean default true)
returns jsonb
language sql
security definer
set search_path = public, chatgpt, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'opportunity_id', a.opportunity_id,
    'submitted_at', a.submitted_at,
    'status', a.status,
    'status_updated_at', a.status_updated_at,
    'notes', a.notes,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'opportunity', jsonb_build_object(
      'id', o.id,
      'title', o.title,
      'type', o.type,
      'organization', o.organization,
      'url', o.url,
      'deadline', o.deadline,
      'start_date', o.start_date,
      'archived', o.archived
    )
  ) order by a.submitted_at desc), '[]'::jsonb)
  from public.opportunity_applications a
  join public.opportunities o on o.id = a.opportunity_id and o.user_id = a.user_id
  where a.user_id = chatgpt.owner_user_id()
    and (include_closed or a.status in ('submitted','interviewing','waitlisted','offer'));
$$;

create or replace function chatgpt.create_opportunity_application(
  opportunity_id text,
  submitted_at timestamptz default now(),
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, chatgpt, pg_temp
as $$
declare
  owner_id uuid := chatgpt.owner_user_id();
  row_out public.opportunity_applications%rowtype;
  new_id text := 'application-' || gen_random_uuid()::text;
begin
  if not exists (select 1 from public.opportunities where id = opportunity_id and user_id = owner_id) then
    raise exception 'Opportunity not found' using errcode = 'P0002';
  end if;

  insert into public.opportunity_applications (
    id, user_id, opportunity_id, submitted_at, status, status_updated_at, notes
  ) values (
    new_id, owner_id, opportunity_id, coalesce(submitted_at, now()), 'submitted', now(), nullif(btrim(coalesce(notes,'')), '')
  )
  returning * into row_out;

  return to_jsonb(row_out);
end;
$$;

create or replace function chatgpt.update_opportunity_application(
  application_id text,
  patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, chatgpt, pg_temp
as $$
declare
  owner_id uuid := chatgpt.owner_user_id();
  current_row public.opportunity_applications%rowtype;
  row_out public.opportunity_applications%rowtype;
  next_status text;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'Patch must be an object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(patch) k where k not in ('status','submitted_at','notes')) then
    raise exception 'Patch contains unsupported fields' using errcode = '22023';
  end if;

  select * into current_row
  from public.opportunity_applications
  where id = application_id and user_id = owner_id
  for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;

  next_status := coalesce(nullif(btrim(patch->>'status'), ''), current_row.status);
  if next_status not in ('submitted','interviewing','waitlisted','offer','accepted','rejected','withdrawn','declined') then
    raise exception 'Invalid application status' using errcode = '22023';
  end if;

  update public.opportunity_applications
  set
    status = next_status,
    status_updated_at = case when next_status is distinct from current_row.status then now() else status_updated_at end,
    submitted_at = case when patch ? 'submitted_at' then (patch->>'submitted_at')::timestamptz else submitted_at end,
    notes = case when patch ? 'notes' then nullif(btrim(coalesce(patch->>'notes','')), '') else notes end
  where id = application_id and user_id = owner_id
  returning * into row_out;

  return to_jsonb(row_out);
end;
$$;

revoke all on function chatgpt.get_opportunity_applications(boolean) from public, anon, authenticated;
revoke all on function chatgpt.create_opportunity_application(text, timestamptz, text) from public, anon, authenticated;
revoke all on function chatgpt.update_opportunity_application(text, jsonb) from public, anon, authenticated;
grant execute on function chatgpt.get_opportunity_applications(boolean) to service_role;
grant execute on function chatgpt.create_opportunity_application(text, timestamptz, text) to service_role;
grant execute on function chatgpt.update_opportunity_application(text, jsonb) to service_role;
