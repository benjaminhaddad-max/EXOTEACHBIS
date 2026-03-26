import { createClient } from "@/lib/supabase/server";
import { PlanningShell } from "@/components/admin/planning/planning-shell";
import type { Groupe, Dossier } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const supabase = await createClient();

  const [eventsRes, groupesRes, dossiersRes] = await Promise.all([
    supabase.from("events").select("*").order("start_at"),
    supabase.from("groupes").select("*").order("name"),
    supabase.from("dossiers").select("*").order("order_index"),
  ]);

  return (
    <div className="bg-[#0e1e35] rounded-2xl h-[calc(100vh-9rem)] overflow-hidden flex flex-col">
      <PlanningShell
        initialEvents={(eventsRes.data ?? []) as any[]}
        groupes={(groupesRes.data ?? []) as Groupe[]}
        dossiers={(dossiersRes.data ?? []) as Dossier[]}
      />
    </div>
  );
}
