import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/header";
import { KnowledgeBaseShell } from "@/components/admin/knowledge-base/kb-shell";
import type { KbArticle, KbCategory, Dossier, Groupe } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "superadmin") redirect("/admin/dashboard");

  const admin = createAdminClient();

  const [categoriesRes, articlesRes, dossiersRes, groupesRes, statsRes] = await Promise.all([
    admin.from("kb_categories").select("*").order("order_index"),
    admin.from("kb_articles")
      .select("*, category:kb_categories(id,name,slug,color,icon), author:profiles!kb_articles_author_id_fkey(id,first_name,last_name,role)")
      .order("updated_at", { ascending: false })
      .limit(200),
    admin.from("dossiers").select("*").order("order_index"),
    admin.from("groupes").select("*").order("name"),
    Promise.all([
      admin.from("kb_articles").select("id", { count: "exact", head: true }),
      admin.from("kb_articles").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      admin.from("kb_chat_logs").select("id", { count: "exact", head: true }).eq("had_answer", false),
      admin.from("kb_chat_logs").select("id", { count: "exact", head: true }),
    ]),
  ]);

  const stats = {
    totalArticles: statsRes[0].count ?? 0,
    pendingReview: statsRes[1].count ?? 0,
    unansweredQuestions: statsRes[2].count ?? 0,
    totalQuestions: statsRes[3].count ?? 0,
  };

  return (
    <div>
      <Header title="Knowledge Base" />
      <KnowledgeBaseShell
        initialCategories={(categoriesRes.data ?? []) as KbCategory[]}
        initialArticles={(articlesRes.data ?? []) as KbArticle[]}
        dossiers={(dossiersRes.data ?? []) as Dossier[]}
        groupes={(groupesRes.data ?? []) as Groupe[]}
        stats={stats}
      />
    </div>
  );
}
