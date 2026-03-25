"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/admin/utilisateurs";

export async function updateUserRole(userId: string, role: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateUserGroupe(userId: string, groupeId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ groupe_id: groupeId, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function createGroupe(data: {
  name: string;
  annee?: string;
  description?: string;
  color: string;
  parent_id?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("groupes").insert({
    name: data.name,
    annee: data.annee || null,
    description: data.description || null,
    color: data.color,
    parent_id: data.parent_id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateGroupe(
  id: string,
  data: { name: string; annee?: string; description?: string; color: string; parent_id?: string | null }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("groupes")
    .update({
      name: data.name,
      annee: data.annee || null,
      description: data.description || null,
      color: data.color,
      parent_id: data.parent_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteGroupe(id: string) {
  const supabase = await createClient();
  // Unlink users first
  await supabase
    .from("profiles")
    .update({ groupe_id: null })
    .eq("groupe_id", id);
  const { error } = await supabase.from("groupes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function toggleGroupeDossierAcces(groupeId: string, dossierId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("groupe_dossier_acces")
    .select("groupe_id")
    .eq("groupe_id", groupeId)
    .eq("dossier_id", dossierId)
    .maybeSingle();

  if (data) {
    const { error } = await supabase
      .from("groupe_dossier_acces")
      .delete()
      .eq("groupe_id", groupeId)
      .eq("dossier_id", dossierId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("groupe_dossier_acces")
      .insert({ groupe_id: groupeId, dossier_id: dossierId });
    if (error) return { error: error.message };
  }

  revalidatePath(PATH);
  return { success: true };
}
