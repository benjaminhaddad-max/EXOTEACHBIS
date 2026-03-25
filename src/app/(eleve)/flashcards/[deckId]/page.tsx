import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { FlashcardPlayer } from "@/components/flashcard-player";

export const dynamic = "force-dynamic";

export default async function FlashcardDeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  const supabase = await createClient();

  const [deckRes, cardsRes] = await Promise.all([
    supabase.from("flashcard_decks").select("*, matiere:matieres(name, color)").eq("id", deckId).eq("visible", true).single(),
    supabase.from("flashcards").select("*").eq("deck_id", deckId).order("order_index"),
  ]);

  if (!deckRes.data) notFound();

  return (
    <FlashcardPlayer
      deck={deckRes.data as any}
      cards={(cardsRes.data ?? []) as any[]}
    />
  );
}
