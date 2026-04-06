import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// @ts-ignore — mammoth has no types bundled
import mammoth from "mammoth";
import JSZip from "jszip";
import sharp from "sharp";
import { extractParagraphText } from "@/lib/omml-to-latex";

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
  sectionIndex?: number; // index into ParsedSection array (for section grouping)
};

type ParsedSection = {
  title: string;       // "Partie A — Etude de l'ésoméprazole"
  intro_text: string;  // Intro paragraphs
  images: string[];    // base64 data URIs for section images
};

// ─── DrawingML / VML image extraction ────────────────────────────────────────

/**
 * Extract rId references from DrawingML (<w:drawing>) and VML (<w:pict>/<v:shape>) elements.
 * Returns an array of relationship IDs (e.g. "rId7") that reference images in word/media/.
 */
function extractDrawingImageRids(paragraphXml: string): string[] {
  const rIds: string[] = [];

  // DrawingML: <a:blip r:embed="rId7" />
  const blipRegex = /a:blip[^>]*r:embed="([^"]+)"/g;
  let m;
  while ((m = blipRegex.exec(paragraphXml)) !== null) {
    rIds.push(m[1]);
  }

  // VML: <v:imagedata r:id="rId7" />
  const vmlRegex = /v:imagedata[^>]*r:id="([^"]+)"/g;
  while ((m = vmlRegex.exec(paragraphXml)) !== null) {
    rIds.push(m[1]);
  }

  // OLE objects: <o:OLEObject ... r:id="rId7" />
  const oleRegex = /o:OLEObject[^>]*r:id="([^"]+)"/g;
  while ((m = oleRegex.exec(paragraphXml)) !== null) {
    rIds.push(m[1]);
  }

  return [...new Set(rIds)]; // deduplicate
}

/**
 * Parse word/_rels/document.xml.rels to build rId → target path mapping.
 */
function parseRelationships(relsXml: string): Record<string, string> {
  const map: Record<string, string> = {};
  const relRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/g;
  let m;
  while ((m = relRegex.exec(relsXml)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

/**
 * Extract images from DOCX ZIP that are referenced by DrawingML/VML in paragraphs
 * but missed by mammoth (e.g. vector drawings with embedded raster fallbacks).
 */
async function extractDrawingImages(
  zip: JSZip,
  docXml: string,
  relsMap: Record<string, string>,
): Promise<Map<number, string[]>> {
  // Map paragraph index → list of base64 data URIs
  const result = new Map<number, string[]>();

  // mammoth extracts standard <w:drawing><wp:inline><a:graphic><a:blip> images.
  // But it misses images inside <mc:AlternateContent> (used for vector shapes with image fallbacks),
  // <w:pict> (VML), and more complex DrawingML structures.

  // Iterate over paragraphs
  const pRegex = /<w:p[^/]*?>([\s\S]*?)<\/w:p>/g;
  let pMatch;
  let pIdx = 0;
  while ((pMatch = pRegex.exec(docXml)) !== null) {
    const content = pMatch[1];

    // Check for drawing/pict elements that mammoth might miss
    const hasMcAlternate = content.includes("<mc:AlternateContent");
    const hasWPict = content.includes("<w:pict");
    const hasDrawing = content.includes("<w:drawing");

    if (hasMcAlternate || hasWPict || hasDrawing) {
      const rIds = extractDrawingImageRids(content);
      const images: string[] = [];

      for (const rId of rIds) {
        const target = relsMap[rId];
        if (!target) continue;
        // Resolve path relative to word/
        const imgPath = target.startsWith("/") ? target.slice(1) : `word/${target}`;

        try {
          const imgFile = zip.file(imgPath);
          if (!imgFile) continue;
          const imgBuffer = await imgFile.async("base64");
          // Detect content type from extension
          const ext = imgPath.split(".").pop()?.toLowerCase() || "png";
          const mimeMap: Record<string, string> = {
            png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
            gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff",
            emf: "image/x-emf", wmf: "image/x-wmf", svg: "image/svg+xml",
          };
          const mime = mimeMap[ext] || "image/png";
          images.push(`data:${mime};base64,${imgBuffer}`);
        } catch {
          // Skip files we can't read
        }
      }

      if (images.length > 0) {
        result.set(pIdx, images);
      }
    }

    pIdx++;
  }

  return result;
}

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

  function extractImgs(htmlPart: string): string[] {
    const imgMatches = htmlPart.match(/<img\s+[^>]*src="(data:image\/[^"]+)"[^>]*>/gi) || [];
    return imgMatches.map(m => {
      const srcMatch = m.match(/src="(data:image\/[^"]+)"/);
      return srcMatch ? srcMatch[1] : "";
    }).filter(Boolean);
  }

  // Images before first Question → last one is usually the relevant structure
  const preImages = extractImgs(parts[0] ?? "");
  // Keep only the last pre-image (skip logos/headers, keep the structure)
  const relevantPreImage = preImages.length > 0 ? [preImages[preImages.length - 1]] : [];

  for (let i = 1; i < parts.length; i++) {
    const imgs = extractImgs(parts[i]);
    if (i === 1) {
      result.push([...relevantPreImage, ...imgs]);
    } else {
      result.push(imgs);
    }
  }
  return result;
}

