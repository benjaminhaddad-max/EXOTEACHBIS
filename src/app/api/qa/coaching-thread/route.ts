import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type CoachingThreadAction =
  | "bootstrap"
  | "get_messages"
  | "create_thread"
  | "send_message"
  | "mark_read";

const OPEN_STATUSES = ["ai_pending", "ai_answered", "escalated", "prof_answered"];

async function getAuthenticatedUserId() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Session expirée — reconnecte-toi." }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action as CoachingThreadAction | undefined;
    const admin = createAdminClient();

    if (!action) {
      return NextResponse.json({ error: "Action manquante." }, { status: 400 });
    }

    // ─── Bootstrap: find existing coaching thread for this student ─────
    if (action === "bootstrap") {
      const { data } = await admin
        .from("qa_threads")
        .select("*")
        .eq("student_id", userId)
        .eq("context_type", "coaching")
        .in("status", OPEN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1);

      return NextResponse.json({
        success: true,
        userId,
        thread: data?.[0] ?? null,
      });
    }

    // ─── Get messages for a thread ────────────────────────────────────
    if (action === "get_messages") {
      const threadId = String(body.threadId ?? "");
      if (!threadId) {
        return NextResponse.json({ error: "threadId manquant." }, { status: 400 });
      }

      // Verify ownership
      const { data: thread } = await admin
        .from("qa_threads")
        .select("*")
        .eq("id", threadId)
        .eq("student_id", userId)
        .eq("context_type", "coaching")
        .single();

      if (!thread) {
        return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
      }

      const { data: messages, error } = await admin
        .from("qa_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Mark as read by student
      await admin
        .from("qa_messages")
        .update({ read_by_student: true })
        .eq("thread_id", threadId)
        .eq("read_by_student", false);

      return NextResponse.json({
        success: true,
        userId,
        messages: messages ?? [],
        threadStatus: thread.status,
      });
    }

    // ─── Create a new coaching thread ─────────────────────────────────
    if (action === "create_thread") {
      const text = String(body.text ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "Le message est vide." }, { status: 400 });
      }

      // Check no open coaching thread exists
      const { data: existing } = await admin
        .from("qa_threads")
        .select("id")
        .eq("student_id", userId)
        .eq("context_type", "coaching")
        .in("status", OPEN_STATUSES)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: "Tu as déjà une conversation coaching en cours." },
          { status: 409 },
        );
      }

      // Create thread — status "escalated" (goes directly to human, no AI)
      const { data: thread, error: threadError } = await admin
        .from("qa_threads")
        .insert({
          student_id: userId,
          context_type: "coaching",
          context_label: "Coaching",
          title: text.slice(0, 120),
          status: "escalated",
        })
        .select("*")
        .single();

      if (threadError || !thread) {
        return NextResponse.json(
          { error: threadError?.message ?? "Impossible de créer la conversation." },
          { status: 500 },
        );
      }

      // Insert first message
      const { data: message, error: messageError } = await admin
        .from("qa_messages")
        .insert({
          thread_id: thread.id,
          sender_id: userId,
          sender_type: "student",
          content_type: "text",
          content: text,
          read_by_student: true,
        })
        .select()
        .single();

      if (messageError || !message) {
        await admin.from("qa_threads").delete().eq("id", thread.id);
        return NextResponse.json(
          { error: messageError?.message ?? "Impossible d'envoyer le message." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        userId,
        thread,
        message,
      });
    }

    // ─── Send a message in an existing thread ─────────────────────────
    if (action === "send_message") {
      const threadId = String(body.threadId ?? "");
      const text = String(body.text ?? "").trim();
      const contentType = body.contentType ?? "text";
      const mediaUrl = body.mediaUrl ?? null;
      const mediaDuration = body.mediaDuration ?? null;

      if (!threadId || (!text && !mediaUrl)) {
        return NextResponse.json({ error: "threadId et contenu sont requis." }, { status: 400 });
      }

      // Verify ownership
      const { data: thread } = await admin
        .from("qa_threads")
        .select("*")
        .eq("id", threadId)
        .eq("student_id", userId)
        .eq("context_type", "coaching")
        .single();

      if (!thread) {
        return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
      }

      // If resolved, reopen as escalated
      if (thread.status === "resolved") {
        await admin
          .from("qa_threads")
          .update({ status: "escalated", resolved_at: null, updated_at: new Date().toISOString() })
          .eq("id", threadId);
      }

      const { data: message, error } = await admin
        .from("qa_messages")
        .insert({
          thread_id: threadId,
          sender_id: userId,
          sender_type: "student",
          content_type: contentType,
          content: text || null,
          media_url: mediaUrl,
          media_duration_s: mediaDuration,
          read_by_student: true,
        })
        .select()
        .single();

      if (error || !message) {
        return NextResponse.json(
          { error: error?.message ?? "Impossible d'envoyer le message." },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, message });
    }

    // ─── Mark messages as read ────────────────────────────────────────
    if (action === "mark_read") {
      const threadId = String(body.threadId ?? "");
      if (!threadId) {
        return NextResponse.json({ error: "threadId manquant." }, { status: 400 });
      }

      const { data: thread } = await admin
        .from("qa_threads")
        .select("id")
        .eq("id", threadId)
        .eq("student_id", userId)
        .eq("context_type", "coaching")
        .single();

      if (!thread) {
        return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
      }

      await admin
        .from("qa_messages")
        .update({ read_by_student: true })
        .eq("thread_id", threadId)
        .eq("read_by_student", false);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("[qa/coaching-thread]", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
