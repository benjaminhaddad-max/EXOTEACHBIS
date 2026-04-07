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
// @ts-expect-error — sharp default import works at runtime with Next.js esModuleInterop
import sharp from "sharp";

export const maxDuration = 60;

// ─── Constants ───────────────────────────────────────────────────────────────

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = A4_WIDTH - 2 * MARGIN;

// Charter colors
const NAVY = rgb(0x0e / 255, 0x1e / 255, 0x35 / 255); // #0e1e35
const GOLD = rgb(0xc9 / 255, 0xa8 / 255, 0x4c / 255); // #c9a84c
const DARK_GRAY = rgb(0.25, 0.25, 0.25);
const MEDIUM_GRAY = rgb(0.5, 0.5, 0.5);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

// ─── Types ───────────────────────────────────────────────────────────────────

type Option = {
  label: string;
  text: string;
  is_correct: boolean;
  order_index: number;
};
type Question = {
  id: string;
  text: string;
  image_url: string | null;
  options: Option[];
};
type Section = {
  id: string;
  title: string;
  intro_text: string | null;
  image_url: string | null;
  order_index: number;
};

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

// ─── Text helpers ────────────────────────────────────────────────────────────

/** Strip LaTeX/Markdown/HTML and replace non-WinAnsi chars for PDF plain text */
function cleanText(text: string): string {
  let s = text;

  // ── 1. Smart quotes & typographic chars → ASCII (BEFORE WinAnsi strip)
  s = s
    .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'") // ' ' ‚ ‹ ›
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"') // " " „ « »
    .replace(/\u2026/g, "...") // …
    .replace(/\u2014/g, " - ") // — em dash
    .replace(/\u2013/g, "-") // – en dash
    .replace(/\u00A0/g, " "); // non-breaking space

  // ── 2. HTML entities & tags
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&#?\w+;/g, "") // remaining HTML entities
    .replace(/<[^>]+>/g, ""); // HTML tags

  // ── 3. Markdown bold/italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");

  // ── 4. LaTeX cleanup
  s = s
    // Remove display/inline math delimiters
    .replace(/\$\$?([^$]+)\$\$?/g, (_m, t) => t)
    // \left and \right with delimiters
    .replace(/\\left\s?[.(|{\\]/g, "")
    .replace(/\\left\s?\[/g, "[")
    .replace(/\\right\s?[.)|}\\]/g, "")
    .replace(/\\right\s?\]/g, "]")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    // \text{...}, \mathrm{...}, etc. → content
    .replace(/\\(?:text|mathrm|textbf|textit|emph|operatorname)\{([^}]*)\}/g, "$1")
    .replace(/\\(?:overline|underline|vec|hat|bar|tilde|widetilde|widehat)\{([^}]*)\}/g, "$1")
    // \frac{a}{b} → a/b
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2")
    // \sqrt{x} → sqrt(x)
    .replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)")
    // Named LaTeX symbols → readable text
    .replace(/\\cdot/g, "\u00B7")
    .replace(/\\times/g, "\u00D7")
    .replace(/\\pm/g, "\u00B1")
    .replace(/\\neq/g, "\u2260")
    .replace(/\\leq/g, "\u2264")
    .replace(/\\geq/g, "\u2265")
    .replace(/\\approx/g, "~")
    .replace(/\\infty/g, "inf")
    .replace(/\\Delta/g, "D")
    .replace(/\\alpha/g, "alpha")
    .replace(/\\beta/g, "beta")
    .replace(/\\gamma/g, "gamma")
    .replace(/\\delta/g, "delta")
    .replace(/\\epsilon/g, "epsilon")
    .replace(/\\theta/g, "theta")
    .replace(/\\lambda/g, "lambda")
    .replace(/\\mu/g, "mu")
    .replace(/\\pi/g, "pi")
    .replace(/\\sigma/g, "sigma")
    .replace(/\\omega/g, "omega")
    .replace(/\\phi/g, "phi")
    .replace(/\\chi/g, "chi")
    .replace(/\\psi/g, "psi")
    // Strip any remaining \command sequences
    .replace(/\\[a-zA-Z]+/g, "");

  // ── 5. Superscripts & subscripts: clean braces, keep readable
  s = s
    // Empty ^{} or _{} → remove entirely
    .replace(/\^\{\s*\}/g, "")
    .replace(/_\{\s*\}/g, "")
    // ^{single} → ^single  (e.g. ^{2} → ^2, ^{-} → ^-)
    .replace(/\^\{([^}])\}/g, "^$1")
    // ^{multi} → ^(multi)  (e.g. ^{2+} → ^(2+))
    .replace(/\^\{([^}]+)\}/g, "^($1)")
    // _{single} → content as subscript inline (e.g. _{2} → 2)
    .replace(/_\{([^}])\}/g, "$1")
    // _{multi} → (multi) inline
    .replace(/_\{([^}]+)\}/g, "($1)")
    // Remove stray braces
    .replace(/[{}]/g, "");

  // ── 6. Unicode Greek → Latin (WinAnsi doesn't support Greek)
  const greekMap: Record<string, string> = {
    "\u03B1": "alpha", "\u03B2": "beta", "\u03B3": "gamma", "\u03B4": "delta",
    "\u03B5": "epsilon", "\u03B6": "zeta", "\u03B7": "eta", "\u03B8": "theta",
    "\u03B9": "iota", "\u03BA": "kappa", "\u03BB": "lambda", "\u03BC": "mu",
    "\u03BD": "nu", "\u03BE": "xi", "\u03BF": "o", "\u03C0": "pi",
    "\u03C1": "rho", "\u03C3": "sigma", "\u03C4": "tau", "\u03C5": "upsilon",
    "\u03C6": "phi", "\u03C7": "chi", "\u03C8": "psi", "\u03C9": "omega",
    "\u0391": "A", "\u0392": "B", "\u0393": "G", "\u0394": "D",
    "\u0398": "Th", "\u039B": "L", "\u039C": "M", "\u03A0": "P",
    "\u03A3": "S", "\u03A6": "Ph", "\u03A7": "Ch", "\u03A8": "Ps", "\u03A9": "W",
  };
  for (const [greek, latin] of Object.entries(greekMap)) {
    s = s.split(greek).join(latin);
  }

  // ── 7. Unicode sub/superscript digits → normal digits
  s = s
    .replace(/[₀⁰]/g, "0").replace(/[₁¹]/g, "1").replace(/[₂²]/g, "2")
    .replace(/[₃³]/g, "3").replace(/[₄⁴]/g, "4").replace(/[₅⁵]/g, "5")
    .replace(/[₆]/g, "6").replace(/[₇]/g, "7").replace(/[₈]/g, "8").replace(/[₉]/g, "9")
    .replace(/⁺/g, "+").replace(/⁻/g, "-");

  // ── 8. Other Unicode symbols → WinAnsi-safe equivalents
  s = s
    .replace(/→/g, "->").replace(/←/g, "<-").replace(/↔/g, "<->")
    .replace(/\u2264/g, "<=").replace(/\u2265/g, ">=").replace(/\u2260/g, "!=")
    .replace(/\u00B1/g, "+/-").replace(/\u00D7/g, "x").replace(/\u00F7/g, "/")
    .replace(/\u221E/g, "inf").replace(/\u2206/g, "D").replace(/\u00B7/g, ".");

  // ── 9. Final: strip any remaining non-WinAnsi, collapse spaces
  s = s.replace(/[^\x00-\xFF]/g, "").replace(/\s+/g, " ").trim();

  return s;
}

