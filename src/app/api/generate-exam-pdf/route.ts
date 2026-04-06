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

// ─── Constants ───────────────────────────────────────────────────────────────

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 56.7; // ~2cm
const CONTENT_WIDTH = A4_WIDTH - 2 * MARGIN;

// Colors
const NAVY = rgb(0x1a / 255, 0x27 / 255, 0x44 / 255);
const GOLD = rgb(0xc9 / 255, 0xa8 / 255, 0x4c / 255);
const DARK_GRAY = rgb(0.3, 0.3, 0.3);
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

/** Strip LaTeX/Markdown for PDF plain text */
function cleanText(text: string): string {
  return text
    .replace(/\$\$?([^$]+)\$\$?/g, (_m, t) => t)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
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
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN + 30) {
      this.newPage();
    }
  }

  newPage() {
    // Footer on current page
    this.drawFooter();
    this.page = this.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.pageNumber++;
    this.y = A4_HEIGHT - MARGIN;
  }

  drawFooter() {
    const text = `Page ${this.pageNumber}`;
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
    } = {}
  ) {
    const font = options.font ?? this.fontRegular;
    const size = options.size ?? 10;
    const color = options.color ?? BLACK;
    const w = font.widthOfTextAtSize(text, size);
    this.ensureSpace(size * 1.5);
    this.page.drawText(text, {
      x: A4_WIDTH / 2 - w / 2,
      y: this.y,
      size,
      font,
      color,
    });
    this.y -= size * 1.5;
  }

  drawLine(
    x1: number,
    y: number,
    x2: number,
    color: ReturnType<typeof rgb>,
    thickness = 1
  ) {
    this.page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness,
      color,
    });
  }
}

// ─── Cover Page ──────────────────────────────────────────────────────────────

