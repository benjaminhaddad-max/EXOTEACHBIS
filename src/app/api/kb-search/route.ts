import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée" }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role, groupe_id").eq("id", user.id).single();
    if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });

    const { question } = await req.json();
    if (!question?.trim()) return NextResponse.json({ error: "La question est requise" }, { status: 400 });

    const admin = createAdminClient();

    // Text-based search (full-text + keyword matching)
    const searchTerms = question.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    const searchQuery = searchTerms.join(" & ");

    let articlesQuery = admin
      .from("kb_articles")
      .select("id, title, content, summary, tags, category:kb_categories(name), visibility, formation_dossier_ids, groupe_ids, allowed_roles")
      .eq("status", "approved")
      .order("view_count", { ascending: false })
      .limit(15);

    if (searchQuery) {
      articlesQuery = articlesQuery.or(`title.ilike.%${searchTerms[0]}%,content.ilike.%${searchTerms[0]}%,summary.ilike.%${searchTerms[0]}%`);
    }

    const { data: articles } = await articlesQuery;
    if (!articles || articles.length === 0) {
      // Log unanswered question
      await admin.from("kb_chat_logs").insert({
        user_id: user.id,
        user_role: profile.role,
        question: question.trim(),
        had_answer: false,
      });

      return NextResponse.json({
        answer: "Je n'ai pas trouvé d'information pertinente dans la base de connaissances pour votre question. Je vous recommande de contacter l'administration directement.",
        articles: [],
        had_answer: false,
      });
    }

    // Filter articles by user's access rights
    const accessibleArticles = articles.filter(a => {
      if (a.visibility === "all") return true;
      if (a.visibility === "staff_only" && ["prof", "coach", "admin", "superadmin"].includes(profile.role)) return true;
      if (a.visibility === "formation" && a.formation_dossier_ids?.length) return true;
      if (a.visibility === "classe" && a.groupe_ids?.length && profile.groupe_id && a.groupe_ids.includes(profile.groupe_id)) return true;
      if (a.allowed_roles?.length && a.allowed_roles.includes(profile.role)) return true;
      if (["admin", "superadmin"].includes(profile.role)) return true;
      return false;
    });

    if (accessibleArticles.length === 0) {
      await admin.from("kb_chat_logs").insert({
        user_id: user.id,
        user_role: profile.role,
        question: question.trim(),
        had_answer: false,
      });

      return NextResponse.json({
        answer: "Je n'ai pas trouvé d'information accessible pour votre profil. Contactez l'administration pour plus d'informations.",
        articles: [],
        had_answer: false,
      });
    }

    // Build context from matched articles
    const context = accessibleArticles
      .slice(0, 8)
      .map((a, i) => `[Article ${i + 1}: ${a.title}]\nCatégorie: ${(a.category as any)?.name ?? "Non classé"}\n${a.summary || a.content.slice(0, 1000)}`)
      .join("\n\n---\n\n");

    const systemPrompt = `Tu es l'assistant IA de la base de connaissances d'une prépa médecine (PASS, LAS, MMOPK). 
Tu réponds aux questions en te basant UNIQUEMENT sur les articles fournis ci-dessous.
Si l'information n'est pas dans les articles, dis-le clairement et suggère de contacter l'administration.
Sois concis, professionnel et bienveillant. Réponds toujours en français.
Le rôle de l'utilisateur est : ${profile.role}.

ARTICLES DE RÉFÉRENCE :
${context}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: question.trim() }],
    });

    const answer = message.content[0]?.type === "text" ? message.content[0].text : "Réponse non disponible.";
    const articleIds = accessibleArticles.slice(0, 8).map(a => a.id);

    // Log the question
    await admin.from("kb_chat_logs").insert({
      user_id: user.id,
      user_role: profile.role,
      question: question.trim(),
      answer,
      article_ids: articleIds,
      confidence: accessibleArticles.length > 3 ? 0.9 : accessibleArticles.length > 1 ? 0.7 : 0.4,
      had_answer: true,
    });

    // Increment view counts
    for (const id of articleIds) {
      try { await (admin.rpc as any)("increment_kb_view_count", { article_id: id }); } catch {}
    }

    return NextResponse.json({
      answer,
      articles: accessibleArticles.slice(0, 5).map(a => ({ id: a.id, title: a.title, category: (a.category as any)?.name })),
      had_answer: true,
    });
  } catch (err: any) {
    console.error("[kb-search]", err);
    return NextResponse.json({ error: err.message ?? "Erreur interne" }, { status: 500 });
  }
}
