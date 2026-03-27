import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAccessScopeForUser } from "@/lib/access-scope";
import { QaDashboard } from "@/components/admin/qa/qa-dashboard";
import type { Dossier, Matiere } from "@/types/database";
import type { QaThread } from "@/types/qa";

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

  const [threadsRes, dossiersRes, matieresRes, profMatieresRes] = await Promise.all([
    supabase
      .from("qa_threads")
      .select(`
        *,
        student:profiles!qa_threads_student_id_fkey(id, first_name, last_name, email, avatar_url, groupe_id),
        matiere:matieres(id, name, color),
        last_message:qa_messages(id, content, content_type, sender_type, created_at)
      `)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false, referencedTable: "qa_messages" })
      .limit(1, { referencedTable: "qa_messages" }),
    supabase.from("dossiers").select("*").eq("visible", true).order("order_index"),
    supabase.from("matieres").select("*").eq("visible", true).order("order_index"),
    role === "prof"
      ? supabase.from("prof_matieres").select("matiere_id").eq("prof_id", user.id)
      : Promise.resolve({ data: [] as { matiere_id: string }[] }),
  ]);

  const allDossiers = (dossiersRes.data ?? []) as Dossier[];
  const allMatieres = (matieresRes.data ?? []) as Matiere[];

  const availableDossiers =
    role === "prof" || role === "coach"
      ? allDossiers.filter(d => scope.allowedDossierIds.has(d.id))
      : allDossiers;

  const profMatiereIds = new Set((profMatieresRes.data ?? []).map((r: { matiere_id: string }) => r.matiere_id));
  const availableMatieres =
    role === "prof" ? allMatieres.filter(m => profMatiereIds.has(m.id)) : allMatieres;

  const dossierIds = new Set(availableDossiers.map(d => d.id));
  const qaMatieres = availableMatieres.filter(m => dossierIds.has(m.dossier_id));

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Questions / Réponses</h1>
      <QaDashboard
        initialThreads={(threadsRes.data ?? []) as unknown as QaThread[]}
        userId={user.id}
        initialThreadId={params.thread}
        qaDossiers={availableDossiers}
        qaMatieres={qaMatieres}
      />
    </div>
  );
}
