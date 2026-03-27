-- Add attachments column to posts for images/PDFs in announcements
alter table public.posts
  add column if not exists attachments jsonb default '[]'::jsonb;
