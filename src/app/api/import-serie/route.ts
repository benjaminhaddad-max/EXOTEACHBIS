import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// @ts-ignore — mammoth has no types bundled
import mammoth from "mammoth";
import JSZip from "jszip";
import sharp from "sharp";
import { extractParagraphText } from "@/lib/omml-to-latex";
import { convertDataUriToPng, convertDocxToPages, convertEmfBatchViaDocx } from "@/lib/convert-emf";

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
  pageIndex?: number; // 0-indexed page number in the DOCX (for page PNG mapping)
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
 * Add <w:keepNext/> to question and option paragraphs in document.xml
 * so Word keeps them together on the same page (no mid-question page breaks).
 */
function addKeepNextToQuestions(xml: string): string {
  // Match all <w:p ...>...</w:p> blocks
  const pBlocks: { start: number; end: number; text: string }[] = [];
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m;
  while ((m = pRegex.exec(xml)) !== null) {
    // Extract text content from <w:t> elements
    const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let text = "";
    let tm;
    while ((tm = tRegex.exec(m[0])) !== null) text += tm[1];
    pBlocks.push({ start: m.index, end: m.index + m[0].length, text: text.trim() });
  }

  // Classify paragraphs
  const isQ = (t: string) => /^(Question\s+\d+|\d+[\s.\-)]+\s*\S)/i.test(t);
  const isOpt = (t: string) => /^[A-F][.\s)\-]/.test(t);

  // Determine which need keepNext: question + all its options except the last
  const keepNextIndices = new Set<number>();
  for (let i = 0; i < pBlocks.length; i++) {
    const t = pBlocks[i].text;
    if (isQ(t)) {
      keepNextIndices.add(i);
    } else if (isOpt(t)) {
      // Add keepNext if next paragraph is also an option
      const next = pBlocks[i + 1];
      if (next && isOpt(next.text)) {
        keepNextIndices.add(i);
      }
      // Last option: no keepNext → allows page break after full question
    }
  }

  if (keepNextIndices.size === 0) return xml;

  // Apply modifications in reverse order to preserve string indices
  let result = xml;
  const sorted = [...keepNextIndices].sort((a, b) => b - a);
  for (const idx of sorted) {
    const { start, end } = pBlocks[idx];
    let pXml = result.substring(start, end);

    // Skip if already has keepNext
    if (/<w:keepNext/.test(pXml)) continue;

    if (/<w:pPr[\s>]/.test(pXml)) {
      // Insert keepNext inside existing pPr
      pXml = pXml.replace(/(<w:pPr[^>]*>)/, "$1<w:keepNext/>");
    } else {
      // No pPr — add one after the opening <w:p ...> tag
      pXml = pXml.replace(/(<w:p[^>]*>)/, "$1<w:pPr><w:keepNext/></w:pPr>");
    }

    result = result.substring(0, start) + pXml + result.substring(end);
  }

  return result;
}

type ExamMeta = {
  examTitle: string;
  ueCode: string;
  subjectName: string;
  duration: string;
  examDate: string;
  institution: string;
  academicYear: string;
};

