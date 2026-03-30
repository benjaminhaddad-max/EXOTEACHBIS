"use server";

import { createClient } from "@/lib/supabase/server";
import { getAccessScopeForUser } from "@/lib/access-scope";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/types/database";
import type { AnnonceAttachment } from "@/lib/annonce-attachments";

const PATHS = ["/admin/annonces", "/admin/communication", "/annonces"];

export type Attachment = AnnonceAttachment;

type AnnonceInput = {
  title: string;
  content: string;
  groupe_id?: string | null;
  dossier_id?: string | null;
  matiere_id?: string | null;
  pinned?: boolean;
  attachments?: AnnonceAttachment[];
};

type NormalizedAnnonceTarget = {
  groupe_id: string | null;
  dossier_id: string | null;
  matiere_id: string | null;
};

function collectDossierAncestors(
  rootIds: string[],
  dossiers: Array<{ id: string; parent_id: string | null }>
) {
  const dossierMap = new Map(dossiers.map((dossier) => [dossier.id, dossier]));
  const allowed = new Set<string>();

  const visit = (id: string) => {
    if (allowed.has(id)) return;
    allowed.add(id);
    const dossier = dossierMap.get(id);
    if (dossier?.parent_id) visit(dossier.parent_id);
  };

  for (const id of rootIds) visit(id);
  return allowed;
}

async function getAnnonceActorContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, groupe_id")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? user.user_metadata?.role ?? "eleve") as UserRole;
  if (!["admin", "superadmin", "prof", "coach"].includes(role)) {
    return { error: "Accès refusé" as const };
  }

  const scope = await getAccessScopeForUser(supabase as any, user.id);
  const [profAssignmentsRes, coachAssignmentsRes, groupesRes, dossiersRes, matieresRes] = await Promise.all([
    role === "prof"
      ? supabase.from("prof_matieres").select("matiere_id").eq("prof_id", user.id)
      : Promise.resolve({ data: [] }),
    role === "coach"
      ? supabase.from("coach_groupe_assignments").select("groupe_id").eq("coach_id", user.id)
      : Promise.resolve({ data: [] }),
    role === "prof" || role === "coach"
      ? supabase.from("groupes").select("id, formation_dossier_id")
      : Promise.resolve({ data: [] }),
    role === "prof" ? supabase.from("dossiers").select("id, parent_id") : Promise.resolve({ data: [] }),
    role === "prof" ? supabase.from("matieres").select("id, dossier_id") : Promise.resolve({ data: [] }),
  ]);

  const profMatiereIds = new Set((profAssignmentsRes.data ?? []).map((item: any) => item.matiere_id).filter(Boolean));
  const coachGroupeIds = new Set((coachAssignmentsRes.data ?? []).map((item: any) => item.groupe_id).filter(Boolean));

  const profAllowedDossierIds =
    role === "prof"
      ? collectDossierAncestors(
          ((matieresRes.data ?? []) as any[])
            .filter((matiere) => profMatiereIds.has(matiere.id))
            .map((matiere) => matiere.dossier_id)
            .filter(Boolean),
          (dossiersRes.data ?? []) as Array<{ id: string; parent_id: string | null }>
        )
      : new Set<string>();

  const accessibleGroupeIds = new Set<string>();
  for (const groupe of (groupesRes.data ?? []) as Array<{ id: string; formation_dossier_id: string | null }>) {
    if (role === "coach" && coachGroupeIds.has(groupe.id)) {
      accessibleGroupeIds.add(groupe.id);
      continue;
    }
    if (role === "prof" && groupe.formation_dossier_id && profAllowedDossierIds.has(groupe.formation_dossier_id)) {
      accessibleGroupeIds.add(groupe.id);
    }
  }

  return {
    supabase,
    user,
    profile: profile ?? { id: user.id, role, groupe_id: null },
    role,
    scope,
    profMatiereIds,
    accessibleGroupeIds,
  };
}

function normalizeAnnonceTarget(data: AnnonceInput) {
  const targets = [
    data.groupe_id ? { field: "groupe_id", value: data.groupe_id } : null,
    data.dossier_id ? { field: "dossier_id", value: data.dossier_id } : null,
    data.matiere_id ? { field: "matiere_id", value: data.matiere_id } : null,
  ].filter(Boolean) as Array<{ field: "groupe_id" | "dossier_id" | "matiere_id"; value: string }>;

  if (targets.length > 1) {
    return { error: "Choisissez une seule cible à la fois : classe, formation ou matière." as const };
  }

  return {
    groupe_id: data.groupe_id || null,
    dossier_id: data.dossier_id || null,
    matiere_id: data.matiere_id || null,
  } satisfies NormalizedAnnonceTarget;
}

