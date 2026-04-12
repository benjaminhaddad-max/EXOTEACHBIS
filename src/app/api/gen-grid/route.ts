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

const PW = 595.28;
const PH = 841.89;
const LETTERS = ["A", "B", "C", "D", "E"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      serieId, examTitle = "", ueCode = "", subjectName = "",
      examDate = "", institution = "", academicYear = "",
    } = body;

    if (!serieId) return NextResponse.json({ error: "serieId requis" }, { status: 400 });

    // Get actual question count
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

    let logo = null;
    try {
      const svgPath = path.join(process.cwd(), "public", "ds-logo-2026-bw.svg");
      const svgBuf = await fs.readFile(svgPath);
      const pngBuf = await sharp(svgBuf).resize({ height: 200 }).png().toBuffer();
      logo = await doc.embedPng(pngBuf);
    } catch (e) { console.error("[gen-grid] logo error", e); }

    // ── Layout constants ──
    const MX = mm(8);           // content margin
    const CW = PW - 2 * MX;    // content width
    const MARK_W = mm(1.5);
    const MARK_LEN = mm(6);
    const MARK_M = mm(2);      // marks distance from page edge

    // ── Corner alignment marks ──
    const drawCornerMarks = (pg: typeof page) => {
      const t = PH - MARK_M;
      const b = MARK_M;
      const l = MARK_M;
      const r = PW - MARK_M;
      // Top-left
      pg.drawRectangle({ x: l, y: t - MARK_W, width: MARK_LEN, height: MARK_W, color: BLACK });
      pg.drawRectangle({ x: l, y: t - MARK_LEN, width: MARK_W, height: MARK_LEN, color: BLACK });
      // Top-right
      pg.drawRectangle({ x: r - MARK_LEN, y: t - MARK_W, width: MARK_LEN, height: MARK_W, color: BLACK });
      pg.drawRectangle({ x: r - MARK_W, y: t - MARK_LEN, width: MARK_W, height: MARK_LEN, color: BLACK });
      // Bottom-left
      pg.drawRectangle({ x: l, y: b, width: MARK_LEN, height: MARK_W, color: BLACK });
      pg.drawRectangle({ x: l, y: b, width: MARK_W, height: MARK_LEN, color: BLACK });
      // Bottom-right
      pg.drawRectangle({ x: r - MARK_LEN, y: b, width: MARK_LEN, height: MARK_W, color: BLACK });
      pg.drawRectangle({ x: r - MARK_W, y: b, width: MARK_W, height: MARK_LEN, color: BLACK });
    };
    drawCornerMarks(page);

    // ═══════════════ HEADER (compact: 12mm) ═══════════════
    let y = PH - mm(4);
    const barH = mm(12);
    page.drawRectangle({ x: MX, y: y - barH, width: CW, height: barH, borderWidth: 1.2, borderColor: BLACK, color: WHITE });

    if (logo) {
      const logoH = barH - mm(2);
      const logoW = logoH * (logo.width / logo.height);
      page.drawImage(logo, { x: MX + mm(1), y: y - barH + (barH - logoH) / 2, width: logoW, height: logoH });
    }

    const yearText = academicYear || "2026 - 2027";
    const yw = B.widthOfTextAtSize(yearText, 9);
    page.drawText(yearText, { x: MX + CW - yw - mm(2), y: y - barH + (barH - 9) / 2, size: 9, font: B, color: BLACK });

    if (examTitle) {
      let titleText = examTitle;
      if (ueCode && titleText.includes(ueCode)) titleText = titleText.replace(new RegExp(`\\s*[\u2014\\-]\\s*${ueCode}.*$`), "").trim();
      let ts = 10;
      while (ts > 5 && B.widthOfTextAtSize(titleText, ts) > CW - mm(60)) ts -= 0.5;
      const tw = B.widthOfTextAtSize(titleText, ts);
      page.drawText(titleText, { x: PW / 2 - tw / 2, y: y - mm(3.5), size: ts, font: B, color: BLACK });
    }

    const info = [ueCode, subjectName, examDate].filter(Boolean).join("  \u2014  ");
    if (info) {
      const iw = B.widthOfTextAtSize(info, 8);
      page.drawText(info, { x: PW / 2 - iw / 2, y: y - mm(7.5), size: 8, font: B, color: BLACK });
    }

    y -= barH + mm(7); // espace sous le header

    // ═══════════════ Nom/Prénom (one line) + N° étudiant ═══════════════
    const sectionTop = y;

    // Nom + Prénom on same line
    const fH = mm(5);
    page.drawText("Nom", { x: MX, y: y - 1, size: 7, font: B, color: BLACK });
    page.drawRectangle({ x: MX + mm(12), y: y - mm(1.5), width: mm(48), height: fH, borderWidth: 0.5, borderColor: BLACK, color: WHITE });
    page.drawText("Pr\u00E9nom", { x: MX + mm(64), y: y - 1, size: 7, font: B, color: BLACK });
    page.drawRectangle({ x: MX + mm(80), y: y - mm(1.5), width: mm(48), height: fH, borderWidth: 0.5, borderColor: BLACK, color: WHITE });

    // Helper: draw a capsule/stadium shape (rectangle with semicircular ends)
    function drawCapsule(pg: typeof page, x: number, y: number, w: number, h: number, bw: number) {
      const r = h / 2;
      const straight = w - h;
      const path = `M ${r},0 L ${r + straight},0 A ${r},${r} 0 0,1 ${r + straight},${h} L ${r},${h} A ${r},${r} 0 0,1 ${r},0 Z`;
      pg.drawSvgPath(path, { x, y: y + h, borderWidth: bw, borderColor: BLACK, color: WHITE });
    }

    // ── N° étudiant (right side, compact) ──
    const DIGITS = 6;
    const bigBox = mm(4.5);
    const bigGap = mm(1);
    const idGridW = DIGITS * (bigBox + bigGap) - bigGap;
    const idGridX = MX + CW - idGridW;
    let gy = sectionTop;

    page.drawText("N\u00B0 \u00E9tudiant", { x: idGridX, y: gy, size: 5.5, font: B, color: BLACK });
    gy -= mm(2);

    // Write-in boxes (compact: height = bigBox)
    const WRITE_IN_BG = rgb(0.92, 0.92, 0.92);
    for (let d = 0; d < DIGITS; d++) {
      page.drawRectangle({
        x: idGridX + d * (bigBox + bigGap), y: gy - bigBox,
        width: bigBox, height: bigBox,
        borderWidth: 1.0, borderColor: BLACK, color: WRITE_IN_BG,
      });
    }
    gy -= bigBox + mm(2);  // espace entre write-in et grille de bulles

    // Bubble grid: 10 rows × 6 cols — capsule shapes (same as QCM)
    const idCapW = mm(4.5);
    const idCapH = mm(1.6);
    const idRowStep = idCapH + mm(1.5);  // espace entre rangées ID pour bien distinguer
    for (let r = 0; r < 10; r++) {
      const ryTop = gy - r * idRowStep;
      page.drawText(String(r), { x: idGridX - mm(3), y: ryTop - idCapH / 2 - 2, size: 6, font: B, color: BLACK });
      for (let d = 0; d < DIGITS; d++) {
        const capX = idGridX + d * (bigBox + bigGap) + (bigBox - idCapW) / 2;
        drawCapsule(page, capX, ryTop - idCapH, idCapW, idCapH, 1.0);
      }
    }
    const idGridEndY = gy - 10 * idRowStep;

    // Cadre englobant (ancre OMR) — écarté des bulles pour respirer
    const framePad = mm(2);  // espace entre bulles et cadre
    const frameLeft = idGridX - framePad;
    const frameW2 = idGridW + 2 * framePad;
    page.drawRectangle({ x: frameLeft, y: idGridEndY - framePad, width: frameW2, height: gy - idGridEndY + 2 * framePad, borderWidth: 2.0, borderColor: BLACK });

    y = Math.min(y - fH - mm(1), idGridEndY) - mm(1.5);

    // Instruction
    const instrT = "r\u00E9pondez aux questions en noircissant les cases ci-dessous";
    const instrW = B.widthOfTextAtSize(instrT, 6);
    page.drawText(instrT, { x: PW / 2 - instrW / 2, y, size: 6, font: B, color: BLACK });
    y -= mm(2.5);

    // ═══════════════ QCM GRID — capsule shapes (rounded rectangles) ═══════════════
    const CAP_W = mm(4.5);     // capsule width
    const CAP_H = mm(1.6);     // capsule height (flat)
    const CAP_R = CAP_H / 2;   // end radius = half height → perfect semicircle ends
    const HGAP = mm(1.5);
    const NUM_W = mm(6);
    const capGroupW = 5 * CAP_W + 4 * HGAP;
    const COL_W = NUM_W + capGroupW + mm(1.5);
    const COLS = 4;
    const COL_GAP = (CW - COLS * COL_W) / Math.max(1, COLS - 1);
    const LABEL_H = mm(2.8);   // breathing room for letters
    const FRAME_PAD_T = mm(1.2);  // espace haut entre cadre et capsules
    const FRAME_PAD_B = mm(1.0);  // espace bas
    const FRAME_H = FRAME_PAD_T + CAP_H + LABEL_H + CAP_H + FRAME_PAD_B;
    const FRAME_GAP = mm(2.5);  // espace entre cadres bien visible au scan

    function drawQCMFrame(pg: typeof page, q: number, cx: number, frameTop: number) {
      pg.drawRectangle({ x: cx, y: frameTop - FRAME_H, width: COL_W, height: FRAME_H, borderWidth: 0.6, borderColor: BLACK, color: WHITE });
      // Question number — vertically centered in frame
      const numStr = String(q);
      const numW = B.widthOfTextAtSize(numStr, 7);
      pg.drawText(numStr, { x: cx + (NUM_W - numW) / 2, y: frameTop - FRAME_H / 2 - 2.5, size: 7, font: B, color: BLACK });
      const bx0 = cx + NUM_W;
      const r1y = frameTop - FRAME_PAD_T;
      // Answer capsules (top row)
      for (let li = 0; li < 5; li++) {
        const capX = bx0 + li * (CAP_W + HGAP);
        drawCapsule(pg, capX, r1y - CAP_H, CAP_W, CAP_H, 0.6);
      }
      // Letters between rows — well centered
      const letterY = r1y - CAP_H - (LABEL_H / 2) - 2;
      for (let li = 0; li < 5; li++) {
        const lx = bx0 + li * (CAP_W + HGAP);
        const lw = B.widthOfTextAtSize(LETTERS[li], 5.5);
        pg.drawText(LETTERS[li], { x: lx + CAP_W / 2 - lw / 2, y: letterY, size: 5.5, font: B, color: BLACK });
      }
      // Remord capsules (bottom row)
      const r3y = r1y - CAP_H - LABEL_H;
      for (let li = 0; li < 5; li++) {
        const capX = bx0 + li * (CAP_W + HGAP);
        drawCapsule(pg, capX, r3y - CAP_H, CAP_W, CAP_H, 0.6);
      }
    }

    // Page 1 — compute smart column count
    const availH1 = y - mm(6);
    const maxPerCol1 = Math.floor((availH1 + FRAME_GAP) / (FRAME_H + FRAME_GAP));
    // Use minimum columns needed: don't force 4 cols for 24 questions
    const neededCols1 = Math.min(COLS, Math.ceil(TOTAL_Q / maxPerCol1));
    const actualCols1 = Math.max(1, neededCols1);
    const qPerCol1 = Math.ceil(Math.min(TOTAL_Q, actualCols1 * maxPerCol1) / actualCols1);
    const qPage1 = Math.min(TOTAL_Q, actualCols1 * qPerCol1);

    // Left-aligned columns
    for (let q = 1; q <= qPage1; q++) {
      const idx = q - 1;
      const col = Math.floor(idx / qPerCol1);
      const row = idx % qPerCol1;
      const cx = MX + col * (COL_W + COL_GAP);
      const frameTop = y - row * (FRAME_H + FRAME_GAP);
      drawQCMFrame(page, q, cx, frameTop);
    }

    // Continuation pages
    let remaining = TOTAL_Q - qPage1;
    let nextQ = qPage1 + 1;
    while (remaining > 0) {
      const pg2 = doc.addPage([PW, PH]);
      drawCornerMarks(pg2);

      const contTitle = `${examTitle || "Grille"} — suite`;
      const ctw = B.widthOfTextAtSize(contTitle, 9);
      pg2.drawText(contTitle, { x: PW / 2 - ctw / 2, y: PH - mm(8), size: 9, font: B, color: BLACK });

      const pg2Top = PH - mm(12);
      const pg2AvailH = pg2Top - mm(6);
      const pg2MaxPerCol = Math.floor((pg2AvailH + FRAME_GAP) / (FRAME_H + FRAME_GAP));
      const pg2NeededCols = Math.min(COLS, Math.ceil(remaining / pg2MaxPerCol));
      const pg2ActualCols = Math.max(1, pg2NeededCols);
      const pg2QPerCol = Math.ceil(Math.min(remaining, pg2ActualCols * pg2MaxPerCol) / pg2ActualCols);
      const pg2Total = Math.min(remaining, pg2ActualCols * pg2QPerCol);
      for (let qi = 0; qi < pg2Total; qi++) {
        const col = Math.floor(qi / pg2QPerCol);
        const row = qi % pg2QPerCol;
        const cx = MX + col * (COL_W + COL_GAP);
        const frameTop = pg2Top - row * (FRAME_H + FRAME_GAP);
        drawQCMFrame(pg2, nextQ + qi, cx, frameTop);
      }
      nextQ += pg2Total;
      remaining -= pg2Total;
    }

    // ═══════════════ UPLOAD ═══════════════
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
