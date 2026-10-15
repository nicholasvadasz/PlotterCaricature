import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { zipSync, strToU8 } from 'fflate';
import { svgFor } from './geometry.js';
import {cropColorPhoto} from './photo-crop.js';
import {requestGemini,traceLineart,asPng,imageBytes} from './gemini-client.js';
import {openInInkscape} from './inkscape-client.js';
import {PROMPT_PRESETS,PROD_PROMPT_PRESETS,PROD_PEN_PROMPT_PRESETS,SWATCH_STYLE} from './prompt-presets.js';
import {splitSwatch} from './swatch.js';
import {selectPreferred,routeMetrics,retracedMm} from './route-preference.js';
import {recordActivity} from './telemetry-client.js';
const $ = id => document.getElementById(id);
$('geminiStyle').replaceChildren(...PROMPT_PRESETS.map(p=>new Option(p.label,p.id)));
$('allPromptsHint').textContent=`All Prompts runs the ${PROMPT_PRESETS.length} active prompts concurrently on the same color crop, then traces each result as it arrives. Uses ${PROMPT_PRESETS.length} image requests; requires sufficient provider quota.`;
const providerLabel=()=> $('imageProvider').value==='mai'?'MAI-Image-2.6 via OpenRouter':'Gemini';
let W = 720, H = 720;
let stream, source, analysis, models, modelFilesPromise, worker, exports = [], lastSettings, busy = false, cancelDrawing;
let geminiRaster=null,exportRaster=null,preparedReference=null;
let batchJobs=null;
let batchName='All Prompts',batchFile='all-prompts',swatchRaster=null,renderedTargets=[];
const generationButtons=['generate','allPrompts','prodPen','prodSwatch'];
const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const settingIds = ['crop','paperWidth','penWidth','resolution','drawSpeed','imageProvider','geminiModel','geminiStyle','promptMode','traceThreshold','traceMinLength','traceSmooth','traceRepairGap','traceMergeGap','traceSimplify','traceStrokeTarget'];
const settings = () => Object.fromEntries(settingIds.map(id => {
  const element=$(id), value=element.value;
  return [id, element.type==='select-one' && id!=='resolution' ? value : Number(value)];
}));
function lock(value) {
  busy = value;
  for (const id of [...generationButtons,'upload','startCamera','cameraSelect']) $(id).disabled = value || (generationButtons.includes(id) && !source);
  $('capture').disabled = value || !stream;
  $('downloadAll').disabled = value || (!exports.length&&!batchJobs?.some(j=>j.raster)&&!swatchRaster);
  for (const id of settingIds) $(id).disabled = value;
  $('retraceGemini').disabled=value||(!geminiRaster&&!batchJobs?.some(j=>j.raster));
  $('retraceGemini').textContent=batchJobs?'Retrace saved PNGs':'Retrace saved PNG';
  $('lineartUpload').disabled=value;
  $('downloadGeminiPng').hidden=!!batchJobs||!geminiRaster;
}
function stopCamera() {
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  $('video').srcObject = null; $('capture').disabled = true; $('stopCamera').disabled = true;
  $('cameraPlaceholder').style.display = 'flex';
}
async function startCamera() {
  stopCamera();
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use http://localhost:5173 in Chrome or Edge to access the camera.');
    const deviceId = $('cameraSelect').value;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 } } });
    $('video').srcObject = stream; await $('video').play();
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    const active = stream.getVideoTracks()[0].getSettings().deviceId;
    $('cameraSelect').replaceChildren(...devices.map((d, i) => new Option(d.label || `Camera ${i + 1}`, d.deviceId, false, d.deviceId === active)));
    $('cameraPlaceholder').style.display = 'none'; $('capture').disabled = busy; $('stopCamera').disabled = false;
    status('Camera ready. Select the C920 if another camera opened, then take a photo.');
  } catch (error) { stopCamera(); status(`Camera unavailable: ${error.message} Check browser/Windows camera permissions, or upload a photo.`, true); }
}
$('startCamera').onclick = startCamera; $('cameraSelect').onchange = startCamera; $('stopCamera').onclick = stopCamera;
function setSource(image) {
  clearSwatch();
  batchJobs=null;$('gallery').classList.remove('batch');$('comparisonControl').hidden=true;
  geminiRaster=exportRaster=preparedReference=null;$('retraceGemini').disabled=true;$('saveReference').disabled=true;
  const w = image.videoWidth || image.naturalWidth || image.width, h = image.videoHeight || image.naturalHeight || image.height;
  const scale = Math.min(1, 2048 / Math.max(w, h)); source = canvas(Math.round(w * scale), Math.round(h * scale));
  const ctx = source.getContext('2d');
  if ($('mirror').checked) { ctx.translate(source.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(image, 0, 0, source.width, source.height);
  analysis = null;
  for (const id of ['original', 'prepared']) {
    const c = $(id), cx = c.getContext('2d'); cx.clearRect(0, 0, c.width, c.height);
    if (id === 'original') { const s = Math.min(c.width / source.width, c.height / source.height); cx.drawImage(source, (c.width - source.width * s) / 2, (c.height - source.height * s) / 2, source.width * s, source.height * s); }
  }
  exports = []; $('gallery').replaceChildren(); lock(false);
  $('notice').textContent = '';
  status('Photo ready. Preparing the color crop for review.');
  void previewCrop();
}
$('capture').onclick = () => { if ($('video').videoWidth) setSource($('video')); };
$('upload').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  try { const image = new Image(); image.src = url; await image.decode(); setSource(image); }
  catch { status('This image could not be read. Try a JPG, PNG or WebP photo.', true); }
  finally { URL.revokeObjectURL(url); event.target.value = ''; }
};
async function getModels() {
  if (models) return models;
  modelFilesPromise ||= FilesetResolver.forVisionTasks('/wasm');
  const files = await modelFilesPromise;
  models ||= { files }; return models;
}
async function analyze() {
  if (analysis?.faceDone) return analysis;
  const currentSource=source;
  const result={warnings:[],faceDone:true,landmarks:null};
  try {
    const m=await getModels();
    m.facePromise ||= FaceLandmarker.createFromOptions(m.files, {baseOptions:{modelAssetPath:'/models/face_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numFaces:1});
    m.face=await m.facePromise;
    result.landmarks=m.face.detect(currentSource).faceLandmarks[0]||null;
    if(!result.landmarks)result.warnings.push('No face detected: sending the whole color photo.');
  } catch(error) {result.warnings.push('Face detection unavailable: sending the whole color photo. Run npm run setup to install the face model.');}
  if(source===currentSource)analysis=result;
  return result;
}
function prepare(a,s) {
  const prepared=cropColorPhoto(source,a.landmarks,s.crop);
  const c=$('prepared'),ctx=c.getContext('2d');
  const scale=Math.min(c.width/prepared.canvas.width,c.height/prepared.canvas.height);
  ctx.clearRect(0,0,c.width,c.height);
  ctx.drawImage(prepared.canvas,(c.width-prepared.canvas.width*scale)/2,(c.height-prepared.canvas.height*scale)/2,prepared.canvas.width*scale,prepared.canvas.height*scale);
  $('notice').textContent=a.warnings?.join(' ')||'Color crop only: no background mask, grayscale or contrast adjustment.';
  preparedReference=prepared;$('saveReference').disabled=false;
  return prepared;
}
async function previewCrop() {
  if(!source||busy)return;
  const currentSource=source;
  const a=await analyze();
  if(source===currentSource&&!busy){
    const prepared=prepare(a,settings());status('Color crop ready. Review it, then generate your portrait.');
    try {
      const response=await fetch('/api/gemini/reference',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:prepared.image,inputCrop:prepared.crop})});
      if(!response.ok)throw new Error('Reference could not be saved');
      const result=await response.json();
      if(preparedReference===prepared)prepared.savedId=result.id;
    } catch {if(preparedReference===prepared)$('notice').textContent+=' Automatic local save failed; use Save color crop to keep a copy.';}
  }
}
$('crop').addEventListener('change',previewCrop);
$('saveReference').onclick=()=>{if(preparedReference)download(new Blob([imageBytes(preparedReference.image)],{type:'image/png'}),'portrait-color-crop.png');};
function download(blob,name) { const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000); }
let preferenceGroup=0;
const retraceText=result=>retracedMm(result)===null?'unknown':retracedMm(result).toFixed(1);
function drawingContext(target,result){
 const raster=target.__job?.raster||exportRaster||{},s=target.__settings||{};
 const metrics=result?routeMetrics(result):{};
 return {generationId:raster.id,provider:raster.provider||(raster.imported?'local':'gemini'),model:raster.model,apiProvider:raster.apiProvider,deployment:raster.deployment,
  style:raster.style,promptMode:raster.promptMode,promptVersion:raster.promptVersion,source:raster.imported?'imported-png':'generated',sourceName:raster.sourceName,swatchPanel:raster.swatchPanel?.index,
  traceId:target.__traceId,drawingId:result?.id,drawingName:result?.name,routePreference:target.__preference||'balanced',
  strokes:result?.strokes,lengthMm:result?.lengthMm,...metrics,settings:s};
}
function logActivity(event,target,result){
 void recordActivity(event,drawingContext(target,result)).then(warning=>{if(warning)$('notice').textContent=warning;});
}
function preferenceControl(target){
  const fieldset=document.createElement('fieldset');fieldset.className='route-options';
  const legend=document.createElement('legend');legend.textContent='Preferred SVG';fieldset.append(legend);
  const choices=[['overdraw','Min overwrite'],['strokes','Min strokes'],['balanced','Balanced']];
  const name=`route-preference-${++preferenceGroup}`;
  for(const [value,labelText] of choices){
    const label=document.createElement('label');label.className='route-choice';
    const input=document.createElement('input');input.type='radio';input.name=name;input.value=value;input.checked=value===(target.__preference||'balanced');
    const dot=document.createElement('span');dot.className='radio-dot';const text=document.createElement('span');text.textContent=labelText;
    input.addEventListener('change',()=>{if(!input.checked)return;target.__preference=value;if(target.__job)target.__job.routePreference=value;updatePreferred(target);const selected=selectPreferred(target.__drawings||[],value,target.__settings);logActivity('route_preference_selected',target,selected);if(target===$('gallery'))status(`Preferred route: ${selected?.strokes??0} strokes, ${selected?retraceText(selected):'0.0'} mm planned retracing.`);});
    label.append(input,dot,text);fieldset.append(label);
  }
  return fieldset;
}
function render(results,s,target=$('gallery')) {
  target.__settings={...s};target.__traceId=crypto.randomUUID();
  // A retrace replaces the controls as well as the cards.
  if(target!==$('gallery'))target.parentElement.querySelector(':scope > .route-options')?.remove();
  const drawings=results.map(result=>({...result,...svgFor(result,s.resolution,s.resolution,s.paperWidth,s.penWidth)}));
  target.replaceChildren();target.__drawings=drawings;target.__preference=target.__preference||'balanced';if(!renderedTargets.includes(target))renderedTargets.push(target);$('comparisonControl').hidden=false;
  const choices=preferenceControl(target);if(target===$('gallery'))target.append(choices);else target.parentElement.insertBefore(choices,target);
  for(const result of drawings) {
    const card=document.createElement('article');card.className='card';card.__drawing=result;
    const art=document.createElement('button');art.className='art';art.setAttribute('aria-label',`Enlarge ${result.name}`);
    if(result.strokes) { art.innerHTML=result.svg;art.onclick=()=>{$('largePreview').innerHTML=result.svg;$('lightbox').showModal();}; }
    else {art.classList.add('unavailable');art.textContent=result.id==='features'||result.id==='connected'?'No face landmarks available.':'No strokes at these settings.';art.disabled=true;}
    const body=document.createElement('div');body.className='cardBody';
    body.innerHTML=`<div class="cardTitle"><h3>${result.name}</h3><span class="badge">${result.strokes===1?'Continuous':result.strokes+' strokes'}</span></div><p>${result.description}</p><p class="stats">${result.strokes} strokes · ${Math.max(0,result.strokes-1)} pen lifts · ${(result.lengthMm/1000).toFixed(2)} m of line</p>`;
    const estimate=document.createElement('p');estimate.className='stats';estimate.textContent=`${Math.ceil(result.lengthMm/(s.drawSpeed||40))} s minimum at ${s.drawSpeed||40} mm/s; acceleration and lifts excluded.`;body.append(estimate);
    const retrace=document.createElement('p');retrace.className='stats';retrace.textContent=`Planned retracing: ${retraceText(result)} mm · Added connectors: ${routeMetrics(result).connectorMm.toFixed(1)} mm.`;body.append(retrace);
    const preferredNote=document.createElement('p');preferredNote.className='stats preferredNote';body.prepend(preferredNote);
    if(result.optimization){const o=result.optimization,stats=document.createElement('p');stats.className='stats';stats.textContent=`Pen-up travel: ${(o.before.penUpMm/1000).toFixed(2)} to ${(o.after.penUpMm/1000).toFixed(2)} m. Added connectors: ${o.addedConnectorMm.toFixed(1)} mm. Removed short marks: ${o.removedInkMm.toFixed(1)} mm.`;body.append(stats);}
    if(result.routing){const r=result.routing,stats=document.createElement('p');stats.className='stats';stats.textContent=`Before final cleanup: ${r.connectedRegions} connected ink regions; ${(r.retracedMm/1000).toFixed(2)} m of retracing.`;body.append(stats);}
    if(result.plotterOptimization){const o=result.plotterOptimization,stats=document.createElement('p');stats.className='stats';stats.textContent=`Final vpype: ${o.before.strokes} → ${o.after.strokes} strokes; 1 mm merge, 0.05 mm simplify; ${o.addedConnectorMm.toFixed(1)} mm added joins.`;body.append(stats);}
    const button=document.createElement('button');button.className='download';button.textContent='Download SVG ↓';button.disabled=!result.strokes;
    button.onclick=()=>{download(new Blob([result.svg],{type:'image/svg+xml'}),`${result.id}.svg`);logActivity('svg_download',target,result);};
    const open=document.createElement('button');open.className='download';open.textContent='Open in Inkscape · 5 × 7 in';open.disabled=!result.strokes;
    open.onclick=async()=>{
      open.disabled=true;status('Opening a 5 × 7 inch page in Inkscape…');
      try{const opened=await openInInkscape(result.svg,result.name,s.penWidth,drawingContext(target,result));status('Opened in Inkscape: 5 × 7 inches, centered with ¼-inch margins. '+(opened.telemetryWarning||'Timestamped SVG and activity saved locally.'));}
      catch(error){status(error.message,true);}finally{open.disabled=!result.strokes;}
    };
    body.append(button,open);card.append(art,body);target.append(card);
  }
  updatePreferred(target);logActivity('trace_completed',target,selectPreferred(drawings,target.__preference,s));return drawings;
}
function updatePreferred(target){
  const drawings=target.__drawings||[],mode=target.__preference||'balanced',preferred=selectPreferred(drawings,mode,target.__settings);
  for(const card of target.querySelectorAll(':scope > .card')){
    const isPreferred=card.__drawing===preferred;card.dataset.comparison=String(!isPreferred);card.hidden=!isPreferred&&!$('showComparisons').checked;card.classList.toggle('is-preferred',isPreferred);
    const note=card.querySelector('.preferredNote');
    if(note){const result=card.__drawing;note.textContent=isPreferred?`Selected ${mode==='balanced'?'balance':mode==='overdraw'?'minimum overwrite':'minimum strokes'} · ${result.strokes} strokes · ${retraceText(result)} mm planned retracing`:'';note.hidden=!isPreferred;}
  }
  if(preferred){const card=[...target.querySelectorAll(':scope > .card')].find(item=>item.__drawing===preferred),first=target.querySelector(':scope > .card');if(card&&first!==card)target.insertBefore(card,first);}
  const job=target.__job;if(job?.state==='ready'&&job.message&&preferred){job.message.textContent=`Ready · ${mode==='overdraw'?'minimum overwrite':mode==='strokes'?'minimum strokes':'balanced'}: ${preferred.strokes} strokes, ${retraceText(preferred)} mm planned retracing · all SVGs optimized with vpype.`;if(job.raster.swatchPanel?.warnings.length)job.message.textContent+=' '+job.raster.swatchPanel.warnings.join(' ');}
}
$('showComparisons').onchange=()=>{for(const target of renderedTargets)updatePreferred(target);};
function drawingSettings(){
  let s=settings();
  s={...s,collection:'image-portraits',inputProcessing:'color-crop-only'};
  if (settingIds.some(id => !$(id).checkValidity())) { status('Check the drawing controls: enter values within the displayed ranges.',true); return; }
  if(!Number.isFinite(s.paperWidth)||s.paperWidth<50||s.paperWidth>1000||!Number.isFinite(s.penWidth)||s.penWidth<.05||s.penWidth>3) {status('Enter a page width from 50–1000 mm and a pen width from 0.05–3 mm.',true);return;}
  return s;
}
function clearResults(){
  clearSwatch();batchName='All Prompts';batchFile='all-prompts';
  batchJobs=null;exports=[];renderedTargets=[];geminiRaster=exportRaster=null;
  $('gallery').replaceChildren();$('gallery').classList.remove('batch');
  $('comparisonControl').hidden=true;
}
$('generate').onclick=async()=>{
  const s=drawingSettings();if(!s||!source||busy)return;
  clearResults();
  lock(true);status('Preparing portrait… Loading local models on the first photo.');
  try {
    await new Promise(resolve=>setTimeout(resolve,40));
    const a=await analyze(), input=prepare(a,s);
    const controller=new AbortController();
    cancelDrawing=()=>controller.abort();$('cancel').disabled=false;
    status(`Sending the color crop to ${providerLabel()}. One image request; this can take a minute.`);
    geminiRaster=await requestGemini({image:input.image,inputCrop:input.crop,provider:s.imageProvider,model:s.geminiModel,promptMode:s.promptMode,style:s.geminiStyle},controller.signal);
    if(geminiRaster.telemetryWarning)$('notice').textContent=geminiRaster.telemetryWarning;
    await finishGeminiTrace(s,controller.signal);
  } catch(error) { if(error.name==='AbortError') status('Drawing canceled.'); else status(`${error.message}${geminiRaster?' The last PNG is still available for download or local retracing.':''}`,true);}
  finally {worker?.terminate();worker=null;cancelDrawing=null;$('cancel').disabled=true;lock(false);}
};

