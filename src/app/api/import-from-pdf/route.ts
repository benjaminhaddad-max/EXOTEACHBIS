import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

type ParsedOption = { label: string; text: string; is_correct: boolean };

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée." }, { status: 500 });
    }

    const { serieId, sujetUrl, correctionUrl, coursId } = (await req.json()) as {
      serieId: string;
      sujetUrl: string;
      correctionUrl: string;
      coursId: string | null;
    };

    if (!serieId || !sujetUrl || !correctionUrl) {
      return NextResponse.json({ error: "serieId, sujetUrl et correctionUrl requis" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // Anti-duplicate
    const { data: existingQ } = await supabase
      .from("series_questions")
      .select("question_id")
      .eq("series_id", serieId)
      .limit(1);

    if (existingQ && existingQ.length > 0) {
      return NextResponse.json({
        error: "Cette série contient déjà des questions. Supprimez-les d'abord pour réimporter.",
      }, { status: 409 });
    }

    // Download PDFs
    const [sujetRes, correctionRes] = await Promise.all([fetch(sujetUrl), fetch(correctionUrl)]);
    if (!sujetRes.ok || !correctionRes.ok) {
      return NextResponse.json({ error: `Téléchargement PDFs échoué` }, { status: 500 });
    }

    const sujetB64 = Buffer.from(await sujetRes.arrayBuffer()).toString("base64");
    const correctionB64 = Buffer.from(await correctionRes.arrayBuffer()).toString("base64");

    // Claude API
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 32000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: sujetB64 } },
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: correctionB64 } },
          {
            type: "text",
            text: `Tu reçois deux PDFs d'un QCM médical. SUJET = questions. CORRECTION = bonnes réponses en vert.

COPIE le texte EXACTEMENT. Ne résume JAMAIS.

Pour chaque question retourne :
- "page": page du SUJET (1-indexed)
- "has_image": true si schéma/structure/molécule/graphique accompagne la question
- "image_y_start": position Y en points PDF (~0-842) du DÉBUT de l'image sur la page
- "image_y_end": position Y de la FIN de l'image

JSON strict :
[{"text":"...","page":1,"has_image":false,"options":[{"label":"A","text":"...","is_correct":true},...]}]

5 options (A-E). NE DUPLIQUE PAS. 1 question = 1 entrée.`,
          },
        ],
      }],
    });

    const msg = await stream.finalMessage();
    const responseText = msg.content.find((c) => c.type === "text")?.text ?? "[]";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ error: "Aucune question extraite." }, { status: 422 });

    let parsed: any[];
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch { return NextResponse.json({ error: "Réponse IA invalide." }, { status: 422 }); }
    if (!parsed.length) return NextResponse.json({ error: "Aucune question trouvée." }, { status: 422 });

    // Insert questions (NO images yet — client will handle images)
    let created = 0;
    const createdQuestions: { id: string; page: number; hasImage: boolean; yStart: number; yEnd: number }[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      const { data: newQ, error: qErr } = await supabase
        .from("questions")
        .insert({ text: q.text, type: "qcm_multiple", difficulty: 2, cours_id: coursId ?? null, matiere_id: null })
        .select("id")
        .single();

      if (qErr || !newQ) continue;

      await supabase.from("options").insert(
        q.options.map((opt: ParsedOption, idx: number) => ({
          question_id: newQ.id, label: opt.label, text: opt.text, is_correct: opt.is_correct, order_index: idx,
        }))
      );

      await supabase.from("series_questions").insert({ series_id: serieId, question_id: newQ.id, order_index: i });

      createdQuestions.push({
        id: newQ.id,
        page: q.page ?? 1,
        hasImage: q.has_image === true,
        yStart: q.image_y_start ?? 0,
        yEnd: q.image_y_end ?? 0,
      });
      created++;
    }

    return NextResponse.json({
      success: true,
      message: `${created} questions importées.`,
      count: created,
      createdQuestions,
    });
  } catch (e: unknown) {
    console.error("[import-from-pdf]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur serveur." }, { status: 500 });
  }
}
