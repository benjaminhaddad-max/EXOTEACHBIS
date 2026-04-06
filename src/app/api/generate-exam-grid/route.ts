import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

// ─── Constants ───────────────────────────────────────────────────────────────

const MM = 2.835;

// A4 Landscape
const PAGE_W = 841.89;
const PAGE_H = 595.28;

const MARGIN_X = 15 * MM;
const MARGIN_Y = 10 * MM;

// Colors
const SALMON_BORDER = rgb(0.91, 0.63, 0.63); // #E8A0A0
const SALMON_FILL = rgb(0.96, 0.84, 0.84); // #F5D5D5
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const DARK_BG = rgb(0.15, 0.15, 0.2);
const DARK_TEXT = rgb(0.4, 0.4, 0.4);
const GRAY_LINE = rgb(0.7, 0.7, 0.7);

// Grid dimensions
const MAX_Q_PER_COL = 18;
const MAX_COLS = 4;
const LETTERS = ["A", "B", "C", "D", "E"];

// Per-question box sizes
const SMALL_BOX_W = 3.2 * MM; // width of each small square
const SMALL_BOX_H = 3.2 * MM; // height of each small square
const SMALL_BOX_GAP = 0.3 * MM; // gap between the 3 small squares in a group
const GROUP_GAP = 2.5 * MM; // gap between letter groups (A, B, C...)
const ROW_GAP = 1.2 * MM; // gap between answer row and remords row
const Q_GAP = 2 * MM; // gap between questions
const NUM_W = 9 * MM; // width reserved for question number
const MARK_W = 3 * MM; // optical mark square on left
const MARK_GAP = 1.5 * MM;
const LETTER_H = 3.5 * MM; // height for letter labels above grid
const COL_GAP = 4 * MM; // gap between columns

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExamGridInput {
  serieId: string;
  questionCount: number;
  examTitle: string;
  subjectName: string;
  examDate: string;
}

