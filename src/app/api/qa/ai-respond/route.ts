import Anthropic from "@anthropic-ai/sdk";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Service-role client for inserting AI messages (sender_id is null, RLS won't allow via student session)
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY non configurée." },
        { status: 500 }
      );
    }

    // 1. Validate auth — get user from Supabase session
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Non authentifié." },
        { status: 401 }
      );
    }

    // Parse request body
    const { thread_id, question_text, context } = await request.json();

    if (!thread_id || !question_text?.trim()) {
      return NextResponse.json(
        { error: "thread_id et question_text sont requis." },
        { status: 400 }
      );
    }

    // Verify the user owns the thread
    const { data: thread, error: threadError } = await supabase
      .from("qa_threads")
      .select("id, user_id")
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread introuvable." },
        { status: 404 }
      );
    }

    if (thread.user_id !== user.id) {
      return NextResponse.json(
        { error: "Accès refusé à ce thread." },
        { status: 403 }
      );
    }

    // 2. Build system prompt
    const systemPrompt =
      "Tu es un assistant pédagogique expert pour étudiants en PASS/LAS (médecine). " +
      "Tu réponds de manière claire, précise et pédagogique. " +
      "Tu utilises des exemples concrets quand c'est possible.";

    // 3. Build user message with context
    let userMessage = "";

    if (context) {
      const parts: string[] = [];
      if (context.matiere_name) parts.push(`Matière : ${context.matiere_name}`);
      if (context.cours_name) parts.push(`Cours : ${context.cours_name}`);
      if (context.qcm_question_text)
        parts.push(`Question QCM : ${context.qcm_question_text}`);
      if (context.qcm_option_text)
        parts.push(`Proposition concernée : ${context.qcm_option_text}`);
      if (context.context_label)
        parts.push(`Contexte : ${context.context_label}`);

      if (parts.length > 0) {
        userMessage += "Contexte de la question :\n" + parts.join("\n") + "\n\n";
      }
    }

    userMessage += `Question de l'étudiant :\n${question_text.trim()}`;

    // 4. Call Claude
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "Réponse inattendue du modèle." },
        { status: 500 }
      );
    }

    const aiResponseText = content.text;

    // 5. Insert the AI response as a qa_message using service role client
    const serviceClient = getServiceClient();

    const { data: aiMessage, error: insertError } = await serviceClient
      .from("qa_messages")
      .insert({
        thread_id,
        sender_id: null,
        sender_type: "ai",
        content_type: "text",
        content: aiResponseText,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[qa/ai-respond] Insert error:", insertError);
      return NextResponse.json(
        { error: "Erreur lors de l'enregistrement de la réponse." },
        { status: 500 }
      );
    }

    // 6. Update thread status to 'ai_answered'
    const { error: updateError } = await serviceClient
      .from("qa_threads")
      .update({ status: "ai_answered" })
      .eq("id", thread_id);

    if (updateError) {
      console.error("[qa/ai-respond] Update thread error:", updateError);
      // Non-blocking: the message was already saved
    }

    // 7. Return success
    return NextResponse.json({ success: true, message: aiMessage });
  } catch (err: unknown) {
    console.error("[qa/ai-respond]", err);
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
