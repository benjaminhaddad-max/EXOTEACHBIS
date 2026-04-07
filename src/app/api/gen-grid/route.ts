import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const mm = (v: number) => v * 2.835;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.45, 0.45, 0.45);
const LGRAY = rgb(0.75, 0.75, 0.75);
const NAVY = rgb(0x0e / 255, 0x1e / 255, 0x35 / 255);
const GOLD = rgb(0.75, 0.65, 0.35);

const PW = 595.28;
const PH = 841.89;
const MX = mm(10);
const CW = PW - 2 * MX;

const LETTERS = ["A", "B", "C", "D", "E"];
const TOTAL_Q = 72;
const COLS = 4;
const Q_PER_COL = 18;
const GROUP_SIZE = 10;

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

    let y = PH - mm(8);

    // ══════════════════════════════════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════════════════════════════════

    // Navy bar
    const barH = mm(6);
    page.drawRectangle({ x: MX, y: y - barH, width: CW, height: barH, color: NAVY });
    page.drawText((institution || "DIPLOMA SANTÉ").toUpperCase(), {
      x: MX + mm(2), y: y - barH + mm(1.8), size: 7, font: FB, color: WHITE,
    });
    if (academicYear) {
      const aw = F.widthOfTextAtSize(academicYear, 7);
      page.drawText(academicYear, { x: MX + CW - aw - mm(2), y: y - barH + mm(1.8), size: 7, font: F, color: GOLD });
    }
    y -= barH + mm(2);

    // Title + info
    if (examTitle) {
      let ts = 10;
      while (ts > 5 && FB.widthOfTextAtSize(examTitle, ts) > CW - mm(10)) ts -= 0.5;
      const tw = FB.widthOfTextAtSize(examTitle, ts);
      page.drawText(examTitle, { x: PW / 2 - tw / 2, y, size: ts, font: FB, color: NAVY });
      y -= ts + mm(1.5);
    }
    const info = [ueCode, subjectName, examDate].filter(Boolean).join("  \u2014  ");
    if (info) {
      const iw = F.widthOfTextAtSize(info, 7);
      page.drawText(info, { x: PW / 2 - iw / 2, y, size: 7, font: F, color: GRAY });
      y -= mm(4);
    }

    // Separator
    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.3, color: LGRAY });
    y -= mm(2);

    // ── NOM / Prénom (left) + N° étudiant grid (right) ──────────────────

    const sectionTop = y;
    const fH = mm(6);

    // NOM
    page.drawText("NOM", { x: MX, y, size: 8, font: FB, color: BLACK });
    page.drawRectangle({
      x: MX + mm(16), y: y - mm(1.5), width: mm(65), height: fH,
      borderWidth: 0.4, borderColor: BLACK, color: WHITE,
    });
    y -= fH + mm(2.5);

    // Prénom
    page.drawText("Pr\u00E9nom", { x: MX, y, size: 8, font: FB, color: BLACK });
    page.drawRectangle({
      x: MX + mm(16), y: y - mm(1.5), width: mm(65), height: fH,
      borderWidth: 0.4, borderColor: BLACK, color: WHITE,
    });

    // N° étudiant grid — right side
    const dBox = mm(3);
    const dGap = mm(0.3);
    const dCols = 10;
    const dRows = 8;
    const dGridW = dCols * (dBox + dGap) - dGap;
    const dGridX = MX + CW - dGridW;
    let dy = sectionTop + mm(1);

    page.drawText("Saisir votre N\u00B0 d'\u00E9tudiant", { x: dGridX, y: dy, size: 5.5, font: FB, color: BLACK });
    dy -= mm(3);

    // Column headers 0-9
    for (let d = 0; d < dCols; d++) {
      const dw = FB.widthOfTextAtSize(String(d), 5.5);
      page.drawText(String(d), {
        x: dGridX + d * (dBox + dGap) + dBox / 2 - dw / 2, y: dy, size: 5.5, font: FB, color: BLACK,
      });
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
    const belowNom = y - mm(1.5);
    const belowGrid = dy - dRows * (dBox + dGap) - mm(1);
    y = Math.min(belowNom, belowGrid) - mm(2);

    // Separator + instruction
    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.3, color: LGRAY });
    y -= mm(3);
    const instrText = "r\u00E9pondez aux questions en noircissant les cases ci-dessous";
    const instrW = FB.widthOfTextAtSize(instrText, 7);
    page.drawText(instrText, { x: PW / 2 - instrW / 2, y, size: 7, font: FB, color: BLACK });
    y -= mm(4);

    // ══════════════════════════════════════════════════════════════════════
    // QCM GRID — Like real university grids:
    // - 2 rows of boxes per question (answer + remords)
    // - Letter labels (A B C D E) only at bottom of each group of 10
    // - Compact but readable
    // ══════════════════════════════════════════════════════════════════════

    const gridTop = y;
    const gridBottom = mm(6);
    const colGap = mm(3);
    const colW = (CW - (COLS - 1) * colGap) / COLS;

    // Box sizing
    const qBox = mm(3.8);
    const qGap = mm(0.6);
    const remGap = mm(0.3);
    const numW = mm(7);

    // Calculate spacing: each group of 10 has letter labels at bottom + gap
    const numGroups = Math.ceil(Q_PER_COL / GROUP_SIZE);
    const availH = gridTop - gridBottom;
    const letterRowH = mm(3.5); // space for A B C D E labels
    const groupGapH = mm(3); // gap between groups
    const totalFixed = numGroups * letterRowH + (numGroups - 1) * groupGapH;
    const qRowH = (availH - totalFixed) / Q_PER_COL;

    for (let col = 0; col < COLS; col++) {
      const cx = MX + col * (colW + colGap);
      const bx0 = cx + numW;
      const qStart = col * Q_PER_COL + 1;

      // Letter header at top of column
      for (let li = 0; li < LETTERS.length; li++) {
        const lx = bx0 + li * (qBox + qGap);
        const lw = FB.widthOfTextAtSize(LETTERS[li], 7);
        page.drawText(LETTERS[li], {
          x: lx + qBox / 2 - lw / 2, y: gridTop + mm(0.5), size: 7, font: FB, color: BLACK,
        });
      }

      let qY = gridTop;

      for (let i = 0; i < Q_PER_COL; i++) {
        const q = qStart + i;
        if (q > TOTAL_Q) break;

        const groupIdx = Math.floor(i / GROUP_SIZE);
        const inGroup = i % GROUP_SIZE;

        // Extra gap + letter labels between groups
        if (inGroup === 0 && groupIdx > 0) {
          // Letter labels at bottom of previous group
          for (let li = 0; li < LETTERS.length; li++) {
            const lx = bx0 + li * (qBox + qGap);
            const lw = FB.widthOfTextAtSize(LETTERS[li], 6);
            page.drawText(LETTERS[li], {
              x: lx + qBox / 2 - lw / 2, y: qY - letterRowH + mm(1), size: 6, font: FB, color: BLACK,
            });
          }
          qY -= letterRowH + groupGapH;

          // Letter headers for new group
          for (let li = 0; li < LETTERS.length; li++) {
            const lx = bx0 + li * (qBox + qGap);
            const lw = FB.widthOfTextAtSize(LETTERS[li], 7);
            page.drawText(LETTERS[li], {
              x: lx + qBox / 2 - lw / 2, y: qY + mm(0.5), size: 7, font: FB, color: BLACK,
            });
          }
        }

        // Question number
        const qs = String(q);
        const qw = FB.widthOfTextAtSize(qs, 7);
        page.drawText(qs, {
          x: bx0 - qw - mm(1), y: qY - qBox + mm(0.8), size: 7, font: FB, color: BLACK,
        });

        // Answer boxes (top row)
        for (let li = 0; li < LETTERS.length; li++) {
          page.drawRectangle({
            x: bx0 + li * (qBox + qGap), y: qY - qBox,
            width: qBox, height: qBox,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        // Remords boxes (bottom row, directly below)
        for (let li = 0; li < LETTERS.length; li++) {
          page.drawRectangle({
            x: bx0 + li * (qBox + qGap), y: qY - qBox - remGap - qBox,
            width: qBox, height: qBox,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        qY -= qRowH;
      }

      // Final letter labels at bottom of last group
      for (let li = 0; li < LETTERS.length; li++) {
        const lx = bx0 + li * (qBox + qGap);
        const lw = FB.widthOfTextAtSize(LETTERS[li], 6);
        page.drawText(LETTERS[li], {
          x: lx + qBox / 2 - lw / 2, y: qY - letterRowH + mm(1), size: 6, font: FB, color: BLACK,
        });
      }
    }

    // Footer
    const ftText = `${TOTAL_Q} questions \u2014 Grille de r\u00E9ponses`;
    const ftW = F.widthOfTextAtSize(ftText, 5.5);
    page.drawText(ftText, { x: PW / 2 - ftW / 2, y: mm(3), size: 5.5, font: F, color: LGRAY });

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
