create table if not exists public.coaching_cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  onboarding_starts_on date,
  intensive_starts_on date,
  cadence_starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season)
);

create table if not exists public.coaching_students (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.coaching_cohorts(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  profile_type text not null
    check (profile_type in ('good_confident', 'good_fragile', 'good_arrogant', 'average_motivated', 'average_unaware')),
  current_status text not null default 'orange'
    check (current_status in ('green', 'orange', 'red')),
  onboarding_completed boolean not null default false,
  onboarding_called_at timestamptz,
  guardian_called_at timestamptz,
  goals jsonb not null default '[]'::jsonb,
  risk_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, student_id)
);

create table if not exists public.coaching_weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.coaching_cohorts(id) on delete cascade,
  coaching_student_id uuid not null references public.coaching_students(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  hours_bucket text not null
    check (hours_bucket in ('lt5', '5_10', '10_20', '20_plus')),
  understanding_level text not null
    check (understanding_level in ('not_at_all', 'a_little', 'mostly_yes', 'fully')),
  mental_state text not null
    check (mental_state in ('lost', 'doubtful', 'okay', 'confident')),
  main_blocker text not null
    check (main_blocker in ('subject', 'organization', 'motivation', 'none')),
  momentum text not null
    check (momentum in ('backward', 'same', 'improving', 'much_better')),
  free_text text,
  computed_status text not null
    check (computed_status in ('green', 'orange', 'red')),
  signal_reasons jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (student_id, week_start)
);

create table if not exists public.coaching_notes (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.coaching_cohorts(id) on delete cascade,
  coaching_student_id uuid not null references public.coaching_students(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  note_type text not null default 'internal'
    check (note_type in ('onboarding_call', 'guardian_call', 'weekly_followup', 'meeting', 'alert', 'internal')),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coaching_interventions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.coaching_cohorts(id) on delete cascade,
  coaching_student_id uuid not null references public.coaching_students(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  requested_by_id uuid references public.profiles(id) on delete set null,
  channel text not null
    check (channel in ('call', 'visio', 'physical', 'email', 'sms', 'whatsapp', 'crisp')),
  status text not null default 'todo'
    check (status in ('todo', 'scheduled', 'done', 'cancelled')),
  reason text not null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_coaching_students_cohort on public.coaching_students(cohort_id);
create index if not exists idx_coaching_students_student on public.coaching_students(student_id);
create index if not exists idx_coaching_students_coach on public.coaching_students(coach_id);
create index if not exists idx_coaching_students_status on public.coaching_students(current_status);

create index if not exists idx_coaching_weekly_checkins_student_week
  on public.coaching_weekly_checkins(student_id, week_start desc);

create index if not exists idx_coaching_notes_student
  on public.coaching_notes(student_id, created_at desc);

create index if not exists idx_coaching_interventions_student
  on public.coaching_interventions(student_id, created_at desc);

alter table public.coaching_cohorts enable row level security;
alter table public.coaching_students enable row level security;
alter table public.coaching_weekly_checkins enable row level security;
alter table public.coaching_notes enable row level security;
alter table public.coaching_interventions enable row level security;

drop policy if exists "coaching_cohorts_admin_full_access" on public.coaching_cohorts;
create policy "coaching_cohorts_admin_full_access"
  on public.coaching_cohorts
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "coaching_students_admin_full_access" on public.coaching_students;
create policy "coaching_students_admin_full_access"
  on public.coaching_students
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "coaching_students_coach_read_assigned" on public.coaching_students;
create policy "coaching_students_coach_read_assigned"
  on public.coaching_students
  for select to authenticated
  using (coach_id = auth.uid());

drop policy if exists "coaching_weekly_checkins_admin_full_access" on public.coaching_weekly_checkins;
create policy "coaching_weekly_checkins_admin_full_access"
  on public.coaching_weekly_checkins
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "coaching_weekly_checkins_coach_read_assigned" on public.coaching_weekly_checkins;
create policy "coaching_weekly_checkins_coach_read_assigned"
  on public.coaching_weekly_checkins
  for select to authenticated
  using (
    exists (
      select 1
      from public.coaching_students cs
      where cs.id = coaching_student_id
        and cs.coach_id = auth.uid()
    )
  );

drop policy if exists "coaching_notes_admin_full_access" on public.coaching_notes;
create policy "coaching_notes_admin_full_access"
  on public.coaching_notes
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "coaching_notes_coach_read_assigned" on public.coaching_notes;
create policy "coaching_notes_coach_read_assigned"
  on public.coaching_notes
  for select to authenticated
  using (
    exists (
      select 1
      from public.coaching_students cs
      where cs.id = coaching_student_id
        and cs.coach_id = auth.uid()
    )
  );

drop policy if exists "coaching_interventions_admin_full_access" on public.coaching_interventions;
create policy "coaching_interventions_admin_full_access"
  on public.coaching_interventions
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "coaching_interventions_coach_read_assigned" on public.coaching_interventions;
create policy "coaching_interventions_coach_read_assigned"
  on public.coaching_interventions
  for select to authenticated
  using (
    exists (
      select 1
      from public.coaching_students cs
      where cs.id = coaching_student_id
        and cs.coach_id = auth.uid()
    )
  );