/** Helper: create a Word XML paragraph */
function wxp(text: string, opts: { bold?: boolean; size?: number; color?: string; center?: boolean; spacing?: { before?: number; after?: number }; underline?: boolean } = {}): string {
  const sz = opts.size ?? 22;
  const color = opts.color ?? "333333";
  const rPr = [
    `<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>`,
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`,
    `<w:color w:val="${color}"/>`,
    opts.bold ? "<w:b/><w:bCs/>" : "",
    opts.underline ? `<w:u w:val="single"/>` : "",
  ].join("");
  const pPr = [
    opts.center ? `<w:jc w:val="center"/>` : "",
    opts.spacing ? `<w:spacing w:before="${opts.spacing.before ?? 0}" w:after="${opts.spacing.after ?? 0}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${pPr}</w:pPr><w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

/**
 * Replace everything before the first question with a clean DS cover page.
 */
function replaceCoverPage(xml: string, meta: ExamMeta): string {
  // Find first question paragraph (starts with "Question" or "QCM" or "1.")
  const bodyStart = xml.indexOf("<w:body>");
  const bodyEnd = xml.indexOf("</w:body>");
  if (bodyStart < 0 || bodyEnd < 0) return xml;

  const bodyContent = xml.substring(bodyStart + 8, bodyEnd);

  // Find first question paragraph
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m;
  let firstQuestionIdx = -1;
  while ((m = pRegex.exec(bodyContent)) !== null) {
    const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let text = "";
    let tm;
    while ((tm = tRegex.exec(m[0])) !== null) text += tm[1];
    text = text.trim();
    if (/^(Question\s+\d|QCM\s+\d|\d+[\s.\-)]+\s*\S)/i.test(text) || /^Partie\s+[A-Z]/i.test(text)) {
      firstQuestionIdx = m.index;
      break;
    }
  }

  if (firstQuestionIdx < 0) return xml; // no question found, don't touch

  // Build DS cover page paragraphs
  const ueSubject = [meta.ueCode, meta.subjectName].filter(Boolean).join(" - ");
  const cover = [
    // Header bar (institution + year)
    wxp(`${meta.institution}          ${meta.academicYear}`, { bold: true, size: 24, color: "0E1E35", center: true, spacing: { before: 0, after: 400 } }),
    // Title
    wxp(meta.examTitle || "Examen", { bold: true, size: 48, color: "0E1E35", center: true, spacing: { before: 400, after: 200 } }),
    // UE - Subject
    ...(ueSubject ? [wxp(ueSubject, { bold: true, size: 32, color: "0E1E35", center: true, spacing: { before: 100, after: 200 } })] : []),
    // SUJET
    wxp("SUJET", { bold: true, size: 40, color: "C9A84C", center: true, spacing: { before: 100, after: 200 } }),
    // Duration + Date
    wxp(`Dur\u00E9e de l'\u00E9preuve : ${meta.duration}`, { size: 22, color: "555555", center: true, spacing: { before: 100, after: 50 } }),
    ...(meta.examDate ? [wxp(meta.examDate, { size: 22, color: "555555", center: true, spacing: { before: 0, after: 400 } })] : []),
    // Instructions title
    wxp("A LIRE AVANT DE COMMENCER L'\u00C9PREUVE", { bold: true, size: 20, color: "0E1E35", center: true, underline: true, spacing: { before: 300, after: 150 } }),
    // Instructions
    wxp("- V\u00E9rifier que les informations saisies sur les GRILLES sont correctes (nom, pr\u00E9nom, num\u00E9ro d'\u00E9tudiant).", { size: 18, color: "555555", spacing: { before: 40, after: 40 } }),
    wxp("- Les correcteurs liquides et les stylos effa\u00E7ables sont interdits.", { size: 18, color: "555555", spacing: { before: 40, after: 40 } }),
    wxp("- Seules les r\u00E9ponses port\u00E9es sur la GRILLE DE R\u00C9PONSES seront prises en compte.", { size: 18, color: "555555", spacing: { before: 40, after: 40 } }),
    wxp("- L'utilisation de tout appareil \u00E9lectronique est formellement interdite.", { size: 18, color: "555555", spacing: { before: 40, after: 40 } }),
    // Regulatory
    wxp("INFORMATIONS R\u00C9GLEMENTAIRES", { bold: true, size: 20, color: "0E1E35", center: true, underline: true, spacing: { before: 300, after: 150 } }),
    wxp("- Les questions sans r\u00E9ponse seront consid\u00E9r\u00E9es comme nulles.", { size: 18, color: "555555", spacing: { before: 40, after: 40 } }),
    wxp("- Les questions \u00E0 choix multiples peuvent comporter une ou plusieurs r\u00E9ponses exactes.", { size: 18, color: "555555", spacing: { before: 40, after: 40 } }),
    wxp("- Aucune r\u00E9clamation ne sera accept\u00E9e apr\u00E8s la fin de l'\u00E9preuve.", { size: 18, color: "555555", spacing: { before: 40, after: 200 } }),
    // Page break
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
  ].join("");

  // Replace: body start → first question with new cover + keep questions
  const newBody = cover + bodyContent.substring(firstQuestionIdx);
  return xml.substring(0, bodyStart + 8) + newBody + xml.substring(bodyEnd);
}

/**
 * Reformat question headings: "Question X." or "X." → "QCM X :"
 */
function reformatQuestionHeadings(xml: string): string {
  // Replace "Question X." or "Question X :" patterns in <w:t> elements
  let result = xml;
  result = result.replace(
    /(<w:t[^>]*>)\s*Question\s+(\d+)\s*[.:]\s*/gi,
    "$1QCM $2 : "
  );
  // Also handle standalone number "1." at start of text in bold runs
  // Only if preceded by bold formatting in the same run
  result = result.replace(
    /(<w:rPr>[^<]*<w:b\/>[^<]*<\/w:rPr>\s*<w:t[^>]*>)\s*(\d+)\s*\.\s+/g,
    "$1QCM $2 : "
  );
  return result;
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

// Web-displayable image formats (browsers can render these natively)
const WEB_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp"]);
// Non-web vector formats that need conversion
const VECTOR_IMAGE_EXTS = new Set(["emf", "wmf"]);

/**
 * Build a map of base filename → available formats in word/media/.
 * e.g. { "image1": ["emf", "png"], "image2": ["emf"] }
 */
function catalogMediaFiles(zip: JSZip): Map<string, string[]> {
  const catalog = new Map<string, string[]>();
  zip.forEach((relativePath) => {
    if (!relativePath.startsWith("word/media/")) return;
    const filename = relativePath.replace("word/media/", "");
    const dotIdx = filename.lastIndexOf(".");
    if (dotIdx < 0) return;
    const baseName = filename.slice(0, dotIdx);
    const ext = filename.slice(dotIdx + 1).toLowerCase();
    if (!catalog.has(baseName)) catalog.set(baseName, []);
    catalog.get(baseName)!.push(ext);
  });
  return catalog;
}

/**
 * Extract images from DOCX ZIP that are referenced by DrawingML/VML in paragraphs.
 * PREFERS PNG/JPEG over EMF/WMF — if both exist for same image, uses the web format.
 */
async function extractDrawingImages(
  zip: JSZip,
  docXml: string,
  relsMap: Record<string, string>,
): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  const mediaCatalog = catalogMediaFiles(zip);

  // Log available media for debugging
  for (const [base, exts] of mediaCatalog) {
    console.log(`[media] ${base}: ${exts.join(", ")}`);
  }

  const mimeMap: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff",
    emf: "image/x-emf", wmf: "image/x-wmf", svg: "image/svg+xml",
    webp: "image/webp",
  };

  /**
   * For a given rId, resolve the best available image format.
   * If the relationship points to an EMF but a PNG exists with the same base name, use PNG.
   */
  async function resolveImage(rId: string): Promise<string | null> {
    const target = relsMap[rId];
    if (!target) return null;

    const imgPath = target.startsWith("/") ? target.slice(1) : `word/${target}`;
    const filename = imgPath.replace("word/media/", "");
    const dotIdx = filename.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const baseName = filename.slice(0, dotIdx);
    const originalExt = filename.slice(dotIdx + 1).toLowerCase();

    // Check if there's a web-compatible alternative with the same base name
    const availableExts = mediaCatalog.get(baseName) || [originalExt];

    // Priority: PNG > JPEG > GIF > WEBP > SVG > original (EMF/WMF)
    const priority = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
    let bestExt = originalExt;
    for (const ext of priority) {
      if (availableExts.includes(ext)) {
        bestExt = ext;
        break;
      }
    }

    const bestPath = `word/media/${baseName}.${bestExt}`;
    try {
      const imgFile = zip.file(bestPath);
      if (!imgFile) {
        // Fallback to original path
        const fallback = zip.file(imgPath);
        if (!fallback) return null;
        const buf = await fallback.async("base64");
        const mime = mimeMap[originalExt] || "image/png";
        if (VECTOR_IMAGE_EXTS.has(originalExt)) {
          console.log(`[media] Using ${originalExt} for ${baseName} (no web alternative found)`);
        }
        return `data:${mime};base64,${buf}`;
      }

      const buf = await imgFile.async("base64");
      const mime = mimeMap[bestExt] || "image/png";
      if (bestExt !== originalExt) {
        console.log(`[media] Upgraded ${baseName}: ${originalExt} → ${bestExt}`);
      }
      return `data:${mime};base64,${buf}`;
    } catch {
      return null;
    }
  }

  // Iterate over paragraphs
  const pRegex = /<w:p[^/]*?>([\s\S]*?)<\/w:p>/g;
  let pMatch;
  let pIdx = 0;
  while ((pMatch = pRegex.exec(docXml)) !== null) {
    const content = pMatch[1];
    const hasMcAlternate = content.includes("<mc:AlternateContent");
    const hasWPict = content.includes("<w:pict");
    const hasDrawing = content.includes("<w:drawing");
    const hasObject = content.includes("<w:object");

    if (hasMcAlternate || hasWPict || hasDrawing || hasObject) {
      const rIds = extractDrawingImageRids(content);
      const images: string[] = [];
      const seenBases = new Set<string>(); // avoid duplicates from Choice+Fallback

      for (const rId of rIds) {
        const target = relsMap[rId];
        if (!target) continue;
        // Skip non-image targets (OLE binaries in embeddings/, etc.)
        if (!target.includes("media/")) continue;
        const baseName = target.replace(/.*\//, "").replace(/\.[^.]+$/, "");
        if (seenBases.has(baseName)) continue; // skip duplicate references to same image
        seenBases.add(baseName);

        const dataUri = await resolveImage(rId);
        if (dataUri) images.push(dataUri);
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

  // Images before first Question are section images (handled separately)
  // Don't assign them to Q1 to avoid duplication
  for (let i = 1; i < parts.length; i++) {
    result.push(extractImgs(parts[i]));
  }
  return result;
}

/**
 * Format 3 : "Question" bold + list items with green highlight for correct answers
 * Parses raw DOCX XML to detect w:highlight val="green"
 * Uses mammoth HTML for image extraction
 */
async function parseXmlHighlightFormat(docXml: string, html?: string, drawingImages?: Map<number, string[]>, pageImages?: Buffer[]): Promise<{ questions: ParsedQuestion[]; sections: ParsedSection[] }> {
  const questions: ParsedQuestion[] = [];
  const sections: ParsedSection[] = [];
  const LABELS = ["A", "B", "C", "D", "E"];

  // Extract paragraphs with text, bold, highlight, numId (Word list), and PAGE NUMBER
  type Para = { text: string; bold: boolean; highlighted: string | null; numId: string | null; xmlIdx: number; page: number };
  const paras: Para[] = [];
  const pRegex = /<w:p[^/]*?>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  let xmlParaCounter = 0;
  let currentPage = 0;
  while ((m = pRegex.exec(docXml)) !== null) {
    const content = m[1];
    if (content.includes('w:type="page"') || content.includes("lastRenderedPageBreak")) {
      currentPage++;
    }
    const highlightMatch = content.match(/w:highlight w:val="([^"]+)"/);
    const isBold = content.includes("<w:b/>") || content.includes("<w:b ");
    const numIdMatch = content.match(/w:numId w:val="(\d+)"/);
    const text = extractParagraphText(content);
    if (text.length > 0) {
      paras.push({ text, bold: isBold, highlighted: highlightMatch?.[1] ?? null, numId: numIdMatch?.[1] ?? null, xmlIdx: xmlParaCounter, page: currentPage });
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
  // Uses Word list numbering (numId) when available to reliably separate
  // option items from question text and section intros.
  for (let qi = 0; qi < qMarkers.length; qi++) {
    const start = qMarkers[qi] + 1;
    const end = qi + 1 < qMarkers.length ? qMarkers[qi + 1] : paras.length;

    // Collect non-bold, non-empty paragraphs
    const items: Para[] = [];
    for (let j = start; j < end; j++) {
      if (paras[j].bold) continue;
      if (paras[j].text.trim().length < 2) continue;
      items.push(paras[j]);
    }

    if (items.length < 2) continue;

    // Strategy: use numId to identify option items when available.
    // Options are typically consecutive paragraphs sharing the same numId.
    // Find the dominant numId among the items (the one with 3-5 consecutive uses).
    const numIdCounts = new Map<string, number>();
    for (const it of items) {
      if (it.numId) numIdCounts.set(it.numId, (numIdCounts.get(it.numId) || 0) + 1);
    }

    let optionNumId: string | null = null;
    for (const [nid, count] of numIdCounts) {
      if (count >= 3 && count <= 6) { // options are typically 4-5 items with same numId
        if (!optionNumId || count > (numIdCounts.get(optionNumId) || 0)) {
          optionNumId = nid;
        }
      }
    }

    let questionText: string;
    let optionItems: Para[];

    if (optionNumId) {
      // Split items by numId: items with optionNumId are options, rest is question text
      const textParts: string[] = [];
      const opts: Para[] = [];
      for (const it of items) {
        if (it.numId === optionNumId) {
          opts.push(it);
        } else if (opts.length === 0) {
          // Before options → question text
          textParts.push(it.text);
        }
        // After options end → ignore (section intro text that leaked in)
      }
      questionText = textParts.length > 0 ? textParts.join(" ") : `Question ${questions.length + 1}`;
      optionItems = opts;
    } else {
      // Fallback: no numId info → use the old heuristic (last 5 = options)
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
    }

    const options: ParsedOption[] = optionItems.slice(0, 5).map((p, idx) => ({
      label: LABELS[idx],
      text: p.text.trim(),
      is_correct: p.highlighted === "green",
    }));

    if (options.length >= 2) {
      const questionPage = paras[qMarkers[qi]].page;
      questions.push({
        text: questionText,
        options,
        images: [],
        sectionIndex: getSectionIndex(qMarkers[qi]),
        pageIndex: questionPage,
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

  // ── Assign DrawingML/VML images to questions (supplement mammoth images) ──
  if (drawingImages && drawingImages.size > 0) {
    // qMarkers/sectionMarkers use paras[] indices. drawingImages uses raw XML indices.
    // Convert paras[] indices to XML indices using the xmlIdx field.
    for (let qi = 0; qi < qMarkers.length; qi++) {
      if (!questions[qi]) continue;
      const startXml = paras[qMarkers[qi]].xmlIdx;
      const endXml = qi + 1 < qMarkers.length ? paras[qMarkers[qi + 1]].xmlIdx : Infinity;
      const drawingImgs: string[] = [];
      for (const [xmlParaIdx, imgs] of drawingImages) {
        if (xmlParaIdx >= startXml && xmlParaIdx < endXml) {
          drawingImgs.push(...imgs);
        }
      }
      if (drawingImgs.length > 0) {
        // Merge: add DrawingML images not already present from mammoth
        const existing = new Set(questions[qi].images);
        for (const img of drawingImgs) {
          if (!existing.has(img)) {
            questions[qi].images.push(img);
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

  // ── Convert ALL EMF/WMF images to PNG via batch DOCX wrapper ────────────
  // Creates a mini DOCX with one EMF per page, converts via LibreOffice,
  // then trims whitespace with sharp. One API call for all images.
  {
    // Collect all EMF/WMF data URIs from questions + sections
    const emfEntries: { source: "question" | "section"; idx: number; imgIdx: number; dataUri: string }[] = [];

    for (let qi = 0; qi < questions.length; qi++) {
      for (let ii = 0; ii < questions[qi].images.length; ii++) {
        const img = questions[qi].images[ii];
        if (/^data:image\/(x-emf|emf|x-wmf|wmf)/i.test(img)) {
          emfEntries.push({ source: "question", idx: qi, imgIdx: ii, dataUri: img });
        }
      }
    }
    for (let si = 0; si < sections.length; si++) {
      for (let ii = 0; ii < sections[si].images.length; ii++) {
        const img = sections[si].images[ii];
        if (/^data:image\/(x-emf|emf|x-wmf|wmf)/i.test(img)) {
          emfEntries.push({ source: "section", idx: si, imgIdx: ii, dataUri: img });
        }
      }
    }

    if (emfEntries.length > 0) {
      console.log(`[import-serie] Found ${emfEntries.length} EMF/WMF images to convert`);

      // Parse data URIs to buffers
      const imagesToConvert = emfEntries.map(e => {
        const match = e.dataUri.match(/^data:image\/(x-emf|emf|x-wmf|wmf);base64,(.+)$/i);
        if (!match) return { buffer: Buffer.alloc(0), format: "emf" as const };
        const fmt = match[1].replace("x-", "") as "emf" | "wmf";
        return { buffer: Buffer.from(match[2], "base64"), format: fmt };
      });

      // Batch convert: wrap all in one DOCX, convert once, get all PNGs
      const pngBuffers = await convertEmfBatchViaDocx(imagesToConvert);

      // Replace EMF data URIs with PNG data URIs
      let converted = 0;
      for (let i = 0; i < emfEntries.length; i++) {
        const entry = emfEntries[i];
        const pngBuf = pngBuffers[i];
        if (pngBuf && pngBuf.length > 2000) {
          const pngDataUri = `data:image/png;base64,${pngBuf.toString("base64")}`;
          if (entry.source === "question") {
            questions[entry.idx].images[entry.imgIdx] = pngDataUri;
          } else {
            sections[entry.idx].images[entry.imgIdx] = pngDataUri;
          }
          converted++;
        } else {
          // Remove the broken EMF (browsers can't display it)
          if (entry.source === "question") {
            questions[entry.idx].images[entry.imgIdx] = "";
          } else {
            sections[entry.idx].images[entry.imgIdx] = "";
          }
        }
      }

      // Clean up empty entries
      for (const q of questions) q.images = q.images.filter(Boolean);
      for (const s of sections) s.images = s.images.filter(Boolean);

      console.log(`[import-serie] Converted ${converted}/${emfEntries.length} EMF/WMF → PNG`);
    }
  }

  return { questions, sections };
}

/**
 * Try all formats, return whichever finds more questions
 */
async function parseDocx(html: string, docXml?: string, drawingImages?: Map<number, string[]>, pageImages?: Buffer[]): Promise<{ questions: ParsedQuestion[]; sections: ParsedSection[] }> {
  const fromTables = parseTableFormat(html);
  const fromParagraphs = parseParagraphFormat(html);
  const xmlResult = docXml ? await parseXmlHighlightFormat(docXml, html, drawingImages, pageImages) : { questions: [], sections: [] };
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

    // EMF/WMF: convert to PNG via CloudConvert for perfect quality
    if (NON_WEB_FORMATS.has(format)) {
      const converted = await convertDataUriToPng(dataUri);
      if (converted && converted !== dataUri) {
        const pngMatch = converted.match(/^data:image\/png;base64,(.+)$/);
        if (pngMatch) {
          buffer = Buffer.from(pngMatch[1], "base64");
          format = "png";
          base64 = pngMatch[1];
          console.log(`[upload-img] CloudConvert: ${match[1]} → PNG for Q ${questionId}`);
        }
      } else {
        // CloudConvert unavailable — keep EMF for browser-side conversion
        console.log(`[upload-img] Keeping ${format} for Q ${questionId} (no CloudConvert key)`);
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
      // Fallback: return data URI directly (stored in DB instead of Storage)
      return `data:image/${format};base64,${base64}`;
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

    // Exam metadata for cover page
    const examMeta = {
      examTitle: (formData.get("examTitle") as string) || "",
      ueCode: (formData.get("ueCode") as string) || "",
      subjectName: (formData.get("subjectName") as string) || "",
      duration: (formData.get("duration") as string) || "1H30",
      examDate: (formData.get("examDate") as string) || "",
      institution: (formData.get("institution") as string) || "Diploma Santé",
      academicYear: (formData.get("academicYear") as string) || "2025 - 2026",
    };

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

    // Extract ZIP first (needed for both mammoth image upgrade and XML parsing)
    const zip = await JSZip.loadAsync(buffer);
    const mediaCatalog = catalogMediaFiles(zip);

    // Build a lookup: for EMF/WMF files, find if a PNG/JPEG alternative exists
    const imageUpgradeMap = new Map<string, { path: string; mime: string }>();
    for (const [baseName, exts] of mediaCatalog) {
      const hasVector = exts.some(e => VECTOR_IMAGE_EXTS.has(e));
      if (!hasVector) continue;
      const webExt = ["png", "jpg", "jpeg", "gif", "webp"].find(e => exts.includes(e));
      if (webExt) {
        const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
        imageUpgradeMap.set(baseName, { path: `word/media/${baseName}.${webExt}`, mime: mimeMap[webExt] || "image/png" });
      }
    }
    console.log("[import-serie] Media catalog:", mediaCatalog.size, "files,", imageUpgradeMap.size, "upgradable EMF→web");

    // Convertir DOCX → HTML via mammoth (with custom image handler to prefer PNG over EMF)
    const mammothOptions: any = {};
    if (imageUpgradeMap.size > 0) {
      mammothOptions.convertImage = mammoth.images.imgElement((image: any) => {
        return image.read("base64").then(async (base64: string) => {
          const contentType: string = image.contentType || "";
          // If it's an EMF/WMF, check if we have a web alternative
          if (contentType.includes("emf") || contentType.includes("wmf")) {
            // Try to find the corresponding web image in the ZIP
            for (const [baseName, info] of imageUpgradeMap) {
              try {
                const webFile = zip.file(info.path);
                if (webFile) {
                  const webBase64 = await webFile.async("base64");
                  console.log(`[mammoth] Upgraded image: ${baseName} EMF → ${info.mime}`);
                  return { src: `data:${info.mime};base64,${webBase64}` };
                }
              } catch {}
            }
          }
          return { src: `data:${contentType};base64,${base64}` };
        });
      });
    }
    const { value: html } = await mammoth.convertToHtml({ buffer }, mammothOptions);

    // Extract raw XML from DOCX for highlight detection + drawing images
    let docXml: string | undefined;
    let drawingImages: Map<number, string[]> | undefined;
    try {
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

    // Quick check: if serie already has questions, skip expensive CloudConvert (correction mode)
    const { count: existingCount } = await supabase
      .from("series_questions")
      .select("*", { count: "exact", head: true })
      .eq("series_id", serieId);
    const isCorrection = (existingCount ?? 0) > 0;

    // ─── FAST PATH: Correction mode ─────────────────────────────────────────
    // Only parse XML for green highlights, skip mammoth + images + CloudConvert
    if (isCorrection) {
      console.log("[import-serie] Correction mode (fast path): only parsing highlights");
      const xmlFile = zip.file("word/document.xml");
      if (!xmlFile) return NextResponse.json({ error: "document.xml introuvable" }, { status: 422 });
      const docXml = await xmlFile.async("string");

      // Inline fast parsing: extract questions + green highlights only
      const LABELS = ["A", "B", "C", "D", "E"];
      const pRegex = /<w:p[^/]*?>([\s\S]*?)<\/w:p>/g;
      let pm: RegExpExecArray | null;
      const cParas: { text: string; bold: boolean; highlighted: string | null }[] = [];
      while ((pm = pRegex.exec(docXml)) !== null) {
        const content = pm[1];
        const highlightMatch = content.match(/w:highlight w:val="([^"]+)"/);
        const isBold = content.includes("<w:b/>") || content.includes("<w:b ");
        const texts: string[] = [];
        const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let tm;
        while ((tm = tRegex.exec(content)) !== null) texts.push(tm[1]);
        // Also extract math text
        const mtRegex = /<m:t[^>]*>([^<]*)<\/m:t>/g;
        while ((tm = mtRegex.exec(content)) !== null) texts.push(tm[1]);
        const text = texts.join("").trim();
        if (text.length > 0) cParas.push({ text, bold: isBold, highlighted: highlightMatch?.[1] ?? null });
      }

      // Find Question markers
      const cqMarkers: number[] = [];
      for (let j = 0; j < cParas.length; j++) {
        if (cParas[j].bold && /^question$/i.test(cParas[j].text.trim())) cqMarkers.push(j);
      }

      // Extract questions with is_correct from highlights
      type CorrectionQ = { options: { label: string; is_correct: boolean }[] };
      const parsed: CorrectionQ[] = [];
      for (let qi = 0; qi < cqMarkers.length; qi++) {
        const start = cqMarkers[qi] + 1;
        const end = qi + 1 < cqMarkers.length ? cqMarkers[qi + 1] : cParas.length;
        const items = [];
        for (let j = start; j < end; j++) {
          if (cParas[j].bold) continue;
          if (cParas[j].text.trim().length < 2) continue;
          items.push(cParas[j]);
        }
        if (items.length < 2) continue;
        const optionItems = items.length <= 5 ? items : items.slice(Math.max(0, items.length - 5));
        const options = optionItems.slice(0, 5).map((p, idx) => ({
          label: LABELS[idx],
          is_correct: p.highlighted === "green",
        }));
        if (options.length >= 2) parsed.push({ options });
      }

      console.log(`[import-serie] Correction fast parse: ${parsed.length} questions, ${parsed.reduce((s, q) => s + q.options.filter(o => o.is_correct).length, 0)} correct answers`);

      if (parsed.length === 0) {
        return NextResponse.json({ error: "Aucune question trouvée dans la correction." }, { status: 422 });
      }

      // Fetch existing questions
      const { data: sqData } = await supabase
        .from("series_questions")
        .select("question_id, order_index")
        .eq("series_id", serieId)
        .order("order_index");
      const existingIds = (sqData ?? []).map((r: any) => r.question_id).filter(Boolean);

      // Update correct answers on existing questions
      let updated = 0;
      for (let i = 0; i < Math.min(parsed.length, existingIds.length); i++) {
        const p = parsed[i];
        const qId = existingIds[i];

        // Update options is_correct
        for (const opt of p.options) {
          await supabase
            .from("options")
            .update({ is_correct: opt.is_correct })
            .eq("question_id", qId)
            .eq("label", opt.label);
        }
        if (p.options.some(o => o.is_correct)) updated++;
      }

      console.log(`[import-serie] Correction: ${updated}/${existingIds.length} questions updated`);
      return NextResponse.json({
        success: true,
        message: `${updated} questions mises à jour avec les réponses correctes.`,
        questionsUpdated: updated,
        correctAnswersMarked: parsed.reduce((sum, q) => sum + q.options.filter(o => o.is_correct).length, 0),
      });
    }

    // Convert DOCX to PNG pages via CloudConvert (only for initial import, not correction)
    let pageImages: Buffer[] = [];
    if (!isCorrection) {
      try {
        pageImages = await convertDocxToPages(buffer);
      } catch (e: any) {
        console.warn("[import-serie] DOCX→PNG conversion failed (non-critical):", e.message);
      }
    }

    // Parser (essaie les trois formats)
    const { questions: parsed, sections: parsedSections } = await parseDocx(html, docXml, drawingImages, pageImages);
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

      // Store original .docx as-is in Supabase for direct download
      let sujetDocxUrl: string | null = null;
      try {
        const storagePath = `examens/${serieId}/sujet.docx`;
        await supabase.storage.from("cours-pdfs").upload(storagePath, buffer, {
          contentType: "application/pdf", // bucket only allows pdf mime
          upsert: true,
        });
        const { data: urlData } = supabase.storage.from("cours-pdfs").getPublicUrl(storagePath);
        sujetDocxUrl = urlData.publicUrl;
      } catch (e) {
        console.warn("[import-serie] Could not store docx:", e);
      }

      return NextResponse.json({
        success: true,
        message: `${created} question${created > 1 ? "s" : ""} importée${created > 1 ? "s" : ""} et ajoutée${created > 1 ? "s" : ""} à la série.`,
        sujetDocxUrl,
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
