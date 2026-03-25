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
  type: "qcm_unique" | "qcm_multiple";
  tags?: string[];
  difficulty: number;
  matiere_id?: string | null;
  cours_id?: string | null;
  image_url?: string | null;
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

  const { data: question, error } = await supabase
    .from("questions")
    .insert(insertData)
    .select("id")
    .single();

  if (error) return { error: error.message };

  const options = data.options.map((opt: any, i: number) => ({
    question_id: question.id,
    label: opt.label,
    text: opt.text,
    is_correct: opt.is_correct,
    order_index: i,
    justification: opt.justification || null,
    ...(opt.image_url !== undefined ? { image_url: opt.image_url || null } : {}),
  }));

  const { error: optError } = await supabase.from("options").insert(options);
  if (optError) return { error: optError.message };

  revalidatePath(PATH);
  return { success: true, id: question.id };
}

export async function updateQuestion(
  id: string,
  data: {
    text: string;
    explanation?: string;
    type: "qcm_unique" | "qcm_multiple";
    tags?: string[];
    difficulty: number;
    matiere_id?: string | null;
    cours_id?: string | null;
    image_url?: string | null;
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

  const { error } = await supabase.from("questions").update(updateData).eq("id", id);

  if (error) return { error: error.message };

  // Replace options
  await supabase.from("options").delete().eq("question_id", id);

  const options = data.options.map((opt: any, i: number) => ({
    question_id: id,
    label: opt.label,
    text: opt.text,
    is_correct: opt.is_correct,
    order_index: i,
    justification: opt.justification || null,
    ...(opt.image_url !== undefined ? { image_url: opt.image_url || null } : {}),
  }));

  const { error: optError } = await supabase.from("options").insert(options);
  if (optError) return { error: optError.message };

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
  revalidatePath(PATH);
  return { success: true, id: serie.id };
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
