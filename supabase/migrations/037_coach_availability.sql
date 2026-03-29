-- ============================================================================
-- 037 — Coach recurring availability + slot_type
-- ============================================================================

-- Add slot_type to existing coaching_call_slots
alter table public.coaching_call_slots
  add column if not exists slot_type text
    default 'rdv_visio'
    check (slot_type in ('rdv_physique', 'rdv_visio', 'rdv_tel', 'chat'));

-- Recurring weekly availability template
create table if not exists public.coach_recurring_availability (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  start_time time not null,
  end_time time not null,
  slot_type text not null check (slot_type in ('rdv_physique', 'rdv_visio', 'rdv_tel', 'chat')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_recurring_end_after_start check (end_time > start_time)
);

create index if not exists idx_coach_recurring_coach on public.coach_recurring_availability(coach_id);

alter table public.coach_recurring_availability enable row level security;

-- Coaches can manage their own, admins can manage all
drop policy if exists "coach_recurring_own" on public.coach_recurring_availability;
create policy "coach_recurring_own"
  on public.coach_recurring_availability for all to authenticated
  using (
    coach_id = auth.uid()
    or public.get_my_role() = any (array['admin', 'superadmin'])
  )
  with check (
    coach_id = auth.uid()
    or public.get_my_role() = any (array['admin', 'superadmin'])
  );
