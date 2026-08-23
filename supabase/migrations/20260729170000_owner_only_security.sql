begin;

-- Central owner check used by every general application policy.
create or replace function public.is_fabbro_owner()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() is not null
    and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com';
$$;

revoke all on function public.is_fabbro_owner() from public;
grant execute on function public.is_fabbro_owner() to authenticated;

-- Explicitly remove anonymous privileges from every private table.
revoke all on table
  public.user_tasks,
  public.user_tasks_backups,
  public.user_projects,
  public.user_projects_backups,
  public.directions,
  public.direction_revisions,
  public.strategic_objectives,
  public.outcome_goals,
  public.outcome_goal_revisions,
  public.goat_score_entries,
  public.goat_strength_lifts,
  public.goat_cognitive_tests,
  public.goat_academic_stage_results,
  public.goat_academic_module_results,
  public.goat_health_characteristics,
  public.goat_misc_characteristics,
  public.goat_immutable_characteristics,
  public.goat_academic_notes,
  public.goat_strength_profile,
  public.external_signal_cache
from anon;

drop policy if exists "Users can read own tasks" on public.user_tasks;
create policy "Users can read own tasks"
on public.user_tasks for select to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can insert own tasks" on public.user_tasks;
create policy "Users can insert own tasks"
on public.user_tasks for insert to authenticated
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can update own tasks" on public.user_tasks;
create policy "Users can update own tasks"
on public.user_tasks for update to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner())
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can read own task backups" on public.user_tasks_backups;
create policy "Users can read own task backups"
on public.user_tasks_backups for select to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can insert own task backups" on public.user_tasks_backups;
create policy "Users can insert own task backups"
on public.user_tasks_backups for insert to authenticated
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can read own projects" on public.user_projects;
create policy "Users can read own projects"
on public.user_projects for select to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can insert own projects" on public.user_projects;
create policy "Users can insert own projects"
on public.user_projects for insert to authenticated
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can update own projects" on public.user_projects;
create policy "Users can update own projects"
on public.user_projects for update to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner())
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can read own project backups" on public.user_projects_backups;
create policy "Users can read own project backups"
on public.user_projects_backups for select to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users can insert own project backups" on public.user_projects_backups;
create policy "Users can insert own project backups"
on public.user_projects_backups for insert to authenticated
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users manage own directions" on public.directions;
create policy "Users manage own directions"
on public.directions for all to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner())
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users read own direction revisions" on public.direction_revisions;
create policy "Users read own direction revisions"
on public.direction_revisions for select to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users insert own direction revisions" on public.direction_revisions;
create policy "Users insert own direction revisions"
on public.direction_revisions for insert to authenticated
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users delete own direction revisions" on public.direction_revisions;
create policy "Users delete own direction revisions"
on public.direction_revisions for delete to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users manage own strategic objectives" on public.strategic_objectives;
create policy "Users manage own strategic objectives"
on public.strategic_objectives for all to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner())
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users manage own outcome goals" on public.outcome_goals;
create policy "Users manage own outcome goals"
on public.outcome_goals for all to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner())
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users read own outcome goal revisions" on public.outcome_goal_revisions;
create policy "Users read own outcome goal revisions"
on public.outcome_goal_revisions for select to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users insert own outcome goal revisions" on public.outcome_goal_revisions;
create policy "Users insert own outcome goal revisions"
on public.outcome_goal_revisions for insert to authenticated
with check (auth.uid() = user_id and public.is_fabbro_owner());

drop policy if exists "Users delete own outcome goal revisions" on public.outcome_goal_revisions;
create policy "Users delete own outcome goal revisions"
on public.outcome_goal_revisions for delete to authenticated
using (auth.uid() = user_id and public.is_fabbro_owner());

grant select on table public.external_signal_cache to authenticated;
revoke insert, update, delete on table public.external_signal_cache from authenticated;
drop policy if exists "Anyone can read external signal cache" on public.external_signal_cache;
drop policy if exists "Authorized owner can read external signal cache" on public.external_signal_cache;
create policy "Authorized owner can read external signal cache"
on public.external_signal_cache for select to authenticated
using (public.is_fabbro_owner());

-- Remove the retired repository-seeded academic routine without deleting its rows.
drop function if exists public.seed_goat_academics_for_current_user();

-- Refresh now happens only during an authorized app session.
do $$
declare
  refresh_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid
    into refresh_job_id
    from cron.job
    where jobname = 'refresh-lorenzo-roque-substack-signal'
    limit 1;

    if refresh_job_id is not null then
      perform cron.unschedule(refresh_job_id);
    end if;
  end if;
end;
$$;

commit;
