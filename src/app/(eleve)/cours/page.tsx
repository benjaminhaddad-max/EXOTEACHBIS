import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { EleveCoursShell } from "@/components/eleve/cours-shell";
import { getExercicesData } from "@/app/(eleve)/exercices/actions";
import { canAccessMatiere, filterDossiersByAccess, getAccessScopeForUser } from "@/lib/access-scope";
import type { Cours, Matiere } from "@/types/database";
import type { SerieSummaryForStudent } from "@/components/eleve/matiere-exercices-view";

export const dynamic = "force-dynamic";

export default async function CoursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [dossiersRes, matieresRes, coursRes, flashcardDecksRes, scope, exercicesData, seriesRes] = await Promise.all([
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    supabase.from("matieres").select("*").eq("visible", true).order("order_index"),
    supabase.from("cours").select("*").eq("visible", true).order("order_index"),
    supabase
      .from("flashcard_decks")
      .select("id, name, description, matiere_id, cours_id, visible, matiere:matieres(name, color), flashcards(id)")
      .eq("visible", true)
      .order("created_at", { ascending: false }),
    getAccessScopeForUser(supabase, user!.id),
    getExercicesData(),
    supabase
      .from("series")
      .select("id, name, type, timed, duration_minutes, annee, matiere_id, cours_id")
      .eq("visible", true)
      .order("created_at", { ascending: false }),
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

  // Build series summaries for student view
  const allSeriesRaw = (seriesRes.data ?? []) as Array<{
    id: string; name: string; type: string; timed: boolean;
    duration_minutes: number | null; annee: string | null;
    matiere_id: string | null; cours_id: string | null;
  }>;

  // Filter to allowed matières/cours, then fetch question counts + attempts
  const accessibleSeries = allSeriesRaw.filter((s) => {
    if (s.matiere_id && allowedMatiereIds.has(s.matiere_id)) return true;
    if (s.cours_id && allowedCoursIds.has(s.cours_id)) return true;
    return false;
  });

  const serieIds = accessibleSeries.map((s) => s.id);
  let questionCounts = new Map<string, number>();
  let attemptScores = new Map<string, number>();

  if (serieIds.length > 0) {
    const [countRes, attemptsRes] = await Promise.all([
      supabase.from("series_questions").select("series_id").in("series_id", serieIds),
      supabase.from("serie_attempts").select("series_id, score").eq("user_id", user!.id).in("series_id", serieIds).order("ended_at", { ascending: false }),
    ]);
    if (countRes.data) {
      for (const row of countRes.data) {
        questionCounts.set(row.series_id, (questionCounts.get(row.series_id) ?? 0) + 1);
      }
    }
    if (attemptsRes.data) {
      for (const a of attemptsRes.data) {
        if (!attemptScores.has(a.series_id) && a.score != null) {
          attemptScores.set(a.series_id, a.score);
        }
      }
    }
  }

  const allSeries: SerieSummaryForStudent[] = accessibleSeries.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    timed: s.timed,
    duration_minutes: s.duration_minutes,
    annee: s.annee,
    matiere_id: s.matiere_id,
    cours_id: s.cours_id,
    nb_questions: questionCounts.get(s.id) ?? 0,
    last_score: attemptScores.get(s.id) ?? null,
  }));

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header title="Cours & Exercices" />
      <EleveCoursShell
        initialDossiers={dossiers}
        initialMatieres={matieres}
        initialCours={cours}
        initialFlashcardDecks={flashcardDecks}
        initialExerciceTree={exercicesData.tree}
        initialExerciceCours={exercicesData.allCours}
        userId={user!.id}
        initialSeries={allSeries}
      />
    </div>
  );
}
