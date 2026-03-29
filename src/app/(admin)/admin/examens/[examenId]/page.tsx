import { createClient } from "@/lib/supabase/server";
import { ExamenDetailShell } from "@/components/admin/examens/examen-detail-shell";
import { redirect } from "next/navigation";
import type { Dossier, Groupe, Matiere } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ExamenDetailPage({ params }: { params: Promise<{ examenId: string }> }) {
  const { examenId } = await params;
  const supabase = await createClient();

  const [examenRes, allDossiersRes, groupesRes, filieresRes, matieresRes, exGroupesRes] = await Promise.all([
    supabase
      .from("examens")
      .select("*, examens_series(series_id, order_index, coefficient, debut_at, fin_at, groupe_ids, series:series(id, name, type, matiere_id, timed, duration_minutes, description, cours_id, score_definitif, visible, annee, created_at, updated_at))")
      .eq("id", examenId)
      .single(),
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    supabase.from("groupes").select("*").order("name"),
    supabase.from("filieres").select("*").order("order_index"),
    supabase.from("matieres").select("*").eq("visible", true).order("order_index"),
    supabase.from("examens_groupes").select("groupe_id").eq("examen_id", examenId),
  ]);

  if (!examenRes.data) redirect("/admin/examens");

  const examen = {
    ...examenRes.data,
    examen_series: (examenRes.data.examens_series ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index),
    series: (examenRes.data.examens_series ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((es: any) => es.series)
      .filter(Boolean),
    examens_series: undefined,
    groupe_ids: (exGroupesRes.data ?? []).map((eg: any) => eg.groupe_id),
  };

  const matiereIds = examen.examen_series
    .map((es: any) => es.series?.matiere_id)
    .filter(Boolean);

  // Load attempts for results
  const seriesIds = examen.examen_series.map((es: any) => es.series_id);
  const [attemptsRes, matiereCoefficientsRes] = await Promise.all([
    seriesIds.length > 0
      ? supabase
          .from("serie_attempts")
          .select("*, user:profiles(id, first_name, last_name, email, filiere_id, groupe_id, filiere:filieres(id, name, code, color))")
          .in("series_id", seriesIds)
          .not("ended_at", "is", null)
          .order("score", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    matiereIds.length > 0
      ? supabase
          .from("matiere_coefficients")
          .select("matiere_id, filiere_id, coefficient")
          .in("matiere_id", matiereIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return (
    <div className="bg-[#0e1e35] rounded-2xl h-[calc(100vh-9rem)] overflow-hidden flex flex-col">
      <ExamenDetailShell
        examen={examen}
        attempts={attemptsRes.data ?? []}
        filieres={filieresRes.data ?? []}
        allDossiers={(allDossiersRes.data ?? []) as Dossier[]}
        groupes={(groupesRes.data ?? []) as Groupe[]}
        matieres={(matieresRes.data ?? []) as Matiere[]}
        matiereCoefficients={matiereCoefficientsRes.data ?? []}
      />
    </div>
  );
}
