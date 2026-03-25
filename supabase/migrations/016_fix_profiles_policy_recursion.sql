drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
  on public.profiles for update
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));
