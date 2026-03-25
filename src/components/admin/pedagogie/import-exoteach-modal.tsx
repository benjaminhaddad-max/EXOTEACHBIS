"use client";

import { useState } from "react";
import { X, CheckCircle, AlertCircle, Download, Copy, Check } from "lucide-react";

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

/** Génère le script à coller dans la console ExoTeach */
function buildScript(ids: string[], coursId: string, serieType: string): string {
  const saveUrl = "https://exoteachbis.vercel.app/api/save-exoteach-data";
  const idsJson = JSON.stringify(ids);

  return `(async()=>{
var client=window.__APOLLO_CLIENT__;
if(!client){alert('Ouvre cette page sur diploma.exoteach.com !');return;}
function F(n,a,s){var f={kind:'Field',name:{kind:'Name',value:n}};if(a)f.arguments=a;if(s)f.selectionSet={kind:'SelectionSet',selections:s};return f;}
function A(n,v){return{kind:'Argument',name:{kind:'Name',value:n},value:{kind:'StringValue',value:v}};}
var ids=${idsJson};
var series=[];var errs=[];
for(var id of ids){
  try{
    console.log('📥 Récupération série '+id+'...');
    var r=await client.query({fetchPolicy:'network-only',query:{kind:'Document',definitions:[{kind:'OperationDefinition',operation:'query',selectionSet:{kind:'SelectionSet',selections:[F('qcm',[A('id',id)],[F('id_qcm'),F('titre'),F('questions',null,[F('id_question'),F('question'),F('explications'),F('url_image_q'),F('answers',null,[F('id'),F('isTrue'),F('text'),F('explanation'),F('url_image')])])])]}}]}});
    if(!r.data||!r.data.qcm){errs.push(id);continue;}
    var qcm=r.data.qcm;
    /* --- Scrape images depuis le DOM (si on est sur la page du QCM) --- */
    var allImgs=Array.from(document.querySelectorAll('img')).filter(function(i){return i.src.includes('/files/')&&i.naturalWidth>30;});
    if(allImgs.length>0){
      console.log('🖼️ '+allImgs.length+' image(s) trouvée(s) dans la page');
      /* Trier images par position Y */
      var imgsByY=allImgs.map(function(i){return{src:i.src,y:i.getBoundingClientRect().top+window.scrollY};}).sort(function(a,b){return a.y-b.y;});
      /* Trouver les positions Y des "Exercice N" dans le DOM */
      var exHeaders=[];
      document.querySelectorAll('*').forEach(function(el){
        var t=el.textContent||'';
        var m=t.match(/^\\s*Exercice\\s+(\\d+)/);
        if(m&&el.offsetHeight>0&&el.offsetHeight<80){
          var y=el.getBoundingClientRect().top+window.scrollY;
          var n=parseInt(m[1])-1;
          if(!exHeaders[n])exHeaders[n]={y:y,idx:n};
        }
      });
      /* Fallback: si pas de headers "Exercice N", chercher par texte des questions */
      if(exHeaders.filter(Boolean).length===0){
        var qSnippets=qcm.questions.map(function(q){return(q.question||'').replace(/<[^>]+>/g,'').trim().substring(0,25);});
        document.querySelectorAll('p,div,span').forEach(function(el){
          if(el.offsetHeight===0||el.children.length>8)return;
          var t=el.textContent||'';
          qSnippets.forEach(function(qs,qi){
            if(qs.length>5&&t.includes(qs)&&!exHeaders[qi]){
              exHeaders[qi]={y:el.getBoundingClientRect().top+window.scrollY,idx:qi};
            }
          });
        });
      }
      console.log('📍 '+exHeaders.filter(Boolean).length+' position(s) de questions trouvée(s)');
      /* Matcher chaque image à la question la plus proche AU-DESSUS */
      imgsByY.forEach(function(img){
        var bestQ=-1;var bestDist=Infinity;
        exHeaders.forEach(function(h,qi){
          if(!h)return;
          var d=img.y-h.y;
          if(d>-20&&d<bestDist){bestDist=d;bestQ=qi;}
        });
        if(bestQ<0||bestQ>=qcm.questions.length)return;
        var q=qcm.questions[bestQ];
        if(!q.url_image_q){
          q.url_image_q=img.src;
          console.log('  Q'+(bestQ+1)+' ← image ('+img.src.split('/').pop().split('?')[0].substring(0,25)+')');
        }else{
          for(var ai=0;ai<q.answers.length;ai++){
            if(!q.answers[ai].url_image){
              q.answers[ai].url_image=img.src;
              console.log('  Q'+(bestQ+1)+'.'+String.fromCharCode(65+ai)+' ← image réponse');
              break;
            }
          }
        }
      });
    }else{
      console.log('⚠️ Aucune image dans le DOM — ouvre la série dans le player ExoTeach AVANT de coller le script !');
    }
    series.push(qcm);
  }catch(e){console.error(e);errs.push(id);}
}
if(!series.length){alert('Aucune série trouvée.');return;}
console.log('📤 Envoi de '+series.length+' série(s) à ExoTeachBIS...');
try{
  var res=await fetch('${saveUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({series:series,coursId:${coursId ? `'${coursId}'` : 'null'},serieType:'${serieType}'})});
  var out=await res.json();
  if(out.success)alert('✅ '+out.imported+' série(s) importée(s) !\\n(Rafraîchis ExoTeachBIS pour voir les séries)');
  else alert('Erreur: '+(out.error||'inconnue'));
}catch(e){alert('Erreur réseau: '+e.message);}
})();`;
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
  const [copied, setCopied] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  const parsedIds = parseIds(idsInput);
  const ok = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status !== "ok").length;

  const handleCopy = async () => {
    if (parsedIds.length === 0) return;
    const script = buildScript(parsedIds, coursId, serieType);
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* IDs */}
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">
              IDs des séries ExoTeach
            </label>
            <input
              type="text"
              value={idsInput}
              onChange={(e) => { setIdsInput(e.target.value); setCopied(false); }}
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

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">Type de série</label>
            <select
              value={serieType}
              onChange={(e) => { setSerieType(e.target.value); setCopied(false); }}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]/60"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={{ backgroundColor: "#0e1e35" }}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Bouton copier */}
          <button
            onClick={handleCopy}
            disabled={parsedIds.length === 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
              copied
                ? "bg-green-500/20 border border-green-400/40 text-green-300"
                : "bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35]"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {copied ? <><Check size={15} /> Script copié !</> : <><Copy size={15} /> Copier le script d&apos;import</>}
          </button>

          {/* Instructions */}
          {copied && (
            <div className="rounded-xl border border-green-400/20 bg-green-500/5 p-4 space-y-2 animate-in fade-in">
              <p className="text-xs font-bold text-green-300">Maintenant :</p>
              <ol className="text-[12px] text-white/70 space-y-2 list-decimal list-inside">
                <li>Va sur <a href="https://diploma.exoteach.com" target="_blank" rel="noreferrer" className="text-[#C9A84C] underline">diploma.exoteach.com</a></li>
                <li className="text-yellow-300/90">⚡ <strong>Ouvre la série</strong> dans le player (pour que les images se chargent)</li>
                <li>Ouvre la console : <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">F12</kbd> → onglet <span className="font-semibold">Console</span></li>
                <li>Tape <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">allow pasting</kbd> + Entrée (1ère fois)</li>
                <li>Colle avec <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">Cmd+V</kbd> puis <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">Entrée</kbd></li>
                <li>Reviens ici et rafraîchis ✓</li>
              </ol>
            </div>
          )}

          {/* Résultats */}
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
          <button onClick={() => { onDone(); onClose(); }} className="w-full py-2 rounded-lg border border-white/15 text-white/60 hover:text-white text-sm transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
