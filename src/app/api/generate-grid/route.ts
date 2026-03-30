import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const A4_W = 595.28;
const A4_H = 841.89;
const MM = 2.835;

const MARGIN_X = 13 * MM;
const MARGIN_Y = 13 * MM;

const CROSS_R = 3 * MM;
const ID_BOX = 3.5 * MM;
const ID_GAP = 0.7 * MM;
const ID_VGAP = 0.6 * MM;
const ID_LABEL = 4 * MM;

const MIN_BOX = 3 * MM;
const MAX_BOX = 5.5 * MM;
const GAP_RATIO = 0.28;
const ROW_GAP = 0.9 * MM;
const Q_GAP = 1.5 * MM;
const GROUP_SEP = 1 * MM;
const COL_MARGIN = 3 * MM;
const NUM_W = 8.5 * MM;

function drawCross(page: any, cx: number, cy: number) {
  const arm = CROSS_R * 1.5;
  page.drawCircle({ x: cx, y: cy, size: CROSS_R, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  page.drawLine({ start: { x: cx - arm, y: cy }, end: { x: cx + arm, y: cy }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: cx, y: cy - arm }, end: { x: cx, y: cy + arm }, thickness: 1, color: rgb(0, 0, 0) });
}

function drawCrosses(page: any) {
  const off = MARGIN_X * 0.75;
  drawCross(page, off, A4_H - off);
  drawCross(page, A4_W - off, A4_H - off);
  drawCross(page, off, off);
  drawCross(page, A4_W - off, off);
}

function drawBox(page: any, x: number, y: number, size: number) {
  page.drawRectangle({ x, y, width: size, height: size, borderWidth: 0.7, borderColor: rgb(0, 0, 0), color: rgb(1, 1, 1) });
}

function drawHeader(page: any, title: string, institution: string, fonts: { bold: any; normal: any; italic: any }) {
  const top = A4_H - CROSS_R * 2 - 6 * MM;

  page.drawText(title, { x: A4_W / 2 - fonts.bold.widthOfTextAtSize(title, 13) / 2, y: top, size: 13, font: fonts.bold, color: rgb(0, 0, 0) });
  page.drawText(institution, { x: A4_W / 2 - fonts.bold.widthOfTextAtSize(institution, 10) / 2, y: top - 7 * MM, size: 10, font: fonts.bold, color: rgb(0, 0, 0) });

  const idTop = top - 5 * MM;
  const idX = MARGIN_X + 1 * MM;
  const cellH = ID_BOX + ID_VGAP;
  const cellW = ID_BOX + ID_GAP;

  page.drawText("Saisir votre numéro d'étudiant", { x: idX + ID_LABEL, y: idTop + 1.5 * MM, size: 5.5, font: fonts.normal, color: rgb(0, 0, 0) });

  const writeY = idTop - cellH + ID_VGAP / 2;
  for (let col = 0; col < 5; col++) {
    const bx = idX + ID_LABEL + col * cellW;
    page.drawRectangle({ x: bx, y: writeY, width: cellW - 0.4 * MM, height: ID_BOX, borderWidth: 0.7, borderColor: rgb(0, 0, 0), color: rgb(1, 1, 1) });
  }

  for (let row = 0; row < 10; row++) {
    const ry = idTop - cellH - (row + 1) * cellH + ID_VGAP / 2;
    page.drawText(String(row), {
      x: idX + ID_LABEL - fonts.normal.widthOfTextAtSize(String(row), 5.5) - 0.8 * MM,
      y: ry + ID_BOX / 2 - 1.5, size: 5.5, font: fonts.normal, color: rgb(0, 0, 0),
    });
    for (let col = 0; col < 5; col++) {
      drawBox(page, idX + ID_LABEL + col * cellW, ry, ID_BOX);
    }
  }

  const idBottom = idTop - cellH - 10 * cellH - 1 * MM;
  const idZoneW = ID_LABEL + 5 * cellW + 4 * MM;
  const col2X = MARGIN_X + idZoneW + 4 * MM;
  const fieldW = A4_W - col2X - MARGIN_X;
  const labW = 18 * MM;
  const boxH = 7 * MM;
  const boxW = fieldW - labW;
  const nomTop = idTop - 3 * MM;

  page.drawText("Nom :", { x: col2X, y: nomTop - boxH / 2 + 1.2 * MM, size: 8.5, font: fonts.bold, color: rgb(0, 0, 0) });
  page.drawRectangle({ x: col2X + labW, y: nomTop - boxH, width: boxW, height: boxH, borderWidth: 0.6, borderColor: rgb(0, 0, 0), color: rgb(1, 1, 1) });

  const prenomTop = nomTop - boxH - 3 * MM;
  page.drawText("Prénom :", { x: col2X, y: prenomTop - boxH / 2 + 1.2 * MM, size: 8.5, font: fonts.bold, color: rgb(0, 0, 0) });
  page.drawRectangle({ x: col2X + labW, y: prenomTop - boxH, width: boxW, height: boxH, borderWidth: 0.6, borderColor: rgb(0, 0, 0), color: rgb(1, 1, 1) });

  const msg = "Ne pas écrire en dehors de ce cadre";
  page.drawText(msg, { x: col2X + fieldW / 2 - fonts.italic.widthOfTextAtSize(msg, 6.5) / 2, y: prenomTop - boxH - 5 * MM, size: 6.5, font: fonts.italic, color: rgb(0, 0, 0) });

  const sepY = idBottom - 3 * MM;
  page.drawLine({ start: { x: MARGIN_X, y: sepY }, end: { x: A4_W - MARGIN_X, y: sepY }, thickness: 0.4, color: rgb(0, 0, 0) });

  const instText = "Répondre aux questions en noircissant les cases";
  page.drawText(instText, { x: A4_W / 2 - fonts.italic.widthOfTextAtSize(instText, 8) / 2, y: sepY - 5.5 * MM, size: 8, font: fonts.italic, color: rgb(0, 0, 0) });

  return sepY - 12 * MM;
}

function computeLayout(nbQ: number, nbChoices: number, hasRemorse: boolean, availH: number, availW: number) {
  let best: { box: number; gap: number; nCols: number; qPerCol: number; colSp: number } | null = null;

  for (let nCols = 2; nCols <= 8; nCols++) {
    const qPerCol = Math.ceil(nbQ / nCols);
    const nSeps = Math.floor(qPerCol / 5);
    const headerRow = 3.5 * MM;
    const fixedV = headerRow + nSeps * GROUP_SEP + Q_GAP * qPerCol + ROW_GAP * (hasRemorse ? 1 : 0) * qPerCol;
    const rowsPerQ = 1 + (hasRemorse ? 1 : 0);
    const denomH = rowsPerQ * qPerCol;
    if (denomH === 0) continue;
    const boxFromH = (availH - fixedV) / denomH;

    const colSp = availW / nCols;
    const usable = colSp - NUM_W - COL_MARGIN;
    if (usable <= 0) continue;
    const boxFromW = usable / (nbChoices * (1 + GAP_RATIO));

    const box = Math.min(boxFromH, boxFromW, MAX_BOX);
    if (box < MIN_BOX) continue;
    if (best === null || box > best.box) {
      best = { box, gap: box * GAP_RATIO, nCols, qPerCol, colSp };
    }
  }
  return best;
}

function drawQcmGrid(page: any, gridTop: number, nbQ: number, nbChoices: number, hasRemorse: boolean, fonts: { bold: any; normal: any; italic: any }) {
  const availH = gridTop - MARGIN_Y;
  const availW = A4_W - 2 * MARGIN_X;
  const letters = "ABCDE".slice(0, nbChoices);

  const lay = computeLayout(nbQ, nbChoices, hasRemorse, availH, availW);
  if (!lay) throw new Error(`Impossible de faire tenir ${nbQ} questions sur A4.`);

  const { box, gap, nCols, qPerCol, colSp } = lay;
  const cellStep = box + gap;
  const qBlockH = hasRemorse ? box + ROW_GAP + box + Q_GAP : box + Q_GAP;

  const numFont = Math.max(5, Math.min(8, (box / MM) * 0.9));
  const letFont = Math.max(4.5, Math.min(7.5, (box / MM) * 0.85));
  const remFont = Math.max(3.5, Math.min(5.5, (box / MM) * 0.65));

  for (let col = 0; col < nCols; col++) {
    const qStart = col * qPerCol + 1;
    const qEnd = Math.min(qStart + qPerCol - 1, nbQ);
    if (qStart > nbQ) break;

    const baseX = MARGIN_X + col * colSp;
    let curY = gridTop;

    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i];
      const lx = baseX + NUM_W + i * cellStep + box / 2 - fonts.bold.widthOfTextAtSize(letter, letFont) / 2;
      page.drawText(letter, { x: lx, y: curY - 1 * MM, size: letFont, font: fonts.bold, color: rgb(0, 0, 0) });
    }
    curY -= 3.5 * MM;

    for (let q = qStart; q <= qEnd; q++) {
      const inCol = q - qStart;

      if (inCol > 0 && inCol % 5 === 0) {
        const fy = curY + Q_GAP * 0.45;
        page.drawLine({ start: { x: baseX, y: fy }, end: { x: baseX + NUM_W + nbChoices * cellStep, y: fy }, thickness: 0.25, color: rgb(0.75, 0.75, 0.75) });
      }

      const numStr = String(q);
      page.drawText(numStr, {
        x: baseX + NUM_W - 1.5 * MM - fonts.bold.widthOfTextAtSize(numStr, numFont),
        y: curY - box / 2 - 0.6 * MM, size: numFont, font: fonts.bold, color: rgb(0, 0, 0),
      });

      for (let i = 0; i < nbChoices; i++) {
        drawBox(page, baseX + NUM_W + i * cellStep, curY - box, box);
      }

      if (hasRemorse) {
        const ry = curY - box - ROW_GAP;
        page.drawText("r", {
          x: baseX + NUM_W - 1.5 * MM - fonts.italic.widthOfTextAtSize("r", remFont),
          y: ry - box / 2 - 0.5 * MM, size: remFont, font: fonts.italic, color: rgb(0.55, 0.55, 0.55),
        });
        for (let i = 0; i < nbChoices; i++) {
          drawBox(page, baseX + NUM_W + i * cellStep, ry - box, box);
        }
      }

      curY -= qBlockH;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title = "Épreuve",
      institution = "",
      nb_questions = 30,
      nb_choices = 5,
      has_remorse = true,
    } = body;

    if (nb_questions < 1 || nb_questions > 120) {
      return NextResponse.json({ error: "Nombre de questions invalide (1-120)" }, { status: 400 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([A4_W, A4_H]);

    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const normal = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const fonts = { bold, normal, italic };

    drawCrosses(page);
    const gridTop = drawHeader(page, title, institution, fonts);
    drawQcmGrid(page, gridTop, nb_questions, nb_choices, has_remorse, fonts);

    const pdfBytes = await pdfDoc.save();
    const pdfBody = new Uint8Array(Array.from(pdfBytes));
    const pdfBlob = new Blob([pdfBody], { type: "application/pdf" });

    return new NextResponse(pdfBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="grille-${title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error("[generate-grid]", e);
    return NextResponse.json({ error: e.message ?? "Erreur interne" }, { status: 500 });
  }
}
