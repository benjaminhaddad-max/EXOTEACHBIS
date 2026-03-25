/**
 * cartographie-exoteach.mjs
 *
 * Génère une cartographie complète de l'université Paris-Cité sur ExoTeach :
 * matières → chapitres → séries (titre + ID).
 *
 * USAGE :
 *   node scripts/cartographie-exoteach.mjs
 *
 * Utilise EXOTEACH_LOGIN + EXOTEACH_PASSWORD depuis .env.local
 * Ou passer le token directement :
 *   EXOTEACH_TOKEN=eyJ... node scripts/cartographie-exoteach.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Charger .env.local ────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // pas de .env.local — on continue avec les variables existantes
  }
}
loadEnv();

const EXOTEACH_API = "https://diploma.exoteach.com/medibox2-api/graphql";

// ─── Auth ──────────────────────────────────────────────────────────────────────
async function getToken() {
  if (process.env.EXOTEACH_TOKEN) return process.env.EXOTEACH_TOKEN;

  const login = process.env.EXOTEACH_LOGIN?.trim();
  const password = process.env.EXOTEACH_PASSWORD?.trim();
  if (!login || !password) {
    console.error("❌ EXOTEACH_LOGIN / EXOTEACH_PASSWORD manquants dans .env.local");
    console.error("   Ou passer EXOTEACH_TOKEN=eyJ... en variable d'environnement");
    process.exit(1);
  }

  const res = await fetch(EXOTEACH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `mutation SignIn($login: String!, $password: String!) {
        signIn(login: $login, password: $password) { token }
      }`,
      variables: { login, password },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`signIn échoué : ${json.errors[0]?.message}`);
  return json.data?.signIn?.token;
}

// ─── Helper GraphQL ────────────────────────────────────────────────────────────
async function gql(token, query, variables = {}, nexusToken = null) {
  const nt = nexusToken || token;
  const res = await fetch(EXOTEACH_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Nexus-Token": nt,
      nexustoken: nt,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// ─── Introspection pour découvrir les queries disponibles ─────────────────────
async function introspect(nexusToken) {
  const res = await gql(nexusToken, `{ __schema { queryType { fields { name description } } } }`, {}, nexusToken);
  return res.data?.__schema?.queryType?.fields || [];
}

// ─── Queries catalog ───────────────────────────────────────────────────────────

// Tenter différentes queries pour trouver la structure université/matière/chapitre
const QUERIES_TO_TRY = [
  // Structure complète
  {
    name: "universities",
    query: `{ universities { id name } }`,
    extract: (d) => d.universities,
  },
  {
    name: "allUniversities",
    query: `{ allUniversities { id name } }`,
    extract: (d) => d.allUniversities,
  },
  {
    name: "etablissements",
    query: `{ etablissements { id nom } }`,
    extract: (d) => d.etablissements,
  },
  {
    name: "promotions",
    query: `{ promotions { id name university { id name } } }`,
    extract: (d) => d.promotions,
  },
  {
    name: "matieres",
    query: `{ matieres { id nom description } }`,
    extract: (d) => d.matieres,
  },
  {
    name: "subjects",
    query: `{ subjects { id name } }`,
    extract: (d) => d.subjects,
  },
  {
    name: "chapitres",
    query: `{ chapitres { id nom matiere { id nom } } }`,
    extract: (d) => d.chapitres,
  },
  {
    name: "qcms",
    query: `{ qcms(first: 20) { id_qcm titre nombreQuestions } }`,
    extract: (d) => d.qcms,
  },
  {
    name: "catalog",
    query: `{ catalog { id name children { id name } } }`,
    extract: (d) => d.catalog,
  },
  {
    name: "me",
    query: `{ me { id login universite { id nom matieres { id nom chapitres { id nom qcms { id_qcm titre nombreQuestions } } } } } }`,
    extract: (d) => d.me,
  },
];

// Query plus exhaustive basée sur la structure typique de ce type d'API
const DEEP_QUERIES = [
  {
    name: "me_with_promo",
    query: `{
      me {
        id
        login
        promotions {
          id
          name
          matieres {
            id
            nom
            chapitres {
              id
              nom
              qcms {
                id_qcm
                titre
                nombreQuestions
              }
            }
          }
        }
      }
    }`,
  },
  {
    name: "me_full",
    query: `{
      me {
        id
        login
        universite { id nom }
        promotion { id name }
      }
    }`,
  },
  {
    name: "promo_matieres",
    query: `{
      promotion {
        id
        name
        matieres {
          id
          nom
          chapitres {
            id
            nom
            qcms {
              id_qcm
              titre
              nombreQuestions
            }
          }
        }
      }
    }`,
  },
  {
    name: "medibox",
    query: `{
      medibox {
        matieres {
          id
          nom
          chapitres {
            id
            nom
            qcms {
              id_qcm
              titre
              nombreQuestions
            }
          }
        }
      }
    }`,
  },
  {
    name: "qcmList",
    query: `{
      qcmList {
        id_qcm
        titre
        nombreQuestions
        chapitre {
          id
          nom
          matiere {
            id
            nom
          }
        }
      }
    }`,
  },
  {
    name: "allQcms",
    query: `{
      allQcms {
        id_qcm
        titre
        nombreQuestions
        chapitre {
          id
          nom
          matiere { id nom }
        }
      }
    }`,
  },
  {
    name: "qcms_with_chapitre",
    query: `{
      qcms {
        id_qcm
        titre
        nombreQuestions
        chapitre {
          id
          nom
          matiere { id nom }
        }
      }
    }`,
  },
];

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Token du navigateur (priorité max)
  const browserToken = process.env.EXOTEACH_BROWSER_TOKEN?.trim();
  if (browserToken) {
    console.log("🌐 Utilisation du token navigateur (EXOTEACH_BROWSER_TOKEN)\n");
  }

  console.log("🔐 Authentification ExoTeach...");
  const token = await getToken();
  console.log("✅ Token JWT obtenu\n");

  // Le nexusToken peut être différent du JWT token
  const nexusToken = browserToken || token;

  if (!browserToken) {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  ASTUCE : si les requêtes échouent avec NexusToken,      ║");
    console.log("║  récupère le token depuis ton navigateur :               ║");
    console.log("║                                                           ║");
    console.log("║  1. Ouvre diploma.exoteach.com et connecte-toi           ║");
    console.log("║  2. F12 → Onglet Network → clique une requête GraphQL    ║");
    console.log("║  3. Headers → cherche 'nexustoken' ou 'x-nexus-token'    ║");
    console.log("║  4. Lance : EXOTEACH_BROWSER_TOKEN=<valeur> node ...     ║");
    console.log("║                                                           ║");
    console.log("║  Ou depuis la Console :                                  ║");
    console.log("║  localStorage.getItem('nexusToken')                      ║");
    console.log("║  localStorage.getItem('token')                           ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");
  }

  // 1. Introspection — quelles queries existent ?
  console.log("🔍 Introspection de l'API GraphQL...");
  const fields = await introspect(nexusToken);
  if (fields.length) {
    console.log(`\nQueries disponibles (${fields.length}) :`);
    fields.forEach((f) => console.log(`  - ${f.name}${f.description ? ` : ${f.description}` : ""}`));
    console.log();
  } else {
    console.log("  (introspection vide ou désactivée)\n");
  }

  // 2. Tester les queries une par une
  console.log("🧪 Test des queries catalog...\n");
  const results = {};

  for (const q of [...QUERIES_TO_TRY, ...DEEP_QUERIES]) {
    try {
      const res = await gql(token, q.query, {}, nexusToken);
      if (res.errors) {
        // silencieux sauf si proche
        if (!res.errors[0]?.message?.includes("Cannot query")) {
          console.log(`  ⚠ ${q.name}: ${res.errors[0]?.message}`);
        }
        continue;
      }
      if (res.data) {
        const keys = Object.keys(res.data);
        if (keys.some((k) => res.data[k] !== null)) {
          console.log(`  ✅ ${q.name} → ${JSON.stringify(res.data).slice(0, 120)}...`);
          results[q.name] = res.data;
        }
      }
    } catch (err) {
      // ignore
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log(`Queries qui ont retourné des données : ${Object.keys(results).join(", ") || "aucune"}`);

  // 3. Sauvegarder les résultats bruts pour analyse
  const rawPath = resolve(__dirname, "../scripts/exoteach-raw.json");
  writeFileSync(rawPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Résultats bruts sauvegardés : scripts/exoteach-raw.json`);

  // 4. Tenter de construire la cartographie si données disponibles
  let catalog = null;

  // Essayer différentes structures de données
  if (results.qcmList) catalog = buildFromQcmList(results.qcmList.qcmList);
  else if (results.allQcms) catalog = buildFromQcmList(results.allQcms.allQcms);
  else if (results.qcms_with_chapitre) catalog = buildFromQcmList(results.qcms_with_chapitre.qcms);
  else if (results.me_with_promo) catalog = buildFromMe(results.me_with_promo.me);
  else if (results.promo_matieres) catalog = buildFromPromo(results.promo_matieres.promotion);
  else if (results.medibox) catalog = buildFromMediabox(results.medibox.medibox);

  if (catalog) {
    printCatalog(catalog);
    const mdPath = resolve(__dirname, "../scripts/cartographie-paris-cite.md");
    writeCatalogMarkdown(catalog, mdPath);
    console.log(`\n📋 Cartographie Markdown : scripts/cartographie-paris-cite.md`);
  } else {
    console.log("\n⚠ Impossible de construire la cartographie automatiquement.");
    console.log("  Vérifie scripts/exoteach-raw.json pour voir les données disponibles.");
    console.log("  Relance avec EXOTEACH_TOKEN=<token_du_navigateur> si les credentials .env ne fonctionnent pas.");
  }
}

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildFromQcmList(qcms) {
  if (!qcms?.length) return null;
  const matieres = {};
  for (const q of qcms) {
    const matNom = q.chapitre?.matiere?.nom || "Sans matière";
    const chapNom = q.chapitre?.nom || "Sans chapitre";
    if (!matieres[matNom]) matieres[matNom] = {};
    if (!matieres[matNom][chapNom]) matieres[matNom][chapNom] = [];
    matieres[matNom][chapNom].push({ id: q.id_qcm, titre: q.titre, nb: q.nombreQuestions });
  }
  return matieres;
}

function buildFromMe(me) {
  if (!me?.promotions?.length) return null;
  const matieres = {};
  for (const promo of me.promotions) {
    for (const mat of promo.matieres || []) {
      if (!matieres[mat.nom]) matieres[mat.nom] = {};
      for (const chap of mat.chapitres || []) {
        if (!matieres[mat.nom][chap.nom]) matieres[mat.nom][chap.nom] = [];
        for (const q of chap.qcms || []) {
          matieres[mat.nom][chap.nom].push({ id: q.id_qcm, titre: q.titre, nb: q.nombreQuestions });
        }
      }
    }
  }
  return matieres;
}

function buildFromPromo(promo) {
  if (!promo?.matieres?.length) return null;
  const matieres = {};
  for (const mat of promo.matieres) {
    if (!matieres[mat.nom]) matieres[mat.nom] = {};
    for (const chap of mat.chapitres || []) {
      if (!matieres[mat.nom][chap.nom]) matieres[mat.nom][chap.nom] = [];
      for (const q of chap.qcms || []) {
        matieres[mat.nom][chap.nom].push({ id: q.id_qcm, titre: q.titre, nb: q.nombreQuestions });
      }
    }
  }
  return matieres;
}

function buildFromMediabox(medibox) {
  if (!medibox?.matieres?.length) return null;
  const matieres = {};
  for (const mat of medibox.matieres) {
    if (!matieres[mat.nom]) matieres[mat.nom] = {};
    for (const chap of mat.chapitres || []) {
      if (!matieres[mat.nom][chap.nom]) matieres[mat.nom][chap.nom] = [];
      for (const q of chap.qcms || []) {
        matieres[mat.nom][chap.nom].push({ id: q.id_qcm, titre: q.titre, nb: q.nombreQuestions });
      }
    }
  }
  return matieres;
}

// ─── Affichage ─────────────────────────────────────────────────────────────────

function printCatalog(catalog) {
  console.log("\n\n══════════════════════════════════════════════════════════");
  console.log("       CARTOGRAPHIE EXOTEACH — Université Paris-Cité");
  console.log("══════════════════════════════════════════════════════════\n");

  for (const [matiere, chapitres] of Object.entries(catalog)) {
    console.log(`\n📚 ${matiere.toUpperCase()}`);
    console.log("─".repeat(60));
    for (const [chapitre, series] of Object.entries(chapitres)) {
      console.log(`\n  📖 ${chapitre}`);
      for (const s of series) {
        console.log(`     • [ID: ${String(s.id).padEnd(6)}] ${s.titre}${s.nb ? ` (${s.nb}Q)` : ""}`);
      }
    }
  }
}

function writeCatalogMarkdown(catalog, path) {
  const lines = [
    "# Cartographie ExoTeach — Université Paris-Cité",
    "",
    `> Généré le ${new Date().toLocaleDateString("fr-FR")}`,
    "",
  ];

  for (const [matiere, chapitres] of Object.entries(catalog)) {
    lines.push(`## ${matiere}`, "");
    for (const [chapitre, series] of Object.entries(chapitres)) {
      lines.push(`### ${chapitre}`, "");
      lines.push("| ID ExoTeach | Titre de la série | Nb Questions |");
      lines.push("|-------------|-------------------|:------------:|");
      for (const s of series) {
        lines.push(`| \`${s.id}\` | ${s.titre} | ${s.nb ?? "?"} |`);
      }
      lines.push("");
    }
  }

  writeFileSync(path, lines.join("\n"));
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
