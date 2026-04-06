/**
 * Server-side EMF/WMF → PNG conversion using emf-converter + @napi-rs/canvas.
 *
 * emf-converter expects browser APIs (OffscreenCanvas, FileReader, createImageBitmap).
 * We polyfill them with @napi-rs/canvas and Node.js built-ins.
 */
import { createCanvas, type Canvas, loadImage } from "@napi-rs/canvas";

let polyfillInstalled = false;

/**
 * Install all browser API polyfills needed by emf-converter.
 */
function installPolyfills() {
  if (polyfillInstalled) return;
  polyfillInstalled = true;

  // ─── OffscreenCanvas polyfill ────────────────────────────────────────────
  if (typeof globalThis.OffscreenCanvas === "undefined") {
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
        const buf = Buffer.from(base64, "base64");
        return Promise.resolve(new Blob([buf], { type: "image/png" }));
      }
    }
    (globalThis as any).OffscreenCanvas = NodeOffscreenCanvas;
  }

  // ─── FileReader polyfill ─────────────────────────────────────────────────
  if (typeof globalThis.FileReader === "undefined") {
    class NodeFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((ev: any) => void) | null = null;
      onerror: ((ev: any) => void) | null = null;

      readAsDataURL(blob: Blob) {
        blob.arrayBuffer().then((ab) => {
          const buf = Buffer.from(ab);
          const base64 = buf.toString("base64");
          // Detect mime from blob type or default to png
          const mime = (blob as any).type || "image/png";
          this.result = `data:${mime};base64,${base64}`;
          if (this.onload) this.onload({ target: this });
        }).catch((err) => {
          if (this.onerror) this.onerror(err);
        });
      }
    }
    (globalThis as any).FileReader = NodeFileReader;
  }

  // ─── createImageBitmap polyfill ──────────────────────────────────────────
  if (typeof globalThis.createImageBitmap === "undefined") {
    (globalThis as any).createImageBitmap = async (source: Blob | ArrayBuffer) => {
      try {
        let buffer: Buffer;
        if (source instanceof Blob) {
          const ab = await source.arrayBuffer();
          buffer = Buffer.from(ab);
        } else if (source instanceof ArrayBuffer) {
          buffer = Buffer.from(source);
        } else {
          buffer = Buffer.from(source as any);
        }

        const image = await loadImage(buffer);
        return {
          width: image.width,
          height: image.height,
          close: () => {},
          // Provide a way for canvas to draw this
          _image: image,
        };
      } catch {
        // Return a minimal placeholder if image loading fails
        return { width: 1, height: 1, close: () => {} };
      }
    };
  }
}

/**
 * Convert an EMF or WMF buffer to a PNG data URL on the server.
 */
export async function convertEmfToPng(
  buffer: ArrayBuffer,
  isWmf = false,
  maxWidth = 2400,
  maxHeight = 1800,
): Promise<string | null> {
  try {
    installPolyfills();
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
