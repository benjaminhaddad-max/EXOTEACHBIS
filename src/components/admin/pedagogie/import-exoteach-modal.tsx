"use client";

import { useState } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Download, Bookmark, Zap } from "lucide-react";

const TYPE_OPTIONS = [
  { value: "entrainement", label: "Entraînement" },
  { value: "concours_blanc", label: "Concours blanc" },
  { value: "revision", label: "Révision" },
  { value: "annales", label: "Annales corrigées" },
  { value: "qcm_supplementaires", label: "QCM supplémentaires" },
];

type Result = { id: string; status: string; titre?: string; newId?: string; error?: string };
type Tab = "direct" | "bookmarklet";

// Parse "418, 419, 420" ou "418-425" ou mix "418-420, 423, 430-432"
function parseIds(input: string): string[] {
  const ids: string[] = [];
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1]);
      const to = parseInt(rangeMatch[2]);
      if (from <= to && to - from <= 100) {
        for (let i = from; i <= to; i++) ids.push(String(i));
      }
    } else if (/^\d+$/.test(part)) {
      ids.push(part);
    }
  }
  return [...new Set(ids)];
}

// Bookmarklet JS — fetches from ExoTeach using browser session, posts to our API
function buildBookmarklet(coursId: string, serieType: string): string {
  const saveUrl = "https://exoteachbis.vercel.app/api/save-exoteach-data";
  const code = `(async()=>{
var A='https://diploma.exoteach.com/medibox2-api/graphql';
var S='${saveUrl}';
function gt(){for(var s of[localStorage,sessionStorage]){for(var i=0;i<s.length;i++){var v=s.getItem(s.key(i));if(v&&v.startsWith('eyJ')&&v.length>50)return v;}}return null;}
var tok=gt();
if(!tok){alert('Token non trouvé — êtes-vous connecté à ExoTeach ?');return;}
var inp=prompt('IDs des séries ExoTeach (ex: 418, 420-425, 430):');
if(!inp)return;
var ids=[];
for(var p of inp.split(',').map(s=>s.trim()).filter(Boolean)){var m=p.match(/^(\\d+)\\s*-\\s*(\\d+)$/);if(m){var f=+m[1],e=+m[2];if(f<=e&&e-f<=100)for(var i=f;i<=e;i++)ids.push(''+i);}else if(/^\\d+$/.test(p))ids.push(p);}
if(!ids.length){alert('Aucun ID valide.');return;}
var Q='query G($id:ID!){qcm(id:$id){id_qcm titre questions{id_question question explications url_image_q answers{id isTrue text explanation url_image}}}}';
var series=[];
for(var id of ids){try{var r=await fetch(A,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({query:Q,variables:{id}})});var j=await r.json();if(j.data&&j.data.qcm)series.push(j.data.qcm);}catch(e){}}
if(!series.length){alert('Aucune série récupérée — vérifiez les IDs et votre connexion ExoTeach.');return;}
var cId=${coursId ? `'${coursId}'` : "null"};
var tp='${serieType}';
try{var res=await fetch(S,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({series,coursId:cId,serieType:tp})});var out=await res.json();alert(out.success?'✅ '+out.imported+'/'+series.length+' série(s) importée(s) avec succès !':'❌ Erreur: '+(out.error||'inconnue'));}catch(e){alert('Erreur réseau: '+e.message);}
})();`;
  return "javascript:" + encodeURIComponent(code.replace(/\n/g, ""));
}