interface Fonts {
  bold: PDFFont;
  normal: PDFFont;
  italic: PDFFont;
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────

/** Draw a group of 3 small rectangles side by side (one answer choice) */
function drawTripleBox(
  page: PDFPage,
  x: number,
  y: number,
  opts: { fill: boolean } = { fill: true }
) {
  for (let i = 0; i < 3; i++) {
    const bx = x + i * (SMALL_BOX_W + SMALL_BOX_GAP);
    page.drawRectangle({
      x: bx,
      y: y - SMALL_BOX_H,
      width: SMALL_BOX_W,
      height: SMALL_BOX_H,
      borderWidth: 0.6,
      borderColor: SALMON_BORDER,
      color: opts.fill ? SALMON_FILL : WHITE,
    });
  }
}

/** Width of one triple-box group */
function tripleBoxWidth(): number {
  return 3 * SMALL_BOX_W + 2 * SMALL_BOX_GAP;
}

/** Draw the optical reading mark (small black square on the left margin) */
function drawOpticalMark(page: PDFPage, x: number, y: number) {
  page.drawRectangle({
    x,
    y: y - MARK_W,
    width: MARK_W,
    height: MARK_W,
    color: BLACK,
  });
}

/** Draw a thick dashed line */
function drawDashedLine(
  page: PDFPage,
  x1: number,
  y: number,
  x2: number,
  dashLen: number = 4,
  gapLen: number = 3,
  thickness: number = 1.5
) {
  let cx = x1;
  while (cx < x2) {
    const end = Math.min(cx + dashLen, x2);
    page.drawLine({
      start: { x: cx, y },
      end: { x: end, y },
      thickness,
      color: BLACK,
    });
    cx = end + gapLen;
  }
}

// ─── Header ──────────────────────────────────────────────────────────────────

function drawHeader(
  page: PDFPage,
  fonts: Fonts,
  examTitle: string,
  subjectName: string,
  examDate: string
): number {
  const headerH = 38 * MM;
  const headerTop = PAGE_H - MARGIN_Y;
  const headerBottom = headerTop - headerH;

  // Dark header background
  page.drawRectangle({
    x: MARGIN_X,
    y: headerBottom,
    width: PAGE_W - 2 * MARGIN_X,
    height: headerH,
    color: DARK_BG,
  });

  // Title
  const titleSize = 16;
  const titleW = fonts.bold.widthOfTextAtSize(examTitle, titleSize);
  page.drawText(examTitle, {
    x: PAGE_W / 2 - titleW / 2,
    y: headerTop - 9 * MM,
    size: titleSize,
    font: fonts.bold,
    color: WHITE,
  });

  // Subtitle: "GRILLE DE REPONSES"
  const subtitle = "GRILLE DE REPONSES";
  const subSize = 10;
  const subW = fonts.bold.widthOfTextAtSize(subtitle, subSize);
  page.drawText(subtitle, {
    x: PAGE_W / 2 - subW / 2,
    y: headerTop - 15 * MM,
    size: subSize,
    font: fonts.bold,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Fields area below title - white background
  const fieldsH = 18 * MM;
  const fieldsTop = headerBottom + fieldsH + 2 * MM;
  const fieldsBottom = headerBottom + 2 * MM;
  const fieldsX = MARGIN_X + 4 * MM;
  const fieldsW = PAGE_W - 2 * MARGIN_X - 8 * MM;

  page.drawRectangle({
    x: fieldsX,
    y: fieldsBottom,
    width: fieldsW,
    height: fieldsH,
    color: WHITE,
    borderWidth: 0.5,
    borderColor: rgb(0.8, 0.8, 0.8),
  });

  // Row 1: NOM + PRENOM
  const fieldLabelSize = 8;
  const fieldLineW = 0.4;
  const row1Y = fieldsTop - 5 * MM;
  const halfW = fieldsW / 2;

  // NOM
  page.drawText("NOM :", {
    x: fieldsX + 3 * MM,
    y: row1Y,
    size: fieldLabelSize,
    font: fonts.bold,
    color: BLACK,
  });
  const nomLineX = fieldsX + 3 * MM + fonts.bold.widthOfTextAtSize("NOM :", fieldLabelSize) + 2 * MM;
  page.drawLine({
    start: { x: nomLineX, y: row1Y - 1 },
    end: { x: fieldsX + halfW - 5 * MM, y: row1Y - 1 },
    thickness: fieldLineW,
    color: GRAY_LINE,
  });

  // PRENOM
  const prenomX = fieldsX + halfW;
  page.drawText("PRENOM :", {
    x: prenomX,
    y: row1Y,
    size: fieldLabelSize,
    font: fonts.bold,
    color: BLACK,
  });
  const prenomLineX = prenomX + fonts.bold.widthOfTextAtSize("PRENOM :", fieldLabelSize) + 2 * MM;
  page.drawLine({
    start: { x: prenomLineX, y: row1Y - 1 },
    end: { x: fieldsX + fieldsW - 3 * MM, y: row1Y - 1 },
    thickness: fieldLineW,
    color: GRAY_LINE,
  });

  // Row 2: N ETUDIANT + DATE + MATIERE
  const row2Y = row1Y - 7 * MM;
  const thirdW = fieldsW / 3;

  // N etudiant
  page.drawText("N\u00b0 ETUDIANT :", {
    x: fieldsX + 3 * MM,
    y: row2Y,
    size: fieldLabelSize,
    font: fonts.bold,
    color: BLACK,
  });
  const numLineX = fieldsX + 3 * MM + fonts.bold.widthOfTextAtSize("N\u00b0 ETUDIANT :", fieldLabelSize) + 2 * MM;
  page.drawLine({
    start: { x: numLineX, y: row2Y - 1 },
    end: { x: fieldsX + thirdW - 3 * MM, y: row2Y - 1 },
    thickness: fieldLineW,
    color: GRAY_LINE,
  });

  // DATE
  const dateX = fieldsX + thirdW;
  page.drawText("DATE :", {
    x: dateX,
    y: row2Y,
    size: fieldLabelSize,
    font: fonts.bold,
    color: BLACK,
  });
  // Pre-fill the date
  const dateLabelEnd = dateX + fonts.bold.widthOfTextAtSize("DATE :", fieldLabelSize) + 2 * MM;
  page.drawText(examDate, {
    x: dateLabelEnd,
    y: row2Y,
    size: fieldLabelSize,
    font: fonts.normal,
    color: DARK_TEXT,
  });
  page.drawLine({
    start: { x: dateLabelEnd, y: row2Y - 1 },
    end: { x: fieldsX + 2 * thirdW - 3 * MM, y: row2Y - 1 },
    thickness: fieldLineW,
    color: GRAY_LINE,
  });

  // MATIERE
  const matX = fieldsX + 2 * thirdW;
  page.drawText("MATIERE :", {
    x: matX,
    y: row2Y,
    size: fieldLabelSize,
    font: fonts.bold,
    color: BLACK,
  });
  const matLabelEnd = matX + fonts.bold.widthOfTextAtSize("MATIERE :", fieldLabelSize) + 2 * MM;
  page.drawText(subjectName, {
    x: matLabelEnd,
    y: row2Y,
    size: fieldLabelSize,
    font: fonts.normal,
    color: DARK_TEXT,
  });
  page.drawLine({
    start: { x: matLabelEnd, y: row2Y - 1 },
    end: { x: fieldsX + fieldsW - 3 * MM, y: row2Y - 1 },
    thickness: fieldLineW,
    color: GRAY_LINE,
  });

  return headerBottom - 3 * MM;
}

// ─── QCM Grid ────────────────────────────────────────────────────────────────

function drawGrid(
  page: PDFPage,
  fonts: Fonts,
  gridTop: number,
  questionCount: number
) {
  const numCols = Math.min(Math.ceil(questionCount / MAX_Q_PER_COL), MAX_COLS);
  const qPerCol = Math.ceil(questionCount / numCols);

  const gridW = PAGE_W - 2 * MARGIN_X;
  const colW = (gridW - (numCols - 1) * COL_GAP) / numCols;

  // Calculate per-question height
  const tbw = tripleBoxWidth();
  const answerRowW = MARK_W + MARK_GAP + NUM_W + 5 * (tbw + GROUP_GAP);

  // Draw thick dashed line at top of grid
  drawDashedLine(page, MARGIN_X, gridTop, PAGE_W - MARGIN_X);

  // Instructions
  const instrY = gridTop - 4 * MM;
  const instrText = "Noircir les cases correspondant a votre reponse. Ligne inferieure = droit au remords.";
  const instrSize = 6.5;
  const instrW = fonts.italic.widthOfTextAtSize(instrText, instrSize);
  page.drawText(instrText, {
    x: PAGE_W / 2 - instrW / 2,
    y: instrY,
    size: instrSize,
    font: fonts.italic,
    color: DARK_TEXT,
  });

  const contentTop = instrY - 4 * MM;

  // Draw letter headers for each column
  const letterSize = 7;

  for (let col = 0; col < numCols; col++) {
    const colX = MARGIN_X + col * (colW + COL_GAP);
    const boxStartX = colX + MARK_W + MARK_GAP + NUM_W;

    for (let li = 0; li < LETTERS.length; li++) {
      const letter = LETTERS[li];
      const groupX = boxStartX + li * (tbw + GROUP_GAP);
      const centerX = groupX + tbw / 2;
      const lw = fonts.bold.widthOfTextAtSize(letter, letterSize);
      page.drawText(letter, {
        x: centerX - lw / 2,
        y: contentTop,
        size: letterSize,
        font: fonts.bold,
        color: BLACK,
      });
    }
  }

  const rowsTop = contentTop - LETTER_H;

  // Height per question block (answer row + remords row + gap)
  const qBlockH = SMALL_BOX_H + ROW_GAP + SMALL_BOX_H + Q_GAP;

  // Draw questions
  for (let col = 0; col < numCols; col++) {
    const colX = MARGIN_X + col * (colW + COL_GAP);
    const qStart = col * qPerCol + 1;
    const qEnd = Math.min(qStart + qPerCol - 1, questionCount);

    // Draw column separator if not first
    if (col > 0) {
      const sepX = colX - COL_GAP / 2;
      page.drawLine({
        start: { x: sepX, y: contentTop + LETTER_H },
        end: { x: sepX, y: MARGIN_Y },
        thickness: 0.3,
        color: GRAY_LINE,
      });
    }

    for (let q = qStart; q <= qEnd; q++) {
      const inCol = q - qStart;
      const curY = rowsTop - inCol * qBlockH;

      // Group separator every 5 questions
      if (inCol > 0 && inCol % 5 === 0) {
        const sepY = curY + Q_GAP * 0.6;
        page.drawLine({
          start: { x: colX, y: sepY },
          end: { x: colX + colW, y: sepY },
          thickness: 0.3,
          color: GRAY_LINE,
        });
      }

      // Optical mark
      drawOpticalMark(page, colX, curY);

      // Question number
      const numStr = String(q);
      const numSize = 7;
      const numTextW = fonts.bold.widthOfTextAtSize(numStr, numSize);
      page.drawText(numStr, {
        x: colX + MARK_W + MARK_GAP + NUM_W - numTextW - 1 * MM,
        y: curY - SMALL_BOX_H / 2 - numSize / 3,
        size: numSize,
        font: fonts.bold,
        color: BLACK,
      });

      const boxStartX = colX + MARK_W + MARK_GAP + NUM_W;

      // Row 1: Answer boxes (A B C D E)
      for (let li = 0; li < LETTERS.length; li++) {
        const groupX = boxStartX + li * (tbw + GROUP_GAP);
        drawTripleBox(page, groupX, curY);
      }

      // Row 2: Droit au remords boxes
      const remordsY = curY - SMALL_BOX_H - ROW_GAP;
      for (let li = 0; li < LETTERS.length; li++) {
        const groupX = boxStartX + li * (tbw + GROUP_GAP);
        drawTripleBox(page, groupX, remordsY, { fill: true });
      }
    }
  }

  // Draw thick dashed line at bottom of grid
  const bottomY = MARGIN_Y;
  drawDashedLine(page, MARGIN_X, bottomY, PAGE_W - MARGIN_X);
}

// ─── Main Route ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: ExamGridInput = await req.json();
    const {
      serieId,
      questionCount,
      examTitle = "Examen",
      subjectName = "",
      examDate = "",
    } = body;

    if (!serieId) {
      return NextResponse.json({ error: "serieId requis" }, { status: 400 });
    }
    if (!questionCount || questionCount < 1 || questionCount > 120) {
      return NextResponse.json(
        { error: "questionCount invalide (1-120)" },
        { status: 400 }
      );
    }

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]); // A4 landscape

    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const normal = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const fonts: Fonts = { bold, normal, italic };

    // Draw header
    const gridTop = drawHeader(page, fonts, examTitle, subjectName, examDate);

    // Draw QCM grid
    drawGrid(page, fonts, gridTop, questionCount);

    // Footer
    const footerSize = 6;
    const footerText = `${examTitle} - ${subjectName} - ${questionCount} questions`;
    const footerW = fonts.italic.widthOfTextAtSize(footerText, footerSize);
    page.drawText(footerText, {
      x: PAGE_W / 2 - footerW / 2,
      y: MARGIN_Y / 2,
      size: footerSize,
      font: fonts.italic,
      color: DARK_TEXT,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // Upload to Supabase
    const supabase = await createClient();
    const filePath = `examens/${serieId}/grille.pdf`;

    const { data, error: uploadError } = await supabase.storage
      .from("cours-pdfs")
      .upload(filePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[generate-exam-grid] Upload error:", uploadError);
      // Still return the PDF as download if upload fails
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="grille-examen.pdf"`,
          "X-Upload-Error": uploadError.message,
        },
      });
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("cours-pdfs").getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: filePath,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur interne";
    console.error("[generate-exam-grid]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
