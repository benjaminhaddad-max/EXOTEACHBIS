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
  matiere_roles?: { matiere_id: string; role_type: string }[];
  niveau_initial?: number | null;
  mental_initial?: number | null;
  niveau_progressif?: number | null;
  mental_progressif?: number | null;
}) {
  try {
  const adminCheck = await ensureAdminAccess();
  if ("error" in adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { data: currentProfile, error: currentProfileError } = await admin
    .from("profiles")
    .select("email, first_name, last_name, role")
    .eq("id", data.userId)
    .single();

  if (currentProfileError || !currentProfile) {
    return { error: currentProfileError?.message ?? "Profil introuvable." };
  }

  const normalizedEmail = data.email?.trim().toLowerCase();
  const metadataUpdate: Record<string, string> = {};
  const nextFirstName = data.first_name?.trim() || null;
  const nextLastName = data.last_name?.trim() || null;
  const nextRole = data.role ?? currentProfile.role;
  const currentEmail = currentProfile.email?.trim().toLowerCase() ?? null;
  const currentFirstName = currentProfile.first_name ?? null;
  const currentLastName = currentProfile.last_name ?? null;
  const currentRole = currentProfile.role;

  if (data.first_name !== undefined) {
    metadataUpdate.first_name = data.first_name.trim();
  }
  if (data.last_name !== undefined) {
    metadataUpdate.last_name = data.last_name.trim();
  }
  if (data.role !== undefined) {
    metadataUpdate.role = data.role;
  }

  const shouldUpdateAuthEmail = normalizedEmail !== undefined && normalizedEmail !== currentEmail;
  const shouldUpdateAuthMetadata =
    nextFirstName !== currentFirstName ||
    nextLastName !== currentLastName ||
    nextRole !== currentRole;

  if (shouldUpdateAuthEmail || shouldUpdateAuthMetadata) {
    const { error: authError } = await admin.auth.admin.updateUserById(data.userId, {
      ...(shouldUpdateAuthEmail ? { email: normalizedEmail, email_confirm: true } : {}),
      ...(shouldUpdateAuthMetadata ? { user_metadata: metadataUpdate } : {}),
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

  if (data.matiere_roles !== undefined || data.matiere_ids !== undefined || data.role !== undefined) {
    const shouldKeepAssignments = (data.role ?? "prof") === "prof";

    const { error: deleteError } = await admin
      .from("prof_matieres")
      .delete()
      .eq("prof_id", data.userId);

    if (deleteError) {
      return { error: deleteError.message };
    }

    if (shouldKeepAssignments) {
      // New format: matiere_roles with role_type
      if (data.matiere_roles && data.matiere_roles.length > 0) {
        // Deduplicate by (matiere_id, role_type)
        const seen = new Set<string>();
        const uniqueRoles = data.matiere_roles.filter((r) => {
          const key = `${r.matiere_id}:${r.role_type}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const { error: insertError } = await admin.from("prof_matieres").insert(
          uniqueRoles.map((r) => ({
            prof_id: data.userId,
            matiere_id: r.matiere_id,
            role_type: r.role_type,
          }))
        );

        if (insertError) {
          return { error: insertError.message };
        }
      }
      // Legacy format: matiere_ids without role_type (defaults to "cours")
      else if (data.matiere_ids) {
        const uniqueMatiereIds = [...new Set(data.matiere_ids)];
        if (uniqueMatiereIds.length > 0) {
          const { error: insertError } = await admin.from("prof_matieres").insert(
            uniqueMatiereIds.map((matiereId) => ({
              prof_id: data.userId,
              matiere_id: matiereId,
              role_type: "cours",
            }))
          );

          if (insertError) {
            return { error: insertError.message };
          }
        }
      }
    }
  }

  // Handle coaching statut fields (niveau/mental initial + progressif)
  const hasCoachingFields = data.niveau_initial !== undefined || data.mental_initial !== undefined || data.niveau_progressif !== undefined || data.mental_progressif !== undefined;
  if (hasCoachingFields) {
    const { data: existingProfile } = await admin
      .from("coaching_student_profiles")
      .select("id")
      .eq("student_id", data.userId)
      .maybeSingle();

    const coachingUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.niveau_initial !== undefined) coachingUpdate.niveau_initial = data.niveau_initial;
    if (data.mental_initial !== undefined) coachingUpdate.mental_initial = data.mental_initial;
    if (data.niveau_progressif !== undefined) coachingUpdate.niveau_progressif = data.niveau_progressif;
    if (data.mental_progressif !== undefined) coachingUpdate.mental_progressif = data.mental_progressif;

    if (existingProfile) {
      await admin.from("coaching_student_profiles").update(coachingUpdate).eq("student_id", data.userId);
    } else {
      // Get groupe_id for the student
      const groupeId = data.groupe_id !== undefined ? data.groupe_id : (await admin.from("profiles").select("groupe_id").eq("id", data.userId).single()).data?.groupe_id;
      if (groupeId) {
        await admin.from("coaching_student_profiles").insert({
          student_id: data.userId,
          groupe_id: groupeId,
          ...coachingUpdate,
        });
      }
    }
  }

  revalidatePath(PATH);
  return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Erreur inattendue: ${msg}` };
  }
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

export async function createUserAdminProfile(data: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: UserRole;
  groupe_id?: string | null;
}) {
  try {
    const adminCheck = await ensureAdminAccess();
    if ("error" in adminCheck) return adminCheck;

    const admin = createAdminClient();

    const normalizedEmail = data.email.trim().toLowerCase();
    if (!normalizedEmail) return { error: "L'email est requis." };
    if (!data.password || data.password.length < 6) return { error: "Le mot de passe doit contenir au moins 6 caractères." };

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        role: data.role,
      },
    });

    if (authError) return { error: authError.message };
    if (!authData.user) return { error: "Erreur lors de la création du compte." };

    const userId = authData.user.id;

    // Update profile with role and groupe
    const profileUpdate: Record<string, unknown> = {
      first_name: data.first_name.trim() || null,
      last_name: data.last_name.trim() || null,
      email: normalizedEmail,
      role: data.role,
      updated_at: new Date().toISOString(),
    };
    if (data.groupe_id !== undefined) {
      profileUpdate.groupe_id = data.groupe_id;
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId);

    if (profileError) return { error: profileError.message };

    revalidatePath(PATH);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Erreur inattendue: ${msg}` };
  }
}
