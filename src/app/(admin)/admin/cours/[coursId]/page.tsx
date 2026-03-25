import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PdfViewer } from "@/components/cours/pdf-viewer";
import { SeriesList } from "@/components/cours/series-list";
import { ModuleRevisions } from "@/components/cours/module-revisions";
import { AdminCoursHeader } from "@/components/admin/cours/admin-cours-header";
import { AdminSeriesPanel } from "@/components/admin/cours/admin-series-panel";
import { FileText, BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ coursId: string }>;
}

export default async function AdminCoursDetailPage({ params }: Props) {
  const { coursId } = await params;
  const supabase = await createClient();

  const { data: cours } = await supabase
    .from("cours")
    .select(`
      *,
      dossier:dossiers (id, name, parent_id),
      matiere:matieres (id, name)
    `)
    .eq("id", coursId)
    .single();

  if (!cours) notFound();

  const { data: series } = await supabase
    .from("series")
    .select(`*, series_questions (count)`)
    .eq("cours_id", coursId)
    .order("order_index");

  const seriesEnrichies = (series ?? []).map((s: any) => ({
    ...s,
    nb_questions: s.series_questions?.[0]?.count ?? 0,
    last_attempt: null,
    series_questions: undefined,
  }));

  const { data: questions } = await supabase
    .from("questions")
    .select("id, text, type, explanation, options (id, label, text, is_correct, order_index)")
    .eq("cours_id", coursId)
    .order("created_at");

  const hasPdf = !!cours.pdf_url;
  const hasSeries = seriesEnrichies.length > 0;
  const hasRevisions = (questions?.length ?? 0) > 0;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Admin header avec controls */}
      <AdminCoursHeader cours={cours as any} />

      <div className="px-5 py-5 max-w-7xl mx-auto w-full">
        {/* Badges */}
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-navy/10 px-3 py-1 text-xs font-semibold text-navy">
            Version {(cours as any).version ?? 1}
          </span>
          {(cours as any).nb_pages > 0 && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              {(cours as any).nb_pages} pages
            </span>
          )}
          {!(cours as any).visible && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Masqué aux étudiants
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* ── GAUCHE : PDF ── */}
          <div className="lg:col-span-3 space-y-4">
            {hasPdf ? (
              <PdfViewer
                coursId={cours.id}
                pdfUrl={(cours as any).pdf_url}
                nbPages={(cours as any).nb_pages ?? 0}
                currentPage={1}
                version={(cours as any).version ?? 1}
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                  <FileText className="h-7 w-7 text-gray-300" />
                </div>
                <p className="mt-3 text-sm font-medium text-gray-500">Aucune fiche PDF</p>
                <p className="mt-1 text-xs text-gray-400">Modifiez le cours pour ajouter un PDF</p>
              </div>
            )}
          </div>

          {/* ── DROITE : Séries + Révisions ── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Panel admin pour gérer les séries */}
            <AdminSeriesPanel coursId={coursId} series={seriesEnrichies} />

            {hasRevisions && (
              <ModuleRevisions coursId={cours.id} questions={questions as any} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
