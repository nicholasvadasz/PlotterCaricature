import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {PROMPT_PRESETS,PROD_PROMPT_PRESETS,SWATCH_STYLE,SWATCH_LAYOUT} from '../src/prompt-presets.js';
import {tryRecordActivity} from './telemetry.mjs';

export const IMAGE_MODELS=['gemini-3.1-flash-image','gemini-3-pro-image','gemini-2.5-flash-image'];
const PROMPT_SNAPSHOT=JSON.parse(await readFile(new URL('../prompt-archive/feature-fidelity-v1.json',import.meta.url),'utf8'));
const LINE_SNAPSHOT=JSON.parse(await readFile(new URL('../prompt-archive/line-minimization-v1.json',import.meta.url),'utf8'));
const SNAPSHOTS={'fidelity':PROMPT_SNAPSHOT,'line-minimization':LINE_SNAPSHOT};
function promptSnapshot(mode='line-minimization'){
 if(!Object.hasOwn(SNAPSHOTS,mode))throw new Error('Unknown prompt mode.');
 return SNAPSHOTS[mode];
}
export function promptVersion(mode='line-minimization'){return promptSnapshot(mode).version;}
// The snapshot was captured immediately after the eye/expression fidelity edit.
// Recover the shared base and original gesture from D, without its extra hair rule.
const previous= PROMPT_SNAPSHOT.treatments['sparse-previous'];
export const PORTRAIT_PROMPT=previous.slice(0,previous.indexOf('\nCONTINUOUS GESTURE:'));
export const REFERENCE_FIDELITY_PROMPT=PORTRAIT_PROMPT.slice(0,PORTRAIT_PROMPT.indexOf('\n\nLINE TREATMENT:'));
const LEGACY_STYLE={
 gestural:previous.slice(PORTRAIT_PROMPT.length+1,previous.lastIndexOf('\nAim for around five strokes,')),
 continuous:'ONE WANDERING LINE: Aim for one unbroken, thin, wandering ink line that describes the portrait through connected loops, returning gestures and retracing. A few overlaps are welcome. Make a spare, fluid contour drawing with large white spaces, retaining the precise eye, nose, mouth and jaw placement from the reference. Use only enough hair and observed mouth contours to retain the likeness and exact expression. Do not draw every detail or complete every contour. Avoid straight connectors slicing through empty cheeks. Anatomical proportions take priority over a decorative loop; do not distort the face to connect the line.',
 faithful:'OPEN OBSERVATIONAL CONTOURS: Use a modest number of open, hand-drawn contour gestures from the photograph. Short pen lifts are allowed. Retain measured feature placement while leaving weak edges unfinished and hair loosely suggested.',
 detailed:'LAYERED GESTURE: Start with long continuous observational contours, then add a few loose overlapping strokes at the strongest contrasts. Preserve hair shape and facial details through selective pen movement. Keep all features open and unpolished; avoid a fully outlined illustration.'
};
const linePrevious=LINE_SNAPSHOT.treatments['sparse-previous'];
const LINE_BASE=linePrevious.slice(0,linePrevious.lastIndexOf('\nCONTINUOUS GESTURE:'));
const LINE_LEGACY_STYLE={...LEGACY_STYLE,
 gestural:linePrevious.slice(LINE_BASE.length+1,linePrevious.lastIndexOf('\nAim for around five strokes,')),
 faithful:'OPEN OBSERVATIONAL CONTOURS: Use two to five long, connected hand-drawn journeys. Keep related facial contours in the same flowing path when they meet naturally. Use separate short contours only when joining them would change the photograph. Retain measured feature placement while leaving weak edges unfinished and hair loosely suggested.',
 detailed:'LAYERED GESTURE: Start with two to five long continuous observational contours that carry the important features. Retrace real ink when it helps continue a journey. Add separate accents only where an identity-bearing feature cannot be represented accurately in the main routes. Preserve hair shape and facial details through selective pen movement. Keep features open and unpolished; avoid separate complete outlines and a fully outlined illustration.'
};
export function portraitPrompt(style,mode='line-minimization'){
 const snapshot=promptSnapshot(mode);
 if(style===SWATCH_STYLE)return snapshot.swatch;
 if(Object.hasOwn(snapshot.treatments,style))return snapshot.treatments[style];
 if(Object.hasOwn(LEGACY_STYLE,style))return mode==='fidelity'?PORTRAIT_PROMPT+'\n'+LEGACY_STYLE[style]:LINE_BASE+'\n'+LINE_LEGACY_STYLE[style];
 throw new Error('Unknown portrait treatment.');
}
export function swatchPrompt(mode='line-minimization'){return promptSnapshot(mode).swatch;}
export async function geminiKey(root){
 if(process.env.GEMINI_API_KEY)return process.env.GEMINI_API_KEY.trim();
 try{return parseEnv(await readFile(path.join(root,'.env.local'),'utf8')).GEMINI_API_KEY?.trim()||'';}catch{return '';}
}
export function parsePng(dataUrl){
 if(typeof dataUrl!=='string'||dataUrl.length>16*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl))throw new Error('Expected a PNG data URL under 12 MB.');
 const bytes=Buffer.from(dataUrl.split(',')[1],'base64');
 if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid PNG header.');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 if(width<32||height<32||width>4096||height>4096)throw new Error('PNG dimensions must be 32–4096 pixels.');
 return {bytes,width,height,data:bytes.toString('base64')};
}
export async function generateGemini({image,model=IMAGE_MODELS[0],style='gestural',inputCrop,promptMode='line-minimization'}, {key,signal,fetchImpl=fetch}){
 if(!key)throw new Error('Set GEMINI_API_KEY in .env.local on the local server.');
 if(!IMAGE_MODELS.includes(model))throw new Error('Unsupported Gemini image model.');
 const png=parsePng(image),prompt=portraitPrompt(style,promptMode);
 const swatch=style===SWATCH_STYLE;
 const generationConfig={responseModalities:['TEXT','IMAGE']};
 if(swatch)generationConfig.imageConfig={aspectRatio:SWATCH_LAYOUT.aspectRatio,
  ...(model==='gemini-2.5-flash-image'?{}:{imageSize:'4K'})};
 const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
  method:'POST',signal,headers:{'Content-Type':'application/json','x-goog-api-key':key},
  body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/png',data:png.data}}]}],generationConfig})
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok){const detail=String(payload.error?.message||response.statusText).replaceAll(key,'[redacted]').slice(0,800);throw new Error(`Gemini ${response.status}: ${detail}`);}
 const parts=payload.candidates?.[0]?.content?.parts||[];
 const output=parts.filter(p=>!p.thought&&p.inlineData?.mimeType?.startsWith('image/')).at(-1)?.inlineData;
 if(!output){const reason=payload.promptFeedback?.blockReason||payload.candidates?.[0]?.finishReason||'no image returned';throw new Error(`Gemini returned no image (${reason}). Try another treatment or model.`);}
 if(!['image/png','image/jpeg','image/webp'].includes(output.mimeType)||output.data.length>32*1024*1024)throw new Error('Unsupported or oversized Gemini image response.');
 return {image:`data:${output.mimeType};base64,${output.data}`,model,style,prompt,promptMode,promptVersion:promptVersion(promptMode),inputCrop,created:new Date().toISOString(),usage:payload.usageMetadata||null,
  ...(swatch?{swatch:{...SWATCH_LAYOUT,imageConfig:generationConfig.imageConfig,panels:PROD_PROMPT_PRESETS.map(p=>({...p,prompt:portraitPrompt(p.id,promptMode)}))}}:{})};
}
export function geminiApi(root,{generate=generateGemini,readKey=geminiKey,provider='gemini',models=IMAGE_MODELS,readConfig=async root=>({key:await readKey(root)})}={}){
 const active=new Set();
 const base=`/api/${provider}`,label=provider==='mai'?'MAI':'Gemini';
 return async(req,res,next)=>{
  if(!req.url?.startsWith(base))return next();
  const reply=(code,data)=>{if(!res.destroyed){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
  const host=req.headers.host||'';
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)||req.headers.origin&&req.headers.origin!==`http://${host}`)return reply(403,{error:'Local same-origin API only.'});
  if(req.url===base+'/health'&&req.method==='GET'){
   const config=await readConfig(root);
   return reply(200,{provider,configured:config.configured??!!config.key,message:config.error,models,busy:active.size>0,active:active.size,swatchSupported:true,prodPromptOrder:PROD_PROMPT_PRESETS.map(p=>p.id)});
  }
  const isReference=req.url===base+'/reference';
  if((req.url!==base+'/generate'&&!isReference)||req.method!=='POST')return reply(405,{error:`POST ${base}/generate or ${base}/reference required.`});
  if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required.'});
  if(active.size>=PROMPT_PRESETS.length&&!isReference)return reply(429,{error:`All ${label} generation slots are occupied. Wait for this batch to finish.`});
  let size=0,chunks=[];
  try{for await(const chunk of req){size+=chunk.length;if(size>17*1024*1024)return reply(413,{error:'Image request too large.'});chunks.push(chunk);}}catch{return;}
  let input;
  try{input=JSON.parse(Buffer.concat(chunks).toString());parsePng(input.image);if(!isReference){if(!models.includes(input.model))throw new Error('Invalid model.');portraitPrompt(input.style,input.promptMode);}}catch(error){return reply(400,{error:error.message});}
  if(isReference){
   try{
    const id=randomUUID(),folder=path.join(root,'.private','references',id);
    await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'reference.png'),parsePng(input.image).bytes);
    await writeFile(path.join(folder,'reference.json'),JSON.stringify({created:new Date().toISOString(),inputCrop:input.inputCrop},null,2));
    return reply(200,{id});
   }catch{return reply(500,{error:'Unable to save the color reference locally.'});}
  }
  if(active.size>=PROMPT_PRESETS.length)return reply(429,{error:`All ${label} generation slots are occupied. Wait for this batch to finish.`});
  const controller=new AbortController();active.add(controller);
  const timer=setTimeout(()=>controller.abort(),240000);
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  const id=randomUUID(),started=Date.now(),context={generationId:id,provider,model:input.model,style:input.style,promptMode:input.promptMode??'line-minimization',promptVersion:promptVersion(input.promptMode)};
  let config={};
  let telemetryWarning=await tryRecordActivity(root,'generation_started',{context});
  try{
   config=await readConfig(root);
   if(config.configured===false)throw new Error(config.error);
   const result={...await generate(input,{...config,signal:controller.signal}),provider};
   // Private recovery copy; this directory is excluded from Git AND HTTP serving.
   const folder=path.join(root,'.private',provider,id);
   await mkdir(folder,{recursive:true});
   await writeFile(path.join(folder,'reference.png'),parsePng(input.image).bytes);
   const ext=result.image.startsWith('data:image/png;')?'png':result.image.startsWith('data:image/jpeg;')?'jpg':'webp';
   await writeFile(path.join(folder,`line-art.${ext}`),Buffer.from(result.image.split(',')[1],'base64'));
   const {image,...metadata}=result;await writeFile(path.join(folder,'generation.json'),JSON.stringify({...metadata,id},null,2));
   telemetryWarning=await tryRecordActivity(root,'generation_completed',{context,durationMs:Date.now()-started})||telemetryWarning;
   reply(200,{...result,id,telemetryWarning});
  }catch(error){
   await tryRecordActivity(root,controller.signal.aborted?'generation_canceled':'generation_failed',{context,durationMs:Date.now()-started});
   reply(controller.signal.aborted?504:502,{error:controller.signal.aborted?`${label} request canceled or timed out.`:String(error.message).replaceAll(config.key||'__NO_KEY__','[redacted]')});
  }
  finally{clearTimeout(timer);active.delete(controller);}
 };
}
