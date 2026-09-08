create or replace function public.github_public_issue_body(
  repository_full_name text,
  issue_number integer
)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_response extensions.http_response;
  v_payload jsonb;
begin
  if coalesce(repository_full_name, '') !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then
    raise exception 'Invalid GitHub repository name';
  end if;
  if issue_number is null or issue_number < 1 then
    raise exception 'Invalid GitHub issue number';
  end if;

  v_response := extensions.http_get(
    format(
      'https://api.github.com/repos/%s/issues/%s',
      repository_full_name,
      issue_number
    )::varchar
  );

  if v_response.status <> 200 then
    return null;
  end if;

  v_payload := v_response.content::jsonb;
  return v_payload->>'body';
exception
  when others then
    return null;
end;
$function$;

create or replace function public.github_public_issue_page(
  repository_full_name text,
  page_number integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_response extensions.http_response;
  v_payload jsonb;
begin
  if coalesce(repository_full_name, '') !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then
    raise exception 'Invalid GitHub repository name';
  end if;
  if page_number is null or page_number < 1 or page_number > 50 then
    raise exception 'Invalid GitHub issue page';
  end if;

  v_response := extensions.http_get(
    format(
      'https://api.github.com/repos/%s/issues?state=all&per_page=100&page=%s',
      repository_full_name,
      page_number
    )::varchar
  );

  if v_response.status <> 200 then
    return '[]'::jsonb;
  end if;

  v_payload := v_response.content::jsonb;
  if jsonb_typeof(v_payload) <> 'array' then
    return '[]'::jsonb;
  end if;
  return v_payload;
exception
  when others then
    return '[]'::jsonb;
end;
$function$;

revoke all on function public.github_public_issue_body(text, integer) from public, anon, authenticated;
revoke all on function public.github_public_issue_page(text, integer) from public, anon, authenticated;
grant execute on function public.github_public_issue_body(text, integer) to service_role;
grant execute on function public.github_public_issue_page(text, integer) to service_role;
