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
const GRAY = rgb(0.45, 0.45, 0.45);
const LGRAY = rgb(0.7, 0.7, 0.7);
const NAVY = rgb(0, 0, 0); // black for print
const GOLD = rgb(0, 0, 0); // black for print

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

    // Load B&W SVG logo → convert to PNG via sharp
    let logo = null;
    try {
      const svgPath = path.join(process.cwd(), "public", "ds-logo-2026-bw.svg");
      const svgBuf = await fs.readFile(svgPath);
      const pngBuf = await sharp(svgBuf).resize({ height: 200 }).png().toBuffer();
      logo = await doc.embedPng(pngBuf);
    } catch (e) { console.error("[gen-grid] logo error", e); }

    let y = PH;

    // ═══════════════════════════════════════════════════════════════════
    // HEADER — Navy bar flush to top, logo + title + year
    // ═══════════════════════════════════════════════════════════════════

    // Header: bordered box with logo + title + year (B&W friendly)
    const barH = mm(20);
    page.drawRectangle({ x: MX, y: y - barH, width: CW, height: barH, borderWidth: 1, borderColor: BLACK, color: WHITE });

    // Logo (left) — B&W SVG rendered as PNG
    if (logo) {
      const logoH = barH - mm(2);
      const logoW = logoH * (logo.width / logo.height);
      page.drawImage(logo, {
        x: MX + mm(2), y: y - barH + (barH - logoH) / 2,
        width: logoW, height: logoH,
      });
    }

    // Year (right)
    const yearText = academicYear || "2026 - 2027";
    const yw = B.widthOfTextAtSize(yearText, 10);
    page.drawText(yearText, {
      x: MX + CW - yw - mm(3), y: y - barH + (barH - 10) / 2,
      size: 10, font: B, color: BLACK,
    });

    // Title (centered, upper line)
    if (examTitle) {
      let titleText = examTitle;
      if (ueCode && titleText.includes(ueCode)) {
        titleText = titleText.replace(new RegExp(`\\s*[\u2014\\-]\\s*${ueCode}.*$`), "").trim();
      }
      let ts = 11;
      while (ts > 5 && B.widthOfTextAtSize(titleText, ts) > CW - mm(70)) ts -= 0.5;
      const tw = B.widthOfTextAtSize(titleText, ts);
      page.drawText(titleText, {
        x: PW / 2 - tw / 2, y: y - mm(5.5), size: ts, font: B, color: BLACK,
      });
    }

    // Info line (centered, lower line) — prominent
    const info = [ueCode, subjectName, examDate].filter(Boolean).join("  \u2014  ");
    if (info) {
      const iw = B.widthOfTextAtSize(info, 9);
      page.drawText(info, {
        x: PW / 2 - iw / 2, y: y - mm(10.5), size: 9, font: B, color: BLACK,
      });
    }

    y -= barH + mm(6);

    // ═══════════════════════════════════════════════════════════════════
    // LEFT: NOM + Prénom | RIGHT: N° étudiant (write-in + bubble grid)
    // ═══════════════════════════════════════════════════════════════════

    const fH = mm(5);
    const sectionTop = y;

    // NOM
    page.drawText("NOM", { x: MX, y: y - 1, size: 7, font: B, color: BLACK });
    page.drawRectangle({
      x: MX + mm(14), y: y - mm(1.5), width: mm(80), height: fH,
      borderWidth: 0.4, borderColor: BLACK, color: WHITE,
    });
    y -= fH + mm(2);

    // Prénom
    page.drawText("Pr\u00E9nom", { x: MX, y: y - 1, size: 7, font: B, color: BLACK });
    page.drawRectangle({
      x: MX + mm(14), y: y - mm(1.5), width: mm(80), height: fH,
      borderWidth: 0.4, borderColor: BLACK, color: WHITE,
    });

    // ── N° étudiant grid (right side) ──
    const DIGITS = 6;
    const bigBox = mm(5);
    const bigGap = mm(1.5);
    const smallBox = mm(4.5);   // ← agrandie (était 3.5mm) pour meilleure détection OMR
    const smallGap = mm(0.8);   // ← augmenté (était 0.5mm) pour séparation visuelle
    const gridW = DIGITS * (bigBox + bigGap) - bigGap;
    const gridX = MX + CW - gridW - mm(2);
    let gy = sectionTop;

    // Title
    page.drawText("Saisir votre N\u00B0 d'\u00E9tudiant", {
      x: gridX, y: gy, size: 6, font: B, color: BLACK,
    });
    gy -= mm(3);

    // Large write-in boxes — fond gris clair + bordure épaisse
    const WRITE_IN_BG = rgb(0.93, 0.93, 0.93);
    for (let d = 0; d < DIGITS; d++) {
      page.drawRectangle({
        x: gridX + d * (bigBox + bigGap), y: gy - bigBox * 1.5,
        width: bigBox, height: bigBox * 1.5,
        borderWidth: 1.0, borderColor: BLACK, color: WRITE_IN_BG,
      });
    }
    gy -= bigBox * 1.5 + mm(2);

    // Bubbling grid: 10 rows (0-9) x DIGITS columns
    // Bordures épaisses (1.5pt) pour détection OMR fiable
    for (let r = 0; r < 10; r++) {
      const ry = gy - r * (smallBox + smallGap);
      // Row label
      page.drawText(String(r), {
        x: gridX - mm(4), y: ry - smallBox + mm(1),
        size: 7, font: B, color: BLACK,
      });
      // Boxes (centered under big boxes) — bordure épaisse 1.5pt
      for (let d = 0; d < DIGITS; d++) {
        const bx = gridX + d * (bigBox + bigGap) + (bigBox - smallBox) / 2;
        page.drawRectangle({
          x: bx, y: ry - smallBox,
          width: smallBox, height: smallBox,
          borderWidth: 1.5, borderColor: BLACK, color: WHITE,
        });
      }
    }

    const gridEndY = gy - 10 * (smallBox + smallGap);

    // Cadre englobant autour de toute la grille de bulles (ancre OMR)
    const bubbleGridTop = gy;
    const bubbleGridH = bubbleGridTop - gridEndY;
    const bubbleGridLeft = gridX + (bigBox - smallBox) / 2 - mm(1);
    const bubbleGridW = (DIGITS - 1) * (bigBox + bigGap) + smallBox + (bigBox - smallBox) + mm(2);
    page.drawRectangle({
      x: bubbleGridLeft, y: gridEndY - mm(0.5),
      width: bubbleGridW, height: bubbleGridH + mm(1),
      borderWidth: 2.0, borderColor: BLACK,
    });
    const leftEndY = y - mm(1.5);
    y = Math.min(leftEndY, gridEndY) - mm(2);

    y -= mm(1);

    // Instruction
    const instrT = "r\u00E9pondez aux questions en noircissant les cases ci-dessous";
    const instrW = B.widthOfTextAtSize(instrT, 6.5);
    page.drawText(instrT, { x: PW / 2 - instrW / 2, y, size: 6.5, font: B, color: BLACK });
    y -= mm(3.5);

    // ═══════════════════════════════════════════════════════════════════
    // QCM GRID — Each question in a bordered frame
    // Letters A B C D E BETWEEN answer and remords rows
    // ═══════════════════════════════════════════════════════════════════

    const BOX = mm(3.5);
    const HGAP = mm(1.5);
    const NUM_W = mm(7);
    const boxGroupW = 5 * BOX + 4 * HGAP;
    const COL_W = NUM_W + boxGroupW + mm(2); // tight frame around content
    const COL_GAP = (CW - COLS * COL_W) / (COLS - 1); // distribute remaining as column gaps
    const LABEL_H = mm(3);
    const FRAME_PAD_T = mm(0.5);
    const FRAME_PAD_B = mm(0.3);
    const FRAME_H = FRAME_PAD_T + BOX + LABEL_H + BOX + FRAME_PAD_B;
    const FRAME_GAP = mm(1.5);
    const gridTop = y;

    for (let col = 0; col < COLS; col++) {
      const cx = MX + col * (COL_W + COL_GAP);
      const qStart = col * Q_PER_COL + 1;

      for (let i = 0; i < Q_PER_COL; i++) {
        const q = qStart + i;
        if (q > TOTAL_Q) break;

        const frameTop = gridTop - i * (FRAME_H + FRAME_GAP);

        // Frame
        page.drawRectangle({
          x: cx, y: frameTop - FRAME_H, width: COL_W, height: FRAME_H,
          borderWidth: 0.4, borderColor: BLACK, color: WHITE,
        });

        // Question number
        page.drawText(String(q), {
          x: cx + mm(1.5), y: frameTop - FRAME_PAD_T - BOX + mm(1),
          size: 8, font: B, color: BLACK,
        });

        const bx0 = cx + NUM_W;
        const r1y = frameTop - FRAME_PAD_T;

        // Answer boxes (top row)
        for (let li = 0; li < 5; li++) {
          page.drawRectangle({
            x: bx0 + li * (BOX + HGAP), y: r1y - BOX,
            width: BOX, height: BOX,
            borderWidth: 0.4, borderColor: BLACK, color: WHITE,
          });
        }

        // Letters BETWEEN rows (centered vertically in LABEL_H gap)
        const letterY = r1y - BOX - (LABEL_H / 2) - 2;
        for (let li = 0; li < 5; li++) {
          const lx = bx0 + li * (BOX + HGAP);
          const lw = B.widthOfTextAtSize(LETTERS[li], 6);
          page.drawText(LETTERS[li], {
            x: lx + BOX / 2 - lw / 2, y: letterY,
            size: 6, font: B, color: BLACK,
          });
        }

        // Remords boxes (bottom row)
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
