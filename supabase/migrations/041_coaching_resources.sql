-- Extend coaching_videos to support documents (PDF, etc.) and class targeting
alter table public.coaching_videos
  add column if not exists resource_type text not null default 'video'
    check (resource_type in ('video', 'pdf', 'document', 'link')),
  add column if not exists file_url text,
  add column if not exists groupe_ids text[] default '{}';
