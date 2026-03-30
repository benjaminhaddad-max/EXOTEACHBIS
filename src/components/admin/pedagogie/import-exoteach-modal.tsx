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
  return ids;
}

function buildScript(ids: string[], coursId: string, serieType: string, matiereId?: string | null): string {
  const saveUrl = "https://exoteachbis.vercel.app/api/save-exoteach-data";
  const idsJson = JSON.stringify(ids);

  // Script that uses the player's correction view to scrape images.
  // Flow: for each serie, get data via Apollo, then navigate to the edit page
  // and open each exercise one by one to capture its images.
  return `(async()=>{
var client=window.__APOLLO_CLIENT__;
if(!client){alert('Ouvre cette page sur diploma.exoteach.com !');return;}
function F(n,a,s){var f={kind:'Field',name:{kind:'Name',value:n}};if(a)f.arguments=a;if(s)f.selectionSet={kind:'SelectionSet',selections:s};return f;}
function A(n,v){return{kind:'Argument',name:{kind:'Name',value:n},value:{kind:'StringValue',value:v}};}
function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}

async function imgToB64(src){
  try{
    var url=src.startsWith('http')?src:'https://diploma.exoteach.com'+src;
    var resp=await fetch(url,{credentials:'include'});
    if(!resp.ok)return null;
    var blob=await resp.blob();
    if(blob.size<100)return null;
    return await new Promise(function(ok){var rd=new FileReader();rd.onloadend=function(){ok(rd.result);};rd.readAsDataURL(blob);});
  }catch(e){return null;}
}

function getContentImages(){
  return Array.from(document.querySelectorAll('img')).filter(function(i){
    if(!i.src||i.naturalWidth<80||i.naturalHeight<40)return false;
    if(!i.src.includes('/medibox2-api/files/'))return false;
    if(i.src.includes('/avatars/'))return false;
    if(i.src.match(/\\.gif/i))return false;
    return true;
  });
}

var ids=${idsJson};
var series=[];var errs=[];

for(var id of ids){
  try{
    console.log('📥 Récupération série '+id+'...');
    var r=await client.query({fetchPolicy:'network-only',query:{kind:'Document',definitions:[{kind:'OperationDefinition',operation:'query',selectionSet:{kind:'SelectionSet',selections:[F('qcm',[A('id',String(id))],[F('id_qcm'),F('titre'),F('questions',null,[F('id_question'),F('question'),F('explications'),F('url_image_q'),F('answers',null,[F('id'),F('isTrue'),F('text'),F('explanation'),F('url_image')])])])]}}]}});
    if(!r.data||!r.data.qcm){errs.push(id);continue;}
    var qcm=JSON.parse(JSON.stringify(r.data.qcm));
    var nbQ=qcm.questions.length;

    /* Navigate to edit page and open each exercise to scrape images */
    console.log('🖼️ Navigation page édition ('+nbQ+'Q)...');
    window.location.hash='#/admin-series/edit/'+id;
    await wait(4000);

    /* Click on each exercise number to open it and capture images */
    for(var qi=0;qi<nbQ;qi++){
      var q=qcm.questions[qi];
      var exNum=qi+1;

      /* Find and click the exercise number to expand it */
      var exBtn=Array.from(document.querySelectorAll('.exercise-number,.exercise-header-number')).find(function(el){
        return el.textContent.trim()===String(exNum);
      });
      if(exBtn){
        /* Click the exercise row to expand it */
        var row=exBtn.closest('[class*="exercise"]')||exBtn.parentElement?.parentElement;
        if(row)row.click();
        await wait(2000);/* Wait for images to load */
      }

      /* Now capture images that appeared */
      var imgs=getContentImages();
      /* Filter to only images that weren't there before (new ones from this exercise) */
      if(imgs.length>0){
        /* Get the last image(s) that appeared — they belong to this exercise */
        /* Use position: find images near the expanded exercise area */
        var exY=exBtn?exBtn.getBoundingClientRect().top:0;
        var nearImgs=imgs.filter(function(img){
          var iy=img.getBoundingClientRect().top;
          return iy>=exY-50;/* Images at or below this exercise */
        });

        if(nearImgs.length>0&&!q.url_image_q&&!q.image_url_scraped){
          /* First image = énoncé */
          var b64=await imgToB64(nearImgs[0].src);
          if(b64){
            q.image_url_scraped=b64;
            console.log('  Q'+exNum+' ✅ image énoncé ('+Math.round(b64.length/1024)+'KB)');
          }
          /* Remaining = item images */
          for(var ii=1,ai=0;ii<nearImgs.length&&ai<(q.answers||[]).length;ai++){
            if(!q.answers[ai].url_image&&!q.answers[ai].image_url_scraped){
              var ab=await imgToB64(nearImgs[ii].src);
              if(ab){q.answers[ai].image_url_scraped=ab;console.log('  Q'+exNum+'.'+String.fromCharCode(65+ai)+' ✅ image item');}
              ii++;
            }
          }
        }
      }

      /* Fetch answer images from Apollo if present */
      for(var ai=0;ai<(q.answers||[]).length;ai++){
        var ans=q.answers[ai];
        if(ans.url_image&&!ans.image_url_scraped){
          var ab=await imgToB64(ans.url_image);
          if(ab){ans.image_url_scraped=ab;console.log('  Q'+exNum+'.'+String.fromCharCode(65+ai)+' ✅ image item (API)');}
        }
      }

      if(!q.image_url_scraped&&!q.url_image_q&&(!imgs.length||!imgs.some(function(im){return im.getBoundingClientRect().top>=(exBtn?exBtn.getBoundingClientRect().top-50:0);}))){
        console.log('  Q'+exNum+' — pas d\\'image');
      }

      /* Close the exercise (click again or click elsewhere) to keep page clean */
      /* Click the back/close button or the exercise header again */
      var closeBtn=document.querySelector('[class*="back"],[class*="close"]');
      if(closeBtn&&closeBtn.getBoundingClientRect().width>0)closeBtn.click();
      else if(row)row.click();
      await wait(500);
    }

    series.push(qcm);
  }catch(e){console.error('❌ Erreur série '+id+':',e);errs.push(id);}
}
if(!series.length){alert('Aucune série trouvée.');return;}
var ok=0,fail=0;
for(var si=0;si<series.length;si++){
  var qcm=series[si];
  console.log('📤 Envoi série '+(si+1)+'/'+series.length+': '+qcm.titre+'...');
  var allQ=qcm.questions||[];
  var batches=[];
  for(var bi=0;bi<allQ.length;bi+=2){batches.push(allQ.slice(bi,bi+2));}
  if(batches.length===0)batches=[[]];
  var serieId=null,serieOk=true,totalQ=0;
  for(var bti=0;bti<batches.length;bti++){
    var batch=batches[bti];
    var payload;
    if(bti===0){
      payload={series:[{id_qcm:qcm.id_qcm,titre:qcm.titre,questions:batch}],coursId:${coursId ? `'${coursId}'` : 'null'},serieType:'${serieType}',matiereId:${matiereId ? `'${matiereId}'` : 'null'}};
    }else{
      payload={series:[{id_qcm:qcm.id_qcm,titre:qcm.titre,questions:batch}],coursId:${coursId ? `'${coursId}'` : 'null'},serieType:'${serieType}',matiereId:${matiereId ? `'${matiereId}'` : 'null'},appendToSerieId:serieId};
    }
    try{
      var res=await fetch('${saveUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      var out=await res.json();
      if(out.success){
        totalQ+=(out.results&&out.results[0]&&out.results[0].questions)||batch.length;
        if(bti===0&&out.results&&out.results[0])serieId=out.results[0].newId;
        if(batches.length>1)console.log('  📦 batch '+(bti+1)+'/'+batches.length+' OK');
      }else{serieOk=false;console.log('  ❌ batch '+(bti+1)+': '+(out.error||'erreur'));}
    }catch(e){serieOk=false;console.log('  ❌ Erreur réseau: '+e.message);}
  }
  if(serieOk){ok++;console.log('  ✅ OK ('+totalQ+'Q)');}else{fail++;}
}
alert('✅ '+ok+' série(s) importée(s)'+(fail?' — '+fail+' erreur(s)':'')+'\\n(Rafraîchis ExoTeachBIS)');
})();`;
}