/**
 * Format 3 : "Question" bold + list items with green highlight for correct answers
 * Parses raw DOCX XML to detect w:highlight val="green"
 * Uses mammoth HTML for image extraction
 */
function parseXmlHighlightFormat(docXml: string, html?: string, drawingImages?: Map<number, string[]>): { questions: ParsedQuestion[]; sections: ParsedSection[] } {
  const questions: ParsedQuestion[] = [];
  const sections: ParsedSection[] = [];
  const LABELS = ["A", "B", "C", "D", "E"];

  // Extract paragraphs with text, bold, and highlight info
  // Now uses extractParagraphText() to convert inline OMML math to $LaTeX$
  // xmlParaIdx tracks the raw XML paragraph index (for drawingImages mapping)
  type Para = { text: string; bold: boolean; highlighted: string | null; xmlIdx: number };
  const paras: Para[] = [];
  const pRegex = /<w:p[^/]*?>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  let xmlParaCounter = 0;
  while ((m = pRegex.exec(docXml)) !== null) {
    const content = m[1];
    const highlightMatch = content.match(/w:highlight w:val="([^"]+)"/);
    const isBold = content.includes("<w:b/>") || content.includes("<w:b ");
    // Use new extractParagraphText to handle OMML → LaTeX conversion
    const text = extractParagraphText(content);
    if (text.length > 0) {
      paras.push({ text, bold: isBold, highlighted: highlightMatch?.[1] ?? null, xmlIdx: xmlParaCounter });
    }
    xmlParaCounter++;
  }

  // ── Detect sections ("Partie X" bold markers) and "Question" markers ───────
  const qMarkers: number[] = [];
  const sectionMarkers: { idx: number; title: string }[] = [];

  for (let j = 0; j < paras.length; j++) {
    if (paras[j].bold && /^question$/i.test(paras[j].text.trim())) {
      qMarkers.push(j);
    }
    if (paras[j].bold && /^partie\s/i.test(paras[j].text.trim())) {
      // Collect title: this paragraph + next bold paragraph (subtitle)
      let title = paras[j].text;
      if (j + 1 < paras.length && paras[j + 1].bold && !/^question$/i.test(paras[j + 1].text.trim()) && !/^partie\s/i.test(paras[j + 1].text.trim())) {
        title += " — " + paras[j + 1].text;
      }
      sectionMarkers.push({ idx: j, title });
    }
  }

  // ── Build sections with intro text ─────────────────────────────────────────
  for (let si = 0; si < sectionMarkers.length; si++) {
    const sm = sectionMarkers[si];
    // Collect intro: non-bold paragraphs between this section marker and the first Question after it
    const firstQAfter = qMarkers.find(q => q > sm.idx);
    const introEnd = firstQAfter ?? paras.length;
    const introTexts: string[] = [];
    for (let j = sm.idx + 1; j < introEnd; j++) {
      if (paras[j].bold) continue;
      if (paras[j].text.trim().length < 3) continue;
      introTexts.push(paras[j].text);
    }
    sections.push({
      title: sm.title,
      intro_text: introTexts.join(" "),
      images: [],
    });
  }

  // ── Map each question to its section ───────────────────────────────────────
  function getSectionIndex(qParaIdx: number): number | undefined {
    // Find the last section marker before this question
    for (let si = sectionMarkers.length - 1; si >= 0; si--) {
      if (sectionMarkers[si].idx < qParaIdx) return si;
    }
    return undefined;
  }

  // ── Parse questions ────────────────────────────────────────────────────────
  for (let qi = 0; qi < qMarkers.length; qi++) {
    const start = qMarkers[qi] + 1;
    const end = qi + 1 < qMarkers.length ? qMarkers[qi + 1] : paras.length;

    const items: Para[] = [];
    for (let j = start; j < end; j++) {
      if (paras[j].bold) continue;
      if (paras[j].text.trim().length < 2) continue;
      items.push(paras[j]);
    }

    if (items.length < 2) continue;

    let questionText: string;
    let optionItems: Para[];

    if (items.length <= 5) {
      questionText = `Question ${questions.length + 1}`;
      optionItems = items;
    } else if (items.length === 6) {
      questionText = items[0].text;
      optionItems = items.slice(1, 6);
    } else {
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
      questions.push({
        text: questionText,
        options,
        images: [],
        sectionIndex: getSectionIndex(qMarkers[qi]),
      });
    }
  }

  // ── Assign images from mammoth HTML ────────────────────────────────────────
  if (html) {
    // Images per question
    const imagesPerQ = extractImagesPerQuestion(html);
    for (let qi = 0; qi < Math.min(questions.length, imagesPerQ.length); qi++) {
      questions[qi].images = imagesPerQ[qi];
    }

    // Images per section (between "Partie" and first "Question" in HTML)
    const sectionParts = html.split(/<(?:li>)?<strong>(?:Partie\s[^<]*)<\/strong>(?:<\/li>)?/i);
    for (let si = 0; si < sections.length && si + 1 < sectionParts.length; si++) {
      const part = sectionParts[si + 1];
      const beforeQ = part.split(/<(?:li>)?<strong>Question<\/strong>/i)[0] ?? "";
      const imgs = (beforeQ.match(/<img\s+[^>]*src="(data:image\/[^"]+)"[^>]*>/gi) || [])
        .map(m => m.match(/src="(data:image\/[^"]+)"/)?.[1] ?? "")
        .filter(Boolean);
      sections[si].images = imgs;
    }
  }

  // ── Assign DrawingML/VML images for questions that have no images yet ──────
  if (drawingImages && drawingImages.size > 0) {
    // qMarkers/sectionMarkers use paras[] indices. drawingImages uses raw XML indices.
    // Convert paras[] indices to XML indices using the xmlIdx field.
    for (let qi = 0; qi < qMarkers.length; qi++) {
      if (questions[qi] && questions[qi].images.length === 0) {
        const startXml = paras[qMarkers[qi]].xmlIdx;
        const endXml = qi + 1 < qMarkers.length ? paras[qMarkers[qi + 1]].xmlIdx : Infinity;
        for (const [xmlParaIdx, imgs] of drawingImages) {
          if (xmlParaIdx >= startXml && xmlParaIdx < endXml) {
            questions[qi].images.push(...imgs);
          }
        }
      }
    }

    // Also assign drawing images to sections that have no images
    for (let si = 0; si < sectionMarkers.length; si++) {
      if (sections[si] && sections[si].images.length === 0) {
        const smXml = paras[sectionMarkers[si].idx].xmlIdx;
        const firstQAfter = qMarkers.find(q => q > sectionMarkers[si].idx);
        const endXml = firstQAfter != null ? paras[firstQAfter].xmlIdx : Infinity;
        for (const [xmlParaIdx, imgs] of drawingImages) {
          if (xmlParaIdx > smXml && xmlParaIdx < endXml) {
            sections[si].images.push(...imgs);
          }
        }
      }
    }

    console.log("[import-serie] DrawingML images assigned:",
      questions.filter(q => q.images.length > 0).length, "questions with images");
  }

  return { questions, sections };
}

