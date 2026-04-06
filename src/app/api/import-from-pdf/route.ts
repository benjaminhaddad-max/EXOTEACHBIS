import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type ParsedOption = { label: string; text: string; is_correct: boolean };
type ParsedQuestion = { text: string; options: ParsedOption[] };

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
      max_tokens: 16000,
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
- Le texte de chaque question doit être le texte complet de l'énoncé.
- Le texte de chaque option doit être le texte complet de la proposition.
- Nettoie le texte : pas de numéro de question au début, pas de "A." au début des options.

Réponds UNIQUEMENT en JSON strict, un array :
[
  {
    "text": "Texte complet de la question",
    "options": [
      {"label": "A", "text": "Texte de la proposition A", "is_correct": true},
      {"label": "B", "text": "Texte de la proposition B", "is_correct": false},
      {"label": "C", "text": "Texte de la proposition C", "is_correct": true},
      {"label": "D", "text": "Texte de la proposition D", "is_correct": false},
      {"label": "E", "text": "Texte de la proposition E", "is_correct": false}
    ]
  }
]

IMPORTANT :
- Chaque question DOIT avoir exactement 5 options (A à E), sauf si le QCM en a moins.
- Respecte l'ordre des questions.
- Ne modifie PAS le texte des questions ou propositions, recopie-les fidèlement.
- Si une formule mathématique est présente, garde-la telle quelle.`,
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

      created++;
    }

    return NextResponse.json({
      success: true,
      message: `${created} question${created > 1 ? "s" : ""} importée${created > 1 ? "s" : ""} depuis les PDFs.`,
      count: created,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    console.error("[import-from-pdf]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
