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

  // Script: navigate to Aperçu > Correction view (all questions visible at once),
  // scroll to load all images, then map by Y position using Exercice N headers.
  // Tested and verified: 26 images correctly mapped to 28 exercises on serie 9932.
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

/* Merge multiple images vertically into one using a hidden canvas */
async function mergeImagesVertically(imgEls){
  if(imgEls.length===0)return null;
  if(imgEls.length===1)return await imgToB64(imgEls[0].src);
  /* Load all images as Image objects */
  var loaded=[];
  for(var i=0;i<imgEls.length;i++){
    var b64=await imgToB64(imgEls[i].src);
    if(!b64)continue;
    var img=new Image();
    await new Promise(function(ok){img.onload=ok;img.onerror=ok;img.src=b64;});
    if(img.width>0)loaded.push(img);
  }
  if(loaded.length===0)return null;
  if(loaded.length===1)return loaded[0].src;
  /* Create canvas with combined height */
  var maxW=Math.max.apply(null,loaded.map(function(i){return i.width;}));
  var totalH=loaded.reduce(function(s,i){return s+i.height;},0)+((loaded.length-1)*10);
  var c=document.createElement('canvas');
  c.width=maxW;c.height=totalH;
  var ctx=c.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,maxW,totalH);
  var y=0;
  for(var i=0;i<loaded.length;i++){
    var x=Math.floor((maxW-loaded[i].width)/2);
    ctx.drawImage(loaded[i],x,y);
    y+=loaded[i].height+10;
  }
  return c.toDataURL('image/jpeg',0.85);
}

