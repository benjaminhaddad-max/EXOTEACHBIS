import { createClient } from "@/lib/supabase/server";
import { ExercicesShell } from "@/components/admin/exercices/exercices-shell";
import type { QuestionWithOptions, SerieWithCount } from "@/components/admin/exercices/exercices-shell";

export const dynamic = "force-dynamic";

export default async function ExercicesAdminPage() {
  const supabase = await createClient();

  const [dossiersRes, coursRes, questionsRes, seriesRes] = await Promise.all([
    supabase
      .from("dossiers")
      .select("id, name, color, parent_id, order_index")
      .eq("visible", true)
      .order("order_index"),
    supabase
      .from("cours")
      .select("id, name, dossier_id, order_index")
      .eq("visible", true)
      .order("order_index"),
    supabase.from("questions").select("*, options(*)").order("created_at", { ascending: false }),
    supabase
      .from("series")
      .select("*")
      .eq("visible", true)
      .order("created_at", { ascending: false }),
  ]);

  const questions: QuestionWithOptions[] = (questionsRes.data ?? []) as QuestionWithOptions[];
  const series: SerieWithCount[] = (seriesRes.data ?? []).map((s: any) => ({
    ...s,
    nb_questions: 0,
  }));

  return (
    <div className="bg-[#0e1e35] rounded-2xl min-h-[calc(100vh-8rem)] overflow-hidden">
      <ExercicesShell
        dossiers={dossiersRes.data ?? []}
        cours={coursRes.data ?? []}
        initialQuestions={questions}
        initialSeries={series}
      />
    </div>
  );
}
