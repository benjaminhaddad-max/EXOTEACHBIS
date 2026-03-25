import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { QaDashboard } from "@/components/admin/qa/qa-dashboard";
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
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "superadmin", "prof"].includes(profile.role)) {
    redirect("/dashboard");
  }

  // Fetch threads with relations
  const { data: threads } = await supabase
    .from("qa_threads")
    .select(`
      *,
      student:profiles!qa_threads_student_id_fkey(id, first_name, last_name, email, avatar_url, groupe_id),
      matiere:matieres(id, name, color),
      last_message:qa_messages(id, content, content_type, sender_type, created_at)
    `)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false, referencedTable: "qa_messages" })
    .limit(1, { referencedTable: "qa_messages" });

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Questions / Réponses</h1>
      <QaDashboard
        initialThreads={(threads ?? []) as unknown as QaThread[]}
        userId={user.id}
        initialThreadId={params.thread}
      />
    </div>
  );
}
