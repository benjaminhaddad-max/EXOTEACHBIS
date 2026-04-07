/**
 * Office MathML (OMML) → LaTeX converter
 *
 * Converts Word's internal math representation (m:oMath, m:sSup, m:sSub, etc.)
 * into LaTeX strings wrapped in $...$ delimiters for rendering with KaTeX.
 *
 * Used by both import-word and import-serie routes.
 */

/** Find index of an exact XML open tag (not a prefix match like <m:sSup matching <m:sSupPr) */
function findExactTag(xml: string, tagPrefix: string, from: number): number {
  let pos = from;
  while (pos < xml.length) {
    const idx = xml.indexOf(tagPrefix, pos);
    if (idx < 0) return -1;
    const after = xml[idx + tagPrefix.length];
    // Exact tag: next char must be >, space, or / (not a letter/digit continuing the tag name)
    if (after === ">" || after === " " || after === "/" || after === "\n" || after === "\r" || after === "\t") {
      return idx;
    }
    pos = idx + 1;
  }
  return -1;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Recursively convert an Office MathML XML fragment to LaTeX.
 * Handles: m:sSup, m:sSub, m:sSubSup, m:f, m:rad, m:d, m:nary, m:acc, m:bar,
 *          m:r (runs), m:t (text), nested m:oMath.
 */
export function ommlToLatex(xml: string): string {
  function inner(xml: string, tag: string): string | null {
    const openTag = `<${tag}`;
    const closeTag = `</${tag}>`;
    const startIdx = xml.indexOf(openTag);
    if (startIdx < 0) return null;
    const tagEnd = xml.indexOf(">", startIdx);
    if (tagEnd < 0) return null;
    if (xml[tagEnd - 1] === "/") return "";
    let depth = 1;
    let pos = tagEnd + 1;
    while (depth > 0 && pos < xml.length) {
      const nextOpen = findExactTag(xml, openTag, pos);
      const nextClose = xml.indexOf(closeTag, pos);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) return xml.slice(tagEnd + 1, nextClose);
        pos = nextClose + closeTag.length;
      }
    }
    return null;
  }

  function allOccurrences(xml: string, tag: string): string[] {
    const results: string[] = [];
    const openTag = `<${tag}`;
    const closeTag = `</${tag}>`;
    let searchFrom = 0;
    while (searchFrom < xml.length) {
      const startIdx = findExactTag(xml, openTag, searchFrom);
      if (startIdx < 0) break;
      const tagEnd = xml.indexOf(">", startIdx);
      if (tagEnd < 0) break;
      if (xml[tagEnd - 1] === "/") { searchFrom = tagEnd + 1; continue; }
      let depth = 1;
      let pos = tagEnd + 1;
      while (depth > 0 && pos < xml.length) {
        const nextOpen = findExactTag(xml, openTag, pos);
        const nextClose = xml.indexOf(closeTag, pos);
        if (nextClose < 0) { pos = xml.length; break; }
        if (nextOpen >= 0 && nextOpen < nextClose) { depth++; pos = nextOpen + openTag.length; }
        else { depth--; pos = nextClose + closeTag.length; }
      }
      results.push(xml.slice(startIdx, pos));
      searchFrom = pos;
    }
    return results;
  }

  function processChildren(xml: string): string {
    let result = "";
    let pos = 0;

    while (pos < xml.length) {
      const nextTag = xml.indexOf("<m:", pos);
      if (nextTag < 0) {
        const remaining = xml.slice(pos);
        const wt = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let wm;
        while ((wm = wt.exec(remaining)) !== null) {
          result += decodeXmlEntities(wm[1]);
        }
        break;
      }

      const between = xml.slice(pos, nextTag);
      const wt = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let wm;
      while ((wm = wt.exec(between)) !== null) {
        result += decodeXmlEntities(wm[1]);
      }

      const tagNameMatch = xml.slice(nextTag).match(/^<m:(\w+)/);
      if (!tagNameMatch) { pos = nextTag + 1; continue; }
      const tagName = tagNameMatch[1];
      const closeTag = `</m:${tagName}>`;
      const tagEnd = xml.indexOf(">", nextTag);
      if (tagEnd < 0) break;
      if (xml[tagEnd - 1] === "/") { pos = tagEnd + 1; continue; }

      let depth = 1;
      let ePos = tagEnd + 1;
      const openStr = `<m:${tagName}`;
      while (depth > 0 && ePos < xml.length) {
        const nOpen = findExactTag(xml, openStr, ePos);
        const nClose = xml.indexOf(closeTag, ePos);
        if (nClose < 0) { ePos = xml.length; break; }
        if (nOpen >= 0 && nOpen < nClose) { depth++; ePos = nOpen + openStr.length; }
        else { depth--; ePos = nClose + closeTag.length; }
      }

      const elementInner = xml.slice(tagEnd + 1, ePos - closeTag.length);
      result += convertElement(tagName, elementInner);
      pos = ePos;
    }

    return result;
  }

  function convertElement(tagName: string, innerXml: string): string {
    switch (tagName) {
      case "t":
        return decodeXmlEntities(innerXml);
      case "r": {
        const textContent = inner(innerXml, "m:t");
        return textContent != null ? decodeXmlEntities(textContent) : processChildren(innerXml);
      }
      case "sSup": {
        const base = inner(innerXml, "m:e");
        const sup = inner(innerXml, "m:sup");
        const baseLatex = base ? processChildren(base) : "";
        const supLatex = sup ? processChildren(sup) : "";
        const supStr = supLatex.length > 1 ? `^{${supLatex}}` : `^${supLatex}`;
        return `${baseLatex}${supStr}`;
      }
      case "sSub": {
        const base = inner(innerXml, "m:e");
        const sub = inner(innerXml, "m:sub");
        const baseLatex = base ? processChildren(base) : "";
        const subLatex = sub ? processChildren(sub) : "";
        const subStr = subLatex.length > 1 ? `_{${subLatex}}` : `_${subLatex}`;
        return `${baseLatex}${subStr}`;
      }
      case "sSubSup": {
        const base = inner(innerXml, "m:e");
        const sub = inner(innerXml, "m:sub");
        const sup = inner(innerXml, "m:sup");
        return `${base ? processChildren(base) : ""}_{${sub ? processChildren(sub) : ""}}^{${sup ? processChildren(sup) : ""}}`;
      }
      case "f": {
        const num = inner(innerXml, "m:num");
        const den = inner(innerXml, "m:den");
        return `\\frac{${num ? processChildren(num) : ""}}{${den ? processChildren(den) : ""}}`;
      }
      case "rad": {
        const deg = inner(innerXml, "m:deg");
        const e = inner(innerXml, "m:e");
        const degLatex = deg ? processChildren(deg) : "";
        const eLatex = e ? processChildren(e) : "";
        if (!degLatex || degLatex === "2") return `\\sqrt{${eLatex}}`;
        return `\\sqrt[${degLatex}]{${eLatex}}`;
      }
      case "d": {
        const dPr = inner(innerXml, "m:dPr");
        let begChar = "(", endChar = ")";
        if (dPr) {
          const begMatch = dPr.match(/m:begChr m:val="([^"]*)"/);
          const endMatch = dPr.match(/m:endChr m:val="([^"]*)"/);
          if (begMatch) begChar = decodeXmlEntities(begMatch[1]);
          if (endMatch) endChar = decodeXmlEntities(endMatch[1]);
        }
        const elements = allOccurrences(innerXml, "m:e");
        const parts = elements.map(el => {
          const elInner = inner(el, "m:e");
          return elInner ? processChildren(elInner) : "";
        });
        const latexBeg = begChar === "[" ? "[" : begChar === "{" ? "\\{" : begChar === "|" ? "|" : begChar === "" ? "" : "(";
        const latexEnd = endChar === "]" ? "]" : endChar === "}" ? "\\}" : endChar === "|" ? "|" : endChar === "" ? "" : ")";
        return `\\left${latexBeg}${parts.join(", ")}\\right${latexEnd}`;
      }
      case "nary": {
        const naryPr = inner(innerXml, "m:naryPr");
        let chr = "∑";
        if (naryPr) {
          const chrMatch = naryPr.match(/m:chr m:val="([^"]*)"/);
          if (chrMatch) chr = decodeXmlEntities(chrMatch[1]);
        }
        const sub = inner(innerXml, "m:sub");
        const sup = inner(innerXml, "m:sup");
        const e = inner(innerXml, "m:e");
        const cmdMap: Record<string, string> = { "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "∬": "\\iint", "∮": "\\oint" };
        const cmd = cmdMap[chr] || "\\sum";
        const subLatex = sub ? processChildren(sub) : "";
        const supLatex = sup ? processChildren(sup) : "";
        const eLatex = e ? processChildren(e) : "";
        let result = cmd;
        if (subLatex) result += `_{${subLatex}}`;
        if (supLatex) result += `^{${supLatex}}`;
        return `${result} ${eLatex}`;
      }
      case "acc": {
        const accPr = inner(innerXml, "m:accPr");
        let chr = "\u0302";
        if (accPr) {
          const chrMatch = accPr.match(/m:chr m:val="([^"]*)"/);
          if (chrMatch) chr = decodeXmlEntities(chrMatch[1]);
        }
        const e = inner(innerXml, "m:e");
        const eLatex = e ? processChildren(e) : "";
        const accMap: Record<string, string> = { "\u0302": "\\hat", "\u0303": "\\tilde", "\u0304": "\\bar", "\u0307": "\\dot", "\u0308": "\\ddot", "→": "\\vec" };
        return `${accMap[chr] || "\\hat"}{${eLatex}}`;
      }
      case "bar": {
        const e = inner(innerXml, "m:e");
        return `\\overline{${e ? processChildren(e) : ""}}`;
      }
      case "oMath":
      case "oMathPara":
      case "e":
      case "num":
      case "den":
      case "sub":
      case "sup":
      case "deg":
      case "lim":
        return processChildren(innerXml);
      default:
        return processChildren(innerXml);
    }
  }

  return processChildren(xml);
}

