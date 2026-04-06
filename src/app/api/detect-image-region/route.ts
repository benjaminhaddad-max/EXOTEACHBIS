import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Takes a rendered page image (base64 JPEG) and uses Claude Vision
 * to detect the bounding box of graphical elements (molecules, schemas, charts).
 * Returns pixel coordinates for cropping.
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée." }, { status: 500 });
    }

    const { imageBase64, width, height } = (await req.json()) as {
      imageBase64: string; // base64 JPEG without data: prefix
      width: number;
      height: number;
    };

    if (!imageBase64 || !width || !height) {
      return NextResponse.json({ error: "imageBase64, width, height requis" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
          },
          {
            type: "text",
            text: `Cette image est une page rendue d'un PDF de QCM médical. La page fait ${width}x${height} pixels.

Ta tâche : identifier la zone qui contient les ÉLÉMENTS GRAPHIQUES (schémas, molécules, structures chimiques, graphiques, figures dessinées, diagrammes).

IMPORTANT :
- On veut UNIQUEMENT la zone des DESSINS/SCHÉMAS, PAS le texte des questions ni les propositions A-E.
- Si la page contient des molécules numérotées (1, 2, 3, 4...), inclus TOUTES les molécules dans une seule zone.
- Les numéros sous les molécules (1, 2, 3, 4) font partie de la zone à inclure.
- Le texte comme "Soit les 4 molécules suivantes" ou "Classer par..." n'est PAS un élément graphique.
- Les propositions A, B, C, D, E ne sont PAS des éléments graphiques.

Si tu trouves des éléments graphiques, réponds en JSON strict :
{"found": true, "y_start": <pixel Y du haut de la zone graphique>, "y_end": <pixel Y du bas de la zone graphique>}

Si la page ne contient aucun élément graphique (que du texte) :
{"found": false}

Réponds UNIQUEMENT en JSON, rien d'autre.`,
          },
        ],
      }],
    });

    const text = msg.content.find(c => c.type === "text")?.text ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ found: false });
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e: unknown) {
    console.error("[detect-image-region]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur serveur." }, { status: 500 });
  }
}
