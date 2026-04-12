import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import * as path from "path";
import { promises as fs } from "fs";
import sharp from "sharp";

export const maxDuration = 30;

const mm = (v: number) => v * 2.835;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

const PW = 595.28; // A4 width
const PH = 841.89; // A4 height

const LETTERS = ["A", "B", "C", "D", "E"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      serieId, examTitle = "", ueCode = "", subjectName = "",
      examDate = "", institution = "", academicYear = "",
    } = body;

    if (!serieId) return NextResponse.json({ error: "serieId requis" }, { status: 400 });

    // Get actual question count for this serie
    const supabaseRead = await createClient();
    const { count: questionCount } = await supabaseRead
      .from("series_questions")
      .select("*", { count: "exact", head: true })
      .eq("series_id", serieId);
    const TOTAL_Q = questionCount || 72;

    const doc = await PDFDocument.create();
    const page = doc.addPage([PW, PH]);
    const F = await doc.embedFont(StandardFonts.Helvetica);
    const B = await doc.embedFont(StandardFonts.HelveticaBold);

    // Load B&W SVG logo
    let logo = null;
    try {
      const svgPath = path.join(process.cwd(), "public", "ds-logo-2026-bw.svg");
      const svgBuf = await fs.readFile(svgPath);
      const pngBuf = await sharp(svgBuf).resize({ height: 200 }).png().toBuffer();
      logo = await doc.embedPng(pngBuf);
    } catch (e) { console.error("[gen-grid] logo error", e); }

    // ═══════════════════════════════════════════════════════════════════
    // LAYOUT CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    const MARK_W = mm(1.5);        // alignment mark thickness
    const PAGE_MARGIN = mm(3);     // distance from page edge to marks
    const CONTENT_MARGIN = mm(10); // distance from page edge to content

    // Content area (inside alignment marks)
    const CX = CONTENT_MARGIN;                    // content left
    const CW = PW - 2 * CONTENT_MARGIN;           // content width
    const CY_TOP = PH - CONTENT_MARGIN;           // content top
    const CY_BOT = CONTENT_MARGIN;                // content bottom

    // ═══════════════════════════════════════════════════════════════════
    // ALIGNMENT MARKS — L-shaped corner marks at 4 corners
    // ═══════════════════════════════════════════════════════════════════
    const MARK_LEN = mm(8); // arm length of L-mark

    // Top-left corner
    page.drawRectangle({ x: PAGE_MARGIN, y: CY_TOP - MARK_W, width: MARK_LEN, height: MARK_W, color: BLACK });
    page.drawRectangle({ x: PAGE_MARGIN, y: CY_TOP - MARK_LEN, width: MARK_W, height: MARK_LEN, color: BLACK });

    // Top-right corner
    page.drawRectangle({ x: PW - PAGE_MARGIN - MARK_LEN, y: CY_TOP - MARK_W, width: MARK_LEN, height: MARK_W, color: BLACK });
    page.drawRectangle({ x: PW - PAGE_MARGIN - MARK_W, y: CY_TOP - MARK_LEN, width: MARK_W, height: MARK_LEN, color: BLACK });

    // Bottom-left corner
    page.drawRectangle({ x: PAGE_MARGIN, y: CY_BOT, width: MARK_LEN, height: MARK_W, color: BLACK });
    page.drawRectangle({ x: PAGE_MARGIN, y: CY_BOT, width: MARK_W, height: MARK_LEN, color: BLACK });

    // Bottom-right corner
    page.drawRectangle({ x: PW - PAGE_MARGIN - MARK_LEN, y: CY_BOT, width: MARK_LEN, height: MARK_W, color: BLACK });
    page.drawRectangle({ x: PW - PAGE_MARGIN - MARK_W, y: CY_BOT, width: MARK_W, height: MARK_LEN, color: BLACK });

    // ═══════════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════════

    let y = CY_TOP - mm(2); // start below top marks
    const barH = mm(18);
    page.drawRectangle({ x: CX, y: y - barH, width: CW, height: barH, borderWidth: 1.2, borderColor: BLACK, color: WHITE });

    if (logo) {
      const logoH = barH - mm(3);
      const logoW = logoH * (logo.width / logo.height);
      page.drawImage(logo, {
        x: CX + mm(2), y: y - barH + (barH - logoH) / 2,
        width: logoW, height: logoH,
      });
    }

    const yearText = academicYear || "2026 - 2027";
    const yw = B.widthOfTextAtSize(yearText, 10);
    page.drawText(yearText, {
      x: CX + CW - yw - mm(3), y: y - barH + (barH - 10) / 2,
      size: 10, font: B, color: BLACK,
    });

    if (examTitle) {
      let titleText = examTitle;
      if (ueCode && titleText.includes(ueCode)) {
        titleText = titleText.replace(new RegExp(`\\s*[\u2014\\-]\\s*${ueCode}.*$`), "").trim();
      }
      let ts = 11;
      while (ts > 5 && B.widthOfTextAtSize(titleText, ts) > CW - mm(70)) ts -= 0.5;
      const tw = B.widthOfTextAtSize(titleText, ts);
      page.drawText(titleText, {
        x: PW / 2 - tw / 2, y: y - mm(5), size: ts, font: B, color: BLACK,
      });
    }

    const info = [ueCode, subjectName, examDate].filter(Boolean).join("  \u2014  ");
    if (info) {
      const iw = B.widthOfTextAtSize(info, 9);
      page.drawText(info, {
        x: PW / 2 - iw / 2, y: y - mm(10), size: 9, font: B, color: BLACK,
      });
    }

    y -= barH + mm(4);

    // ═══════════════════════════════════════════════════════════════════
    // LEFT: NOM + Prénom | RIGHT: N° étudiant
    // ═══════════════════════════════════════════════════════════════════

    const fH = mm(5);
    const sectionTop = y;

    // NOM
    page.drawText("NOM", { x: CX, y: y - 1, size: 7, font: B, color: BLACK });
    page.drawRectangle({
      x: CX + mm(14), y: y - mm(1.5), width: mm(72), height: fH,
      borderWidth: 0.5, borderColor: BLACK, color: WHITE,
    });
    y -= fH + mm(2);

    // Prénom
    page.drawText("Pr\u00E9nom", { x: CX, y: y - 1, size: 7, font: B, color: BLACK });
    page.drawRectangle({
      x: CX + mm(14), y: y - mm(1.5), width: mm(72), height: fH,
      borderWidth: 0.5, borderColor: BLACK, color: WHITE,
    });

    // ── N° étudiant grid (right side) ──
    const DIGITS = 6;
    const bigBox = mm(5);
    const bigGap = mm(1.5);
    const smallBox = mm(4.5);  // agrandie pour OMR
    const smallGap = mm(0.8);  // augmenté pour séparation
    const idGridW = DIGITS * (bigBox + bigGap) - bigGap;
    const idGridX = CX + CW - idGridW - mm(1);
    let gy = sectionTop;

    // Title
    page.drawText("Saisir votre N\u00B0 d'\u00E9tudiant", {
      x: idGridX, y: gy, size: 6, font: B, color: BLACK,
    });
    gy -= mm(3);

    // Write-in boxes — fond gris + bordure épaisse
    const WRITE_IN_BG = rgb(0.92, 0.92, 0.92);
    for (let d = 0; d < DIGITS; d++) {
      page.drawRectangle({
        x: idGridX + d * (bigBox + bigGap), y: gy - bigBox * 1.5,
        width: bigBox, height: bigBox * 1.5,
        borderWidth: 1.0, borderColor: BLACK, color: WRITE_IN_BG,
      });
    }
    gy -= bigBox * 1.5 + mm(1.5);

    // Bubble grid: 10 rows × 6 cols — bordures épaisses 1.5pt
    for (let r = 0; r < 10; r++) {
      const ry = gy - r * (smallBox + smallGap);
      // Row label
      page.drawText(String(r), {
        x: idGridX - mm(4), y: ry - smallBox + mm(1.2),
        size: 7, font: B, color: BLACK,
      });
      for (let d = 0; d < DIGITS; d++) {
        const bx = idGridX + d * (bigBox + bigGap) + (bigBox - smallBox) / 2;
        page.drawRectangle({
          x: bx, y: ry - smallBox,
          width: smallBox, height: smallBox,
          borderWidth: 1.5, borderColor: BLACK, color: WHITE,
        });
      }
    }

    const idGridEndY = gy - 10 * (smallBox + smallGap);

    // Cadre englobant (ancre OMR)
    const frameLeft = idGridX + (bigBox - smallBox) / 2 - mm(1);
    const frameW = (DIGITS - 1) * (bigBox + bigGap) + smallBox + (bigBox - smallBox) + mm(2);
    const frameTop = gy + mm(0.5);
    const frameH = frameTop - idGridEndY + mm(1);
    page.drawRectangle({
      x: frameLeft, y: idGridEndY - mm(0.5),
      width: frameW, height: frameH,
      borderWidth: 2.0, borderColor: BLACK,
    });

    const leftEndY = y - mm(1.5);
    y = Math.min(leftEndY, idGridEndY) - mm(2);

    // Instruction
    const instrT = "r\u00E9pondez aux questions en noircissant les cases ci-dessous";
    const instrW = B.widthOfTextAtSize(instrT, 6.5);
    page.drawText(instrT, { x: PW / 2 - instrW / 2, y, size: 6.5, font: B, color: BLACK });
    y -= mm(3);

    // ═══════════════════════════════════════════════════════════════════
    // QCM GRID — dynamic layout, supports up to 140+ questions
    // ═══════════════════════════════════════════════════════════════════

    const BOX = mm(3.5);
    const HGAP = mm(1.5);
    const NUM_W = mm(7);
    const boxGroupW = 5 * BOX + 4 * HGAP;
    const COL_W = NUM_W + boxGroupW + mm(2);
    const LABEL_H = mm(3);
    const FRAME_PAD_T = mm(0.5);
    const FRAME_PAD_B = mm(0.3);
    const FRAME_H = FRAME_PAD_T + BOX + LABEL_H + BOX + FRAME_PAD_B;
    const FRAME_GAP = mm(1.5);

    // Compute layout: how many columns fit, how many rows per column
    const COLS = 4;
    const COL_GAP = (CW - COLS * COL_W) / (COLS - 1);
    const availableH = y - CY_BOT - mm(2); // available vertical space
    const Q_PER_COL = Math.floor((availableH + FRAME_GAP) / (FRAME_H + FRAME_GAP));
    const questionsPage1 = Math.min(TOTAL_Q, COLS * Q_PER_COL);

    // Draw QCM frames on page 1
    const qcmGridTop = y;
    function drawQCMFrame(pg: typeof page, q: number, cx: number, frameTop: number) {
      pg.drawRectangle({
        x: cx, y: frameTop - FRAME_H, width: COL_W, height: FRAME_H,
        borderWidth: 0.8, borderColor: BLACK, color: WHITE,
      });
      pg.drawText(String(q), {
        x: cx + mm(1.5), y: frameTop - FRAME_PAD_T - BOX + mm(1),
        size: 8, font: B, color: BLACK,
      });
      const bx0 = cx + NUM_W;
      const r1y = frameTop - FRAME_PAD_T;
      for (let li = 0; li < 5; li++) {
        pg.drawRectangle({
          x: bx0 + li * (BOX + HGAP), y: r1y - BOX,
          width: BOX, height: BOX,
          borderWidth: 0.8, borderColor: BLACK, color: WHITE,
        });
      }
      const letterY = r1y - BOX - (LABEL_H / 2) - 2;
      for (let li = 0; li < 5; li++) {
        const lx = bx0 + li * (BOX + HGAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 6);
        pg.drawText(LETTERS[li], {
          x: lx + BOX / 2 - lw / 2, y: letterY,
          size: 6, font: B, color: BLACK,
        });
      }
      const r3y = r1y - BOX - LABEL_H;
      for (let li = 0; li < 5; li++) {
        pg.drawRectangle({
          x: bx0 + li * (BOX + HGAP), y: r3y - BOX,
          width: BOX, height: BOX,
          borderWidth: 0.8, borderColor: BLACK, color: WHITE,
        });
      }
    }

    // Page 1: questions 1..questionsPage1
    for (let q = 1; q <= questionsPage1; q++) {
      const idx = q - 1;
      const col = Math.floor(idx / Q_PER_COL);
      const row = idx % Q_PER_COL;
      const cx = CX + col * (COL_W + COL_GAP);
      const frameTop = qcmGridTop - row * (FRAME_H + FRAME_GAP);
      drawQCMFrame(page, q, cx, frameTop);
    }

    // Page 2+ for remaining questions (if > questionsPage1)
    let remainingQ = TOTAL_Q - questionsPage1;
    let nextQ = questionsPage1 + 1;
    while (remainingQ > 0) {
      const pg2 = doc.addPage([PW, PH]);

      // Corner marks on continuation pages
      pg2.drawRectangle({ x: PAGE_MARGIN, y: CY_TOP - MARK_W, width: MARK_LEN, height: MARK_W, color: BLACK });
      pg2.drawRectangle({ x: PAGE_MARGIN, y: CY_TOP - MARK_LEN, width: MARK_W, height: MARK_LEN, color: BLACK });
      pg2.drawRectangle({ x: PW - PAGE_MARGIN - MARK_LEN, y: CY_TOP - MARK_W, width: MARK_LEN, height: MARK_W, color: BLACK });
      pg2.drawRectangle({ x: PW - PAGE_MARGIN - MARK_W, y: CY_TOP - MARK_LEN, width: MARK_W, height: MARK_LEN, color: BLACK });
      pg2.drawRectangle({ x: PAGE_MARGIN, y: CY_BOT, width: MARK_LEN, height: MARK_W, color: BLACK });
      pg2.drawRectangle({ x: PAGE_MARGIN, y: CY_BOT, width: MARK_W, height: MARK_LEN, color: BLACK });
      pg2.drawRectangle({ x: PW - PAGE_MARGIN - MARK_LEN, y: CY_BOT, width: MARK_LEN, height: MARK_W, color: BLACK });
      pg2.drawRectangle({ x: PW - PAGE_MARGIN - MARK_W, y: CY_BOT, width: MARK_W, height: MARK_LEN, color: BLACK });

      // Title on continuation page
      const contTitle = `${examTitle || "Grille"} — suite`;
      const ctw = B.widthOfTextAtSize(contTitle, 9);
      pg2.drawText(contTitle, { x: PW / 2 - ctw / 2, y: CY_TOP - mm(5), size: 9, font: B, color: BLACK });

      const pg2GridTop = CY_TOP - mm(10);
      const pg2AvailH = pg2GridTop - CY_BOT - mm(2);
      const pg2QPerCol = Math.floor((pg2AvailH + FRAME_GAP) / (FRAME_H + FRAME_GAP));
      const pg2Total = Math.min(remainingQ, COLS * pg2QPerCol);

      for (let qi = 0; qi < pg2Total; qi++) {
        const col = Math.floor(qi / pg2QPerCol);
        const row = qi % pg2QPerCol;
        const cx = CX + col * (COL_W + COL_GAP);
        const frameTop = pg2GridTop - row * (FRAME_H + FRAME_GAP);
        drawQCMFrame(pg2, nextQ + qi, cx, frameTop);
      }

      nextQ += pg2Total;
      remainingQ -= pg2Total;
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