function clearSwatch(){
 swatchRaster=null;$('swatchReview').hidden=true;$('swatchImage').removeAttribute('src');
}
function showSwatch(){
 $('swatchReview').hidden=false;$('swatchReview').open=true;$('swatchImage').src=swatchRaster.image;
}
$('downloadSwatch').onclick=()=>{if(swatchRaster)download(new Blob([imageBytes(swatchRaster.image)],{type:'image/png'}),'prod-swatch-sheet.png');};
function batchProgress(){
  const count=state=>batchJobs.filter(j=>j.state===state).length;
  status(`${batchName}: ${count('ready')}/${batchJobs.length} ready · ${count('generating')} generating · ${count('tracing')} tracing · ${count('error')} failed · ${count('canceled')} canceled.`);
}
function batchPanel(job){
  const panel=document.createElement('section');panel.className='prompt-result';panel.dataset.prompt=job.id;
  const title=document.createElement('h3');title.textContent=job.label;
  job.message=document.createElement('p');job.message.className='hint';job.message.setAttribute('role','status');
  job.cards=document.createElement('div');job.cards.className='prompt-cards';job.cards.__job=job;
  panel.append(title,job.message,job.cards);$('gallery').append(panel);
}
async function traceBatchJob(job,s,signal){
  if(job.raster.swatchPanel?.inkPixels<8)throw new Error('Swatch panel appears empty. Inspect the full sheet before trying another generation.');
  signal.throwIfAborted();job.state='tracing';job.message.textContent='Extracting and optimizing SVGs…';batchProgress();
  const results=await traceLineart(job.raster,s,signal,message=>{job.message.textContent=message;});
  signal.throwIfAborted();
  job.settings={...s,geminiStyle:job.id,created:new Date().toISOString()};
  job.exports=render(results,s,job.cards);job.state='ready';
  const best=selectPreferred(job.exports,job.cards.__preference,s);
  job.message.textContent=best?`Ready · ${job.cards.__preference==='overdraw'?'minimum overwrite':job.cards.__preference==='strokes'?'minimum strokes':'balanced'}: ${best.strokes} strokes, ${retraceText(best)} mm planned retracing · all SVGs optimized with vpype.`:'Ready · no ink at these tracing settings; adjust threshold and retrace.';
  if(job.raster.swatchPanel?.warnings.length)job.message.textContent+=' '+job.raster.swatchPanel.warnings.join(' ');
  updatePreferred(job.cards);
}
async function runBatchJob(job,s,signal,input){
  try{
    if(input){
      job.state='generating';job.message.textContent=`Generating with ${providerLabel()}…`;
      job.raster=await requestGemini({image:input.image,inputCrop:input.crop,provider:s.imageProvider,model:s.geminiModel,promptMode:s.promptMode,style:job.id},signal);
      if(job.raster.telemetryWarning)$('notice').textContent=job.raster.telemetryWarning;
    }
    await traceBatchJob(job,s,signal);
  }catch(error){
    job.state=signal.aborted?'canceled':'error';job.error=error.message;
    job.message.textContent=signal.aborted?'Canceled.':error.message;
    if(job.raster)job.message.textContent+=' PNG retained; retrace locally or download the batch.';
    job.message.classList.toggle('error',job.state==='error');
  }finally{exports=batchJobs.flatMap(j=>j.exports||[]);batchProgress();}
}
async function runPromptBatch(presets,name,file,{swatch=false}={}){
  const s=drawingSettings();if(!s||!source||busy)return;
  clearResults();batchName=name;batchFile=file;lock(true);
  const controller=new AbortController();cancelDrawing=()=>controller.abort();$('cancel').disabled=false;
  try{
    status(`Preparing one color crop for ${presets.length} prompts…`);
    const a=await analyze();controller.signal.throwIfAborted();const input=prepare(a,s);
    batchJobs=presets.map(p=>({...p,state:'generating',exports:[]}));
    $('gallery').classList.add('batch');batchJobs.forEach(batchPanel);
    batchProgress();
    if(swatch){
      status(`Prod Swatch Experiment: generating one sheet for A, F, B / C, G, H. One ${providerLabel()} image request.`);
      batchJobs.forEach(job=>{job.message.textContent='Waiting for the shared swatch…';});
      swatchRaster=await requestGemini({image:input.image,inputCrop:input.crop,provider:s.imageProvider,model:s.geminiModel,promptMode:s.promptMode,style:SWATCH_STYLE},controller.signal);
      if(swatchRaster.telemetryWarning)$('notice').textContent=swatchRaster.telemetryWarning;
      showSwatch();controller.signal.throwIfAborted();
      const panels=await splitSwatch(swatchRaster,controller.signal);
      panels.forEach((raster,i)=>{batchJobs[i].raster=raster;});
      await Promise.allSettled(batchJobs.map(job=>runBatchJob(job,s,controller.signal)));
    }else await Promise.allSettled(batchJobs.map(job=>runBatchJob(job,s,controller.signal,input)));
  }catch(error){
    if(batchJobs)for(const job of batchJobs)if(job.state==='generating'){
      job.state=controller.signal.aborted?'canceled':'error';job.error=error.message;job.message.textContent=error.message;
    }
    status(controller.signal.aborted?'Drawing canceled.':error.message,true);
  }
  finally{cancelDrawing=null;$('cancel').disabled=true;lock(false);}
}
$('allPrompts').onclick=()=>runPromptBatch(PROMPT_PRESETS,'All Prompts','all-prompts');
$('prodPen').onclick=()=>runPromptBatch(PROD_PEN_PROMPT_PRESETS,'Prod Pen Treatment','prod-pen-treatment');
$('prodSwatch').onclick=()=>runPromptBatch(PROD_PROMPT_PRESETS,'Prod Swatch Experiment','prod-swatch-experiment',{swatch:true});
$('cancel').onclick=()=>cancelDrawing?.();
$('downloadAll').onclick=()=>{
  if(batchJobs){
    const files={};
    for(const job of batchJobs){
      const prefix=job.id+'/';
      for(const result of job.exports||[])if(result.strokes)files[prefix+result.id+'.svg']=strToU8(result.svg);
      if(job.raster){
        files[prefix+'line-art.png']=imageBytes(job.raster.image);
        if(job.raster.sourceImage)files[prefix+'reference.png']=imageBytes(job.raster.sourceImage);
        const {image,sourceImage,...metadata}=job.raster;
        files[prefix+'generation.json']=strToU8(JSON.stringify(metadata,null,2));
      }
      files[prefix+'settings.json']=strToU8(JSON.stringify({...job.settings,routePreference:job.routePreference||job.cards?.__preference||'balanced',studies:studyMetadata(job.exports||[])},null,2));
    }
    files['batch.json']=strToU8(JSON.stringify(batchJobs.map(({id,label,state,error})=>({id,label,state,error})),null,2));
    files['batch-info.json']=strToU8(JSON.stringify({name:batchName,promptOrder:batchJobs.map(j=>j.id),provider:batchJobs.find(j=>j.raster)?.raster.provider||'gemini',imageRequestsRequested:batchFile==='prod-swatch-experiment'?1:batchJobs.length,geminiRequestsRequested:savedGeminiRequests()},null,2));
    if(swatchRaster){
      files['swatch.png']=imageBytes(swatchRaster.image);
      files['reference.png']=imageBytes(swatchRaster.sourceImage);
      const {image,sourceImage,...metadata}=swatchRaster;
      files['swatch-generation.json']=strToU8(JSON.stringify(metadata,null,2));
      files['swatch-prompt.txt']=strToU8(swatchRaster.prompt);
    }
    download(new Blob([zipSync(files)],{type:'application/zip'}),batchFile+'.zip');return;
  }
  const files=Object.fromEntries(exports.filter(r=>r.strokes).map(r=>[`${r.id}.svg`,strToU8(r.svg)]));
  files['settings.json']=strToU8(JSON.stringify({...lastSettings,routePreference:$('gallery').__preference||'balanced',studies:studyMetadata(exports)},null,2));
  if(exportRaster){
    files['line-art.png']=imageBytes(exportRaster.image);
    if(exportRaster.sourceImage)files['reference.png']=imageBytes(exportRaster.sourceImage);
    const {image,sourceImage,...metadata}=exportRaster;files['generation.json']=strToU8(JSON.stringify(metadata,null,2));
  }
  files['README.txt']=strToU8('Plotter Caricature comparison. SVGs contain stroke-only polylines, no embedded raster or clipping. Each path has one move command. Continuous styles can include visible bridges/baselines. Blank studies omitted. Length is pen-down distance, not plotting time. No G-code included.');
  download(new Blob([zipSync(files)],{type:'application/zip'}),'plotter-caricature-studies.zip');
};
function savedGeminiRequests(){return batchJobs?.some(j=>j.raster?.provider==='mai')?0:batchFile==='prod-swatch-experiment'?1:batchJobs?.length||0;}
function studyMetadata(drawings){return drawings.map(({id,strokes,lengthMm,vertices,optimization,routing,repair,plotterOptimization})=>({id,strokes,lengthMm,vertices,optimization,routing,repair,plotterOptimization}));}
for(const id of settingIds) $(id).addEventListener('change',()=>{if(id==='promptMode')status('Prompt mode changed. Generate again to apply it to a new image or swatch.');else if(exports.length)status('Settings changed. Retrace or generate again to update the drawings.');});
$('closeLightbox').onclick=()=>$('lightbox').close();
window.addEventListener('pagehide',()=>{stopCamera();worker?.terminate();models?.face?.close();});

