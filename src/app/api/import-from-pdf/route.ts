import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type ParsedOption = { label: string; text: string; is_correct: boolean };
type ParsedQuestion = { text: string; options: ParsedOption[]; has_image?: boolean; image_page?: number | null };

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

    // Download both PDFs
    const [sujetRes, correctionRes] = await Promise.all([
      fetch(sujetUrl),
      fetch(correctionUrl),
    ]);

    if (!sujetRes.ok || !correctionRes.ok) {
      return NextResponse.json({ error: "Impossible de télécharger les PDFs" }, { status: 500 });
    }

    const [sujetBuf, correctionBuf] = await Promise.all([
      sujetRes.arrayBuffer(),
      correctionRes.arrayBuffer(),
    ]);

    const sujetB64 = Buffer.from(sujetBuf).toString("base64");
    const correctionB64 = Buffer.from(correctionBuf).toString("base64");

    // Call Claude API with both PDFs
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 32000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: sujetB64 },
            },
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: correctionB64 },
            },
            {
              type: "text",
              text: `Tu reçois deux PDFs d'un QCM médical :
1. Le SUJET (premier PDF) : contient les questions numérotées avec les propositions A, B, C, D, E.
2. La CORRECTION (deuxième PDF) : même contenu mais avec les bonnes réponses surlignées en vert ou marquées d'une manière distinctive.

Ta tâche :
- Extrais TOUTES les questions du sujet avec leurs propositions (A à E).
- Pour chaque proposition, détermine si elle est correcte en regardant la correction (surlignée en vert = correcte).

RÈGLES ABSOLUES — NE PAS RÉSUMER :
- COPIE EXACTEMENT le texte tel qu'il apparaît dans le PDF. Ne résume JAMAIS. Ne reformule JAMAIS.
- Si la question dit "Concernant la molécule X ci-dessous, cochez la(les) proposition(s) exacte(s) :", tu dois écrire EXACTEMENT ce texte.
- NE PAS écrire "Question sur X" ou "À propos de X". Copie le texte VERBATIM.
- Retire seulement le numéro de la question au début (ex: "1." ou "Q1.") et le "A." / "B." au début des options.
- Si une question fait référence à une image/schéma/structure ("ci-dessous", "ci-contre", "représentée"), garde cette référence dans le texte et ajoute "has_image": true.
- Formules chimiques et mathématiques : garde-les telles quelles (ex: CH₃⁺, sp², etc.)

Réponds UNIQUEMENT en JSON strict, un array :
[
  {
    "text": "Texte EXACT copié du PDF",
    "has_image": false,
    "image_page": null,
    "options": [
      {"label": "A", "text": "Texte EXACT de la proposition A", "is_correct": true},
      {"label": "B", "text": "Texte EXACT de la proposition B", "is_correct": false},
      {"label": "C", "text": "Texte EXACT de la proposition C", "is_correct": true},
      {"label": "D", "text": "Texte EXACT de la proposition D", "is_correct": false},
      {"label": "E", "text": "Texte EXACT de la proposition E", "is_correct": false}
    ]
  }
]

- "has_image": true si la question contient ou fait référence à une image/schéma/structure moléculaire.
- "image_page": numéro de la page du SUJET (1-indexed) où se trouve l'image. null si pas d'image.
- Chaque question DOIT avoir exactement 5 options (A à E), sauf si le QCM en a moins.
- Respecte l'ordre des questions tel qu'il apparaît dans le PDF.`,
            },
          ],
        },
      ],
    });

    const responseText = msg.content.find((c) => c.type === "text")?.text ?? "[]";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return NextResponse.json({ error: "Aucune question extraite du PDF." }, { status: 422 });
    }

    let parsed: ParsedQuestion[];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Réponse IA invalide." }, { status: 422 });
    }

    if (!parsed.length) {
      return NextResponse.json({ error: "Aucune question trouvée." }, { status: 422 });
    }

    // Insert questions in DB (same pattern as import-serie Mode 1)
    let created = 0;
    const questionsWithImages: { questionId: string; page: number }[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];

      const { data: newQ, error: qErr } = await supabase
        .from("questions")
        .insert({
          text: q.text,
          type: "qcm_multiple",
          difficulty: 2,
          cours_id: coursId ?? null,
          matiere_id: null,
        })
        .select("id")
        .single();

      if (qErr || !newQ) continue;

      const optionsToInsert = q.options.map((opt, idx) => ({
        question_id: newQ.id,
        label: opt.label,
        text: opt.text,
        is_correct: opt.is_correct,
        order_index: idx,
      }));
      await supabase.from("options").insert(optionsToInsert);

      await supabase.from("series_questions").insert({
        series_id: serieId,
        question_id: newQ.id,
        order_index: i,
      });

      if (q.has_image && q.image_page) {
        questionsWithImages.push({ questionId: newQ.id, page: q.image_page });
      }

      created++;
    }

    return NextResponse.json({
      success: true,
      message: `${created} question${created > 1 ? "s" : ""} importée${created > 1 ? "s" : ""} depuis les PDFs.`,
      count: created,
      questionsWithImages,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    console.error("[import-from-pdf]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
