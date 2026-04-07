import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

// ─── Constants ───────────────────────────────────────────────────────────────

const MM = 2.835;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.55, 0.55, 0.55);
const LIGHT_GRAY = rgb(0.8, 0.8, 0.8);
const NAVY = rgb(0x0e / 255, 0x1e / 255, 0x35 / 255);

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN_X = 10 * MM;
const MARGIN_TOP = 10 * MM;

// Grid layout
const TOTAL_Q = 72;
const COLS = 4;
const Q_PER_COL = 18;
const GROUP_SIZE = 10;
const LETTERS = ["A", "B", "C", "D", "E"];

// Box dimensions
const BOX = 3.8 * MM;
const BOX_GAP = 1.0 * MM;
const REMORD_GAP = 0.6 * MM;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawField(
  page: PDFPage,
  label: string,
  x: number,
  y: number,
  fieldW: number,
  fieldH: number,
  font: PDFFont,
  fontBold: PDFFont
) {
  // Label
  page.drawText(label, {
    x,
    y: y + fieldH / 2 - 3,
    size: 8,
    font: fontBold,
    color: BLACK,
  });
  const labelW = fontBold.widthOfTextAtSize(label, 8) + 3 * MM;
  // Box
  page.drawRectangle({
    x: x + labelW,
    y,
    width: fieldW - labelW,
    height: fieldH,
    borderWidth: 0.5,
    borderColor: BLACK,
    color: WHITE,
  });
}

