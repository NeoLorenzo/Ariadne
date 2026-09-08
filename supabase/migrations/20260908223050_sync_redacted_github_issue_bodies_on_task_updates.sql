create or replace function public.sync_redacted_github_issue_bodies_before_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_task jsonb;
  v_old_task jsonb;
  v_body text;
  v_result jsonb := '[]'::jsonb;
begin
  for v_task in
    select value
    from jsonb_array_elements(coalesce(new.tasks, '[]'::jsonb))
  loop
    if lower(coalesce(v_task->>'sourceType', '')) = 'github-issue' then
      select value into v_old_task
      from jsonb_array_elements(coalesce(old.tasks, '[]'::jsonb))
      where value->>'id' = v_task->>'id'
      limit 1;

      if v_old_task is null
         or coalesce(v_old_task->>'githubIssueUpdatedAt', '') is distinct from coalesce(v_task->>'githubIssueUpdatedAt', '') then
        v_body := public.github_public_issue_body(
          v_task->>'githubRepositoryFullName',
          nullif(v_task->>'githubIssueNumber', '')::integer
        );
        if v_body is not null then
          v_task := jsonb_set(v_task, '{description}', to_jsonb(v_body), true);
        end if;
      end if;
    end if;

    v_result := v_result || jsonb_build_array(v_task);
    v_old_task := null;
    v_body := null;
  end loop;

  new.tasks := v_result;
  return new;
end;
$function$;

drop trigger if exists sync_redacted_github_issue_bodies_before_update_trigger on public.user_tasks;
create trigger sync_redacted_github_issue_bodies_before_update_trigger
before update of tasks on public.user_tasks
for each row
execute function public.sync_redacted_github_issue_bodies_before_update();
