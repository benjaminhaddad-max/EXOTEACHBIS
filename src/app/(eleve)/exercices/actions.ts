"use server";

import { createClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoursNode = {
  id: string;
  name: string;
  dossier_id: string | null;
  order_index: number;
  nb_questions: number;
};

export type DossierNode = {
  id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  order_index: number;
  children: DossierNode[];
  cours: CoursNode[];
  total_questions: number; // recursive sum
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTree(
  flatDossiers: any[],
  coursPerDossier: Map<string, CoursNode[]>,
  parentId: string | null = null
): DossierNode[] {
  return flatDossiers
    .filter((d) => d.parent_id === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .map((d) => {
      const children = buildTree(flatDossiers, coursPerDossier, d.id);
      const directCours = coursPerDossier.get(d.id) ?? [];
      const directCount = directCours.reduce((s, c) => s + c.nb_questions, 0);
      const childCount = children.reduce((s, c) => s + c.total_questions, 0);
      return {
        id: d.id,
        name: d.name,
        color: d.color ?? null,
        parent_id: d.parent_id ?? null,
        order_index: d.order_index ?? 0,
        children,
        cours: directCours,
        total_questions: directCount + childCount,
      };
    })
    .filter((d) => d.total_questions > 0); // hide dossiers with no questions
}

// ─── getExercicesData ──────────────────────────────────────────────────────────

export async function getExercicesData(): Promise<{
  tree: DossierNode[];
  allCours: CoursNode[];
}> {
  const supabase = await createClient();

  const [dossiersRes, matieresRes, coursRes, questionsRes] = await Promise.all([
    supabase
      .from("dossiers")
      .select("id, name, color, parent_id, order_index")
      .eq("visible", true)
      .order("order_index"),
    supabase
      .from("matieres")
      .select("id, dossier_id")
      .eq("visible", true),
    supabase
      .from("cours")
      .select("id, name, matiere_id, dossier_id, order_index")
      .eq("visible", true)
      .order("order_index"),
    supabase.from("questions").select("cours_id"),
  ]);

  // Map matiere_id → dossier_id (pour les cours attachés via matière)
  const matiereToDossier = new Map<string, string>();
  for (const m of matieresRes.data ?? []) {
    if (m.id && m.dossier_id) matiereToDossier.set(m.id, m.dossier_id);
  }

  // Count questions per cours
  const qCount = new Map<string, number>();
  for (const q of questionsRes.data ?? []) {
    if (q.cours_id) qCount.set(q.cours_id, (qCount.get(q.cours_id) ?? 0) + 1);
  }

  // Build cours list — dossier_id direct prioritaire, sinon via matiere_id
  const allCours: CoursNode[] = (coursRes.data ?? [])
    .map((c) => {
      const dossierId = (c as any).dossier_id
        ?? (c.matiere_id ? (matiereToDossier.get(c.matiere_id) ?? null) : null);
      return {
        id: c.id,
        name: c.name,
        dossier_id: dossierId,
        order_index: c.order_index ?? 0,
        nb_questions: qCount.get(c.id) ?? 0,
      };
    })
    .filter((c) => c.dossier_id && c.nb_questions > 0);

  // Group cours by dossier
  const coursPerDossier = new Map<string, CoursNode[]>();
  for (const c of allCours) {
    if (!c.dossier_id) continue;
    if (!coursPerDossier.has(c.dossier_id)) coursPerDossier.set(c.dossier_id, []);
    coursPerDossier.get(c.dossier_id)!.push(c);
  }

  const tree = buildTree(dossiersRes.data ?? [], coursPerDossier);

  return { tree, allCours };
}

// ─── buildTrainingSession ──────────────────────────────────────────────────────

export async function buildTrainingSession(params: {
  coursIds: string[];
  questionType: "all" | "qcm_unique" | "qcm_multiple";
  difficulty: "all" | "easy" | "medium" | "hard";
  maxQuestions: number | null;
  shuffle: boolean;
}): Promise<{ serieId: string } | { error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };
  if (params.coursIds.length === 0) return { error: "Aucun cours sélectionné" };

  // Build questions query
  let query = supabase.from("questions").select("id").in("cours_id", params.coursIds);

  if (params.questionType !== "all") {
    query = query.eq("type", params.questionType);
  }
  if (params.difficulty === "easy") query = query.lte("difficulty", 2);
  else if (params.difficulty === "medium") query = query.eq("difficulty", 3);
  else if (params.difficulty === "hard") query = query.gte("difficulty", 4);

  const { data: questions, error: qErr } = await query;
  if (qErr) return { error: qErr.message };

  let questionIds = (questions ?? []).map((q) => q.id);

  // Shuffle
  if (params.shuffle) {
    for (let i = questionIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]];
    }
  }

  // Limit
  if (params.maxQuestions && questionIds.length > params.maxQuestions) {
    questionIds = questionIds.slice(0, params.maxQuestions);
  }

  if (questionIds.length === 0) {
    return { error: "Aucune question trouvée avec ces filtres. Essaie d'élargir ta sélection." };
  }

  // Create ad-hoc series (not visible in listings)
  const { data: serie, error: sErr } = await supabase
    .from("series")
    .insert({
      name: "Entraînement personnalisé",
      type: "entrainement",
      visible: false,
      timed: false,
      score_definitif: false,
    })
    .select("id")
    .single();

  if (sErr) return { error: sErr.message };

  // Insert questions
  const { error: sqErr } = await supabase.from("series_questions").insert(
    questionIds.map((qid, i) => ({
      series_id: serie.id,
      question_id: qid,
      order_index: i,
    }))
  );

  if (sqErr) return { error: sqErr.message };

  return { serieId: serie.id };
}