/** Word-wrap text to fit within maxWidth, returning lines */
function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && currentLine) {
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
  totalPages: number;

  constructor(
    doc: PDFDocument,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    fontOblique: PDFFont
  ) {
    this.doc = doc;
    this.fontRegular = fontRegular;
    this.fontBold = fontBold;
    this.fontOblique = fontOblique;
    this.page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN;
    this.pageNumber = 1;
    this.totalPages = 1;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN + 30) {
      this.newPage();
    }
  }

  newPage() {
    this.drawFooter();
    this.page = this.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.pageNumber++;
    this.totalPages++;
    this.y = A4_HEIGHT - MARGIN;
  }

  drawFooter() {
    const text = `${this.pageNumber}`;
    const w = this.fontRegular.widthOfTextAtSize(text, 9);
    this.page.drawText(text, {
      x: A4_WIDTH / 2 - w / 2,
      y: 25,
      size: 9,
      font: this.fontRegular,
      color: MEDIUM_GRAY,
    });
  }

  drawText(
    text: string,
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      x?: number;
      maxWidth?: number;
      lineHeight?: number;
    } = {}
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
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
    } = {}
  ) {
    const font = options.font ?? this.fontRegular;
    const size = options.size ?? 10;
    const color = options.color ?? BLACK;
    const maxWidth = options.maxWidth ?? CONTENT_WIDTH;

    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      const w = font.widthOfTextAtSize(line, size);
      this.ensureSpace(size * 1.5);
      this.page.drawText(line, {
        x: A4_WIDTH / 2 - w / 2,
        y: this.y,
        size,
        font,
        color,
      });
      this.y -= size * 1.5;
    }
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

