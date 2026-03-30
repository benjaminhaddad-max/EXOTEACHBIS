import { createClient } from "@/lib/supabase/server";
import { CoefficientsShell } from "@/components/admin/examens/coefficients-shell";

export const dynamic = "force-dynamic";

export default async function CoefficientsPage() {
  const supabase = await createClient();

  const [filieresRes, matieresRes, coeffsRes] = await Promise.all([
    supabase.from("filieres").select("*").order("order_index"),
    supabase.from("matieres").select("id, name, dossier_id").order("name"),
    supabase.from("matiere_coefficients").select("*"),
  ]);

  return (
    <div className="bg-[#0e1e35] rounded-2xl min-h-[calc(100vh-8rem)] overflow-hidden">
      <CoefficientsShell
        filieres={filieresRes.data ?? []}
        matieres={matieresRes.data ?? []}
        coefficients={coeffsRes.data ?? []}
      />
    </div>
  );
}
