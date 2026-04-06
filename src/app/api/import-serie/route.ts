import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// @ts-ignore — mammoth has no types bundled
import mammoth from "mammoth";
import JSZip from "jszip";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedOption = {
  label: string;       // A B C D E
  text: string;
  is_correct: boolean;
};

type ParsedQuestion = {
  text: string;
  options: ParsedOption[];
  images: string[]; // base64 data URIs for images associated with the question
};

// ─── Parsers ──────────────────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(html: string): string {
  const raw = html.replace(/<img[^>]*>/gi, " [image] ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return decodeEntities(raw);
}

/**
 * Format 1 : ExoTeach BIS export (tables)
 * Questions as "N. text" followed by a <table> with options
 */
function parseTableFormat(html: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const elements: { type: "question" | "table"; content: string; index: number }[] = [];

  let m: RegExpExecArray | null;
  const qRegex = /<p[^>]*>(?:<strong>|<b>)?\s*\d+\.\s+([\s\S]*?)(?:<\/strong>|<\/b>)?\s*<\/p>/gi;
  while ((m = qRegex.exec(html)) !== null) {
    elements.push({ type: "question", content: stripTags(m[1]).trim(), index: m.index });
  }

  const tRegex = /<table[\s\S]*?<\/table>/gi;
  while ((m = tRegex.exec(html)) !== null) {
    elements.push({ type: "table", content: m[0], index: m.index });
  }

  elements.sort((a, b) => a.index - b.index);

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== "question") continue;
    const nextEl = elements[i + 1];
    if (!nextEl || nextEl.type !== "table") continue;
    const options = parseOptionsTable(nextEl.content);
    if (options.length > 0) {
      questions.push({ text: el.content, options, images: [] });
    }
    i++;
  }
  return questions;
}

function parseOptionsTable(tableHtml: string): ParsedOption[] {
  const options: ParsedOption[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRegex.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRegex.exec(row[1])) !== null) cells.push(c[1]);
    if (cells.length < 3) continue;
    const checkCell = stripTags(cells[0]).trim();
    const labelCell = stripTags(cells[1]).trim().toUpperCase();
    const textCell  = stripTags(cells[2]).trim();
    if (!["A","B","C","D","E"].includes(labelCell)) continue;
    if (!textCell) continue;
    const is_correct = checkCell.includes("✓") || checkCell.includes("✔");
    options.push({ label: labelCell, text: textCell, is_correct });
  }
  return options;
}

/**
 * Format 2 : ExoTeach / generic (paragraphs)
 * Questions as "N) text" in bold paragraphs
 * Options as "☐ A : text" or "✓ A : text" paragraphs
 */
function parseParagraphFormat(html: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  // Extract all paragraphs preserving raw HTML (for images)
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: { raw: string; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pRegex.exec(html)) !== null) {
    paragraphs.push({ raw: m[1], text: stripTags(m[1]) });
  }

  let currentQuestion: ParsedQuestion | null = null;

  for (const p of paragraphs) {
    const text = p.text;
    const raw = p.raw;

    // Check if paragraph contains an image (data URI)
    const imgMatch = raw.match(/<img\s+src="(data:image\/[^"]+)"/i);

    // Question pattern: "N) text" or "N. text" (with N being 1-999)
    const qMatch = text.match(/^\s*(\d{1,3})\s*[)\.]\s+(.+)/);
    if (qMatch && qMatch[2].length > 10) {
      if (currentQuestion && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
      }
      currentQuestion = { text: qMatch[2].trim(), options: [], images: [] };
      // If the question paragraph itself has an image, capture it
      if (imgMatch && currentQuestion) currentQuestion.images.push(imgMatch[1]);
      continue;
    }

    // Standalone image paragraph → associate with current question
    if (imgMatch && currentQuestion && text.replace(/\[image\]/g, "").trim().length < 5) {
      currentQuestion.images.push(imgMatch[1]);
      continue;
    }

    // Option pattern: "☐ A : text" or "✓ A : text" or "✔ A : text"
    const optMatch = text.match(/^\s*([☐✓✔])\s*([A-E])\s*:\s*(.+)/);
    if (optMatch && currentQuestion) {
      const check = optMatch[1];
      const label = optMatch[2].toUpperCase();
      let optText = optMatch[3].trim();
      optText = optText.replace(/^[A-E]\.\s*/, "");
      const is_correct = check === "✓" || check === "✔";
      currentQuestion.options.push({ label, text: optText, is_correct });
      continue;
    }

    // "Réponse correcte : B" or "Réponses correctes : A, B, E"
    const corrMatch = text.match(/^\s*R[ée]ponses?\s+correctes?\s*:\s*(.+)/i);
    if (corrMatch && currentQuestion && currentQuestion.options.length > 0) {
      const correctLabels = corrMatch[1].split(/[,\s]+/).map(l => l.trim().toUpperCase()).filter(l => /^[A-E]$/.test(l));
      for (const opt of currentQuestion.options) {
        opt.is_correct = correctLabels.includes(opt.label);
      }
    }
  }

  if (currentQuestion && currentQuestion.options.length > 0) {
    questions.push(currentQuestion);
  }

  return questions;
}

