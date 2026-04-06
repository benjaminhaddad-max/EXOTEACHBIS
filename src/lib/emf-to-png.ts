/**
 * Server-side EMF/WMF → PNG conversion using emf-converter + @napi-rs/canvas.
 *
 * emf-converter expects OffscreenCanvas or document.createElement('canvas').
 * We polyfill OffscreenCanvas with @napi-rs/canvas so it works in Node.js/Vercel.
 */
import { createCanvas, type Canvas } from "@napi-rs/canvas";

/**
 * Polyfill OffscreenCanvas for emf-converter using @napi-rs/canvas.
 * Must be called before importing emf-converter.
 */
function installCanvasPolyfill() {
  if (typeof globalThis.OffscreenCanvas !== "undefined") return; // already available

  // Create a minimal OffscreenCanvas-compatible class using @napi-rs/canvas
  class NodeOffscreenCanvas {
    private _canvas: Canvas;
    width: number;
    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this._canvas = createCanvas(width, height);
    }

    getContext(type: string) {
      if (type !== "2d") return null;
      return this._canvas.getContext("2d");
    }

    toDataURL(mimeType?: string) {
      return this._canvas.toDataURL(mimeType as any || "image/png");
    }

    convertToBlob() {
      const dataUrl = this.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      return Promise.resolve(new Blob([buffer], { type: "image/png" }));
    }
  }

  // Install polyfill
  (globalThis as any).OffscreenCanvas = NodeOffscreenCanvas;
}

/**
 * Convert an EMF or WMF buffer to a PNG data URL on the server.
 * Returns the PNG data URL, or null if conversion fails.
 */
export async function convertEmfToPng(
  buffer: ArrayBuffer,
  isWmf = false,
  maxWidth = 2400,
  maxHeight = 1800,
): Promise<string | null> {
  try {
    installCanvasPolyfill();

    // Dynamic import after polyfill is installed
    const { convertEmfToDataUrl, convertWmfToDataUrl } = await import("emf-converter");

    const converter = isWmf ? convertWmfToDataUrl : convertEmfToDataUrl;
    const result = await converter(buffer, maxWidth, maxHeight);
    return result || null;
  } catch (e: any) {
    console.warn("[emf-to-png] Conversion failed:", e.message);
    return null;
  }
}

/**
 * Convert a base64-encoded EMF/WMF data URI to a PNG data URI.
 * Returns the original URI if it's already web-compatible, or null if conversion fails.
 */
export async function convertDataUriToPng(dataUri: string): Promise<string | null> {
  const isEmf = /^data:image\/(x-emf|emf)/i.test(dataUri);
  const isWmf = /^data:image\/(x-wmf|wmf)/i.test(dataUri);
  if (!isEmf && !isWmf) return dataUri; // already web-compatible

  const match = dataUri.match(/;base64,(.+)$/);
  if (!match) return null;

  const binary = Buffer.from(match[1], "base64");
  const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);

  return convertEmfToPng(arrayBuffer, isWmf);
}
