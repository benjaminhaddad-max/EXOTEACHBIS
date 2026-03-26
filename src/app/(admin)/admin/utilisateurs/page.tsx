import { createClient } from "@/lib/supabase/server";
import { UtilisateursShell } from "@/components/admin/utilisateurs/utilisateurs-shell";
import { parsePedagogieAdminSettings } from "@/lib/pedagogie-admin-settings";
import type {
  Profile,
  Groupe,
  Dossier,
  Matiere,
  Filiere,
  GroupeDossierAcces,
  ProfileDossierAcces,
  ProfileDossierAccesExclusion,
} from "@/types/database";

export const dynamic = "force-dynamic";

export default async function UtilisateursPage() {
  const supabase = await createClient();

  const [
    usersRes,
    groupesRes,
    dossiersRes,
    matieresRes,
    filieresRes,
    profMatieresRes,
    groupeDossierAccesRes,
    profileDossierAccesRes,
    profileDossierAccessExclusionsRes,
    adminSettingsRes,
    coursRes,
    groupeCoursAccesRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("groupes").select("*").order("name"),
    supabase.from("dossiers").select("*").order("order_index"),
    supabase.from("matieres").select("*").order("name"),
    supabase.from("filieres").select("*").order("name"),
    supabase.from("prof_matieres").select("prof_id, matiere_id"),
    supabase.from("groupe_dossier_acces").select("groupe_id, dossier_id"),
    supabase.from("profile_dossier_acces").select("profile_id, dossier_id"),
    supabase.from("profile_dossier_access_exclusions").select("profile_id, dossier_id"),
    supabase.from("admin_settings").select("key, value"),
    supabase.from("cours").select("id, name, dossier_id, matiere_id, order_index, visible").order("order_index"),
    supabase.from("groupe_cours_acces").select("groupe_id, cours_id"),
  ]);

  const adminSettings = parsePedagogieAdminSettings((adminSettingsRes.data ?? []) as { key: string; value: unknown }[]);

  return (
    <div className="bg-[#0e1e35] rounded-2xl min-h-[calc(100vh-4rem)] overflow-hidden -m-6 lg:-m-8">
      <UtilisateursShell
        initialUsers={(usersRes.data ?? []) as Profile[]}
        initialGroupes={(groupesRes.data ?? []) as Groupe[]}
        initialDossiers={(dossiersRes.data ?? []) as Dossier[]}
        initialMatieres={(matieresRes.data ?? []) as Matiere[]}
        initialFilieres={(filieresRes.data ?? []) as Filiere[]}
        initialProfMatieres={(profMatieresRes.data ?? []) as { prof_id: string; matiere_id: string }[]}
        initialGroupeDossierAcces={(groupeDossierAccesRes.data ?? []) as GroupeDossierAcces[]}
        initialProfileDossierAcces={(profileDossierAccesRes.data ?? []) as ProfileDossierAcces[]}
        initialProfileDossierAccessExclusions={(profileDossierAccessExclusionsRes.data ?? []) as ProfileDossierAccesExclusion[]}
        initialFormationOffers={adminSettings.formationOffers}
        initialDossierNamePresets={adminSettings.dossierNamePresets}
        initialCours={(coursRes.data ?? []) as { id: string; name: string; dossier_id: string | null; matiere_id: string | null; order_index: number; visible: boolean }[]}
        initialGroupeCoursAcces={(groupeCoursAccesRes.data ?? []) as { groupe_id: string; cours_id: string }[]}
      />
    </div>
  );
}