function drawCoverPage(w: PdfWriter, input: ExamInput, totalQuestions: number) {
  const page = w.page;

  // ── Header bar
  page.drawRectangle({
    x: 0,
    y: A4_HEIGHT - 60,
    width: A4_WIDTH,
    height: 60,
    color: NAVY,
  });

  page.drawText(input.institution.toUpperCase(), {
    x: MARGIN,
    y: A4_HEIGHT - 40,
    size: 16,
    font: w.fontBold,
    color: WHITE,
  });

  const yearW = w.fontRegular.widthOfTextAtSize(input.academicYear, 12);
  page.drawText(input.academicYear, {
    x: A4_WIDTH - MARGIN - yearW,
    y: A4_HEIGHT - 38,
    size: 12,
    font: w.fontRegular,
    color: GOLD,
  });

  // ── Title area (centered, vertically in top third)
  let ty = A4_HEIGHT - 200;

  // Exam title
  const titleSize = 28;
  const titleW = w.fontBold.widthOfTextAtSize(input.examTitle, titleSize);
  page.drawText(input.examTitle, {
    x: A4_WIDTH / 2 - titleW / 2,
    y: ty,
    size: titleSize,
    font: w.fontBold,
    color: NAVY,
  });
  ty -= 30;

  // Gold decorative line
  const lineLen = 200;
  page.drawLine({
    start: { x: A4_WIDTH / 2 - lineLen / 2, y: ty },
    end: { x: A4_WIDTH / 2 + lineLen / 2, y: ty },
    thickness: 2.5,
    color: GOLD,
  });
  ty -= 35;

  // UE code - Subject
  const ueSubject = `${input.ueCode} - ${input.subjectName}`;
  const ueW = w.fontBold.widthOfTextAtSize(ueSubject, 18);
  page.drawText(ueSubject, {
    x: A4_WIDTH / 2 - ueW / 2,
    y: ty,
    size: 18,
    font: w.fontBold,
    color: NAVY,
  });
  ty -= 40;

  // SUJET
  const sujetW = w.fontBold.widthOfTextAtSize("SUJET", 22);
  page.drawText("SUJET", {
    x: A4_WIDTH / 2 - sujetW / 2,
    y: ty,
    size: 22,
    font: w.fontBold,
    color: GOLD,
  });
  ty -= 30;

  // Duration
  const durText = `Duree de l'epreuve : ${input.duration}`;
  const durW = w.fontRegular.widthOfTextAtSize(durText, 12);
  page.drawText(durText, {
    x: A4_WIDTH / 2 - durW / 2,
    y: ty,
    size: 12,
    font: w.fontRegular,
    color: DARK_GRAY,
  });
  ty -= 22;

  // Date
  const dateW = w.fontRegular.widthOfTextAtSize(input.examDate, 12);
  page.drawText(input.examDate, {
    x: A4_WIDTH / 2 - dateW / 2,
    y: ty,
    size: 12,
    font: w.fontRegular,
    color: DARK_GRAY,
  });
  ty -= 60;

  // ── Instructions box
  const boxTop = ty;
  const boxHeight = 220;
  page.drawRectangle({
    x: MARGIN,
    y: boxTop - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: NAVY,
    borderWidth: 1.5,
    color: rgb(0.97, 0.97, 0.99),
  });

  let iy = boxTop - 20;
  const ixLeft = MARGIN + 15;
  const instrFont = w.fontRegular;
  const instrBoldFont = w.fontBold;

  // Section title
  const instrTitle = "A LIRE AVANT DE COMMENCER L'EPREUVE";
  const instrTitleW = instrBoldFont.widthOfTextAtSize(instrTitle, 11);
  page.drawText(instrTitle, {
    x: A4_WIDTH / 2 - instrTitleW / 2,
    y: iy,
    size: 11,
    font: instrBoldFont,
    color: NAVY,
  });
  iy -= 22;

  const instructions = [
    "Verifier que les informations saisies sur les GRILLES sont correctes (nom, prenom, numero d'etudiant).",
    "Les correcteurs liquides et les stylos effacables sont interdits.",
    "Seules les reponses portees sur la GRILLE DE REPONSES seront prises en compte.",
    "L'utilisation de tout appareil electronique est formellement interdite (telephone, montre connectee, calculatrice non autorisee).",
    "Tout document non autorise sera considere comme une tentative de fraude.",
  ];

  for (const instr of instructions) {
    const bullet = `  -  ${instr}`;
    const lines = wrapText(bullet, instrFont, 9, CONTENT_WIDTH - 40);
    for (const line of lines) {
      page.drawText(line, {
        x: ixLeft,
        y: iy,
        size: 9,
        font: instrFont,
        color: DARK_GRAY,
      });
      iy -= 13;
    }
    iy -= 3;
  }

  // ── Regulatory section
  let ry = boxTop - boxHeight - 30;
  const regTitle = "INFORMATIONS REGLEMENTAIRES";
  const regTitleW = instrBoldFont.widthOfTextAtSize(regTitle, 11);
  page.drawText(regTitle, {
    x: A4_WIDTH / 2 - regTitleW / 2,
    y: ry,
    size: 11,
    font: instrBoldFont,
    color: NAVY,
  });
  ry -= 20;

  const regulations = [
    "Les questions sans reponse seront considerees comme nulles.",
    "Les questions a choix multiples peuvent comporter une ou plusieurs reponses exactes.",
    "Aucune reclamation ne sera acceptee apres la fin de l'epreuve concernant le sujet.",
  ];

  for (const reg of regulations) {
    const bullet = `  -  ${reg}`;
    const lines = wrapText(bullet, instrFont, 9, CONTENT_WIDTH - 20);
    for (const line of lines) {
      page.drawText(line, {
        x: MARGIN + 10,
        y: ry,
        size: 9,
        font: instrFont,
        color: DARK_GRAY,
      });
      ry -= 13;
    }
    ry -= 3;
  }

  // ── Exam info at bottom
  ry -= 25;
  page.drawLine({
    start: { x: MARGIN, y: ry + 10 },
    end: { x: A4_WIDTH - MARGIN, y: ry + 10 },
    thickness: 1,
    color: GOLD,
  });

  const examInfo = `L'epreuve comporte ${totalQuestions} question${totalQuestions > 1 ? "s" : ""} numerotee${totalQuestions > 1 ? "s" : ""} de 1 a ${totalQuestions}.`;
  const examInfoW = instrBoldFont.widthOfTextAtSize(examInfo, 11);
  page.drawText(examInfo, {
    x: A4_WIDTH / 2 - examInfoW / 2,
    y: ry - 10,
    size: 11,
    font: instrBoldFont,
    color: NAVY,
  });

  // Footer on cover
  w.drawFooter();
}

// ─── Fetch image bytes ───────────────────────────────────────────────────────

