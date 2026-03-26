import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EXOTEACH_API = "https://diploma.exoteach.com/medibox2-api/graphql";

const SIGN_IN = `mutation SignIn($login: String!, $password: String!) {
  signIn(login: $login, password: $password) { token }
}`;

async function getExoteachToken(): Promise<string> {
  const login = process.env.EXOTEACH_LOGIN?.trim();
  const password = process.env.EXOTEACH_PASSWORD?.trim();
  if (!login || !password) throw new Error("EXOTEACH_LOGIN / EXOTEACH_PASSWORD manquants dans les variables Vercel");

  const res = await fetch(EXOTEACH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: SIGN_IN, variables: { login, password } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`signIn échoué : ${json.errors[0]?.message}`);
  const token = json.data?.signIn?.token;
  if (!token) throw new Error("signIn n'a pas retourné de token — vérifier EXOTEACH_LOGIN et EXOTEACH_PASSWORD dans Vercel");
  return token;
}

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

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s+/g, " ").trim();
}

function indexToLabel(i: number): string {
  return String.fromCharCode(65 + i);
}

export async function POST(req: NextRequest) {
  try {
    const { serieIds, coursId, serieType } = await req.json();

    if (!serieIds?.length) {
      return NextResponse.json({ error: "serieIds requis" }, { status: 400 });
    }

    // Auth automatique via .env.local
    const token = await getExoteachToken();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseKey) {
      return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: { id: string; status: string; titre?: string; newId?: string; error?: string }[] = [];

    for (const id of serieIds) {
      try {
        // 1. Fetch depuis ExoTeach
        const gqlRes = await fetch(EXOTEACH_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-token": token,
          },
          body: JSON.stringify({ query: GET_SERIE, variables: { id: String(id) } }),
        });
        const gqlJson = await gqlRes.json();

        if (gqlJson.errors) {
          throw new Error(gqlJson.errors[0]?.message || "Erreur GraphQL");
        }

        const qcm = gqlJson.data?.qcm;
        if (!qcm) {
          results.push({ id: String(id), status: "not_found" });
          continue;
        }

        // 2. Créer la série dans Supabase
        const { data: newSerie, error: serieErr } = await supabase
          .from("series")
          .insert({
            name: qcm.titre || `ExoTeach #${id}`,
            cours_id: coursId || null,
            type: serieType || "entrainement",
            timed: false,
            visible: false,
            score_definitif: false,
          })
          .select("id")
          .single();

        if (serieErr || !newSerie) throw new Error(serieErr?.message || "Erreur création série");

        // 3. Importer les questions
        const questions: any[] = qcm.questions || [];
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi];

          const { data: newQ, error: qErr } = await supabase
            .from("questions")
            .insert({
              text: stripHtml(q.question),
              type: "qcm_multiple",
              difficulty: 2,
              cours_id: coursId || null,
              justification: stripHtml(q.explications) || null,
              image_url: q.url_image_q || null,
            })
            .select("id")
            .single();

          if (qErr || !newQ) continue;

          // Options A-E
          const options = (q.answers || []).map((ans: any, idx: number) => ({
            question_id: newQ.id,
            label: indexToLabel(idx),
            text: stripHtml(ans.text),
            is_correct: ans.isTrue === true,
            order_index: idx,
            justification: stripHtml(ans.explanation) || null,
            image_url: ans.url_image || null,
          }));
          if (options.length > 0) await supabase.from("options").insert(options);

          // Lier à la série
          await supabase.from("series_questions").insert({
            series_id: newSerie.id,
            question_id: newQ.id,
            order_index: qi,
          });
        }

        results.push({ id: String(id), status: "ok", titre: qcm.titre, newId: newSerie.id });
      } catch (err: any) {
        results.push({ id: String(id), status: "error", error: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
