const fs = require('fs');
const path = require('path');

const tree = JSON.parse(fs.readFileSync(path.join(__dirname, 'exoteach-merged-tree.json'), 'utf-8'));

function countAll(n) { let c = n.length; for (const x of n) c += countAll(x.children || []); return c; }
function countSeries(n) { let c = 0; for (const x of n) { if (x.seriesData) for (const ch of x.seriesData) c += ch.series.length; c += countSeries(x.children || []); } return c; }

const tn = countAll(tree), ts = countSeries(tree);
console.log('Nodes:', tn, 'Series:', ts);

const dj = JSON.stringify(tree);

const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0e1e35;color:#e5e7eb;min-height:100vh}
.hd{background:linear-gradient(135deg,#0e1e35,#1a2d4a);padding:14px 24px;border-bottom:1px solid rgba(212,171,80,.2);display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.hd h1{font-size:18px;font-weight:800;color:#fff}.hd h1 span{color:#C9A84C}
.sts{display:flex;gap:8px;margin-left:auto}.st{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:4px 10px;text-align:center}
.st .n{font-size:14px;font-weight:800;color:#C9A84C}.st .l{font-size:7px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.5)}
.sb{padding:8px 24px;background:rgba(0,0,0,.2)}.sb input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px 12px;color:#fff;font-size:12px;outline:none}.sb input:focus{border-color:#C9A84C}.sb input::placeholder{color:rgba(255,255,255,.3)}
.tw{padding:10px 24px;max-width:1400px;margin:0 auto}
.nd{margin-bottom:1px}.nh{display:flex;align-items:center;gap:5px;padding:4px 6px;border-radius:5px;cursor:pointer;transition:all .12s;user-select:none}
.nh:hover{background:rgba(255,255,255,.04)}.nh.op{background:rgba(212,171,80,.04)}
.nh .cv{transition:transform .2s;color:rgba(255,255,255,.25);font-size:9px;width:12px;text-align:center;flex-shrink:0}
.nh.op .cv{transform:rotate(90deg);color:#C9A84C}
.nh .ic{width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0}
.fo .ic{background:rgba(212,171,80,.1)}.su .ic{background:rgba(59,130,246,.1)}
.nh .nm{font-size:11px;font-weight:600;color:rgba(255,255,255,.8);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nh .bd{font-size:8px;background:rgba(255,255,255,.07);padding:1px 6px;border-radius:5px;color:rgba(255,255,255,.35);flex-shrink:0}
.nh .ib{font-size:7px;color:rgba(212,171,80,.4);flex-shrink:0;cursor:pointer;font-family:monospace}.nh .ib:hover{color:#C9A84C}
.nc{margin-left:18px;border-left:1px solid rgba(255,255,255,.03);padding-left:5px;display:none}.nc.op{display:block}
.d0>.nh .nm{font-size:14px;font-weight:800;color:#fff}.d0>.nh{padding:8px 6px;border-bottom:1px solid rgba(212,171,80,.1);margin-bottom:4px}
.d1>.nh .nm{font-size:12px;font-weight:700;color:rgba(255,255,255,.9)}
.ss{padding:3px 0 6px 24px}.ct{font-size:10px;font-weight:600;color:rgba(255,255,255,.45);padding:5px 0 2px;display:flex;align-items:center;gap:5px}
.sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:4px;padding-bottom:4px}
.sc{display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.04);border-radius:6px;cursor:pointer;transition:all .12s}
.sc:hover{background:rgba(212,171,80,.06);border-color:rgba(212,171,80,.18)}
.sc.sl{background:rgba(212,171,80,.12);border-color:#C9A84C}
.sc .si{font-size:9px;font-weight:700;color:#C9A84C;background:rgba(212,171,80,.08);padding:1px 5px;border-radius:4px;min-width:38px;text-align:center;flex-shrink:0}
.sc .sn{font-size:10px;color:rgba(255,255,255,.65);flex:1;word-break:break-word}
.sc .sq{font-size:8px;color:rgba(255,255,255,.25);flex-shrink:0}
.hi{display:none!important}
.slb{position:fixed;bottom:0;left:0;right:0;background:linear-gradient(180deg,transparent,rgba(14,30,53,.95) 20%);padding:10px 24px;display:none;align-items:center;gap:10px;z-index:50}
.slb.vi{display:flex}.slb .nf{font-size:11px;color:rgba(255,255,255,.7)}.slb .nf strong{color:#C9A84C}
.slb .ac{margin-left:auto;display:flex;gap:5px}
.bt{padding:5px 14px;border-radius:7px;font-size:11px;font-weight:600;border:none;cursor:pointer}.bg{background:#C9A84C;color:#0e1e35}
.bo{background:transparent;border:1px solid rgba(255,255,255,.2);color:#fff}
.tt{position:fixed;bottom:16px;right:16px;background:#C9A84C;color:#0e1e35;padding:6px 14px;border-radius:7px;font-size:11px;font-weight:600;opacity:0;transition:opacity .3s;pointer-events:none;z-index:100}.tt.sh{opacity:1}`;

const js = `
const D=${dj};
const sel=new Set();const tr=document.getElementById('tr');
function tw(m){const t=document.getElementById('tt');t.textContent=m;t.classList.add('sh');setTimeout(function(){t.classList.remove('sh')},1500)}
function cp(id,e){e.stopPropagation();navigator.clipboard.writeText(String(id));tw('#'+id+' copié')}
function ts(id,el){if(sel.has(id)){sel.delete(id);el.classList.remove('sl')}else{sel.add(id);el.classList.add('sl')}ub()}
function ub(){var b=document.getElementById('sb2');if(sel.size>0){b.classList.add('vi');document.getElementById('xc').textContent=sel.size;var q=0;function w(ns){for(var i=0;i<ns.length;i++){var n=ns[i];if(n.seriesData)for(var j=0;j<n.seriesData.length;j++)for(var k=0;k<n.seriesData[j].series.length;k++)if(sel.has(n.seriesData[j].series[k].id))q+=n.seriesData[j].series[k].nbQ;if(n.children)w(n.children)}}w(D);document.getElementById('xq').textContent=q}else b.classList.remove('vi')}
function cs(){sel.clear();document.querySelectorAll('.sc.sl').forEach(function(e){e.classList.remove('sl')});ub()}
function ci(){var ids=Array.from(sel).sort(function(a,b){return a-b}).join(', ');navigator.clipboard.writeText(ids);tw(sel.size+' IDs copiés')}
function ej(){var d=[];function w(ns){for(var i=0;i<ns.length;i++){var n=ns[i];if(n.seriesData)for(var j=0;j<n.seriesData.length;j++)for(var k=0;k<n.seriesData[j].series.length;k++){var s=n.seriesData[j].series[k];if(sel.has(s.id))d.push({id:s.id,title:s.title,nbQ:s.nbQ,ue:n.name,chapter:n.seriesData[j].name})}if(n.children)w(n.children)}}w(D);var bl=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});var u=URL.createObjectURL(bl);var a=document.createElement('a');a.href=u;a.download='exoteach-selection.json';a.click()}
function cd(n){if(!n.children)return 0;var c=n.children.length;for(var i=0;i<n.children.length;i++)c+=cd(n.children[i]);return c}
function cns(n){var c=0;if(n.seriesData)for(var j=0;j<n.seriesData.length;j++)c+=n.seriesData[j].series.length;if(n.children)for(var i=0;i<n.children.length;i++)c+=cns(n.children[i]);return c}
function rn(nd,dp){
var hc=nd.children&&nd.children.length>0;var hs=nd.seriesData&&nd.seriesData.length>0;var isF=hc||nd.isFolder;
var d=document.createElement('div');d.className='nd d'+dp;
var h=document.createElement('div');h.className='nh '+(isF?'fo':'su');
var cc=hc?nd.children.length:0;var td=cd(nd);var sc=cns(nd);
var b='';
if(nd.id)b+='<span class="ib" onclick="cp('+nd.id+',event)" title="Copier">#'+nd.id+'</span>';
if(sc>0)b+='<span class="bd" style="color:#C9A84C">'+sc+' séries</span>';
else if(cc>0)b+='<span class="bd">'+td+'</span>';
h.innerHTML=((hc||hs)?'<span class="cv">▶</span>':'<span class="cv" style="opacity:.15">·</span>')+'<div class="ic">'+(isF?'📁':'📘')+'</div><span class="nm">'+nd.name+'</span>'+b;
d.appendChild(h);
if(hc||hs){var cDiv=document.createElement('div');cDiv.className='nc';
if(hc)for(var i=0;i<nd.children.length;i++)cDiv.appendChild(rn(nd.children[i],dp+1));
if(hs){var ss=document.createElement('div');ss.className='ss';var html='';
for(var j=0;j<nd.seriesData.length;j++){var ch=nd.seriesData[j];html+='<div class="ct">'+ch.name+' <span style="margin-left:auto;font-size:8px;color:rgba(255,255,255,.2)">'+ch.series.length+'</span></div><div class="sg">';
for(var k=0;k<ch.series.length;k++){var s=ch.series[k];html+='<div class="sc'+(sel.has(s.id)?' sl':'')+'" onclick="ts('+s.id+',this)"><span class="si">#'+s.id+'</span><span class="sn">'+s.title+'</span><span class="sq">'+s.nbQ+'Q</span></div>'}
html+='</div>'}ss.innerHTML=html;cDiv.appendChild(ss)}
d.appendChild(cDiv);h.onclick=function(){h.classList.toggle('op');cDiv.classList.toggle('op')};
if(dp<1){h.classList.add('op');cDiv.classList.add('op')}}return d}
for(var i=0;i<D.length;i++)tr.appendChild(rn(D[i],0));
document.getElementById('se').addEventListener('input',function(e){var q=e.target.value.toLowerCase().trim();var all=document.querySelectorAll('.nd');
if(!q){all.forEach(function(n){n.classList.remove('hi')});return}all.forEach(function(n){n.classList.remove('hi')});
function mt(el){var nm=(el.querySelector(':scope>.nh .nm')||{}).textContent||'';var ib=(el.querySelector(':scope>.nh .ib')||{}).textContent||'';var sr=el.querySelectorAll(':scope>.nc .sc');var sm=false;sr.forEach(function(s){if(s.textContent.toLowerCase().indexOf(q)>=0)sm=true});return nm.toLowerCase().indexOf(q)>=0||ib.toLowerCase().indexOf(q)>=0||sm}
function hm(el){if(mt(el))return true;var ch=el.querySelectorAll(':scope>.nc>.nd');for(var i=0;i<ch.length;i++)if(hm(ch[i]))return true;return false}
all.forEach(function(n){if(!hm(n))n.classList.add('hi');else{var c=n.querySelector(':scope>.nc');var h=n.querySelector(':scope>.nh');if(c&&h){h.classList.add('op');c.classList.add('op')}}})});`;

const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ExoTeach — Cartographie complète</title>
<style>${css}</style></head><body>
<div class="hd"><h1>ExoTeach <span>Cartographie</span></h1><div style="font-size:10px;color:rgba(255,255,255,.35)">Toutes formations • Match par UE ID</div>
<div class="sts"><div class="st"><div class="n">${tn}</div><div class="l">Noeuds</div></div><div class="st"><div class="n">${ts}</div><div class="l">Séries</div></div></div></div>
<div class="sb"><input id="se" placeholder="Rechercher formation, matière, série ou ID de série..." /></div>
<div class="tw" id="tr"></div>
<div class="slb" id="sb2"><div class="nf"><strong id="xc">0</strong> séries (<span id="xq">0</span>Q)</div>
<div class="ac"><button class="bt bo" onclick="ci()">📋 Copier IDs</button><button class="bt bo" onclick="cs()">✕</button><button class="bt bg" onclick="ej()">📥 JSON</button></div></div>
<div class="tt" id="tt"></div>
<script>${js}</script></body></html>`;

fs.writeFileSync(path.join(__dirname, 'exoteach-dashboard.html'), html);
console.log('Dashboard written: ' + tn + ' nodes, ' + ts + ' series');
