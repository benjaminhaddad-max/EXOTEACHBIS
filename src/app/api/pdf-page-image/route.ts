import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);

  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    // Download PDF
    const pdfRes = await fetch(url);
    if (!pdfRes.ok) return NextResponse.json({ error: `PDF fetch failed: ${pdfRes.status}` }, { status: 502 });
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());

    // Render with mupdf
    const mupdf = await import("mupdf");
    const doc = mupdf.Document.openDocument(pdfBuf, "application/pdf");
    const totalPages = doc.countPages();

    if (page < 1 || page > totalPages) {
      return NextResponse.json({ error: `Page ${page} out of range (1-${totalPages})` }, { status: 400 });
    }

    const pdfPage = doc.loadPage(page - 1);
    const pixmap = pdfPage.toPixmap([2, 0, 0, 2, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
    const pngBytes = pixmap.asPNG();

    return new NextResponse(Buffer.from(pngBytes), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
        "X-Total-Pages": String(totalPages),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "render failed" }, { status: 500 });
  }
}
