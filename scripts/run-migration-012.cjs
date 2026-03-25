/**
 * Applique supabase/migrations/012_examens_coefficients_filieres.sql
 * Prérequis : DATABASE_URL dans .env.local
 * (Supabase Dashboard > Project Settings > Database > Connection string > URI)
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
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const env = { ...process.env, ...loadEnvLocal() };
  const url = env.DATABASE_URL;
  if (!url) {
    console.error(`
DATABASE_URL manquant dans .env.local

1. Ouvre Supabase > Project Settings > Database
2. Sous "Connection string", choisis URI et copie la chaîne (avec le mot de passe)
3. Ajoute une ligne dans .env.local :
   DATABASE_URL=postgresql://postgres....

Puis relance : node scripts/run-migration-012.cjs
`);
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "012_examens_coefficients_filieres.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration 012 appliquée avec succès.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
