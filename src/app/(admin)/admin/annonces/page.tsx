import { createClient } from "@/lib/supabase/server";
import { AnnoncesShell } from "@/components/admin/annonces/annonces-shell";
import type { Groupe } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AnnoncesAdminPage() {
  const supabase = await createClient();

  const [annoncesRes, groupesRes] = await Promise.all([
    supabase
      .from("posts")
      .select("*, author:profiles(first_name, last_name)")
      .eq("type", "annonce")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("groupes").select("*").order("name"),
  ]);

  return (
    <AnnoncesShell
      initialAnnonces={(annoncesRes.data ?? []) as any[]}
      groupes={(groupesRes.data ?? []) as Groupe[]}
    />
  );
}
