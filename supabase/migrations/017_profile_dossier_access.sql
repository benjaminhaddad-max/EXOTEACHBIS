create table if not exists public.profile_dossier_acces (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, dossier_id)
);

create index if not exists idx_profile_dossier_acces_profile_id
  on public.profile_dossier_acces(profile_id);

create index if not exists idx_profile_dossier_acces_dossier_id
  on public.profile_dossier_acces(dossier_id);

insert into public.profile_dossier_acces (profile_id, dossier_id)
select p.id, p.access_dossier_id
from public.profiles p
where p.access_dossier_id is not null
on conflict (profile_id, dossier_id) do nothing;

alter table public.profile_dossier_acces enable row level security;

drop policy if exists "profile_dossier_acces_admin_full_access" on public.profile_dossier_acces;
create policy "profile_dossier_acces_admin_full_access"
  on public.profile_dossier_acces
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "profile_dossier_acces_read_own" on public.profile_dossier_acces;
create policy "profile_dossier_acces_read_own"
  on public.profile_dossier_acces
  for select to authenticated
  using (profile_id = auth.uid());
