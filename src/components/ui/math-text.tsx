"use client";

import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

// ── Splits text into plain text and LaTeX segments ($...$ and $$...$$) ──────

type Segment =
  | { kind: "text"; content: string }
  | { kind: "inline"; content: string }
  | { kind: "block"; content: string };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  // Match $$...$$ first (block), then $...$ (inline)
  const re = /\$\$([\s\S]*?)\$\$|\$((?:[^$\\]|\\.)*?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", content: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      segments.push({ kind: "block", content: m[1] });
    } else {
      segments.push({ kind: "inline", content: m[2] });
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    segments.push({ kind: "text", content: text.slice(last) });
  }
  return segments;
}

// ── Single KaTeX span ────────────────────────────────────────────────────────

function KatexSpan({ formula, display }: { formula: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(formula, ref.current, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        output: "html",
      });
    } catch {
      if (ref.current) ref.current.textContent = display ? `$$${formula}$$` : `$${formula}$`;
    }
  }, [formula, display]);

  return (
    <span
      ref={ref}
      className={display ? "block text-center my-1 overflow-x-auto" : "inline"}
    />
  );
}

// ── Public component ─────────────────────────────────────────────────────────

export function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  // Fast path: no LaTeX and no images
  if (!text.includes("$") && !text.includes("![")) {
    return <span className={className}>{text}</span>;
  }

  const segments = parseSegments(text);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === "inline") return <KatexSpan key={i} formula={seg.content} display={false} />;
        if (seg.kind === "block") return <KatexSpan key={i} formula={seg.content} display={true} />;
        // Render markdown images ![alt](url) inside text segments
        if (seg.content.includes("![")) {
          const parts = seg.content.split(/!\[([^\]]*)\]\(([^)]+)\)/g);
          return (
            <span key={i}>
              {parts.map((part, j) => {
                if (j % 3 === 2) return <img key={j} src={part} alt={parts[j - 1] || ""} className="inline-block max-h-40 object-contain my-1" />;
                if (j % 3 === 1) return null; // alt text consumed by img
                return part ? <span key={j}>{part}</span> : null;
              })}
            </span>
          );
        }
        return <span key={i}>{seg.content}</span>;
      })}
    </span>
  );
}
