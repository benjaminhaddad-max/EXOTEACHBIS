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

  // Script that navigates to each serie's print page on ExoTeach,
  // switches to "Corrigé" mode, clicks "Exporter en Word",
  // intercepts the generated blob, and sends it to our import-word API
  const importUrl = "https://exoteachbis.vercel.app/api/import-word";

  return `(async()=>{
if(!window.location.href.includes('exoteach.com')){alert('Ouvre cette page sur diploma.exoteach.com !');return;}
function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}

var ids=${idsJson};
var ok=0,fail=0;

for(var i=0;i<ids.length;i++){
  var id=ids[i];
  console.log('📥 Série '+id+' ('+(i+1)+'/'+ids.length+')...');

  /* 1. Navigate to print page */
  window.location.hash='#/serie/print/'+id;
  await wait(3000);

  /* 2. Switch to Corrigé mode — find and click the "Corrigé" option */
  var typeSelect=document.querySelector('select');
  if(typeSelect){
    /* Try to select "Corrigé" in the dropdown */
    var opts=typeSelect.querySelectorAll('option');
    for(var oi=0;oi<opts.length;oi++){
      if((opts[oi].textContent||'').toLowerCase().includes('corrig')){
        typeSelect.value=opts[oi].value;
        typeSelect.dispatchEvent(new Event('change',{bubbles:true}));
        console.log('  ✅ Mode Corrigé sélectionné');
        break;
      }
    }
    await wait(2000);
  }

  /* Also try clicking a "Corrigé" button/tab if no select */
  var corrBtn=Array.from(document.querySelectorAll('button,label,div')).find(function(el){
    return(el.textContent||'').trim().toLowerCase()==='corrigé';
  });
  if(corrBtn){corrBtn.click();await wait(1500);}

  /* 3. Find and click "Exporter en Word" button */
  /* Intercept the blob download by overriding the click temporarily */
  var wordBlob=null;
  var origCreateObjectURL=URL.createObjectURL;
  var origRevokeObjectURL=URL.revokeObjectURL;

  /* Intercept blob creation to capture the Word file */
  URL.createObjectURL=function(blob){
    if(blob&&blob.size>1000){wordBlob=blob;console.log('  📄 Word intercepté ('+Math.round(blob.size/1024)+'KB)');}
    return origCreateObjectURL.call(URL,blob);
  };

  /* Also intercept <a> downloads */
  var origClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){
    if(this.download&&this.href&&this.href.startsWith('blob:')){
      console.log('  📎 Download intercepté: '+this.download);
      return;/* Prevent actual download */
    }
    return origClick.call(this);
  };

  var wordBtn=Array.from(document.querySelectorAll('button')).find(function(b){
    var t=(b.textContent||'').toLowerCase();
    return t.includes('word')||t.includes('exporter en w');
  });
  if(wordBtn){
    wordBtn.click();
    console.log('  ⏳ Génération Word...');
    await wait(5000);
  }else{
    console.log('  ❌ Bouton "Exporter en Word" non trouvé');
    /* Restore */
    URL.createObjectURL=origCreateObjectURL;
    HTMLAnchorElement.prototype.click=origClick;
    fail++;
    continue;
  }

  /* Restore original functions */
  URL.createObjectURL=origCreateObjectURL;
  HTMLAnchorElement.prototype.click=origClick;

  if(!wordBlob){
    console.log('  ❌ Word non capturé');
    fail++;
    continue;
  }

  /* 4. Get serie title from page */
  var title='ExoTeach #'+id;
  var titleEl=document.querySelector('h1,h2,[class*="title"]');
  if(titleEl){
    var tt=(titleEl.textContent||'').trim();
    if(tt.length>5)title=tt;
  }
  /* Also try from Apollo */
  try{
    var client=window.__APOLLO_CLIENT__;
    if(client){
      var F=function(n,a,s){var f={kind:'Field',name:{kind:'Name',value:n}};if(a)f.arguments=a;if(s)f.selectionSet={kind:'SelectionSet',selections:s};return f;};
      var A=function(n,v){return{kind:'Argument',name:{kind:'Name',value:n},value:{kind:'StringValue',value:v}};};
      var r=await client.query({fetchPolicy:'cache-first',query:{kind:'Document',definitions:[{kind:'OperationDefinition',operation:'query',selectionSet:{kind:'SelectionSet',selections:[F('qcm',[A('id',String(id))],[F('titre')])]}}]}});
      if(r.data&&r.data.qcm&&r.data.qcm.titre)title=r.data.qcm.titre;
    }
  }catch(e){}

  /* 5. Send to ExoTeachBIS API */
  console.log('  📤 Envoi "'+title+'" à ExoTeachBIS...');
  try{
    var formData=new FormData();
    formData.append('file',wordBlob,title+'.docx');
    formData.append('name',title);
    formData.append('type','${serieType}');
    ${coursId ? "formData.append('coursId','" + coursId + "');" : ""}
    ${matiereId ? "formData.append('matiereId','" + matiereId + "');" : ""}
    var res=await fetch('${importUrl}',{method:'POST',body:formData});
    var out=await res.json();
    if(out.success){
      ok++;
      console.log('  ✅ '+out.imported+' questions importées');
    }else{
      fail++;
      console.log('  ❌ '+out.error);
    }
  }catch(e){fail++;console.log('  ❌ Erreur réseau: '+e.message);}
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
