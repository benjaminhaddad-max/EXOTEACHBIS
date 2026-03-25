import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { EleveCoursShell } from "@/components/eleve/cours-shell";
import { filterDossiersByAccess, getAccessScopeForUser } from "@/lib/access-scope";

export const dynamic = "force-dynamic";

export default async function CoursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [dossiersRes, scope] = await Promise.all([
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    getAccessScopeForUser(supabase, user!.id),
  ]);

  const dossiers = filterDossiersByAccess(dossiersRes.data ?? [], scope);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header title="Cours & Exercices" />
      <EleveCoursShell initialDossiers={dossiers} />
    </div>
  );
}