function drawTextFit(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxW: number,
  maxSize: number,
  font: PDFFont,
  color = BLACK
) {
  let size = maxSize;
  while (size > 4 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  page.drawText(text, { x, y, size, font, color });
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      serieId,
      examTitle = "",
      ueCode = "",
      subjectName = "",
      examDate = "",
      institution = "",
      academicYear = "",
    } = body;

    if (!serieId) return NextResponse.json({ error: "serieId requis" }, { status: 400 });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const contentW = PAGE_W - 2 * MARGIN_X;
    let y = PAGE_H - MARGIN_TOP;

    // ═══════════════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════════════

    // ── Row 1: Institution + Academic Year (navy bar)
    const barH = 8 * MM;
    page.drawRectangle({
      x: MARGIN_X, y: y - barH, width: contentW, height: barH, color: NAVY,
    });
    if (institution) {
      page.drawText(institution.toUpperCase(), {
        x: MARGIN_X + 3 * MM, y: y - barH + 2.5 * MM, size: 9, font: fontBold, color: WHITE,
      });
    }
    if (academicYear) {
      const yw = font.widthOfTextAtSize(academicYear, 9);
      page.drawText(academicYear, {
        x: MARGIN_X + contentW - yw - 3 * MM, y: y - barH + 2.5 * MM, size: 9, font, color: rgb(0.8, 0.7, 0.4),
      });
    }
    y -= barH + 4 * MM;

    // ── Row 2: Exam title (centered, fits in one line)
    if (examTitle) {
      const titleW = contentW - 10 * MM;
      let titleSize = 12;
      while (titleSize > 6 && fontBold.widthOfTextAtSize(examTitle, titleSize) > titleW) titleSize -= 0.5;
      const tw = fontBold.widthOfTextAtSize(examTitle, titleSize);
      page.drawText(examTitle, {
        x: MARGIN_X + contentW / 2 - tw / 2, y, size: titleSize, font: fontBold, color: NAVY,
      });
      y -= titleSize + 3 * MM;
    }

    // ── Row 3: UE + Matière + Date (centered)
    const infoLine = [ueCode, subjectName, examDate].filter(Boolean).join("  —  ");
    if (infoLine) {
      const iw = font.widthOfTextAtSize(infoLine, 8);
      page.drawText(infoLine, {
        x: MARGIN_X + contentW / 2 - iw / 2, y, size: 8, font, color: GRAY,
      });
      y -= 5 * MM;
    }

    // ── Separator line
    page.drawLine({
      start: { x: MARGIN_X, y }, end: { x: MARGIN_X + contentW, y },
      thickness: 0.5, color: LIGHT_GRAY,
    });
    y -= 4 * MM;

    // ── Row 4: NOM + Prénom + N° étudiant side by side
    const fieldH = 7 * MM;
    const thirdW = contentW / 3 - 2 * MM;

    drawField(page, "NOM ", MARGIN_X, y - fieldH, thirdW, fieldH, font, fontBold);
    drawField(page, "Prénom ", MARGIN_X + thirdW + 3 * MM, y - fieldH, thirdW, fieldH, font, fontBold);
    drawField(page, "N° étudiant ", MARGIN_X + 2 * (thirdW + 3 * MM), y - fieldH, thirdW, fieldH, font, fontBold);
    y -= fieldH + 4 * MM;

    // ── Separator
    page.drawLine({
      start: { x: MARGIN_X, y }, end: { x: MARGIN_X + contentW, y },
      thickness: 0.5, color: LIGHT_GRAY,
    });
    y -= 2 * MM;

    // ── Instruction
    const instrText = "Répondez aux questions en noircissant les cases ci-dessous";
    const instrW = font.widthOfTextAtSize(instrText, 8);
    page.drawText(instrText, {
      x: MARGIN_X + contentW / 2 - instrW / 2, y, size: 8, font, color: GRAY,
    });
    y -= 5 * MM;

    // ═══════════════════════════════════════════════════════════════════════
    // QCM GRID
    // ═══════════════════════════════════════════════════════════════════════

    const gridTop = y;
    const gridW = contentW;
    const colGap = 4 * MM;
    const colW = (gridW - (COLS - 1) * colGap) / COLS;
    const numW = 7 * MM;
    const boxAreaW = LETTERS.length * (BOX + BOX_GAP) - BOX_GAP;

    // Calculate row height to fit all questions
    const availableH = gridTop - MARGIN_TOP;
    const groupGap = 3 * MM;
    const numGroups = Math.ceil(Q_PER_COL / GROUP_SIZE);
    const totalGapH = (numGroups - 1) * groupGap + numGroups * 3 * MM; // group gaps + letter header space
    const rowH = (availableH - totalGapH) / Q_PER_COL;

    for (let col = 0; col < COLS; col++) {
      const colX = MARGIN_X + col * (colW + colGap);
      const qStart = col * Q_PER_COL + 1;
      const qEnd = Math.min(qStart + Q_PER_COL - 1, TOTAL_Q);

      // Center boxes in column
      const boxStartX = colX + numW;

      let qY = gridTop;

      for (let q = qStart; q <= qEnd; q++) {
        const inCol = q - qStart;
        const groupIdx = Math.floor(inCol / GROUP_SIZE);
        const inGroup = inCol % GROUP_SIZE;

        // Letter headers at start of each group
        if (inGroup === 0) {
          if (groupIdx > 0) qY -= groupGap;
          // Draw letter labels
          for (let li = 0; li < LETTERS.length; li++) {
            const lx = boxStartX + li * (BOX + BOX_GAP);
            const lw = fontBold.widthOfTextAtSize(LETTERS[li], 7);
            page.drawText(LETTERS[li], {
              x: lx + BOX / 2 - lw / 2,
              y: qY - 2.5 * MM,
              size: 7, font: fontBold, color: BLACK,
            });
          }
          qY -= 3.5 * MM;
        }

        // Question number
        const numStr = String(q);
        const numStrW = fontBold.widthOfTextAtSize(numStr, 7);
        page.drawText(numStr, {
          x: boxStartX - numStrW - 1.5 * MM,
          y: qY - BOX + 1.5,
          size: 7, font: fontBold, color: BLACK,
        });

        // Answer boxes (row 1)
        for (let li = 0; li < LETTERS.length; li++) {
          const bx = boxStartX + li * (BOX + BOX_GAP);
          page.drawRectangle({
            x: bx, y: qY - BOX,
            width: BOX, height: BOX,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        // Remords boxes (row 2)
        const remY = qY - BOX - REMORD_GAP;
        for (let li = 0; li < LETTERS.length; li++) {
          const bx = boxStartX + li * (BOX + BOX_GAP);
          page.drawRectangle({
            x: bx, y: remY - BOX,
            width: BOX, height: BOX,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        qY -= (2 * BOX + REMORD_GAP + 1.5 * MM);
      }
    }

    // ── Footer
    const footText = `${TOTAL_Q} questions — Grille de réponses`;
    const ftW = font.widthOfTextAtSize(footText, 7);
    page.drawText(footText, {
      x: PAGE_W / 2 - ftW / 2, y: 6 * MM, size: 7, font, color: GRAY,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // UPLOAD
    // ═══════════════════════════════════════════════════════════════════════

    const pdfBytes = await pdfDoc.save();
    const supabase = await createClient();

    const { data, error } = await supabase.storage
      .from("cours-pdfs")
      .upload(`examens/${serieId}/grille.pdf`, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) {
      console.error("[gen-grid] Upload error:", error.message);
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="grille.pdf"` },
      });
    }

    const { data: urlData } = supabase.storage.from("cours-pdfs").getPublicUrl(data.path);
    return NextResponse.json({ success: true, url: urlData.publicUrl, path: data.path });
  } catch (e: any) {
    console.error("[gen-grid]", e);
    return NextResponse.json({ error: e.message || "Erreur serveur" }, { status: 500 });
  }
}
