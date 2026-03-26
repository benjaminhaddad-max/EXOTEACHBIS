alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('superadmin', 'admin', 'coach', 'prof', 'eleve'));

alter table public.groupe_members
  drop constraint if exists groupe_members_role_check;

alter table public.groupe_members
  add constraint groupe_members_role_check
  check (role in ('eleve', 'prof', 'coach'));

alter table public.groupes
  add column if not exists formation_dossier_id uuid references public.dossiers(id) on delete set null;

create index if not exists idx_groupes_formation_dossier_id
  on public.groupes(formation_dossier_id);

create table if not exists public.profile_dossier_access_exclusions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, dossier_id)
);

create index if not exists idx_profile_dossier_access_exclusions_profile_id
  on public.profile_dossier_access_exclusions(profile_id);

create index if not exists idx_profile_dossier_access_exclusions_dossier_id
  on public.profile_dossier_access_exclusions(dossier_id);

alter table public.profile_dossier_access_exclusions enable row level security;

drop policy if exists "profile_dossier_access_exclusions_admin_full_access" on public.profile_dossier_access_exclusions;
create policy "profile_dossier_access_exclusions_admin_full_access"
  on public.profile_dossier_access_exclusions
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "profile_dossier_access_exclusions_read_own" on public.profile_dossier_access_exclusions;
create policy "profile_dossier_access_exclusions_read_own"
  on public.profile_dossier_access_exclusions
  for select to authenticated
  using (profile_id = auth.uid());
