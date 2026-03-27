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
  }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true, id: inserted.id };
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
  revalidatePath(PATH);
  return { success: true };
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
