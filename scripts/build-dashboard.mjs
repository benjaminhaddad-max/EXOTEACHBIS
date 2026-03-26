/**
 * build-dashboard.mjs
 *
 * Parse cartographie-paris-cite.md and build an interactive HTML dashboard.
 *
 * USAGE: node scripts/build-dashboard.mjs
 * OUTPUT: scripts/exoteach-dashboard.html (open in browser)
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mdPath = resolve(__dirname, "cartographie-paris-cite.md");
const outPath = resolve(__dirname, "exoteach-dashboard.html");

// ─── Parse Markdown ───────────────────────────────────────────────────────────

const md = readFileSync(mdPath, "utf-8");
const lines = md.split("\n");

const matieres = [];
let currentMatiere = null;
let currentChapter = null;

// Known UE → Semestre mapping for Paris-Cité PASS
const UE_SEMESTER = {
  "UE1": "S1", "UE2": "S1", "UE3": "S1", "UE4": "S1",
  "UE5": "S1", "UE6": "S2", "UE7": "S2", "UE8": "S2",
  "UE9": "S2", "UE10": "S2", "UE11": "S2", "UE12": "S2",
};

// Classify matière into a category
function classifyMatiere(name) {
  const n = name.toLowerCase();

  // Match UE number
  const ueMatch = name.match(/^UE(\d+)/i);
  if (ueMatch) {
    const ueNum = parseInt(ueMatch[1]);
    return {
      formation: "PASS",
      semestre: ueNum <= 5 ? "S1" : "S2",
      ue: `UE${ueNum}`,
    };
  }

  // Known S1 subjects
  if (n.includes("chimie") || n.includes("atomistique")) return { formation: "PASS", semestre: "S1", ue: "UE1 - Chimie" };
  if (n.includes("biochimie")) return { formation: "PASS", semestre: "S1", ue: "UE2 - Biochimie" };
  if (n.includes("biologie cellulaire") || n.includes("histologie")) return { formation: "PASS", semestre: "S1", ue: "UE3 - Biologie Cellulaire" };
  if (n.includes("physique") || n.includes("biophysique")) return { formation: "PASS", semestre: "S1", ue: "UE4 - Physique" };
  if (n.includes("anatomie")) return { formation: "PASS", semestre: "S1", ue: "UE5 - Anatomie" };

  // Known S2 subjects
  if (n.includes("santé publique") || n.includes("promotion") || n.includes("prévention")) return { formation: "PASS", semestre: "S2", ue: "UE6 - Santé Publique" };
  if (n.includes("shs") || n.includes("histoire") || n.includes("épistémologie") || n.includes("droit") || n.includes("économie") || n.includes("éthique")) return { formation: "PASS", semestre: "S2", ue: "UE7 - SHS" };
  if (n.includes("icm") || n.includes("médicament")) return { formation: "PASS", semestre: "S2", ue: "UE8 - ICM" };
  if (n.includes("biostatistiques") || n.includes("bio-informatique")) return { formation: "PASS", semestre: "S2", ue: "UE9 - Biostatistiques" };
  if (n.includes("embryologie") || n.includes("bdd") || n.includes("gastrulation") || n.includes("neurulation")) return { formation: "PASS", semestre: "S1", ue: "UE3 - Embryologie / BDD" };
  if (n.includes("génétique")) return { formation: "PASS", semestre: "S2", ue: "UE10 - Génétique" };
  if (n.includes("pharmacie")) return { formation: "PASS", semestre: "S2", ue: "UE12 - Pharmacie" };
  if (n.includes("immunité") || n.includes("infection")) return { formation: "PASS", semestre: "S2", ue: "Immunités & Infections" };
  if (n.includes("hématologie")) return { formation: "PASS", semestre: "S2", ue: "Hématologie" };
  if (n.includes("physiologie")) return { formation: "PASS", semestre: "S2", ue: "Physiologie" };
  if (n.includes("imagerie")) return { formation: "PASS", semestre: "S2", ue: "Imagerie" };
  if (n.includes("système nerveux") || n.includes("neurosciences")) return { formation: "PASS", semestre: "S2", ue: "Système Nerveux" };
  if (n.includes("biologie moléculaire")) return { formation: "PASS", semestre: "S1", ue: "Biologie Moléculaire" };
  if (n.includes("réparation")) return { formation: "PASS", semestre: "S2", ue: "Réparation Tissulaire" };
  if (n.includes("histophysiologie")) return { formation: "PASS", semestre: "S2", ue: "Histophysiologie" };
  if (n.includes("anglais")) return { formation: "PASS", semestre: "Transversal", ue: "Anglais" };
  if (n.includes("maïeutique")) return { formation: "Spécialités", semestre: "Spé", ue: "Spé Maïeutique" };
  if (n.includes("médecine")) return { formation: "Spécialités", semestre: "Spé", ue: "Spé Médecine" };
  if (n.includes("socle")) return { formation: "PASS", semestre: "S1", ue: "Socle" };
  if (n.includes("upec")) return { formation: "LAS / Autres", semestre: "", ue: name };

  // US = Université de Strasbourg? Or "US" suffix
  if (n.includes(" us")) return { formation: "PASS", semestre: "S1", ue: "UE Spécifiques US" };

  return { formation: "Autre", semestre: "", ue: name };
}

for (const line of lines) {
  // ## = matière
  if (line.startsWith("## ") && !line.startsWith("## Sommaire")) {
    const name = line.replace("## ", "").trim();
    const ueIdMatch = lines[lines.indexOf(line) + 1]?.match(/UE ID ExoTeach: `(\d+)`.*?(\d+) séries/);
    currentMatiere = {
      name,
      ueId: ueIdMatch ? ueIdMatch[1] : null,
      nbSeries: ueIdMatch ? parseInt(ueIdMatch[2]) : 0,
      chapters: [],
      ...classifyMatiere(name),
    };
    matieres.push(currentMatiere);
    currentChapter = null;
  }
  // ### = chapitre
  else if (line.startsWith("### ") && currentMatiere) {
    const name = line.replace("### ", "").trim();
    currentChapter = { name, series: [] };
    currentMatiere.chapters.push(currentChapter);
  }
  // Table row = série
  else if (line.startsWith("| `") && currentChapter) {
    const match = line.match(/\| `(\d+)` \| (.+?) \| (\d+) \|/);
    if (match) {
      currentChapter.series.push({
        id: parseInt(match[1]),
        title: match[2].trim(),
        nbQuestions: parseInt(match[3]),
      });
    }
  }
}

// ─── Build tree structure ──────────────────────────────────────────────────────

const tree = {};
for (const mat of matieres) {
  const f = mat.formation;
  const s = mat.semestre || "Autre";
  const u = mat.ue;

  if (!tree[f]) tree[f] = {};
  if (!tree[f][s]) tree[f][s] = {};
  if (!tree[f][s][u]) tree[f][s][u] = [];
  tree[f][s][u].push(mat);
}

// Count totals
let totalSeries = 0;
let totalQuestions = 0;
for (const mat of matieres) {
  for (const chap of mat.chapters) {
    totalSeries += chap.series.length;
    for (const s of chap.series) totalQuestions += s.nbQuestions;
  }
}

console.log(`\n📊 Parsed: ${matieres.length} matières, ${totalSeries} séries, ${totalQuestions} questions`);
console.log(`📁 Tree: ${Object.keys(tree).join(", ")}`);

// ─── Generate HTML Dashboard ──────────────────────────────────────────────────

const dataJson = JSON.stringify({ tree, matieres, stats: { totalSeries, totalQuestions, totalMatieres: matieres.length } });

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ExoTeach — Cartographie Paris-Cité</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0e1e35; color: #e5e7eb; min-height: 100vh; }

    .header { background: linear-gradient(135deg, #0e1e35, #1a2d4a); padding: 20px 32px; border-bottom: 1px solid rgba(212,171,80,0.2); display: flex; align-items: center; gap: 20px; }
    .header h1 { font-size: 22px; font-weight: 800; color: #fff; }
    .header h1 span { color: #C9A84C; }
    .header .stats { display: flex; gap: 16px; margin-left: auto; }
    .stat { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 8px 16px; text-align: center; }
    .stat .num { font-size: 18px; font-weight: 800; color: #C9A84C; }
    .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.5); }

    .search-bar { padding: 16px 32px; background: rgba(0,0,0,0.2); }
    .search-bar input { width: 100%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 12px 16px; color: #fff; font-size: 14px; outline: none; }
    .search-bar input:focus { border-color: #C9A84C; box-shadow: 0 0 0 2px rgba(212,171,80,0.2); }
    .search-bar input::placeholder { color: rgba(255,255,255,0.3); }

    .content { display: flex; min-height: calc(100vh - 140px); }

    .sidebar { width: 320px; background: rgba(0,0,0,0.15); border-right: 1px solid rgba(255,255,255,0.08); overflow-y: auto; padding: 12px 0; }
    .sidebar-section { padding: 4px 12px; }
    .sidebar-section .formation { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #C9A84C; padding: 12px 8px 6px; }
    .sidebar-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all 0.15s; font-size: 13px; color: rgba(255,255,255,0.7); }
    .sidebar-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .sidebar-item.active { background: rgba(212,171,80,0.15); color: #C9A84C; border: 1px solid rgba(212,171,80,0.25); }
    .sidebar-item .badge { margin-left: auto; font-size: 10px; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px; color: rgba(255,255,255,0.5); }
    .sidebar-item .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .s1 .dot { background: #3B82F6; }
    .s2 .dot { background: #8B5CF6; }
    .spe .dot { background: #F59E0B; }
    .other .dot { background: #6B7280; }

    .main { flex: 1; overflow-y: auto; padding: 24px 32px; }

    .matiere-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; margin-bottom: 16px; overflow: hidden; }
    .matiere-header { padding: 16px 20px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: background 0.15s; }
    .matiere-header:hover { background: rgba(255,255,255,0.03); }
    .matiere-header h3 { font-size: 15px; font-weight: 700; color: #fff; flex: 1; }
    .matiere-header .ue-badge { font-size: 10px; background: rgba(212,171,80,0.15); color: #C9A84C; padding: 3px 10px; border-radius: 8px; font-weight: 600; }
    .matiere-header .count { font-size: 11px; color: rgba(255,255,255,0.4); }
    .matiere-header .chevron { transition: transform 0.2s; color: rgba(255,255,255,0.3); }
    .matiere-header.open .chevron { transform: rotate(90deg); }

    .chapter { padding: 0 20px; }
    .chapter-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.6); padding: 10px 0 6px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 8px; }
    .chapter-title::before { content: "📖"; font-size: 12px; }

    .series-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; padding-bottom: 12px; }
    .serie-card { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; cursor: pointer; transition: all 0.15s; }
    .serie-card:hover { background: rgba(212,171,80,0.08); border-color: rgba(212,171,80,0.25); }
    .serie-card.selected { background: rgba(212,171,80,0.15); border-color: #C9A84C; }
    .serie-card .id { font-size: 11px; font-weight: 700; color: #C9A84C; background: rgba(212,171,80,0.1); padding: 2px 8px; border-radius: 6px; flex-shrink: 0; min-width: 50px; text-align: center; }
    .serie-card .title { font-size: 12px; color: rgba(255,255,255,0.8); flex: 1; line-height: 1.3; }
    .serie-card .qcount { font-size: 10px; color: rgba(255,255,255,0.35); flex-shrink: 0; }

    .empty { text-align: center; padding: 60px 20px; color: rgba(255,255,255,0.3); }
    .empty .icon { font-size: 48px; margin-bottom: 12px; }
    .empty p { font-size: 14px; }

    .selection-bar { position: fixed; bottom: 0; left: 0; right: 0; background: linear-gradient(180deg, transparent, rgba(14,30,53,0.95) 20%); padding: 16px 32px; display: none; }
    .selection-bar.visible { display: flex; align-items: center; gap: 16px; }
    .selection-bar .info { font-size: 13px; color: rgba(255,255,255,0.7); }
    .selection-bar .info strong { color: #C9A84C; }
    .selection-bar .actions { margin-left: auto; display: flex; gap: 8px; }
    .btn { padding: 8px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s; }
    .btn-gold { background: #C9A84C; color: #0e1e35; }
    .btn-gold:hover { background: #d4b65c; }
    .btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #fff; }
    .btn-outline:hover { background: rgba(255,255,255,0.1); }

    .hidden { display: none !important; }

    @media (max-width: 768px) {
      .content { flex-direction: column; }
      .sidebar { width: 100%; max-height: 300px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ExoTeach <span>Cartographie</span></h1>
    <div style="font-size:12px;color:rgba(255,255,255,0.4)">Université Paris-Cité</div>
    <div class="stats">
      <div class="stat"><div class="num" id="stat-matieres">0</div><div class="label">Matières</div></div>
      <div class="stat"><div class="num" id="stat-series">0</div><div class="label">Séries</div></div>
      <div class="stat"><div class="num" id="stat-questions">0</div><div class="label">Questions</div></div>
    </div>
  </div>

  <div class="search-bar">
    <input type="text" id="search" placeholder="Rechercher une matière, un chapitre, une série ou un ID..." />
  </div>

  <div class="content">
    <div class="sidebar" id="sidebar"></div>
    <div class="main" id="main">
      <div class="empty"><div class="icon">📂</div><p>Sélectionnez une matière dans le menu</p></div>
    </div>
  </div>

  <div class="selection-bar" id="selection-bar">
    <div class="info"><strong id="sel-count">0</strong> séries sélectionnées (<span id="sel-questions">0</span> questions)</div>
    <div class="actions">
      <button class="btn btn-outline" onclick="copyIds()">📋 Copier les IDs</button>
      <button class="btn btn-outline" onclick="clearSelection()">✕ Désélectionner</button>
      <button class="btn btn-gold" onclick="exportSelection()">📥 Exporter JSON</button>
    </div>
  </div>

<script>
const DATA = ${dataJson};

const selected = new Set();
let currentFilter = null;

// ─── Init ────────────────────────────────────────────────────────────────────
document.getElementById("stat-matieres").textContent = DATA.stats.totalMatieres;
document.getElementById("stat-series").textContent = DATA.stats.totalSeries.toLocaleString();
document.getElementById("stat-questions").textContent = DATA.stats.totalQuestions.toLocaleString();

// ─── Build sidebar ──────────────────────────────────────────────────────────
const sidebar = document.getElementById("sidebar");

const formationOrder = ["PASS", "Spécialités", "LAS / Autres", "Autre"];
const semesterOrder = ["S1", "S2", "Transversal", "Spé", "Autre", ""];

for (const formation of formationOrder) {
  if (!DATA.tree[formation]) continue;

  const section = document.createElement("div");
  section.className = "sidebar-section";
  section.innerHTML = '<div class="formation">' + formation + '</div>';

  const semesters = Object.keys(DATA.tree[formation]).sort((a, b) => semesterOrder.indexOf(a) - semesterOrder.indexOf(b));

  for (const semester of semesters) {
    const ues = DATA.tree[formation][semester];

    if (semester && semester !== "Autre") {
      const semLabel = document.createElement("div");
      semLabel.style.cssText = "font-size:10px;color:rgba(255,255,255,0.25);padding:8px 12px 2px;font-weight:600;text-transform:uppercase;letter-spacing:1px;";
      semLabel.textContent = semester;
      section.appendChild(semLabel);
    }

    const ueNames = Object.keys(ues).sort();
    for (const ueName of ueNames) {
      const mats = ues[ueName];
      const totalSeries = mats.reduce((sum, m) => sum + m.chapters.reduce((s, c) => s + c.series.length, 0), 0);

      const semClass = semester === "S1" ? "s1" : semester === "S2" ? "s2" : semester === "Spé" ? "spe" : "other";

      const item = document.createElement("div");
      item.className = "sidebar-item " + semClass;
      item.innerHTML = '<div class="dot"></div><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ueName + '</span><span class="badge">' + totalSeries + '</span>';
      item.onclick = () => showMatiere(formation, semester, ueName, item);
      section.appendChild(item);
    }
  }

  sidebar.appendChild(section);
}

// ─── Show matiere ───────────────────────────────────────────────────────────
function showMatiere(formation, semester, ueName, el) {
  // Highlight sidebar
  document.querySelectorAll(".sidebar-item").forEach(e => e.classList.remove("active"));
  el.classList.add("active");

  const mats = DATA.tree[formation][semester][ueName];
  const main = document.getElementById("main");
  main.innerHTML = "";

  for (const mat of mats) {
    const card = document.createElement("div");
    card.className = "matiere-card";

    const totalSeries = mat.chapters.reduce((s, c) => s + c.series.length, 0);

    card.innerHTML = \`
      <div class="matiere-header" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('hidden')">
        <span class="chevron">▶</span>
        <h3>\${mat.name}</h3>
        \${mat.ueId ? '<span class="ue-badge">UE #' + mat.ueId + '</span>' : ''}
        <span class="count">\${totalSeries} séries</span>
      </div>
      <div class="hidden">
        \${mat.chapters.map(chap => \`
          <div class="chapter">
            <div class="chapter-title">\${chap.name} <span style="margin-left:auto;font-size:10px;color:rgba(255,255,255,0.3)">\${chap.series.length} séries</span></div>
            <div class="series-grid">
              \${chap.series.map(s => \`
                <div class="serie-card \${selected.has(s.id) ? 'selected' : ''}" data-id="\${s.id}" onclick="toggleSerie(\${s.id}, this)">
                  <span class="id">#\${s.id}</span>
                  <span class="title">\${s.title}</span>
                  <span class="qcount">\${s.nbQuestions}Q</span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`).join('')}
      </div>
    \`;

    main.appendChild(card);
  }

  // Auto-open first card
  const firstHeader = main.querySelector(".matiere-header");
  if (firstHeader) firstHeader.click();
}

// ─── Selection ──────────────────────────────────────────────────────────────
function toggleSerie(id, el) {
  if (selected.has(id)) {
    selected.delete(id);
    el.classList.remove("selected");
  } else {
    selected.add(id);
    el.classList.add("selected");
  }
  updateSelectionBar();
}

function updateSelectionBar() {
  const bar = document.getElementById("selection-bar");
  if (selected.size > 0) {
    bar.classList.add("visible");
    document.getElementById("sel-count").textContent = selected.size;
    // Count questions
    let totalQ = 0;
    for (const mat of DATA.matieres) {
      for (const chap of mat.chapters) {
        for (const s of chap.series) {
          if (selected.has(s.id)) totalQ += s.nbQuestions;
        }
      }
    }
    document.getElementById("sel-questions").textContent = totalQ;
  } else {
    bar.classList.remove("visible");
  }
}

function clearSelection() {
  selected.clear();
  document.querySelectorAll(".serie-card.selected").forEach(e => e.classList.remove("selected"));
  updateSelectionBar();
}

function copyIds() {
  const ids = Array.from(selected).sort((a, b) => a - b).join(", ");
  navigator.clipboard.writeText(ids);
  alert("IDs copiés : " + ids);
}

function exportSelection() {
  const data = [];
  for (const mat of DATA.matieres) {
    for (const chap of mat.chapters) {
      for (const s of chap.series) {
        if (selected.has(s.id)) {
          data.push({ id: s.id, title: s.title, nbQuestions: s.nbQuestions, matiere: mat.name, chapter: chap.name });
        }
      }
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "exoteach-selection.json";
  a.click();
}

// ─── Search ─────────────────────────────────────────────────────────────────
document.getElementById("search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    document.querySelectorAll(".sidebar-item").forEach(e => e.classList.remove("hidden"));
    return;
  }

  // Filter sidebar items
  document.querySelectorAll(".sidebar-item").forEach(item => {
    const text = item.textContent.toLowerCase();
    // Also search in series
    const visible = text.includes(q) || DATA.matieres.some(m =>
      m.ue?.toLowerCase().includes(q) && item.textContent.includes(m.ue) ||
      m.chapters.some(c => c.name.toLowerCase().includes(q) || c.series.some(s =>
        s.title.toLowerCase().includes(q) || String(s.id) === q
      ))
    );
    item.classList.toggle("hidden", !visible);
  });

  // If searching by ID, show results directly
  if (/^\\d+$/.test(q)) {
    const main = document.getElementById("main");
    const results = [];
    for (const mat of DATA.matieres) {
      for (const chap of mat.chapters) {
        for (const s of chap.series) {
          if (String(s.id).includes(q)) {
            results.push({ ...s, matiere: mat.name, chapter: chap.name });
          }
        }
      }
    }
    if (results.length > 0) {
      main.innerHTML = '<h2 style="font-size:16px;margin-bottom:16px;color:rgba(255,255,255,0.6)">Résultats pour ID "' + q + '"</h2><div class="series-grid">' +
        results.map(s => \`<div class="serie-card \${selected.has(s.id) ? 'selected' : ''}" data-id="\${s.id}" onclick="toggleSerie(\${s.id}, this)">
          <span class="id">#\${s.id}</span>
          <div style="flex:1"><span class="title">\${s.title}</span><div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:2px">\${s.matiere} > \${s.chapter}</div></div>
          <span class="qcount">\${s.nbQuestions}Q</span>
        </div>\`).join('') + '</div>';
    }
  }
});

// Show first item by default
const firstItem = document.querySelector(".sidebar-item");
if (firstItem) firstItem.click();
</script>
</body>
</html>`;

writeFileSync(outPath, html);
console.log(`\n✅ Dashboard généré : scripts/exoteach-dashboard.html`);
console.log(`   Ouvrir dans le navigateur : open scripts/exoteach-dashboard.html`);
