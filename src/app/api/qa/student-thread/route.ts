import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type StudentThreadAction =
  | "bootstrap"
  | "get_messages"
  | "create_text_thread"
  | "send_text_message"
  | "mark_read"
  | "update_thread_status";

type ThreadContextPayload = {
  contextType?: string;
  dossierId?: string;
  matiereId?: string;
  coursId?: string;
  questionId?: string;
  optionId?: string;
  serieId?: string;
};

const OPEN_THREAD_STATUSES = ["ai_pending", "ai_answered", "escalated", "prof_answered"];

async function getAuthenticatedStudentId() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user.id;
}

async function loadOwnedThread(admin: ReturnType<typeof createAdminClient>, threadId: string, studentId: string) {
  const { data: thread } = await admin
    .from("qa_threads")
    .select("*, matiere:matieres(id, name, color)")
    .eq("id", threadId)
    .eq("student_id", studentId)
    .single();

  return thread;
}

function applyContextFilter(query: any, payload: ThreadContextPayload) {
  if (payload.questionId) return query.eq("question_id", payload.questionId);
  if (payload.coursId) return query.eq("cours_id", payload.coursId);
  if (payload.matiereId) return query.eq("matiere_id", payload.matiereId);
  if (payload.dossierId) return query.eq("dossier_id", payload.dossierId);
  return query;
}

export async function POST(request: NextRequest) {
  try {
    const studentId = await getAuthenticatedStudentId();

    if (!studentId) {
      return NextResponse.json({ error: "Session expirée — reconnecte-toi." }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action as StudentThreadAction | undefined;
    const admin = createAdminClient();

    if (!action) {
      return NextResponse.json({ error: "Action manquante." }, { status: 400 });
    }

    if (action === "bootstrap") {
      const payload = body as ThreadContextPayload;

      if (!payload.contextType) {
        return NextResponse.json({ error: "contextType manquant." }, { status: 400 });
      }

      let query = admin
        .from("qa_threads")
        .select("*, matiere:matieres(id, name, color)")
        .eq("student_id", studentId)
        .eq("context_type", payload.contextType)
        .in("status", OPEN_THREAD_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1);

      query = applyContextFilter(query, payload);

      const { data } = await query;

      return NextResponse.json({
        success: true,
        userId: studentId,
        thread: data?.[0] ?? null,
      });
    }

    if (action === "get_messages") {
      const threadId = String(body.threadId ?? "");

      if (!threadId) {
        return NextResponse.json({ error: "threadId manquant." }, { status: 400 });
      }

      const thread = await loadOwnedThread(admin, threadId, studentId);

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

      await admin
        .from("qa_messages")
        .update({ read_by_student: true })
        .eq("thread_id", threadId)
        .eq("read_by_student", false);

      return NextResponse.json({
        success: true,
        userId: studentId,
        messages: messages ?? [],
        threadStatus: thread.status,
      });
    }

    if (action === "create_text_thread") {
      const text = String(body.text ?? "").trim();

      if (!text) {
        return NextResponse.json({ error: "Le message est vide." }, { status: 400 });
      }

      const {
        contextType,
        dossierId,
        resolvedMatiereId,
        coursId,
        questionId,
        optionId,
        serieId,
        resolvedLabel,
      } = body;

      if (!contextType) {
        return NextResponse.json({ error: "contextType manquant." }, { status: 400 });
      }

      const { data: thread, error: threadError } = await admin
        .from("qa_threads")
        .insert({
          student_id: studentId,
          context_type: contextType,
          dossier_id: dossierId ?? null,
          matiere_id: resolvedMatiereId || null,
          cours_id: coursId ?? null,
          question_id: questionId ?? null,
          option_id: optionId ?? null,
          serie_id: serieId ?? null,
          context_label: resolvedLabel || contextType,
          title: text.slice(0, 120),
          status: "ai_pending",
        })
        .select("*, matiere:matieres(id, name, color)")
        .single();

      if (threadError || !thread) {
        return NextResponse.json(
          { error: threadError?.message ?? "Impossible de créer la conversation." },
          { status: 500 },
        );
      }

      const { data: message, error: messageError } = await admin
        .from("qa_messages")
        .insert({
          thread_id: thread.id,
          sender_id: studentId,
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
        userId: studentId,
        thread,
        message,
      });
    }

    if (action === "send_text_message") {
      const threadId = String(body.threadId ?? "");
      const text = String(body.text ?? "").trim();

      if (!threadId || !text) {
        return NextResponse.json({ error: "threadId et text sont requis." }, { status: 400 });
      }

      const thread = await loadOwnedThread(admin, threadId, studentId);

      if (!thread) {
        return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
      }

      if (thread.status === "resolved") {
        await admin
          .from("qa_threads")
          .update({
            status: "ai_pending",
            resolved_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", threadId);
      }

      const { data: message, error } = await admin
        .from("qa_messages")
        .insert({
          thread_id: threadId,
          sender_id: studentId,
          sender_type: "student",
          content_type: "text",
          content: text,
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

      return NextResponse.json({
        success: true,
        message,
        threadStatus: thread.status === "resolved" ? "ai_pending" : thread.status,
      });
    }

    if (action === "mark_read") {
      const threadId = String(body.threadId ?? "");

      if (!threadId) {
        return NextResponse.json({ error: "threadId manquant." }, { status: 400 });
      }

      const thread = await loadOwnedThread(admin, threadId, studentId);

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

    if (action === "update_thread_status") {
      const threadId = String(body.threadId ?? "");
      const status = String(body.status ?? "");

      if (!threadId || !status) {
        return NextResponse.json({ error: "threadId et status sont requis." }, { status: 400 });
      }

      const thread = await loadOwnedThread(admin, threadId, studentId);

      if (!thread) {
        return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
      }

      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "resolved") {
        patch.resolved_at = new Date().toISOString();
      } else {
        patch.resolved_at = null;
      }

      const { error } = await admin.from("qa_threads").update(patch).eq("id", threadId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (status === "escalated" && thread.matiere_id) {
        const { data: profs } = await admin
          .from("prof_matieres")
          .select("prof_id")
          .eq("matiere_id", thread.matiere_id);

        if (profs?.length) {
          await admin.from("notifications").insert(
            profs.map((prof) => ({
              user_id: prof.prof_id,
              type: "qa_escalated",
              title: "Nouvelle question d'un étudiant",
              body: thread.title?.slice(0, 100) ?? "Question en attente",
              link: `/admin/questions-reponses?thread=${threadId}`,
            })),
          );
        }
      }

      return NextResponse.json({ success: true, threadStatus: status });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("[qa/student-thread]", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
