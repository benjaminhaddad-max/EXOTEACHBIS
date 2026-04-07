import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  PageBreak,
  ShadingType,
  TabStopType,
  TabStopPosition,
  Tab,
} from "docx";
import * as path from "path";
import { promises as fs } from "fs";
import sharp from "sharp";

export const maxDuration = 60;

// ─── Constants ───────────────────────────────────────────────────────────────

const NAVY = "0E1E35";
const GOLD = "C9A84C";
const DARK_GRAY = "404040";
const MEDIUM_GRAY = "888888";
const WHITE = "FFFFFF";
const FONT = "Arial";

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

// ─── Unicode sub/sup maps ───────────────────────────────────────────────────

const SUP_MAP: Record<string, string> = {
  "\u2070": "0", "\u00B9": "1", "\u00B2": "2", "\u00B3": "3",
  "\u2074": "4", "\u2075": "5", "\u2076": "6", "\u2077": "7",
  "\u2078": "8", "\u2079": "9", "\u207A": "+", "\u207B": "-",
  "\u207C": "=", "\u207D": "(", "\u207E": ")", "\u207F": "n", "\u2071": "i",
};

const SUB_MAP: Record<string, string> = {
  "\u2080": "0", "\u2081": "1", "\u2082": "2", "\u2083": "3",
  "\u2084": "4", "\u2085": "5", "\u2086": "6", "\u2087": "7",
  "\u2088": "8", "\u2089": "9", "\u208A": "+", "\u208B": "-",
  "\u208C": "=", "\u208D": "(", "\u208E": ")",
  "\u2090": "a", "\u2091": "e", "\u2095": "h", "\u2096": "k",
  "\u2097": "l", "\u2098": "m", "\u2099": "n", "\u2092": "o",
  "\u209A": "p", "\u209B": "s", "\u209C": "t", "\u2093": "x",
};

// ─── Text preparation ───────────────────────────────────────────────────────

/** Clean HTML/Markdown/LaTeX but preserve Unicode chars (Word handles them) */
function prepareText(raw: string): string {
  let s = raw;

  // HTML entities & tags
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  s = s.replace(/&rsquo;/g, "\u2019").replace(/&lsquo;/g, "\u2018");
  s = s.replace(/&rdquo;/g, "\u201D").replace(/&ldquo;/g, "\u201C");
  s = s.replace(/&#?\w+;/g, "");
  s = s.replace(/<[^>]+>/g, "");

  // Markdown bold/italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");

  // LaTeX: process $...$ blocks
  s = s.replace(/\$\$?([^$]+)\$\$?/g, (_m, inner) => processLatex(inner));
  s = processLatex(s);

  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function processLatex(s: string): string {
  s = s.replace(/\\left\s?[.(|{\\]/g, "(");
  s = s.replace(/\\left\s?\[/g, "[");
  s = s.replace(/\\right\s?[.)|}\\]/g, ")");
  s = s.replace(/\\right\s?\]/g, "]");
  s = s.replace(/\\left/g, "").replace(/\\right/g, "");

  s = s.replace(/\\(?:text|mathrm|textbf|textit|emph|operatorname)\{([^}]*)\}/g, "$1");
  s = s.replace(/\\(?:overline|underline|vec|hat|bar|tilde|widetilde|widehat)\{([^}]*)\}/g, "$1");

  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2");
  s = s.replace(/\\sqrt\{([^}]*)\}/g, "\u221A($1)");

  s = s.replace(/\\cdot/g, "\u00B7");
  s = s.replace(/\\times/g, "\u00D7");
  s = s.replace(/\\pm/g, "\u00B1");
  s = s.replace(/\\neq/g, "\u2260");
  s = s.replace(/\\leq/g, "\u2264");
  s = s.replace(/\\geq/g, "\u2265");
  s = s.replace(/\\approx/g, "\u2248");
  s = s.replace(/\\infty/g, "\u221E");

  // LaTeX Greek → real Unicode Greek (Word renders them perfectly)
  s = s.replace(/\\alpha/g, "\u03B1").replace(/\\beta/g, "\u03B2");
  s = s.replace(/\\gamma/g, "\u03B3").replace(/\\delta/g, "\u03B4");
  s = s.replace(/\\epsilon/g, "\u03B5").replace(/\\zeta/g, "\u03B6");
  s = s.replace(/\\eta/g, "\u03B7").replace(/\\theta/g, "\u03B8");
  s = s.replace(/\\iota/g, "\u03B9").replace(/\\kappa/g, "\u03BA");
  s = s.replace(/\\lambda/g, "\u03BB").replace(/\\mu/g, "\u03BC");
  s = s.replace(/\\nu/g, "\u03BD").replace(/\\xi/g, "\u03BE");
  s = s.replace(/\\pi/g, "\u03C0").replace(/\\rho/g, "\u03C1");
  s = s.replace(/\\sigma/g, "\u03C3").replace(/\\tau/g, "\u03C4");
  s = s.replace(/\\upsilon/g, "\u03C5").replace(/\\phi/g, "\u03C6");
  s = s.replace(/\\chi/g, "\u03C7").replace(/\\psi/g, "\u03C8");
  s = s.replace(/\\omega/g, "\u03C9");
  s = s.replace(/\\Delta/g, "\u0394").replace(/\\Sigma/g, "\u03A3");
  s = s.replace(/\\Omega/g, "\u03A9").replace(/\\Pi/g, "\u03A0");
  s = s.replace(/\\Phi/g, "\u03A6").replace(/\\Gamma/g, "\u0393");
  s = s.replace(/\\Lambda/g, "\u039B").replace(/\\Theta/g, "\u0398");

  s = s.replace(/\\[a-zA-Z]+/g, "");
  s = s.replace(/(?<![_^])\{([^}]*)\}/g, "$1");

  return s;
}