/**
 * Extract text from a <w:p> paragraph XML, converting inline OMML math to $LaTeX$.
 */
export function extractParagraphText(paragraphContent: string): string {
  const parts: string[] = [];
  let pos = 0;

  while (pos < paragraphContent.length) {
    const nextMath = paragraphContent.indexOf("<m:oMath", pos);
    const nextMathPara = paragraphContent.indexOf("<m:oMathPara", pos);
    let nextIdx = -1;
    let mathTag = "";

    if (nextMath >= 0 && (nextMathPara < 0 || nextMath <= nextMathPara)) {
      nextIdx = nextMath;
      mathTag = "m:oMath";
    } else if (nextMathPara >= 0) {
      nextIdx = nextMathPara;
      mathTag = "m:oMathPara";
    }

    if (nextIdx < 0) {
      const remaining = paragraphContent.slice(pos);
      const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
      let t;
      while ((t = tRegex.exec(remaining)) !== null) {
        parts.push(t[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
      }
      break;
    }

    const before = paragraphContent.slice(pos, nextIdx);
    const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let t;
    while ((t = tRegex.exec(before)) !== null) {
      parts.push(t[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    }

    const closeTag = `</${mathTag}>`;
    const tagEnd = paragraphContent.indexOf(">", nextIdx);
    if (tagEnd < 0) break;
    let depth = 1;
    let mPos = tagEnd + 1;
    const openStr = `<${mathTag}`;
    while (depth > 0 && mPos < paragraphContent.length) {
      const nOpen = findExactTag(paragraphContent, openStr, mPos);
      const nClose = paragraphContent.indexOf(closeTag, mPos);
      if (nClose < 0) { mPos = paragraphContent.length; break; }
      if (nOpen >= 0 && nOpen < nClose) { depth++; mPos = nOpen + openStr.length; }
      else { depth--; mPos = nClose + closeTag.length; }
    }

    const mathXml = paragraphContent.slice(nextIdx, mPos);
    const latex = ommlToLatex(mathXml).trim();
    if (latex) {
      parts.push(`$${latex}$`);
    } else {
      // Fallback: extract plain text from <m:t> elements when LaTeX conversion fails
      const mtRegex = /<m:t(?:\s[^>]*)?>([^<]*)<\/m:t>/g;
      let mt;
      while ((mt = mtRegex.exec(mathXml)) !== null) {
        const decoded = mt[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        if (decoded.trim()) parts.push(decoded);
      }
    }

    pos = mPos;
  }

  return parts.join("").trim();
}

/**
 * Extract all paragraph texts from a DOCX XML document with OMML → LaTeX conversion.
 * Returns an array of paragraph strings (including $LaTeX$ for math).
 */
export function extractAllParagraphTexts(docXml: string): string[] {
  const texts: string[] = [];
  const pRegex = /<w:p[^/]*?>([\s\S]*?)<\/w:p>/g;
  let m;
  while ((m = pRegex.exec(docXml)) !== null) {
    texts.push(extractParagraphText(m[1]));
  }
  return texts;
}
