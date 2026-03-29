import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { CoursDetailShell } from "@/components/cours/cours-detail-shell";
import { AskQuestionFab } from "@/components/qa/ask-question-fab";
import { canAccessCours, getAccessScopeForUser } from "@/lib/access-scope";

interface Props {
  params: Promise<{ coursId: string }>;
}

export default async function CoursDetailPage({ params }: Props) {
  const { coursId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const scope = user ? await getAccessScopeForUser(supabase, user.id) : null;

  const { data: cours } = await supabase
    .from("cours")
    .select(`
      *,
      matiere:matieres (id, name, color, dossier:dossiers (id, name)),
      dossier:dossiers (id, name, parent_id)
    `)
    .eq("id", coursId)
    .eq("visible", true)
    .single();

  if (!cours || (scope && !canAccessCours(cours as any, scope))) notFound();

  // ── Direct series (linked to this cours) ──
  const { data: directSeriesRaw } = await supabase
    .from("series")
    .select(`*, series_questions (count), serie_attempts!left (id, score, ended_at)`)
    .eq("cours_id", coursId)
    .eq("visible", true)
    .order("created_at");

  const directSeries = (directSeriesRaw ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    timed: s.timed,
    nb_questions: s.series_questions?.[0]?.count ?? 0,
    last_attempt: Array.isArray(s.serie_attempts) ? s.serie_attempts[0] ?? null : null,
  }));

  // ── Matière-level series (annales, etc.) with questions for this cours ──
  const matiere = (cours as any).matiere;
  let matiereSeries: any[] = [];

  if (matiere?.id) {
    const { data: matiereSeriesRaw } = await supabase
      .from("series")
      .select(`
        *,
        series_questions (count),
        serie_attempts!left (id, score, ended_at)
      `)
      .eq("matiere_id", matiere.id)
      .is("cours_id", null)
      .eq("visible", true)
      .order("created_at");

    if (matiereSeriesRaw && matiereSeriesRaw.length > 0) {
      // Count how many questions in each matière series belong to this cours
      const serieIds = matiereSeriesRaw.map((s: any) => s.id);
      const { data: questionsForCours } = await (supabase as any)
        .from("series_questions")
        .select("series_id, question:questions!inner(id, cours_id)")
        .in("series_id", serieIds)
        .eq("question.cours_id", coursId);

      const countBySerie = new Map<string, number>();
      for (const row of questionsForCours ?? []) {
        countBySerie.set(row.series_id, (countBySerie.get(row.series_id) ?? 0) + 1);
      }

      matiereSeries = matiereSeriesRaw.map((s: any) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        timed: s.timed,
        nb_questions: s.series_questions?.[0]?.count ?? 0,
        nb_questions_for_cours: countBySerie.get(s.id) ?? 0,
        last_attempt: Array.isArray(s.serie_attempts) ? s.serie_attempts[0] ?? null : null,
      }));
    }
  }

  // ── Ressources (documents complémentaires) ──
  const { data: ressources } = await supabase
    .from("ressources")
    .select("*")
    .eq("cours_id", coursId)
    .eq("visible", true)
    .order("order_index");

  // ── User progress ──
  const { data: progress } = user
    ? await supabase
        .from("user_progress")
        .select("current_page, pct_complete")
        .eq("cours_id", coursId)
        .eq("user_id", user.id)
        .single()
    : { data: null };

  const dossier = (cours as any).dossier;
  const breadcrumbDossier = matiere?.dossier ?? dossier;

  return (
    <div>
      <Header
        title={cours.name}
        breadcrumb={[
          { label: "Cours", href: "/cours" },
          ...(breadcrumbDossier ? [{ label: breadcrumbDossier.name, href: "/cours" }] : []),
          ...(matiere ? [{ label: matiere.name, href: `/cours/matiere/${matiere.id}` }] : []),
          { label: cours.name },
        ]}
      />

      <div className="px-4 py-5 max-w-7xl mx-auto">
        {/* Badges */}
        <div className="mb-5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#0e1e35]/8 px-3 py-1 text-xs font-semibold text-[#0e1e35]">
            Version {cours.version ?? 1}
          </span>
          {cours.nb_pages > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              {cours.nb_pages} pages
            </span>
          )}
          {cours.description && (
            <p className="ml-2 text-sm text-[#6B7A8D] truncate max-w-md">{cours.description}</p>
          )}
        </div>

        <CoursDetailShell
          cours={{
            id: cours.id,
            name: cours.name,
            description: cours.description,
            pdf_url: cours.pdf_url,
            nb_pages: cours.nb_pages,
            version: cours.version ?? 1,
          }}
          matiere={matiere ? { id: matiere.id, name: matiere.name, color: matiere.color } : null}
          dossierId={breadcrumbDossier?.id ?? null}
          currentPage={progress?.current_page ?? 1}
          directSeries={directSeries}
          matiereSeries={matiereSeries}
          ressources={ressources ?? []}
        />
      </div>

      <AskQuestionFab
        contextType="cours"
        coursId={cours.id}
        matiereId={matiere?.id}
        dossierId={breadcrumbDossier?.id}
      />
    </div>
  );
}
