import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFFont,
  PDFPage,
  PDFImage,
} from "pdf-lib";
import * as path from "path";
import { promises as fs } from "fs";
import sharp from "sharp";

export const maxDuration = 60;

// ─── Constants ───────────────────────────────────────────────────────────────

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = A4_WIDTH - 2 * MARGIN;

const NAVY = rgb(0x0e / 255, 0x1e / 255, 0x35 / 255);
const GOLD = rgb(0xc9 / 255, 0xa8 / 255, 0x4c / 255);
const DARK_GRAY = rgb(0.25, 0.25, 0.25);
const MEDIUM_GRAY = rgb(0.5, 0.5, 0.5);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

// Sub/sup ratio
const SS_RATIO = 0.65;
const SUP_DY_RATIO = 0.35;
const SUB_DY_RATIO = -0.12;

// ─── Types ───────────────────────────────────────────────────────────────────

type Option = { label: string; text: string; is_correct: boolean; order_index: number };
type Question = { id: string; text: string; image_url: string | null; options: Option[] };
type Section = { id: string; title: string; intro_text: string | null; image_url: string | null; order_index: number };

interface ExamInput {
  serieId: string;
  institution: string;
  academicYear: string;
  examTitle: string;
  ueCode: string;
  subjectName: string;
  duration: string;
  examDate: string;
}

// ─── Rich text segment ──────────────────────────────────────────────────────

type Seg = { text: string; style: "n" | "sup" | "sub"; sym: boolean };

// Unicode superscript → ASCII
const SUP_MAP: Record<string, string> = {
  "\u2070": "0", "\u00B9": "1", "\u00B2": "2", "\u00B3": "3",
  "\u2074": "4", "\u2075": "5", "\u2076": "6", "\u2077": "7",
  "\u2078": "8", "\u2079": "9", "\u207A": "+", "\u207B": "-",
  "\u207C": "=", "\u207D": "(", "\u207E": ")", "\u207F": "n", "\u2071": "i",
};

// Unicode subscript → ASCII
const SUB_MAP: Record<string, string> = {
  "\u2080": "0", "\u2081": "1", "\u2082": "2", "\u2083": "3",
  "\u2084": "4", "\u2085": "5", "\u2086": "6", "\u2087": "7",
  "\u2088": "8", "\u2089": "9", "\u208A": "+", "\u208B": "-",
  "\u208C": "=", "\u208D": "(", "\u208E": ")",
  "\u2090": "a", "\u2091": "e", "\u2095": "h", "\u2096": "k",
  "\u2097": "l", "\u2098": "m", "\u2099": "n", "\u2092": "o",
  "\u209A": "p", "\u209B": "s", "\u209C": "t", "\u2093": "x",
};

// Unicode Greek → WinAnsi-safe full name in italic (sym=true → use oblique font)
// Full names avoid ambiguity (e.g. π≠p, σ≠s)
const GREEK_SYM: Record<string, string> = {
  "\u03B1": "alpha", "\u03B2": "beta", "\u03B3": "gamma", "\u03B4": "delta",
  "\u03B5": "epsilon", "\u03B6": "zeta", "\u03B7": "eta", "\u03B8": "theta",
  "\u03B9": "iota", "\u03BA": "kappa", "\u03BB": "lambda", "\u03BC": "mu",
  "\u03BD": "nu", "\u03BE": "xi", "\u03C0": "pi", "\u03C1": "rho",
  "\u03C3": "sigma", "\u03C4": "tau", "\u03C5": "upsilon", "\u03C6": "phi",
  "\u03C7": "chi", "\u03C8": "psi", "\u03C9": "omega",
  "\u0391": "A", "\u0392": "B", "\u0393": "Gamma", "\u0394": "Delta",
  "\u0398": "Theta", "\u039B": "Lambda", "\u03A0": "Pi", "\u03A3": "Sigma",
  "\u03A6": "Phi", "\u03A8": "Psi", "\u03A9": "Omega",
};

// ─── prepareText: clean HTML/smart quotes/LaTeX commands, preserve sub/sup/Greek ─

