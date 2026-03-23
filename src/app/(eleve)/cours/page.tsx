import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { CoursArborescence } from "@/components/cours/cours-arborescence";
import type { Dossier } from "@/types/database";

export default async function CoursPage() {
  const supabase = await createClient();

  // Charger les dossiers racine avec leurs enfants et matières
  const { data: dossiers } = await supabase
    .from("dossiers")
    .select(`
      *,
      matieres (
        *,
        cours (id)
      )
    `)
    .is("parent_id", null)
    .eq("visible", true)
    .order("order_index");

  // Enrichir avec nb_cours
  const dossiersEnrichis: Dossier[] = (dossiers || []).map((d) => ({
    ...d,
    matieres: d.matieres?.map((m: any) => ({
      ...m,
      nb_cours: m.cours?.length ?? 0,
      cours: undefined,
    })),
  }));

  return (
    <div>
      <Header title="Mes cours" />
      <CoursArborescence dossiers={dossiersEnrichis} />
    </div>
  );
}
