"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/admin/exercices";

// =============================================
// QUESTIONS
// =============================================

export async function createQuestion(data: {
  text: string;
  explanation?: string;
  type: "qcm_unique" | "qcm_multiple" | "short_answer" | "redaction";
  tags?: string[];
  difficulty: number;
  matiere_id?: string | null;
  cours_id?: string | null;
  image_url?: string | null;
  correct_answer?: string | null;
  options: { label: string; text: string; is_correct: boolean; justification?: string; image_url?: string | null }[];
}) {
  const supabase = await createClient();

  const insertData: any = {
    text: data.text,
    explanation: data.explanation || null,
    type: data.type,
    tags: data.tags ?? [],
    difficulty: data.difficulty,
    matiere_id: data.matiere_id || null,
    cours_id: data.cours_id || null,
  };
  if (data.image_url !== undefined) insertData.image_url = data.image_url || null;
  if (data.correct_answer !== undefined) insertData.correct_answer = data.correct_answer || null;

  const { data: question, error } = await supabase
    .from("questions")
    .insert(insertData)
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Only insert options for QCM types
  if (data.type === "qcm_unique" || data.type === "qcm_multiple") {
    const options = data.options.map((opt: any, i: number) => ({
      question_id: question.id,
      label: opt.label,
      text: opt.text,
      is_correct: opt.is_correct,
      order_index: i,
      justification: opt.justification || null,
      ...(opt.image_url !== undefined ? { image_url: opt.image_url || null } : {}),
    }));
    if (options.length > 0) {
      const { error: optError } = await supabase.from("options").insert(options);
      if (optError) return { error: optError.message };
    }
  }

  revalidatePath(PATH);
  return { success: true, id: question.id };
}

export async function updateQuestion(
  id: string,
  data: {
    text: string;
    explanation?: string;
    type: "qcm_unique" | "qcm_multiple" | "short_answer" | "redaction";
    tags?: string[];
    difficulty: number;
    matiere_id?: string | null;
    cours_id?: string | null;
    image_url?: string | null;
    correct_answer?: string | null;
    options: { label: string; text: string; is_correct: boolean; justification?: string; image_url?: string | null }[];
  }
) {
  const supabase = await createClient();

  const updateData: any = {
    text: data.text,
    explanation: data.explanation || null,
    type: data.type,
    tags: data.tags ?? [],
    difficulty: data.difficulty,
    matiere_id: data.matiere_id || null,
    cours_id: data.cours_id || null,
    updated_at: new Date().toISOString(),
  };
  if (data.image_url !== undefined) updateData.image_url = data.image_url || null;
  if (data.correct_answer !== undefined) updateData.correct_answer = data.correct_answer || null;

  const { error } = await supabase.from("questions").update(updateData).eq("id", id);
  if (error) return { error: error.message };

  // Replace options only for QCM types; clear for others
  await supabase.from("options").delete().eq("question_id", id);

  if (data.type === "qcm_unique" || data.type === "qcm_multiple") {
    const options = data.options.map((opt: any, i: number) => ({
      question_id: id,
      label: opt.label,
      text: opt.text,
      is_correct: opt.is_correct,
      order_index: i,
      justification: opt.justification || null,
      ...(opt.image_url !== undefined ? { image_url: opt.image_url || null } : {}),
    }));
    if (options.length > 0) {
      const { error: optError } = await supabase.from("options").insert(options);
      if (optError) return { error: optError.message };
    }
  }

  revalidatePath(PATH);
  return { success: true };
}

