import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await request.json();
  const { prof_id, thread_ids } = body as { prof_id: string; thread_ids: string[] };

  if (!prof_id || !thread_ids?.length) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // Fetch thread details for notification messages
  const { data: threads } = await supabase
    .from("qa_threads")
    .select("id, title, context_label")
    .in("id", thread_ids);

  if (!threads?.length) {
    return NextResponse.json({ error: "Aucun thread trouvé" }, { status: 404 });
  }

  // Create in-app notifications
  const notifications = threads.map((thread) => ({
    user_id: prof_id,
    type: "qa_escalated",
    title: "Relance : question en attente",
    body: thread.title || thread.context_label || "Une question attend votre réponse",
    link: `/admin/questions-reponses?thread=${thread.id}`,
  }));

  const { error } = await supabase.from("notifications").insert(notifications);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // TODO: Brevo email integration later

  return NextResponse.json({ success: true, count: notifications.length });
}
