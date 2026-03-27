import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { EleveCoursShell } from "@/components/eleve/cours-shell";
import { canAccessMatiere, filterDossiersByAccess, getAccessScopeForUser } from "@/lib/access-scope";
import type { Cours, Matiere } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CoursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [dossiersRes, matieresRes, coursRes, flashcardDecksRes, scope] = await Promise.all([
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    supabase.from("matieres").select("*").eq("visible", true).order("order_index"),
    supabase.from("cours").select("*").eq("visible", true).order("order_index"),
    supabase
      .from("flashcard_decks")
      .select("id, name, description, matiere_id, cours_id, visible, matiere:matieres(name, color), flashcards(id)")
      .eq("visible", true)
      .order("created_at", { ascending: false }),
    getAccessScopeForUser(supabase, user!.id),
  ]);

  const dossiers = filterDossiersByAccess(dossiersRes.data ?? [], scope);
  const matieres = ((matieresRes.data ?? []) as Matiere[]).filter((matiere) => canAccessMatiere(matiere, scope));
  const allowedMatiereIds = new Set(matieres.map((matiere) => matiere.id));
  const cours = ((coursRes.data ?? []) as Cours[]).filter((cours) => {
    if (cours.dossier_id) {
      return scope.allowedDossierIds.has(cours.dossier_id);
    }

    return cours.matiere_id ? allowedMatiereIds.has(cours.matiere_id) : false;
  });
  const allowedCoursIds = new Set(cours.map((cours) => cours.id));
  const flashcardDecks = ((flashcardDecksRes.data ?? []) as unknown as Array<{
    id: string;
    name: string;
    description: string | null;
    matiere_id: string | null;
    cours_id: string | null;
    visible: boolean;
    matiere?: { name: string; color: string } | { name: string; color: string }[] | null;
    flashcards?: { id: string }[];
  }>).filter((deck) => {
    if (deck.matiere_id && allowedMatiereIds.has(deck.matiere_id)) return true;
    if (deck.cours_id && allowedCoursIds.has(deck.cours_id)) return true;
    return false;
  }).map((deck) => ({
    id: deck.id,
    name: deck.name,
    description: deck.description,
    matiere_id: deck.matiere_id,
    cours_id: deck.cours_id,
    visible: deck.visible,
    matiere: Array.isArray(deck.matiere) ? deck.matiere[0] ?? null : deck.matiere ?? null,
    nb_cards: deck.flashcards?.length ?? 0,
  }));

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header title="Cours & Exercices" />
      <EleveCoursShell
        initialDossiers={dossiers}
        initialMatieres={matieres}
        initialCours={cours}
        initialFlashcardDecks={flashcardDecks}
      />
    </div>
  );
}
