"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/types/database";

const PATH = "/admin/utilisateurs";

async function ensureAdminAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    return { error: "Accès refusé" as const };
  }

  return { userId: user.id };
}

export async function updateUserAdminProfile(data: {
  userId: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  role?: UserRole;
  groupe_id?: string | null;
  filiere_id?: string | null;
  access_dossier_id?: string | null;
  matiere_ids?: string[];
}) {
  const adminCheck = await ensureAdminAccess();
  if ("error" in adminCheck) return adminCheck;

  const admin = createAdminClient();
  const normalizedEmail = data.email?.trim().toLowerCase();
  const metadataUpdate: Record<string, string> = {};

  if (data.first_name !== undefined) {
    metadataUpdate.first_name = data.first_name.trim();
  }
  if (data.last_name !== undefined) {
    metadataUpdate.last_name = data.last_name.trim();
  }
  if (data.role !== undefined) {
    metadataUpdate.role = data.role;
  }

  if (normalizedEmail || Object.keys(metadataUpdate).length > 0) {
    const { error: authError } = await admin.auth.admin.updateUserById(data.userId, {
      ...(normalizedEmail ? { email: normalizedEmail, email_confirm: true } : {}),
      ...(Object.keys(metadataUpdate).length > 0 ? { user_metadata: metadataUpdate } : {}),
    });

    if (authError) {
      return { error: authError.message };
    }
  }

  const profileUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.first_name !== undefined) {
    profileUpdate.first_name = data.first_name.trim() || null;
  }
  if (data.last_name !== undefined) {
    profileUpdate.last_name = data.last_name.trim() || null;
  }
  if (normalizedEmail !== undefined) {
    profileUpdate.email = normalizedEmail || null;
  }
  if (data.phone !== undefined) {
    profileUpdate.phone = data.phone?.trim() || null;
  }
  if (data.role !== undefined) {
    profileUpdate.role = data.role;
  }
  if (data.groupe_id !== undefined) {
    profileUpdate.groupe_id = data.groupe_id;
  }
  if (data.filiere_id !== undefined) {
    profileUpdate.filiere_id = data.filiere_id;
  }
  if (data.access_dossier_id !== undefined) {
    profileUpdate.access_dossier_id = data.access_dossier_id;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update(profileUpdate)
    .eq("id", data.userId);

  if (profileError) {
    return { error: profileError.message };
  }

  if (data.matiere_ids !== undefined || data.role !== undefined) {
    const shouldKeepAssignments = (data.role ?? "prof") === "prof";

    const { error: deleteError } = await admin
      .from("prof_matieres")
      .delete()
      .eq("prof_id", data.userId);

    if (deleteError) {
      return { error: deleteError.message };
    }

    if (shouldKeepAssignments) {
      const uniqueMatiereIds = [...new Set(data.matiere_ids ?? [])];
      if (uniqueMatiereIds.length > 0) {
        const { error: insertError } = await admin.from("prof_matieres").insert(
          uniqueMatiereIds.map((matiereId) => ({
            prof_id: data.userId,
            matiere_id: matiereId,
          }))
        );

        if (insertError) {
          return { error: insertError.message };
        }
      }
    }
  }

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
