import { createClient } from "@/lib/supabase/server";
import { PlanningShell } from "@/components/admin/planning/planning-shell";
import type { Groupe } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const supabase = await createClient();

  const [eventsRes, groupesRes] = await Promise.all([
    supabase.from("events").select("*").order("start_at"),
    supabase.from("groupes").select("*").order("name"),
  ]);

  return (
    <div className="bg-[#0e1e35] rounded-2xl min-h-[calc(100vh-8rem)] overflow-hidden">
      <PlanningShell
        initialEvents={(eventsRes.data ?? []) as any[]}
        groupes={(groupesRes.data ?? []) as Groupe[]}
      />
    </div>
  );
}
