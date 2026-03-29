"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/admin/examens";

export async function createExamen(data: {
  name: string;
  description?: string;
  debut_at: string;
  fin_at: string;
  visible: boolean;
  results_visible?: boolean;
  notation_sur?: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: inserted, error } = await supabase.from("examens").insert({
    name: data.name,
    description: data.description || null,
    debut_at: data.debut_at,
    fin_at: data.fin_at,
    visible: data.visible,
    results_visible: data.results_visible ?? false,
    notation_sur: data.notation_sur ?? 20,
    created_by: user?.id ?? null,
  }).select("*").single();
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true, id: inserted.id, examen: inserted };
}

export async function updateExamen(
  id: string,
  data: {
    name: string;
    description?: string;
    debut_at: string;
    fin_at: string;
    visible: boolean;
    results_visible?: boolean;
    notation_sur?: number;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens")
    .update({
      name: data.name,
      description: data.description || null,
      debut_at: data.debut_at,
      fin_at: data.fin_at,
      visible: data.visible,
      results_visible: data.results_visible ?? false,
      notation_sur: data.notation_sur ?? 20,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  const { data: updated, error: selectError } = await supabase
    .from("examens")
    .select("*")
    .eq("id", id)
    .single();
  if (selectError) return { error: selectError.message };
  revalidatePath(PATH);
  return { success: true, examen: updated };
}

export async function deleteExamen(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("examens").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function addSerieToExamen(
  examen_id: string,
  series_id: string,
  order_index: number,
  coefficient: number = 1,
  debut_at?: string,
  fin_at?: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens_series")
    .insert({ examen_id, series_id, order_index, coefficient, debut_at: debut_at ?? null, fin_at: fin_at ?? null });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateSerieSchedule(
  examen_id: string,
  series_id: string,
  debut_at: string | null,
  fin_at: string | null
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens_series")
    .update({ debut_at, fin_at })
    .eq("examen_id", examen_id)
    .eq("series_id", series_id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateSerieCoefficient(
  examen_id: string,
  series_id: string,
  coefficient: number
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens_series")
    .update({ coefficient })
    .eq("examen_id", examen_id)
    .eq("series_id", series_id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateSerieGroupes(
  examen_id: string,
  series_id: string,
  groupe_ids: string[] | null
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens_series")
    .update({ groupe_ids })
    .eq("examen_id", examen_id)
    .eq("series_id", series_id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function removeSerieFromExamen(examen_id: string, series_id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens_series")
    .delete()
    .eq("examen_id", examen_id)
    .eq("series_id", series_id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function toggleResultsVisibility(id: string, results_visible: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens")
    .update({ results_visible, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function toggleExamenVisibility(id: string, visible: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens")
    .update({ visible, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

// --- Filières ---

export async function getFilieres() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("filieres")
    .select("*")
    .order("order_index");
  if (error) return { error: error.message };
  return { data };
}

export async function createFiliere(data: { name: string; code: string; color?: string }) {
  const supabase = await createClient();
  const { error } = await supabase.from("filieres").insert({
    name: data.name,
    code: data.code,
    color: data.color ?? "#3B82F6",
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/examens");
  return { success: true };
}

export async function deleteFiliere(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("filieres").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/examens");
  return { success: true };
}

// --- Coefficients matière × filière ---

export async function getMatiereCoefficients() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matiere_coefficients")
    .select("*, matiere:matieres(id, name), filiere:filieres(id, name, code)");
  if (error) return { error: error.message };
  return { data };
}

export async function getUniversityFiliereCoefficients(matiere_ids: string[]) {
  if (matiere_ids.length === 0) return { data: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matiere_coefficients")
    .select("*")
    .in("matiere_id", matiere_ids);

  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function ensureSubjectMatiere(subject_dossier_id: string) {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("matieres")
    .select("*")
    .eq("dossier_id", subject_dossier_id)
    .maybeSingle();

  if (existingError) return { error: existingError.message };
  if (existing) return { data: existing };

  const { data: subject, error: subjectError } = await supabase
    .from("dossiers")
    .select("id, name, description, color, icon_url, order_index, visible")
    .eq("id", subject_dossier_id)
    .eq("dossier_type", "subject")
    .single();

  if (subjectError) return { error: subjectError.message };

  const { data: created, error: insertError } = await supabase
    .from("matieres")
    .insert({
      dossier_id: subject.id,
      name: subject.name,
      description: subject.description ?? null,
      color: subject.color ?? "#3B82F6",
      icon_url: subject.icon_url ?? null,
      order_index: subject.order_index ?? 0,
      visible: subject.visible ?? true,
    })
    .select("*")
    .single();

  if (insertError) return { error: insertError.message };

  revalidatePath(PATH);
  revalidatePath("/admin/examens/parametrage");
  return { data: created };
}

export async function ensureUniversityMatiereCoverage(university_dossier_id: string) {
  const supabase = await createClient();

  const { data: semesters, error: semestersError } = await supabase
    .from("dossiers")
    .select("id")
    .eq("parent_id", university_dossier_id)
    .eq("visible", true)
    .in("dossier_type", ["semester", "module", "period"]);

  if (semestersError) return { error: semestersError.message };

  const semesterIds = (semesters ?? []).map((semester) => semester.id);
  if (semesterIds.length === 0) return { data: [] };

  const { data: subjects, error: subjectsError } = await supabase
    .from("dossiers")
    .select("id, name, description, color, icon_url, order_index, visible")
    .in("parent_id", semesterIds)
    .eq("dossier_type", "subject")
    .eq("visible", true)
    .order("order_index");

  if (subjectsError) return { error: subjectsError.message };

  const subjectIds = (subjects ?? []).map((subject) => subject.id);
  if (subjectIds.length === 0) return { data: [] };

  const { data: existingMatieres, error: matieresError } = await supabase
    .from("matieres")
    .select("*")
    .in("dossier_id", subjectIds);

  if (matieresError) return { error: matieresError.message };

  const existingByDossierId = new Map((existingMatieres ?? []).map((matiere) => [matiere.dossier_id, matiere]));
  const missingSubjects = (subjects ?? []).filter((subject) => !existingByDossierId.has(subject.id));

  if (missingSubjects.length > 0) {
    const { error: insertError } = await supabase.from("matieres").insert(
      missingSubjects.map((subject) => ({
        dossier_id: subject.id,
        name: subject.name,
        description: subject.description ?? null,
        color: subject.color ?? "#3B82F6",
        icon_url: subject.icon_url ?? null,
        order_index: subject.order_index ?? 0,
        visible: subject.visible ?? true,
      }))
    );

    if (insertError) return { error: insertError.message };
  }

  const { data: refreshedMatieres, error: refreshedError } = await supabase
    .from("matieres")
    .select("*")
    .in("dossier_id", subjectIds);

  if (refreshedError) return { error: refreshedError.message };

  const matiereBySubjectId = new Map((refreshedMatieres ?? []).map((matiere) => [matiere.dossier_id, matiere]));

  const { data: examenSeriesRows, error: examenSeriesError } = await supabase
    .from("examens_series")
    .select("series_id, series:series(id, name, matiere_id)");

  if (examenSeriesError) return { error: examenSeriesError.message };

  const updates = (examenSeriesRows ?? [])
    .map((row: any) => row.series)
    .filter(Boolean)
    .filter((series: any) => !series.matiere_id)
    .map((series: any) => {
      const matchedSubject = (subjects ?? []).find((subject) =>
        series.name === subject.name ||
        series.name.endsWith(`— ${subject.name}`) ||
        series.name.endsWith(`- ${subject.name}`)
      );

      if (!matchedSubject) return null;

      const matiere = matiereBySubjectId.get(matchedSubject.id);
      if (!matiere) return null;

      return { seriesId: series.id, matiereId: matiere.id };
    })
    .filter(Boolean) as Array<{ seriesId: string; matiereId: string }>;

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("series")
      .update({ matiere_id: update.matiereId })
      .eq("id", update.seriesId);

    if (updateError) return { error: updateError.message };
  }

  revalidatePath(PATH);
  revalidatePath("/admin/examens/parametrage");
  revalidatePath("/admin/examens/[examenId]");
  revalidatePath("/admin/examens/[examenId]/resultats");
  revalidatePath("/examens");
  return { data: refreshedMatieres ?? [] };
}

export async function upsertMatiereCoefficient(
  matiere_id: string,
  filiere_id: string,
  coefficient: number
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("matiere_coefficients")
    .upsert(
      { matiere_id, filiere_id, coefficient },
      { onConflict: "matiere_id,filiere_id" }
    );
  if (error) return { error: error.message };
  revalidatePath("/admin/examens");
  revalidatePath("/admin/examens/parametrage");
  revalidatePath("/examens");
  return { success: true };
}

// --- Groupes ciblés par un examen ---

export async function setExamenGroupes(examen_id: string, groupe_ids: string[]) {
  const supabase = await createClient();
  // Remove existing
  const { error: delErr } = await supabase
    .from("examens_groupes")
    .delete()
    .eq("examen_id", examen_id);
  if (delErr) return { error: delErr.message };
  // Insert new
  if (groupe_ids.length > 0) {
    const { error: insErr } = await supabase
      .from("examens_groupes")
      .insert(groupe_ids.map(groupe_id => ({ examen_id, groupe_id })));
    if (insErr) return { error: insErr.message };
  }
  revalidatePath(PATH);
  return { success: true };
}

// --- Résultats d'examen ---

export async function getExamenResults(examen_id: string) {
  const supabase = await createClient();

  const [resultsRes, serieResultsRes, examenRes] = await Promise.all([
    supabase
      .from("examen_results")
      .select("*, user:profiles(id, first_name, last_name, email, filiere_id, filiere:filieres(id, name, code, color))")
      .eq("examen_id", examen_id)
      .order("score_20", { ascending: false }),
    supabase
      .from("examen_serie_results")
      .select("*, series:series(id, name)")
      .eq("examen_id", examen_id),
    supabase
      .from("examens")
      .select("*, examens_series(series_id, order_index, coefficient, debut_at, fin_at, series:series(id, name, matiere_id, matiere:matieres(id, name)))")
      .eq("id", examen_id)
      .single(),
  ]);

  return {
    results: resultsRes.data ?? [],
    serieResults: serieResultsRes.data ?? [],
    examen: examenRes.data,
    error: resultsRes.error?.message || serieResultsRes.error?.message || examenRes.error?.message,
  };
}

// --- Paramétrage par université (barème QCM + coefficients matières) ---

export async function getUniversityGradingScale(university_dossier_id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("university_grading_scales")
    .select("*")
    .eq("university_dossier_id", university_dossier_id)
    .order("nb_errors");
  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function upsertUniversityGradingScale(
  university_dossier_id: string,
  scales: { nb_errors: number; points: number }[],
) {
  const supabase = await createClient();
  const { error: delErr } = await supabase
    .from("university_grading_scales")
    .delete()
    .eq("university_dossier_id", university_dossier_id);
  if (delErr) return { error: delErr.message };
  if (scales.length > 0) {
    const { error: insErr } = await supabase.from("university_grading_scales").insert(
      scales.map((s) => ({
        university_dossier_id,
        nb_errors: s.nb_errors,
        points: s.points,
      })),
    );
    if (insErr) return { error: insErr.message };
  }
  revalidatePath(PATH);
  revalidatePath("/admin/examens/parametrage");
  return { success: true };
}

export async function getUniversityCoefficients(university_dossier_id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("university_matiere_coefficients")
    .select("*")
    .eq("university_dossier_id", university_dossier_id);
  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function upsertUniversityCoefficient(
  university_dossier_id: string,
  subject_dossier_id: string,
  coefficient: number,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("university_matiere_coefficients").upsert(
    { university_dossier_id, subject_dossier_id, coefficient },
    { onConflict: "university_dossier_id,subject_dossier_id" },
  );
  if (error) return { error: error.message };
  revalidatePath(PATH);
  revalidatePath("/admin/examens/parametrage");
  return { success: true };
}

// --- Config réponse courte par université ---

export async function getShortAnswerConfig(university_dossier_id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("university_short_answer_config")
    .select("*")
    .eq("university_dossier_id", university_dossier_id)
    .single();
  if (error && error.code !== "PGRST116") return { error: error.message };
  return { data: data ?? null };
}

export async function upsertShortAnswerConfig(
  university_dossier_id: string,
  config: { points_correct: number; points_incorrect: number; case_sensitive: boolean },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("university_short_answer_config").upsert(
    { university_dossier_id, ...config, updated_at: new Date().toISOString() },
    { onConflict: "university_dossier_id" },
  );
  if (error) return { error: error.message };
  return { success: true };
}

// --- Config rédaction par université ---

export async function getRedactionConfig(university_dossier_id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("university_redaction_config")
    .select("*")
    .eq("university_dossier_id", university_dossier_id)
    .single();
  if (error && error.code !== "PGRST116") return { error: error.message };
  return { data: data ?? null };
}

export async function upsertRedactionConfig(
  university_dossier_id: string,
  config: { max_points: number },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("university_redaction_config").upsert(
    { university_dossier_id, ...config, updated_at: new Date().toISOString() },
    { onConflict: "university_dossier_id" },
  );
  if (error) return { error: error.message };
  return { success: true };
}

// --- Correction manuelle des rédactions ---

export async function submitRedactionCorrection(
  user_text_answer_id: string,
  score_percent: number,
  comment: string,
  corrected_by: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("redaction_corrections").upsert(
    { user_text_answer_id, score_percent, comment, corrected_by, corrected_at: new Date().toISOString() },
    { onConflict: "user_text_answer_id" },
  );
  if (error) return { error: error.message };
  await supabase
    .from("user_text_answers")
    .update({ is_correct: score_percent >= 50 })
    .eq("id", user_text_answer_id);
  return { success: true };
}