function prepareText(raw: string): string {
  let s = raw;

  // Smart quotes → ASCII
  s = s.replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'");
  s = s.replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"');
  s = s.replace(/\u2026/g, "...");
  s = s.replace(/\u2014/g, " - ");
  s = s.replace(/\u2013/g, "-");
  s = s.replace(/\u00A0/g, " ");

  // HTML entities & tags
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  s = s.replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'").replace(/&rdquo;/g, '"').replace(/&ldquo;/g, '"');
  s = s.replace(/&#?\w+;/g, "");
  s = s.replace(/<[^>]+>/g, "");

  // Markdown bold/italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");

  // LaTeX: process $...$ blocks and standalone commands
  s = s.replace(/\$\$?([^$]+)\$\$?/g, (_m, inner) => processLatex(inner));
  s = processLatex(s);

  // Collapse spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Process LaTeX commands, converting to Unicode Greek + keeping ^{}/_{} for segments */
function processLatex(s: string): string {
  // \left / \right
  s = s.replace(/\\left\s?[.(|{\\]/g, "(");
  s = s.replace(/\\left\s?\[/g, "[");
  s = s.replace(/\\right\s?[.)|}\\]/g, ")");
  s = s.replace(/\\right\s?\]/g, "]");
  s = s.replace(/\\left/g, "").replace(/\\right/g, "");

  // \text{...}, \mathrm{...}, etc. → content
  s = s.replace(/\\(?:text|mathrm|textbf|textit|emph|operatorname)\{([^}]*)\}/g, "$1");
  s = s.replace(/\\(?:overline|underline|vec|hat|bar|tilde|widetilde|widehat)\{([^}]*)\}/g, "$1");

  // \frac{a}{b} → a/b
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2");
  // \sqrt{x} → sqrt(x)
  s = s.replace(/\\sqrt\{([^}]*)\}/g, "\u221A($1)");

  // LaTeX symbols
  s = s.replace(/\\cdot/g, "\u00B7");
  s = s.replace(/\\times/g, "\u00D7");
  s = s.replace(/\\pm/g, "\u00B1");
  s = s.replace(/\\neq/g, "\u2260");
  s = s.replace(/\\leq/g, "\u2264");
  s = s.replace(/\\geq/g, "\u2265");
  s = s.replace(/\\approx/g, "\u2248");
  s = s.replace(/\\infty/g, "\u221E");

  // LaTeX Greek → Unicode Greek (rendered in italic via oblique font)
  s = s.replace(/\\alpha/g, "\u03B1");
  s = s.replace(/\\beta/g, "\u03B2");
  s = s.replace(/\\gamma/g, "\u03B3");
  s = s.replace(/\\delta/g, "\u03B4");
  s = s.replace(/\\epsilon/g, "\u03B5");
  s = s.replace(/\\zeta/g, "\u03B6");
  s = s.replace(/\\eta/g, "\u03B7");
  s = s.replace(/\\theta/g, "\u03B8");
  s = s.replace(/\\iota/g, "\u03B9");
  s = s.replace(/\\kappa/g, "\u03BA");
  s = s.replace(/\\lambda/g, "\u03BB");
  s = s.replace(/\\mu/g, "\u03BC");
  s = s.replace(/\\nu/g, "\u03BD");
  s = s.replace(/\\xi/g, "\u03BE");
  s = s.replace(/\\pi/g, "\u03C0");
  s = s.replace(/\\rho/g, "\u03C1");
  s = s.replace(/\\sigma/g, "\u03C3");
  s = s.replace(/\\tau/g, "\u03C4");
  s = s.replace(/\\upsilon/g, "\u03C5");
  s = s.replace(/\\phi/g, "\u03C6");
  s = s.replace(/\\chi/g, "\u03C7");
  s = s.replace(/\\psi/g, "\u03C8");
  s = s.replace(/\\omega/g, "\u03C9");
  s = s.replace(/\\Delta/g, "\u0394");
  s = s.replace(/\\Sigma/g, "\u03A3");
  s = s.replace(/\\Omega/g, "\u03A9");
  s = s.replace(/\\Pi/g, "\u03A0");
  s = s.replace(/\\Phi/g, "\u03A6");
  s = s.replace(/\\Gamma/g, "\u0393");
  s = s.replace(/\\Lambda/g, "\u039B");
  s = s.replace(/\\Theta/g, "\u0398");

  // Strip remaining \commands
  s = s.replace(/\\[a-zA-Z]+/g, "");

  // Remove orphan braces (NOT part of ^{} or _{})
  s = s.replace(/(?<![_^])\{([^}]*)\}/g, "$1");

  return s;
}

// ─── parseToSegments: text → array of rich text segments ─────────────────────

