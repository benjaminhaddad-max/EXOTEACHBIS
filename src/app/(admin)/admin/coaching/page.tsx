import { Header } from "@/components/header";
import { CoachingShell } from "@/components/admin/coaching/coaching-shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CoachingPage() {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [studentsRes, coachesRes, groupesRes, meetingsRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "eleve"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "coach"),
    supabase.from("groupes").select("id", { count: "exact", head: true }),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("type", "reunion")
      .gte("start_at", now),
  ]);

  const stats = [
    {
      label: "Eleves",
      value: String(studentsRes.count ?? 0),
      hint: "Base actuelle d'eleves a segmenter et suivre.",
    },
    {
      label: "Coachs",
      value: String(coachesRes.count ?? 0),
      hint: "Pool de coachs potentiels a affecter aux cohortes.",
    },
    {
      label: "Groupes",
      value: String(groupesRes.count ?? 0),
      hint: "Classes ou cohortes a utiliser pour organiser le coaching.",
    },
    {
      label: "Reunions planifiees",
      value: String(meetingsRes.count ?? 0),
      hint: "Evenements staff de type reunion deja presents dans le planning.",
    },
  ];

  return (
    <div>
      <Header title="Coaching" />
      <CoachingShell stats={stats} />
    </div>
  );
}