// ─── Parse text → TextRun[] with proper sub/sup ─────────────────────────────

type RunStyle = "n" | "sup" | "sub";

function textToRuns(
  rawText: string,
  baseOptions: { font?: string; size?: number; color?: string; bold?: boolean; italics?: boolean } = {}
): TextRun[] {
  const text = prepareText(rawText);
  const font = baseOptions.font ?? FONT;
  const size = baseOptions.size ?? 20;
  const color = baseOptions.color ?? "333333";
  const bold = baseOptions.bold ?? false;
  const italics = baseOptions.italics ?? false;

  const runs: TextRun[] = [];
  let buf = "";
  let bufStyle: RunStyle = "n";

  const flush = () => {
    if (!buf) return;
    const opts: Record<string, unknown> = { text: buf, font, color, bold, italics };
    if (bufStyle === "n") opts.size = size;
    else {
      opts.size = Math.round(size * 0.75);
      if (bufStyle === "sup") opts.superScript = true;
      else opts.subScript = true;
    }
    runs.push(new TextRun(opts as any));
    buf = "";
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // Unicode superscript
    if (ch in SUP_MAP) {
      if (bufStyle !== "sup") { flush(); bufStyle = "sup"; }
      buf += SUP_MAP[ch];
      i++;
      continue;
    }

    // Unicode subscript
    if (ch in SUB_MAP) {
      if (bufStyle !== "sub") { flush(); bufStyle = "sub"; }
      buf += SUB_MAP[ch];
      i++;
      continue;
    }

    // ^{...}
    if (ch === "^" && i + 1 < text.length && text[i + 1] === "{") {
      flush();
      bufStyle = "sup";
      const close = text.indexOf("}", i + 2);
      if (close !== -1) { buf = text.substring(i + 2, close); flush(); bufStyle = "n"; i = close + 1; continue; }
    }

    // _{...}
    if (ch === "_" && i + 1 < text.length && text[i + 1] === "{") {
      flush();
      bufStyle = "sub";
      const close = text.indexOf("}", i + 2);
      if (close !== -1) { buf = text.substring(i + 2, close); flush(); bufStyle = "n"; i = close + 1; continue; }
    }

    // ^x single-char superscript
    if (ch === "^" && i + 1 < text.length && text[i + 1] !== " " && text[i + 1] !== "{") {
      flush(); bufStyle = "sup"; buf = text[i + 1]; flush(); bufStyle = "n"; i += 2; continue;
    }

    // _x single-char subscript
    if (ch === "_" && i + 1 < text.length && text[i + 1] !== " " && text[i + 1] !== "{" && text[i + 1] !== "_") {
      flush(); bufStyle = "sub"; buf = text[i + 1]; flush(); bufStyle = "n"; i += 2; continue;
    }

    // Normal char
    if (bufStyle !== "n") { flush(); bufStyle = "n"; }
    buf += ch;
    i++;
  }

  flush();
  return runs;
}