async function finishGeminiTrace(s,signal){
  W=H=s.resolution;
  status('Extracting pen paths from the saved PNG locally…');
  const results=await traceLineart(geminiRaster,s,signal,status);
  const {image,sourceImage,...metadata}=geminiRaster;
  lastSettings={...s,collection:'image-portraits',drawingWidth:W,drawingHeight:H,generation:metadata,created:new Date().toISOString()};
  exportRaster=geminiRaster;exports=render(results,s);
  const preferred=selectPreferred(exports,$('gallery').__preference||'balanced',s);
  status(`${results.filter(r=>r.paths.length).length} studies ready. Preferred route: ${preferred?.strokes??0} strokes, ${preferred?retraceText(preferred):'0.0'} mm planned retracing. Every SVG has vpype cleanup.`);
}
$('retraceGemini').onclick=async()=>{
  if(batchJobs){
    const s=drawingSettings();if(!s||busy)return;
    const jobs=batchJobs.filter(j=>j.raster);if(!jobs.length)return;
    lock(true);const controller=new AbortController();cancelDrawing=()=>controller.abort();$('cancel').disabled=false;
    try{
      for(const job of jobs){job.exports=[];job.error=null;job.cards.replaceChildren();job.message.classList.remove('error');job.state='tracing';}
      exports=[];
      await Promise.allSettled(jobs.map(job=>runBatchJob(job,s,controller.signal)));
    }finally{cancelDrawing=null;$('cancel').disabled=true;lock(false);}
    return;
  }
  if(!geminiRaster)return;
  if(settingIds.some(id=>!$(id).checkValidity()))return status('Check the drawing controls before retracing.',true);
  lock(true);const controller=new AbortController();cancelDrawing=()=>controller.abort();$('cancel').disabled=false;
  try{await finishGeminiTrace(settings(),controller.signal);}catch(error){status(error.name==='AbortError'?'Tracing canceled.':error.message,true);}finally{cancelDrawing=null;$('cancel').disabled=true;lock(false);}
};
$('downloadGeminiPng').onclick=()=>{if(geminiRaster)download(new Blob([imageBytes(geminiRaster.image)],{type:'image/png'}),'line-art.png');};
$('lineartUpload').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;const url=URL.createObjectURL(file);
  try{const imported=await asPng(url);clearResults();geminiRaster={...imported,id:crypto.randomUUID(),provider:'local',sourceName:file.name,created:new Date().toISOString(),imported:true};lock(false);status('Line-art PNG loaded. Click Retrace saved PNG to create SVGs locally.');}
  catch{status('Unable to read this line-art PNG.',true);}finally{URL.revokeObjectURL(url);event.target.value='';}
};
const providerModels={gemini:[['gemini-3-pro-image','Gemini 3 Pro Image'],['gemini-3.1-flash-image','Gemini 3.1 Flash Image'],['gemini-2.5-flash-image','Gemini 2.5 Flash Image']],mai:[['microsoft/mai-image-2.6','MAI-Image-2.6 (OpenRouter)']]};
async function updateProvider(){
 const provider=$('imageProvider').value;
 $('geminiModel').replaceChildren(...providerModels[provider].map(([value,label])=>new Option(label,value)));
 $('geminiStatus').textContent='Checking provider configuration…';
 try{const response=await fetch(`/api/${provider}/health`);if(!response.ok)throw new Error();const h=await response.json();if($('imageProvider').value!==provider)return;
  $('geminiStatus').textContent=h.configured?`${providerLabel()} configured on the local server.`:h.message||(provider==='mai'?'Set OPENROUTER_API_KEY in .env.local.':'Set GEMINI_API_KEY in .env.local to generate images. Local PNG tracing remains available.');
 }catch{if($('imageProvider').value===provider)$('geminiStatus').textContent='Start the local server to use image generation.';}
}
$('imageProvider').onchange=updateProvider;void updateProvider();
$('downloadActivity').onclick=async()=>{
 try{const response=await fetch('/api/telemetry/export');if(!response.ok)throw new Error('Could not read local activity.');download(await response.blob(),'plotter-activity.jsonl');}
 catch(error){status(error.message,true);}
};
