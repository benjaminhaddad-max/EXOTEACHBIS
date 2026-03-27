import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAccessScopeForUser } from "@/lib/access-scope";
import { QaDashboard } from "@/components/admin/qa/qa-dashboard";
import type { Dossier, Groupe } from "@/types/database";
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

  const [threadsRes, dossiersRes, groupesRes] = await Promise.all([
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
    supabase.from("groupes").select("*").order("name"),
  ]);

  const allDossiers = (dossiersRes.data ?? []) as Dossier[];
  const allGroupes = (groupesRes.data ?? []) as Groupe[];

  const availableDossiers =
    role === "prof" || role === "coach"
      ? allDossiers.filter(d => scope.allowedDossierIds.has(d.id))
      : allDossiers;
  const qaTreeDossiers = availableDossiers.filter(d => d.dossier_type === "offer" || d.dossier_type === "university");
  const qaGroupes =
    role === "prof" || role === "coach"
      ? allGroupes.filter(g => g.id === profile.groupe_id)
      : allGroupes;

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Questions / Réponses</h1>
      <QaDashboard
        initialThreads={(threadsRes.data ?? []) as unknown as QaThread[]}
        userId={user.id}
        initialThreadId={params.thread}
        qaTreeDossiers={qaTreeDossiers}
        qaGroupes={qaGroupes}
      />
    </div>
  );
}
