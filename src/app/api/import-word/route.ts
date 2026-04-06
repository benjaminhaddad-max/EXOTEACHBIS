import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import JSZip from "jszip";
import { extractAllParagraphTexts } from "@/lib/omml-to-latex";

// ─── HTML → Clean text (with Unicode sub/sup) ────────────────────────────

const SUB: Record<string, string> = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"+","-":"-","a":"ₐ","e":"ₑ","n":"ₙ","o":"ₒ","x":"ₓ" };
const SUP: Record<string, string> = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","n":"ⁿ" };

function toUnicode(text: string, map: Record<string, string>): string {
  return text.split("").map(c => map[c] || c).join("");
}

function cleanText(html: string): string {
  let s = html;
  s = s.replace(/<sub[^>]*>(.*?)<\/sub>/gi, (_, c) => toUnicode(c.replace(/<[^>]+>/g, ""), SUB));
  s = s.replace(/<sup[^>]*>(.*?)<\/sup>/gi, (_, c) => toUnicode(c.replace(/<[^>]+>/g, ""), SUP));
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
  // LaTeX-like: $X_Y$ → X_Y, $X^{2+}$ → X²⁺
  s = s.replace(/\$([^$]+)\$/g, (_, tex) => {
    let t = tex;
    t = t.replace(/_\{([^}]+)\}/g, (_: string, sub: string) => toUnicode(sub, SUB));
    t = t.replace(/_([A-Za-z0-9])/g, (_: string, sub: string) => toUnicode(sub, SUB));
    t = t.replace(/\^\{([^}]+)\}/g, (_: string, sup: string) => toUnicode(sup, SUP));
    t = t.replace(/\^([A-Za-z0-9+\-])/g, (_: string, sup: string) => toUnicode(sup, SUP));
    return t;
  });
  s = s.replace(/[^\S\n]+/g, " ").replace(/\n\s+/g, "\n").trim();
  return s;
}

function indexToLabel(i: number) { return String.fromCharCode(65 + i); }

// ─── Parse Word document ─────────────────────────────────────────────────

interface ParsedQuestion {
  text: string;
  image: string | null; // base64 data URI
  options: { label: string; text: string; isCorrect: boolean; explanation: string | null; image: string | null }[];
}

function parseQuestionsFromHtml(html: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  // Split by question headers: "N) QCM N°X ..." or "N) question text..."
  const qcmPattern = /(?:^|<p>)\s*<strong>\s*\d+\)\s*/gi;
  const splits: number[] = [];
  let m;
  while ((m = qcmPattern.exec(html)) !== null) {
    splits.push(m.index);
  }

  for (let i = 0; i < splits.length; i++) {
    const start = splits[i];
    const end = i + 1 < splits.length ? splits[i + 1] : html.length;
    const section = html.slice(start, end);

    // Extract images (base64)
    const images: string[] = [];
    const imgRe = /<img\s+src="(data:image\/[^"]+)"[^>]*>/g;
    let imgMatch;
    while ((imgMatch = imgRe.exec(section)) !== null) {
      images.push(imgMatch[1]);
    }

    // Find the énoncé: everything before the first ☐
    const firstCheckbox = section.indexOf("☐");
    const enonceHtml = firstCheckbox >= 0 ? section.slice(0, firstCheckbox) : section;

    // Remove images from énoncé text (they're captured separately)
    const enonceClean = enonceHtml.replace(/<img[^>]+>/g, "");
    // Remove the "N) QCM N°X" or "N)" prefix
    let enonceText = cleanText(enonceClean).replace(/^\d+\)\s*(?:QCM\s*N°?\s*\d+\s*)?/i, "").trim();

    // Find the image that's in the énoncé (before checkboxes)
    let enonceImage: string | null = null;
    if (firstCheckbox >= 0) {
      // Check if any image is before the first checkbox
      const imgInEnonce = /<img\s+src="(data:image\/[^"]+)"[^>]*>/.exec(enonceHtml);
      if (imgInEnonce) enonceImage = imgInEnonce[1];
    }

    // Extract options: ☐ A : text
    const optionPattern = /☐\s*<strong>([A-E])<\/strong>\s*:\s*([\s\S]*?)(?=(?:☐\s*<strong>[A-E]|<p>\s*<strong>Réponse|$))/g;
    const options: { label: string; text: string; isCorrect: boolean; explanation: string | null; image: string | null }[] = [];
    let optMatch;
    while ((optMatch = optionPattern.exec(section)) !== null) {
      const label = optMatch[1];
      let optHtml = optMatch[2];

      // Check for image in this option
      let optImage: string | null = null;
      const optImgMatch = /<img\s+src="(data:image\/[^"]+)"[^>]*>/.exec(optHtml);
      if (optImgMatch) {
        optImage = optImgMatch[1];
        optHtml = optHtml.replace(/<img[^>]+>/g, "");
      }

      options.push({
        label,
        text: cleanText(optHtml).trim(),
        isCorrect: false,
        explanation: null,
        image: optImage,
      });
    }

    // Extract correct answers: "Réponse correcte : A, C, D" or "Réponse correcte : E"
    const correctMatch = section.match(/Réponse[s]?\s*correcte[s]?\s*:\s*([A-E][,\s]*(?:[A-E][,\s]*)*)/i);
    if (correctMatch) {
      const correctLetters = correctMatch[1].replace(/\s/g, "").split(",").map(l => l.trim());
      for (const opt of options) {
        opt.isCorrect = correctLetters.includes(opt.label);
      }
    }

    // Extract explanations: after "Réponse correcte", look for "A : ...", "B : ..."
    const corrIdx = section.indexOf("Réponse correcte");
    if (corrIdx >= 0) {
      const afterCorr = section.slice(corrIdx);
      for (const opt of options) {
        // Match: <strong>A</strong> : explanation text
        const explPattern = new RegExp(`<strong>${opt.label}</strong>\\s*:\\s*([\\s\\S]*?)(?=<strong>[A-E]</strong>\\s*:|<p>\\s*<strong>\\d+\\)|$)`);
        const explMatch = explPattern.exec(afterCorr);
        if (explMatch) {
          const explText = cleanText(explMatch[1]).trim();
          if (explText.length > 2) opt.explanation = explText;
        }
      }
    }

    if (enonceText || options.length > 0) {
      questions.push({
        text: enonceText || `Question ${i + 1}`,
        image: enonceImage,
        options,
      });
    }
  }

  return questions;
}

