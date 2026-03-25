import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  Header, Footer, PageNumber,
} from "docx";

// ─── Types ────────────────────────────────────────────────────────────────────

type Option = { label: string; text: string; is_correct: boolean; justification?: string | null };
type Question = { id: string; text: string; explanation?: string | null; options: Option[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Strip LaTeX/Markdown for Word (basic cleanup)
function cleanText(text: string): string {
  return text
    .replace(/\$\$?([^$]+)\$\$?/g, (_m, t) => t) // strip $…$ LaTeX delimiters
    .replace(/\*\*([^*]+)\*\*/g, "$1")            // bold
    .replace(/\*([^*]+)\*/g, "$1")                // italic
    .trim();
}

// Border helper
const border = { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serieId = searchParams.get("serieId");
  const withCorrections = searchParams.get("corrections") === "1";

  if (!serieId) return NextResponse.json({ error: "serieId requis" }, { status: 400 });

  const supabase = await createClient();

  // Fetch serie info
  const { data: serie } = await supabase
    .from("series")
    .select("id, name, type, cours_id")
    .eq("id", serieId)
    .single();
  if (!serie) return NextResponse.json({ error: "Série introuvable" }, { status: 404 });

  // Fetch cours + dossier name
  const { data: cours } = await supabase
    .from("cours")
    .select("name, dossier_id")
    .eq("id", serie.cours_id)
    .single();

  const { data: dossier } = cours?.dossier_id
    ? await supabase.from("dossiers").select("name").eq("id", cours.dossier_id).single()
    : { data: null };

  // Fetch questions in order
  const { data: sqData } = await supabase
    .from("series_questions")
    .select("question_id, order_index")
    .eq("series_id", serieId)
    .order("order_index");

  const questionIds = (sqData ?? []).map((r: any) => r.question_id).filter(Boolean);
  const { data: qData } = await supabase
    .from("questions")
    .select("id, text, explanation, options(label, text, is_correct, justification, order_index)")
    .in("id", questionIds);

  const qMap = new Map((qData ?? []).map((q: any) => [q.id, q]));
  const questions: Question[] = questionIds
    .map((id: string) => qMap.get(id))
    .filter(Boolean)
    .map((q: any) => ({
      ...q,
      options: (q.options ?? []).sort((a: any, b: any) => a.order_index - b.order_index),
    }));

  // ─── Build DOCX ─────────────────────────────────────────────────────────────

  const NAVY = "0E1E35";
  const GOLD = "C9A84C";
  const GRAY = "666666";
  const LIGHT_BG = "F5F6FA";

  const children: any[] = [];

  // ── Header block ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: dossier?.name ?? "", font: "Arial", size: 18, color: GRAY }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({ text: cours?.name ?? "", font: "Arial", size: 22, color: GRAY }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 12 } },
      children: [
        new TextRun({ text: serie.name, font: "Arial", size: 36, bold: true, color: NAVY }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 400 },
      children: [
        new TextRun({
          text: `${questions.length} question${questions.length > 1 ? "s" : ""}  ·  ${withCorrections ? "Avec corrections" : "Sujet sans correction"}`,
          font: "Arial", size: 18, color: GRAY,
        }),
      ],
    }),
  );

  // ── Questions ──
  questions.forEach((q, idx) => {
    // Question title
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 140 },
        children: [
          new TextRun({ text: `${idx + 1}. `, font: "Arial", size: 22, bold: true, color: NAVY }),
          new TextRun({ text: cleanText(q.text), font: "Arial", size: 22, bold: true, color: NAVY }),
        ],
      }),
    );

    // Options table
    const rows = q.options.map((opt) => {
      const isCorrect = withCorrections && opt.is_correct;
      const bg = isCorrect ? "E8F5E9" : "FFFFFF";

      return new TableRow({
        children: [
          // Checkbox cell
          new TableCell({
            borders,
            width: { size: 400, type: WidthType.DXA },
            shading: { fill: bg, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 80 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: isCorrect ? "✓" : "☐",
                    font: "Arial", size: 20,
                    color: isCorrect ? "2E7D32" : "999999",
                    bold: isCorrect,
                  }),
                ],
              }),
            ],
          }),
          // Label cell (A, B, C…)
          new TableCell({
            borders,
            width: { size: 480, type: WidthType.DXA },
            shading: { fill: isCorrect ? "E8F5E9" : LIGHT_BG, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 80 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: opt.label, font: "Arial", size: 20, bold: true, color: isCorrect ? "2E7D32" : NAVY }),
                ],
              }),
            ],
          }),
          // Text cell
          new TableCell({
            borders,
            width: { size: 8480, type: WidthType.DXA },
            shading: { fill: bg, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: cleanText(opt.text), font: "Arial", size: 20, color: isCorrect ? "1B5E20" : "333333", bold: isCorrect }),
                ],
              }),
              ...(withCorrections && opt.is_correct && opt.justification
                ? [new Paragraph({
                    spacing: { before: 60 },
                    children: [
                      new TextRun({ text: "💡 " + cleanText(opt.justification), font: "Arial", size: 18, color: "558B2F", italics: true }),
                    ],
                  })]
                : []),
            ],
          }),
        ],
      });
    });

    children.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [400, 480, 8480],
        rows,
      }),
    );

    // Explanation (if corrections + explanation exists)
    if (withCorrections && q.explanation) {
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 60 },
          children: [
            new TextRun({ text: "Explication : ", font: "Arial", size: 18, bold: true, color: GRAY }),
            new TextRun({ text: cleanText(q.explanation), font: "Arial", size: 18, color: GRAY, italics: true }),
          ],
        }),
      );
    }
  });

  // ─── Create document ─────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // 2cm
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 8 } },
              children: [
                new TextRun({ text: serie.name, font: "Arial", size: 16, color: GRAY }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 8 } },
              children: [
                new TextRun({ text: "Page ", font: "Arial", size: 16, color: GRAY }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: GRAY }),
                new TextRun({ text: " / ", font: "Arial", size: 16, color: GRAY }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: GRAY }),
              ],
            }),
          ],
        }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `${serie.name.replace(/[^a-zA-Z0-9À-ÿ\s]/g, "").trim()}_${withCorrections ? "correction" : "sujet"}.docx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
