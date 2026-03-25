import { createClient } from "@/lib/supabase/server";
import { UtilisateursShell } from "@/components/admin/utilisateurs/utilisateurs-shell";
import type { Profile, Groupe, Dossier } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function UtilisateursPage() {
  const supabase = await createClient();

  const [usersRes, groupesRes, dossiersRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("groupes").select("*").order("name"),
    supabase.from("dossiers").select("*").order("order_index"),
  ]);

  return (
    <div className="bg-[#0e1e35] rounded-2xl min-h-[calc(100vh-8rem)] overflow-hidden">
      <UtilisateursShell
        initialUsers={(usersRes.data ?? []) as Profile[]}
        initialGroupes={(groupesRes.data ?? []) as Groupe[]}
        initialDossiers={(dossiersRes.data ?? []) as Dossier[]}
      />
    </div>
  );
}
