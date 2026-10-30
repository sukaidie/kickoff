-- Existing projects: run this migration in the Supabase SQL Editor.
-- Only the match's creator can delete it. Player entries are removed by the
-- existing ON DELETE CASCADE foreign key. Direct player writes stay forbidden.
begin;
drop policy if exists "Organisers delete own matches" on public.matches;
create policy "Organisers delete own matches" on public.matches
  for delete to authenticated using (owner_id = (select auth.uid()));
grant delete on public.matches to authenticated;
commit;
