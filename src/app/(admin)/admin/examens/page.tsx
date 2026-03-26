import { createClient } from "@/lib/supabase/server";
import { ExamensShell, type ExamenWithSeries } from "@/components/admin/examens/examens-shell";
import type { Serie, Filiere, Dossier, Groupe } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ExamensAdminPage() {
  const supabase = await createClient();

  const [examensRes, seriesRes, filieresRes, dossiersRes, groupesRes, exGroupesRes] = await Promise.all([
    supabase
      .from("examens")
      .select("*, examens_series(series_id, order_index, coefficient, series:series(*))")
      .order("debut_at", { ascending: false }),
    supabase.from("series").select("*").eq("visible", true).order("name"),
    supabase.from("filieres").select("*").order("order_index"),
    supabase.from("dossiers").select("*").eq("visible", true).in("dossier_type", ["offer", "university"]).order("order_index"),
    supabase.from("groupes").select("*").order("name"),
    supabase.from("examens_groupes").select("*"),
  ]);

  const examens: ExamenWithSeries[] = (examensRes.data ?? []).map((e: any) => ({
    ...e,
    examen_series: (e.examens_series ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index),
    series: (e.examens_series ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((es: any) => es.series)
      .filter(Boolean),
    examens_series: undefined,
  }));

  // Build a map of examen_id -> groupe_ids
  const examenGroupesMap: Record<string, string[]> = {};
  for (const eg of (exGroupesRes.data ?? [])) {
    if (!examenGroupesMap[eg.examen_id]) examenGroupesMap[eg.examen_id] = [];
    examenGroupesMap[eg.examen_id].push(eg.groupe_id);
  }

  // Attach groupe_ids to each examen
  const examensWithGroupes = examens.map(e => ({
    ...e,
    groupe_ids: examenGroupesMap[e.id] ?? [],
  }));

  const allSeries: Serie[] = (seriesRes.data ?? []) as Serie[];
  const filieres: Filiere[] = (filieresRes.data ?? []) as Filiere[];
  const dossiers: Dossier[] = (dossiersRes.data ?? []) as Dossier[];
  const groupes: Groupe[] = (groupesRes.data ?? []) as Groupe[];

  return (
    <div className="bg-[#0e1e35] rounded-2xl h-[calc(100vh-9rem)] overflow-hidden flex flex-col">
      <ExamensShell
        initialExamens={examensWithGroupes}
        allSeries={allSeries}
        filieres={filieres}
        dossiers={dossiers}
        groupes={groupes}
      />
    </div>
  );
}
