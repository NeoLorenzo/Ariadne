-- Fix the Opportunity Landscape timestamp trigger search path so it does not inherit a mutable role path.

create or replace function public.set_opportunity_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
