import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SQL = `
-- =============================================
-- ExoTeach Next - Phase 3 : Flashcards & Notifications
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

alter table public.flashcard_decks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='flashcard_decks' and policyname='Authenticated can read visible flashcard_decks') then
    create policy "Authenticated can read visible flashcard_decks"
      on public.flashcard_decks for select
      using (auth.uid() is not null and visible = true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='flashcard_decks' and policyname='Admins can manage flashcard_decks') then
    create policy "Admins can manage flashcard_decks"
      on public.flashcard_decks for all
      using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));
  end if;
end $$;

alter table public.flashcards enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='flashcards' and policyname='Authenticated can read flashcards') then
    create policy "Authenticated can read flashcards"
      on public.flashcards for select
      using (auth.uid() is not null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='flashcards' and policyname='Admins can manage flashcards') then
    create policy "Admins can manage flashcards"
      on public.flashcards for all
      using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));
  end if;
end $$;

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

alter table public.notifications enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='Users see own notifications') then
    create policy "Users see own notifications"
      on public.notifications for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='Users update own notifications') then
    create policy "Users update own notifications"
      on public.notifications for update
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='System can create notifications') then
    create policy "System can create notifications"
      on public.notifications for insert
      with check (auth.uid() is not null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='Admins can manage notifications') then
    create policy "Admins can manage notifications"
      on public.notifications for all
      using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));
  end if;
end $$;

alter table public.posts add column if not exists title text;

create index if not exists idx_flashcard_decks_matiere on public.flashcard_decks(matiere_id);
create index if not exists idx_flashcards_deck on public.flashcards(deck_id);
create index if not exists idx_notifications_user on public.notifications(user_id);
create index if not exists idx_notifications_read on public.notifications(user_id, read);
create index if not exists idx_posts_annonce on public.posts(type, created_at desc) where type = 'annonce';
`;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const resp = await fetch(`${url}/rest/v1/rpc/exec_migration`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ sql: SQL }),
  });

  if (!resp.ok) {
    // Fallback: use pg-meta endpoint
    const pgResp = await fetch(`${url.replace('.supabase.co', '.supabase.co')}/pg-meta/v1/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pg-meta-db": "postgres",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query: SQL }),
    });

    if (!pgResp.ok) {
      const text = await pgResp.text();
      return NextResponse.json({ ok: false, error: text }, { status: 500 });
    }
    const data = await pgResp.json();
    return NextResponse.json({ ok: true, method: "pg-meta", data });
  }

  const data = await resp.json();
  return NextResponse.json({ ok: true, method: "rpc", data });
}
