import { createClient } from "@/lib/supabase/server";
import { ParametrageShell } from "@/components/admin/examens/parametrage-shell";
import type { Dossier, Filiere, Matiere } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ParametragePage() {
  const supabase = await createClient();

  const [dossiersRes, allDossiersRes, matieresRes, filieresRes] = await Promise.all([
    supabase
      .from("dossiers")
      .select("*")
      .eq("visible", true)
      .in("dossier_type", ["offer", "university"])
      .order("order_index"),
    supabase
      .from("dossiers")
      .select("*")
      .eq("visible", true)
      .order("order_index"),
    supabase.from("matieres").select("*").eq("visible", true).order("order_index"),
    supabase.from("filieres").select("*").order("order_index"),
  ]);

  return (
    <div className="bg-[#0e1e35] rounded-2xl h-[calc(100vh-9rem)] overflow-hidden flex flex-col">
      <ParametrageShell
        dossiers={(dossiersRes.data ?? []) as Dossier[]}
        allDossiers={(allDossiersRes.data ?? []) as Dossier[]}
        matieres={(matieresRes.data ?? []) as Matiere[]}
        filieres={(filieresRes.data ?? []) as Filiere[]}
      />
    </div>
  );
}
