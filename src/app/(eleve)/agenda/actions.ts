"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { RevisionType, Matiere, Cours } from "@/types/database";
import {
  getAccessScopeForUser,
  canAccessMatiere,
} from "@/lib/access-scope";

export async function getStudentMatieresCours() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { matieres: [], cours: [] };

  const scope = await getAccessScopeForUser(supabase, user.id);

  const [matRes, coursRes] = await Promise.all([
    supabase
      .from("matieres")
      .select("id, name, color, dossier_id, order_index")
      .eq("visible", true)
      .order("order_index"),
    supabase
      .from("cours")
      .select("id, name, matiere_id, dossier_id, order_index")
      .eq("visible", true)
      .order("order_index"),
  ]);

  const allMatieres = (matRes.data ?? []) as Pick<Matiere, "id" | "name" | "color" | "dossier_id" | "order_index">[];
  const accessibleMatieres = allMatieres.filter((m) => canAccessMatiere(m, scope));
  const accessibleMatiereIds = new Set(accessibleMatieres.map((m) => m.id));

  const allCours = (coursRes.data ?? []) as Pick<Cours, "id" | "name" | "matiere_id" | "dossier_id" | "order_index">[];
  const cours = allCours.filter((c) => {
    if (c.dossier_id) return scope.allowedDossierIds.has(c.dossier_id);
    return c.matiere_id ? accessibleMatiereIds.has(c.matiere_id) : false;
  });

  const matiereIdsWithCours = new Set(cours.map((c) => c.matiere_id).filter(Boolean) as string[]);
  const matieres = accessibleMatieres.filter((m) => matiereIdsWithCours.has(m.id));

  return {
    matieres: matieres.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      dossier_id: m.dossier_id,
    })),
    cours: cours.map((c) => ({
      id: c.id,
      name: c.name,
      matiere_id: c.matiere_id,
      dossier_id: c.dossier_id,
    })),
  };
}

export async function createStudentEvent(data: {
  title: string;
  revision_type: RevisionType;
  matiere_id: string | null;
  cours_id: string | null;
  start_at: string;
  end_at: string;
  notes?: string;
  color?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase.from("student_events").insert({
    student_id: user.id,
    title: data.title,
    revision_type: data.revision_type,
    matiere_id: data.matiere_id || null,
    cours_id: data.cours_id || null,
    start_at: data.start_at,
    end_at: data.end_at,
    notes: data.notes || null,
    color: data.color || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/agenda");
  return { success: true };
}

export async function updateStudentEvent(
  id: string,
  data: {
    title?: string;
    revision_type?: RevisionType;
    matiere_id?: string | null;
    cours_id?: string | null;
    start_at?: string;
    end_at?: string;
    notes?: string | null;
    completed?: boolean;
    color?: string | null;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase
    .from("student_events")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/agenda");
  return { success: true };
}

export async function deleteStudentEvent(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase
    .from("student_events")
    .delete()
    .eq("id", id)
    .eq("student_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/agenda");
  return { success: true };
}

export async function toggleStudentEventCompleted(
  id: string,
  completed: boolean,
) {
  return updateStudentEvent(id, { completed });
}