// ─── Route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const serieName = (formData.get("name") as string) || "Import Word";
    const serieType = (formData.get("type") as string) || "annales";
    const coursId = (formData.get("coursId") as string) || null;
    const matiereId = (formData.get("matiereId") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse DOCX → HTML
    const mammothResult = await mammoth.convertToHtml({ buffer });
    const html = mammothResult.value;

    // Parse questions from HTML
    const questions = parseQuestionsFromHtml(html);

    if (questions.length === 0) {
      return NextResponse.json({ error: "Aucune question trouvée dans le document" }, { status: 400 });
    }

    // ── Enrich with MathML → LaTeX from raw XML ──────────────────────────────
    // Mammoth drops all OMML math. Extract paragraph texts from XML with LaTeX
    // and use them to fix question/option texts that lost their math formulas.
    try {
      const zip = await JSZip.loadAsync(buffer);
      const xmlFile = zip.file("word/document.xml");
      if (xmlFile) {
        const docXml = await xmlFile.async("string");
        const xmlTexts = extractAllParagraphTexts(docXml);
        // Build a lookup of "stripped text" → "text with LaTeX" for paragraphs containing $
        const mathLookup = new Map<string, string>();
        for (const t of xmlTexts) {
          if (t.includes("$")) {
            // Create a stripped version (without $...$) for matching
            const stripped = t.replace(/\$[^$]+\$/g, (m) => {
              // Extract just the raw text content from the LaTeX for matching
              return m.replace(/\$/g, "").replace(/[\\{}^_]/g, "").replace(/frac|sqrt|overline|hat|vec|sum|prod|int|left|right/g, "");
            }).trim();
            if (stripped.length > 3) mathLookup.set(stripped, t);
          }
        }

        if (mathLookup.size > 0) {
          // Try to match and replace question texts
          for (const q of questions) {
            // Check if question text matches a stripped XML paragraph
            for (const [stripped, enriched] of mathLookup) {
              if (q.text.includes(stripped) || stripped.includes(q.text.slice(0, 30))) {
                q.text = enriched;
                break;
              }
            }
            // Also check option texts
            for (const opt of q.options) {
              for (const [stripped, enriched] of mathLookup) {
                if (opt.text === stripped || (opt.text.length > 5 && stripped.includes(opt.text))) {
                  opt.text = enriched;
                  break;
                }
              }
            }
          }
          console.log("[import-word] Math enrichment: found", mathLookup.size, "paragraphs with LaTeX");
        }
      }
    } catch (e: any) {
      console.warn("[import-word] Math enrichment failed (non-critical):", e.message);
    }

    // Auto-detect year from title
    const yearMatch = serieName.match(/(\d{4}-\d{4})/);
    const annee = yearMatch ? yearMatch[1] : null;

    // Save to Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Create serie
    const { data: newSerie, error: serieErr } = await supabase
      .from("series")
      .insert({
        name: serieName,
        cours_id: coursId,
        matiere_id: matiereId,
        type: serieType,
        annee,
        timed: false,
        visible: true,
        score_definitif: false,
      })
      .select("id")
      .single();

    if (serieErr || !newSerie) {
      return NextResponse.json({ error: serieErr?.message || "Erreur création série" }, { status: 500 });
    }

    let imported = 0;

    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];

      const { data: newQ, error: qErr } = await supabase.from("questions").insert({
        text: q.text,
        type: "qcm_multiple",
        difficulty: 2,
        cours_id: coursId,
        matiere_id: matiereId,
        explanation: q.options.some(o => o.explanation) ? q.options.filter(o => o.explanation).map(o => `${o.label}: ${o.explanation}`).join("\n") : null,
        image_url: q.image,
        tags: [],
      }).select("id").single();

      if (qErr || !newQ) continue;

      // Insert options
      const opts = q.options.map((opt, idx) => ({
        question_id: newQ.id,
        label: opt.label || indexToLabel(idx),
        text: opt.text,
        is_correct: opt.isCorrect,
        order_index: idx,
        justification: opt.explanation,
        image_url: opt.image,
      }));

      if (opts.length > 0) await supabase.from("options").insert(opts);

      // Link to serie
      await supabase.from("series_questions").insert({
        series_id: newSerie.id,
        question_id: newQ.id,
        order_index: qi,
      });

      imported++;
    }

    return NextResponse.json({
      success: true,
      serieId: newSerie.id,
      serieName,
      imported,
      total: questions.length,
      annee,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
