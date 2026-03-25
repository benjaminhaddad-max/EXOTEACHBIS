/**
 * Applique supabase/migrations/012_examens_coefficients_filieres.sql
 *
 * Méthode 1 (recommandée si tu as le mot de passe DB) :
 *   DATABASE_URL dans .env.local (Settings > Database > URI)
 *
 * Méthode 2 (sans mot de passe Postgres) :
 *   SUPABASE_ACCESS_TOKEN dans .env.local = jeton personnel
 *   https://supabase.com/dashboard/account/tokens  (commence souvent par sbp_)
 *
 * Réf projet : déduit de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_PROJECT_REF absent.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnvLocal() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    v = v.replace(/\\n$/g, "").trim();
    out[m[1]] = v;
  }
  return out;
}

function projectRefFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/https?:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : null;
}

function stripLineComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .trim();
}

async function runViaManagementApi(token, ref, sql) {
  const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;

  const exec = async (query) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${res.status}: ${text}`);
    }
    return text;
  };

  try {
    await exec(sql);
    return;
  } catch (e) {
    console.warn("Script en un seul bloc refusé, exécution instruction par instruction…");
  }

  const chunks = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .map((s) => stripLineComments(s))
    .filter((s) => s.length > 0);

  for (let i = 0; i < chunks.length; i++) {
    const query = chunks[i].endsWith(";") ? chunks[i] : `${chunks[i]};`;
    try {
      await exec(query);
    } catch (e) {
      throw new Error(`Bloc ${i + 1}/${chunks.length}: ${e.message}`);
    }
  }
}

async function main() {
  const env = { ...process.env, ...loadEnvLocal() };
  const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "012_examens_coefficients_filieres.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const ref = env.SUPABASE_PROJECT_REF || projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);

  if (env.DATABASE_URL) {
    const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query(sql);
      console.log("Migration 012 appliquée avec succès (via DATABASE_URL).");
    } finally {
      await client.end();
    }
    return;
  }

  if (env.SUPABASE_ACCESS_TOKEN && ref) {
    await runViaManagementApi(env.SUPABASE_ACCESS_TOKEN, ref, sql);
    console.log("Migration 012 appliquée avec succès (via Supabase Management API).");
    return;
  }

  console.error(`
Impossible d’appliquer la migration : aucun accès base configuré.

Ajoute UNE des lignes suivantes dans .env.local :

  A) DATABASE_URL=postgresql://postgres....   (Settings > Database > Connection string > URI)

  B) SUPABASE_ACCESS_TOKEN=sbp_....         (https://supabase.com/dashboard/account/tokens)
     (+ NEXT_PUBLIC_SUPABASE_URL déjà présent pour le ref projet, ou SUPABASE_PROJECT_REF=${ref || "uylrllyffpypqmitmbme"})

Puis : npm run migrate:012
`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
