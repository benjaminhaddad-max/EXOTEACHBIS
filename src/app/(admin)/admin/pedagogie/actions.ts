"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { FORMATION_OFFERS } from "@/lib/pedagogie-structure";
import type { FormationOfferSetting } from "@/lib/pedagogie-admin-settings";
import type { DossierType, FormationOffer } from "@/types/database";

const PATH = "/admin/pedagogie";

// =============================================
// DOSSIERS
// =============================================

export async function getAllDossiers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dossiers")
    .select("*")
    .order("order_index");
  return { data: data ?? [] };
}

export async function createDossier(data: {
  name: string;
  description?: string;
  dossier_type?: DossierType;
  formation_offer?: FormationOffer | null;
  color: string;
  icon_url?: string | null;
  parent_id?: string | null;
  order_index?: number;
  visible: boolean;
  etiquettes?: string[];
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("dossiers").insert({
    name: data.name,
    description: data.description || null,
    dossier_type: data.dossier_type ?? "generic",
    formation_offer: data.formation_offer ?? null,
    color: data.color,
    icon_url: data.icon_url || null,
    parent_id: data.parent_id || null,
    order_index: data.order_index ?? 0,
    visible: data.visible,
    etiquettes: data.etiquettes ?? [],
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateDossier(
  id: string,
  data: {
    name: string;
    description?: string;
    parent_id?: string | null;
    dossier_type?: DossierType;
    formation_offer?: FormationOffer | null;
    color: string;
    icon_url?: string | null;
    visible: boolean;
    order_index?: number;
    etiquettes?: string[];
  }
) {
  const supabase = await createClient();

  const { data: currentDossier, error: currentError } = await supabase
    .from("dossiers")
    .select("id, parent_id")
    .eq("id", id)
    .single();

  if (currentError || !currentDossier) {
    return { error: currentError?.message ?? "Dossier introuvable" };
  }

  const nextParentId = data.parent_id === undefined
    ? currentDossier.parent_id
    : data.parent_id || null;

  if (nextParentId === id) {
    return { error: "Un dossier ne peut pas devenir son propre parent" };
  }

  if (nextParentId) {
    const { data: allDossiers, error: allError } = await supabase
      .from("dossiers")
      .select("id, parent_id");

    if (allError) {
      return { error: allError.message };
    }

    const descendantIds = new Set<string>();
    const stack = [id];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      for (const dossier of allDossiers ?? []) {
        if (dossier.parent_id === currentId && !descendantIds.has(dossier.id)) {
          descendantIds.add(dossier.id);
          stack.push(dossier.id);
        }
      }
    }

    if (descendantIds.has(nextParentId)) {
      return { error: "Impossible de déplacer un dossier dans l'un de ses sous-dossiers" };
    }
  }

  let nextOrderIndex = data.order_index ?? 0;

  if (data.parent_id !== undefined && nextParentId !== currentDossier.parent_id) {
    let siblingQuery = supabase
      .from("dossiers")
      .select("order_index")
      .neq("id", id)
      .order("order_index", { ascending: false })
      .limit(1);

    siblingQuery = nextParentId
      ? siblingQuery.eq("parent_id", nextParentId)
      : siblingQuery.is("parent_id", null);

    const { data: siblingRows, error: siblingError } = await siblingQuery;

    if (siblingError) {
      return { error: siblingError.message };
    }

    nextOrderIndex = siblingRows?.[0]?.order_index != null
      ? siblingRows[0].order_index + 1
      : 0;
  }

  const dossierPayload: Record<string, any> = {
    name: data.name,
    description: data.description || null,
    parent_id: nextParentId,
    dossier_type: data.dossier_type ?? "generic",
    formation_offer: data.formation_offer ?? null,
    color: data.color,
    icon_url: data.icon_url || null,
    visible: data.visible,
    order_index: nextOrderIndex,
    updated_at: new Date().toISOString(),
  };
  if (data.etiquettes !== undefined) {
    dossierPayload.etiquettes = data.etiquettes;
  }
  const { error } = await supabase
    .from("dossiers")
    .update(dossierPayload)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function installCanonicalOffers(customOffers?: FormationOfferSetting[]) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("dossiers")
    .select("id, formation_offer")
    .is("parent_id", null)
    .eq("dossier_type", "offer");

  const existingOffers = new Set(
    (existing ?? [])
      .map((item: any) => item.formation_offer)
      .filter(Boolean)
  );

  const configuredOffers = (customOffers?.length ? customOffers : FORMATION_OFFERS.map((offer, index) => ({
    ...offer,
    enabled: true,
    orderIndex: index,
  }))).filter((offer) => offer.enabled !== false);

  const missingOffers = configuredOffers.filter(
    (offer) => !existingOffers.has(offer.code)
  );

  if (missingOffers.length === 0) {
    return { success: true, created: 0 };
  }

  const { error } = await supabase.from("dossiers").insert(
    missingOffers.map((offer, index) => ({
      name: offer.label,
      description: offer.description,
      dossier_type: "offer",
      formation_offer: offer.code,
      color: offer.defaultColor,
      visible: true,
      order_index: (existing?.length ?? 0) + index,
    }))
  );

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true, created: missingOffers.length };
}

export async function deleteDossier(id: string) {
  const supabase = await createClient();

  const { data: dossier, error: dossierError } = await supabase
    .from("dossiers")
    .select("id, parent_id")
    .eq("id", id)
    .single();

  if (dossierError || !dossier) {
    return { error: dossierError?.message ?? "Dossier introuvable" };
  }

  const targetParentId = dossier.parent_id ?? null;

  const [
    childrenRes,
    matieresRes,
    coursRes,
  ] = await Promise.all([
    supabase
      .from("dossiers")
      .select("id, order_index")
      .eq("parent_id", id)
      .order("order_index"),
    supabase
      .from("matieres")
      .select("id")
      .eq("dossier_id", id),
    supabase
      .from("cours")
      .select("id")
      .eq("dossier_id", id),
  ]);

  if (childrenRes.error) return { error: childrenRes.error.message };
  if (matieresRes.error) return { error: matieresRes.error.message };
  if (coursRes.error) return { error: coursRes.error.message };

  let siblingQuery = supabase
    .from("dossiers")
    .select("order_index")
    .neq("id", id)
    .order("order_index", { ascending: false })
    .limit(1);

  siblingQuery = targetParentId
    ? siblingQuery.eq("parent_id", targetParentId)
    : siblingQuery.is("parent_id", null);

  const { data: siblingRows, error: siblingError } = await siblingQuery;
  if (siblingError) return { error: siblingError.message };

  const baseOrder = siblingRows?.[0]?.order_index != null
    ? siblingRows[0].order_index + 1
    : 0;

  if ((childrenRes.data?.length ?? 0) > 0) {
    const childMoveResults = await Promise.all(
      (childrenRes.data ?? []).map((child, index) =>
        supabase
          .from("dossiers")
          .update({
            parent_id: targetParentId,
            order_index: baseOrder + index,
            updated_at: new Date().toISOString(),
          })
          .eq("id", child.id)
      )
    );

    const childMoveError = childMoveResults.find((result) => result.error)?.error;
    if (childMoveError) return { error: childMoveError.message };
  }

  if (targetParentId) {

    if ((matieresRes.data?.length ?? 0) > 0) {
      const { error: moveMatieresError } = await supabase
        .from("matieres")
        .update({
          dossier_id: targetParentId,
          updated_at: new Date().toISOString(),
        })
        .eq("dossier_id", id);

      if (moveMatieresError) return { error: moveMatieresError.message };
    }

    if ((coursRes.data?.length ?? 0) > 0) {
      const { error: moveCoursError } = await supabase
        .from("cours")
        .update({
          dossier_id: targetParentId,
          updated_at: new Date().toISOString(),
        })
        .eq("dossier_id", id);

      if (moveCoursError) return { error: moveCoursError.message };
    }
  } else {
    if ((coursRes.data?.length ?? 0) > 0) {
      const { error: moveCoursError } = await supabase
        .from("cours")
        .update({
          dossier_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("dossier_id", id);

      if (moveCoursError) return { error: moveCoursError.message };
    }
  }

  const { error } = await supabase.from("dossiers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

// =============================================
// RESSOURCES (attachées à un dossier)
// =============================================

export async function getRessourcesByDossier(dossierId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ressources")
    .select("*")
    .eq("dossier_id", dossierId)
    .order("order_index");
  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function createRessource(data: {
  dossier_id: string;
  titre: string;
  sous_titre?: string;
  type: string;
  pdf_url?: string;
  pdf_path?: string;
  video_url?: string;
  vimeo_id?: string;
  lien_url?: string;
  lien_label?: string;
  order_index?: number;
  visible: boolean;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("ressources").insert({
    dossier_id: data.dossier_id,
    cours_id: null,
    titre: data.titre,
    sous_titre: data.sous_titre || null,
    type: data.type,
    pdf_url: data.pdf_url || null,
    pdf_path: data.pdf_path || null,
    video_url: data.video_url || null,
    vimeo_id: data.vimeo_id || null,
    lien_url: data.lien_url || null,
    lien_label: data.lien_label || null,
    order_index: data.order_index ?? 0,
    visible: data.visible,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateRessource(
  id: string,
  data: {
    titre: string;
    sous_titre?: string;
    type: string;
    pdf_url?: string;
    pdf_path?: string;
    video_url?: string;
    vimeo_id?: string;
    lien_url?: string;
    lien_label?: string;
    order_index?: number;
    visible: boolean;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ressources")
    .update({
      titre: data.titre,
      sous_titre: data.sous_titre || null,
      type: data.type,
      pdf_url: data.pdf_url || null,
      pdf_path: data.pdf_path || null,
      video_url: data.video_url || null,
      vimeo_id: data.vimeo_id || null,
      lien_url: data.lien_url || null,
      lien_label: data.lien_label || null,
      order_index: data.order_index ?? 0,
      visible: data.visible,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteRessource(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("ressources").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

// =============================================
// COURS (attachés à un dossier)
// =============================================

export async function getCourssByDossier(dossierId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cours")
    .select("*")
    .eq("dossier_id", dossierId)
    .order("order_index")
    .order("created_at");
  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function createCoursInDossier(data: {
  dossier_id: string;
  name: string;
  description?: string;
  pdf_url?: string;
  pdf_path?: string;
  nb_pages?: number;
  order_index?: number;
  visible: boolean;
  etiquettes?: string[];
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("cours").insert({
    dossier_id: data.dossier_id,
    matiere_id: null,
    name: data.name,
    description: data.description || null,
    pdf_url: data.pdf_url || null,
    pdf_path: data.pdf_path || null,
    nb_pages: data.nb_pages ?? 0,
    etiquettes: data.etiquettes ?? [],
    tags: [],
    order_index: data.order_index ?? 0,
    visible: data.visible,
    version: 1,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateCoursInDossier(
  id: string,
  data: {
    name: string;
    description?: string;
    pdf_url?: string;
    pdf_path?: string;
    nb_pages?: number;
    visible: boolean;
    etiquettes?: string[];
  }
) {
  const supabase = await createClient();
  const updatePayload: Record<string, any> = {
    name: data.name,
    description: data.description || null,
    pdf_url: data.pdf_url || null,
    pdf_path: data.pdf_path || null,
    nb_pages: data.nb_pages ?? 0,
    visible: data.visible,
    updated_at: new Date().toISOString(),
  };
  if (data.etiquettes !== undefined) {
    updatePayload.etiquettes = data.etiquettes;
  }
  const { error } = await supabase
    .from("cours")
    .update(updatePayload)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function renameEtiquette(coursIds: string[], oldName: string, newName: string) {
  const supabase = await createClient();
  // Fetch current etiquettes for these cours
  const { data: rows, error: fetchErr } = await supabase
    .from("cours")
    .select("id, etiquettes")
    .in("id", coursIds);
  if (fetchErr) return { error: fetchErr.message };
  // Replace old etiquette with new one in each cours
  for (const row of rows ?? []) {
    const updated = (row.etiquettes ?? []).map((e: string) => e === oldName ? newName.trim() : e);
    await supabase.from("cours").update({ etiquettes: updated, updated_at: new Date().toISOString() }).eq("id", row.id);
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function bulkSetEtiquettes(coursIds: string[], etiquettes: string[]) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cours")
    .update({ etiquettes, updated_at: new Date().toISOString() })
    .in("id", coursIds);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function bulkSetDossierEtiquettes(dossierIds: string[], etiquettes: string[]) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("dossiers")
    .update({ etiquettes, updated_at: new Date().toISOString() })
    .in("id", dossierIds);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function renameDossierEtiquette(dossierIds: string[], oldName: string, newName: string) {
  const supabase = await createClient();
  const { data: dossiers } = await supabase
    .from("dossiers")
    .select("id, etiquettes")
    .in("id", dossierIds);
  if (!dossiers) return { error: "Dossiers introuvables." };
  for (const d of dossiers) {
    const updated = (d.etiquettes ?? []).map((e: string) => (e === oldName ? newName : e));
    await supabase.from("dossiers").update({ etiquettes: updated }).eq("id", d.id);
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteCoursFromDossier(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cours").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteLinkedCours(linkedCoursId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cours").delete().eq("linked_cours_id", linkedCoursId);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteLinkedCoursByCoursId(coursId: string) {
  const supabase = await createClient();
  const { data: cours } = await supabase.from("cours").select("linked_cours_id").eq("id", coursId).single();
  if (!cours?.linked_cours_id) {
    // Not linked, just delete this one
    const { error } = await supabase.from("cours").delete().eq("id", coursId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("cours").delete().eq("linked_cours_id", cours.linked_cours_id);
    if (error) return { error: error.message };
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function reorderCours(updates: { id: string; order_index: number }[]) {
  const supabase = await createClient();
  await Promise.all(
    updates.map(({ id, order_index }) =>
      supabase.from("cours").update({ order_index }).eq("id", id)
    )
  );
  revalidatePath(PATH);
  return { success: true };
}

// Mettre à jour l'ordre de plusieurs dossiers
export async function reorderDossiers(updates: { id: string; order_index: number }[]) {
  const supabase = await createClient();
  await Promise.all(
    updates.map(({ id, order_index }) =>
      supabase.from("dossiers").update({ order_index }).eq("id", id)
    )
  );
  revalidatePath(PATH);
  return { success: true };
}

// Mettre à jour l'ordre de plusieurs ressources
export async function reorderRessources(updates: { id: string; order_index: number }[]) {
  const supabase = await createClient();
  await Promise.all(
    updates.map(({ id, order_index }) =>
      supabase.from("ressources").update({ order_index }).eq("id", id)
    )
  );
  revalidatePath(PATH);
  return { success: true };
}

// Legacy — gardé pour compatibilité avec les cours existants
export async function getDossiers() {
  return getAllDossiers();
}

export async function getSeriesByDossier(dossierId: string) {
  const supabase = await createClient();

  // Get all dossiers to build subtree
  const { data: allDossiers } = await supabase.from("dossiers").select("id, parent_id");

  function getSubtreeIds(rootId: string, dossiers: { id: string; parent_id: string | null }[]): string[] {
    const ids = [rootId];
    dossiers.filter((d) => d.parent_id === rootId).forEach((d) => ids.push(...getSubtreeIds(d.id, dossiers)));
    return ids;
  }

  const subtreeIds = getSubtreeIds(dossierId, allDossiers ?? []);

  // Cours via dossier_id direct
  const { data: coursDirect } = await supabase
    .from("cours")
    .select("id, name, dossier_id")
    .in("dossier_id", subtreeIds);

  // Matieres dans le sous-arbre → pour trouver cours via matiere_id
  const { data: matieres } = await supabase
    .from("matieres")
    .select("id")
    .in("dossier_id", subtreeIds);
  const matiereIds = (matieres ?? []).map((m: any) => m.id);

  // Cours via matiere_id (si matieres trouvées)
  const { data: coursViaMatiere } = matiereIds.length > 0
    ? await supabase.from("cours").select("id, name, matiere_id").in("matiere_id", matiereIds)
    : { data: [] };

  // Dédupliquer les cours
  const coursMap = new Map<string, any>();
  for (const c of [...(coursDirect ?? []), ...(coursViaMatiere ?? [])]) coursMap.set(c.id, c);
  const cours = Array.from(coursMap.values());
  const coursIds = cours.map((c: any) => c.id);

  // Séries par cours_id
  const seriesMap = new Map<string, any>();
  if (coursIds.length > 0) {
    const { data: seriesByCours } = await supabase
      .from("series")
      .select("id, name, type, visible, timed, duration_minutes, score_definitif, cours_id, annee")
      .in("cours_id", coursIds)
      .order("created_at", { ascending: false });
    for (const s of seriesByCours ?? []) seriesMap.set(s.id, s);
  }

  // Séries par matiere_id (séries "toute la matière")
  if (matiereIds.length > 0) {
    const { data: seriesByMatiere } = await supabase
      .from("series")
      .select("id, name, type, visible, timed, duration_minutes, score_definitif, cours_id, annee")
      .in("matiere_id", matiereIds)
      .order("created_at", { ascending: false });
    for (const s of seriesByMatiere ?? []) seriesMap.set(s.id, s);
  }

  const VALID_TYPES = ["annales", "qcm_supplementaires", "concours_blanc", "revision"];
  const series = Array.from(seriesMap.values()).filter((s: any) => VALID_TYPES.includes(s.type));

  return {
    series: series.map((s: any) => ({ ...s, nb_questions: 0 })),
    cours,
    matiereIds,
  };
}

// ─── Données panel cours ────────────────────────────────────────────────────

export async function getSeriesForCours(coursId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("series")
    .select("*, series_questions(question_id)")
    .eq("cours_id", coursId)
    .order("created_at");
  if (error) console.error("[getSeriesForCours]", error.message);
  return (data ?? []).map((s: any) => ({
    ...s,
    nb_questions: Array.isArray(s.series_questions) ? s.series_questions.length : 0,
    series_questions: undefined,
  }));
}

export async function getBankQuestionsForSerie(coursId: string, serieId: string) {
  const supabase = await createClient();
  const [sqRes, qRes] = await Promise.all([
    supabase.from("series_questions").select("question_id").eq("series_id", serieId),
    supabase.from("questions").select("id, text, difficulty, type").eq("cours_id", coursId).order("created_at"),
  ]);
  const inSerie = new Set((sqRes.data ?? []).map((r: any) => r.question_id));
  return (qRes.data ?? []).filter((q: any) => !inSerie.has(q.id));
}

export async function getSerieQuestions(serieId: string) {
  const supabase = await createClient();
  // Étape 1 : question_ids dans l'ordre
  const { data: sqData, error: sqErr } = await supabase
    .from("series_questions")
    .select("question_id, order_index")
    .eq("series_id", serieId)
    .order("order_index");
  if (sqErr) { console.error("[getSerieQuestions] sq error:", sqErr.message); return []; }
  const questionIds = (sqData ?? []).map((r: any) => r.question_id).filter(Boolean);
  if (questionIds.length === 0) return [];
  // Étape 2 : questions + options
  const { data: qData, error: qErr } = await supabase
    .from("questions")
    .select("*, options(*)")
    .in("id", questionIds);
  if (qErr) { console.error("[getSerieQuestions] q error:", qErr.message); return []; }
  const qMap = new Map((qData ?? []).map((q: any) => [q.id, q]));
  return questionIds.map((id: string) => qMap.get(id)).filter(Boolean);
}

export async function getQuestionsForCours(coursId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("questions")
    .select("*, options(*)")
    .eq("cours_id", coursId)
    .order("created_at");
  if (error) console.error("[getQuestionsForCours]", error.message);
  return data ?? [];
}

export async function getCoursForMatiere(matiereId: string) {
  const supabase = await createClient();
  const { data: matiere } = await supabase
    .from("matieres")
    .select("dossier_id")
    .eq("id", matiereId)
    .single();
  if (!matiere) return [];
  const { data } = await supabase
    .from("cours")
    .select("id, name, order_index")
    .eq("dossier_id", matiere.dossier_id)
    .order("order_index");
  return data ?? [];
}

export async function getSiblingCours(coursId: string) {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("cours")
    .select("matiere_id, dossier_id")
    .eq("id", coursId)
    .single();
  if (!current) return [];

  if (current.matiere_id) {
    const { data: mat } = await supabase
      .from("matieres")
      .select("dossier_id")
      .eq("id", current.matiere_id)
      .single();
    if (mat) {
      const { data } = await supabase
        .from("cours")
        .select("id, name, order_index")
        .eq("dossier_id", mat.dossier_id)
        .order("order_index");
      return data ?? [];
    }
  }

  if (current.dossier_id) {
    const { data: parentDossier } = await supabase
      .from("dossiers")
      .select("parent_id")
      .eq("id", current.dossier_id)
      .single();
    const parentId = parentDossier?.parent_id ?? current.dossier_id;
    const { data: childDossiers } = await supabase
      .from("dossiers")
      .select("id")
      .eq("parent_id", parentId);
    const dossierIds = (childDossiers ?? []).map((d: any) => d.id);
    if (dossierIds.length === 0) dossierIds.push(current.dossier_id);
    const { data } = await supabase
      .from("cours")
      .select("id, name, order_index, dossier_id")
      .in("dossier_id", dossierIds)
      .order("order_index");
    return data ?? [];
  }

  return [];
}

export async function updateQuestionCoursId(questionId: string, coursId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("questions")
    .update({ cours_id: coursId })
    .eq("id", questionId);
  if (error) return { error: error.message };
  return { success: true };
}

// =============================================
// CLONE DOSSIER TREE (avec cours liés)
// =============================================

export async function cloneDossierTree(sourceDossierId: string, targetParentId: string) {
  const supabase = await createClient();

  // 1. Fetch all dossiers recursively from source
  const { data: allDossiers } = await supabase.from("dossiers").select("*");
  if (!allDossiers) return { error: "Impossible de charger les dossiers" };

  // Build subtree from source (BFS)
  const subtreeDossiers: typeof allDossiers = [];
  const queue = [sourceDossierId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const d of allDossiers) {
      if (d.parent_id === currentId) {
        subtreeDossiers.push(d);
        queue.push(d.id);
      }
    }
  }

  // 2. Fetch all cours in these dossiers
  const dossierIds = subtreeDossiers.map((d) => d.id);
  const { data: allCours } = await supabase
    .from("cours")
    .select("*")
    .in("dossier_id", dossierIds.length > 0 ? dossierIds : ["__none__"]);

  // 3. Clone dossiers with ID mapping
  const idMap = new Map<string, string>(); // sourceId → newId
  // Sort by depth (parents first) — use parent_id chain
  const sorted = sortByDepth(subtreeDossiers, sourceDossierId);

  for (const source of sorted) {
    const newParentId = source.parent_id === sourceDossierId
      ? targetParentId
      : idMap.get(source.parent_id!) ?? targetParentId;

    const { data: created, error } = await supabase
      .from("dossiers")
      .insert({
        name: source.name,
        description: source.description,
        dossier_type: source.dossier_type,
        formation_offer: source.formation_offer,
        color: source.color,
        icon_url: source.icon_url,
        etiquettes: source.etiquettes ?? [],
        order_index: source.order_index,
        visible: source.visible,
        parent_id: newParentId,
      })
      .select("id")
      .single();

    if (error || !created) continue;
    idMap.set(source.id, created.id);
  }

  // 4. Clone cours with linked_cours_id
  let coursCount = 0;
  for (const source of allCours ?? []) {
    const newDossierId = idMap.get(source.dossier_id);
    if (!newDossierId) continue;

    // Set linked_cours_id on source if not already set
    const linkId = source.linked_cours_id ?? source.id;
    if (!source.linked_cours_id) {
      await supabase.from("cours").update({ linked_cours_id: linkId }).eq("id", source.id);
    }

    const { error } = await supabase.from("cours").insert({
      dossier_id: newDossierId,
      matiere_id: null,
      name: source.name,
      description: source.description,
      pdf_url: source.pdf_url,
      pdf_path: source.pdf_path,
      nb_pages: source.nb_pages ?? 0,
      etiquettes: source.etiquettes ?? [],
      tags: source.tags ?? [],
      order_index: source.order_index,
      visible: source.visible,
      version: 1,
      linked_cours_id: linkId,
    });
    if (!error) coursCount++;
  }

  revalidatePath(PATH);
  return { success: true, dossiersCreated: idMap.size, coursCreated: coursCount };
}

function sortByDepth(dossiers: any[], rootId: string): any[] {
  const result: any[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const d of dossiers) {
      if (d.parent_id === parentId) {
        result.push(d);
        queue.push(d.id);
      }
    }
  }
  return result;
}

// =============================================
// COURS MANQUANTS DEPUIS LES AUTRES OFFRES
// =============================================

export async function getMissingCoursFromOtherOffers(dossierId: string) {
  "use server";
  const supabase = await createClient();

  // Get all dossiers to walk the tree
  const { data: allDossiers } = await supabase
    .from("dossiers")
    .select("id, name, parent_id, dossier_type")
    .order("order_index");
  if (!allDossiers) return { items: [] };

  const byId = new Map(allDossiers.map((d) => [d.id, d]));

  // Walk up from dossierId to find subject name, university name, offer id
  let subjectName: string | null = null;
  let uniName: string | null = null;
  let offerId: string | null = null;
  const src = byId.get(dossierId);
  if (src?.dossier_type === "subject") subjectName = src.name;
  let cur: string | null = dossierId;
  while (cur) {
    const d = byId.get(cur);
    if (!d) break;
    if (d.dossier_type === "subject" && !subjectName) subjectName = d.name;
    if (d.dossier_type === "university" && !uniName) uniName = d.name;
    if (d.dossier_type === "offer") { offerId = d.id; break; }
    cur = d.parent_id;
  }
  if (!subjectName || !uniName) return { items: [] };

  // Find matching subject dossiers (same uni name + same subject name) in other offers
  const siblingSubjectIds: { id: string; offerName: string }[] = [];
  for (const subj of allDossiers) {
    if (subj.dossier_type !== "subject" || subj.name !== subjectName || subj.id === dossierId) continue;
    let sUni: string | null = null;
    let sOfferId: string | null = null;
    let sOfferName: string | null = null;
    let c: string | null = subj.parent_id;
    while (c) {
      const p = byId.get(c);
      if (!p) break;
      if (p.dossier_type === "university" && !sUni) sUni = p.name;
      if (p.dossier_type === "offer") { sOfferId = p.id; sOfferName = p.name; break; }
      c = p.parent_id;
    }
    if (sUni === uniName && sOfferId !== offerId && sOfferName) {
      siblingSubjectIds.push({ id: subj.id, offerName: sOfferName });
    }
  }
  if (siblingSubjectIds.length === 0) return { items: [] };

  // Get courses in current dossier to know what we already have (by linked_cours_id only)
  const { data: localCours } = await supabase
    .from("cours")
    .select("id, linked_cours_id")
    .eq("dossier_id", dossierId);
  const localLinkedIds = new Set((localCours ?? []).map((c) => c.linked_cours_id).filter(Boolean));

  // Get courses from sibling subjects
  const allSiblingIds = siblingSubjectIds.map((s) => s.id);
  const { data: siblingCours } = await supabase
    .from("cours")
    .select("id, name, dossier_id, linked_cours_id, pdf_url, etiquettes")
    .in("dossier_id", allSiblingIds)
    .order("order_index");

  const offerNameMap = new Map(siblingSubjectIds.map((s) => [s.id, s.offerName]));

  // Filter to only courses we don't have (by linked_cours_id only)
  const missing = (siblingCours ?? []).filter((c) => {
    const linkId = c.linked_cours_id ?? c.id;
    return !localLinkedIds.has(linkId);
  });

  // Group by offer
  const items = missing.map((c) => ({
    id: c.id,
    name: c.name,
    offerName: offerNameMap.get(c.dossier_id) ?? "",
    hasPdf: !!c.pdf_url,
    etiquettes: c.etiquettes ?? [],
  }));

  return { items };
}

// =============================================
// RATTACHER COURS À UN AUTRE DOSSIER (clone lié)
// =============================================

export async function linkCoursToOtherDossier(
  coursIds: string[],
  targetDossierId: string,
): Promise<{ success?: boolean; error?: string; count?: number }> {
  "use server";
  const supabase = await createClient();

  // Validate target dossier exists and is a subject
  const { data: target } = await supabase
    .from("dossiers")
    .select("id, dossier_type")
    .eq("id", targetDossierId)
    .single();
  if (!target) return { error: "Dossier cible introuvable." };
  if (target.dossier_type !== "subject")
    return { error: "Le dossier cible doit être une matière." };

  // Fetch source courses
  const { data: sources } = await supabase
    .from("cours")
    .select("*")
    .in("id", coursIds);
  if (!sources?.length) return { error: "Aucun cours trouvé." };

  // Get max order_index in target
  const { data: maxRow } = await supabase
    .from("cours")
    .select("order_index")
    .eq("dossier_id", targetDossierId)
    .order("order_index", { ascending: false })
    .limit(1)
    .single();
  let nextOrder = (maxRow?.order_index ?? -1) + 1;

  // Get existing linked_cours_ids in target to avoid duplicates
  const { data: existingInTarget } = await supabase
    .from("cours")
    .select("linked_cours_id")
    .eq("dossier_id", targetDossierId)
    .not("linked_cours_id", "is", null);
  const existingLinks = new Set(
    (existingInTarget ?? []).map((c: any) => c.linked_cours_id),
  );

  let count = 0;
  for (const source of sources) {
    const linkId = source.linked_cours_id ?? source.id;

    // Skip if already linked in target
    if (existingLinks.has(linkId)) continue;

    // Set linked_cours_id on source if not already set
    if (!source.linked_cours_id) {
      await supabase
        .from("cours")
        .update({ linked_cours_id: linkId })
        .eq("id", source.id);
    }

    const { error } = await supabase.from("cours").insert({
      dossier_id: targetDossierId,
      matiere_id: null,
      name: source.name,
      description: source.description,
      pdf_url: source.pdf_url,
      pdf_path: source.pdf_path,
      nb_pages: source.nb_pages ?? 0,
      etiquettes: source.etiquettes ?? [],
      tags: source.tags ?? [],
      order_index: nextOrder++,
      visible: source.visible,
      version: 1,
      linked_cours_id: linkId,
    });
    if (!error) {
      existingLinks.add(linkId);
      count++;
    }
  }

  if (count === 0)
    return { error: "Tous les cours sont déjà rattachés à cette matière." };

  revalidatePath(PATH);
  return { success: true, count };
}

// =============================================
// UPDATE LINKED COURS (propager ou détacher)
// =============================================

export async function updateLinkedCours(
  coursId: string,
  data: Record<string, any>,
  propagate: boolean
) {
  const supabase = await createClient();

  if (propagate) {
    // Get linked_cours_id
    const { data: cours } = await supabase.from("cours").select("linked_cours_id").eq("id", coursId).single();
    if (cours?.linked_cours_id) {
      // Update all linked cours
      const { error } = await supabase
        .from("cours")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("linked_cours_id", cours.linked_cours_id);
      if (error) return { error: error.message };
    }
  } else {
    // Detach: remove linked_cours_id and update only this one
    const { error } = await supabase
      .from("cours")
      .update({ ...data, linked_cours_id: null, updated_at: new Date().toISOString() })
      .eq("id", coursId);
    if (error) return { error: error.message };
  }

  revalidatePath(PATH);
  return { success: true };
}

export async function getLinkedCoursCount(coursId: string) {
  const supabase = await createClient();
  // First get the linked_cours_id for this cours
  const { data: cours } = await supabase.from("cours").select("linked_cours_id").eq("id", coursId).single();
  if (!cours?.linked_cours_id) return 0;
  const { count } = await supabase
    .from("cours")
    .select("id", { count: "exact", head: true })
    .eq("linked_cours_id", cours.linked_cours_id);
  return count ?? 0;
}