/**
 * Try all formats, return whichever finds more questions
 */
function parseDocx(html: string, docXml?: string, drawingImages?: Map<number, string[]>): { questions: ParsedQuestion[]; sections: ParsedSection[] } {
  const fromTables = parseTableFormat(html);
  const fromParagraphs = parseParagraphFormat(html);
  const xmlResult = docXml ? parseXmlHighlightFormat(docXml, html, drawingImages) : { questions: [], sections: [] };
  console.log(`[parseDocx] tables=${fromTables.length} paragraphs=${fromParagraphs.length} xml=${xmlResult.questions.length} docXml=${docXml ? "yes" : "no"} sections=${xmlResult.sections.length}`);

  // Pick whichever format found the most questions
  const allFormats = [fromTables, fromParagraphs, xmlResult.questions];
  const best = allFormats.reduce((b, cur) => cur.length > b.length ? cur : b, [] as ParsedQuestion[]);

  // Return sections only if the XML format won
  const sections = best === xmlResult.questions ? xmlResult.sections : [];
  return { questions: best, sections };
}

// ─── Image upload helper ──────────────────────────────────────────────────────

// Formats that browsers cannot display — must be converted to PNG
const NON_WEB_FORMATS = new Set(["x-emf", "x-wmf", "emf", "wmf", "tiff", "bmp", "x-bmp"]);

