-- =============================================
-- ExoTeach Next - Phase 1 Schema
-- =============================================
-- À exécuter dans l'éditeur SQL de Supabase Dashboard

-- Table des profils utilisateurs
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  first_name text,
  last_name text,
  role text not null default 'eleve' check (role in ('admin', 'eleve')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Activer RLS
alter table public.profiles enable row level security;

-- Les utilisateurs peuvent voir leur propre profil
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Les utilisateurs peuvent modifier leur propre profil
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Les admins peuvent voir tous les profils
create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Trigger pour créer automatiquement un profil à l'inscription
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'eleve')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Index pour les recherches par rôle
create index idx_profiles_role on public.profiles(role);

-- =============================================
-- Pour créer le premier admin :
-- 1. S'inscrire normalement via /register
-- 2. Exécuter cette commande en remplaçant l'email :
--
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'votre@email.com';
-- =============================================
