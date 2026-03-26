create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

drop policy if exists "admin_settings_admin_full_access" on public.admin_settings;
create policy "admin_settings_admin_full_access"
  on public.admin_settings
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));
