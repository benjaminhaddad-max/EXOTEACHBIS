import { createClient } from "@/lib/supabase/server";
import { AgendaShell } from "@/components/eleve/agenda-shell";
import type { CalendarEvent } from "@/types/database";

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

  const { data: events } = profile?.groupe_id
    ? await supabase
        .from("events")
        .select("*")
        .or(`groupe_id.is.null,groupe_id.eq.${profile.groupe_id}`)
        .order("start_at")
    : await supabase
        .from("events")
        .select("*")
        .is("groupe_id", null)
        .order("start_at");

  return <AgendaShell events={(events ?? []) as CalendarEvent[]} />;
}
