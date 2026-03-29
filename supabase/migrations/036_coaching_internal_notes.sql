-- ============================================================================
-- 036 — Notes internes coaching (échanges privés admin ↔ coach par thread)
-- ============================================================================

create table if not exists public.coaching_internal_notes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.qa_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_coaching_internal_notes_thread on public.coaching_internal_notes(thread_id);

alter table public.coaching_internal_notes enable row level security;

-- Only admins and coaches can see/write internal notes
drop policy if exists "coaching_internal_notes_staff" on public.coaching_internal_notes;
create policy "coaching_internal_notes_staff"
  on public.coaching_internal_notes for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin', 'coach']))
  with check (public.get_my_role() = any (array['admin', 'superadmin', 'coach']));

-- Enable realtime
alter publication supabase_realtime add table public.coaching_internal_notes;