// ─── Image fetching ─────────────────────────────────────────────────────────

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const arrBuf = await res.arrayBuffer();
    const rawBuf = Buffer.from(arrBuf);
    if (rawBuf.length < 100) return null;

    // Convert to PNG via sharp (handles any format)
    const pngBuf = await sharp(rawBuf).png().toBuffer();
    const meta = await sharp(pngBuf).metadata();
    return { buffer: pngBuf, width: meta.width ?? 400, height: meta.height ?? 300 };
  } catch {
    return null;
  }
}

async function loadLogo(): Promise<Buffer | null> {
  try {
    const logoPath = path.join(process.cwd(), "public", "ds-logo-2026.png");
    return await fs.readFile(logoPath);
  } catch { return null; }
}

// ─── Build cover page paragraphs ────────────────────────────────────────────

function buildCoverPage(input: ExamInput, totalQuestions: number, logoBuffer: Buffer | null): Paragraph[] {
  const children: Paragraph[] = [];

  // Logo + year header
  const headerRuns: (TextRun | ImageRun)[] = [];
  if (logoBuffer) {
    headerRuns.push(new ImageRun({ data: logoBuffer, transformation: { width: 150, height: 83 }, type: "png" }));
    headerRuns.push(new TextRun({ text: "    ", font: FONT, size: 20 }));
  }

  children.push(new Paragraph({
    spacing: { before: 0, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: NAVY },
    children: [
      ...headerRuns,
      new TextRun({ text: "\t", font: FONT }),
      new TextRun({ text: input.academicYear, font: FONT, size: 24, color: GOLD }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
  }));

  // Spacing
  children.push(new Paragraph({ spacing: { before: 600, after: 0 }, children: [] }));

  // Exam title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: input.examTitle, font: FONT, size: 44, bold: true, color: NAVY })],
  }));

  // Gold line
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 8 } },
    children: [],
  }));

  // UE - Subject
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: `${input.ueCode} - ${input.subjectName}`, font: FONT, size: 32, bold: true, color: NAVY })],
  }));

  // SUJET
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [new TextRun({ text: "SUJET", font: FONT, size: 40, bold: true, color: GOLD })],
  }));

  // Duration
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 50, after: 50 },
    children: [new TextRun({ text: `Dur\u00E9e de l'\u00E9preuve : ${input.duration}`, font: FONT, size: 22, color: DARK_GRAY })],
  }));

  // Date
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 300 },
    children: [new TextRun({ text: input.examDate, font: FONT, size: 22, color: DARK_GRAY })],
  }));

  // Instructions box title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: NAVY, space: 8 } },
    children: [new TextRun({ text: "A LIRE AVANT DE COMMENCER L'\u00C9PREUVE", font: FONT, size: 20, bold: true, color: NAVY })],
  }));

  const instructions = [
    "V\u00E9rifier que les informations saisies sur les GRILLES sont correctes (nom, pr\u00E9nom, num\u00E9ro d'\u00E9tudiant).",
    "Les correcteurs liquides et les stylos effa\u00E7ables sont interdits.",
    "Seules les r\u00E9ponses port\u00E9es sur la GRILLE DE R\u00C9PONSES seront prises en compte.",
    "L'utilisation de tout appareil \u00E9lectronique est formellement interdite (t\u00E9l\u00E9phone, montre connect\u00E9e, calculatrice non autoris\u00E9e).",
    "Tout document non autoris\u00E9 sera consid\u00E9r\u00E9 comme une tentative de fraude.",
  ];
  for (const instr of instructions) {
    children.push(new Paragraph({
      spacing: { before: 30, after: 30 },
      indent: { left: 400 },
      children: [new TextRun({ text: `- ${instr}`, font: FONT, size: 17, color: DARK_GRAY })],
    }));
  }

  // Regulatory title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: "INFORMATIONS R\u00C9GLEMENTAIRES", font: FONT, size: 20, bold: true, color: NAVY })],
  }));

  const regulations = [
    "Les questions sans r\u00E9ponse seront consid\u00E9r\u00E9es comme nulles.",
    "Les questions \u00E0 choix multiples peuvent comporter une ou plusieurs r\u00E9ponses exactes.",
    "Aucune r\u00E9clamation ne sera accept\u00E9e apr\u00E8s la fin de l'\u00E9preuve concernant le sujet.",
  ];
  for (const reg of regulations) {
    children.push(new Paragraph({
      spacing: { before: 30, after: 30 },
      indent: { left: 400 },
      children: [new TextRun({ text: `- ${reg}`, font: FONT, size: 17, color: DARK_GRAY })],
    }));
  }

  // Gold line + question count
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300, after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 12 } },
    children: [new TextRun({
      text: `L'\u00E9preuve comporte ${totalQuestions} question${totalQuestions > 1 ? "s" : ""} num\u00E9rot\u00E9e${totalQuestions > 1 ? "s" : ""} de 1 \u00E0 ${totalQuestions}.`,
      font: FONT, size: 20, bold: true, color: NAVY,
    })],
  }));

  // Page break
  children.push(new Paragraph({ children: [new PageBreak()] }));

  return children;
}