/**
 * Extract images per question from mammoth HTML by splitting at "Question" markers
 */
function extractImagesPerQuestion(html: string): string[][] {
  const parts = html.split(/<(?:li>)?<strong>Question<\/strong>(?:<\/li>)?/i);
  const result: string[][] = [];
  // Skip part[0] (content before first Question)
  for (let i = 1; i < parts.length; i++) {
    const imgMatches = parts[i].match(/<img\s+[^>]*src="(data:image\/[^"]+)"[^>]*>/gi) || [];
    const imgs = imgMatches.map(m => {
      const srcMatch = m.match(/src="(data:image\/[^"]+)"/);
      return srcMatch ? srcMatch[1] : "";
    }).filter(Boolean);
    result.push(imgs);
  }
  return result;
}

/**
 * Format 3 : "Question" bold + list items with green highlight for correct answers
 * Parses raw DOCX XML to detect w:highlight val="green"
 * Uses mammoth HTML for image extraction
 */
function parseXmlHighlightFormat(docXml: string, html?: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const LABELS = ["A", "B", "C", "D", "E"];

  // Extract paragraphs with text, bold, and highlight info
  type Para = { text: string; bold: boolean; highlighted: string | null };
  const paras: Para[] = [];
  const pRegex = /<w:p[^/]*?>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRegex.exec(docXml)) !== null) {
    const content = m[1];
    const highlightMatch = content.match(/w:highlight w:val="([^"]+)"/);
    const isBold = content.includes("<w:b/>") || content.includes("<w:b ");
    const texts: string[] = [];
    const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRegex.exec(content)) !== null) texts.push(t[1]);
    const text = texts.join("").trim();
    if (text.length > 0) {
      paras.push({ text, bold: isBold, highlighted: highlightMatch?.[1] ?? null });
    }
  }

  // Find all "Question" marker positions
  const qMarkers: number[] = [];
  for (let j = 0; j < paras.length; j++) {
    if (paras[j].bold && /^question$/i.test(paras[j].text.trim())) {
      qMarkers.push(j);
    }
  }

  // For each question marker, extract text + 5 options from the paragraphs between this and the next marker
  for (let qi = 0; qi < qMarkers.length; qi++) {
    const start = qMarkers[qi] + 1; // skip the "Question" marker
    const end = qi + 1 < qMarkers.length ? qMarkers[qi + 1] : paras.length;

    // Collect all non-bold paragraphs between markers (skip section headers like "Partie B")
    const items: Para[] = [];
    for (let j = start; j < end; j++) {
      if (paras[j].bold) continue; // skip bold section headers
      if (paras[j].text.trim().length < 2) continue;
      items.push(paras[j]);
    }

    if (items.length < 2) continue;

    // If there are exactly 5 items → no separate question text, first item is option A
    // If there are 6+ items → first item(s) are question text, last 5 are options
    let questionText: string;
    let optionItems: Para[];

    if (items.length <= 5) {
      // No separate question text — use a generic text or the question number
      questionText = `Question ${questions.length + 1}`;
      optionItems = items;
    } else if (items.length === 6) {
      questionText = items[0].text;
      optionItems = items.slice(1, 6);
    } else {
      // Multiple paragraphs of question text + 5 options
      const numTextParas = items.length - 5;
      questionText = items.slice(0, numTextParas).map(p => p.text).join(" ");
      optionItems = items.slice(numTextParas, numTextParas + 5);
    }

    const options: ParsedOption[] = optionItems.slice(0, 5).map((p, idx) => ({
      label: LABELS[idx],
      text: p.text.trim(),
      is_correct: p.highlighted === "green",
    }));

    if (options.length >= 2) {
      questions.push({ text: questionText, options, images: [] });
    }
  }

  // Assign images from mammoth HTML to questions
  if (html) {
    const imagesPerQ = extractImagesPerQuestion(html);
    for (let qi = 0; qi < Math.min(questions.length, imagesPerQ.length); qi++) {
      questions[qi].images = imagesPerQ[qi];
    }
  }

  return questions;
}

/**
 * Try all formats, return whichever finds more questions
 */
function parseDocx(html: string, docXml?: string): ParsedQuestion[] {
  const fromTables = parseTableFormat(html);
  const fromParagraphs = parseParagraphFormat(html);
  const fromXml = docXml ? parseXmlHighlightFormat(docXml, html) : [];
  const results = [fromTables, fromParagraphs, fromXml];
  return results.reduce((best, cur) => cur.length > best.length ? cur : best, []);
}

// ─── Image upload helper ──────────────────────────────────────────────────────

