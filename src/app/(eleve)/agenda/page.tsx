import { createClient } from "@/lib/supabase/server";
import { AgendaShell } from "@/components/eleve/agenda-shell";
import type { CalendarEvent, StudentEvent } from "@/types/database";
import { getStudentMatieresCours } from "./actions";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("groupe_id")
    .eq("id", user!.id)
    .single();

  const [adminEventsRes, studentEventsRes, matCours] = await Promise.all([
    profile?.groupe_id
      ? supabase
          .from("events")
          .select("*")
          .or(`groupe_id.is.null,groupe_id.eq.${profile.groupe_id}`)
          .order("start_at")
      : supabase
          .from("events")
          .select("*")
          .is("groupe_id", null)
          .order("start_at"),
    supabase
      .from("student_events")
      .select("*, matiere:matieres(id, name, color), cours:cours(id, name)")
      .eq("student_id", user!.id)
      .order("start_at"),
    getStudentMatieresCours(),
  ]);

  return (
    <AgendaShell
      adminEvents={(adminEventsRes.data ?? []) as CalendarEvent[]}
      studentEvents={(studentEventsRes.data ?? []) as StudentEvent[]}
      matieres={matCours.matieres}
      cours={matCours.cours}
    />
  );
}
