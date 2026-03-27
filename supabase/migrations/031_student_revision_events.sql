-- Student revision calendar events
create table if not exists public.student_events (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  revision_type text not null check (revision_type in (
    'apprentissage_fiche',
    'revision_fiche',
    'qcm_supplementaires',
    'annales_matiere',
    'annales_chapitre',
    'preparation_seance'
  )),
  matiere_id  uuid references public.matieres(id) on delete set null,
  cours_id    uuid references public.cours(id) on delete set null,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  notes       text,
  completed   boolean default false,
  color       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_student_events_student on public.student_events(student_id);
create index if not exists idx_student_events_start on public.student_events(start_at);

alter table public.student_events enable row level security;

create policy "Students can read own events"
  on public.student_events for select
  using (auth.uid() = student_id);

create policy "Students can insert own events"
  on public.student_events for insert
  with check (auth.uid() = student_id);

create policy "Students can update own events"
  on public.student_events for update
  using (auth.uid() = student_id);

create policy "Students can delete own events"
  on public.student_events for delete
  using (auth.uid() = student_id);

create policy "Admins can read all student events"
  on public.student_events for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'superadmin')
    )
  );