/* ── Overlay UI (full-screen dashboard) ── */
var existingOv=document.getElementById('exo-import-overlay');
if(existingOv)existingOv.remove();
var ov=document.createElement('div');
ov.id='exo-import-overlay';
ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(14,30,53,0.97);display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
ov.innerHTML=\`
<div style="padding:20px 28px;border-bottom:1px solid rgba(201,168,76,0.2);display:flex;align-items:center;justify-content:space-between">
  <div style="display:flex;align-items:center;gap:12px">
    <span style="font-size:22px">📥</span>
    <div>
      <div style="font-size:16px;font-weight:800;color:#C9A84C">Import ExoTeachBIS</div>
      <div id="exo-ov-subtitle" style="font-size:12px;color:rgba(255,255,255,0.4)">0 / \${${idsJson}.length} séries</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:16px">
    <div id="exo-ov-timer" style="font-size:13px;color:rgba(255,255,255,0.4);font-variant-numeric:tabular-nums">00:00</div>
    <div style="display:flex;gap:12px">
      <div id="exo-ov-ok-count" style="font-size:14px;font-weight:700;color:#4ade80">✅ 0</div>
      <div id="exo-ov-err-count" style="font-size:14px;font-weight:700;color:#f87171">❌ 0</div>
    </div>
  </div>
</div>
<div style="padding:0 28px;margin-top:12px">
  <div style="background:rgba(255,255,255,0.08);border-radius:8px;height:10px;overflow:hidden">
    <div id="exo-ov-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#C9A84C,#E3C286);border-radius:8px;transition:width 0.4s"></div>
  </div>
  <div id="exo-ov-status" style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:6px">Initialisation...</div>
</div>
<div style="flex:1;overflow-y:auto;padding:12px 28px;margin-top:8px">
  <div id="exo-ov-series" style="display:flex;flex-direction:column;gap:4px"></div>
</div>
<div id="exo-ov-log" style="border-top:1px solid rgba(255,255,255,0.08);padding:10px 28px;max-height:120px;overflow-y:auto;font-size:11px;color:rgba(255,255,255,0.4)"></div>
\`;
document.body.appendChild(ov);

var ovBar=document.getElementById('exo-ov-bar');
var ovStatus=document.getElementById('exo-ov-status');
var ovSubtitle=document.getElementById('exo-ov-subtitle');
var ovTimer=document.getElementById('exo-ov-timer');
var ovOkCount=document.getElementById('exo-ov-ok-count');
var ovErrCount=document.getElementById('exo-ov-err-count');
var ovSeriesContainer=document.getElementById('exo-ov-series');
var ovLogEl=document.getElementById('exo-ov-log');

var ids=${idsJson};
var totalIds=ids.length;
var globalOk=0,globalFail=0;
var startTime=Date.now();

/* Timer */
var timerInterval=setInterval(function(){
  var elapsed=Math.floor((Date.now()-startTime)/1000);
  var min=Math.floor(elapsed/60);
  var sec=elapsed%60;
  ovTimer.textContent=(min<10?'0':'')+min+':'+(sec<10?'0':'')+sec;
},1000);

/* Create a row for each serie */
var serieRows={};
ids.forEach(function(id,idx){
  var row=document.createElement('div');
  row.style.cssText='display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.03);';
  row.innerHTML='<span style="color:rgba(255,255,255,0.3);font-size:11px;width:30px;text-align:right">#'+id+'</span><span id="exo-s-status-'+id+'" style="font-size:13px">⏳</span><span id="exo-s-title-'+id+'" style="flex:1;font-size:12px;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">En attente...</span><span id="exo-s-imgs-'+id+'" style="font-size:11px;color:rgba(255,255,255,0.3)"></span>';
  ovSeriesContainer.appendChild(row);
  serieRows[id]={row:row};
});

function setSerieStatus(id,status,title,detail){
  var statusEl=document.getElementById('exo-s-status-'+id);
  var titleEl=document.getElementById('exo-s-title-'+id);
  var imgsEl=document.getElementById('exo-s-imgs-'+id);
  if(statusEl)statusEl.textContent=status;
  if(titleEl&&title){titleEl.textContent=title;titleEl.style.color=status==='✅'?'#4ade80':status==='❌'?'#f87171':'rgba(255,255,255,0.7)';}
  if(imgsEl&&detail)imgsEl.textContent=detail;
}

var logLines=[];
function ovLog(msg,type){
  var color=type==='ok'?'#4ade80':type==='err'?'#f87171':type==='img'?'#60a5fa':'rgba(255,255,255,0.4)';
  logLines.push('<div style="color:'+color+'">'+msg+'</div>');
  if(logLines.length>80)logLines.shift();
  ovLogEl.innerHTML=logLines.join('');
  ovLogEl.scrollTop=ovLogEl.scrollHeight;
}

function updateCounts(){
  ovOkCount.textContent='✅ '+globalOk;
  ovErrCount.textContent='❌ '+globalFail;
  ovSubtitle.textContent=(globalOk+globalFail)+' / '+totalIds+' séries';
  ovBar.style.width=Math.round(((globalOk+globalFail)/totalIds)*100)+'%';
}

var serieIdx=0;
for(var id of ids){
  serieIdx++;
  try{
    ovStatus.textContent='Série '+serieIdx+'/'+totalIds+' — Récupération #'+id+'...';
    setSerieStatus(id,'🔄','Récupération...');
    ovLog('📥 Série #'+id+' ('+serieIdx+'/'+totalIds+')...');
    var r=await client.query({fetchPolicy:'network-only',query:{kind:'Document',definitions:[{kind:'OperationDefinition',operation:'query',selectionSet:{kind:'SelectionSet',selections:[F('qcm',[A('id',String(id))],[F('id_qcm'),F('titre'),F('questions',null,[F('id_question'),F('question'),F('explications'),F('url_image_q'),F('answers',null,[F('id'),F('isTrue'),F('text'),F('explanation'),F('url_image')])])])]}}]}});
    if(!r.data||!r.data.qcm){globalFail++;setSerieStatus(id,'❌','Non trouvée sur ExoTeach');ovLog('❌ Série #'+id+' non trouvée','err');updateCounts();continue;}
    var qcm=JSON.parse(JSON.stringify(r.data.qcm));
    var nbQ=qcm.questions.length;

    setSerieStatus(id,'🖼️',qcm.titre+' ('+nbQ+'Q)','Scraping...');
    ovStatus.textContent='Série '+serieIdx+'/'+totalIds+' — '+qcm.titre;
    window.location.hash='#/admin-series/edit/'+id;
    await wait(3000);

    /* 2. Click "Aperçu" tab */
    var apercuBtn=Array.from(document.querySelectorAll('[role="radio"],label,span,a')).find(function(el){
      return(el.textContent||'').trim()==='Aperçu';
    });
    if(apercuBtn){apercuBtn.click();await wait(3000);}

    /* 3. Click "Correction" radio */
    var corrBtn=Array.from(document.querySelectorAll('[role="radio"],label,span')).find(function(el){
      return(el.textContent||'').trim()==='Correction';
    });
    if(corrBtn){corrBtn.click();await wait(3000);}

    /* 4. Scroll slowly to load ALL lazy images */
    var sc=document.querySelector('main')||document.documentElement;
    var maxScroll=sc.scrollHeight;
    for(var step=0;step<40;step++){
      sc.scrollTop=(step+1)*(maxScroll/40);
      await wait(300);
    }
    sc.scrollTop=0;
    await wait(2000);

    /* 5. Collect all content images */
    var allImgs=Array.from(document.querySelectorAll('img')).filter(function(i){
      if(!i.src||i.naturalWidth<80)return false;
      if(!i.src.includes('/medibox2-api/files/'))return false;
      if(i.src.includes('/avatars/'))return false;
      if(i.src.match(/\\.gif/i))return false;
      return true;
    });
    /* 6. Find Exercice N headers */
    var exHeaders=[];
    document.querySelectorAll('*').forEach(function(el){
      var ownText='';
      el.childNodes.forEach(function(n){if(n.nodeType===3)ownText+=n.textContent;});
      var m=ownText.trim().match(/^Exercice\\s+(\\d+)$/);
      if(m)exHeaders.push({num:parseInt(m[1]),y:el.getBoundingClientRect().top});
    });
    var seen={};
    exHeaders=exHeaders.filter(function(h){if(seen[h.num])return false;seen[h.num]=true;return true;});
    exHeaders.sort(function(a,b){return a.y-b.y;});
    ovLog('  '+allImgs.length+' images, '+exHeaders.length+' exercices','img');

    /* 7. Map images to exercises by Y position */
    for(var qi=0;qi<nbQ;qi++){
      var q=qcm.questions[qi];
      var exNum=qi+1;
      var ex=exHeaders.find(function(h){return h.num===exNum;});
      if(!ex){continue;}
      var nextEx=exHeaders.find(function(h){return h.num>exNum;});
      var nextY=nextEx?nextEx.y:999999;

      /* Images between this exercise header and the next */
      var exImgs=allImgs.filter(function(img){
        var iy=img.getBoundingClientRect().top;
        return iy>=ex.y&&iy<nextY;
      });

      if(exImgs.length===0){
      }else{
        /* Find the start of answer options by looking for checkboxes or option containers.
           On ExoTeach Correction view, each option starts with a checkbox input or a label container.
           We look for elements that contain EXACTLY "A" followed by option text. */
        var optionStarts=[];
        document.querySelectorAll('input[type="checkbox"],input[type="radio"]').forEach(function(el){
          var r=el.getBoundingClientRect();
          if(r.top>=ex.y&&r.top<nextY&&r.height>5){
            optionStarts.push({y:r.top});
          }
        });
        /* Fallback: find option text patterns "A La réaction...", "B ..." */
        if(optionStarts.length===0){
          document.querySelectorAll('*').forEach(function(el){
            var ownText='';
            el.childNodes.forEach(function(n){if(n.nodeType===3)ownText+=n.textContent;});
            var r=el.getBoundingClientRect();
            if(/^\\s*[A-E]\\s+[A-Z]/.test(ownText)&&r.top>=ex.y&&r.top<nextY&&r.height>15&&r.height<60){
              optionStarts.push({y:r.top,letter:ownText.trim()[0]});
            }
          });
        }
        optionStarts.sort(function(a,b){return a.y-b.y;});
        /* First option = boundary between énoncé and items */
        var firstOptionY=optionStarts.length>0?optionStarts[0].y:nextY;

        /* Images ABOVE first option = énoncé images */
        var enonceImgs=exImgs.filter(function(img){return img.getBoundingClientRect().top<firstOptionY-20;});
        /* Images AT/BELOW first option = item images */
        var itemImgs=exImgs.filter(function(img){return img.getBoundingClientRect().top>=firstOptionY-20;});

        /* Capture ALL énoncé images */
        if(enonceImgs.length>0&&!q.url_image_q&&!q.image_url_scraped){
          enonceImgs.sort(function(a,b){return a.getBoundingClientRect().top-b.getBoundingClientRect().top;});
          if(enonceImgs.length===1){
            var b64=await imgToB64(enonceImgs[0].src);
            if(b64){q.image_url_scraped=b64;ovLog('  Q'+exNum+' ✅ image énoncé','img');}
          }else{
            /* Multiple images → store as JSON array */
            var imgArr=[];
            for(var ei=0;ei<enonceImgs.length;ei++){
              var b64=await imgToB64(enonceImgs[ei].src);
              if(b64)imgArr.push(b64);
            }
            if(imgArr.length>0){
              q.image_url_scraped=imgArr.length===1?imgArr[0]:JSON.stringify(imgArr);
              ovLog('  Q'+exNum+' ✅ '+imgArr.length+' images énoncé','img');
            }
          }
        }

        /* Capture item images — assign sequentially to options that need them */
        for(var ii=0,ai=0;ii<itemImgs.length&&ai<(q.answers||[]).length;ai++){
          if(!q.answers[ai].url_image&&!q.answers[ai].image_url_scraped){
            var ab=await imgToB64(itemImgs[ii].src);
            if(ab){
              q.answers[ai].image_url_scraped=ab;
              ovLog('  Q'+exNum+'.'+String.fromCharCode(65+ai)+' ✅ image item','img');
            }
            ii++;
          }
        }
      }

      /* Fetch answer images from Apollo if present */
      for(var ai=0;ai<(q.answers||[]).length;ai++){
        var ans=q.answers[ai];
        if(ans.url_image&&!ans.image_url_scraped){
          var ab=await imgToB64(ans.url_image);
          if(ab){ans.image_url_scraped=ab;ovLog('  Q'+exNum+'.'+String.fromCharCode(65+ai)+' ✅ image item','img');}
        }
      }
    }

    /* ── Send immediately after scraping ── */
    ovLog('📤 Envoi '+qcm.titre+'...');
    setSerieStatus(id,'📤',qcm.titre,'Envoi...');
    var imgCount=qcm.questions.filter(function(q){return q.image_url_scraped;}).length;
    var allSendQ=qcm.questions||[];
    var batches=[];
    for(var bi=0;bi<allSendQ.length;bi+=2){batches.push(allSendQ.slice(bi,bi+2));}
    if(batches.length===0)batches=[[]];
    var sendSerieId=null,serieOk=true,totalQ=0;
    for(var bti=0;bti<batches.length;bti++){
      var batch=batches[bti];
      var payload;
      if(bti===0){
        payload={series:[{id_qcm:qcm.id_qcm,titre:qcm.titre,questions:batch}],coursId:${coursId ? `'${coursId}'` : 'null'},serieType:'${serieType}',matiereId:${matiereId ? `'${matiereId}'` : 'null'}};
      }else{
        payload={series:[{id_qcm:qcm.id_qcm,titre:qcm.titre,questions:batch}],coursId:${coursId ? `'${coursId}'` : 'null'},serieType:'${serieType}',matiereId:${matiereId ? `'${matiereId}'` : 'null'},appendToSerieId:sendSerieId};
      }
      try{
        var res=await fetch('${saveUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        var out=await res.json();
        if(out.success){
          totalQ+=(out.results&&out.results[0]&&out.results[0].questions)||batch.length;
          if(bti===0&&out.results&&out.results[0])sendSerieId=out.results[0].newId;
        }else{serieOk=false;ovLog('  ❌ '+out.error,'err');}
      }catch(e){serieOk=false;ovLog('  ❌ Réseau: '+e.message,'err');}
    }
    if(serieOk){
      globalOk++;
      setSerieStatus(id,'✅',qcm.titre,totalQ+'Q · '+imgCount+' img');
      ovLog('✅ '+qcm.titre+' ('+totalQ+'Q, '+imgCount+' images)','ok');
    }else{
      globalFail++;
      setSerieStatus(id,'❌',qcm.titre,'Erreur envoi');
    }
    updateCounts();
  }catch(e){globalFail++;setSerieStatus(id,'❌','Erreur: '+e.message);ovLog('❌ #'+id+': '+e.message,'err');updateCounts();}
}
clearInterval(timerInterval);
ovBar.style.width='100%';
if(globalFail===0){
  ovStatus.textContent='✅ Import terminé — '+globalOk+' série(s) importée(s)';
  ovStatus.style.color='#4ade80';
  ovBar.style.background='linear-gradient(90deg,#4ade80,#22c55e)';
}else{
  ovStatus.style.color='#fbbf24';
  ovStatus.textContent='⚠️ Import terminé — '+globalOk+' OK, '+globalFail+' erreur(s)';
  ovBar.style.background='linear-gradient(90deg,#fbbf24,#f59e0b)';
  /* Collect failed IDs */
  var failedIds=[];
  ids.forEach(function(fid){
    var statusEl=document.getElementById('exo-s-status-'+fid);
    if(statusEl&&statusEl.textContent==='❌')failedIds.push(fid);
  });
  if(failedIds.length>0){
    var retryDiv=document.createElement('div');
    retryDiv.style.cssText='margin-top:12px;padding:12px 16px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:10px;';
    retryDiv.innerHTML='<div style="font-size:12px;font-weight:700;color:#fbbf24;margin-bottom:8px">'+failedIds.length+' série(s) échouée(s) :</div>'
      +'<div style="font-size:13px;color:#fff;font-family:monospace;background:rgba(0,0,0,0.3);padding:8px 12px;border-radius:6px;margin-bottom:8px;user-select:all">'+failedIds.join(', ')+'</div>'
      +'<button id="exo-retry-btn" style="background:#C9A84C;color:#0e1e35;border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">📋 Copier les IDs pour relancer</button>';
    ovSeriesContainer.parentElement.appendChild(retryDiv);
    document.getElementById('exo-retry-btn').onclick=function(){
      navigator.clipboard.writeText(failedIds.join(', '));
      this.textContent='✅ Copié !';
      this.style.background='#4ade80';
    };
  }
}
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