export async function deleteQuestion(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function batchCreateQuestions(questions: Array<{
  text: string;
  explanation?: string;
  type: string;
  difficulty: number;
  cours_id?: string | null;
  options: Array<{ label: string; text: string; is_correct: boolean; justification?: string }>;
}>) {
  const supabase = await createClient();
  const results: { id: string; cours_id: string | null }[] = [];
  const errors: string[] = [];

  for (const q of questions) {
    const { data: question, error } = await supabase
      .from("questions")
      .insert({
        text: q.text,
        explanation: q.explanation || null,
        type: q.type || "qcm_multiple",
        tags: [],
        difficulty: q.difficulty,
        cours_id: q.cours_id || null,
        matiere_id: null,
      })
      .select("id")
      .single();

    if (error) { errors.push(error.message); continue; }

    const opts = q.options.map((opt, i) => ({
      question_id: question.id,
      label: opt.label,
      text: opt.text,
      is_correct: opt.is_correct,
      order_index: i,
      justification: opt.justification || null,
    }));

    const { error: optErr } = await supabase.from("options").insert(opts);
    if (optErr) errors.push(optErr.message);
    else results.push({ id: question.id, cours_id: q.cours_id || null });
  }

  revalidatePath(PATH);
  revalidatePath("/admin/pedagogie");
  return { success: true, created: results.length, errors };
}

// =============================================
// SÉRIES
// =============================================

export async function createSerie(data: {
  name: string;
  description?: string;
  type: "entrainement" | "concours_blanc" | "revision" | "annales" | "qcm_supplementaires";
  timed: boolean;
  duration_minutes?: number | null;
  score_definitif: boolean;
  visible: boolean;
  matiere_id?: string | null;
  cours_id?: string | null;
  annee?: string | null;
  sections?: string[];
}) {
  const supabase = await createClient();
  const { data: serie, error } = await supabase
    .from("series")
    .insert({
      name: data.name,
      description: data.description || null,
      type: data.type,
      timed: data.timed,
      duration_minutes: data.timed ? (data.duration_minutes ?? null) : null,
      score_definitif: data.score_definitif,
      visible: data.visible,
      matiere_id: data.matiere_id || null,
      cours_id: data.cours_id || null,
      annee: data.annee || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Auto-link serie to other offers based on university link_rules
  if (serie?.id && (data.cours_id || data.matiere_id)) {
    try {
      await autoLinkSerieByRules(supabase, serie.id, data, data.sections);
    } catch {
      // Auto-link is best-effort
    }
  }

  revalidatePath(PATH);
  return { success: true, id: serie.id };
}

async function autoLinkSerieByRules(
  supabase: any,
  serieId: string,
  data: {
    name: string;
    description?: string;
    type: string;
    timed: boolean;
    duration_minutes?: number | null;
    score_definitif: boolean;
    visible: boolean;
    cours_id?: string | null;
    matiere_id?: string | null;
    annee?: string | null;
  },
  sections?: string[],
) {
  // Get all dossiers to walk the tree
  const { data: allDossiers } = await supabase
    .from("dossiers")
    .select("id, name, parent_id, dossier_type, formation_offer, link_rules");
  if (!allDossiers) return;

  type DRow = { id: string; name: string; parent_id: string | null; dossier_type: string; formation_offer: string | null; link_rules: any };
  const byId = new Map((allDossiers as DRow[]).map((d) => [d.id, d]));

  // Find the dossier_id of the course or matiere to walk up from
  let startDossierId: string | null = null;

  if (data.cours_id) {
    const { data: cours } = await supabase.from("cours").select("dossier_id, etiquettes").eq("id", data.cours_id).single();
    if (cours) startDossierId = cours.dossier_id;
    // Use course etiquette as section if not provided
    if (!sections?.length && cours?.etiquettes?.[0]) sections = [cours.etiquettes[0]];
  }

  if (!startDossierId) {
    // Try to find dossier from matiere (legacy path)
    return;
  }

  // Walk up to find subject name, university (with link_rules), current offer code
  let subjectName: string | null = null;
  let uniName: string | null = null;
  let uniLinkRules: { sections: Record<string, string[]> } | null = null;
  let currentOfferCode: string | null = null;
  let cur: string | null = startDossierId;
  while (cur) {
    const d = byId.get(cur);
    if (!d) break;
    if (d.dossier_type === "subject" && !subjectName) subjectName = d.name;
    if (d.dossier_type === "university" && !uniName) {
      uniName = d.name;
      if (d.link_rules) uniLinkRules = d.link_rules;
    }
    if (d.dossier_type === "offer") {
      currentOfferCode = d.formation_offer ?? null;
      break;
    }
    cur = d.parent_id;
  }

  if (!uniLinkRules || !subjectName || !uniName || !currentOfferCode) return;
  if (!sections?.length) return;

  // Collect all target offer codes from all selected sections
  const targetOfferCodes = new Set<string>();
  for (const section of sections) {
    const offers = uniLinkRules.sections[section];
    if (offers) {
      for (const o of offers) {
        if (o !== currentOfferCode) targetOfferCodes.add(o);
      }
    }
  }
  if (targetOfferCodes.size === 0) return;

  // Set linked_serie_id on the source serie
  const linkId = serieId;
  await supabase.from("series").update({ linked_serie_id: linkId }).eq("id", serieId);

  // For each target offer, find the matching subject and clone the serie
  for (const targetOfferCode of targetOfferCodes) {
    for (const d of allDossiers as DRow[]) {
      if (d.dossier_type !== "subject" || d.name !== subjectName) continue;
      // Walk up to check uni name and offer
      let dUni: string | null = null;
      let dOfferCode: string | null = null;
      let c: string | null = d.parent_id;
      while (c) {
        const p = byId.get(c);
        if (!p) break;
        if (p.dossier_type === "university" && !dUni) dUni = p.name;
        if (p.dossier_type === "offer") { dOfferCode = p.formation_offer ?? null; break; }
        c = p.parent_id;
      }
      if (dUni === uniName && dOfferCode === targetOfferCode) {
        // Found the target subject — find a matching cours_id there
        let targetCoursId: string | null = null;
        if (data.cours_id) {
          // Find the linked course in the target subject
          const { data: sourceCours } = await supabase
            .from("cours")
            .select("linked_cours_id")
            .eq("id", data.cours_id)
            .single();
          if (sourceCours?.linked_cours_id) {
            const { data: targetCours } = await supabase
              .from("cours")
              .select("id")
              .eq("linked_cours_id", sourceCours.linked_cours_id)
              .eq("dossier_id", d.id)
              .limit(1)
              .single();
            targetCoursId = targetCours?.id ?? null;
          }
        }
        // If no linked cours found, use any first course in target subject
        if (!targetCoursId) {
          const { data: anyCours } = await supabase
            .from("cours")
            .select("id")
            .eq("dossier_id", d.id)
            .limit(1)
            .single();
          targetCoursId = anyCours?.id ?? null;
        }

        if (!targetCoursId) break; // No course in target, can't link

        // Clone the serie
        await supabase.from("series").insert({
          name: data.name,
          description: data.description || null,
          type: data.type,
          timed: data.timed,
          duration_minutes: data.timed ? (data.duration_minutes ?? null) : null,
          score_definitif: data.score_definitif,
          visible: data.visible,
          cours_id: targetCoursId,
          matiere_id: null,
          annee: data.annee || null,
          linked_serie_id: linkId,
        });
        break; // One match per offer
      }
    }
  }
}

export async function updateSerie(
  id: string,
  data: {
    name: string;
    description?: string;
    type: "entrainement" | "concours_blanc" | "revision" | "annales" | "qcm_supplementaires";
    timed: boolean;
    duration_minutes?: number | null;
    score_definitif: boolean;
    visible: boolean;
    matiere_id?: string | null;
    cours_id?: string | null;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("series")
    .update({
      name: data.name,
      description: data.description || null,
      type: data.type,
      timed: data.timed,
      duration_minutes: data.timed ? (data.duration_minutes ?? null) : null,
      score_definitif: data.score_definitif,
      visible: data.visible,
      matiere_id: data.matiere_id || null,
      cours_id: data.cours_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateSerieAnnee(id: string, annee: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("series").update({ annee }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteSerie(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("series").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

// =============================================
// COMPOSITEUR — questions dans une série
// =============================================

export async function addQuestionToSerie(
  series_id: string,
  question_id: string,
  order_index: number
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("series_questions")
    .insert({ series_id, question_id, order_index })
    .select();

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function removeQuestionFromSerie(
  series_id: string,
  question_id: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("series_questions")
    .delete()
    .eq("series_id", series_id)
    .eq("question_id", question_id);

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function removeAllQuestionsFromSerie(series_id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("series_questions")
    .delete()
    .eq("series_id", series_id);

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

// =============================================
// SECTIONS (Parties)
// =============================================

export async function createSection(
  series_id: string,
  title: string,
  intro_text?: string | null,
  image_url?: string | null,
  order_index?: number,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("series_sections")
    .insert({ series_id, title, intro_text: intro_text ?? null, image_url: image_url ?? null, order_index: order_index ?? 0 })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true, id: data.id };
}

export async function updateSection(
  section_id: string,
  updates: { title?: string; intro_text?: string | null; image_url?: string | null; order_index?: number },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("series_sections").update(updates).eq("id", section_id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteSection(section_id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("series_sections").delete().eq("id", section_id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function assignQuestionToSection(
  series_id: string,
  question_id: string,
  section_id: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("series_questions")
    .update({ section_id })
    .eq("series_id", series_id)
    .eq("question_id", question_id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function getSeriesSections(series_id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("series_sections")
    .select("*")
    .eq("series_id", series_id)
    .order("order_index");
  return data ?? [];
}

export async function reorderSerieQuestions(
  series_id: string,
  question_ids: string[]
) {
  const supabase = await createClient();
  const updates = question_ids.map((question_id, i) =>
    supabase
      .from("series_questions")
      .update({ order_index: i })
      .eq("series_id", series_id)
      .eq("question_id", question_id)
  );

  await Promise.all(updates);
  revalidatePath(PATH);
  return { success: true };
}

// =============================================
// BATCH WITH SERIE — Création par IA avec série
// =============================================

export async function batchCreateQuestionsWithSerie(
  questions: {
    text: string;
    explanation?: string;
    type: "qcm_unique" | "qcm_multiple";
    difficulty: number;
    matiere_id?: string | null;
    options: { label: string; text: string; is_correct: boolean }[];
  }[],
  serie?: {
    name: string;
    type: "entrainement" | "concours_blanc" | "revision" | "annales" | "qcm_supplementaires";
    matiere_id?: string | null;
  }
) {
  const supabase = await createClient();
  const createdIds: string[] = [];

  for (const q of questions) {
    const { data: question, error } = await supabase
      .from("questions")
      .insert({
        text: q.text,
        explanation: q.explanation || null,
        type: q.type,
        tags: [],
        difficulty: q.difficulty,
        matiere_id: q.matiere_id || null,
        cours_id: null,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };

    const options = q.options.map((opt, i) => ({
      question_id: question.id,
      label: opt.label,
      text: opt.text,
      is_correct: opt.is_correct,
      order_index: i,
    }));

    const { error: optError } = await supabase.from("options").insert(options);
    if (optError) return { error: optError.message };

    createdIds.push(question.id);
  }

  let serieId: string | undefined;

  if (serie) {
    const { data: serieData, error: serieError } = await supabase
      .from("series")
      .insert({
        name: serie.name,
        type: serie.type,
        matiere_id: serie.matiere_id || null,
        timed: false,
        score_definitif: false,
        visible: true,
      })
      .select("id")
      .single();

    if (serieError) return { error: serieError.message };
    serieId = serieData.id;

    const serieQuestions = createdIds.map((qid, i) => ({
      series_id: serieId,
      question_id: qid,
      order_index: i,
    }));

    const { error: sqError } = await supabase.from("series_questions").insert(serieQuestions);
    if (sqError) return { error: sqError.message };
  }

  revalidatePath(PATH);
  return { success: true, questionIds: createdIds, serieId };
}

// =============================================
// TOGGLE VISIBILITÉ SÉRIE
// =============================================

export async function toggleSerieVisible(id: string, visible: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("series")
    .update({ visible, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}