async function uploadBase64Image(
  supabase: any,
  dataUri: string,
  questionId: string,
  idx: number,
): Promise<string | null> {
  try {
    // Parse data URI: "data:image/jpeg;base64,/9j/..."
    const match = dataUri.match(/^data:image\/([\w+\-]+);base64,(.+)$/);
    if (!match) return null;
    let format = match[1];
    let base64 = match[2];
    let buffer = Buffer.from(base64, "base64");

    // Convert non-web-compatible formats (EMF, WMF, TIFF, BMP) to PNG via sharp
    if (NON_WEB_FORMATS.has(format)) {
      try {
        console.log(`[upload-img] Converting ${format} → PNG for Q ${questionId}`);
        const pngBuf = await sharp(buffer).png().toBuffer();
        buffer = Buffer.from(pngBuf);
        format = "png";
      } catch (convErr: any) {
        console.warn(`[upload-img] Cannot convert ${format} to PNG:`, convErr.message);
        return null; // Skip non-displayable images
      }
    }

    const ext = format === "jpeg" ? "jpg" : format === "svg+xml" ? "svg" : format;
    const contentType = format === "svg+xml" ? "image/svg+xml" : `image/${format}`;
    const path = `questions/${questionId}/${idx > 0 ? `img_${idx}` : "image"}.${ext}`;
    const { error } = await supabase.storage
      .from("question-images")
      .upload(path, buffer, { contentType, upsert: true });

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

    // Extract raw XML from DOCX for highlight detection + drawing images
    let docXml: string | undefined;
    let drawingImages: Map<number, string[]> | undefined;
    try {
      const zip = await JSZip.loadAsync(buffer);
      const xmlFile = zip.file("word/document.xml");
      if (xmlFile) docXml = await xmlFile.async("string");
      console.log("[import-serie] XML extracted:", docXml ? `${docXml.length} chars` : "null");

      // Extract relationships and drawing images from ZIP
      if (docXml) {
        const relsFile = zip.file("word/_rels/document.xml.rels");
        if (relsFile) {
          const relsXml = await relsFile.async("string");
          const relsMap = parseRelationships(relsXml);
          drawingImages = await extractDrawingImages(zip, docXml, relsMap);
          if (drawingImages.size > 0) {
            console.log("[import-serie] DrawingML/VML images found:", drawingImages.size, "paragraphs with images");
          }
        }
      }
    } catch (e: any) {
      console.error("[import-serie] JSZip error:", e.message);
    }

    // Parser (essaie les trois formats)
    const { questions: parsed, sections: parsedSections } = parseDocx(html, docXml, drawingImages);
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

    // ─── Create sections if any ──────────────────────────────────────────────
    const sectionIdMap: Record<number, string> = {}; // sectionIndex -> DB id
    if (parsedSections.length > 0 && existingIds.length === 0) {
      for (let si = 0; si < parsedSections.length; si++) {
        const s = parsedSections[si];
        // Upload section image if present
        let sectionImageUrl: string | null = null;
        if (s.images.length > 0) {
          const tmpId = `section_${si}_${Date.now()}`;
          sectionImageUrl = await uploadBase64Image(supabase, s.images[0], tmpId, 0);
          if (!sectionImageUrl) sectionImageUrl = s.images[0]; // fallback to data URI
        }

        const { data: secData } = await supabase
          .from("series_sections")
          .insert({
            series_id: serieId,
            title: s.title,
            intro_text: s.intro_text || null,
            image_url: sectionImageUrl,
            order_index: si,
          })
          .select("id")
          .single();

        if (secData) sectionIdMap[si] = secData.id;
      }
      console.log("[import-serie] Created sections:", Object.keys(sectionIdMap).length);
    }

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

        // Upload image to Supabase Storage if present
        if (p.images.length > 0) {
          let imgUrl = await uploadBase64Image(supabase, p.images[0], newQ.id, 0);
          if (!imgUrl) {
            // Fallback: store data URI directly if upload fails
            console.warn("[import-serie] image upload failed for Q", i + 1, "- storing data URI");
            imgUrl = p.images[0];
          }
          await supabase.from("questions").update({ image_url: imgUrl }).eq("id", newQ.id);
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

        // Lier à la série (with section if available)
        const sectionId = p.sectionIndex != null ? sectionIdMap[p.sectionIndex] ?? null : null;
        await supabase.from("series_questions").insert({
          series_id: serieId,
          question_id: newQ.id,
          order_index: i,
          ...(sectionId ? { section_id: sectionId } : {}),
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
