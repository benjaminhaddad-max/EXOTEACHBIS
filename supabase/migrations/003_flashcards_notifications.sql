-- =============================================
-- ExoTeach Next - Phase 3 : Flashcards & Notifications
-- =============================================

-- =============================================
-- 1. FLASHCARDS
-- =============================================

create table if not exists public.flashcard_decks (
  id          uuid primary key default gen_random_uuid(),
  matiere_id  uuid references public.matieres(id) on delete set null,
  name        text not null,
  description text,
  visible     boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.flashcards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references public.flashcard_decks(id) on delete cascade,
  front       text not null,
  back        text not null,
  order_index integer default 0,
  created_at  timestamptz default now()
);

-- RLS Flashcard decks
alter table public.flashcard_decks enable row level security;
create policy "Authenticated can read visible flashcard_decks"
  on public.flashcard_decks for select
  using (auth.uid() is not null and visible = true);
create policy "Admins can manage flashcard_decks"
  on public.flashcard_decks for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- RLS Flashcards
alter table public.flashcards enable row level security;
create policy "Authenticated can read flashcards"
  on public.flashcards for select
  using (auth.uid() is not null);
create policy "Admins can manage flashcards"
  on public.flashcards for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- =============================================
-- 2. NOTIFICATIONS
-- =============================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('annonce', 'forum_reply', 'nouveau_cours', 'examen')),
  title       text not null,
  body        text,
  read        boolean default false,
  link        text,
  created_at  timestamptz default now()
);

-- RLS Notifications
alter table public.notifications enable row level security;
create policy "Users see own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);
create policy "Users update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);
create policy "System can create notifications"
  on public.notifications for insert
  with check (auth.uid() is not null);
create policy "Admins can manage notifications"
  on public.notifications for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));

-- =============================================
-- 3. POSTS — Ajout champ title pour les annonces
-- =============================================

alter table public.posts
  add column if not exists title text;

-- =============================================
-- 4. INDEX
-- =============================================

create index if not exists idx_flashcard_decks_matiere on public.flashcard_decks(matiere_id);
create index if not exists idx_flashcards_deck on public.flashcards(deck_id);
create index if not exists idx_notifications_user on public.notifications(user_id);
create index if not exists idx_notifications_read on public.notifications(user_id, read);
create index if not exists idx_posts_annonce on public.posts(type, created_at desc) where type = 'annonce';
