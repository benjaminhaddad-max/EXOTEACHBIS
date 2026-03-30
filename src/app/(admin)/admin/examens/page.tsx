import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ExamensShell, type ExamenWithSeries } from "@/components/admin/examens/examens-shell";
import type { Serie, Filiere, Dossier, Groupe, Matiere } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ExamensAdminPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  const userRole = profile.role as string;

  let profMatiereIds: Set<string> | null = null;
  if (userRole === "prof") {
    const { data: profMatiereRows } = await supabase
      .from("prof_matieres")
      .select("matiere_id")
      .eq("prof_id", user.id);
    profMatiereIds = new Set((profMatiereRows ?? []).map((r: any) => r.matiere_id));
  }

  const [examensRes, seriesRes, filieresRes, dossiersRes, allDossiersRes, groupesRes, exGroupesRes, matieresRes] = await Promise.all([
    supabase
      .from("examens")
      .select("*, examens_series(series_id, order_index, coefficient, debut_at, fin_at, series:series(*))")
      .order("debut_at", { ascending: false }),
    supabase.from("series").select("*").eq("visible", true).order("name"),
    supabase.from("filieres").select("*").order("order_index"),
    supabase.from("dossiers").select("*").eq("visible", true).in("dossier_type", ["offer", "university"]).order("order_index"),
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    supabase.from("groupes").select("*").order("name"),
    supabase.from("examens_groupes").select("*"),
    supabase.from("matieres").select("*").eq("visible", true).order("order_index"),
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

  const examenGroupesMap: Record<string, string[]> = {};
  for (const eg of (exGroupesRes.data ?? [])) {
    if (!examenGroupesMap[eg.examen_id]) examenGroupesMap[eg.examen_id] = [];
    examenGroupesMap[eg.examen_id].push(eg.groupe_id);
  }

  const examensWithGroupes = examens.map(e => ({
    ...e,
    groupe_ids: examenGroupesMap[e.id] ?? [],
  }));

  const allSeries: Serie[] = (seriesRes.data ?? []) as Serie[];
  const filieres: Filiere[] = (filieresRes.data ?? []) as Filiere[];
  const dossiers: Dossier[] = (dossiersRes.data ?? []) as Dossier[];
  const groupes: Groupe[] = (groupesRes.data ?? []) as Groupe[];
  const matieres: Matiere[] = (matieresRes.data ?? []) as Matiere[];

  return (
    <div className="bg-[#0e1e35] rounded-2xl h-[calc(100vh-9rem)] overflow-hidden flex flex-col">
      <ExamensShell
        initialExamens={examensWithGroupes}
        allSeries={allSeries}
        filieres={filieres}
        dossiers={dossiers}
        allDossiers={(allDossiersRes.data ?? []) as Dossier[]}
        groupes={groupes}
        matieres={matieres}
        userRole={userRole}
        profMatiereIds={profMatiereIds ? Array.from(profMatiereIds) : undefined}
      />
    </div>
  );
}
