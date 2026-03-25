import { createClient } from "@/lib/supabase/server";
import { ExamensShell, type ExamenWithSeries } from "@/components/admin/examens/examens-shell";
import type { Serie } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ExamensAdminPage() {
  const supabase = await createClient();

  const [examensRes, seriesRes] = await Promise.all([
    supabase
      .from("examens")
      .select("*, examens_series(series_id, order_index, series:series(*))")
      .order("debut_at", { ascending: false }),
    supabase.from("series").select("*").eq("visible", true).order("name"),
  ]);

  const examens: ExamenWithSeries[] = (examensRes.data ?? []).map((e: any) => ({
    ...e,
    series: (e.examens_series ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((es: any) => es.series)
      .filter(Boolean),
    examens_series: undefined,
  }));

  const allSeries: Serie[] = (seriesRes.data ?? []) as Serie[];

  return (
    <div className="bg-[#0e1e35] rounded-2xl min-h-[calc(100vh-8rem)] overflow-hidden">
      <ExamensShell initialExamens={examens} allSeries={allSeries} />
    </div>
  );
}
