import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

// ─── Units & Colors ─────────────────────────────────────────────────────────

const mm = (v: number) => v * 2.835;

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.5, 0.5, 0.5);
const NAVY = rgb(0x0e / 255, 0x1e / 255, 0x35 / 255);
const GOLD_TEXT = rgb(0.75, 0.65, 0.35);

// ─── Page ────────────────────────────────────────────────────────────────────

const PW = 595.28; // A4
const PH = 841.89;
const MX = mm(12);
const CW = PW - 2 * MX; // content width

// ─── Grid config ─────────────────────────────────────────────────────────────

const LETTERS = ["A", "B", "C", "D", "E"];
const TOTAL_Q = 72;
const COLS = 4;
const Q_PER_COL = 18;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function center(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = BLACK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: PW / 2 - w / 2, y, size, font, color });
}

function fitSize(text: string, maxW: number, maxS: number, font: PDFFont): number {
  let s = maxS;
  while (s > 5 && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
  return s;
}

function drawBox(page: PDFPage, x: number, y: number, w: number, h: number, bw = 0.5) {
  page.drawRectangle({ x, y, width: w, height: h, borderWidth: bw, borderColor: BLACK, color: WHITE });
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

    const doc = await PDFDocument.create();
    const page = doc.addPage([PW, PH]);
    const F = await doc.embedFont(StandardFonts.Helvetica);
    const FB = await doc.embedFont(StandardFonts.HelveticaBold);

    let y = PH - mm(10);

    // ══════════════════════════════════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════════════════════════════════

    // Navy bar
    page.drawRectangle({ x: MX, y: y - mm(7), width: CW, height: mm(7), color: NAVY });
    page.drawText(institution.toUpperCase() || "DIPLOMA SANTÉ", {
      x: MX + mm(3), y: y - mm(5), size: 8, font: FB, color: WHITE,
    });
    if (academicYear) {
      const aw = F.widthOfTextAtSize(academicYear, 8);
      page.drawText(academicYear, { x: MX + CW - aw - mm(3), y: y - mm(5), size: 8, font: F, color: GOLD_TEXT });
    }
    y -= mm(10);

    // Title
    if (examTitle) {
      const ts = fitSize(examTitle, CW - mm(10), 11, FB);
      center(page, examTitle, y, ts, FB, NAVY);
      y -= ts * 1.2 + mm(1);
    }

    // Info line
    const info = [ueCode, subjectName, examDate].filter(Boolean).join("  \u2014  ");
    if (info) { center(page, info, y, 7, F, GRAY); y -= mm(4); }

    // Separator
    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.4, color: GRAY });
    y -= mm(3);

    // ── Left: NOM / Prénom ──────────────────────────────────────────────

    const fH = mm(7);
    const leftEnd = MX + CW * 0.52;
    const labelW = mm(18);

    // NOM
    page.drawText("NOM", { x: MX, y: y - mm(1), size: 9, font: FB, color: BLACK });
    drawBox(page, MX + labelW, y - fH + mm(2), leftEnd - MX - labelW, fH);
    y -= fH + mm(3);

    // Prénom
    page.drawText("Prénom", { x: MX, y: y - mm(1), size: 9, font: FB, color: BLACK });
    drawBox(page, MX + labelW, y - fH + mm(2), leftEnd - MX - labelW, fH);

    // ── Right: N° étudiant grid (8 rows × 10 cols: 0-9) ────────────────

    const gridRight = MX + CW;
    const dBox = mm(3.2);
    const dGap = mm(0.3);
    const dCols = 10; // digits 0-9
    const dRows = 8;  // 8-digit number
    const dGridW = dCols * (dBox + dGap) - dGap;
    const dGridX = gridRight - dGridW;
    const dGridTopY = y + fH + mm(3); // align with NOM row

    // Title
    page.drawText("Saisir votre N\u00B0 d'\u00E9tudiant", {
      x: dGridX, y: dGridTopY + mm(2), size: 6, font: FB, color: BLACK,
    });

    // Digit headers 0-9
    for (let d = 0; d < dCols; d++) {
      const dx = dGridX + d * (dBox + dGap);
      const dw = FB.widthOfTextAtSize(String(d), 6);
      page.drawText(String(d), { x: dx + dBox / 2 - dw / 2, y: dGridTopY - mm(1), size: 6, font: FB, color: BLACK });
    }

    // Grid boxes
    for (let row = 0; row < dRows; row++) {
      for (let d = 0; d < dCols; d++) {
        drawBox(page, dGridX + d * (dBox + dGap), dGridTopY - mm(4) - row * (dBox + dGap), dBox, dBox, 0.3);
      }
    }

    // Move Y below both sections
    const bottomOfHeader = Math.min(
      y - fH,
      dGridTopY - mm(4) - dRows * (dBox + dGap)
    );
    y = bottomOfHeader - mm(3);

    // Separator
    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.4, color: GRAY });
    y -= mm(1);

    // Instruction
    center(page, "R\u00E9pondez aux questions en noircissant les cases ci-dessous", y, 7, F, GRAY);
    y -= mm(4);

    // ══════════════════════════════════════════════════════════════════════
    // QCM GRID
    // ══════════════════════════════════════════════════════════════════════

    const gridTop = y;
    const gridBottom = mm(8); // footer margin
    const colGap = mm(4);
    const colW = (CW - (COLS - 1) * colGap) / COLS;

    // Box sizing for QCM
    const qBox = mm(4.2);   // answer box size
    const qGap = mm(1.2);   // gap between boxes
    const remGap = mm(0.8);  // gap between answer row and remords row
    const numColW = mm(8);   // width for question number

    // Row height: top boxes + letter label + bottom boxes + spacing
    const letterH = mm(3);
    const qRowH = (gridTop - gridBottom) / Q_PER_COL;

    for (let col = 0; col < COLS; col++) {
      const cx = MX + col * (colW + colGap);
      const bx0 = cx + numColW;
      const qStart = col * Q_PER_COL + 1;

      for (let i = 0; i < Q_PER_COL; i++) {
        const q = qStart + i;
        if (q > TOTAL_Q) break;

        const rowTop = gridTop - i * qRowH;

        // ── Question number
        const qs = String(q);
        const qw = FB.widthOfTextAtSize(qs, 8);
        page.drawText(qs, {
          x: bx0 - qw - mm(1.5),
          y: rowTop - qBox + mm(0.5),
          size: 8, font: FB, color: BLACK,
        });

        // ── Top row: answer boxes
        for (let li = 0; li < LETTERS.length; li++) {
          drawBox(page, bx0 + li * (qBox + qGap), rowTop - qBox, qBox, qBox, 0.4);
        }

        // ── Letter labels centered under each top box
        const labY = rowTop - qBox - remGap;
        for (let li = 0; li < LETTERS.length; li++) {
          const lx = bx0 + li * (qBox + qGap);
          const lw = F.widthOfTextAtSize(LETTERS[li], 6);
          page.drawText(LETTERS[li], {
            x: lx + qBox / 2 - lw / 2,
            y: labY,
            size: 6, font: F, color: GRAY,
          });
        }

        // ── Bottom row: remords boxes
        const remTop = labY - mm(1.5);
        for (let li = 0; li < LETTERS.length; li++) {
          drawBox(page, bx0 + li * (qBox + qGap), remTop - qBox, qBox, qBox, 0.4);
        }
      }
    }

    // Footer
    center(page, `${TOTAL_Q} questions \u2014 Grille de r\u00E9ponses`, mm(4), 6, F, GRAY);

    // ══════════════════════════════════════════════════════════════════════
    // UPLOAD
    // ══════════════════════════════════════════════════════════════════════

    const pdfBytes = await doc.save();
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("cours-pdfs")
      .upload(`examens/${serieId}/grille.pdf`, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: true });

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
