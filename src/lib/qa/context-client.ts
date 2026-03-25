"use client";

import { createClient } from "@/lib/supabase/client";

import type { QaContextType, QaContextIds, ResolvedQaContext } from "./context";
export type { QaContextType, QaContextIds, ResolvedQaContext };

/**
 * Client-side: resolves the full context chain from any combination of IDs
 * and builds a human-readable label for display.
 *
 * Always ensures matiere_id is resolved (required for professor routing).
 */
export async function resolveQaContextClient(
  contextType: QaContextType,
  ids: QaContextIds
): Promise<ResolvedQaContext> {
  const supabase = createClient();

  let dossierId = ids.dossierId ?? null;
  let matiereId = ids.matiereId ?? null;
  let coursId = ids.coursId ?? null;
  let questionId = ids.questionId ?? null;
  let optionId = ids.optionId ?? null;

  const labels: string[] = [];

  // Resolve upward from the most specific context type
  if (contextType === "qcm_option" && optionId) {
    const { data: option } = await supabase
      .from("options")
      .select("id, label, question_id")
      .eq("id", optionId)
      .single();

    if (option) {
      questionId = questionId ?? option.question_id;
      labels.unshift(`Option ${option.label}`);
    }
  }

  if (
    (contextType === "qcm_option" || contextType === "qcm_question") &&
    questionId
  ) {
    const { data: question } = await supabase
      .from("questions")
      .select("id, text, cours_id, matiere_id")
      .eq("id", questionId)
      .single();

    if (question) {
      coursId = coursId ?? question.cours_id;
      matiereId = matiereId ?? question.matiere_id;
      const shortText =
        question.text.length > 40
          ? question.text.slice(0, 37) + "..."
          : question.text;
      labels.unshift(`Question: ${shortText}`);
    }
  }

  if (
    (contextType === "qcm_option" ||
      contextType === "qcm_question" ||
      contextType === "cours") &&
    coursId
  ) {
    const { data: cours } = await supabase
      .from("cours")
      .select("id, name, matiere_id")
      .eq("id", coursId)
      .single();

    if (cours) {
      matiereId = matiereId ?? cours.matiere_id;
      labels.unshift(cours.name);
    }
  }

  if (matiereId) {
    const { data: matiere } = await supabase
      .from("matieres")
      .select("id, name, dossier_id")
      .eq("id", matiereId)
      .single();

    if (matiere) {
      dossierId = dossierId ?? matiere.dossier_id;
      labels.unshift(matiere.name);
    }
  }

  if (dossierId) {
    const { data: dossier } = await supabase
      .from("dossiers")
      .select("id, name")
      .eq("id", dossierId)
      .single();

    if (dossier) {
      labels.unshift(dossier.name);
    }
  }

  // matiere_id may be null for courses directly under a dossier (no matière).
  // In that case, try to pick the first matière of the dossier if one exists.
  if (!matiereId && dossierId) {
    const { data: fallbackMatiere } = await supabase
      .from("matieres")
      .select("id, name")
      .eq("dossier_id", dossierId)
      .limit(1)
      .single();
    if (fallbackMatiere) {
      matiereId = fallbackMatiere.id;
    }
  }

  return {
    matiereId: matiereId ?? "",
    contextLabel: labels.join(" > "),
  };
}
