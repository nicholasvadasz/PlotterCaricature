// Explicit Gemini experiment: independent prompt variants on one color crop.
// Completed outputs are reused on reruns; no automatic paid retries.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {geminiKey,generateGemini} from '../backend/gemini.mjs';
import {svgFor} from '../src/geometry.js';
import {PROMPT_PRESETS} from '../src/prompt-presets.js';

const [reference,output,preferred]=process.argv.slice(2);
if(!reference||!output)throw new Error('Usage: node scripts/prompt-study.mjs color-crop.png output-directory [preferred.svg]');
const variants=PROMPT_PRESETS.map(({id,label})=>[id,label]);
const model='gemini-3-pro-image',python=process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python';
const settings={engine:'lineart',width:720,height:720,resolution:720,paperWidth:180,penWidth:.45,traceThreshold:.65,traceMinLength:.35,traceSmooth:.6,traceMergeGap:1.5,traceSimplify:.05,traceStrokeTarget:12,traceRepairGap:.75};
await mkdir(output,{recursive:true});
if(existsSync(path.join(output,'reference.png'))&&!(await readFile(reference)).equals(await readFile(path.join(output,'reference.png'))))throw new Error('This output folder uses a different reference. Choose a new folder for a new experiment.');
await copyFile(reference,path.join(output,'reference.png'));
if(preferred)await copyFile(preferred,path.join(output,'preferred.svg'));
const image='data:image/png;base64,'+(await readFile(reference)).toString('base64');
const key=await geminiKey(process.cwd()),summaries=[];
const reviewFile=path.join(output,'review.json');
const observations=existsSync(reviewFile)?JSON.parse(await readFile(reviewFile,'utf8')):{};
function pythonRun(args,input){const r=spawnSync(python,args,{input,encoding:'utf8',windowsHide:true,maxBuffer:40*1024*1024});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout;}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function inkscapeControls(study){
 const choices=[];
 for(const [id,label]of [['gemini-repaired-route','Repaired route'],['gemini-minimum-route','Existing-ink route'],['gemini-flowing','Smooth centerlines']]){
  const svg=await readFile(path.join(output,study.id,id+'.svg'),'utf8');
  const payload={svg,name:`${study.title} - ${label}`,penWidthMm:settings.penWidth};
  choices.push({label,url:(process.env.PLOTTER_APP_URL||'http://127.0.0.1:5195')+'/inkscape.html#'+encodeURIComponent(JSON.stringify(payload))});
 }
 return `<div class="inkscape-actions"><label>SVG to open <select aria-label="SVG to open" onchange="this.parentElement.nextElementSibling.href=this.value">${choices.map(c=>`<option value="${esc(c.url)}">${esc(c.label)}</option>`).join('')}</select></label><a class="open-inkscape" href="${esc(choices[0].url)}" target="_blank" rel="noopener">Open in Inkscape · 5 × 7 in</a></div>`;
}
async function gallery(){
 const actions=new Map();for(const study of summaries.filter(s=>!s.error))actions.set(study.id,await inkscapeControls(study));
 const cards=summaries.map(s=>s.error?`<section><h2>${esc(s.title)}</h2><p>${esc(s.error)}</p></section>`:`<section><h2>${esc(s.title)}</h2>${observations[s.id]?`<p>${esc(observations[s.id])}</p>`:''}<p><b>${s.repaired.strokes} routed strokes</b> · ${(s.repaired.lengthMm/1000).toFixed(2)} m pen travel · ${s.raw.strokes} original traced branches · ${(s.metrics.inkFraction*100).toFixed(2)}% raster ink</p><div class="pair"><figure><img src="${s.id}/line-art.png"><figcaption>Actual Gemini output</figcaption></figure><figure><a href="${s.id}/gemini-repaired-route.svg"><img src="${s.id}/gemini-repaired-route.svg"></a><figcaption>Repaired pen route · 0.45 mm pen</figcaption></figure></div><details><summary>Overlay and exact prompt</summary><div class="overlay"><img src="reference.png"><img class="ink" src="${s.id}/line-art.png" style="opacity:.65"></div><label>Ink opacity <input type="range" min="0" max="1" step=".05" value=".65" oninput="this.parentElement.previousElementSibling.lastElementChild.style.opacity=this.value"></label><pre>${esc(s.prompt)}</pre></details>${actions.get(s.id)}<p><a href="${s.id}/line-art.png">PNG</a> · <a href="${s.id}/gemini-repaired-route.svg">Repaired SVG</a> · <a href="${s.id}/gemini-minimum-route.svg">Existing-ink SVG</a> · <a href="${s.id}/generation.json">Exact request metadata</a></p></section>`).join('');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sparse portrait prompt comparison</title><style>body{font:16px/1.5 system-ui;max-width:1500px;margin:auto;padding:28px;color:#173a34;background:#f5f4ed}h1,h2{font-family:Georgia;font-weight:400}section{background:#fff;padding:20px;border-radius:12px;margin:20px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block;aspect-ratio:1;object-fit:contain}figcaption{font-size:14px}pre{white-space:pre-wrap;font:14px/1.5 system-ui}a{color:inherit}.overlay{position:relative;width:min(100%,700px);aspect-ratio:1;background:white}.overlay img{position:absolute;inset:0}.ink{mix-blend-mode:multiply}input{width:60%}.inkscape-actions{margin:16px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.open-inkscape{display:inline-block;padding:9px 14px;border-radius:6px;background:#244f40;color:white;text-decoration:none}.inkscape-actions select{padding:8px}@media(max-width:900px){.grid{grid-template-columns:1fr}}</style><h1>${variants.length} prompt trials, one unaltered color crop</h1><p>Gemini 3 Pro Image, one sample per prompt. The reference is cropped/resized only: no mask, grayscale or contrast boost. All SVGs use the same tracing settings on a 180 mm page. The SVG routing can retrace ink, so a low stroke count does not necessarily mean visually sparse linework.</p><div class="grid"><section><h2>Exact input for every prompt</h2><img src="reference.png"><a href="reference.png">Save reference</a></section>${preferred?'<section><h2>Your preferred earlier SVG</h2><img src="preferred.svg"><p>From an earlier capture; a visual benchmark rather than a same-photo comparison.</p></section>':''}</div><div class="grid">${cards}</div><p>Keep the local portrait app running to use Open in Inkscape. Each opened drawing is centered on a 5 by 7 inch page with quarter-inch margins. The model can alter proportions or exceed the requested stroke count. Use each overlay to inspect likeness and alignment.</p></html>`;
 await writeFile(path.join(output,'comparison.html'),html);
 await writeFile(path.join(output,'summary.json'),JSON.stringify({model,settings,variants:summaries},null,2));
}
await gallery();
for(const [id,title] of variants){
 const folder=path.join(output,id);await mkdir(folder,{recursive:true});
 try {
  const metaFile=path.join(folder,'generation.json');let metadata;
  if(existsSync(metaFile))metadata=JSON.parse(await readFile(metaFile,'utf8'));
  else {
   console.log(`Generating ${title} with ${model}...`);
   const result=await generateGemini({image,model,style:id,inputCrop:{processing:'color-crop-only'}},{key,signal:AbortSignal.timeout(240000)});
   const mime=result.image.slice(5,result.image.indexOf(';')),ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime];
   await writeFile(path.join(folder,`original.${ext}`),Buffer.from(result.image.split(',')[1],'base64'));
   const {image:generated,...rest}=result;metadata={...rest,original:`original.${ext}`};
   await writeFile(metaFile,JSON.stringify(metadata,null,2));
  }
  let stats,metrics;
  const savedSettings=path.join(folder,'settings.json');
  const saved=existsSync(savedSettings)?JSON.parse(await readFile(savedSettings,'utf8')):null;
  if(saved?.studies.every(s=>s.plotterOptimization)){stats=saved.studies;metrics=saved.metrics;}
  else {
  pythonRun(['-c','from PIL import Image;import sys;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2])',path.join(folder,metadata.original),path.join(folder,'line-art.png')]);
  const png=await readFile(path.join(folder,'line-art.png'));
  const messages=pythonRun(['-u','backend/portrait.py'],JSON.stringify({...settings,image:'data:image/png;base64,'+png.toString('base64')})).trim().split(/\r?\n/).map(l=>JSON.parse(l));
  const results=messages.find(m=>m.results)?.results;if(!results)throw new Error('Tracing returned no results');
  stats=[];
  for(const result of results){const svg=svgFor(result,720,720,180,.45);await writeFile(path.join(folder,result.id+'.svg'),svg.svg);stats.push({id:result.id,strokes:svg.strokes,lengthMm:svg.lengthMm,routing:result.routing,repair:result.repair,plotterOptimization:result.plotterOptimization});}
  metrics=JSON.parse(pythonRun(['-c','from PIL import Image;import numpy as np,json,sys;a=np.asarray(Image.open(sys.argv[1]).convert("L"));ink=a<166;print(json.dumps(dict(inkFraction=float(ink.mean()),upperThirdInkFraction=float(ink[:len(ink)//3].mean()))))',path.join(folder,'line-art.png')]));
  await writeFile(path.join(folder,'settings.json'),JSON.stringify({...settings,metrics,studies:stats},null,2));
  }
  const summary={id,title,prompt:metadata.prompt,repaired:stats.find(s=>s.id==='gemini-repaired-route'),raw:stats.find(s=>s.id==='gemini-centerline'),metrics};summaries.push(summary);
  console.log(JSON.stringify({id,strokes:summary.repaired.strokes,lengthMm:Math.round(summary.repaired.lengthMm),metrics}));
 }catch(error){summaries.push({id,title,error:error.message});console.log(`${id}: ${error.message}`);}
 await gallery();
}
// Render the actual SVGs and a compact contact sheet for visual review.
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:720,height:720}});
 if(preferred){const svg=await readFile(path.join(output,'preferred.svg'),'utf8');await page.setContent(`<style>body{margin:0;background:white}svg{width:720px;height:720px}</style>${svg}`);await page.screenshot({path:path.join(output,'preferred.png')});}
 const contact=`<!doctype html><style>body{font:16px system-ui;margin:0;padding:18px;background:#f1efe8}main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}figure{margin:0;background:white;padding:10px}img{display:block;width:100%;height:390px;object-fit:contain}figcaption{height:56px}</style><main><figure><img src="reference.png"><figcaption>Exact color crop · no mask or tone adjustment</figcaption></figure>${summaries.filter(s=>!s.error).map(s=>`<figure><img src="${s.id}/line-art.png"><figcaption>${esc(s.title)}<br>${s.repaired.strokes} routed strokes · ${(s.repaired.lengthMm/1000).toFixed(2)} m · ${(s.metrics.inkFraction*100).toFixed(2)}% ink</figcaption></figure>`).join('')}</main>`;
 await writeFile(path.join(output,'contact-sheet.html'),contact);
 await page.setViewportSize({width:1320,height:1000});await page.goto(pathToFileURL(path.resolve(output,'contact-sheet.html')).href);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:path.join(output,'contact-sheet.png'),fullPage:true});
}finally{await browser.close();}
console.log(`Comparison saved: ${path.resolve(output,'comparison.html')}`);
