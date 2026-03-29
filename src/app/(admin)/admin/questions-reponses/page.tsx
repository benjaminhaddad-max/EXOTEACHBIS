import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAccessScopeForUser } from "@/lib/access-scope";
import { QaDashboard } from "@/components/admin/qa/qa-dashboard";
import type { Dossier, Groupe, Matiere, Profile } from "@/types/database";
import type { ProfMatiere, QaThread } from "@/types/qa";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ thread?: string }>;
}

export default async function QuestionsReponsesPage({ searchParams }: Props) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, groupe_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "superadmin", "prof"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const scope = await getAccessScopeForUser(supabase as any, user.id);
  const role = profile.role;

  const [threadsRes, dossiersRes, matieresRes, profMatieresRes, profsRes, groupesRes] = await Promise.all([
    supabase
      .from("qa_threads")
      .select(`
        *,
        student:profiles!qa_threads_student_id_fkey(id, first_name, last_name, email, avatar_url, groupe_id),
        matiere:matieres(id, name, color),
        assigned_prof:profiles!qa_threads_assigned_prof_id_fkey(id, first_name, last_name, email, avatar_url, phone, role),
        last_message:qa_messages(id, content, content_type, sender_type, created_at)
      `)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false, referencedTable: "qa_messages" })
      .limit(1, { referencedTable: "qa_messages" }),
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    supabase.from("matieres").select("*").eq("visible", true).order("order_index"),
    role === "prof"
      ? supabase.from("prof_matieres").select("prof_id, matiere_id, role_type").eq("prof_id", user.id).in("role_type", ["qa", "cours"])
      : supabase.from("prof_matieres").select("prof_id, matiere_id, role_type"),
    role === "prof"
      ? supabase
          .from("profiles")
          .select("id, first_name, last_name, email, avatar_url, phone, role")
          .eq("id", user.id)
      : supabase
          .from("profiles")
          .select("id, first_name, last_name, email, avatar_url, phone, role")
          .eq("role", "prof")
          .order("first_name"),
    supabase
      .from("groupes")
      .select("id, name, formation_dossier_id")
      .order("name"),
  ]);

  const allDossiers = (dossiersRes.data ?? []) as Dossier[];
  const allMatieres = (matieresRes.data ?? []) as Matiere[];

  const availableDossiers =
    role === "prof" || role === "coach"
      ? allDossiers.filter(d => scope.allowedDossierIds.has(d.id))
      : allDossiers;

  const profMatiereRows = (profMatieresRes.data ?? []) as ProfMatiere[];
  const profMatiereIds = new Set(profMatiereRows.map((r) => r.matiere_id));
  const availableMatieres =
    role === "prof" ? allMatieres.filter(m => profMatiereIds.has(m.id)) : allMatieres;

  const dossierIds = new Set(availableDossiers.map(d => d.id));
  const qaMatieres = availableMatieres.filter(m => dossierIds.has(m.dossier_id));
  const qaMatiereIds = new Set(qaMatieres.map(m => m.id));
  const qaProfMatieres = profMatiereRows.filter((row) => qaMatiereIds.has(row.matiere_id));
  const qaProfIds = new Set(qaProfMatieres.map((row) => row.prof_id));
  const qaProfs = ((profsRes.data ?? []) as Pick<
    Profile,
    "id" | "first_name" | "last_name" | "email" | "avatar_url" | "phone" | "role"
  >[]).filter((prof) => qaProfIds.has(prof.id) || prof.id === user.id);

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Questions / Réponses</h1>
      <QaDashboard
        initialThreads={(threadsRes.data ?? []) as unknown as QaThread[]}
        userId={user.id}
        initialThreadId={params.thread}
        qaDossiers={availableDossiers}
        qaMatieres={qaMatieres}
        qaProfs={qaProfs}
        profMatieres={qaProfMatieres.map((row) => ({ prof_id: row.prof_id, matiere_id: row.matiere_id }))}
        qaGroupes={(groupesRes.data ?? []) as Pick<Groupe, "id" | "name" | "formation_dossier_id">[]}
      />
    </div>
  );
}
