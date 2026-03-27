import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { PdfViewer } from "@/components/cours/pdf-viewer";
import { SeriesList } from "@/components/cours/series-list";
import { FileText } from "lucide-react";
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

  // Fetch cours with optional matière or dossier
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

  // Séries liées au cours
  const { data: series } = await supabase
    .from("series")
    .select(`*, series_questions (count), serie_attempts!left (id, score, ended_at)`)
    .eq("cours_id", coursId)
    .eq("visible", true)
    .order("created_at");

  const seriesEnrichies = (series ?? []).map((s: any) => ({
    ...s,
    nb_questions: s.series_questions?.[0]?.count ?? 0,
    last_attempt: Array.isArray(s.serie_attempts) ? s.serie_attempts[0] ?? null : null,
    series_questions: undefined,
    serie_attempts: undefined,
  }));

  // Progression utilisateur
  const { data: progress } = user
    ? await supabase
        .from("user_progress")
        .select("current_page, pct_complete")
        .eq("cours_id", coursId)
        .eq("user_id", user.id)
        .single()
    : { data: null };

  const matiere = (cours as any).matiere;
  const dossier = (cours as any).dossier;
  const breadcrumbDossier = matiere?.dossier ?? dossier;

  const hasPdf = !!cours.pdf_url;

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
        {/* Badges version / pages */}
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-navy/10 px-3 py-1 text-xs font-semibold text-navy">
            Version {cours.version ?? 1}
          </span>
          {cours.nb_pages > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              {cours.nb_pages} pages
            </span>
          )}
          {cours.description && (
            <p className="ml-2 text-sm text-gray-500 truncate max-w-md">{cours.description}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* ── COLONNE GAUCHE : PDF ── */}
          <div className="lg:col-span-3 space-y-4">
            {hasPdf ? (
              <PdfViewer
                coursId={cours.id}
                pdfUrl={cours.pdf_url!}
                nbPages={cours.nb_pages ?? 0}
                currentPage={progress?.current_page ?? 1}
                version={cours.version ?? 1}
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                  <FileText className="h-7 w-7 text-gray-300" />
                </div>
                <p className="mt-3 text-sm font-medium text-gray-400">Aucune fiche PDF</p>
                <p className="mt-1 text-xs text-gray-300">Le professeur ajoutera le cours bientôt</p>
              </div>
            )}
          </div>

          {/* ── COLONNE DROITE : Séries + Révisions ── */}
          <div className="lg:col-span-2 space-y-4">
            <SeriesList
              series={seriesEnrichies}
              qaContext={{
                coursId: cours.id,
                matiereId: matiere?.id,
                dossierId: breadcrumbDossier?.id,
                contextLabel: cours.name,
              }}
            />
          </div>
        </div>
      </div>

      {/* Q&A FAB — contextual to this course */}
      <AskQuestionFab
        contextType="cours"
        coursId={cours.id}
        matiereId={matiere?.id}
        dossierId={breadcrumbDossier?.id}
      />
    </div>
  );
}