async function fetchImageBytes(
  url: string
): Promise<{ bytes: Uint8Array; type: "png" | "jpg" } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (contentType.includes("png") || url.toLowerCase().endsWith(".png")) {
      return { bytes, type: "png" };
    }
    return { bytes, type: "jpg" };
  } catch {
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

    // ── Draw cover page
    drawCoverPage(
      w,
      { serieId, institution, academicYear, examTitle, ueCode, subjectName, duration, examDate },
      questions.length
    );

    // ── Start questions on new page
    w.newPage();

    // Header on each question page
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

    // ── Image cache (embed each image only once)
    const imageCache = new Map<string, PDFImage>();

    async function getEmbeddedImage(url: string): Promise<PDFImage | null> {
      if (imageCache.has(url)) return imageCache.get(url)!;
      const imgData = await fetchImageBytes(url);
      if (!imgData) return null;
      try {
        let embedded: PDFImage;
        if (imgData.type === "png") {
          embedded = await doc.embedPng(imgData.bytes);
        } else {
          embedded = await doc.embedJpg(imgData.bytes);
        }
        imageCache.set(url, embedded);
        return embedded;
      } catch {
        return null;
      }
    }

    // ── Draw questions
    let lastSectionId: string | undefined;

    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const qNum = idx + 1;

      // ── Section header (if entering a new section)
      if (q.sectionId && q.sectionId !== lastSectionId) {
        const section = sectionsMap.get(q.sectionId);
        if (section) {
          w.ensureSpace(80);
          w.y -= 15;

          // Section title bar
          w.page.drawRectangle({
            x: MARGIN,
            y: w.y - 5,
            width: CONTENT_WIDTH,
            height: 24,
            color: NAVY,
          });
          const stW = w.fontBold.widthOfTextAtSize(section.title, 12);
          w.page.drawText(section.title, {
            x: A4_WIDTH / 2 - stW / 2,
            y: w.y + 2,
            size: 12,
            font: w.fontBold,
            color: WHITE,
          });
          w.y -= 35;

          // Section intro text
          if (section.intro_text) {
            const introClean = cleanText(section.intro_text);
            w.drawText(introClean, {
              font: w.fontOblique,
              size: 10,
              color: DARK_GRAY,
              lineHeight: 14,
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

      // ── Question separator (dotted line)
      if (idx > 0) {
        w.ensureSpace(30);
        const dotY = w.y + 5;
        for (let dx = MARGIN; dx < A4_WIDTH - MARGIN; dx += 6) {
          w.page.drawCircle({
            x: dx,
            y: dotY,
            size: 0.5,
            color: LIGHT_GRAY,
          });
        }
        w.y -= 5;
      }

      // Estimate space needed for question header + at least 2 options
      w.ensureSpace(100);

      // ── Question number + text
      const qText = cleanText(q.text);
      const prefix = `Question ${qNum}.  `;
      const prefixWidth = w.fontBold.widthOfTextAtSize(prefix, 11);

      // Draw question number
      w.page.drawText(prefix, {
        x: MARGIN,
        y: w.y,
        size: 11,
        font: w.fontBold,
        color: NAVY,
      });

      // Draw question text (wrapped, continuing from after the prefix on first line)
      const qLines = wrapText(qText, w.fontRegular, 10, CONTENT_WIDTH - prefixWidth);
      if (qLines.length > 0) {
        // First line after prefix
        w.page.drawText(qLines[0], {
          x: MARGIN + prefixWidth,
          y: w.y,
          size: 10,
          font: w.fontRegular,
          color: BLACK,
        });
        w.y -= 15;

        // Remaining lines
        for (let li = 1; li < qLines.length; li++) {
          w.ensureSpace(15);
          w.page.drawText(qLines[li], {
            x: MARGIN,
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

      // ── Options
      const optionIndent = MARGIN + 15;
      const checkboxSize = 9;

      for (const opt of q.options) {
        w.ensureSpace(20);

        const optY = w.y;

        // Draw checkbox square
        w.page.drawRectangle({
          x: optionIndent,
          y: optY - 1,
          width: checkboxSize,
          height: checkboxSize,
          borderColor: MEDIUM_GRAY,
          borderWidth: 0.8,
          color: WHITE,
        });

        // Draw label (A, B, C...)
        const labelText = `${opt.label}.`;
        w.page.drawText(labelText, {
          x: optionIndent + checkboxSize + 6,
          y: optY,
          size: 10,
          font: w.fontBold,
          color: NAVY,
        });

        // Draw option text
        const labelWidth =
          w.fontBold.widthOfTextAtSize(labelText, 10) + checkboxSize + 12;
        const optTextX = optionIndent + labelWidth;
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
          w.y -= 16;

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
          w.y -= 16;
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
      // Still return the PDF as a download if upload fails
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