function parseToSegments(text: string): Seg[] {
  const segs: Seg[] = [];
  let buf = "";
  let bufSym = false;

  const flush = () => {
    if (buf) segs.push({ text: buf, style: "n", sym: bufSym });
    buf = "";
    bufSym = false;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // Unicode superscript char
    if (ch in SUP_MAP) {
      flush();
      let supText = SUP_MAP[ch];
      i++;
      while (i < text.length && text[i] in SUP_MAP) {
        supText += SUP_MAP[text[i]];
        i++;
      }
      segs.push({ text: supText, style: "sup", sym: false });
      continue;
    }

    // Unicode subscript char
    if (ch in SUB_MAP) {
      flush();
      let subText = SUB_MAP[ch];
      i++;
      while (i < text.length && text[i] in SUB_MAP) {
        subText += SUB_MAP[text[i]];
        i++;
      }
      segs.push({ text: subText, style: "sub", sym: false });
      continue;
    }

    // Greek char → italic font
    if (ch in GREEK_SYM) {
      flush();
      segs.push({ text: GREEK_SYM[ch], style: "n", sym: true });
      i++;
      continue;
    }

    // ^{...} superscript block
    if (ch === "^" && i + 1 < text.length && text[i + 1] === "{") {
      flush();
      const close = text.indexOf("}", i + 2);
      if (close !== -1) {
        const inner = text.substring(i + 2, close);
        if (inner.length > 0) segs.push({ text: inner, style: "sup", sym: false });
        i = close + 1;
        continue;
      }
    }

    // _{...} subscript block
    if (ch === "_" && i + 1 < text.length && text[i + 1] === "{") {
      flush();
      const close = text.indexOf("}", i + 2);
      if (close !== -1) {
        const inner = text.substring(i + 2, close);
        if (inner.length > 0) segs.push({ text: inner, style: "sub", sym: false });
        i = close + 1;
        continue;
      }
    }

    // ^x single-char superscript (not space, not {)
    if (ch === "^" && i + 1 < text.length && text[i + 1] !== " " && text[i + 1] !== "{") {
      flush();
      segs.push({ text: text[i + 1], style: "sup", sym: false });
      i += 2;
      continue;
    }

    // _x single-char subscript (not space, not {, not _)
    if (ch === "_" && i + 1 < text.length && text[i + 1] !== " " && text[i + 1] !== "{" && text[i + 1] !== "_") {
      flush();
      segs.push({ text: text[i + 1], style: "sub", sym: false });
      i += 2;
      continue;
    }

    // Normal char — accumulate, but switch buffer if sym changes
    const isSym = false;
    if (bufSym !== isSym && buf) flush();
    bufSym = isSym;
    buf += ch;
    i++;
  }

  flush();

  // Strip non-WinAnsi from normal (non-symbol) segment text
  for (const seg of segs) {
    if (!seg.sym) {
      seg.text = seg.text
        .replace(/\u221A/g, "V") // √ → V (best WinAnsi approx)
        .replace(/\u221E/g, "inf")
        .replace(/\u2248/g, "~")
        .replace(/\u2260/g, "!=")
        .replace(/\u2264/g, "<=")
        .replace(/\u2265/g, ">=")
        .replace(/\u2192/g, "->")
        .replace(/\u2190/g, "<-")
        .replace(/\u2194/g, "<->")
        .replace(/[^\x00-\xFF]/g, "");
    }
  }

  // Remove empty segments
  const result = segs.filter((s) => s.text.length > 0);

  // Auto-insert space between sub/sup and following normal text starting with a letter
  // Fixes cases like "n=2et" → "n=2 et" where DB text is missing spacing after subscripts
  for (let j = result.length - 1; j > 0; j--) {
    const prev = result[j - 1];
    const curr = result[j];
    if (
      (prev.style === "sup" || prev.style === "sub") &&
      curr.style === "n" &&
      !curr.sym &&
      curr.text.length > 0 &&
      /^[a-zA-Z]/.test(curr.text)
    ) {
      curr.text = " " + curr.text;
    }
  }

  return result;
}

// ─── Segment measurement ────────────────────────────────────────────────────

function segWidth(seg: Seg, font: PDFFont, italicFont: PDFFont, fontSize: number): number {
  const f = seg.sym ? italicFont : font;
  const sz = seg.style === "n" ? fontSize : fontSize * SS_RATIO;
  return f.widthOfTextAtSize(seg.text, sz);
}

// ─── Rich text word-wrap ────────────────────────────────────────────────────

function wrapRichText(
  text: string,
  font: PDFFont,
  italicFont: PDFFont,
  fontSize: number,
  maxWidth: number
): Seg[][] {
  const allSegs = parseToSegments(text);
  if (allSegs.length === 0) return [];

  // Split segments into "words" at space boundaries
  // A word is a group of segments between spaces
  type Word = { segs: Seg[]; width: number };
  const words: Word[] = [];
  let currentWordSegs: Seg[] = [];
  let currentWordW = 0;

  const flushWord = () => {
    if (currentWordSegs.length > 0) {
      words.push({ segs: [...currentWordSegs], width: currentWordW });
      currentWordSegs = [];
      currentWordW = 0;
    }
  };

  for (const seg of allSegs) {
    if (seg.style !== "n" || seg.sym) {
      // Sub/sup/Greek segments are always part of current word (no spaces inside)
      currentWordSegs.push(seg);
      currentWordW += segWidth(seg, font, italicFont, fontSize);
      continue;
    }

    // Normal segment — split on spaces
    const parts = seg.text.split(" ");
    for (let pi = 0; pi < parts.length; pi++) {
      if (pi > 0) flushWord(); // space boundary = new word
      if (parts[pi].length > 0) {
        const partSeg: Seg = { text: parts[pi], style: "n", sym: false };
        currentWordSegs.push(partSeg);
        currentWordW += segWidth(partSeg, font, italicFont, fontSize);
      }
    }
  }
  flushWord();

  if (words.length === 0) return [];

  // Build lines from words
  const spaceW = font.widthOfTextAtSize(" ", fontSize);
  const lines: Seg[][] = [];
  let lineSegs: Seg[] = [];
  let lineW = 0;

  for (const word of words) {
    const needed = lineSegs.length > 0 ? spaceW + word.width : word.width;
    if (lineW + needed > maxWidth && lineSegs.length > 0) {
      lines.push(lineSegs);
      lineSegs = [...word.segs];
      lineW = word.width;
    } else {
      if (lineSegs.length > 0) {
        lineSegs.push({ text: " ", style: "n", sym: false });
        lineW += spaceW;
      }
      lineSegs.push(...word.segs);
      lineW += word.width;
    }
  }
  if (lineSegs.length > 0) lines.push(lineSegs);

  return lines;
}