// ─── Build question paragraphs ──────────────────────────────────────────────

async function buildQuestionsParagraphs(
  questions: (Question & { sectionId?: string })[],
  sectionsMap: Map<string, Section>
): Promise<Paragraph[]> {
  const children: Paragraph[] = [];
  let lastSectionId: string | undefined;

  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx];
    const qNum = idx + 1;

    // Section header
    if (q.sectionId && q.sectionId !== lastSectionId) {
      const section = sectionsMap.get(q.sectionId);
      if (section) {
        // Section title bar
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 150 },
          shading: { type: ShadingType.CLEAR, fill: NAVY },
          children: [new TextRun({ text: `  ${section.title}  `, font: FONT, size: 24, bold: true, color: WHITE })],
        }));

        // Section intro text
        if (section.intro_text) {
          children.push(new Paragraph({
            spacing: { before: 100, after: 100 },
            children: textToRuns(section.intro_text, { size: 19, color: DARK_GRAY, italics: true }),
          }));
        }

        // Section image
        if (section.image_url) {
          const img = await fetchImageBuffer(section.image_url);
          if (img) {
            const maxW = 450;
            const maxH = 250;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 150 },
              children: [new ImageRun({
                data: img.buffer,
                transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
                type: "png",
              })],
            }));
          }
        }
      }
      lastSectionId = q.sectionId;
    }

    // Separator line (between questions, not before first)
    if (idx > 0 && !(q.sectionId && q.sectionId !== questions[idx - 1]?.sectionId)) {
      children.push(new Paragraph({
        spacing: { before: 200, after: 0 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0", space: 6 } },
        children: [],
      }));
    }

    // Question number + text
    const qRuns = textToRuns(q.text, { size: 20, color: "333333" });
    children.push(new Paragraph({
      spacing: { before: 250, after: 100 },
      children: [
        new TextRun({ text: `Question ${qNum}.  `, font: FONT, size: 22, bold: true, color: NAVY }),
        ...qRuns,
      ],
    }));

    // Question image
    if (q.image_url) {
      const img = await fetchImageBuffer(q.image_url);
      if (img) {
        const maxW = 420;
        const maxH = 300;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 120 },
          children: [new ImageRun({
            data: img.buffer,
            transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
            type: "png",
          })],
        }));
      }
    }

    // Options
    for (const opt of q.options) {
      const optRuns = textToRuns(opt.text, { size: 20, color: DARK_GRAY });
      children.push(new Paragraph({
        spacing: { before: 40, after: 40 },
        indent: { left: 400 },
        children: [
          new TextRun({ text: `${opt.label}.  `, font: FONT, size: 20, bold: true, color: NAVY }),
          ...optRuns,
        ],
      }));
    }
  }

  return children;
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

    // Load logo
    const logoBuffer = await loadLogo();

    // Build cover page
    const coverChildren = buildCoverPage(
      { serieId, institution, academicYear, examTitle, ueCode, subjectName, duration, examDate },
      questions.length,
      logoBuffer
    );

    // Build question pages
    const questionChildren = await buildQuestionsParagraphs(questions, sectionsMap);

    // Create document
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1000, right: 1134, bottom: 1000, left: 1134 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${ueCode} - ${subjectName}`, font: FONT, size: 16, color: MEDIUM_GRAY })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MEDIUM_GRAY }),
                ],
              }),
            ],
          }),
        },
        children: [...coverChildren, ...questionChildren],
      }],
    });

    // Serialize
    const buffer = await Packer.toBuffer(doc);
    const docxBuffer = Buffer.from(buffer);

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("cours-pdfs")
      .upload(`examens/${serieId}/sujet.docx`, docxBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new NextResponse(docxBuffer as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="sujet_${serieId}.docx"`,
        },
      });
    }

    const { data: { publicUrl } } = supabase.storage.from("cours-pdfs").getPublicUrl(`examens/${serieId}/sujet.docx`);

    return NextResponse.json({ success: true, url: publicUrl, path: uploadData.path, totalQuestions: questions.length });
  } catch (err: unknown) {
    console.error("generate-exam-pdf error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la generation du document", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
