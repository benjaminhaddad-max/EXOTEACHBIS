-- =============================================
-- 013: Profil utilisateur enrichi + périmètre d'accès contenu
-- =============================================

alter table public.profiles
  add column if not exists phone text,
  add column if not exists access_dossier_id uuid references public.dossiers(id) on delete set null;

create index if not exists idx_profiles_access_dossier_id
  on public.profiles(access_dossier_id);

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'superadmin')
    )
  );

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'superadmin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'superadmin')
    )
  );
