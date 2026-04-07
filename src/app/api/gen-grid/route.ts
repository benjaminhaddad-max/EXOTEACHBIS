import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

// ─── Constants ───────────────────────────────────────────────────────────────

const MM = 2.835;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.6, 0.6, 0.6);

// A4 Portrait
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 12 * MM;

// Grid layout: 4 columns, 30 questions per column, groups of 10
const TOTAL_Q = 120;
const COLS = 4;
const Q_PER_COL = 30;
const GROUP_SIZE = 10;

// Box dimensions (small square)
const BOX = 3.2 * MM;   // box width & height
const BOX_GAP = 0.8 * MM; // gap between boxes
const ROW_H = 4.5 * MM; // row height (box + vertical gap)
const NUM_W = 8 * MM;    // question number width
const COL_GAP = 5 * MM;  // gap between columns
const GROUP_GAP = 3 * MM; // extra gap between groups of 10
const LETTERS = ["A", "B", "C", "D", "E"];

// ─── Main Route ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serieId, questionCount = TOTAL_Q, examTitle = "", subjectName = "", examDate = "" } = body;

    if (!serieId) {
      return NextResponse.json({ error: "serieId requis" }, { status: 400 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ── Header: Student info ─────────────────────────────────────────────────

    const headerTop = PAGE_H - MARGIN;

    // Number grid (student ID)
    const numGridX = MARGIN;
    const numGridY = headerTop;

    page.drawText("Saisir votre Numéro d'étudiant", {
      x: numGridX, y: numGridY, size: 7, font, color: BLACK,
    });

    const digitCols = 8;
    const digitRows = 10;
    const digitBox = 3 * MM;
    const digitGap = 0.5 * MM;
    const digitStartY = numGridY - 5 * MM;
    const digitStartX = numGridX;

    // Draw digit labels (0-9) on the left
    for (let r = 0; r < digitRows; r++) {
      page.drawText(String(r), {
        x: digitStartX - 3 * MM,
        y: digitStartY - r * (digitBox + digitGap) - digitBox + 1,
        size: 6, font: fontBold, color: BLACK,
      });
    }

    // Draw digit grid
    for (let c = 0; c < digitCols; c++) {
      for (let r = 0; r < digitRows; r++) {
        page.drawRectangle({
          x: digitStartX + c * (digitBox + digitGap),
          y: digitStartY - r * (digitBox + digitGap) - digitBox,
          width: digitBox, height: digitBox,
          borderWidth: 0.5, borderColor: BLACK, color: WHITE,
        });
      }
    }

    // NOM / Prénom fields
    const fieldsX = MARGIN + 45 * MM;
    page.drawText("NOM", { x: fieldsX, y: numGridY - 2 * MM, size: 11, font: fontBold, color: BLACK });
    page.drawRectangle({
      x: fieldsX + 15 * MM, y: numGridY - 6 * MM, width: 55 * MM, height: 7 * MM,
      borderWidth: 0.5, borderColor: BLACK, color: WHITE,
    });

    page.drawText("Prénom", { x: fieldsX, y: numGridY - 15 * MM, size: 11, font: fontBold, color: BLACK });
    page.drawRectangle({
      x: fieldsX + 15 * MM, y: numGridY - 19 * MM, width: 55 * MM, height: 7 * MM,
      borderWidth: 0.5, borderColor: BLACK, color: WHITE,
    });

    // "Vous pouvez écrire uniquement dans ce cadre"
    page.drawText("Vous pouvez écrire uniquement dans ce cadre", {
      x: fieldsX + 15 * MM, y: numGridY - 30 * MM, size: 6, font, color: GRAY,
    });

    // Instruction line
    const instrY = numGridY - 40 * MM;
    page.drawText("répondez aux questions en noircissant les cases ci-dessous", {
      x: PAGE_W / 2 - font.widthOfTextAtSize("répondez aux questions en noircissant les cases ci-dessous", 9) / 2,
      y: instrY, size: 9, font, color: BLACK,
    });

    // ── QCM Grid ─────────────────────────────────────────────────────────────

    const gridTop = instrY - 8 * MM;
    const gridW = PAGE_W - 2 * MARGIN;
    const colW = (gridW - (COLS - 1) * COL_GAP) / COLS;
    const letterSize = 7;
    const numSize = 7;

    for (let col = 0; col < COLS; col++) {
      const colX = MARGIN + col * (colW + COL_GAP);
      const qStart = col * Q_PER_COL + 1;
      const qEnd = Math.min(qStart + Q_PER_COL - 1, TOTAL_Q);

      // Count groups in this column
      const numGroups = Math.ceil((qEnd - qStart + 1) / GROUP_SIZE);

      for (let g = 0; g < numGroups; g++) {
        const groupStart = qStart + g * GROUP_SIZE;
        const groupEnd = Math.min(groupStart + GROUP_SIZE - 1, qEnd);
        const groupTopY = gridTop - g * (GROUP_SIZE * ROW_H + GROUP_GAP);

        // Letter headers for this group
        for (let li = 0; li < LETTERS.length; li++) {
          const lx = colX + NUM_W + li * (BOX + BOX_GAP);
          const lw = fontBold.widthOfTextAtSize(LETTERS[li], letterSize);
          page.drawText(LETTERS[li], {
            x: lx + BOX / 2 - lw / 2,
            y: groupTopY + 2,
            size: letterSize, font: fontBold, color: BLACK,
          });
        }

        // Questions in this group
        for (let q = groupStart; q <= groupEnd; q++) {
          const inGroup = q - groupStart;
          const rowY = groupTopY - (inGroup + 1) * ROW_H;

          // Question number
          const numStr = String(q);
          const numW2 = fontBold.widthOfTextAtSize(numStr, numSize);
          page.drawText(numStr, {
            x: colX + NUM_W - numW2 - 1.5 * MM,
            y: rowY + 1,
            size: numSize, font: fontBold, color: BLACK,
          });

          // 5 boxes (A B C D E)
          for (let li = 0; li < LETTERS.length; li++) {
            const bx = colX + NUM_W + li * (BOX + BOX_GAP);
            page.drawRectangle({
              x: bx, y: rowY,
              width: BOX, height: BOX,
              borderWidth: 0.5, borderColor: BLACK, color: WHITE,
            });
          }

          // Horizontal line after each question
          const lineY = rowY - 0.3 * MM;
          page.drawLine({
            start: { x: colX + NUM_W, y: lineY },
            end: { x: colX + NUM_W + 5 * (BOX + BOX_GAP) - BOX_GAP, y: lineY },
            thickness: 0.15, color: GRAY,
          });
        }
      }
    }

    // ── Upload to Supabase ───────────────────────────────────────────────────

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
      // Return PDF directly as fallback
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="grille.pdf"`,
        },
      });
    }

    const { data: urlData } = supabase.storage.from("cours-pdfs").getPublicUrl(data.path);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: data.path,
    });
  } catch (e: any) {
    console.error("[gen-grid]", e);
    return NextResponse.json({ error: e.message || "Erreur serveur" }, { status: 500 });
  }
}
