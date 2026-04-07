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
const MX = mm(8);
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

    let y = PH - mm(6);

    // ═══════════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════════

    const barH = mm(5.5);
    page.drawRectangle({ x: MX, y: y - barH, width: CW, height: barH, color: NAVY });
    page.drawText((institution || "DIPLOMA SANT\u00C9").toUpperCase(), {
      x: MX + mm(2), y: y - barH + mm(1.5), size: 7, font: B, color: WHITE,
    });
    if (academicYear) {
      const aw = F.widthOfTextAtSize(academicYear, 7);
      page.drawText(academicYear, {
        x: MX + CW - aw - mm(2), y: y - barH + mm(1.5), size: 7, font: F, color: GOLD,
      });
    }
    y -= barH + mm(2);

    // Title (more space after bar so it doesn't overlap)
    if (examTitle) {
      let ts = 9;
      while (ts > 5 && B.widthOfTextAtSize(examTitle, ts) > CW - mm(4)) ts -= 0.5;
      const tw = B.widthOfTextAtSize(examTitle, ts);
      page.drawText(examTitle, { x: PW / 2 - tw / 2, y, size: ts, font: B, color: NAVY });
      y -= mm(4);
    }

    // Info line
    const info = [ueCode, subjectName, examDate].filter(Boolean).join("  \u2014  ");
    if (info) {
      const iw = F.widthOfTextAtSize(info, 6.5);
      page.drawText(info, { x: PW / 2 - iw / 2, y, size: 6.5, font: F, color: GRAY });
      y -= mm(3);
    }

    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.3, color: LGRAY });
    y -= mm(1.5);

    // NOM / Prénom (left) + N° étudiant digit grid (right)
    const fH = mm(5);
    const sectionTop = y;

    // NOM
    page.drawText("NOM", { x: MX, y: y - 0.5, size: 7, font: B, color: BLACK });
    page.drawRectangle({ x: MX + mm(10), y: y - mm(1.5), width: mm(50), height: fH, borderWidth: 0.4, borderColor: BLACK, color: WHITE });
    y -= fH + mm(1.5);

    // Prénom
    page.drawText("Pr\u00E9nom", { x: MX, y: y - 0.5, size: 7, font: B, color: BLACK });
    page.drawRectangle({ x: MX + mm(14), y: y - mm(1.5), width: mm(46), height: fH, borderWidth: 0.4, borderColor: BLACK, color: WHITE });

    // N° étudiant: digit grid on the right (8 rows x 10 columns: 0-9)
    const dBox = mm(2.8);
    const dGap = mm(0.3);
    const dCols = 10;
    const dRows = 8;
    const dGridW = dCols * (dBox + dGap) - dGap;
    const dGridX = MX + CW - dGridW;
    let dy = sectionTop - mm(0.5);

    page.drawText("N\u00B0 \u00E9tudiant", { x: dGridX, y: dy, size: 5.5, font: B, color: BLACK });
    dy -= mm(3);

    // Column headers 0-9
    for (let d = 0; d < dCols; d++) {
      const dx = dGridX + d * (dBox + dGap);
      const dw = B.widthOfTextAtSize(String(d), 5.5);
      page.drawText(String(d), { x: dx + dBox / 2 - dw / 2, y: dy, size: 5.5, font: B, color: BLACK });
    }
    dy -= mm(2);

    // Grid cells
    for (let row = 0; row < dRows; row++) {
      for (let d = 0; d < dCols; d++) {
        page.drawRectangle({
          x: dGridX + d * (dBox + dGap), y: dy - row * (dBox + dGap),
          width: dBox, height: dBox,
          borderWidth: 0.3, borderColor: BLACK, color: WHITE,
        });
      }
    }

    // Move Y below both sections
    const belowFields = y - mm(1.5);
    const belowGrid = dy - dRows * (dBox + dGap) - mm(0.5);
    y = Math.min(belowFields, belowGrid) - mm(1);

    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.3, color: LGRAY });
    y -= mm(1);

    // Instruction
    const instrT = "r\u00E9pondez aux questions en noircissant les cases ci-dessous";
    const instrW = B.widthOfTextAtSize(instrT, 6.5);
    page.drawText(instrT, { x: PW / 2 - instrW / 2, y, size: 6.5, font: B, color: BLACK });
    y -= mm(3.5);

    // ═══════════════════════════════════════════════════════════════════
    // QCM GRID — Each question in a bordered frame
    // Layout per question:
    //   ┌──────────────────┐
    //   │ N  □ □ □ □ □     │  answer boxes
    //   │    A B C D E     │  letter labels
    //   │    □ □ □ □ □     │  remords boxes
    //   └──────────────────┘
    // ═══════════════════════════════════════════════════════════════════

    const COL_GAP = mm(2);
    const COL_W = (CW - (COLS - 1) * COL_GAP) / COLS;

    const BOX = mm(3.2);
    const HGAP = mm(0.8);
    const NUM_W = mm(7);

    const LABEL_H = mm(2.8);
    const FRAME_PAD_T = mm(0.8);
    const FRAME_PAD_B = mm(0.5);
    const FRAME_H = FRAME_PAD_T + BOX + LABEL_H + BOX + FRAME_PAD_B;
    const FRAME_GAP = mm(0.8);

    const gridTop = y;

    for (let col = 0; col < COLS; col++) {
      const cx = MX + col * (COL_W + COL_GAP);
      const qStart = col * Q_PER_COL + 1;

      for (let i = 0; i < Q_PER_COL; i++) {
        const q = qStart + i;
        if (q > TOTAL_Q) break;

        const frameTop = gridTop - i * (FRAME_H + FRAME_GAP);

        // Frame border
        page.drawRectangle({
          x: cx, y: frameTop - FRAME_H,
          width: COL_W, height: FRAME_H,
          borderWidth: 0.4, borderColor: BLACK, color: WHITE,
        });

        // Question number
        const qs = String(q);
        page.drawText(qs, {
          x: cx + mm(1.5),
          y: frameTop - FRAME_PAD_T - BOX + mm(0.8),
          size: 8, font: B, color: BLACK,
        });

        const bx0 = cx + NUM_W;

        // Row 1: answer boxes
        const r1y = frameTop - FRAME_PAD_T;
        for (let li = 0; li < 5; li++) {
          page.drawRectangle({
            x: bx0 + li * (BOX + HGAP), y: r1y - BOX,
            width: BOX, height: BOX,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        // Row 2: letter labels
        const labY = r1y - BOX - LABEL_H + mm(0.3);
        for (let li = 0; li < 5; li++) {
          const lx = bx0 + li * (BOX + HGAP);
          const lw = B.widthOfTextAtSize(LETTERS[li], 6.5);
          page.drawText(LETTERS[li], {
            x: lx + BOX / 2 - lw / 2, y: labY,
            size: 6.5, font: B, color: BLACK,
          });
        }

        // Row 3: remords boxes
        const r3y = r1y - BOX - LABEL_H;
        for (let li = 0; li < 5; li++) {
          page.drawRectangle({
            x: bx0 + li * (BOX + HGAP), y: r3y - BOX,
            width: BOX, height: BOX,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }
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
