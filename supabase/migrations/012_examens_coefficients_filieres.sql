-- =============================================
-- 012 : Examens enrichis — coefficients, filières, résultats
-- =============================================

-- =============================================
-- 1. FILIÈRES DE SANTÉ
-- =============================================

create table public.filieres (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code        text not null unique,
  color       text default '#3B82F6',
  order_index integer default 0,
  created_at  timestamptz default now()
);

insert into public.filieres (name, code, color, order_index) values
  ('Médecine',    'MED',  '#DC2626', 0),
  ('Dentaire',    'DENT', '#2563EB', 1),
  ('Pharmacie',   'PHAR', '#16A34A', 2),
  ('Maïeutique',  'MAIE', '#9333EA', 3),
  ('Kinésithérapie', 'KINE', '#EA580C', 4);

alter table public.filieres enable row level security;
create policy "Authenticated can read filieres"
  on public.filieres for select using (auth.uid() is not null);
create policy "Admins can manage filieres"
  on public.filieres for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- =============================================
-- 2. COEFFICIENTS PAR MATIÈRE × FILIÈRE
-- Poids d'une matière pour chaque filière
-- Ex: Anatomie coeff 3 pour Médecine, coeff 1 pour Pharmacie
-- =============================================

create table public.matiere_coefficients (
  id          uuid primary key default gen_random_uuid(),
  matiere_id  uuid not null references public.matieres(id) on delete cascade,
  filiere_id  uuid not null references public.filieres(id) on delete cascade,
  coefficient numeric(4,2) not null default 1,
  unique (matiere_id, filiere_id)
);

alter table public.matiere_coefficients enable row level security;
create policy "Authenticated can read matiere_coefficients"
  on public.matiere_coefficients for select using (auth.uid() is not null);
create policy "Admins can manage matiere_coefficients"
  on public.matiere_coefficients for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- =============================================
-- 3. ENRICHIR examens_series AVEC COEFFICIENTS
-- =============================================

alter table public.examens_series
  add column if not exists coefficient numeric(4,2) not null default 1;

-- Activer RLS sur examens_series (manquant dans la migration 002)
alter table public.examens_series enable row level security;
create policy "Authenticated can read examens_series"
  on public.examens_series for select using (auth.uid() is not null);
create policy "Admins can manage examens_series"
  on public.examens_series for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Activer RLS sur examens_groupes aussi
alter table public.examens_groupes enable row level security;
create policy "Authenticated can read examens_groupes"
  on public.examens_groupes for select using (auth.uid() is not null);
create policy "Admins can manage examens_groupes"
  on public.examens_groupes for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- =============================================
-- 4. ENRICHIR examens AVEC CHAMPS SUPPLÉMENTAIRES
-- =============================================

alter table public.examens
  add column if not exists results_visible boolean default false,
  add column if not exists notation_sur numeric(4,1) default 20,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- =============================================
-- 5. RÉSULTATS D'EXAMEN (score global par élève)
-- =============================================

create table public.examen_results (
  id              uuid primary key default gen_random_uuid(),
  examen_id       uuid not null references public.examens(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  score_raw       numeric(6,2),
  score_20        numeric(5,2),
  nb_series_done  integer default 0,
  nb_series_total integer default 0,
  started_at      timestamptz default now(),
  completed_at    timestamptz,
  unique (examen_id, user_id)
);

alter table public.examen_results enable row level security;
create policy "Users can read own examen_results"
  on public.examen_results for select
  using (auth.uid() = user_id);
create policy "Admins can manage examen_results"
  on public.examen_results for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));
create policy "Users can insert own examen_results"
  on public.examen_results for insert
  with check (auth.uid() = user_id);
create policy "Users can update own examen_results"
  on public.examen_results for update
  using (auth.uid() = user_id);

-- Résultats par série dans un examen (détail)
create table public.examen_serie_results (
  id              uuid primary key default gen_random_uuid(),
  examen_result_id uuid not null references public.examen_results(id) on delete cascade,
  examen_id       uuid not null references public.examens(id) on delete cascade,
  series_id       uuid not null references public.series(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  attempt_id      uuid references public.serie_attempts(id) on delete set null,
  score           numeric(5,2),
  score_20        numeric(5,2),
  nb_correct      integer default 0,
  nb_total        integer default 0,
  completed_at    timestamptz,
  unique (examen_id, series_id, user_id)
);

alter table public.examen_serie_results enable row level security;
create policy "Users can read own examen_serie_results"
  on public.examen_serie_results for select
  using (auth.uid() = user_id);
create policy "Admins can manage examen_serie_results"
  on public.examen_serie_results for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));
create policy "Users can insert own examen_serie_results"
  on public.examen_serie_results for insert
  with check (auth.uid() = user_id);
create policy "Users can update own examen_serie_results"
  on public.examen_serie_results for update
  using (auth.uid() = user_id);

-- =============================================
-- 6. CLASSEMENTS PAR FILIÈRE
-- Vue matérialisée pour les classements par filière
-- =============================================

-- Filière de l'élève (ajout colonne sur profiles)
alter table public.profiles
  add column if not exists filiere_id uuid references public.filieres(id) on delete set null;

-- =============================================
-- 7. ADMIN peut voir tous les examen_results
-- (policy pour lire les résultats de tous les élèves)
-- =============================================

create policy "Admins can read all examen_results"
  on public.examen_results for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin', 'prof')));

create policy "Admins can read all examen_serie_results"
  on public.examen_serie_results for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin', 'prof')));
