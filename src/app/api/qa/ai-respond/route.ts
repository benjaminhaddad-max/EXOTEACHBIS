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

    // 1. Validate auth — try server session first, fall back to service role
    let userId: string | null = null;
    try {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Server session may not be available (e.g. impersonation)
    }

    // Parse request body
    const { thread_id, question_text, context } = await request.json();

    if (!thread_id || !question_text?.trim()) {
      return NextResponse.json(
        { error: "thread_id et question_text sont requis." },
        { status: 400 }
      );
    }

    // Verify the thread exists using service role (works regardless of auth)
    const serviceClient = getServiceClient();
    const { data: thread, error: threadError } = await serviceClient
      .from("qa_threads")
      .select("id, student_id")
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread introuvable." },
        { status: 404 }
      );
    }

    // If we have a valid user session, verify ownership
    if (userId && thread.student_id !== userId) {
      return NextResponse.json(
        { error: "Accès refusé à ce thread." },
        { status: 403 }
      );
    }

    // 2. Build system prompt
    const systemPrompt =
      "Tu es un assistant pédagogique de la plateforme Diploma Santé, " +
      "spécialisé pour les étudiants PASS/LAS (première année de médecine).\n\n" +
      "RÈGLES STRICTES :\n" +
      "- Tu ne réponds QU'AUX questions en rapport avec les études de santé, les matières PASS/LAS, " +
      "ou le contenu pédagogique de la plateforme.\n" +
      "- Si le message de l'étudiant n'est PAS une question académique (salutations, messages personnels, " +
      "hors-sujet), réponds brièvement et poliment en le recentrant : " +
      "\"Bonjour ! Je suis là pour t'aider avec tes cours. Pose-moi une question sur ta matière et je t'expliquerai.\"\n" +
      "- Sois concis (3-5 phrases max pour les réponses simples). Va droit au but.\n" +
      "- Utilise des exemples concrets, des moyens mnémotechniques quand c'est pertinent.\n" +
      "- Formate ta réponse avec des tirets ou numéros si c'est une liste.\n" +
      "- Ne dis JAMAIS \"je ne suis qu'une IA\" ou des disclaimers — réponds directement.\n" +
      "- Réponds toujours en français.";

    // 3. Load conversation history for multi-turn context
    const { data: prevMessages } = await serviceClient
      .from("qa_messages")
      .select("sender_type, content")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build context preamble
    let contextPreamble = "";
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
        contextPreamble = "Contexte de la question :\n" + parts.join("\n") + "\n\n";
      }
    }

    // Build multi-turn messages array
    const apiMessages: { role: "user" | "assistant"; content: string }[] = [];

    // Add context as first user message if this is the start
    if (prevMessages && prevMessages.length > 0) {
      for (const pm of prevMessages) {
        if (pm.sender_type === "student" && pm.content) {
          const content = apiMessages.length === 0 && contextPreamble
            ? contextPreamble + pm.content
            : pm.content;
          apiMessages.push({ role: "user", content });
        } else if (pm.sender_type === "ai" && pm.content) {
          apiMessages.push({ role: "assistant", content: pm.content });
        }
        // Skip prof messages for AI context
      }
    }

    // Add the new question
    const newContent = apiMessages.length === 0 && contextPreamble
      ? contextPreamble + question_text.trim()
      : question_text.trim();
    apiMessages.push({ role: "user", content: newContent });

    // Ensure messages alternate correctly (required by Claude API)
    const cleanedMessages: typeof apiMessages = [];
    for (const msg of apiMessages) {
      if (cleanedMessages.length === 0 || cleanedMessages[cleanedMessages.length - 1].role !== msg.role) {
        cleanedMessages.push(msg);
      } else {
        // Merge consecutive same-role messages
        cleanedMessages[cleanedMessages.length - 1].content += "\n" + msg.content;
      }
    }

    // Ensure first message is from user
    if (cleanedMessages.length > 0 && cleanedMessages[0].role !== "user") {
      cleanedMessages.unshift({ role: "user", content: contextPreamble || "Bonjour" });
    }

    // 4. Call Claude with full conversation
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: cleanedMessages,
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
