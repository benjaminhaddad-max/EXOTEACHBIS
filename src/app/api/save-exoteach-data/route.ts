import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

// Subscript / superscript Unicode maps
const SUB: Record<string, string> = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","=":"₌","(":"₍",")":"₎","a":"ₐ","e":"ₑ","h":"ₕ","k":"ₖ","l":"ₗ","m":"ₘ","n":"ₙ","o":"ₒ","p":"ₚ","s":"ₛ","t":"ₜ","x":"ₓ" };
const SUP: Record<string, string> = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ" };

const EXOTEACH_IMG_BASE = "https://diploma.exoteach.com";

function toUnicode(text: string, map: Record<string, string>): string {
  return text.split("").map(c => map[c] || c).join("");
}

/** Convertit HTML ExoTeach en texte propre avec indices/exposants Unicode */
function convertHtml(html: string | null | undefined): string {
  if (!html) return "";
  let s = html;

  // Convertir <sub> → indices Unicode (NH₂, CO₂, etc.)
  s = s.replace(/<sub[^>]*>(.*?)<\/sub>/gi, (_, c) => toUnicode(c, SUB));
  // Convertir <sup> → exposants Unicode (M⁺, x², etc.)
  s = s.replace(/<sup[^>]*>(.*?)<\/sup>/gi, (_, c) => toUnicode(c, SUP));

  // Convertir <br> en retour à la ligne
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // &nbsp; → espace
  s = s.replace(/&nbsp;/g, " ");

  // Strip les autres tags HTML
  s = s.replace(/<[^>]+>/g, " ");

  // Décoder les entités HTML restantes
  s = s.replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));

  // Nettoyer espaces multiples (garder \n)
  s = s.replace(/[^\S\n]+/g, " ").replace(/\n\s+/g, "\n").trim();
  return s;
}

/** Résout une URL image ExoTeach (relative → absolue) */
function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return EXOTEACH_IMG_BASE + (url.startsWith("/") ? "" : "/") + url;
}

function indexToLabel(i: number) { return String.fromCharCode(65 + i); }

export async function POST(req: NextRequest) {
  try {
    const { series, coursId, serieType } = await req.json();
    if (!series?.length) return NextResponse.json({ error: "series vide" }, { status: 400, headers: CORS });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const results: { id: string; status: string; titre?: string; newId?: string; error?: string; questions?: number }[] = [];

    for (const qcm of series) {
      try {
        const { data: newSerie, error: serieErr } = await supabase
          .from("series")
          .insert({
            name: qcm.titre || `ExoTeach #${qcm.id_qcm}`,
            cours_id: coursId || null,
            type: serieType || "entrainement",
            timed: false, visible: true, score_definitif: false,
          })
          .select("id").single();

        if (serieErr || !newSerie) throw new Error(serieErr?.message || "Erreur création série");

        let questionsImported = 0;

        for (let qi = 0; qi < (qcm.questions || []).length; qi++) {
          const q = qcm.questions[qi];

          // Construire le texte de la question + image si présente
          let questionText = convertHtml(q.question) || `Question ${qi + 1}`;
          const imgUrl = resolveImageUrl(q.url_image_q);
          if (imgUrl) {
            questionText += `\n\n![image](${imgUrl})`;
          }

          // Construire l'explication + image si présente
          let explanationText = convertHtml(q.explications) || null;

          const { data: newQ, error: qErr } = await supabase.from("questions").insert({
            text: questionText,
            type: "qcm_multiple",
            difficulty: 2,
            cours_id: coursId || null,
            explanation: explanationText,
            tags: [],
            matiere_id: null,
          }).select("id").single();

          if (qErr || !newQ) {
            console.error("Q insert err:", qErr?.message);
            continue;
          }

          // Options — pas de justification ni image_url (colonnes absentes)
          const options = (q.answers || []).map((ans: any, idx: number) => {
            let optText = convertHtml(ans.text) || `Option ${indexToLabel(idx)}`;
            const ansImg = resolveImageUrl(ans.url_image);
            if (ansImg) {
              optText += ` ![](${ansImg})`;
            }
            return {
              question_id: newQ.id,
              label: indexToLabel(idx),
              text: optText,
              is_correct: ans.isTrue === true,
              order_index: idx,
            };
          });

          const { error: optErr } = await supabase.from("options").insert(options);
          if (optErr) console.error("Opt insert err:", optErr.message);

          await supabase.from("series_questions").insert({
            series_id: newSerie.id, question_id: newQ.id, order_index: qi,
          });

          questionsImported++;
        }

        results.push({
          id: String(qcm.id_qcm), status: "ok",
          titre: qcm.titre, newId: newSerie.id,
          questions: questionsImported,
        });
      } catch (err: any) {
        results.push({ id: String(qcm.id_qcm), status: "error", error: err.message });
      }
    }

    return NextResponse.json(
      { success: true, imported: results.filter(r => r.status === "ok").length, results },
      { headers: CORS }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS });
  }
}