export function ImportExoteachModal({
  coursId,
  onClose,
  onDone,
}: {
  coursId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<Tab>("direct");
  const [idsInput, setIdsInput] = useState("");
  const [serieType, setSerieType] = useState("entrainement");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);

  const parsedIds = parseIds(idsInput);

  const handleImport = async () => {
    if (parsedIds.length === 0) return;
    setLoading(true);
    setResults([]);
    setDone(false);

    try {
      const res = await fetch("/api/import-exoteach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serieIds: parsedIds, coursId, serieType }),
      });
      const json = await res.json();
      if (json.results) {
        setResults(json.results);
        setDone(true);
        onDone();
      } else {
        setResults([{ id: "?", status: "error", error: json.error || "Erreur inconnue" }]);
        setDone(true);
      }
    } catch (e: any) {
      setResults([{ id: "?", status: "error", error: e.message }]);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  const ok = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status !== "ok").length;

  const bookmarkletHref = buildBookmarklet(coursId, serieType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh]" style={{ backgroundColor: "#0e1e35" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5">
            <Download size={16} className="text-[#C9A84C]" />
            <h2 className="text-base font-bold text-white">Importer depuis ExoTeach</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/8 shrink-0">
          <button
            onClick={() => setTab("direct")}
            className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold transition-colors border-b-2 ${
              tab === "direct"
                ? "border-[#C9A84C] text-[#C9A84C]"
                : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            <Zap size={12} /> Import direct
          </button>
          <button
            onClick={() => setTab("bookmarklet")}
            className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold transition-colors border-b-2 ${
              tab === "bookmarklet"
                ? "border-[#C9A84C] text-[#C9A84C]"
                : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            <Bookmark size={12} /> Bookmarklet
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Type selector — commun aux deux onglets */}
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">Type de série</label>
            <select
              value={serieType}
              onChange={(e) => setSerieType(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]/60"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={{ backgroundColor: "#0e1e35" }}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* ── Onglet DIRECT ── */}
          {tab === "direct" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5">
                  IDs des séries ExoTeach
                  <span className="ml-2 font-normal text-white/30">virgules ou plages</span>
                </label>
                <input
                  type="text"
                  value={idsInput}
                  onChange={(e) => setIdsInput(e.target.value)}
                  placeholder="418, 419, 420-425, 430"
                  autoFocus
                  className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/60"
                />
                {parsedIds.length > 0 && (
                  <p className="mt-1 text-[11px] text-white/40">
                    {parsedIds.length} série{parsedIds.length > 1 ? "s" : ""} : {parsedIds.slice(0, 8).join(", ")}{parsedIds.length > 8 ? `… +${parsedIds.length - 8}` : ""}
                  </p>
                )}
              </div>

              {/* Résultats */}
              {results.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs">
                    {ok > 0 && <span className="text-green-400">✓ {ok} importée{ok > 1 ? "s" : ""}</span>}
                    {errors > 0 && <span className="text-red-400">✗ {errors} erreur{errors > 1 ? "s" : ""}</span>}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {results.map((r) => (
                      <div key={r.id} className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
                        r.status === "ok" ? "bg-green-500/10 text-green-300" :
                        r.status === "not_found" ? "bg-white/5 text-white/40" :
                        "bg-red-500/10 text-red-300"
                      }`}>
                        {r.status === "ok"
                          ? <CheckCircle size={12} className="mt-0.5 shrink-0" />
                          : <AlertCircle size={12} className="mt-0.5 shrink-0" />}
                        <span>
                          Série {r.id}
                          {r.titre && ` — "${r.titre}"`}
                          {r.status === "not_found" && " — introuvable"}
                          {r.error && ` — ${r.error}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Onglet BOOKMARKLET ── */}
          {tab === "bookmarklet" && (
            <div className="space-y-4">
              <p className="text-xs text-white/60 leading-relaxed">
                Si l&apos;import direct ne fonctionne pas, le bookmarklet utilise directement ta session ExoTeach — aucune configuration supplémentaire.
              </p>

              {/* Étape 1 */}
              <div className="rounded-xl border border-white/10 p-4 space-y-2">
                <p className="text-xs font-bold text-[#C9A84C]">Étape 1 — Ajouter à ta barre de favoris</p>
                <p className="text-[11px] text-white/50">Glisse ce bouton dans ta barre de favoris (ou copie le lien) :</p>
                <a
                  href={bookmarkletHref}
                  onClick={(e) => e.preventDefault()}
                  draggable
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A84C]/15 border border-[#C9A84C]/40 text-[#C9A84C] text-xs font-bold cursor-grab active:cursor-grabbing hover:bg-[#C9A84C]/25 transition-colors"
                >
                  <Bookmark size={12} /> ↗ Import ExoTeach
                </a>
                <p className="text-[10px] text-white/30">⚠ Ne clique pas ici — glisse-le dans ta barre de favoris de ton navigateur</p>
              </div>

              {/* Étape 2 */}
              <div className="rounded-xl border border-white/10 p-4 space-y-2">
                <p className="text-xs font-bold text-[#C9A84C]">Étape 2 — Utiliser le bookmarklet</p>
                <ol className="text-[11px] text-white/60 space-y-1.5 list-decimal list-inside">
                  <li>Va sur <span className="text-white/80 font-mono">diploma.exoteach.com</span> (connecté en tant que Dr Haddad)</li>
                  <li>Clique sur le favori <span className="text-white/80">Import ExoTeach</span></li>
                  <li>Entre les IDs des séries (ex: <span className="font-mono text-white/80">418, 420-425</span>)</li>
                  <li>Les séries s&apos;importent automatiquement dans ce cours</li>
                </ol>
              </div>

              <div className="rounded-lg bg-white/5 px-3 py-2.5 text-[11px] text-white/50">
                <span className="text-white/70 font-semibold">Cours cible :</span> {coursId || "aucun"}&nbsp;&nbsp;
                <span className="text-white/70 font-semibold">Type :</span> {serieType}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 flex items-center justify-between shrink-0">
          {tab === "bookmarklet" ? (
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] text-sm font-bold transition-colors">
              Fermer
            </button>
          ) : done ? (
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] text-sm font-bold transition-colors">
              Fermer
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white text-sm transition-colors">
                Annuler
              </button>
              <button
                onClick={handleImport}
                disabled={loading || parsedIds.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> Import en cours…</>
                ) : (
                  <><Download size={14} /> Importer {parsedIds.length > 0 ? `${parsedIds.length} série${parsedIds.length > 1 ? "s" : ""}` : ""}</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
