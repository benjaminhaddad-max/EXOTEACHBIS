import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée." }, { status: 500 });
    }

    const body = await request.json();
    const { pages } = body as {
      pages: { pageIndex: number; chapterName: string; imageBase64: string }[];
    };

    if (!pages || pages.length === 0) {
      return NextResponse.json({ error: "Aucune page fournie." }, { status: 400 });
    }

    const BATCH = 15;
    const allResults: { pageIndex: number; year: string | null; session: string | null; category: string | null; isTitle: boolean; isToc: boolean }[] = [];

    for (let i = 0; i < pages.length; i += BATCH) {
      const batch = pages.slice(i, i + BATCH);

      const userContent: Anthropic.Messages.ContentBlockParam[] = [];
      userContent.push({
        type: "text",
        text: `Analyse ces ${batch.length} pages d'annales de concours (PASS/LAS médecine). Pour CHAQUE page, identifie:
- L'année de l'épreuve (ex: "2024", "2023", "2021", "2016")
- La session si mentionnée (ex: "Session 1", "Session 2")
- La catégorie/université si mentionnée (ex: "ANNALES UNIVERSITE DE PARIS", "ANNALES CLASSEES SUPPLEMENTAIRES", "ANNALES UNIVERSITE PARIS V")
- Si c'est une page de titre (page de couverture avec juste le nom de la matière)
- Si c'est une page de table des matières ou de tableau périodique (pas de questions)

Les marqueurs d'année sont des bandeaux horizontaux avec du texte centré, comme: "2024 – Session 1", "2022 – Session 2", "2016", etc. Une page peut contenir un changement d'année en milieu de page.

Si une page ne contient PAS de marqueur d'année mais contient des questions, elle appartient à la MEME année que la page précédente.

Réponds UNIQUEMENT en JSON strict, un tableau d'objets:
[{"pageIndex": N, "year": "YYYY" ou null, "session": "Session X" ou null, "category": "..." ou null, "isTitle": true/false, "isToc": true/false, "yearChangeAt": "middle" si changement d'année en milieu de page sinon null, "secondYear": "YYYY" si changement, "secondSession": "..." si changement}]`,
      });

      for (const p of batch) {
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: p.imageBase64 },
        });
        userContent.push({
          type: "text",
          text: `Page ${p.pageIndex + 1} (chapitre: ${p.chapterName})`,
        });
      }

      const msg = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: userContent }],
      });

      const text = msg.content.find((c) => c.type === "text")?.text ?? "[]";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          allResults.push(...parsed);
        } catch {
          /* skip malformed batch */
        }
      }
    }

    return NextResponse.json({ pages: allResults });
  } catch (e: any) {
    console.error("ACC Fabricator error:", e);
    return NextResponse.json({ error: e.message || "Erreur serveur." }, { status: 500 });
  }
}
