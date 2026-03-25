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

/* Convertir un élément <img> du DOM en base64 via canvas */
function imgToB64(imgEl){
  try{
    var c=document.createElement('canvas');
    c.width=imgEl.naturalWidth;c.height=imgEl.naturalHeight;
    c.getContext('2d').drawImage(imgEl,0,0);
    return c.toDataURL('image/png');
  }catch(e){console.log('  ⚠️ canvas error:',e.message);return null;}
}

/* Attendre que les images se chargent sur la page */
function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}
async function waitForImages(maxWait){
  var start=Date.now();
  while(Date.now()-start<maxWait){
    var imgs=document.querySelectorAll('img');
    var loaded=Array.from(imgs).filter(function(i){return i.naturalWidth>50&&i.src.includes('/files/');});
    if(loaded.length>0)return loaded;
    await wait(500);
  }
  return [];
}

/* Trouver le numéro d'exercice d'une image en remontant le DOM */
function findExerciceNum(img){
  var el=img;
  for(var d=0;d<20&&el;d++){
    var prev=el.previousElementSibling;
    while(prev){
      var txt=prev.textContent||'';
      var m=txt.match(/Exercice\\s+(\\d+)/);
      if(m)return parseInt(m[1]);
      prev=prev.previousElementSibling;
    }
    el=el.parentElement;
  }
  return null;
}

var ids=${idsJson};
var series=[];var errs=[];

for(var id of ids){
  try{
    console.log('📥 Récupération série '+id+'...');
    var r=await client.query({fetchPolicy:'network-only',query:{kind:'Document',definitions:[{kind:'OperationDefinition',operation:'query',selectionSet:{kind:'SelectionSet',selections:[F('qcm',[A('id',id)],[F('id_qcm'),F('titre'),F('questions',null,[F('id_question'),F('question'),F('explications'),F('url_image_q'),F('answers',null,[F('id'),F('isTrue'),F('text'),F('explanation'),F('url_image')])])])]}}]}});
    if(!r.data||!r.data.qcm){errs.push(id);continue;}
    var qcm=JSON.parse(JSON.stringify(r.data.qcm));

    /* Naviguer vers le player pour charger les images */
    console.log('🖼️ Navigation vers le player pour charger les images...');
    window.location.hash='#/serie/play/'+id;
    await wait(2000);
    var domImgs=await waitForImages(8000);

    /* Filtrer: exclure thumbnail (parent w-12) */
    domImgs=domImgs.filter(function(i){return !i.closest('.w-12')&&!i.closest('.w-14');});
    console.log('  '+domImgs.length+' image(s) de contenu trouvée(s)');

    /* Mapper chaque image DOM à un exercice */
    var imgsByExercice={};
    domImgs.forEach(function(img){
      var num=findExerciceNum(img);
      if(!num)return;
      if(!imgsByExercice[num])imgsByExercice[num]=[];
      imgsByExercice[num].push(img);
    });

    /* Assigner les images aux questions */
    for(var qi=0;qi<qcm.questions.length;qi++){
      var q=qcm.questions[qi];
      var exNum=qi+1;
      var exImgs=imgsByExercice[exNum]||[];

      if(exImgs.length>0&&!q.url_image_q){
        var nAnswers=(q.answers||[]).length;
        var answersNeedingImg=(q.answers||[]).filter(function(a){return !a.url_image;}).length;
        /* Si nb images == nb réponses sans image → TOUTES sont des images de réponses */
        var allAreAnswerImgs=(exImgs.length===answersNeedingImg)||(exImgs.length===nAnswers);
        if(!allAreAnswerImgs){
          /* Première image = image de la question */
          var b64=imgToB64(exImgs[0]);
          if(b64){
            q.image_base64=b64;
            console.log('  Q'+exNum+' ✅ image question ('+Math.round(b64.length/1024)+' KB)');
          }
          /* Images suivantes = images des réponses */
          for(var ai=0,ii=1;ii<exImgs.length&&ai<nAnswers;ai++){
            if(!q.answers[ai].url_image&&!q.answers[ai].image_base64){
              var ab=imgToB64(exImgs[ii]);
              if(ab){q.answers[ai].image_base64=ab;console.log('  Q'+exNum+'.'+String.fromCharCode(65+ai)+' ✅ image réponse');}
              ii++;
            }
          }
        }else{
          /* Toutes les images sont des images de réponses */
          console.log('  Q'+exNum+' — '+exImgs.length+' images = réponses (pas d\\'image question)');
          for(var ai=0,ii=0;ii<exImgs.length&&ai<nAnswers;ai++){
            if(!q.answers[ai].url_image&&!q.answers[ai].image_base64){
              var ab=imgToB64(exImgs[ii]);
              if(ab){q.answers[ai].image_base64=ab;console.log('  Q'+exNum+'.'+String.fromCharCode(65+ai)+' ✅ image réponse');}
              ii++;
            }
          }
        }
      }

      /* Si les réponses ont déjà url_image (depuis Apollo), les télécharger en base64 */
      for(var ai=0;ai<(q.answers||[]).length;ai++){
        var ans=q.answers[ai];
        if(ans.url_image&&!ans.image_base64){
          try{
            var full=ans.url_image.startsWith('http')?ans.url_image:'https://diploma.exoteach.com'+ans.url_image;
            var resp=await fetch(full,{credentials:'include'});
            if(resp.ok){
              var blob=await resp.blob();
              ans.image_base64=await new Promise(function(ok){var rd=new FileReader();rd.onloadend=function(){ok(rd.result);};rd.readAsDataURL(blob);});
              console.log('  Q'+exNum+'.'+String.fromCharCode(65+ai)+' ✅ image réponse (API)');
            }
          }catch(e){}
        }
      }

      if(!q.image_base64&&!q.url_image_q&&exImgs.length===0){
        console.log('  Q'+exNum+' — pas d\\'image');
      }
    }
    series.push(qcm);
  }catch(e){console.error('❌ Erreur série '+id+':',e);errs.push(id);}
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
                <li>Va sur <a href="https://diploma.exoteach.com" target="_blank" rel="noreferrer" className="text-[#C9A84C] underline">diploma.exoteach.com</a> (n&apos;importe quelle page, connecté)</li>
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
