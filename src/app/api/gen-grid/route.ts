import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const mm = (v: number) => v * 2.835;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.45, 0.45, 0.45);
const LGRAY = rgb(0.7, 0.7, 0.7);
const NAVY = rgb(0.055, 0.118, 0.208);
const GOLD = rgb(0.75, 0.65, 0.35);

const PW = 595.28;
const PH = 841.89;
const MX = mm(12);
const CW = PW - 2 * MX;

const LETTERS = ["A", "B", "C", "D", "E"];
const TOTAL_Q = 72;
const COLS = 4;
const Q_PER_COL = 18;

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
    const B = await doc.embedFont(StandardFonts.HelveticaBold);

    let y = PH - mm(8);

    // ═══════════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════════

    // Navy bar
    page.drawRectangle({ x: MX, y: y - mm(7), width: CW, height: mm(7), color: NAVY });
    page.drawText((institution || "DIPLOMA SANT\u00C9").toUpperCase(), {
      x: MX + mm(3), y: y - mm(5), size: 8, font: B, color: WHITE,
    });
    if (academicYear) {
      const aw = F.widthOfTextAtSize(academicYear, 8);
      page.drawText(academicYear, {
        x: MX + CW - aw - mm(3), y: y - mm(5), size: 8, font: F, color: GOLD,
      });
    }
    y -= mm(9);

    // Title
    if (examTitle) {
      let ts = 11;
      while (ts > 5 && B.widthOfTextAtSize(examTitle, ts) > CW - mm(4)) ts -= 0.5;
      const tw = B.widthOfTextAtSize(examTitle, ts);
      page.drawText(examTitle, { x: PW / 2 - tw / 2, y, size: ts, font: B, color: NAVY });
      y -= mm(5);
    }

    // Info line
    const info = [ueCode, subjectName, examDate].filter(Boolean).join("  \u2014  ");
    if (info) {
      const iw = F.widthOfTextAtSize(info, 7);
      page.drawText(info, { x: PW / 2 - iw / 2, y, size: 7, font: F, color: GRAY });
      y -= mm(4);
    }

    // Separator
    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.3, color: LGRAY });
    y -= mm(2);

    // NOM / Prénom / N° étudiant — one row
    const fH = mm(5.5);
    page.drawText("NOM", { x: MX, y: y - 1, size: 8, font: B, color: BLACK });
    page.drawRectangle({ x: MX + mm(11), y: y - mm(2), width: mm(42), height: fH, borderWidth: 0.4, borderColor: BLACK, color: WHITE });

    page.drawText("Pr\u00E9nom", { x: MX + mm(56), y: y - 1, size: 8, font: B, color: BLACK });
    page.drawRectangle({ x: MX + mm(70), y: y - mm(2), width: mm(42), height: fH, borderWidth: 0.4, borderColor: BLACK, color: WHITE });

    page.drawText("N\u00B0 \u00E9tudiant", { x: MX + mm(115), y: y - 1, size: 8, font: B, color: BLACK });
    page.drawRectangle({ x: MX + mm(133), y: y - mm(2), width: mm(33), height: fH, borderWidth: 0.4, borderColor: BLACK, color: WHITE });

    y -= fH + mm(3);
    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.3, color: LGRAY });
    y -= mm(1.5);

    // Instruction
    const instrT = "r\u00E9pondez aux questions en noircissant les cases ci-dessous";
    const instrW = B.widthOfTextAtSize(instrT, 7);
    page.drawText(instrT, { x: PW / 2 - instrW / 2, y, size: 7, font: B, color: BLACK });
    y -= mm(5);

    // ═══════════════════════════════════════════════════════════════════
    // QCM GRID
    // ═══════════════════════════════════════════════════════════════════

    const BOX = mm(4.5);
    const HGAP = mm(1.5);
    const COL_GAP = mm(4);
    const COL_W = (CW - (COLS - 1) * COL_GAP) / COLS;
    const NUM_W = mm(9);

    const gridTop = y;
    const gridBot = mm(6);
    const availH = gridTop - gridBot;

    const LETTER_ROW_H = mm(5);
    const GROUP_GAP = mm(4);
    const fixedH = 3 * LETTER_ROW_H + GROUP_GAP;
    const qSpace = (availH - fixedH) / Q_PER_COL;

    for (let col = 0; col < COLS; col++) {
      const cx = MX + col * (COL_W + COL_GAP);
      const bx0 = cx + NUM_W;
      const qStart = col * Q_PER_COL + 1;
      let qy = gridTop;

      // Letter header for group 1
      for (let li = 0; li < 5; li++) {
        const x = bx0 + li * (BOX + HGAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 9);
        page.drawText(LETTERS[li], { x: x + BOX / 2 - lw / 2, y: qy - mm(3.5), size: 9, font: B, color: BLACK });
      }
      qy -= LETTER_ROW_H;

      // Questions 1-10
      for (let i = 0; i < 10; i++) {
        const q = qStart + i;
        if (q > TOTAL_Q) break;

        const qs = String(q);
        const qw = B.widthOfTextAtSize(qs, 8);
        page.drawText(qs, { x: bx0 - qw - mm(1.5), y: qy - BOX + mm(1.5), size: 8, font: B, color: BLACK });

        for (let li = 0; li < 5; li++) {
          const x = bx0 + li * (BOX + HGAP);
          page.drawRectangle({ x, y: qy - BOX, width: BOX, height: BOX, borderWidth: 0.5, borderColor: BLACK, color: WHITE });
        }
        for (let li = 0; li < 5; li++) {
          const x = bx0 + li * (BOX + HGAP);
          page.drawRectangle({ x, y: qy - BOX - mm(0.5) - BOX, width: BOX, height: BOX, borderWidth: 0.5, borderColor: BLACK, color: WHITE });
        }

        qy -= qSpace;
      }

      // Letter footer group 1
      for (let li = 0; li < 5; li++) {
        const x = bx0 + li * (BOX + HGAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 8);
        page.drawText(LETTERS[li], { x: x + BOX / 2 - lw / 2, y: qy - mm(1), size: 8, font: B, color: BLACK });
      }
      qy -= LETTER_ROW_H;
      qy -= GROUP_GAP;

      // Letter header for group 2
      for (let li = 0; li < 5; li++) {
        const x = bx0 + li * (BOX + HGAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 9);
        page.drawText(LETTERS[li], { x: x + BOX / 2 - lw / 2, y: qy - mm(3.5), size: 9, font: B, color: BLACK });
      }
      qy -= LETTER_ROW_H;

      // Questions 11-18
      for (let i = 10; i < Q_PER_COL; i++) {
        const q = qStart + i;
        if (q > TOTAL_Q) break;

        const qs = String(q);
        const qw = B.widthOfTextAtSize(qs, 8);
        page.drawText(qs, { x: bx0 - qw - mm(1.5), y: qy - BOX + mm(1.5), size: 8, font: B, color: BLACK });

        for (let li = 0; li < 5; li++) {
          const x = bx0 + li * (BOX + HGAP);
          page.drawRectangle({ x, y: qy - BOX, width: BOX, height: BOX, borderWidth: 0.5, borderColor: BLACK, color: WHITE });
        }
        for (let li = 0; li < 5; li++) {
          const x = bx0 + li * (BOX + HGAP);
          page.drawRectangle({ x, y: qy - BOX - mm(0.5) - BOX, width: BOX, height: BOX, borderWidth: 0.5, borderColor: BLACK, color: WHITE });
        }

        qy -= qSpace;
      }

      // Letter footer group 2
      for (let li = 0; li < 5; li++) {
        const x = bx0 + li * (BOX + HGAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 8);
        page.drawText(LETTERS[li], { x: x + BOX / 2 - lw / 2, y: qy - mm(1), size: 8, font: B, color: BLACK });
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // UPLOAD
    // ═══════════════════════════════════════════════════════════════════

    const pdfBytes = await doc.save();
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("cours-pdfs")
      .upload(`examens/${serieId}/grille.pdf`, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
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
