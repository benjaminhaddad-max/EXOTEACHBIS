import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY non configurée." },
        { status: 500 }
      );
    }

    const {
      chapters,       // [{id: string, name: string, path: string}]
      topic,          // sujet libre (peut être vide → génère sur la matière entière)
      nbQuestions,
      difficulty,
      matiereName,
    } = await request.json();

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ error: "Aucun chapitre fourni." }, { status: 400 });
    }

    const nb = Math.min(Math.max(Number(nbQuestions) || 10, 3), 50);
    const diff = Math.min(Math.max(Number(difficulty) || 3, 1), 5);
    const diffLabel = diff <= 2 ? "facile" : diff === 3 ? "intermédiaire" : diff === 4 ? "difficile" : "très difficile";

    const chaptersList = chapters
      .map((c: { id: string; name: string; path?: string }, i: number) =>
        `${i + 1}. "${c.name}"${c.path ? ` (${c.path})` : ""} → id: "${c.id}"`
      )
      .join("\n");

    const topicLine = topic?.trim()
      ? `Thème ciblé : "${topic.trim()}"`
      : `Couvre intelligemment l'ensemble de la matière "${matiereName}".`;

    const prompt = `Tu es un expert en médecine et pédagogie médicale pour étudiants PASS/LAS.

Génère exactement ${nb} questions QCM en français pour la matière "${matiereName}".
${topicLine}

Chapitres disponibles — tu DOIS assigner chaque question au chapitre le plus pertinent via "cours_id" :
${chaptersList}

Contraintes STRICTES :
- Format PASS/LAS : 5 propositions A, B, C, D, E — chacune indépendamment VRAIE ou FAUSSE
- Difficulté globale : ${diff}/5 (${diffLabel})
- Répartis les questions de façon équilibrée entre les chapitres selon la pertinence
- "cours_id" DOIT être l'un des ids listés ci-dessus (copie exacte entre guillemets)
- Chaque proposition doit avoir une justification courte (1–2 phrases) expliquant pourquoi elle est vraie ou fausse
- L'explication globale récapitule les points clés de la question
- Pas de répétition entre questions
- Questions précises, scientifiquement rigoureuses, calibrées PASS/LAS

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après :
[
  {
    "text": "Énoncé complet de la question ?",
    "type": "qcm_multiple",
    "difficulty": ${diff},
    "explanation": "Explication pédagogique globale de la question",
    "cours_id": "uuid-exact-du-chapitre",
    "options": [
      {"label": "A", "text": "Proposition A", "is_correct": true,  "justification": "Justification A"},
      {"label": "B", "text": "Proposition B", "is_correct": false, "justification": "Justification B"},
      {"label": "C", "text": "Proposition C", "is_correct": true,  "justification": "Justification C"},
      {"label": "D", "text": "Proposition D", "is_correct": false, "justification": "Justification D"},
      {"label": "E", "text": "Proposition E", "is_correct": false, "justification": "Justification E"}
    ]
  }
]`;

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 12000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Réponse inattendue du modèle." }, { status: 500 });
    }

    let jsonText = content.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const questions = JSON.parse(jsonText);
    if (!Array.isArray(questions)) {
      return NextResponse.json({ error: "Format de réponse invalide." }, { status: 500 });
    }

    // Validate cours_id values
    const validIds = new Set(chapters.map((c: { id: string }) => c.id));
    const validated = questions.map((q: any) => ({
      ...q,
      cours_id: validIds.has(q.cours_id) ? q.cours_id : chapters[0].id,
    }));

    return NextResponse.json({ questions: validated });
  } catch (err: unknown) {
    console.error("[generate-questions-smart]", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
