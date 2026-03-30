import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessScopeForUser } from "@/lib/access-scope";
import { CommunicationShell } from "@/components/admin/communication/communication-shell";
import type { CoachingIntakeForm, Dossier, FormField, FormTemplate, Groupe, Matiere, Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CommunicationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const role = profile.role;
  const isAdmin = ["admin", "superadmin"].includes(role);
  const scope = await getAccessScopeForUser(supabase as any, user.id);
  const admin = createAdminClient();
  const addDossierAncestors = (sourceIds: Iterable<string>, dossiers: Dossier[]) => {
    const dossierMap = new Map(dossiers.map((d) => [d.id, d]));
    const allowed = new Set<string>();

    const visit = (id: string) => {
      if (allowed.has(id)) return;
      allowed.add(id);
      const dossier = dossierMap.get(id);
      if (dossier?.parent_id) visit(dossier.parent_id);
    };

    for (const id of sourceIds) visit(id);
    return allowed;
  };

  // Fetch all data in parallel
  const [
    annoncesRes, groupesRes, dossiersRes, matieresRes, profMatieresRes, coachAssignmentsRes,
    templatesRes, fieldsRes, formDossiersRes, studentsRes, responsesRes,
  ] = await Promise.all([
    // Annonces
    (role === "prof" || role === "coach")
      ? supabase.from("posts").select("*, author:profiles(first_name, last_name), groupe:groupes(name, color), dossier:dossiers(id, name, color, parent_id), matiere:matieres(id, name, color, dossier_id)").eq("type", "annonce").eq("author_id", user.id).order("pinned", { ascending: false }).order("created_at", { ascending: false })
      : supabase.from("posts").select("*, author:profiles(first_name, last_name), groupe:groupes(name, color), dossier:dossiers(id, name, color, parent_id), matiere:matieres(id, name, color, dossier_id)").eq("type", "annonce").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("groupes").select("*").order("name"),
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    supabase.from("matieres").select("*").eq("visible", true).order("name"),
    role === "prof" ? supabase.from("prof_matieres").select("matiere_id").eq("prof_id", user.id) : Promise.resolve({ data: [] }),
    role === "coach" ? supabase.from("coach_groupe_assignments").select("groupe_id").eq("coach_id", user.id) : Promise.resolve({ data: [] }),
    // Formulaires (admin only)
    isAdmin ? admin.from("form_templates").select("*").order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    isAdmin ? admin.from("form_fields").select("*").order("order_index").order("created_at") : Promise.resolve({ data: [] }),
    isAdmin ? admin.from("dossiers").select("*").in("dossier_type", ["offer", "university"]).order("order_index").order("name") : Promise.resolve({ data: [] }),
    isAdmin ? admin.from("profiles").select("*").eq("role", "eleve").order("last_name").order("first_name") : Promise.resolve({ data: [] }),
    isAdmin ? admin.from("coaching_intake_forms").select("*, student:profiles(*), groupe:groupes(*)").order("submitted_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  const allDossiers = (dossiersRes.data ?? []) as Dossier[];
  const allMatieres = (matieresRes.data ?? []) as Matiere[];
  const allGroupes = (groupesRes.data ?? []) as Groupe[];
  const profMatiereIds = new Set((profMatieresRes.data ?? []).map((i: any) => i.matiere_id).filter(Boolean));
  const coachGroupeIds = new Set((coachAssignmentsRes.data ?? []).map((i: any) => i.groupe_id).filter(Boolean));

  const profFormationDossierIds = addDossierAncestors(
    allMatieres
      .filter((matiere) => profMatiereIds.has(matiere.id))
      .map((matiere) => matiere.dossier_id)
      .filter(Boolean) as string[],
    allDossiers
  );

  const availableGroupes =
    role === "prof"
      ? allGroupes.filter((groupe) => groupe.formation_dossier_id && profFormationDossierIds.has(groupe.formation_dossier_id))
      : role === "coach"
        ? allGroupes.filter((groupe) => coachGroupeIds.has(groupe.id))
        : allGroupes;

  const availableDossierIds =
    role === "prof" || role === "coach"
      ? addDossierAncestors(
          availableGroupes.map((groupe) => groupe.formation_dossier_id).filter(Boolean) as string[],
          allDossiers
        )
      : new Set(allDossiers.map((dossier) => dossier.id));

  const availableDossiers = (role === "prof" || role === "coach")
    ? allDossiers.filter((d) => availableDossierIds.has(d.id) || scope.allowedDossierIds.has(d.id))
    : allDossiers;
  const availableMatieres = role === "prof" ? allMatieres.filter(m => profMatiereIds.has(m.id)) : allMatieres;

  return (
    <div className="bg-[#0e1e35] rounded-2xl h-[calc(100vh-9rem)] overflow-hidden flex flex-col">
      <CommunicationShell
        currentProfile={profile as Profile}
        // Annonces
        initialAnnonces={(annoncesRes.data ?? []) as any[]}
        annoncesGroupes={availableGroupes}
        annoncesDossiers={availableDossiers}
        annoncesMatieres={availableMatieres}
        // Formulaires
        initialTemplates={((templatesRes as any).data ?? []) as FormTemplate[]}
        initialFields={((fieldsRes as any).data ?? []) as FormField[]}
        initialFormDossiers={((formDossiersRes as any).data ?? []) as Dossier[]}
        initialGroupes={allGroupes}
        initialStudents={((studentsRes as any).data ?? []) as Profile[]}
        initialResponses={((responsesRes as any).data ?? []) as CoachingIntakeForm[]}
      />
    </div>
  );
}
