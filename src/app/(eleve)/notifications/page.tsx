import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { NotificationsShell } from "@/components/notifications-shell";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <Header title="Notifications" />
      <NotificationsShell initialNotifications={(notifications ?? []) as any[]} userId={user!.id} />
    </div>
  );
}