function drawCoverPage(
  w: PdfWriter,
  input: ExamInput,
  totalQuestions: number,
  logo: PDFImage | null
) {
  const page = w.page;

  // ── Navy header bar with logo and academic year
  const headerHeight = 52;
  page.drawRectangle({
    x: 0,
    y: A4_HEIGHT - headerHeight,
    width: A4_WIDTH,
    height: headerHeight,
    color: NAVY,
  });

  // Logo in header (left side)
  if (logo) {
    const logoMaxH = 34;
    const logoScale = logoMaxH / logo.height;
    const logoW = logo.width * logoScale;
    const logoH = logo.height * logoScale;
    page.drawImage(logo, {
      x: MARGIN,
      y: A4_HEIGHT - headerHeight + (headerHeight - logoH) / 2,
      width: logoW,
      height: logoH,
    });
  } else {
    page.drawText("DIPLOMA SANTE", {
      x: MARGIN,
      y: A4_HEIGHT - 36,
      size: 14,
      font: w.fontBold,
      color: WHITE,
    });
  }

  // Academic year (right side, gold)
  const yearW = w.fontRegular.widthOfTextAtSize(input.academicYear, 12);
  page.drawText(input.academicYear, {
    x: A4_WIDTH - MARGIN - yearW,
    y: A4_HEIGHT - 34,
    size: 12,
    font: w.fontRegular,
    color: GOLD,
  });

  // ── Title area — starts well below header, centered
  let ty = A4_HEIGHT - 180;

  // Exam title (word-wrapped to not overflow)
  const titleMaxWidth = CONTENT_WIDTH - 40;
  const titleSize = 22;
  const titleLines = wrapText(
    input.examTitle,
    w.fontBold,
    titleSize,
    titleMaxWidth
  );
  for (const line of titleLines) {
    const lw = w.fontBold.widthOfTextAtSize(line, titleSize);
    page.drawText(line, {
      x: A4_WIDTH / 2 - lw / 2,
      y: ty,
      size: titleSize,
      font: w.fontBold,
      color: NAVY,
    });
    ty -= titleSize * 1.4;
  }
  ty -= 10;

  // Gold decorative line
  const lineLen = 180;
  page.drawLine({
    start: { x: A4_WIDTH / 2 - lineLen / 2, y: ty },
    end: { x: A4_WIDTH / 2 + lineLen / 2, y: ty },
    thickness: 2,
    color: GOLD,
  });
  ty -= 30;

  // UE code - Subject
  const ueSubject = `${input.ueCode} - ${input.subjectName}`;
  const ueW = w.fontBold.widthOfTextAtSize(ueSubject, 16);
  page.drawText(ueSubject, {
    x: A4_WIDTH / 2 - ueW / 2,
    y: ty,
    size: 16,
    font: w.fontBold,
    color: NAVY,
  });
  ty -= 35;

  // SUJET in gold
  const sujetText = "SUJET";
  const sujetW = w.fontBold.widthOfTextAtSize(sujetText, 20);
  page.drawText(sujetText, {
    x: A4_WIDTH / 2 - sujetW / 2,
    y: ty,
    size: 20,
    font: w.fontBold,
    color: GOLD,
  });
  ty -= 28;

  // Duration
  const durText = `Dur\u00E9e de l'\u00E9preuve : ${input.duration}`;
  const durW = w.fontRegular.widthOfTextAtSize(durText, 11);
  page.drawText(durText, {
    x: A4_WIDTH / 2 - durW / 2,
    y: ty,
    size: 11,
    font: w.fontRegular,
    color: DARK_GRAY,
  });
  ty -= 20;

  // Date
  const dateW = w.fontRegular.widthOfTextAtSize(input.examDate, 11);
  page.drawText(input.examDate, {
    x: A4_WIDTH / 2 - dateW / 2,
    y: ty,
    size: 11,
    font: w.fontRegular,
    color: DARK_GRAY,
  });
  ty -= 50;

  // ── Instructions box (clean, minimal border)
  const boxTop = ty;
  const boxHeight = 185;
  page.drawRectangle({
    x: MARGIN,
    y: boxTop - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: NAVY,
    borderWidth: 1,
    color: WHITE,
  });

  let iy = boxTop - 18;
  const ixLeft = MARGIN + 15;

  // Section title
  const instrTitle = "A LIRE AVANT DE COMMENCER L'\u00C9PREUVE";
  const instrTitleW = w.fontBold.widthOfTextAtSize(instrTitle, 10);
  page.drawText(instrTitle, {
    x: A4_WIDTH / 2 - instrTitleW / 2,
    y: iy,
    size: 10,
    font: w.fontBold,
    color: NAVY,
  });
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
      page.drawText(line, {
        x: ixLeft,
        y: iy,
        size: 8.5,
        font: w.fontRegular,
        color: DARK_GRAY,
      });
      iy -= 12;
    }
    iy -= 2;
  }

  // ── Regulatory section
  let ry = boxTop - boxHeight - 25;
  const regTitle = "INFORMATIONS R\u00C9GLEMENTAIRES";
  const regTitleW = w.fontBold.widthOfTextAtSize(regTitle, 10);
  page.drawText(regTitle, {
    x: A4_WIDTH / 2 - regTitleW / 2,
    y: ry,
    size: 10,
    font: w.fontBold,
    color: NAVY,
  });
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
      page.drawText(line, {
        x: MARGIN + 10,
        y: ry,
        size: 8.5,
        font: w.fontRegular,
        color: DARK_GRAY,
      });
      ry -= 12;
    }
    ry -= 2;
  }

  // ── Exam info at bottom
  ry -= 20;
  // Gold line
  page.drawLine({
    start: { x: MARGIN + 60, y: ry + 10 },
    end: { x: A4_WIDTH - MARGIN - 60, y: ry + 10 },
    thickness: 1.5,
    color: GOLD,
  });

  const examInfo = `L'\u00E9preuve comporte ${totalQuestions} question${totalQuestions > 1 ? "s" : ""} num\u00E9rot\u00E9e${totalQuestions > 1 ? "s" : ""} de 1 \u00E0 ${totalQuestions}.`;
  const examInfoW = w.fontBold.widthOfTextAtSize(examInfo, 10);
  page.drawText(examInfo, {
    x: A4_WIDTH / 2 - examInfoW / 2,
    y: ry - 10,
    size: 10,
    font: w.fontBold,
    color: NAVY,
  });

  // Footer on cover
  w.drawFooter();
}

