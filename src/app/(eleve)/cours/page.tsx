import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { EleveCoursShell } from "@/components/eleve/cours-shell";

export const dynamic = "force-dynamic";

export default async function CoursPage() {
  const supabase = await createClient();
  const { data: dossiers } = await supabase.from("dossiers").select("*").order("order_index");
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header title="Cours & Exercices" />
      <EleveCoursShell initialDossiers={dossiers ?? []} />
    </div>
  );
}