export function ImportExoteachModal({
  coursId,
  matiereId,
  defaultType,
  onClose,
  onDone,
}: {
  coursId: string;
  matiereId?: string | null;
  defaultType?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [idsInput, setIdsInput] = useState("");
  const [serieType, setSerieType] = useState(defaultType || "entrainement");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [mode, setMode] = useState<"word" | "server" | "script">("script");
  const [copied, setCopied] = useState(false);
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [wordName, setWordName] = useState("");

  const parsedIds = parseIds(idsInput);
  const ok = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status !== "ok").length;

  const handleImport = async () => {
    if (parsedIds.length === 0 || importing) return;
    setImporting(true);
    setResults([]);
    const allResults: Result[] = [];

    for (let i = 0; i < parsedIds.length; i++) {
      const id = parsedIds[i];
      setProgress(`Import ${i + 1}/${parsedIds.length}...`);
      try {
        const res = await fetch("/api/import-exoteach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serieIds: [id],
            coursId: coursId || null,
            serieType,
            matiereId: matiereId || null,
          }),
        });
        const out = await res.json();
        if (out.results) allResults.push(...out.results);
        else allResults.push({ id, status: "error", error: out.error || "Erreur" });
      } catch (e: any) {
        allResults.push({ id, status: "error", error: e.message });
      }
      setResults([...allResults]);
    }
    setImporting(false);
    setProgress("");
  };

  const handleWordImport = async () => {
    if (!wordFile || importing) return;
    setImporting(true);
    setResults([]);
    setProgress("Upload et parsing...");
    try {
      const formData = new FormData();
      formData.append("file", wordFile);
      formData.append("name", wordName || wordFile.name.replace(/\.docx?$/i, ""));
      formData.append("type", serieType);
      if (coursId) formData.append("coursId", coursId);
      if (matiereId) formData.append("matiereId", matiereId);

      const res = await fetch("/api/import-word", { method: "POST", body: formData });
      const out = await res.json();
      if (out.success) {
        setResults([{ id: "word", status: "ok", titre: out.serieName }]);
        setProgress(`✅ ${out.imported} questions importées`);
      } else {
        setResults([{ id: "word", status: "error", error: out.error }]);
        setProgress("");
      }
    } catch (e: any) {
      setResults([{ id: "word", status: "error", error: e.message }]);
      setProgress("");
    }
    setImporting(false);
  };

  const handleCopy = async () => {
    if (parsedIds.length === 0) return;
    const script = buildScript(parsedIds, coursId, serieType, matiereId);
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

          {/* IDs (hidden in Word mode) */}
          {mode !== "word" && (
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">
              IDs des séries ExoTeach
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
          )}

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">Type de série</label>
            <select
              value={serieType}
              onChange={(e) => setSerieType(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]/60"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={{ backgroundColor: "#0e1e35" }}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-white/15 overflow-hidden">
            <button type="button" onClick={() => setMode("word")}
              className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${mode === "word" ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "text-white/40 hover:text-white/60"}`}>
              Import Word
            </button>
            <button type="button" onClick={() => setMode("script")}
              className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${mode === "script" ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "text-white/40 hover:text-white/60"}`}>
              Script console
            </button>
            <button type="button" onClick={() => setMode("server")}
              className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${mode === "server" ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "text-white/40 hover:text-white/60"}`}>
              Sans images
            </button>
          </div>

          {mode === "word" ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5">Fichier Word (.docx)</label>
                <input type="file" accept=".docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setWordFile(f); setWordName(f.name.replace(/\.docx?$/i, "")); }
                  }}
                  className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#C9A84C]/20 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#C9A84C] hover:file:bg-[#C9A84C]/30"
                />
              </div>
              {wordFile && (
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Nom de la série</label>
                  <input type="text" value={wordName} onChange={(e) => setWordName(e.target.value)}
                    className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/60" />
                </div>
              )}
              <button onClick={handleWordImport} disabled={!wordFile || importing}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] disabled:opacity-30 disabled:cursor-not-allowed">
                {importing ? (
                  <><span className="w-4 h-4 border-2 border-[#0e1e35]/30 border-t-[#0e1e35] rounded-full animate-spin" /> {progress}</>
                ) : (
                  <><Download size={15} /> Importer le Word</>
                )}
              </button>
            </div>
          ) : mode === "server" ? (
            <button
              onClick={handleImport}
              disabled={parsedIds.length === 0 || importing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {importing ? (
                <><span className="w-4 h-4 border-2 border-[#0e1e35]/30 border-t-[#0e1e35] rounded-full animate-spin" /> {progress}</>
              ) : (
                <><Download size={15} /> Importer {parsedIds.length > 0 ? `${parsedIds.length} série${parsedIds.length > 1 ? "s" : ""}` : ""}</>
              )}
            </button>
          ) : (
            <>
              <button
                onClick={handleCopy}
                disabled={parsedIds.length === 0}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                  copied ? "bg-green-500/20 border border-green-400/40 text-green-300" : "bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35]"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {copied ? <><Check size={15} /> Script copié !</> : <><Copy size={15} /> Copier le script d&apos;import</>}
              </button>
              {copied && (
                <div className="rounded-xl border border-green-400/20 bg-green-500/5 p-4 space-y-2">
                  <p className="text-xs font-bold text-green-300">Maintenant :</p>
                  <ol className="text-[12px] text-white/70 space-y-2 list-decimal list-inside">
                    <li>Va sur <a href="https://diploma.exoteach.com" target="_blank" rel="noreferrer" className="text-[#C9A84C] underline">diploma.exoteach.com</a></li>
                    <li>Console : <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">F12</kbd> → Console</li>
                    <li>Tape <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono">allow pasting</kbd> + Entrée</li>
                    <li>Colle + Entrée — attends les ✅</li>
                    <li>Reviens ici et ferme ✓</li>
                  </ol>
                </div>
              )}
            </>
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
