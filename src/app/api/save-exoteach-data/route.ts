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
const SUB: Record<string, string> = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"+","-":"-","=":"₌","(":"₍",")":"₎","a":"ₐ","e":"ₑ","h":"ₕ","k":"ₖ","l":"ₗ","m":"ₘ","n":"ₙ","o":"ₒ","p":"ₚ","s":"ₛ","t":"ₜ","x":"ₓ" };
const SUP: Record<string, string> = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ" };

const EXOTEACH_IMG_BASE = "https://diploma.exoteach.com";

function toUnicode(text: string, map: Record<string, string>): string {
  return text.split("").map(c => map[c] || c).join("");
}

/** Extrait les URLs d'images depuis le HTML (balises <img>) */
function extractImagesFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const imgs: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    imgs.push(m[1]);
  }
  return imgs;
}

/** Convertit HTML ExoTeach en texte propre avec indices/exposants Unicode */
function convertHtml(html: string | null | undefined): string {
  if (!html) return "";
  let s = html;

  // Convertir <sub> → indices Unicode (NH₂, CO₂, etc.)
  // Mais garder +/- en texte normal (charges chimiques mal placées dans <sub>)
  s = s.replace(/<sub[^>]*>(.*?)<\/sub>/gi, (_, c) => {
    const trimmed = c.replace(/<[^>]+>/g, "").trim();
    if (/^[+\-−_]+$/.test(trimmed)) return trimmed.replace(/[−_]/g, "-");
    return toUnicode(c.replace(/<[^>]+>/g, ""), SUB);
  });
  // Convertir <sup> → exposants Unicode (M⁺, x², etc.)
  s = s.replace(/<sup[^>]*>(.*?)<\/sup>/gi, (_, c) => toUnicode(c.replace(/<[^>]+>/g, ""), SUP));

  // Convertir <br> en retour à la ligne
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // &nbsp; → espace
  s = s.replace(/&nbsp;/g, " ");

  // Strip les tags HTML (y compris <img> — les images sont extraites séparément)
  s = s.replace(/<[^>]+>/g, " ");

  // Décoder les entités HTML restantes
  s = s.replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));

  // Charges chimiques: M_ → M-, I_ → I-, remplacer _ utilisé comme moins
  // Pattern: une lettre majuscule suivie de _ en fin de mot = charge négative
  s = s.replace(/([A-Z])_(?=\s|$|[.,;:!?)])/g, "$1-");

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
    const { series, coursId, serieType, matiereId } = await req.json();
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
            matiere_id: matiereId || null,
            type: serieType || "entrainement",
            timed: false, visible: true, score_definitif: false,
          })
          .select("id").single();

        if (serieErr || !newSerie) throw new Error(serieErr?.message || "Erreur création série");

        let questionsImported = 0;

        for (let qi = 0; qi < (qcm.questions || []).length; qi++) {
          const q = qcm.questions[qi];

          const questionText = convertHtml(q.question) || `Question ${qi + 1}`;
          // Image: base64 (prioritaire), sinon url_image_q, sinon chercher dans le HTML
          const questionImg = q.image_url_scraped
            || resolveImageUrl(q.url_image_q)
            || resolveImageUrl(extractImagesFromHtml(q.question)[0])
            || null;
          const explanationText = convertHtml(q.explications) || null;

          const { data: newQ, error: qErr } = await supabase.from("questions").insert({
            text: questionText,
            type: "qcm_multiple",
            difficulty: 2,
            cours_id: coursId || null,
            explanation: explanationText,
            image_url: questionImg,
            tags: [],
            matiere_id: matiereId || null,
          }).select("id").single();

          if (qErr || !newQ) {
            console.error("Q insert err:", qErr?.message);
            continue;
          }

          const options = (q.answers || []).map((ans: any, idx: number) => ({
            question_id: newQ.id,
            label: indexToLabel(idx),
            text: convertHtml(ans.text) || `Option ${indexToLabel(idx)}`,
            is_correct: ans.isTrue === true,
            order_index: idx,
            justification: convertHtml(ans.explanation) || null,
            image_url: ans.image_url_scraped
              || resolveImageUrl(ans.url_image)
              || resolveImageUrl(extractImagesFromHtml(ans.text)[0])
              || null,
          }));

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
