import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const MM = 2.835;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.55, 0.55, 0.55);
const LIGHT_GRAY = rgb(0.8, 0.8, 0.8);
const NAVY = rgb(0x0e / 255, 0x1e / 255, 0x35 / 255);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 8 * MM; // margin X
const MY = 8 * MM; // margin top/bottom

const TOTAL_Q = 72;
const COLS = 4;
const Q_PER_COL = 18;
const LETTERS = ["A", "B", "C", "D", "E"];

const BOX = 3.5 * MM;
const BOX_GAP = 0.8 * MM;
const REMORD_GAP = 0.4 * MM;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function centerText(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = BLACK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: PAGE_W / 2 - w / 2, y, size, font, color });
}

function fitText(text: string, maxW: number, maxSize: number, font: PDFFont): number {
  let s = maxSize;
  while (s > 4 && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
  return s;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      serieId, examTitle = "", ueCode = "", subjectName = "",
      examDate = "", institution = "", academicYear = "",
    } = body;

    if (!serieId) return NextResponse.json({ error: "serieId requis" }, { status: 400 });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const cW = PAGE_W - 2 * MX; // content width
    let y = PAGE_H - MY;

    // ═══════════════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════════════

    // Navy bar
    const barH = 7 * MM;
    page.drawRectangle({ x: MX, y: y - barH, width: cW, height: barH, color: NAVY });
    if (institution) {
      page.drawText(institution.toUpperCase(), {
        x: MX + 2 * MM, y: y - barH + 2 * MM, size: 8, font: fontBold, color: WHITE,
      });
    }
    if (academicYear) {
      const aw = font.widthOfTextAtSize(academicYear, 8);
      page.drawText(academicYear, {
        x: MX + cW - aw - 2 * MM, y: y - barH + 2 * MM, size: 8, font, color: rgb(0.8, 0.7, 0.4),
      });
    }
    y -= barH + 2 * MM;

    // Title
    if (examTitle) {
      const ts = fitText(examTitle, cW - 10 * MM, 11, fontBold);
      centerText(page, examTitle, y, ts, fontBold, NAVY);
      y -= ts + 2 * MM;
    }

    // UE — Matière — Date
    const infoLine = [ueCode, subjectName, examDate].filter(Boolean).join("  —  ");
    if (infoLine) {
      centerText(page, infoLine, y, 7, font, GRAY);
      y -= 4 * MM;
    }

    // Thin separator
    page.drawLine({ start: { x: MX, y }, end: { x: MX + cW, y }, thickness: 0.4, color: LIGHT_GRAY });
    y -= 3 * MM;

    // ── NOM / Prénom / N° étudiant ──────────────────────────────────────

    // Left side: NOM + Prénom fields
    const fieldH = 6 * MM;
    const leftW = cW * 0.55;

    // NOM
    page.drawText("NOM", { x: MX, y: y - 1, size: 8, font: fontBold, color: BLACK });
    const nomBoxX = MX + 12 * MM;
    page.drawRectangle({
      x: nomBoxX, y: y - fieldH + 2, width: leftW - 12 * MM, height: fieldH,
      borderWidth: 0.4, borderColor: BLACK, color: WHITE,
    });
    y -= fieldH + 2 * MM;

    // Prénom
    page.drawText("Prénom", { x: MX, y: y - 1, size: 8, font: fontBold, color: BLACK });
    page.drawRectangle({
      x: nomBoxX, y: y - fieldH + 2, width: leftW - 12 * MM, height: fieldH,
      borderWidth: 0.4, borderColor: BLACK, color: WHITE,
    });
    y -= fieldH + 2 * MM;

    // Right side: N° étudiant digit grid (vertical columns 0-9)
    const numGridX = MX + leftW + 5 * MM;
    const numGridTop = y + 2 * fieldH + 4 * MM; // align with NOM/Prénom top
    const digitCols = 8; // 8-digit student number
    const digitRows = 10; // digits 0-9
    const dBox = 2.8 * MM;
    const dGap = 0.4 * MM;

    // Title
    page.drawText("N° étudiant", {
      x: numGridX, y: numGridTop + 1, size: 6, font: fontBold, color: BLACK,
    });

    // Column headers (0-9)
    const dgStartY = numGridTop - 3 * MM;
    for (let d = 0; d < digitRows; d++) {
      const dx = numGridX + d * (dBox + dGap);
      const dw = font.widthOfTextAtSize(String(d), 6);
      page.drawText(String(d), {
        x: dx + dBox / 2 - dw / 2, y: dgStartY + 1, size: 6, font: fontBold, color: BLACK,
      });
    }

    // Grid: each row = one digit position, columns = 0-9
    for (let row = 0; row < digitCols; row++) {
      for (let d = 0; d < digitRows; d++) {
        page.drawRectangle({
          x: numGridX + d * (dBox + dGap),
          y: dgStartY - (row + 1) * (dBox + dGap),
          width: dBox, height: dBox,
          borderWidth: 0.3, borderColor: BLACK, color: WHITE,
        });
      }
    }

    // Separator before grid
    y -= 1 * MM;
    page.drawLine({ start: { x: MX, y }, end: { x: MX + cW, y }, thickness: 0.4, color: LIGHT_GRAY });
    y -= 1 * MM;

    // Instruction
    centerText(page, "Répondez aux questions en noircissant les cases ci-dessous", y, 7, font, GRAY);
    y -= 4 * MM;

    // ═══════════════════════════════════════════════════════════════════════
    // QCM GRID — A B C D E on EVERY question
    // ═══════════════════════════════════════════════════════════════════════

    const gridTop = y;
    const colGap = 3 * MM;
    const colW = (cW - (COLS - 1) * colGap) / COLS;
    const numW = 6 * MM;
    const boxStartOffset = numW;
    const letterSize = 5.5;

    // Calculate row height dynamically
    // Each question: answer boxes + letter labels + remords boxes + spacing
    const availH = gridTop - MY;
    const rowH = availH / Q_PER_COL;

    for (let col = 0; col < COLS; col++) {
      const colX = MX + col * (colW + colGap);
      const qStart = col * Q_PER_COL + 1;
      const qEnd = Math.min(qStart + Q_PER_COL - 1, TOTAL_Q);
      const bx0 = colX + boxStartOffset;

      for (let q = qStart; q <= qEnd; q++) {
        const inCol = q - qStart;
        const qY = gridTop - inCol * rowH;

        // Question number
        const numStr = String(q);
        const nw = fontBold.widthOfTextAtSize(numStr, 7);
        page.drawText(numStr, {
          x: bx0 - nw - 1 * MM, y: qY - BOX + 1, size: 7, font: fontBold, color: BLACK,
        });

        // Answer row: boxes with letter inside each
        for (let li = 0; li < LETTERS.length; li++) {
          const bx = bx0 + li * (BOX + BOX_GAP);
          // Box
          page.drawRectangle({
            x: bx, y: qY - BOX,
            width: BOX, height: BOX,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        // Letter labels between answer and remords rows
        const labelY = qY - BOX - REMORD_GAP - 0.5;
        for (let li = 0; li < LETTERS.length; li++) {
          const bx = bx0 + li * (BOX + BOX_GAP);
          const lw = font.widthOfTextAtSize(LETTERS[li], letterSize);
          page.drawText(LETTERS[li], {
            x: bx + BOX / 2 - lw / 2, y: labelY, size: letterSize, font, color: GRAY,
          });
        }

        // Remords row
        const remY = labelY - letterSize - REMORD_GAP;
        for (let li = 0; li < LETTERS.length; li++) {
          const bx = bx0 + li * (BOX + BOX_GAP);
          page.drawRectangle({
            x: bx, y: remY - BOX,
            width: BOX, height: BOX,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }
      }
    }

    // Footer
    centerText(page, `${TOTAL_Q} questions — Grille de réponses`, MY - 4 * MM, 6, font, GRAY);

    // ═══════════════════════════════════════════════════════════════════════
    // UPLOAD
    // ═══════════════════════════════════════════════════════════════════════

    const pdfBytes = await pdfDoc.save();
    const supabase = await createClient();

    const { data, error } = await supabase.storage
      .from("cours-pdfs")
      .upload(`examens/${serieId}/grille.pdf`, Buffer.from(pdfBytes), {
        contentType: "application/pdf", upsert: true,
      });

    if (error) {
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
