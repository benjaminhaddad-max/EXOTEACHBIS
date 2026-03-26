import { createClient } from "@/lib/supabase/server";
import { PedagogieShell } from "@/components/admin/pedagogie/pedagogie-shell";
import { parsePedagogieAdminSettings } from "@/lib/pedagogie-admin-settings";

export const dynamic = "force-dynamic";

export default async function PedagogiePage() {
  const supabase = await createClient();

  const [dossiersRes, settingsRes] = await Promise.all([
    supabase.from("dossiers").select("*").order("order_index"),
    supabase.from("admin_settings").select("key, value"),
  ]);

  const settings = parsePedagogieAdminSettings((settingsRes.data ?? []) as { key: string; value: unknown }[]);

  return (
    <PedagogieShell
      initialDossiers={dossiersRes.data ?? []}
      formationOffers={settings.formationOffers}
      dossierNamePresets={settings.dossierNamePresets}
    />
  );
}