// ─── Fetch image bytes (convert any format → PNG/JPG via sharp) ─────────────

async function fetchImageBytes(
  url: string
): Promise<{ bytes: Uint8Array; type: "png" | "jpg" } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn("[generate-exam-pdf] Image fetch failed:", res.status, url.substring(0, 80));
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const buffer = await res.arrayBuffer();
    const rawBytes = new Uint8Array(buffer);

    if (rawBytes.length < 100) return null; // too small to be a real image

    const urlLower = url.toLowerCase();
    const isPng = contentType.includes("png") || urlLower.endsWith(".png");
    const isJpg = contentType.includes("jpeg") || contentType.includes("jpg") ||
                  urlLower.endsWith(".jpg") || urlLower.endsWith(".jpeg");

    // If already PNG or JPG, return directly
    if (isPng) return { bytes: rawBytes, type: "png" };
    if (isJpg) return { bytes: rawBytes, type: "jpg" };

    // For any other format (WEBP, SVG, TIFF, BMP, EMF data-uri, etc.)
    // convert to PNG via sharp
    try {
      const pngBuffer = await sharp(Buffer.from(rawBytes))
        .png()
        .toBuffer();
      return { bytes: new Uint8Array(pngBuffer), type: "png" };
    } catch (sharpErr) {
      console.warn("[generate-exam-pdf] sharp conversion failed, trying raw embed:", sharpErr);
      // Fall back: try as JPG (some servers lie about content-type)
      return { bytes: rawBytes, type: "jpg" };
    }
  } catch (e) {
    console.warn("[generate-exam-pdf] Image fetch error:", e, url.substring(0, 80));
    return null;
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: ExamInput = await req.json();
    const {
      serieId,
      institution,
      academicYear,
      examTitle,
      ueCode,
      subjectName,
      duration,
      examDate,
    } = body;

    if (!serieId) {
      return NextResponse.json(
        { error: "serieId est requis" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // ── Fetch questions with options
    const { data: sqData, error: sqError } = await supabase
      .from("series_questions")
      .select(
        "order_index, section_id, question:questions(id, text, image_url, options(label, text, is_correct, order_index))"
      )
      .eq("series_id", serieId)
      .order("order_index");

    if (sqError) {
      return NextResponse.json(
        { error: "Erreur DB: " + sqError.message },
        { status: 500 }
      );
    }
    if (!sqData || sqData.length === 0) {
      return NextResponse.json(
        { error: "Aucune question trouvee pour cette serie" },
        { status: 404 }
      );
    }

    // ── Fetch sections
    const { data: sectionsData } = await supabase
      .from("series_sections")
      .select("id, title, intro_text, image_url, order_index")
      .eq("series_id", serieId)
      .order("order_index");

    const sectionsMap = new Map<string, Section>();
    for (const s of sectionsData ?? []) {
      sectionsMap.set(s.id, s as Section);
    }

    // Build ordered questions list
    const questions: (Question & { sectionId?: string })[] = [];
    for (const sq of sqData) {
      const q = sq.question as unknown as Question;
      if (!q?.id) continue;
      questions.push({
        ...q,
        sectionId: sq.section_id ?? undefined,
        options: (q.options ?? []).sort(
          (a: Option, b: Option) => a.order_index - b.order_index
        ),
      });
    }

    // ── Create PDF
    const doc = await PDFDocument.create();
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

    const w = new PdfWriter(doc, fontRegular, fontBold, fontOblique);

    // ── Load logo
    const logo = await loadLogoPng(doc);

    // ── Draw cover page
    drawCoverPage(
      w,
      {
        serieId,
        institution,
        academicYear,
        examTitle,
        ueCode,
        subjectName,
        duration,
        examDate,
      },
      questions.length,
      logo
    );

    // ── Start questions on new page
    w.newPage();

    // Header on each question page: UE code top-right + thin line
    const drawQuestionPageHeader = (writer: PdfWriter) => {
      const headerText = `${ueCode} - ${subjectName}`;
      const hw = writer.fontRegular.widthOfTextAtSize(headerText, 9);
      writer.page.drawText(headerText, {
        x: A4_WIDTH - MARGIN - hw,
        y: A4_HEIGHT - MARGIN + 15,
        size: 9,
        font: writer.fontRegular,
        color: MEDIUM_GRAY,
      });
      writer.page.drawLine({
        start: { x: MARGIN, y: A4_HEIGHT - MARGIN + 8 },
        end: { x: A4_WIDTH - MARGIN, y: A4_HEIGHT - MARGIN + 8 },
        thickness: 0.5,
        color: LIGHT_GRAY,
      });
    };

    drawQuestionPageHeader(w);

    // Override newPage to include header
    const originalNewPage = w.newPage.bind(w);
    w.newPage = () => {
      originalNewPage();
      drawQuestionPageHeader(w);
    };

    // ── Image cache
    const imageCache = new Map<string, PDFImage>();

    const getEmbeddedImage = async (url: string): Promise<PDFImage | null> => {
      if (imageCache.has(url)) return imageCache.get(url)!;
      try {
        const imgData = await fetchImageBytes(url);
        if (!imgData) return null;
        let embedded: PDFImage;
        try {
          if (imgData.type === "png") {
            embedded = await doc.embedPng(imgData.bytes);
          } else {
            embedded = await doc.embedJpg(imgData.bytes);
          }
        } catch {
          try {
            embedded =
              imgData.type === "png"
                ? await doc.embedJpg(imgData.bytes)
                : await doc.embedPng(imgData.bytes);
          } catch {
            console.warn(
              "[generate-exam-pdf] Failed to embed image:",
              url.substring(0, 80)
            );
            return null;
          }
        }
        imageCache.set(url, embedded);
        return embedded;
      } catch (e) {
        console.warn("[generate-exam-pdf] Image fetch/embed error:", e);
        return null;
      }
    }

    // ── Draw questions
    let lastSectionId: string | undefined;

    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const qNum = idx + 1;

      // ── Section header
      if (q.sectionId && q.sectionId !== lastSectionId) {
        const section = sectionsMap.get(q.sectionId);
        if (section) {
          w.ensureSpace(80);
          w.y -= 12;

          // Section title bar (navy)
          const barHeight = 28;
          w.page.drawRectangle({
            x: MARGIN,
            y: w.y - 6,
            width: CONTENT_WIDTH,
            height: barHeight,
            color: NAVY,
          });
          // Centered white title
          const sectionTitle = cleanText(section.title);
          const stLines = wrapText(
            sectionTitle,
            w.fontBold,
            12,
            CONTENT_WIDTH - 30
          );
          const stText = stLines.join(" ");
          const stW = w.fontBold.widthOfTextAtSize(stText, 12);
          w.page.drawText(stText, {
            x: A4_WIDTH / 2 - stW / 2,
            y: w.y + 3,
            size: 12,
            font: w.fontBold,
            color: WHITE,
          });
          w.y -= barHeight + 12;

          // Section intro text (italic)
          if (section.intro_text) {
            const introClean = cleanText(section.intro_text);
            w.drawText(introClean, {
              font: w.fontOblique,
              size: 9.5,
              color: DARK_GRAY,
              lineHeight: 13,
            });
            w.y -= 5;
          }

          // Section image
          if (section.image_url) {
            const sImg = await getEmbeddedImage(section.image_url);
            if (sImg) {
              const maxImgWidth = CONTENT_WIDTH * 0.8;
              const maxImgHeight = 200;
              const scale = Math.min(
                maxImgWidth / sImg.width,
                maxImgHeight / sImg.height,
                1
              );
              const drawW = sImg.width * scale;
              const drawH = sImg.height * scale;
              w.ensureSpace(drawH + 15);
              w.y -= drawH;
              w.page.drawImage(sImg, {
                x: A4_WIDTH / 2 - drawW / 2,
                y: w.y,
                width: drawW,
                height: drawH,
              });
              w.y -= 10;
            }
          }
          w.y -= 5;
        }
        lastSectionId = q.sectionId;
      }

      // ── Thin separator between questions (not before the first)
      if (idx > 0 && !(q.sectionId && q.sectionId !== questions[idx - 1]?.sectionId)) {
        w.ensureSpace(25);
        w.page.drawLine({
          start: { x: MARGIN + 20, y: w.y + 5 },
          end: { x: A4_WIDTH - MARGIN - 20, y: w.y + 5 },
          thickness: 0.4,
          color: LIGHT_GRAY,
        });
        w.y -= 5;
      }

      // Estimate space for question header + 2 options minimum
      w.ensureSpace(90);

      // ── Question number + text
      const qText = cleanText(q.text);
      const prefix = `Question ${qNum}.  `;
      const prefixWidth = w.fontBold.widthOfTextAtSize(prefix, 11);

      // Draw question number in navy bold
      w.page.drawText(prefix, {
        x: MARGIN,
        y: w.y,
        size: 11,
        font: w.fontBold,
        color: NAVY,
      });

      // Draw question text (word-wrapped)
      const qLines = wrapText(
        qText,
        w.fontRegular,
        10,
        CONTENT_WIDTH - prefixWidth
      );
      if (qLines.length > 0) {
        w.page.drawText(qLines[0], {
          x: MARGIN + prefixWidth,
          y: w.y,
          size: 10,
          font: w.fontRegular,
          color: BLACK,
        });
        w.y -= 15;

        for (let li = 1; li < qLines.length; li++) {
          w.ensureSpace(15);
          w.page.drawText(qLines[li], {
            x: MARGIN + prefixWidth,
            y: w.y,
            size: 10,
            font: w.fontRegular,
            color: BLACK,
          });
          w.y -= 15;
        }
      } else {
        w.y -= 15;
      }
      w.y -= 5;

      // ── Question image
      if (q.image_url) {
        const qImg = await getEmbeddedImage(q.image_url);
        if (qImg) {
          const maxImgWidth = CONTENT_WIDTH * 0.75;
          const maxImgHeight = 250;
          const scale = Math.min(
            maxImgWidth / qImg.width,
            maxImgHeight / qImg.height,
            1
          );
          const drawW = qImg.width * scale;
          const drawH = qImg.height * scale;
          w.ensureSpace(drawH + 15);
          w.y -= drawH;
          w.page.drawImage(qImg, {
            x: A4_WIDTH / 2 - drawW / 2,
            y: w.y,
            width: drawW,
            height: drawH,
          });
          w.y -= 12;
        }
      }

      // ── Options (no checkboxes — just letter + text)
      const optionIndent = MARGIN + 20;

      for (const opt of q.options) {
        w.ensureSpace(18);

        const optY = w.y;

        // Bold letter label (A., B., C., ...)
        const labelText = `${opt.label}.`;
        const labelWidth = w.fontBold.widthOfTextAtSize(labelText, 10);
        w.page.drawText(labelText, {
          x: optionIndent,
          y: optY,
          size: 10,
          font: w.fontBold,
          color: NAVY,
        });

        // Option text
        const optTextX = optionIndent + labelWidth + 6;
        const optMaxWidth = A4_WIDTH - MARGIN - optTextX;
        const optText = cleanText(opt.text);
        const optLines = wrapText(optText, w.fontRegular, 10, optMaxWidth);

        if (optLines.length > 0) {
          w.page.drawText(optLines[0], {
            x: optTextX,
            y: optY,
            size: 10,
            font: w.fontRegular,
            color: DARK_GRAY,
          });
          w.y -= 15;

          for (let li = 1; li < optLines.length; li++) {
            w.ensureSpace(14);
            w.page.drawText(optLines[li], {
              x: optTextX,
              y: w.y,
              size: 10,
              font: w.fontRegular,
              color: DARK_GRAY,
            });
            w.y -= 14;
          }
        } else {
          w.y -= 15;
        }
      }

      w.y -= 10;
    }

    // Final page footer
    w.drawFooter();

    // ── Serialize PDF
    const pdfBytes = await doc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // ── Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("cours-pdfs")
      .upload(`examens/${serieId}/sujet.pdf`, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sujet_${serieId}.pdf"`,
        },
      });
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage
      .from("cours-pdfs")
      .getPublicUrl(`examens/${serieId}/sujet.pdf`);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: uploadData.path,
      totalQuestions: questions.length,
    });
  } catch (err: unknown) {
    console.error("generate-exam-pdf error:", err);
    return NextResponse.json(
      {
        error: "Erreur lors de la generation du PDF",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
