import { createClient } from "@/lib/supabase/server";
import { FlashcardsAdminShell } from "@/components/admin/flashcards/flashcards-admin-shell";
import type { Matiere } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function FlashcardsAdminPage() {
  const supabase = await createClient();

  const [decksRes, matieresRes] = await Promise.all([
    supabase
      .from("flashcard_decks")
      .select("*, matiere:matieres(name, color), flashcards(id)")
      .order("created_at", { ascending: false }),
    supabase.from("matieres").select("*").order("name"),
  ]);

  const decks = (decksRes.data ?? []).map((d: any) => ({
    ...d,
    nb_cards: d.flashcards?.length ?? 0,
    flashcards: undefined,
  }));

  return (
    <FlashcardsAdminShell
      initialDecks={decks as any[]}
      matieres={(matieresRes.data ?? []) as Matiere[]}
    />
  );
}
