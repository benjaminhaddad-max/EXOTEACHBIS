import { createClient } from "@/lib/supabase/server";
import { PedagogieShell } from "@/components/admin/pedagogie/pedagogie-shell";

export const dynamic = "force-dynamic";

export default async function PedagogiePage() {
  const supabase = await createClient();

  const { data: dossiers } = await supabase
    .from("dossiers")
    .select("*")
    .order("order_index");

  return <PedagogieShell initialDossiers={dossiers ?? []} />;
}
