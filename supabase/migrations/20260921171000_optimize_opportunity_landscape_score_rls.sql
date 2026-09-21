-- Avoid per-row auth.uid() evaluation in the canonical Landscape score SELECT policy.

drop policy if exists opportunity_landscape_scores_owner_select
  on public.opportunity_landscape_scores;

create policy opportunity_landscape_scores_owner_select
  on public.opportunity_landscape_scores for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_ariadne_owner());
