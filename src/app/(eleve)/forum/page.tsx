import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { ForumShell } from "@/components/forum/forum-shell";

export const dynamic = "force-dynamic";

export default async function ForumPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [postsRes, profileRes] = await Promise.all([
    supabase
      .from("posts")
      .select(`
        *,
        author:profiles(id, first_name, last_name, email, role),
        replies:posts!parent_id(*, author:profiles(id, first_name, last_name, email, role))
      `)
      .is("parent_id", null)
      .in("type", ["forum_question", "annonce"])
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("role").eq("id", user!.id).single(),
  ]);

  const posts = (postsRes.data ?? []) as any[];
  const role = profileRes.data?.role ?? "eleve";

  return (
    <div>
      <Header title="Forum" />
      <ForumShell
        initialPosts={posts}
        currentUser={user!.id}
        currentUserRole={role}
      />
    </div>
  );
}