async function uploadBase64Image(
  supabase: any,
  dataUri: string,
  questionId: string,
  idx: number,
): Promise<string | null> {
  try {
    // Parse data URI: "data:image/jpeg;base64,/9j/..."
    const match = dataUri.match(/^data:image\/([\w+]+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, "base64");

    const path = `questions/${questionId}/${idx > 0 ? `img_${idx}` : "image"}.${ext}`;
    const { error } = await supabase.storage
      .from("question-images")
      .upload(path, buffer, { contentType: `image/${match[1]}`, upsert: true });

    if (error) {
      console.error("[upload-img]", error.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from("question-images").getPublicUrl(path);
    return urlData?.publicUrl ?? null;
  } catch (e) {
    console.error("[upload-img] exception", e);
    return null;
  }
}

// ─── Route POST ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const serieId = formData.get("serieId") as string;
    const file    = formData.get("file") as File | null;

    if (!serieId || !file) {
      return NextResponse.json({ error: "serieId et fichier requis" }, { status: 400 });
    }

    // Vérifier auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // Lire le fichier
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convertir DOCX → HTML via mammoth
    const { value: html } = await mammoth.convertToHtml({ buffer });

    // Extract raw XML from DOCX for highlight detection
    let docXml: string | undefined;
    try {
      const zip = await JSZip.loadAsync(buffer);
      const xmlFile = zip.file("word/document.xml");
      if (xmlFile) docXml = await xmlFile.async("string");
    } catch { /* ignore zip errors */ }

    // Parser (essaie les trois formats)
    const parsed = parseDocx(html, docXml);
    if (parsed.length === 0) {
      return NextResponse.json({ error: "Aucune question trouvée dans le fichier. Vérifiez le format (questions numérotées 1) ou 1. suivies d'options A-E)." }, { status: 422 });
    }

    // Récupérer la série pour savoir le cours_id
    const { data: serie } = await supabase
      .from("series")
      .select("id, cours_id")
      .eq("id", serieId)
      .single();

    // Récupérer les questions existantes de la série (dans l'ordre)
    const { data: sqData } = await supabase
      .from("series_questions")
      .select("question_id, order_index")
      .eq("series_id", serieId)
      .order("order_index");

    const existingIds: string[] = (sqData ?? []).map((r: any) => r.question_id).filter(Boolean);

    // ─── MODE 1 : Série vide → CRÉER les questions ────────────────────────────
    if (existingIds.length === 0) {
      let created = 0;
      for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];

        // Créer la question
        const { data: newQ, error: qErr } = await supabase
          .from("questions")
          .insert({
            text: p.text,
            type: "qcm_multiple",
            difficulty: 2,
            cours_id: serie?.cours_id ?? null,
            matiere_id: null,
          })
          .select("id")
          .single();

        if (qErr || !newQ) continue;

        // Stocker l'image principale si présente (data URI directement)
        if (p.images.length > 0) {
          await supabase.from("questions").update({ image_url: p.images[0] }).eq("id", newQ.id);
        }

        // Créer les options
        const optionsToInsert = p.options.map((opt, idx) => ({
          question_id: newQ.id,
          label: opt.label,
          text: opt.text,
          is_correct: opt.is_correct,
          order_index: idx,
        }));
        await supabase.from("options").insert(optionsToInsert);

        // Lier à la série
        await supabase.from("series_questions").insert({
          series_id: serieId,
          question_id: newQ.id,
          order_index: i,
        });

        created++;
      }

      return NextResponse.json({
        success: true,
        message: `${created} question${created > 1 ? "s" : ""} importée${created > 1 ? "s" : ""} et ajoutée${created > 1 ? "s" : ""} à la série.`,
      });
    }

    // ─── MODE 2 : Série existante → METTRE À JOUR par position ───────────────
    const updates: { questionIndex: number; updated: boolean; error?: string }[] = [];

    for (let i = 0; i < Math.min(parsed.length, existingIds.length); i++) {
      const p = parsed[i];
      const qId = existingIds[i];

      const { error: qErr } = await supabase
        .from("questions")
        .update({ text: p.text })
        .eq("id", qId);

      if (qErr) {
        updates.push({ questionIndex: i + 1, updated: false, error: qErr.message });
        continue;
      }

      const { data: existingOpts } = await supabase
        .from("options")
        .select("id, label")
        .eq("question_id", qId)
        .order("order_index");

      for (const parsedOpt of p.options) {
        const existing = (existingOpts ?? []).find((o: any) => o.label === parsedOpt.label);
        if (!existing) continue;
        await supabase
          .from("options")
          .update({ text: parsedOpt.text, is_correct: parsedOpt.is_correct })
          .eq("id", existing.id);
      }

      updates.push({ questionIndex: i + 1, updated: true });
    }

    const updatedCount = updates.filter(u => u.updated).length;
    const skipped = Math.max(0, parsed.length - existingIds.length);

    return NextResponse.json({
      success: true,
      message: `${updatedCount} question${updatedCount > 1 ? "s" : ""} mise${updatedCount > 1 ? "s" : ""} à jour.${skipped > 0 ? ` (${skipped} ignorée${skipped > 1 ? "s" : ""} — non présentes dans la série)` : ""}`,
      details: updates,
    });
  } catch (e: any) {
    console.error("[import-serie]", e);
    return NextResponse.json({ error: e.message ?? "Erreur interne" }, { status: 500 });
  }
}
