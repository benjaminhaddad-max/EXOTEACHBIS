import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const pt = (mm: number) => mm * 2.835;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.45, 0.45, 0.45);
const LGRAY = rgb(0.7, 0.7, 0.7);
const NAVY = rgb(0x0e / 255, 0x1e / 255, 0x35 / 255);
const GOLD = rgb(0.75, 0.65, 0.35);

const PW = 595.28;
const PH = 841.89;

const LETTERS = ["A", "B", "C", "D", "E"];
const TOTAL_Q = 72;
const COLS = 4;
const Q_PER_COL = 18;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serieId, examTitle = "", ueCode = "", subjectName = "", examDate = "", institution = "", academicYear = "" } = body;
    if (!serieId) return NextResponse.json({ error: "serieId requis" }, { status: 400 });

    const doc = await PDFDocument.create();
    const page = doc.addPage([PW, PH]);
    const F = await doc.embedFont(StandardFonts.Helvetica);
    const B = await doc.embedFont(StandardFonts.HelveticaBold);

    const MX = pt(10); // margin X
    const CW = PW - 2 * MX;

    // ══════════════════════════════════════════════════════════════════════
    // HEADER (compact)
    // ══════════════════════════════════════════════════════════════════════

    let y = PH - pt(8);

    // Navy bar
    const barH = pt(6);
    page.drawRectangle({ x: MX, y: y - barH, width: CW, height: barH, color: NAVY });
    page.drawText((institution || "DIPLOMA SANTÉ").toUpperCase(), { x: MX + pt(2), y: y - barH + pt(1.8), size: 7, font: B, color: WHITE });
    if (academicYear) {
      const aw = F.widthOfTextAtSize(academicYear, 7);
      page.drawText(academicYear, { x: MX + CW - aw - pt(2), y: y - barH + pt(1.8), size: 7, font: F, color: GOLD });
    }
    y -= barH + pt(1.5);

    // Title
    if (examTitle) {
      let sz = 10;
      while (sz > 5 && B.widthOfTextAtSize(examTitle, sz) > CW - pt(6)) sz -= 0.5;
      const tw = B.widthOfTextAtSize(examTitle, sz);
      page.drawText(examTitle, { x: PW / 2 - tw / 2, y, size: sz, font: B, color: NAVY });
      y -= sz + pt(1);
    }

    // Info line
    const info = [ueCode, subjectName, examDate].filter(Boolean).join("  \u2014  ");
    if (info) {
      const iw = F.widthOfTextAtSize(info, 7);
      page.drawText(info, { x: PW / 2 - iw / 2, y, size: 7, font: F, color: GRAY });
      y -= pt(3);
    }

    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.3, color: LGRAY });
    y -= pt(2);

    // NOM / Prénom / N° étudiant — all on one line
    const fH = pt(5.5);
    page.drawText("NOM", { x: MX, y: y - pt(0.5), size: 7, font: B, color: BLACK });
    page.drawRectangle({ x: MX + pt(10), y: y - pt(1.5), width: pt(40), height: fH, borderWidth: 0.4, borderColor: BLACK, color: WHITE });

    page.drawText("Pr\u00E9nom", { x: MX + pt(53), y: y - pt(0.5), size: 7, font: B, color: BLACK });
    page.drawRectangle({ x: MX + pt(67), y: y - pt(1.5), width: pt(40), height: fH, borderWidth: 0.4, borderColor: BLACK, color: WHITE });

    page.drawText("N\u00B0 \u00E9tudiant", { x: MX + pt(110), y: y - pt(0.5), size: 7, font: B, color: BLACK });
    page.drawRectangle({ x: MX + pt(130), y: y - pt(1.5), width: pt(35), height: fH, borderWidth: 0.4, borderColor: BLACK, color: WHITE });

    y -= fH + pt(3);
    page.drawLine({ start: { x: MX, y }, end: { x: MX + CW, y }, thickness: 0.3, color: LGRAY });
    y -= pt(1.5);

    // Instruction
    const instrText = "R\u00E9pondez aux questions en noircissant les cases ci-dessous";
    const instrW = B.widthOfTextAtSize(instrText, 6.5);
    page.drawText(instrText, { x: PW / 2 - instrW / 2, y, size: 6.5, font: B, color: BLACK });
    y -= pt(4);

    // ══════════════════════════════════════════════════════════════════════
    // QCM GRID
    // ══════════════════════════════════════════════════════════════════════

    // Dimensions
    const BOX = pt(4);        // box size
    const GAP = pt(1);        // horizontal gap between boxes
    const NUM_W = pt(8);      // question number column width
    const COL_GAP = pt(2.5);  // gap between columns
    const COL_W = (CW - (COLS - 1) * COL_GAP) / COLS;

    // Vertical spacing: need to fit 18 questions + 2 header rows + 1 group separator
    const gridTop = y;
    const gridBottom = pt(5);
    const availH = gridTop - gridBottom;

    // Each question = 2 rows of boxes (answer + remords) with tiny gap
    // Plus letter header rows (2 per column: top + after Q10) and group gap
    const HEADER_H = pt(4);     // height for A B C D E header row
    const GROUP_GAP = pt(2);    // extra gap between group 1-10 and 11-18
    const Q_VGAP = pt(0.5);    // tiny gap between answer and remords rows
    const fixedH = 2 * HEADER_H + GROUP_GAP; // 2 letter headers + 1 group gap
    const perQ = (availH - fixedH) / Q_PER_COL; // height per question

    for (let col = 0; col < COLS; col++) {
      const cx = MX + col * (COL_W + COL_GAP);
      const bx0 = cx + NUM_W; // where boxes start
      const qStart = col * Q_PER_COL + 1;

      let qy = gridTop;

      // ── Letter header for first group ──
      for (let li = 0; li < LETTERS.length; li++) {
        const x = bx0 + li * (BOX + GAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 8);
        page.drawText(LETTERS[li], { x: x + BOX / 2 - lw / 2, y: qy - HEADER_H + pt(0.5), size: 8, font: B, color: BLACK });
      }
      qy -= HEADER_H;

      // ── Questions 1-10 ──
      for (let i = 0; i < Math.min(10, Q_PER_COL); i++) {
        const q = qStart + i;
        if (q > TOTAL_Q) break;

        // Question number
        const qs = String(q);
        const qw = B.widthOfTextAtSize(qs, 7.5);
        page.drawText(qs, { x: bx0 - qw - pt(1), y: qy - BOX + pt(1), size: 7.5, font: B, color: BLACK });

        // Answer row
        for (let li = 0; li < LETTERS.length; li++) {
          page.drawRectangle({
            x: bx0 + li * (BOX + GAP), y: qy - BOX,
            width: BOX, height: BOX, borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        // Remords row (directly below)
        for (let li = 0; li < LETTERS.length; li++) {
          page.drawRectangle({
            x: bx0 + li * (BOX + GAP), y: qy - BOX - Q_VGAP - BOX,
            width: BOX, height: BOX, borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        qy -= perQ;
      }

      // ── Letter footer for group 1 + header for group 2 ──
      for (let li = 0; li < LETTERS.length; li++) {
        const x = bx0 + li * (BOX + GAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 7);
        // Bottom labels of group 1
        page.drawText(LETTERS[li], { x: x + BOX / 2 - lw / 2, y: qy + pt(0.5), size: 7, font: B, color: BLACK });
      }
      qy -= GROUP_GAP;

      // Top labels for group 2
      for (let li = 0; li < LETTERS.length; li++) {
        const x = bx0 + li * (BOX + GAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 8);
        page.drawText(LETTERS[li], { x: x + BOX / 2 - lw / 2, y: qy - HEADER_H + pt(0.5), size: 8, font: B, color: BLACK });
      }
      qy -= HEADER_H;

      // ── Questions 11-18 ──
      for (let i = 10; i < Q_PER_COL; i++) {
        const q = qStart + i;
        if (q > TOTAL_Q) break;

        const qs = String(q);
        const qw = B.widthOfTextAtSize(qs, 7.5);
        page.drawText(qs, { x: bx0 - qw - pt(1), y: qy - BOX + pt(1), size: 7.5, font: B, color: BLACK });

        for (let li = 0; li < LETTERS.length; li++) {
          page.drawRectangle({
            x: bx0 + li * (BOX + GAP), y: qy - BOX,
            width: BOX, height: BOX, borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        for (let li = 0; li < LETTERS.length; li++) {
          page.drawRectangle({
            x: bx0 + li * (BOX + GAP), y: qy - BOX - Q_VGAP - BOX,
            width: BOX, height: BOX, borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        qy -= perQ;
      }

      // ── Letter footer for group 2 ──
      for (let li = 0; li < LETTERS.length; li++) {
        const x = bx0 + li * (BOX + GAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 7);
        page.drawText(LETTERS[li], { x: x + BOX / 2 - lw / 2, y: qy + pt(0.5), size: 7, font: B, color: BLACK });
      }
    }

    // Footer
    const ftText = `${TOTAL_Q} questions \u2014 Grille de r\u00E9ponses`;
    const ftW = F.widthOfTextAtSize(ftText, 5);
    page.drawText(ftText, { x: PW / 2 - ftW / 2, y: pt(2), size: 5, font: F, color: LGRAY });

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
