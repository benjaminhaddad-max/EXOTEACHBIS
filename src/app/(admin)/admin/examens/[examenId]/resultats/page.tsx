import { createClient } from "@/lib/supabase/server";
import { ResultatsShell } from "@/components/admin/examens/resultats-shell";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ResultatsPage({ params }: { params: Promise<{ examenId: string }> }) {
  const { examenId } = await params;
  const supabase = await createClient();

  const { data: examen } = await supabase
    .from("examens")
    .select("*, examens_series(series_id, order_index, coefficient, debut_at, fin_at, series:series(id, name, matiere_id, matiere:matieres(id, name)))")
    .eq("id", examenId)
    .single();

  if (!examen) redirect("/admin/examens");

  const examenSeries = (examen.examens_series ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index);

  const seriesIds = examenSeries.map((es: any) => es.series_id);
  const matiereIds = examenSeries
    .map((es: any) => es.series?.matiere_id)
    .filter(Boolean);

  // Load all serie_attempts for these series
  const { data: attempts } = seriesIds.length > 0
    ? await supabase
        .from("serie_attempts")
        .select("*, user:profiles(id, first_name, last_name, email, filiere_id, filiere:filieres(id, name, code, color))")
        .in("series_id", seriesIds)
        .not("ended_at", "is", null)
        .order("score", { ascending: false })
    : { data: [] };

  // Load filieres
  const { data: filieres } = await supabase
    .from("filieres")
    .select("*")
    .order("order_index");

  const { data: matiereCoefficients } = matiereIds.length > 0
    ? await supabase
        .from("matiere_coefficients")
        .select("matiere_id, filiere_id, coefficient")
        .in("matiere_id", matiereIds)
    : { data: [] };

  return (
    <div className="bg-[#0e1e35] rounded-2xl min-h-[calc(100vh-8rem)] overflow-hidden">
      <ResultatsShell
        examen={{
          ...examen,
          examen_series: examenSeries,
          examens_series: undefined,
        }}
        attempts={attempts ?? []}
        filieres={filieres ?? []}
        matiereCoefficients={matiereCoefficients ?? []}
      />
    </div>
  );
}