// ─── Draw one line of rich text segments ────────────────────────────────────

function drawRichLine(
  page: PDFPage,
  segs: Seg[],
  x: number,
  y: number,
  font: PDFFont,
  italicFont: PDFFont,
  fontSize: number,
  color: ReturnType<typeof rgb>
): number {
  let cx = x;
  const ssFontSize = fontSize * SS_RATIO;

  for (const seg of segs) {
    const f = seg.sym ? italicFont : font;
    let sz = fontSize;
    let dy = 0;

    if (seg.style === "sup") {
      sz = ssFontSize;
      dy = fontSize * SUP_DY_RATIO;
    } else if (seg.style === "sub") {
      sz = ssFontSize;
      dy = fontSize * SUB_DY_RATIO;
    }

    page.drawText(seg.text, { x: cx, y: y + dy, size: sz, font: f, color });
    cx += f.widthOfTextAtSize(seg.text, sz);
  }

  return cx - x;
}

// ─── cleanText (for cover page plain text only) ─────────────────────────────

function cleanText(text: string): string {
  let s = text;
  s = s.replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'");
  s = s.replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"');
  s = s.replace(/\u2026/g, "...").replace(/\u2014/g, " - ").replace(/\u2013/g, "-").replace(/\u00A0/g, " ");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  s = s.replace(/&#?\w+;/g, "").replace(/<[^>]+>/g, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/[^\x00-\xFF]/g, "").replace(/\s+/g, " ").trim();
  return s;
}

// ─── Plain word-wrap (for cover page) ───────────────────────────────────────

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") { lines.push(""); continue; }
    const words = paragraph.split(/\s+/);
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

// ─── PDF Drawing Context ─────────────────────────────────────────────────────

class PdfWriter {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  fontOblique: PDFFont;
  pageNumber: number;

  constructor(doc: PDFDocument, fontRegular: PDFFont, fontBold: PDFFont, fontOblique: PDFFont) {
    this.doc = doc;
    this.fontRegular = fontRegular;
    this.fontBold = fontBold;
    this.fontOblique = fontOblique;
    this.page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN;
    this.pageNumber = 1;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN + 30) this.newPage();
  }

  newPage() {
    this.drawFooter();
    this.page = this.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.pageNumber++;
    this.y = A4_HEIGHT - MARGIN;
  }

  drawFooter() {
    const text = `${this.pageNumber}`;
    const w = this.fontRegular.widthOfTextAtSize(text, 9);
    this.page.drawText(text, { x: A4_WIDTH / 2 - w / 2, y: 25, size: 9, font: this.fontRegular, color: MEDIUM_GRAY });
  }

  /** Draw plain text (for cover page) */
  drawText(
    text: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number; lineHeight?: number } = {}
  ): number {
    const font = options.font ?? this.fontRegular;
    const size = options.size ?? 10;
    const color = options.color ?? BLACK;
    const x = options.x ?? MARGIN;
    const maxWidth = options.maxWidth ?? CONTENT_WIDTH;
    const lineHeight = options.lineHeight ?? size * 1.4;
    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.page.drawText(line, { x, y: this.y, size, font, color });
      this.y -= lineHeight;
    }
    return lines.length;
  }

  drawCenteredText(
    text: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}
  ) {
    const font = options.font ?? this.fontRegular;
    const size = options.size ?? 10;
    const color = options.color ?? BLACK;
    const maxWidth = options.maxWidth ?? CONTENT_WIDTH;
    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      const w = font.widthOfTextAtSize(line, size);
      this.ensureSpace(size * 1.5);
      this.page.drawText(line, { x: A4_WIDTH / 2 - w / 2, y: this.y, size, font, color });
      this.y -= size * 1.5;
    }
  }

  /** Draw rich text with proper subscript/superscript/Greek rendering */
  drawRich(
    rawText: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number; lineHeight?: number } = {}
  ): number {
    const font = options.font ?? this.fontRegular;
    const size = options.size ?? 10;
    const color = options.color ?? BLACK;
    const x = options.x ?? MARGIN;
    const maxWidth = options.maxWidth ?? CONTENT_WIDTH;
    const lineHeight = options.lineHeight ?? size * 1.5;

    const prepared = prepareText(rawText);
    const lines = wrapRichText(prepared, font, this.fontOblique, size, maxWidth);

    for (const lineSegs of lines) {
      this.ensureSpace(lineHeight);
      drawRichLine(this.page, lineSegs, x, this.y, font, this.fontOblique, size, color);
      this.y -= lineHeight;
    }
    return lines.length;
  }
}