async function validateAnnonceAudience(data: NormalizedAnnonceTarget, actor: Awaited<ReturnType<typeof getAnnonceActorContext>>) {
  if ("error" in actor) return;
  if (actor.role === "admin" || actor.role === "superadmin") return;

  if (data.groupe_id && !actor.accessibleGroupeIds.has(data.groupe_id)) {
    return { error: "Vous ne pouvez publier que pour une classe sur laquelle vous intervenez." };
  }

  if (data.dossier_id && !actor.scope.allowedDossierIds.has(data.dossier_id)) {
    return { error: "Ce périmètre de formation n'est pas autorisé pour votre profil." };
  }

  if (data.matiere_id && actor.role !== "prof") {
    return { error: "Seuls les professeurs peuvent cibler une matière." };
  }

  if (data.matiere_id && !actor.profMatiereIds.has(data.matiere_id)) {
    return { error: "Cette matière n'est pas autorisée pour votre profil." };
  }
}

export async function createAnnonce(data: AnnonceInput) {
  const actor = await getAnnonceActorContext();
  if ("error" in actor) return actor;

  const target = normalizeAnnonceTarget(data);
  if ("error" in target) return target;
  const audienceError = await validateAnnonceAudience(target, actor);
  if (audienceError) return audienceError;

  const { error } = await actor.supabase.from("posts").insert({
    title: data.title,
    content: data.content,
    groupe_id: target.groupe_id,
    dossier_id: target.dossier_id,
    matiere_id: target.matiere_id,
    pinned: data.pinned ?? false,
    type: "annonce",
    author_id: actor.user.id,
    attachments: data.attachments ?? [],
  });

  if (error) return { error: error.message };
  for (const path of PATHS) revalidatePath(path);
  return { success: true };
}

export async function updateAnnonce(
  id: string,
  data: AnnonceInput
) {
  const actor = await getAnnonceActorContext();
  if ("error" in actor) return actor;

  const { data: existing, error: existingError } = await actor.supabase
    .from("posts")
    .select("id, author_id")
    .eq("id", id)
    .eq("type", "annonce")
    .single();

  if (existingError || !existing) return { error: existingError?.message ?? "Annonce introuvable" };
  if ((actor.role === "prof" || actor.role === "coach") && existing.author_id !== actor.user.id) {
    return { error: "Vous ne pouvez modifier que vos propres annonces." };
  }

  const target = normalizeAnnonceTarget(data);
  if ("error" in target) return target;
  const audienceError = await validateAnnonceAudience(target, actor);
  if (audienceError) return audienceError;

  const { error } = await actor.supabase
    .from("posts")
    .update({
      title: data.title,
      content: data.content,
      groupe_id: target.groupe_id,
      dossier_id: target.dossier_id,
      matiere_id: target.matiere_id,
      pinned: data.pinned ?? false,
      attachments: data.attachments ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("type", "annonce");

  if (error) return { error: error.message };
  for (const path of PATHS) revalidatePath(path);
  return { success: true };
}

export async function deleteAnnonce(id: string) {
  const actor = await getAnnonceActorContext();
  if ("error" in actor) return actor;

  if (actor.role === "prof" || actor.role === "coach") {
    const { data: existing, error: existingError } = await actor.supabase
      .from("posts")
      .select("author_id")
      .eq("id", id)
      .eq("type", "annonce")
      .single();

    if (existingError || !existing) return { error: existingError?.message ?? "Annonce introuvable" };
    if (existing.author_id !== actor.user.id) {
      return { error: "Vous ne pouvez supprimer que vos propres annonces." };
    }
  }

  const { error } = await actor.supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .eq("type", "annonce");
  if (error) return { error: error.message };
  for (const path of PATHS) revalidatePath(path);
  return { success: true };
}

export async function togglePin(id: string, pinned: boolean) {
  const actor = await getAnnonceActorContext();
  if ("error" in actor) return actor;

  if (actor.role === "prof" || actor.role === "coach") {
    const { data: existing, error: existingError } = await actor.supabase
      .from("posts")
      .select("author_id")
      .eq("id", id)
      .eq("type", "annonce")
      .single();

    if (existingError || !existing) return { error: existingError?.message ?? "Annonce introuvable" };
    if (existing.author_id !== actor.user.id) {
      return { error: "Vous ne pouvez épingler que vos propres annonces." };
    }
  }

  const { error } = await actor.supabase
    .from("posts")
    .update({ pinned: !pinned })
    .eq("id", id);
  if (error) return { error: error.message };
  for (const path of PATHS) revalidatePath(path);
  return { success: true };
}
