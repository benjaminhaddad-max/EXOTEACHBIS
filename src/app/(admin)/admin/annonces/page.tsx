import { createClient } from "@/lib/supabase/server";
import { AnnoncesShell } from "@/components/admin/annonces/annonces-shell";
import { getAccessScopeForUser } from "@/lib/access-scope";
import type { Dossier, Groupe, Matiere, Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AnnoncesAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const role = profile?.role ?? "eleve";
  const scope = await getAccessScopeForUser(supabase as any, user!.id);

  const [annoncesRes, groupesRes, dossiersRes, matieresRes, profMatieresRes] = await Promise.all([
    role === "prof" || role === "coach"
      ? supabase
          .from("posts")
          .select("*, author:profiles(first_name, last_name), groupe:groupes(name, color), dossier:dossiers(id, name, color, parent_id), matiere:matieres(id, name, color, dossier_id)")
          .eq("type", "annonce")
          .eq("author_id", user!.id)
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false })
      : supabase
          .from("posts")
          .select("*, author:profiles(first_name, last_name), groupe:groupes(name, color), dossier:dossiers(id, name, color, parent_id), matiere:matieres(id, name, color, dossier_id)")
          .eq("type", "annonce")
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false }),
    supabase.from("groupes").select("*").order("name"),
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    supabase.from("matieres").select("*").eq("visible", true).order("name"),
    role === "prof"
      ? supabase.from("prof_matieres").select("matiere_id").eq("prof_id", user!.id)
      : Promise.resolve({ data: [] }),
  ]);

  const dossiers = (dossiersRes.data ?? []) as Dossier[];
  const matieres = (matieresRes.data ?? []) as Matiere[];
  const availableGroupes = role === "prof" || role === "coach"
    ? ((groupesRes.data ?? []) as Groupe[]).filter((groupe) => groupe.id === profile?.groupe_id)
    : ((groupesRes.data ?? []) as Groupe[]);
  const availableDossiers = role === "prof" || role === "coach"
    ? dossiers.filter((dossier) => scope.allowedDossierIds.has(dossier.id))
    : dossiers;
  const profMatiereIds = new Set((profMatieresRes.data ?? []).map((item: any) => item.matiere_id).filter(Boolean));
  const availableMatieres = role === "prof"
    ? matieres.filter((matiere) => profMatiereIds.has(matiere.id))
    : matieres;

  return (
    <AnnoncesShell
      initialAnnonces={(annoncesRes.data ?? []) as any[]}
      groupes={availableGroupes}
      dossiers={availableDossiers}
      matieres={availableMatieres}
      currentProfile={(profile ?? null) as Profile | null}
    />
  );
}
