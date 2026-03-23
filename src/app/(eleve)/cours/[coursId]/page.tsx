import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { PdfViewer } from "@/components/cours/pdf-viewer";
import { SeriesList } from "@/components/cours/series-list";
import { ModuleRevisions } from "@/components/cours/module-revisions";

interface Props {
  params: Promise<{ coursId: string }>;
}

export default async function CoursDetailPage({ params }: Props) {
  const { coursId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Charger le cours
  const { data: cours } = await supabase
    .from("cours")
    .select(`
      *,
      matiere:matieres (
        id, name, color,
        dossier:dossiers (id, name)
      )
    `)
    .eq("id", coursId)
    .eq("visible", true)
    .single();

  if (!cours) notFound();

  // Charger les séries avec nb questions
  const { data: series } = await supabase
    .from("series")
    .select(`
      *,
      series_questions (count),
      serie_attempts!left (id, score, ended_at)
    `)
    .eq("cours_id", coursId)
    .eq("visible", true)
    .order("order_index");

  const seriesEnrichies = (series || []).map((s) => ({
    ...s,
    nb_questions: s.series_questions?.[0]?.count ?? 0,
    last_attempt: Array.isArray(s.serie_attempts) ? s.serie_attempts[0] ?? null : null,
    series_questions: undefined,
    serie_attempts: undefined,
  }));

  // Charger la progression
  const { data: progress } = await supabase
    .from("user_progress")
    .select("*")
    .eq("cours_id", coursId)
    .eq("user_id", user!.id)
    .single();

  // Charger les questions pour le module révisions
  const { data: questions } = await supabase
    .from("questions")
    .select("id, text, type, options (id, label, text, is_correct, order_index)")
    .eq("cours_id", coursId)
    .order("created_at");

  const matiere = cours.matiere as any;
  const dossier = matiere?.dossier as any;

  return (
    <div>
      <Header
        title={cours.name}
        breadcrumb={[
          { label: "Cours", href: "/cours" },
          ...(dossier ? [{ label: dossier.name, href: "/cours" }] : []),
          ...(matiere ? [{ label: matiere.name, href: `/cours/matiere/${matiere.id}` }] : []),
          { label: cours.name },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Colonne gauche : PDF */}
        <div className="lg:col-span-3">
          <PdfViewer
            coursId={cours.id}
            pdfUrl={cours.pdf_url ?? ""}
            nbPages={cours.nb_pages}
            currentPage={progress?.current_page ?? 1}
            version={cours.version}
          />
        </div>

        {/* Colonne droite : séries + révisions */}
        <div className="lg:col-span-2 space-y-4">
          {seriesEnrichies.length > 0 && (
            <SeriesList series={seriesEnrichies} />
          )}

          {(questions?.length ?? 0) > 0 && (
            <ModuleRevisions
              coursId={cours.id}
              questions={questions as any}
            />
          )}

          {seriesEnrichies.length === 0 && (questions?.length ?? 0) === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
              <p className="text-sm text-gray-400">Aucun exercice disponible pour ce cours.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
