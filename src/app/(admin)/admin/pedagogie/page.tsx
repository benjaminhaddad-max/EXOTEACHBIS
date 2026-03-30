import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PedagogieShell } from "@/components/admin/pedagogie/pedagogie-shell";
import { parsePedagogieAdminSettings } from "@/lib/pedagogie-admin-settings";
import type { Dossier } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function PedagogiePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  const role = profile.role as string;

  const [dossiersRes, settingsRes] = await Promise.all([
    supabase.from("dossiers").select("*").order("order_index"),
    supabase.from("admin_settings").select("key, value"),
  ]);

  const settings = parsePedagogieAdminSettings((settingsRes.data ?? []) as { key: string; value: unknown }[]);
  let dossiers = (dossiersRes.data ?? []) as Dossier[];

  if (role === "prof") {
    const { data: profMatiereRows } = await supabase
      .from("prof_matieres")
      .select("matiere_id")
      .eq("prof_id", user.id);

    const profMatiereIds = new Set((profMatiereRows ?? []).map((r: any) => r.matiere_id));

    const { data: matieresRaw } = await supabase
      .from("matieres")
      .select("id, dossier_id")
      .in("id", Array.from(profMatiereIds));

    const profDossierIds = new Set((matieresRaw ?? []).map((m: any) => m.dossier_id as string));

    const dossierMap = new Map(dossiers.map(d => [d.id, d]));
    const allowedIds = new Set<string>();

    const addAncestors = (id: string) => {
      if (allowedIds.has(id)) return;
      allowedIds.add(id);
      const d = dossierMap.get(id);
      if (d?.parent_id) addAncestors(d.parent_id);
    };

    for (const did of profDossierIds) addAncestors(did);

    dossiers = dossiers.filter(d => allowedIds.has(d.id));
  }

  return (
    <PedagogieShell
      initialDossiers={dossiers}
      formationOffers={settings.formationOffers}
      dossierNamePresets={settings.dossierNamePresets}
      userRole={role}
    />
  );
}
