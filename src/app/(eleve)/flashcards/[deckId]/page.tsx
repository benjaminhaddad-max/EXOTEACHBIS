import { redirect } from "next/navigation";

export default async function LegacyFlashcardDeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  redirect(`/cours/flashcards/${deckId}`);
}
