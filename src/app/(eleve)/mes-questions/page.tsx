import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MesQuestionsShell } from "@/components/eleve/mes-questions-shell";
import { Header } from "@/components/header";

export default async function MesQuestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch all threads for this student with last message
  const { data: threads } = await supabase
    .from("qa_threads")
    .select(
      "*, matiere:matieres(id, name, color)"
    )
    .eq("student_id", user.id)
    .order("updated_at", { ascending: false });

  // For each thread, get the last message
  const threadsWithLastMsg = await Promise.all(
    (threads ?? []).map(async (t) => {
      const { data: msgs } = await supabase
        .from("qa_messages")
        .select("id, sender_type, content_type, content, created_at")
        .eq("thread_id", t.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const { count } = await supabase
        .from("qa_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", t.id)
        .eq("read_by_student", false);

      return {
        ...t,
        last_message: msgs?.[0] ?? null,
        unread_count: count ?? 0,
      };
    })
  );

  return (
    <div>
      <Header
        title="Mes questions"
        breadcrumb={[{ label: "Mes questions" }]}
      />
      <MesQuestionsShell threads={threadsWithLastMsg as any} userId={user.id} />
    </div>
  );
}
