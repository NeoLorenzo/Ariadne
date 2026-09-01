begin;

do $$
declare
  old_function regprocedure := to_regprocedure('public.is_fabbro_owner()');
  new_function regprocedure := to_regprocedure('public.is_ariadne_owner()');
begin
  if old_function is not null and new_function is null then
    execute 'alter function public.is_fabbro_owner() rename to is_ariadne_owner';
  elsif old_function is not null and new_function is not null then
    raise exception
      'Owner helper migration is ambiguous: both public.is_fabbro_owner() and public.is_ariadne_owner() exist';
  elsif old_function is null and new_function is null then
    raise exception
      'Owner helper migration cannot proceed: neither public.is_fabbro_owner() nor public.is_ariadne_owner() exists';
  end if;
end;
$$;

revoke all on function public.is_ariadne_owner() from public;
grant execute on function public.is_ariadne_owner() to authenticated;

commit;
