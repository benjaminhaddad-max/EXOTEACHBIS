/**
 * Generates a URL to navigate back to the exact location
 * where a Q&A thread was created.
 */
export function buildDeepLink(thread: {
  context_type: string;
  dossier_id?: string | null;
  matiere_id?: string | null;
  cours_id?: string | null;
  serie_id?: string | null;
  question_id?: string | null;
}): string {
  switch (thread.context_type) {
    case "qcm_option":
    case "qcm_question":
      if (thread.serie_id) return `/serie/${thread.serie_id}`;
      if (thread.cours_id) return `/cours/${thread.cours_id}`;
      return "/cours";

    case "cours":
      if (thread.cours_id) return `/cours/${thread.cours_id}`;
      return "/cours";

    case "matiere":
      if (thread.matiere_id) return `/cours/matiere/${thread.matiere_id}`;
      return "/cours";

    case "dossier":
    default:
      return "/cours";
  }
}
