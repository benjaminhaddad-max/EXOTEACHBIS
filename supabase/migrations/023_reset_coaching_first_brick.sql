drop table if exists public.coaching_interventions cascade;
drop table if exists public.coaching_notes cascade;
drop table if exists public.coaching_weekly_checkins cascade;
drop table if exists public.coaching_students cascade;
drop table if exists public.coaching_cohorts cascade;

create table if not exists public.coaching_intake_forms (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  groupe_id uuid references public.groupes(id) on delete set null,
  phone text,
  city text,
  bac_specialties text,
  parcours_label text,
  why_medicine text,
  expectations text,
  main_worry text,
  current_method_description text,
  strengths text,
  weaknesses text,
  availability_notes text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coaching_call_slots (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  groupe_id uuid not null references public.groupes(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, start_at, end_at)
);

create table if not exists public.coaching_call_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique references public.coaching_call_slots(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  groupe_id uuid not null references public.groupes(id) on delete cascade,
  intake_form_id uuid references public.coaching_intake_forms(id) on delete set null,
  status text not null default 'booked'
    check (status in ('booked', 'completed', 'cancelled', 'no_show')),
  booked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coaching_student_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  groupe_id uuid not null references public.groupes(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  intake_form_id uuid references public.coaching_intake_forms(id) on delete set null,
  booking_id uuid references public.coaching_call_bookings(id) on delete set null,
  mentality text not null
    check (mentality in ('passif', 'pessimiste', 'optimiste')),
  school_level text not null
    check (school_level in ('limite', 'normal', 'bon')),
  work_capacity text not null
    check (work_capacity in ('faible', 'moyenne', 'forte')),
  method_level text not null
    check (method_level in ('mauvaise', 'moyenne', 'bonne')),
  confidence_score integer not null check (confidence_score >= 0 and confidence_score <= 100),
  coach_report text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_coaching_intake_forms_student on public.coaching_intake_forms(student_id);
create index if not exists idx_coaching_call_slots_group_start on public.coaching_call_slots(groupe_id, start_at);
create index if not exists idx_coaching_call_slots_coach_start on public.coaching_call_slots(coach_id, start_at);
create index if not exists idx_coaching_call_bookings_student on public.coaching_call_bookings(student_id, booked_at desc);
create index if not exists idx_coaching_call_bookings_coach on public.coaching_call_bookings(coach_id, booked_at desc);
create index if not exists idx_coaching_student_profiles_student on public.coaching_student_profiles(student_id);

alter table public.coaching_intake_forms enable row level security;
alter table public.coaching_call_slots enable row level security;
alter table public.coaching_call_bookings enable row level security;
alter table public.coaching_student_profiles enable row level security;

drop policy if exists "coaching_intake_forms_admin_coach_full_access" on public.coaching_intake_forms;
create policy "coaching_intake_forms_admin_coach_full_access"
  on public.coaching_intake_forms
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin', 'coach']))
  with check (public.get_my_role() = any (array['admin', 'superadmin', 'coach']));

drop policy if exists "coaching_intake_forms_students_manage_own" on public.coaching_intake_forms;
create policy "coaching_intake_forms_students_manage_own"
  on public.coaching_intake_forms
  for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "coaching_call_slots_admin_coach_full_access" on public.coaching_call_slots;
create policy "coaching_call_slots_admin_coach_full_access"
  on public.coaching_call_slots
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin', 'coach']))
  with check (public.get_my_role() = any (array['admin', 'superadmin', 'coach']));

drop policy if exists "coaching_call_slots_students_read_group" on public.coaching_call_slots;
create policy "coaching_call_slots_students_read_group"
  on public.coaching_call_slots
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.groupe_id = coaching_call_slots.groupe_id
    )
  );

drop policy if exists "coaching_call_bookings_admin_coach_full_access" on public.coaching_call_bookings;
create policy "coaching_call_bookings_admin_coach_full_access"
  on public.coaching_call_bookings
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin', 'coach']))
  with check (public.get_my_role() = any (array['admin', 'superadmin', 'coach']));

drop policy if exists "coaching_call_bookings_students_read_own" on public.coaching_call_bookings;
create policy "coaching_call_bookings_students_read_own"
  on public.coaching_call_bookings
  for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "coaching_student_profiles_admin_coach_full_access" on public.coaching_student_profiles;
create policy "coaching_student_profiles_admin_coach_full_access"
  on public.coaching_student_profiles
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin', 'coach']))
  with check (public.get_my_role() = any (array['admin', 'superadmin', 'coach']));