// ─── Logo loader ────────────────────────────────────────────────────────────

async function loadLogoPng(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const logoPath = path.join(process.cwd(), "public", "ds-logo-2026.png");
    const logoBytes = await fs.readFile(logoPath);
    return await doc.embedPng(logoBytes);
  } catch (e) {
    console.warn("[generate-exam-pdf] Could not load logo:", e);
    return null;
  }
}

// ─── Cover Page ──────────────────────────────────────────────────────────────

function drawCoverPage(w: PdfWriter, input: ExamInput, totalQuestions: number, logo: PDFImage | null) {
  const page = w.page;

  // Header bar
  const headerHeight = 52;
  page.drawRectangle({ x: 0, y: A4_HEIGHT - headerHeight, width: A4_WIDTH, height: headerHeight, color: NAVY });

  if (logo) {
    const logoMaxH = 34;
    const logoScale = logoMaxH / logo.height;
    const logoW = logo.width * logoScale;
    const logoH = logo.height * logoScale;
    page.drawImage(logo, { x: MARGIN, y: A4_HEIGHT - headerHeight + (headerHeight - logoH) / 2, width: logoW, height: logoH });
  } else {
    page.drawText("DIPLOMA SANTE", { x: MARGIN, y: A4_HEIGHT - 36, size: 14, font: w.fontBold, color: WHITE });
  }

  const yearW = w.fontRegular.widthOfTextAtSize(input.academicYear, 12);
  page.drawText(input.academicYear, { x: A4_WIDTH - MARGIN - yearW, y: A4_HEIGHT - 34, size: 12, font: w.fontRegular, color: GOLD });

  // Title area
  let ty = A4_HEIGHT - 180;
  const titleMaxWidth = CONTENT_WIDTH - 40;
  const titleSize = 22;
  const titleLines = wrapText(input.examTitle, w.fontBold, titleSize, titleMaxWidth);
  for (const line of titleLines) {
    const lw = w.fontBold.widthOfTextAtSize(line, titleSize);
    page.drawText(line, { x: A4_WIDTH / 2 - lw / 2, y: ty, size: titleSize, font: w.fontBold, color: NAVY });
    ty -= titleSize * 1.4;
  }
  ty -= 10;

  // Gold line
  const lineLen = 180;
  page.drawLine({ start: { x: A4_WIDTH / 2 - lineLen / 2, y: ty }, end: { x: A4_WIDTH / 2 + lineLen / 2, y: ty }, thickness: 2, color: GOLD });
  ty -= 30;

  // UE - Subject
  const ueSubject = `${input.ueCode} - ${input.subjectName}`;
  const ueW = w.fontBold.widthOfTextAtSize(ueSubject, 16);
  page.drawText(ueSubject, { x: A4_WIDTH / 2 - ueW / 2, y: ty, size: 16, font: w.fontBold, color: NAVY });
  ty -= 35;

  // SUJET
  const sujetW = w.fontBold.widthOfTextAtSize("SUJET", 20);
  page.drawText("SUJET", { x: A4_WIDTH / 2 - sujetW / 2, y: ty, size: 20, font: w.fontBold, color: GOLD });
  ty -= 28;

  // Duration & date
  const durText = `Dur\u00E9e de l'\u00E9preuve : ${input.duration}`;
  const durW = w.fontRegular.widthOfTextAtSize(durText, 11);
  page.drawText(durText, { x: A4_WIDTH / 2 - durW / 2, y: ty, size: 11, font: w.fontRegular, color: DARK_GRAY });
  ty -= 20;
  const dateW = w.fontRegular.widthOfTextAtSize(input.examDate, 11);
  page.drawText(input.examDate, { x: A4_WIDTH / 2 - dateW / 2, y: ty, size: 11, font: w.fontRegular, color: DARK_GRAY });
  ty -= 50;

  // Instructions box
  const boxTop = ty;
  const boxHeight = 185;
  page.drawRectangle({ x: MARGIN, y: boxTop - boxHeight, width: CONTENT_WIDTH, height: boxHeight, borderColor: NAVY, borderWidth: 1, color: WHITE });

  let iy = boxTop - 18;
  const ixLeft = MARGIN + 15;
  const instrTitle = "A LIRE AVANT DE COMMENCER L'\u00C9PREUVE";
  const instrTitleW = w.fontBold.widthOfTextAtSize(instrTitle, 10);
  page.drawText(instrTitle, { x: A4_WIDTH / 2 - instrTitleW / 2, y: iy, size: 10, font: w.fontBold, color: NAVY });
  iy -= 20;

  const instructions = [
    "V\u00E9rifier que les informations saisies sur les GRILLES sont correctes (nom, pr\u00E9nom, num\u00E9ro d'\u00E9tudiant).",
    "Les correcteurs liquides et les stylos effa\u00E7ables sont interdits.",
    "Seules les r\u00E9ponses port\u00E9es sur la GRILLE DE R\u00C9PONSES seront prises en compte.",
    "L'utilisation de tout appareil \u00E9lectronique est formellement interdite (t\u00E9l\u00E9phone, montre connect\u00E9e, calculatrice non autoris\u00E9e).",
    "Tout document non autoris\u00E9 sera consid\u00E9r\u00E9 comme une tentative de fraude.",
  ];
  for (const instr of instructions) {
    const bullet = `- ${instr}`;
    const lines = wrapText(bullet, w.fontRegular, 8.5, CONTENT_WIDTH - 40);
    for (const line of lines) {
      page.drawText(line, { x: ixLeft, y: iy, size: 8.5, font: w.fontRegular, color: DARK_GRAY });
      iy -= 12;
    }
    iy -= 2;
  }

  // Regulatory section
  let ry = boxTop - boxHeight - 25;
  const regTitle = "INFORMATIONS R\u00C9GLEMENTAIRES";
  const regTitleW = w.fontBold.widthOfTextAtSize(regTitle, 10);
  page.drawText(regTitle, { x: A4_WIDTH / 2 - regTitleW / 2, y: ry, size: 10, font: w.fontBold, color: NAVY });
  ry -= 18;

  const regulations = [
    "Les questions sans r\u00E9ponse seront consid\u00E9r\u00E9es comme nulles.",
    "Les questions \u00E0 choix multiples peuvent comporter une ou plusieurs r\u00E9ponses exactes.",
    "Aucune r\u00E9clamation ne sera accept\u00E9e apr\u00E8s la fin de l'\u00E9preuve concernant le sujet.",
  ];
  for (const reg of regulations) {
    const bullet = `- ${reg}`;
    const lines = wrapText(bullet, w.fontRegular, 8.5, CONTENT_WIDTH - 20);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 10, y: ry, size: 8.5, font: w.fontRegular, color: DARK_GRAY });
      ry -= 12;
    }
    ry -= 2;
  }

  // Exam info at bottom
  ry -= 20;
  page.drawLine({ start: { x: MARGIN + 60, y: ry + 10 }, end: { x: A4_WIDTH - MARGIN - 60, y: ry + 10 }, thickness: 1.5, color: GOLD });
  const examInfo = `L'\u00E9preuve comporte ${totalQuestions} question${totalQuestions > 1 ? "s" : ""} num\u00E9rot\u00E9e${totalQuestions > 1 ? "s" : ""} de 1 \u00E0 ${totalQuestions}.`;
  const examInfoW = w.fontBold.widthOfTextAtSize(examInfo, 10);
  page.drawText(examInfo, { x: A4_WIDTH / 2 - examInfoW / 2, y: ry - 10, size: 10, font: w.fontBold, color: NAVY });

  w.drawFooter();
}

