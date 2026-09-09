-- Restrict Opportunity Landscape table privileges to the CRUD operations exposed by the app.
-- Row-level security remains responsible for owner-only row access.

revoke all privileges on table public.opportunities from public;
revoke all privileges on table public.opportunities from anon;
revoke all privileges on table public.opportunities from authenticated;

grant select, insert, update, delete on table public.opportunities to authenticated;
grant all privileges on table public.opportunities to service_role;
