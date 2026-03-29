import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY non configurée." },
        { status: 500 }
      );
    }

    const { sujet, nb_cards, matiere_name } = await request.json();

    if (!sujet?.trim()) {
      return NextResponse.json({ error: "Le sujet est requis." }, { status: 400 });
    }

    const nb = Math.min(Math.max(Number(nb_cards) || 10, 3), 50);

    const prompt = `Tu es un expert en médecine et pédagogie médicale pour étudiants PASS/LAS.
Génère exactement ${nb} flashcards (recto/verso) en français sur le sujet : "${sujet.trim()}"${matiere_name ? ` (matière : ${matiere_name})` : ""}.

Contraintes :
- Le recto (front) est une question courte, un terme à définir, ou un concept clé
- Le verso (back) est la réponse concise mais complète (2-3 phrases max)
- Couvre les points essentiels du sujet de manière progressive
- Adapté au niveau PASS/LAS (première année de médecine)
- Pas de répétition entre cartes

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après :
[
  { "front": "Question ou terme", "back": "Réponse ou définition" }
]`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Réponse inattendue du modèle." }, { status: 500 });
    }

    let jsonText = content.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const cards = JSON.parse(jsonText);

    if (!Array.isArray(cards)) {
      return NextResponse.json({ error: "Format de réponse invalide." }, { status: 500 });
    }

    return NextResponse.json({ cards });
  } catch (err: unknown) {
    console.error("[generate-flashcards]", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
