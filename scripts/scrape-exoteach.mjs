/**
 * scrape-exoteach.mjs
 *
 * Importe une ou plusieurs séries ExoTeach directement via leur API GraphQL,
 * puis les insère dans Supabase (questions + options + série).
 *
 * USAGE :
 *   node scripts/scrape-exoteach.mjs <TOKEN> <SERIE_ID> [<SERIE_ID> ...]
 *
 * TOKEN : Récupère-le dans ton navigateur sur diploma.exoteach.com :
 *   → F12 > Console > localStorage.getItem('token')
 *
 * EXEMPLES :
 *   node scripts/scrape-exoteach.mjs eyJhbG... 418
 *   node scripts/scrape-exoteach.mjs eyJhbG... 418 419 420 421
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ────────────────────────────────────────────────────────────────────

const EXOTEACH_API = "https://diploma.exoteach.com/medibox2-api/graphql";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://uylrllyffpypqmitmbme.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ─── GraphQL query ─────────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSerie(token, serieId) {
  const res = await fetch(EXOTEACH_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: GET_SERIE, variables: { id: String(serieId) } }),
  });

  const json = await res.json();

  if (json.errors) {
    const msg = json.errors[0]?.message || "Erreur inconnue";
    throw new Error(`GraphQL error série ${serieId}: ${msg}`);
  }

  return json.data.qcm;
}

// Convertit A-Z index en label A B C D E
function indexToLabel(i) {
  return String.fromCharCode(65 + i); // 0→A, 1→B, etc.
}

async function importSerie(supabase, coursId, serieData) {
  const title = serieData.titre || `Série ExoTeach #${serieData.id_qcm}`;
  console.log(`  → Titre : ${title} (${serieData.questions?.length ?? 0} questions)`);

  // 1. Créer la série dans Supabase
  const { data: newSerie, error: serieErr } = await supabase
    .from("series")
    .insert({ titre: title, cours_id: coursId || null, type: "entrainement" })
    .select("id")
    .single();

  if (serieErr) throw new Error(`Erreur création série : ${serieErr.message}`);
  const serieId = newSerie.id;
  console.log(`  ✓ Série créée : ${serieId}`);

  for (let qi = 0; qi < serieData.questions.length; qi++) {
    const q = serieData.questions[qi];
    const questionText = stripHtml(q.question);
    const justification = stripHtml(q.explications);

    // 2. Créer la question
    const { data: newQ, error: qErr } = await supabase
      .from("questions")
      .insert({
        text: questionText,
        type: "qcm_multiple",
        difficulty: 2,
        cours_id: coursId || null,
        justification: justification || null,
        image_url: q.url_image_q || null,
      })
      .select("id")
      .single();

    if (qErr || !newQ) {
      console.warn(`  ⚠ Question ${qi + 1} ignorée : ${qErr?.message}`);
      continue;
    }

    // 3. Créer les options (A B C D E)
    const options = (q.answers || []).map((ans, idx) => ({
      question_id: newQ.id,
      label: indexToLabel(idx),
      text: stripHtml(ans.text),
      is_correct: ans.isTrue === true,
      order_index: idx,
      justification: stripHtml(ans.explanation) || null,
      image_url: ans.url_image || null,
    }));

    if (options.length > 0) {
      const { error: optErr } = await supabase.from("options").insert(options);
      if (optErr) console.warn(`  ⚠ Options Q${qi + 1} : ${optErr.message}`);
    }

    // 4. Lier à la série
    await supabase.from("series_questions").insert({
      series_id: serieId,
      question_id: newQ.id,
      order_index: qi,
    });

    console.log(`  ✓ Q${qi + 1} importée (${options.length} options)`);
  }

  return serieId;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage : node scripts/scrape-exoteach.mjs <TOKEN> <SERIE_ID> [<SERIE_ID> ...]");
    console.error("TOKEN : F12 > Console > localStorage.getItem('token') sur diploma.exoteach.com");
    process.exit(1);
  }

  const token = args[0];
  const serieIds = args.slice(1);

  if (!SUPABASE_KEY) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY manquant. Lance avec :");
    console.error("   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/scrape-exoteach.mjs ...");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // cours_id optionnel (peut être null, tu pourras réassigner dans l'admin)
  const coursId = process.env.COURS_ID || null;
  if (coursId) console.log(`cours_id ciblé : ${coursId}`);
  else console.log("ℹ Aucun cours_id fourni — les questions seront orphelines (assignables ensuite)");

  console.log(`\n🚀 Import de ${serieIds.length} série(s) ExoTeach...\n`);

  const results = [];

  for (const id of serieIds) {
    console.log(`\n📥 Série ${id}...`);
    try {
      const data = await fetchSerie(token, id);
      if (!data) {
        console.warn(`  ⚠ Série ${id} introuvable ou non accessible`);
        results.push({ id, status: "not_found" });
        continue;
      }
      const newId = await importSerie(supabase, coursId, data);
      results.push({ id, status: "ok", newId, titre: data.titre });
    } catch (err) {
      console.error(`  ❌ Erreur : ${err.message}`);
      results.push({ id, status: "error", error: err.message });
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log("Résumé :");
  results.forEach(r => {
    const icon = r.status === "ok" ? "✅" : r.status === "not_found" ? "⚠️ " : "❌";
    console.log(`  ${icon} Série ${r.id} : ${r.status}${r.titre ? ` — "${r.titre}"` : ""}${r.newId ? ` → ${r.newId}` : ""}${r.error ? ` (${r.error})` : ""}`);
  });
}

main().catch(err => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
