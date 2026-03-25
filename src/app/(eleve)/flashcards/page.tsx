import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { Layers, BookOpen, ArrowRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function FlashcardsElevePage() {
  const supabase = await createClient();

  const { data: decks } = await supabase
    .from("flashcard_decks")
    .select("*, matiere:matieres(name, color), flashcards(id)")
    .eq("visible", true)
    .order("created_at", { ascending: false });

  const decksWithCount = (decks ?? []).map((d: any) => ({
    ...d,
    nb_cards: d.flashcards?.length ?? 0,
    flashcards: undefined,
  }));

  return (
    <div>
      <Header title="Flashcards" />

      {decksWithCount.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-navy/30" />
          <h3 className="mt-4 text-lg font-semibold text-navy">Aucun deck disponible</h3>
          <p className="mt-2 text-sm text-gray-500">Les flashcards ajoutées par vos formateurs apparaîtront ici.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decksWithCount.map((deck: any) => (
            <Link
              key={deck.id}
              href={`/flashcards/${deck.id}`}
              className="group bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: deck.matiere?.color ? `${deck.matiere.color}20` : "#6366F120" }}>
                  <Layers size={20} style={{ color: deck.matiere?.color ?? "#6366F1" }} />
                </div>
                <span className="text-xs text-gray-400">{deck.nb_cards} carte{deck.nb_cards !== 1 ? "s" : ""}</span>
              </div>

              <h3 className="font-semibold text-gray-900 text-sm mb-1">{deck.name}</h3>
              {deck.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{deck.description}</p>}

              {deck.matiere && (
                <span className="inline-block text-xs px-2 py-0.5 rounded-full text-white font-medium mb-3" style={{ backgroundColor: deck.matiere.color }}>
                  {deck.matiere.name}
                </span>
              )}

              <div className="flex items-center gap-1 text-xs text-indigo-600 font-medium group-hover:gap-2 transition-all">
                Réviser <ArrowRight size={12} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