// ─── Fetch image bytes ───────────────────────────────────────────────────────

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; type: "png" | "jpg" } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) { console.warn("[pdf] Image fetch failed:", res.status, url.substring(0, 80)); return null; }
    const contentType = res.headers.get("content-type") ?? "";
    const buffer = await res.arrayBuffer();
    const rawBytes = new Uint8Array(buffer);
    if (rawBytes.length < 100) return null;

    const urlLower = url.toLowerCase();
    const isPng = contentType.includes("png") || urlLower.endsWith(".png");
    const isJpg = contentType.includes("jpeg") || contentType.includes("jpg") || urlLower.endsWith(".jpg") || urlLower.endsWith(".jpeg");

    if (isPng) return { bytes: rawBytes, type: "png" };
    if (isJpg) return { bytes: rawBytes, type: "jpg" };

    // Convert other formats to PNG via sharp
    try {
      const pngBuffer = await sharp(Buffer.from(rawBytes)).png().toBuffer();
      return { bytes: new Uint8Array(pngBuffer), type: "png" };
    } catch {
      return { bytes: rawBytes, type: "jpg" };
    }
  } catch {
    return null;
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: ExamInput = await req.json();
    const { serieId, institution, academicYear, examTitle, ueCode, subjectName, duration, examDate } = body;

    if (!serieId) return NextResponse.json({ error: "serieId est requis" }, { status: 400 });

    const supabase = await createClient();

    // Fetch questions
    const { data: sqData, error: sqError } = await supabase
      .from("series_questions")
      .select("order_index, section_id, question:questions(id, text, image_url, options(label, text, is_correct, order_index))")
      .eq("series_id", serieId)
      .order("order_index");

    if (sqError) return NextResponse.json({ error: "Erreur DB: " + sqError.message }, { status: 500 });
    if (!sqData || sqData.length === 0) return NextResponse.json({ error: "Aucune question trouvee" }, { status: 404 });

    // Fetch sections
    const { data: sectionsData } = await supabase
      .from("series_sections")
      .select("id, title, intro_text, image_url, order_index")
      .eq("series_id", serieId)
      .order("order_index");

    const sectionsMap = new Map<string, Section>();
    for (const s of sectionsData ?? []) sectionsMap.set(s.id, s as Section);

    const questions: (Question & { sectionId?: string })[] = [];
    for (const sq of sqData) {
      const q = sq.question as unknown as Question;
      if (!q?.id) continue;
      questions.push({
        ...q,
        sectionId: sq.section_id ?? undefined,
        options: (q.options ?? []).sort((a: Option, b: Option) => a.order_index - b.order_index),
      });
    }

    // Create PDF
    const doc = await PDFDocument.create();
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);
    const w = new PdfWriter(doc, fontRegular, fontBold, fontOblique);
    const logo = await loadLogoPng(doc);

    drawCoverPage(w, { serieId, institution, academicYear, examTitle, ueCode, subjectName, duration, examDate }, questions.length, logo);

    // Start questions on new page
    w.newPage();

    const drawQuestionPageHeader = (writer: PdfWriter) => {
      const headerText = `${ueCode} - ${subjectName}`;
      const hw = writer.fontRegular.widthOfTextAtSize(headerText, 9);
      writer.page.drawText(headerText, { x: A4_WIDTH - MARGIN - hw, y: A4_HEIGHT - MARGIN + 15, size: 9, font: writer.fontRegular, color: MEDIUM_GRAY });
      writer.page.drawLine({ start: { x: MARGIN, y: A4_HEIGHT - MARGIN + 8 }, end: { x: A4_WIDTH - MARGIN, y: A4_HEIGHT - MARGIN + 8 }, thickness: 0.5, color: LIGHT_GRAY });
    };

    drawQuestionPageHeader(w);
    const originalNewPage = w.newPage.bind(w);
    w.newPage = () => { originalNewPage(); drawQuestionPageHeader(w); };

    // Image cache
    const imageCache = new Map<string, PDFImage>();
    const getEmbeddedImage = async (url: string): Promise<PDFImage | null> => {
      if (imageCache.has(url)) return imageCache.get(url)!;
      try {
        const imgData = await fetchImageBytes(url);
        if (!imgData) return null;
        let embedded: PDFImage;
        try {
          embedded = imgData.type === "png" ? await doc.embedPng(imgData.bytes) : await doc.embedJpg(imgData.bytes);
        } catch {
          try {
            embedded = imgData.type === "png" ? await doc.embedJpg(imgData.bytes) : await doc.embedPng(imgData.bytes);
          } catch { return null; }
        }
        imageCache.set(url, embedded);
        return embedded;
      } catch { return null; }
    };

    // ── Draw questions
    let lastSectionId: string | undefined;

    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const qNum = idx + 1;

      // Section header
      if (q.sectionId && q.sectionId !== lastSectionId) {
        const section = sectionsMap.get(q.sectionId);
        if (section) {
          w.ensureSpace(80);
          w.y -= 12;

          // Section title bar
          const barHeight = 28;
          w.page.drawRectangle({ x: MARGIN, y: w.y - 6, width: CONTENT_WIDTH, height: barHeight, color: NAVY });

          // Section title — use prepareText + rich rendering for Greek/sub/sup in title
          const stPrepared = prepareText(section.title);
          const stSegs = parseToSegments(stPrepared);
          // Calculate width for centering
          let stTotalW = 0;
          for (const seg of stSegs) stTotalW += segWidth(seg, w.fontBold, w.fontOblique, 12);
          drawRichLine(w.page, stSegs, A4_WIDTH / 2 - stTotalW / 2, w.y + 3, w.fontBold, w.fontOblique, 12, WHITE);
          w.y -= barHeight + 12;

          // Section intro text (rich)
          if (section.intro_text) {
            w.drawRich(section.intro_text, { font: w.fontOblique, size: 9.5, color: DARK_GRAY, lineHeight: 13 });
            w.y -= 5;
          }

          // Section image
          if (section.image_url) {
            const sImg = await getEmbeddedImage(section.image_url);
            if (sImg) {
              const maxImgWidth = CONTENT_WIDTH * 0.8;
              const maxImgHeight = 200;
              const scale = Math.min(maxImgWidth / sImg.width, maxImgHeight / sImg.height, 1);
              const drawW = sImg.width * scale;
              const drawH = sImg.height * scale;
              w.ensureSpace(drawH + 15);
              w.y -= drawH;
              w.page.drawImage(sImg, { x: A4_WIDTH / 2 - drawW / 2, y: w.y, width: drawW, height: drawH });
              w.y -= 10;
            }
          }
          w.y -= 5;
        }
        lastSectionId = q.sectionId;
      }

      // Thin separator
      if (idx > 0 && !(q.sectionId && q.sectionId !== questions[idx - 1]?.sectionId)) {
        w.ensureSpace(25);
        w.page.drawLine({ start: { x: MARGIN + 20, y: w.y + 5 }, end: { x: A4_WIDTH - MARGIN - 20, y: w.y + 5 }, thickness: 0.4, color: LIGHT_GRAY });
        w.y -= 5;
      }

      w.ensureSpace(90);

      // Question number + rich text
      const prefix = `Question ${qNum}.  `;
      const prefixWidth = w.fontBold.widthOfTextAtSize(prefix, 11);

      // Draw question number
      w.page.drawText(prefix, { x: MARGIN, y: w.y, size: 11, font: w.fontBold, color: NAVY });

      // Draw question text with rich rendering
      const qPrepared = prepareText(q.text);
      const qLines = wrapRichText(qPrepared, w.fontRegular, w.fontOblique, 10, CONTENT_WIDTH - prefixWidth);

      if (qLines.length > 0) {
        drawRichLine(w.page, qLines[0], MARGIN + prefixWidth, w.y, w.fontRegular, w.fontOblique, 10, BLACK);
        w.y -= 15;
        for (let li = 1; li < qLines.length; li++) {
          w.ensureSpace(15);
          drawRichLine(w.page, qLines[li], MARGIN + prefixWidth, w.y, w.fontRegular, w.fontOblique, 10, BLACK);
          w.y -= 15;
        }
      } else {
        w.y -= 15;
      }
      w.y -= 5;

      // Question image
      if (q.image_url) {
        const qImg = await getEmbeddedImage(q.image_url);
        if (qImg) {
          const maxImgWidth = CONTENT_WIDTH * 0.75;
          const maxImgHeight = 250;
          const scale = Math.min(maxImgWidth / qImg.width, maxImgHeight / qImg.height, 1);
          const drawW = qImg.width * scale;
          const drawH = qImg.height * scale;
          w.ensureSpace(drawH + 15);
          w.y -= drawH;
          w.page.drawImage(qImg, { x: A4_WIDTH / 2 - drawW / 2, y: w.y, width: drawW, height: drawH });
          w.y -= 12;
        }
      }

      // Options (rich text, no checkboxes)
      const optionIndent = MARGIN + 20;
      for (const opt of q.options) {
        w.ensureSpace(18);
        const optY = w.y;

        // Bold label
        const labelText = `${opt.label}.`;
        const labelWidth = w.fontBold.widthOfTextAtSize(labelText, 10);
        w.page.drawText(labelText, { x: optionIndent, y: optY, size: 10, font: w.fontBold, color: NAVY });

        // Option text with rich rendering
        const optTextX = optionIndent + labelWidth + 6;
        const optMaxWidth = A4_WIDTH - MARGIN - optTextX;
        const optPrepared = prepareText(opt.text);
        const optLines = wrapRichText(optPrepared, w.fontRegular, w.fontOblique, 10, optMaxWidth);

        if (optLines.length > 0) {
          drawRichLine(w.page, optLines[0], optTextX, optY, w.fontRegular, w.fontOblique, 10, DARK_GRAY);
          w.y -= 15;
          for (let li = 1; li < optLines.length; li++) {
            w.ensureSpace(14);
            drawRichLine(w.page, optLines[li], optTextX, w.y, w.fontRegular, w.fontOblique, 10, DARK_GRAY);
            w.y -= 14;
          }
        } else {
          w.y -= 15;
        }
      }

      w.y -= 10;
    }

    w.drawFooter();

    // Serialize & upload
    const pdfBytes = await doc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("cours-pdfs")
      .upload(`examens/${serieId}/sujet.pdf`, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new NextResponse(pdfBuffer, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="sujet_${serieId}.pdf"` },
      });
    }

    const { data: { publicUrl } } = supabase.storage.from("cours-pdfs").getPublicUrl(`examens/${serieId}/sujet.pdf`);

    return NextResponse.json({ success: true, url: publicUrl, path: uploadData.path, totalQuestions: questions.length });
  } catch (err: unknown) {
    console.error("generate-exam-pdf error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la generation du PDF", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
