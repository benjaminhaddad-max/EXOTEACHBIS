-- =============================================
-- ExoTeach Next - Phase 1 : Schéma contenu complet
-- =============================================

-- =============================================
-- 1. MISE À JOUR DES RÔLES
-- =============================================
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists groupe_id uuid;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('superadmin', 'admin', 'prof', 'eleve'));

-- Mettre à jour le trigger pour supporter les nouveaux rôles
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
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- =============================================
-- 2. HIÉRARCHIE DE CONTENU
-- =============================================

-- Dossiers (arborescence infinie via parent_id)
create table public.dossiers (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.dossiers(id) on delete cascade,
  name        text not null,
  description text,
  icon_url    text,
  color       text default '#3B82F6',
  order_index integer default 0,
  visible     boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Matières (feuilles de l'arborescence contenant les cours)
create table public.matieres (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.dossiers(id) on delete cascade,
  name        text not null,
  description text,
  color       text default '#3B82F6',
  icon_url    text,
  order_index integer default 0,
  visible     boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Cours (fiche PDF + métadonnées)
create table public.cours (
  id           uuid primary key default gen_random_uuid(),
  matiere_id   uuid not null references public.matieres(id) on delete cascade,
  name         text not null,
  description  text,
  pdf_path     text,                    -- chemin dans Supabase Storage
  pdf_url      text,                    -- URL publique ou signée
  version      integer default 1,
  nb_pages     integer default 0,
  order_index  integer default 0,
  visible      boolean default true,
  tags         text[] default '{}',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- =============================================
-- 3. EXERCICES (QCM)
-- =============================================

-- Questions
create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  cours_id    uuid references public.cours(id) on delete set null,
  matiere_id  uuid references public.matieres(id) on delete set null,
  text        text not null,
  explanation text,                           -- explication de la réponse correcte
  type        text not null default 'qcm_unique'
                check (type in ('qcm_unique', 'qcm_multiple')),
  tags        text[] default '{}',
  difficulty  integer default 2 check (difficulty between 1 and 5),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Options de réponse (A à E)
create table public.options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label       text not null check (label in ('A', 'B', 'C', 'D', 'E')),
  text        text not null,
  is_correct  boolean not null default false,
  order_index integer default 0
);

-- Séries d'exercices
create table public.series (
  id          uuid primary key default gen_random_uuid(),
  cours_id    uuid references public.cours(id) on delete set null,
  matiere_id  uuid references public.matieres(id) on delete set null,
  name        text not null,
  description text,
  type        text not null default 'entrainement'
                check (type in ('entrainement', 'concours_blanc', 'revision')),
  timed       boolean default false,
  duration_minutes integer,              -- durée si timed = true
  score_definitif boolean default false, -- note ne peut pas être modifiée
  visible     boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Lien séries ↔ questions
create table public.series_questions (
  series_id   uuid not null references public.series(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  order_index integer default 0,
  primary key (series_id, question_id)
);

-- =============================================
-- 4. TRACKING ÉTUDIANT
-- =============================================

-- Progression par cours
create table public.user_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  cours_id      uuid not null references public.cours(id) on delete cascade,
  pct_complete  integer default 0 check (pct_complete between 0 and 100),
  current_page  integer default 1,
  last_seen_at  timestamptz default now(),
  primary key (user_id, cours_id)
);

-- Tentatives de séries
create table public.serie_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  series_id     uuid not null references public.series(id) on delete cascade,
  started_at    timestamptz default now(),
  ended_at      timestamptz,
  score         numeric(5,2),           -- pourcentage 0-100
  nb_correct    integer default 0,
  nb_total      integer default 0,
  timed         boolean default false,
  time_spent_s  integer                 -- secondes passées
);

-- Réponses par tentative
create table public.user_answers (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references public.serie_attempts(id) on delete cascade,
  question_id     uuid not null references public.questions(id) on delete cascade,
  selected_labels text[] not null default '{}',   -- ['A', 'C']
  is_correct      boolean not null,
  time_spent_s    integer
);

-- =============================================
-- 5. EXAMENS / CONCOURS BLANCS
-- =============================================

create table public.examens (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  debut_at    timestamptz not null,
  fin_at      timestamptz not null,
  visible     boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Séries dans un examen (un examen peut contenir plusieurs séries)
create table public.examens_series (
  examen_id   uuid not null references public.examens(id) on delete cascade,
  series_id   uuid not null references public.series(id) on delete cascade,
  order_index integer default 0,
  primary key (examen_id, series_id)
);

-- Groupes assignés à un examen
create table public.examens_groupes (
  examen_id   uuid not null references public.examens(id) on delete cascade,
  groupe_id   uuid not null,
  primary key (examen_id, groupe_id)
);

-- =============================================
-- 6. GROUPES & PRÉSENCE
-- =============================================

create table public.groupes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  annee       text,                              -- '2025-04-27'
  description text,
  color       text default '#3B82F6',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table public.groupe_members (
  groupe_id   uuid not null references public.groupes(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'eleve' check (role in ('eleve', 'prof')),
  joined_at   timestamptz default now(),
  primary key (groupe_id, user_id)
);

create table public.absences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  groupe_id   uuid references public.groupes(id) on delete set null,
  date        date not null,
  type        text not null default 'absent_non_justifie'
                check (type in ('present', 'absent_justifie', 'absent_non_justifie')),
  note        text,
  created_at  timestamptz default now()
);

-- =============================================
-- 7. COMMUNICATION
-- =============================================

create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  cours_id    uuid references public.cours(id) on delete cascade,
  groupe_id   uuid references public.groupes(id) on delete set null,
  parent_id   uuid references public.posts(id) on delete cascade,
  content     text not null,
  content_json jsonb,                            -- rich text TipTap
  type        text not null default 'annonce'
                check (type in ('annonce', 'forum_question', 'forum_reply')),
  pinned      boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- =============================================
-- 8. PLANNING
-- =============================================

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  type        text default 'cours' check (type in ('cours', 'examen', 'reunion', 'autre')),
  groupe_id   uuid references public.groupes(id) on delete set null,
  zoom_link   text,
  location    text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- =============================================
-- 9. ABONNEMENTS
-- =============================================

create table public.abonnements (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  plan                     text not null check (plan in ('mensuel', 'trimestriel', 'annuel')),
  status                   text not null default 'active'
                             check (status in ('active', 'cancelled', 'past_due', 'trialing')),
  stripe_subscription_id   text unique,
  stripe_customer_id       text,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- =============================================
-- 10. RLS (Row Level Security)
-- =============================================

-- Dossiers : lecture publique pour les connectés
alter table public.dossiers enable row level security;
create policy "Authenticated can read dossiers"
  on public.dossiers for select
  using (auth.uid() is not null and visible = true);
create policy "Admins can manage dossiers"
  on public.dossiers for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Matières
alter table public.matieres enable row level security;
create policy "Authenticated can read matieres"
  on public.matieres for select
  using (auth.uid() is not null and visible = true);
create policy "Admins can manage matieres"
  on public.matieres for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Cours
alter table public.cours enable row level security;
create policy "Authenticated can read cours"
  on public.cours for select
  using (auth.uid() is not null and visible = true);
create policy "Admins can manage cours"
  on public.cours for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Questions
alter table public.questions enable row level security;
create policy "Authenticated can read questions"
  on public.questions for select
  using (auth.uid() is not null);
create policy "Admins can manage questions"
  on public.questions for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Options
alter table public.options enable row level security;
create policy "Authenticated can read options"
  on public.options for select
  using (auth.uid() is not null);
create policy "Admins can manage options"
  on public.options for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Séries
alter table public.series enable row level security;
create policy "Authenticated can read series"
  on public.series for select
  using (auth.uid() is not null and visible = true);
create policy "Admins can manage series"
  on public.series for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- series_questions
alter table public.series_questions enable row level security;
create policy "Authenticated can read series_questions"
  on public.series_questions for select
  using (auth.uid() is not null);
create policy "Admins can manage series_questions"
  on public.series_questions for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- user_progress : chacun voit le sien, admins voient tout
alter table public.user_progress enable row level security;
create policy "Users see own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);
create policy "Users update own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);
create policy "Users can upsert own progress"
  on public.user_progress for update
  using (auth.uid() = user_id);
create policy "Admins see all progress"
  on public.user_progress for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin', 'prof')));

-- serie_attempts
alter table public.serie_attempts enable row level security;
create policy "Users see own attempts"
  on public.serie_attempts for select
  using (auth.uid() = user_id);
create policy "Users create own attempts"
  on public.serie_attempts for insert
  with check (auth.uid() = user_id);
create policy "Users update own attempts"
  on public.serie_attempts for update
  using (auth.uid() = user_id);
create policy "Admins see all attempts"
  on public.serie_attempts for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin', 'prof')));

-- user_answers
alter table public.user_answers enable row level security;
create policy "Users manage own answers"
  on public.user_answers for all
  using (exists (select 1 from public.serie_attempts where id = attempt_id and user_id = auth.uid()));

-- Posts
alter table public.posts enable row level security;
create policy "Authenticated can read posts"
  on public.posts for select
  using (auth.uid() is not null);
create policy "Users can create posts"
  on public.posts for insert
  with check (auth.uid() = author_id);
create policy "Authors and admins can update posts"
  on public.posts for update
  using (auth.uid() = author_id or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin', 'prof')));

-- Events
alter table public.events enable row level security;
create policy "Authenticated can read events"
  on public.events for select
  using (auth.uid() is not null);
create policy "Admins and profs can manage events"
  on public.events for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin', 'prof')));

-- Groupes
alter table public.groupes enable row level security;
create policy "Authenticated can read groupes"
  on public.groupes for select
  using (auth.uid() is not null);
create policy "Admins can manage groupes"
  on public.groupes for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Groupe members
alter table public.groupe_members enable row level security;
create policy "Users can see their group memberships"
  on public.groupe_members for select
  using (auth.uid() = user_id or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin', 'prof')));
create policy "Admins can manage groupe_members"
  on public.groupe_members for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Examens
alter table public.examens enable row level security;
create policy "Authenticated can read examens"
  on public.examens for select
  using (auth.uid() is not null and visible = true);
create policy "Admins can manage examens"
  on public.examens for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- Abonnements
alter table public.abonnements enable row level security;
create policy "Users see own abonnements"
  on public.abonnements for select
  using (auth.uid() = user_id);
create policy "Admins see all abonnements"
  on public.abonnements for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- =============================================
-- 11. INDEX
-- =============================================
create index idx_dossiers_parent on public.dossiers(parent_id);
create index idx_matieres_dossier on public.matieres(dossier_id);
create index idx_cours_matiere on public.cours(matiere_id);
create index idx_questions_cours on public.questions(cours_id);
create index idx_questions_matiere on public.questions(matiere_id);
create index idx_options_question on public.options(question_id);
create index idx_series_cours on public.series(cours_id);
create index idx_user_progress_user on public.user_progress(user_id);
create index idx_serie_attempts_user on public.serie_attempts(user_id);
create index idx_serie_attempts_series on public.serie_attempts(series_id);
create index idx_posts_cours on public.posts(cours_id);
create index idx_posts_type on public.posts(type);
create index idx_events_start on public.events(start_at);
create index idx_groupe_members_user on public.groupe_members(user_id);

-- =============================================
-- 12. FONCTION UTILITAIRE : stats admin
-- =============================================
create or replace function public.get_admin_stats()
returns json as $$
declare
  result json;
begin
  select json_build_object(
    'total_users',     (select count(*) from public.profiles),
    'total_cours',     (select count(*) from public.cours where visible = true),
    'total_questions', (select count(*) from public.questions),
    'total_answers',   (select count(*) from public.user_answers),
    'total_groupes',   (select count(*) from public.groupes)
  ) into result;
  return result;
end;
$$ language plpgsql security definer;
