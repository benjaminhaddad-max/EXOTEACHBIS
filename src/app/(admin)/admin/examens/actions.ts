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
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("examens").insert({
    name: data.name,
    description: data.description || null,
    debut_at: data.debut_at,
    fin_at: data.fin_at,
    visible: data.visible,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateExamen(
  id: string,
  data: {
    name: string;
    description?: string;
    debut_at: string;
    fin_at: string;
    visible: boolean;
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

export async function addSerieToExamen(examen_id: string, series_id: string, order_index: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("examens_series")
    .insert({ examen_id, series_id, order_index });
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
