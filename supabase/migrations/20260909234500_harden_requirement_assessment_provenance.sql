drop policy if exists opportunity_requirement_assessments_owner_insert on public.opportunity_requirement_assessments;
drop policy if exists opportunity_requirement_assessments_owner_update on public.opportunity_requirement_assessments;
drop policy if exists opportunity_requirement_assessments_owner_delete on public.opportunity_requirement_assessments;

create policy opportunity_requirement_assessments_owner_insert
  on public.opportunity_requirement_assessments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_ariadne_owner()
    and assessed_by = 'user'
  );

create policy opportunity_requirement_assessments_owner_update
  on public.opportunity_requirement_assessments for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_ariadne_owner()
    and assessed_by = 'user'
  )
  with check (
    user_id = auth.uid()
    and public.is_ariadne_owner()
    and assessed_by = 'user'
  );

create policy opportunity_requirement_assessments_owner_delete
  on public.opportunity_requirement_assessments for delete
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_ariadne_owner()
    and assessed_by = 'user'
  );
