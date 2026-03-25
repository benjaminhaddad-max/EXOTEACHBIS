"use client";

import { useState } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Download, Bookmark } from "lucide-react";

const TYPE_OPTIONS = [
  { value: "entrainement", label: "Entraînement" },
  { value: "concours_blanc", label: "Concours blanc" },
  { value: "revision", label: "Révision" },
  { value: "annales", label: "Annales corrigées" },
  { value: "qcm_supplementaires", label: "QCM supplémentaires" },
];

type Result = { id: string; status: string; titre?: string; newId?: string; error?: string };

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

// Bookmarklet qui utilise window.__APOLLO_CLIENT__ d'ExoTeach directement
// Pas besoin de token — Apollo gère l'auth tout seul
function buildBookmarklet(coursId: string, serieType: string): string {
  const saveUrl = "https://exoteachbis.vercel.app/api/save-exoteach-data";

  const code = `(async()=>{
var client=window.__APOLLO_CLIENT__;
if(!client){alert('Ouvrez cette page sur diploma.exoteach.com');return;}
var inp=prompt('IDs des séries ExoTeach à importer\\n(ex: 418, 420-425, 430):');
if(!inp)return;
var ids=[];
inp.split(',').map(s=>s.trim()).filter(Boolean).forEach(function(p){
  var m=p.match(/^(\\d+)\\s*-\\s*(\\d+)$/);
  if(m){var f=+m[1],e=+m[2];if(f<=e&&e-f<=100)for(var i=f;i<=e;i++)ids.push(''+i);}
  else if(/^\\d+$/.test(p))ids.push(p);
});
if(!ids.length){alert('Aucun ID valide.');return;}
function field(n,args,sels){var f={kind:'Field',name:{kind:'Name',value:n}};if(args)f.arguments=args;if(sels)f.selectionSet={kind:'SelectionSet',selections:sels};return f;}
function arg(n,v){return{kind:'Argument',name:{kind:'Name',value:n},value:{kind:'StringValue',value:v}};}
var series=[];var errors=[];
for(var id of ids){
  try{
    var res=await client.query({fetchPolicy:'network-only',query:{kind:'Document',definitions:[{kind:'OperationDefinition',operation:'query',selectionSet:{kind:'SelectionSet',selections:[field('qcm',[arg('id',id)],[
      field('id_qcm'),field('titre'),
      field('questions',null,[field('id_question'),field('question'),field('explications'),field('url_image_q'),field('answers',null,[field('id'),field('isTrue'),field('text'),field('explanation'),field('url_image')])])
    ])]}}]}});
    if(res.data&&res.data.qcm)series.push(res.data.qcm);
    else errors.push(id);
  }catch(e){errors.push(id);}
}
if(!series.length){alert('Aucune série récupérée. Vérifiez les IDs.');return;}
var msg=series.length+' série(s) prête(s)';
if(errors.length)msg+='\\n'+errors.length+' introuvable(s): '+errors.join(', ');
msg+='\\n\\nImporter maintenant ?';
if(!confirm(msg))return;
try{
  var r=await fetch('${saveUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({series:series,coursId:${coursId ? `'${coursId}'` : 'null'},serieType:'${serieType}'})});
  var out=await r.json();
  alert(out.success?'✅ '+out.imported+'/'+series.length+' importée(s) !':'❌ Erreur: '+(out.error||'inconnue'));
}catch(e){alert('Erreur réseau: '+e.message);}
})();`;

  return "javascript:" + encodeURIComponent(code);
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
  const [idsInput, setIdsInput] = useState("");
  const [serieType, setSerieType] = useState("entrainement");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);

  const parsedIds = parseIds(idsInput);
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Bookmarklet — méthode principale */}
          <div className="rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bookmark size={13} className="text-[#C9A84C]" />
              <p className="text-xs font-bold text-[#C9A84C]">Méthode rapide (recommandée)</p>
            </div>

            {/* Type */}
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1">Type de série</label>
              <select
                value={serieType}
                onChange={(e) => setSerieType(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#C9A84C]/60"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} style={{ backgroundColor: "#0e1e35" }}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Bookmarklet link */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-white/50">
                1. Glisse ce bouton dans ta barre de favoris :
              </p>
              <a
                href={bookmarkletHref}
                onClick={(e) => e.preventDefault()}
                draggable
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A84C] text-[#0e1e35] text-xs font-bold cursor-grab active:cursor-grabbing hover:bg-[#A8892E] transition-colors select-none"
              >
                <Download size={11} /> ↗ Import ExoTeach
              </a>
              <p className="text-[10px] text-white/30">⚠ Glisse-le — ne clique pas dessus ici</p>
            </div>

            <ol className="text-[11px] text-white/60 space-y-1 list-decimal list-inside">
              <li>Va sur <span className="font-mono text-white/80">diploma.exoteach.com</span></li>
              <li>Clique le favori <span className="text-white/80 font-semibold">↗ Import ExoTeach</span></li>
              <li>Entre les IDs (ex: <span className="font-mono text-white/80">418, 420-425</span>)</li>
              <li>Les séries s&apos;importent dans ce cours ✓</li>
            </ol>
          </div>

          {/* Résultats de l'import direct si disponibles */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                {ok > 0 && <span className="text-green-400 font-semibold">✓ {ok} importée{ok > 1 ? "s" : ""}</span>}
                {errors > 0 && <span className="text-red-400">✗ {errors} erreur{errors > 1 ? "s" : ""}</span>}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {results.map((r) => (
                  <div key={r.id} className={`flex items-start gap-2 text-xs px-3 py-1.5 rounded-lg ${
                    r.status === "ok" ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"
                  }`}>
                    {r.status === "ok" ? <CheckCircle size={12} className="mt-0.5 shrink-0" /> : <AlertCircle size={12} className="mt-0.5 shrink-0" />}
                    <span>Série {r.id}{r.titre && ` — "${r.titre}"`}{r.error && ` — ${r.error}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 shrink-0">
          <button onClick={onClose} className="w-full py-2 rounded-lg bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] text-sm font-bold transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
