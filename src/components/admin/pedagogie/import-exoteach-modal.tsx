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
var wait=function(ms){return new Promise(function(r){setTimeout(r,ms);});};
var ids=${idsJson};
var series=[];var errs=[];
for(var id of ids){
  try{
    console.log('📥 Récupération série '+id+'...');
    var r=await client.query({fetchPolicy:'network-only',query:{kind:'Document',definitions:[{kind:'OperationDefinition',operation:'query',selectionSet:{kind:'SelectionSet',selections:[F('qcm',[A('id',id)],[F('id_qcm'),F('titre'),F('questions',null,[F('id_question'),F('question'),F('explications'),F('url_image_q'),F('answers',null,[F('id'),F('isTrue'),F('text'),F('explanation'),F('url_image')])])])]}}]}});
    if(!r.data||!r.data.qcm){errs.push(id);continue;}
    var qcm=r.data.qcm;
    /* --- Scrape images depuis le DOM --- */
    console.log('🖼️ Récupération images série '+id+'...');
    var origHash=window.location.hash;
    window.location.hash='#/serie/play/'+id;
    await wait(2000);
    /* Cliquer Démarrer si présent */
    var startBtn=document.querySelector('button[class*="start"], button[class*="demarrer"]');
    if(!startBtn){var btns=Array.from(document.querySelectorAll('button'));startBtn=btns.find(function(b){return b.textContent.toLowerCase().includes('marrer')||b.textContent.toLowerCase().includes('commencer');});}
    if(startBtn){startBtn.click();await wait(3000);}
    /* Extraire les images par question */
    var qEls=document.querySelectorAll('[class*="question"], [class*="exercice"], .ant-card, [class*="Question"]');
    if(qEls.length===0)qEls=document.querySelectorAll('div > div > div');
    var allImgs=Array.from(document.querySelectorAll('img')).filter(function(img){return img.src.includes('/files/')&&img.naturalWidth>30;});
    /* Associer chaque image à la question la plus proche par position DOM */
    var qTexts=qcm.questions.map(function(q){return (q.question||'').replace(/<[^>]+>/g,'').trim().substring(0,40);});
    for(var img of allImgs){
      var imgSrc=img.src.split('?')[0];
      /* Remonter le DOM pour trouver le texte de la question parente */
      var el=img;var found=false;
      for(var d=0;d<20;d++){el=el.parentElement;if(!el)break;
        var txt=el.textContent||'';
        for(var qi=0;qi<qTexts.length;qi++){
          if(txt.includes(qTexts[qi])){
            /* Déterminer si c'est une image de question ou de réponse */
            var isAnswer=false;
            var ansEl=img.closest('[class*="answer"], [class*="option"], [class*="proposition"], [class*="reponse"]');
            if(ansEl){
              var ansTxt=(ansEl.textContent||'').substring(0,60);
              for(var ai=0;ai<qcm.questions[qi].answers.length;ai++){
                var aTxt=(qcm.questions[qi].answers[ai].text||'').replace(/<[^>]+>/g,'').substring(0,40);
                if(ansTxt.includes(aTxt)){qcm.questions[qi].answers[ai].url_image=imgSrc;isAnswer=true;break;}
              }
            }
            if(!isAnswer&&!qcm.questions[qi].url_image_q){qcm.questions[qi].url_image_q=imgSrc;}
            found=true;break;
          }
        }
        if(found)break;
      }
    }
    /* Retour à la page d'origine */
    window.location.hash=origHash||'#/planning';
    await wait(500);
    series.push(qcm);
  }catch(e){console.error(e);errs.push(id);}
}
if(!series.length){alert('Aucune série trouvée.');return;}
var msg=series.length+' série(s) prête(s)';
if(errs.length)msg+='\\n'+errs.length+' erreur(s): '+errs.join(', ');
console.log('📤 Envoi à ExoTeachBIS...');
try{
  var res=await fetch('${saveUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({series:series,coursId:${coursId ? `'${coursId}'` : 'null'},serieType:'${serieType}'})});
  var out=await res.json();
  if(out.success)alert('✅ '+out.imported+' série(s) importée(s) avec images !');
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
              <ol className="text-[12px] text-white/70 space-y-1.5 list-decimal list-inside">
                <li>Va sur <a href="https://diploma.exoteach.com" target="_blank" rel="noreferrer" className="text-[#C9A84C] underline">diploma.exoteach.com</a></li>
                <li>Ouvre la console : <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">F12</kbd> → onglet <span className="font-semibold">Console</span></li>
                <li>Colle avec <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">Ctrl+V</kbd> puis <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">Entrée</kbd></li>
                <li>C&apos;est fait ! Reviens ici et rafraîchis</li>
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
