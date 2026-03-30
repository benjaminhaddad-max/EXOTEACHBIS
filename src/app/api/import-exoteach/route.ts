import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EXOTEACH_API = "https://diploma.exoteach.com/medibox2-api/graphql";
const EXOTEACH_IMG_BASE = "https://diploma.exoteach.com";

// ─── Auth ────────────────────────────────────────────────────────────────────

const SIGN_IN = `mutation SignIn($login: String!, $password: String!) {
  signIn(login: $login, password: $password) { token }
}`;

async function getExoteachToken(): Promise<string> {
  const login = process.env.EXOTEACH_LOGIN?.trim();
  const password = process.env.EXOTEACH_PASSWORD?.trim();
  if (!login || !password) throw new Error("EXOTEACH_LOGIN / EXOTEACH_PASSWORD manquants");

  const res = await fetch(EXOTEACH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: SIGN_IN, variables: { login, password } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`signIn échoué : ${json.errors[0]?.message}`);
  const token = json.data?.signIn?.token;
  if (!token) throw new Error("signIn n'a pas retourné de token");
  return token;
}

// ─── GraphQL ─────────────────────────────────────────────────────────────────

const GET_SERIE = `
  query GetSerie($id: ID!) {
    qcm(id: $id) {
      id_qcm
      titre
      nombreQuestions
      questions {
        id_question
        question
        explications
        url_image_q
        answers {
          id
          isTrue
          text
          explanation
          url_image
        }
      }
    }
  }
`;

// ─── HTML → Text (avec indices/exposants Unicode) ────────────────────────────

const SUB: Record<string, string> = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"+","-":"-","=":"₌","(":"₍",")":"₎","a":"ₐ","e":"ₑ","h":"ₕ","k":"ₖ","l":"ₗ","m":"ₘ","n":"ₙ","o":"ₒ","p":"ₚ","s":"ₛ","t":"ₜ","x":"ₓ" };
const SUP: Record<string, string> = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ" };

function toUnicode(text: string, map: Record<string, string>): string {
  return text.split("").map(c => map[c] || c).join("");
}

function extractImagesFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const imgs: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) imgs.push(m[1]);
  return imgs;
}

function convertHtml(html: string | null | undefined): string {
  if (!html) return "";
  let s = html;
  s = s.replace(/<sub[^>]*>(.*?)<\/sub>/gi, (_, c) => {
    const trimmed = c.replace(/<[^>]+>/g, "").trim();
    if (/^[+\-−_]+$/.test(trimmed)) return trimmed.replace(/[−_]/g, "-");
    return toUnicode(c.replace(/<[^>]+>/g, ""), SUB);
  });
  s = s.replace(/<sup[^>]*>(.*?)<\/sup>/gi, (_, c) => toUnicode(c.replace(/<[^>]+>/g, ""), SUP));
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
  s = s.replace(/([A-Z])_(?=\s|$|[.,;:!?)])/g, "$1-");
  s = s.replace(/[^\S\n]+/g, " ").replace(/\n\s+/g, "\n").trim();
  return s;
}

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http")) return url;
  return EXOTEACH_IMG_BASE + (url.startsWith("/") ? "" : "/") + url;
}

function indexToLabel(i: number) { return String.fromCharCode(65 + i); }

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { serieIds, coursId, serieType, matiereId } = await req.json();

    if (!serieIds?.length) {
      return NextResponse.json({ error: "serieIds requis" }, { status: 400 });
    }

    const token = await getExoteachToken();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const results: { id: string; status: string; titre?: string; newId?: string; error?: string; questions?: number }[] = [];

    for (const id of serieIds) {
      try {
        // 1. Fetch from ExoTeach GraphQL
        const gqlRes = await fetch(EXOTEACH_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-token": token },
          body: JSON.stringify({ query: GET_SERIE, variables: { id: String(id) } }),
        });
        const gqlJson = await gqlRes.json();

        if (gqlJson.errors) throw new Error(gqlJson.errors[0]?.message || "Erreur GraphQL");
        const qcm = gqlJson.data?.qcm;
        if (!qcm) { results.push({ id: String(id), status: "not_found" }); continue; }

        // 2. Create serie (auto-detect year from title)
        const titleStr = qcm.titre || "";
        const yearMatch = titleStr.match(/(\d{4}-\d{4})/);
        const autoAnnee = yearMatch ? yearMatch[1] : null;

        const { data: newSerie, error: serieErr } = await supabase
          .from("series")
          .insert({
            name: qcm.titre || `ExoTeach #${id}`,
            cours_id: coursId || null,
            matiere_id: matiereId || null,
            annee: autoAnnee,
            type: serieType || "annales",
            timed: false,
            visible: true,
            score_definitif: false,
          })
          .select("id")
          .single();

        if (serieErr || !newSerie) throw new Error(serieErr?.message || "Erreur création série");

        // 3. Import questions
        let questionsImported = 0;
        const questions: any[] = qcm.questions || [];

        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi];

          const questionText = convertHtml(q.question) || `Question ${qi + 1}`;
          // Image: url_image_q field, or extract from HTML
          const questionImg = resolveImageUrl(q.url_image_q)
            || resolveImageUrl(extractImagesFromHtml(q.question)[0])
            || null;
          const explanationText = convertHtml(q.explications) || null;

          const { data: newQ, error: qErr } = await supabase.from("questions").insert({
            text: questionText,
            type: "qcm_multiple",
            difficulty: 2,
            cours_id: coursId || null,
            matiere_id: matiereId || null,
            explanation: explanationText,
            image_url: questionImg,
            tags: [],
          }).select("id").single();

          if (qErr || !newQ) continue;

          // Options A-E
          const options = (q.answers || []).map((ans: any, idx: number) => ({
            question_id: newQ.id,
            label: indexToLabel(idx),
            text: convertHtml(ans.text),
            is_correct: ans.isTrue === true,
            order_index: idx,
            justification: convertHtml(ans.explanation) || null,
            image_url: resolveImageUrl(ans.url_image) || null,
          }));
          if (options.length > 0) await supabase.from("options").insert(options);

          await supabase.from("series_questions").insert({
            series_id: newSerie.id,
            question_id: newQ.id,
            order_index: qi,
          });

          questionsImported++;
        }

        results.push({ id: String(id), status: "ok", titre: qcm.titre, newId: newSerie.id, questions: questionsImported });
      } catch (err: any) {
        results.push({ id: String(id), status: "error", error: err.message });
      }
    }

    const imported = results.filter(r => r.status === "ok").length;
    return NextResponse.json({ success: true, imported, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
