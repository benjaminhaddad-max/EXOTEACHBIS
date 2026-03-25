import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY non configurée. Ajoutez-la dans vos variables d'environnement." },
        { status: 500 }
      );
    }

    const { sujet, nb_questions, type, difficulte, matiere_name } = await request.json();

    if (!sujet?.trim()) {
      return NextResponse.json({ error: "Le sujet est requis." }, { status: 400 });
    }

    const nb = Math.min(Math.max(Number(nb_questions) || 10, 3), 30);
    const diff = Math.min(Math.max(Number(difficulte) || 3, 1), 5);
    const diffLabel = diff <= 2 ? "facile" : diff === 3 ? "intermédiaire" : diff === 4 ? "difficile" : "très difficile";
    const typeLabel =
      type === "qcm_multiple"
        ? "QCM à réponses multiples (1 à 3 bonnes réponses parmi 5)"
        : "QCM à réponse unique (exactement 1 bonne réponse parmi 5)";

    const prompt = `Tu es un expert en médecine et pédagogie médicale pour étudiants PASS/LAS.
Génère exactement ${nb} questions QCM en français sur le sujet : "${sujet.trim()}"${matiere_name ? ` (matière : ${matiere_name})` : ""}.

Contraintes strictes :
- Type : ${typeLabel}
- Difficulté : ${diff}/5 (${diffLabel})
- Chaque question a exactement 5 propositions labelisées A, B, C, D, E
- Les propositions incorrectes doivent être plausibles et formatives
- L'explication doit justifier la/les bonne(s) réponse(s) de façon pédagogique
- Pas de répétition entre questions

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après :
[
  {
    "text": "Énoncé complet de la question ?",
    "type": "${type || "qcm_unique"}",
    "difficulty": ${diff},
    "explanation": "Explication pédagogique détaillée",
    "options": [
      {"label": "A", "text": "Proposition A", "is_correct": false},
      {"label": "B", "text": "Proposition B", "is_correct": true},
      {"label": "C", "text": "Proposition C", "is_correct": false},
      {"label": "D", "text": "Proposition D", "is_correct": false},
      {"label": "E", "text": "Proposition E", "is_correct": false}
    ]
  }
]`;

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Réponse inattendue du modèle." }, { status: 500 });
    }

    // Extract JSON from response (handle potential markdown code blocks)
    let jsonText = content.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const questions = JSON.parse(jsonText);

    if (!Array.isArray(questions)) {
      return NextResponse.json({ error: "Format de réponse invalide." }, { status: 500 });
    }

    return NextResponse.json({ questions });
  } catch (err: unknown) {
    console.error("[generate-questions]", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
