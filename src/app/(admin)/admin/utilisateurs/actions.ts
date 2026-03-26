"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/types/database";
import type { DossierNamePreset, FormationOfferSetting } from "@/lib/pedagogie-admin-settings";

const PATH = "/admin/utilisateurs";

function sanitizeOfferCode(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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
  access_dossier_ids?: string[];
  excluded_access_dossier_ids?: string[];
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
  if (data.access_dossier_id !== undefined || data.access_dossier_ids !== undefined) {
    const uniqueAccessIds = [...new Set(data.access_dossier_ids ?? [])];
    profileUpdate.access_dossier_id =
      data.access_dossier_id !== undefined
        ? data.access_dossier_id
        : uniqueAccessIds[0] ?? null;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update(profileUpdate)
    .eq("id", data.userId);

  if (profileError) {
    return { error: profileError.message };
  }

  if (data.access_dossier_ids !== undefined) {
    const { error: deleteAccessError } = await admin
      .from("profile_dossier_acces")
      .delete()
      .eq("profile_id", data.userId);

    if (deleteAccessError) {
      return { error: deleteAccessError.message };
    }

    const uniqueAccessIds = [...new Set(data.access_dossier_ids)];
    if (uniqueAccessIds.length > 0) {
      const { error: insertAccessError } = await admin
        .from("profile_dossier_acces")
        .insert(
          uniqueAccessIds.map((dossierId) => ({
            profile_id: data.userId,
            dossier_id: dossierId,
          }))
        );

      if (insertAccessError) {
        return { error: insertAccessError.message };
      }
    }
  }

  if (data.excluded_access_dossier_ids !== undefined) {
    const { error: deleteExclusionError } = await admin
      .from("profile_dossier_access_exclusions")
      .delete()
      .eq("profile_id", data.userId);

    if (deleteExclusionError) {
      return { error: deleteExclusionError.message };
    }

    const uniqueExclusionIds = [...new Set(data.excluded_access_dossier_ids)];
    if (uniqueExclusionIds.length > 0) {
      const { error: insertExclusionError } = await admin
        .from("profile_dossier_access_exclusions")
        .insert(
          uniqueExclusionIds.map((dossierId) => ({
            profile_id: data.userId,
            dossier_id: dossierId,
          }))
        );

      if (insertExclusionError) {
        return { error: insertExclusionError.message };
      }
    }
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
  formation_dossier_id?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("groupes").insert({
    name: data.name,
    annee: data.annee || null,
    description: data.description || null,
    color: data.color,
    parent_id: data.parent_id ?? null,
    formation_dossier_id: data.formation_dossier_id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateGroupe(
  id: string,
  data: { name: string; annee?: string; description?: string; color: string; parent_id?: string | null; formation_dossier_id?: string | null }
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
      formation_dossier_id: data.formation_dossier_id ?? null,
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

export async function setGroupeDossierAcces(groupeId: string, dossierIds: string[]) {
  const supabase = await createClient();
  const uniqueDossierIds = [...new Set(dossierIds)];

  const { error: deleteError } = await supabase
    .from("groupe_dossier_acces")
    .delete()
    .eq("groupe_id", groupeId);

  if (deleteError) return { error: deleteError.message };

  if (uniqueDossierIds.length > 0) {
    const { error: insertError } = await supabase
      .from("groupe_dossier_acces")
      .insert(
        uniqueDossierIds.map((dossierId) => ({
          groupe_id: groupeId,
          dossier_id: dossierId,
        }))
      );

    if (insertError) return { error: insertError.message };
  }

  revalidatePath(PATH);
  return { success: true };
}

export async function savePedagogieAdminSettings(data: {
  formationOffers: FormationOfferSetting[];
  dossierNamePresets: DossierNamePreset[];
}) {
  const adminCheck = await ensureAdminAccess();
  if ("error" in adminCheck) return adminCheck;

  const supabase = await createClient();
  const now = new Date().toISOString();

  const normalizedOffers = data.formationOffers
    .map((offer, index) => ({
      ...offer,
      code: sanitizeOfferCode(offer.code),
      label: offer.label.trim(),
      description: offer.description.trim(),
      defaultColor: offer.defaultColor.trim() || "#0e1e35",
      orderIndex: index,
    }))
    .filter((offer) => offer.code && offer.label);

  if (normalizedOffers.length === 0) {
    return { error: "Ajoute au moins une offre de formation." };
  }

  const duplicateCodes = normalizedOffers.filter(
    (offer, index) => normalizedOffers.findIndex((candidate) => candidate.code === offer.code) !== index
  );
  if (duplicateCodes.length > 0) {
    return { error: "Chaque offre doit avoir un code unique." };
  }

  const offerCodes = new Set(normalizedOffers.map((offer) => offer.code));
  const normalizedPresets = data.dossierNamePresets
    .filter((preset) => offerCodes.has(sanitizeOfferCode(preset.formationOffer)))
    .map((preset, index) => ({
      ...preset,
      id: preset.id.trim() || `preset_${index}`,
      formationOffer: sanitizeOfferCode(preset.formationOffer),
      title: preset.title.trim() || "Preset",
      suggestions: preset.suggestions.map((value) => value.trim()).filter(Boolean),
    }));

  const { data: usedOfferRows, error: usedOffersError } = await supabase
    .from("dossiers")
    .select("formation_offer")
    .not("formation_offer", "is", null);

  if (usedOffersError) return { error: usedOffersError.message };

  const usedOfferCodes = [...new Set((usedOfferRows ?? []).map((row: any) => row.formation_offer).filter(Boolean))];
  const removedUsedOffers = usedOfferCodes.filter((code) => !offerCodes.has(code));
  if (removedUsedOffers.length > 0) {
    return {
      error: `Impossible de supprimer une offre déjà utilisée dans l'arborescence: ${removedUsedOffers.join(", ")}`,
    };
  }

  const { error } = await supabase
    .from("admin_settings")
    .upsert([
      {
        key: "pedagogie_formation_offers",
        value: normalizedOffers,
        updated_at: now,
      },
      {
        key: "pedagogie_name_presets",
        value: normalizedPresets,
        updated_at: now,
      },
    ]);

  if (error) return { error: error.message };

  revalidatePath(PATH);
  revalidatePath("/admin/pedagogie");
  return { success: true };
}
