-- ============================================================================
-- 033 — Coaching Redesign: Videos, Chat, RDV
-- ============================================================================

-- ─── 1. coaching_videos ────────────────────────────────────────────────────────

create table if not exists public.coaching_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  video_url text,
  vimeo_id text,
  category text not null check (category in ('motivation', 'methode')),
  university_dossier_id uuid references public.dossiers(id) on delete set null,
  order_index integer not null default 0,
  visible boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_coaching_videos_category on public.coaching_videos(category);
create index if not exists idx_coaching_videos_university on public.coaching_videos(university_dossier_id);

alter table public.coaching_videos enable row level security;

drop policy if exists "coaching_videos_admin_full" on public.coaching_videos;
create policy "coaching_videos_admin_full"
  on public.coaching_videos for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "coaching_videos_students_read" on public.coaching_videos;
create policy "coaching_videos_students_read"
  on public.coaching_videos for select to authenticated
  using (visible = true);

-- ─── 2. Extend qa_threads for coaching ─────────────────────────────────────────

-- Drop old CHECK constraint on context_type and recreate with 'coaching'
alter table public.qa_threads drop constraint if exists qa_threads_context_type_check;
alter table public.qa_threads add constraint qa_threads_context_type_check
  check (context_type in ('dossier','matiere','cours','qcm_question','qcm_option','coaching'));

-- Add assigned_coach_id column
alter table public.qa_threads
  add column if not exists assigned_coach_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_qa_threads_assigned_coach on public.qa_threads(assigned_coach_id);

-- RLS: coaches can see coaching threads assigned to them
drop policy if exists "qa_threads_coach_assigned" on public.qa_threads;
create policy "qa_threads_coach_assigned"
  on public.qa_threads for select to authenticated
  using (
    context_type = 'coaching'
    and assigned_coach_id = auth.uid()
    and public.get_my_role() = 'coach'
  );

-- RLS: coaches can update coaching threads assigned to them
drop policy if exists "qa_threads_coach_update" on public.qa_threads;
create policy "qa_threads_coach_update"
  on public.qa_threads for update to authenticated
  using (
    context_type = 'coaching'
    and assigned_coach_id = auth.uid()
    and public.get_my_role() = 'coach'
  )
  with check (
    context_type = 'coaching'
    and assigned_coach_id = auth.uid()
    and public.get_my_role() = 'coach'
  );

-- RLS: coaches can insert messages into coaching threads assigned to them
drop policy if exists "qa_messages_coach_insert" on public.qa_messages;
create policy "qa_messages_coach_insert"
  on public.qa_messages for insert to authenticated
  with check (
    public.get_my_role() = 'coach'
    and exists (
      select 1 from public.qa_threads
      where qa_threads.id = thread_id
        and qa_threads.context_type = 'coaching'
        and qa_threads.assigned_coach_id = auth.uid()
    )
  );

-- RLS: coaches can read messages from coaching threads assigned to them
drop policy if exists "qa_messages_coach_select" on public.qa_messages;
create policy "qa_messages_coach_select"
  on public.qa_messages for select to authenticated
  using (
    public.get_my_role() = 'coach'
    and exists (
      select 1 from public.qa_threads
      where qa_threads.id = thread_id
        and qa_threads.context_type = 'coaching'
        and qa_threads.assigned_coach_id = auth.uid()
    )
  );

-- ─── 3. Add niveau_initial / mental_initial to coaching_student_profiles ───────

alter table public.coaching_student_profiles
  add column if not exists niveau_initial text
    check (niveau_initial in ('fort', 'moyen', 'fragile')),
  add column if not exists mental_initial text
    check (mental_initial in ('fort', 'moyen', 'fragile'));

-- Make mentality/school_level/work_capacity/method_level nullable since
-- the new system uses niveau_initial/mental_initial instead
alter table public.coaching_student_profiles
  alter column mentality drop not null,
  alter column school_level drop not null,
  alter column work_capacity drop not null,
  alter column method_level drop not null,
  alter column confidence_score drop not null;

-- ─── 4. coaching_rdv_requests ──────────────────────────────────────────────────

create table if not exists public.coaching_rdv_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  groupe_id uuid not null references public.groupes(id) on delete cascade,
  rdv_type text not null check (rdv_type in ('physique', 'appel', 'visio')),
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'completed', 'cancelled')),
  assigned_coach_id uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_coaching_rdv_student on public.coaching_rdv_requests(student_id);
create index if not exists idx_coaching_rdv_coach on public.coaching_rdv_requests(assigned_coach_id);
create index if not exists idx_coaching_rdv_status on public.coaching_rdv_requests(status);

alter table public.coaching_rdv_requests enable row level security;

drop policy if exists "coaching_rdv_admin_coach_full" on public.coaching_rdv_requests;
create policy "coaching_rdv_admin_coach_full"
  on public.coaching_rdv_requests for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin', 'coach']))
  with check (public.get_my_role() = any (array['admin', 'superadmin', 'coach']));

drop policy if exists "coaching_rdv_students_own" on public.coaching_rdv_requests;
create policy "coaching_rdv_students_own"
  on public.coaching_rdv_requests for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- Enable realtime on new tables
alter publication supabase_realtime add table public.coaching_rdv_requests;
