import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {PROMPT_PRESETS,PROD_PROMPT_PRESETS,SWATCH_STYLE,SWATCH_LAYOUT} from '../src/prompt-presets.js';
import {USER_PROMPTS} from './user-prompts.mjs';

export const IMAGE_MODELS=['gemini-3.1-flash-image','gemini-3-pro-image','gemini-2.5-flash-image'];
export const PORTRAIT_PROMPT=`Use the attached photograph as a fixed positional reference for an observational pen sketch of this exact person. Preserve identity, head pose, expression, facial proportions, asymmetry, eye spacing, nose and mouth position, jaw shape, hair silhouette and any glasses. Keep the same framing, scale and margins. All artistic freedom is in the pen's movement and choice of marks; do not redesign, beautify, symmetrize or caricature the face.
Make this feel like an artist looking closely at the person while drawing freely with a pen. A convincing gesture matters more than a complete inventory of anatomy. Let partial open contours suggest eyes and lips. Follow the actual edges of the face, glasses if present, brows, nose, mouth and hair. Never insert a stock eye symbol, geometric nose, or a perfect outlined lip shape. Keep white space and visual breathing room.
Use one assertive, uniform black pen on a pure white background: constant stroke width and constant ink darkness throughout the entire drawing. Approximately 3 pixels wide at 1024-pixel image size, with a solid opaque black core that reads strongly at a small viewing size. Normal edge antialiasing is fine, but no gray or faint strokes, opacity variation, tapering, pressure variation, dry-brush gaps, dotted lines, or fuzzy pencil texture. Every intended stroke must remain visibly connected from end to end, including through turns and intersections. The gesture comes from the route of the pen, not changes in its strength. The line may meander, overlap and double back, but the face must stay aligned to the photograph. No shading, solid black areas, text, paper texture or background. Avoid coloring-book outlines, comic illustration, smooth vector-logo styling, repetitive decorative curls, dense hatching, outlining every tooth, rings around every feature, or a bold closed border around the head. Return one finished sketch image.`;
const STYLE={
 gestural:'CONTINUOUS GESTURE: Use the fewest pen strokes possible, ideally one continuous journey. Draw only the most important open contours and strong accents; leave weak details out and let white space carry the likeness. Keep the face aligned to the reference while allowing a loose, hand-drawn route with selective retracing. Avoid complete outlines, repeated hair strands, geometric eyes, perfect lips, correction marks and connectors through empty space.',
 continuous:'ONE WANDERING LINE: Aim for one unbroken, thin, wandering ink line that describes the portrait through connected loops, returning gestures and retracing. A few overlaps are welcome. Make a spare, fluid contour drawing with large white spaces, retaining the precise eye, nose, mouth and jaw placement from the reference. Use only enough hair and smile marks to retain the likeness. Do not draw every detail or complete every contour. Avoid straight connectors slicing through empty cheeks. Anatomical proportions take priority over a decorative loop; do not distort the face to connect the line.',
 faithful:'OPEN OBSERVATIONAL CONTOURS: Use a modest number of open, hand-drawn contour gestures from the photograph. Short pen lifts are allowed. Retain measured feature placement while leaving weak edges unfinished and hair loosely suggested.',
 detailed:'LAYERED GESTURE: Start with long continuous observational contours, then add a few loose overlapping strokes at the strongest contrasts. Preserve hair shape and facial details through selective pen movement. Keep all features open and unpolished; avoid a fully outlined illustration.'
};
const SPARSE_PROMPTS={
 ...USER_PROMPTS,
 'sparse-five':'Create a continuous line sketch with a single-value black line on white. The sketch should be accurate to the picture provided and line up perfectly when overlaid, but be very sparse and gestural, artistic in how it is rendered. The eyes, mouth, nose and face outline are the most important areas to capture; ignore the background. It is CRITICAL that the sketch not exceed around 5 strokes.',
 'sparse-hair':'Draw a very sparse, gestural continuous-line portrait that aligns exactly with the reference photograph: keep the pose, proportions and feature positions. Use at most about five long pen strokes in total, prioritizing the eyes, nose, mouth and face outline, with hair suggested only by one open outer silhouette; leave the entire hair interior white, with no strands, curls, hatching or shading. Use a single constant-width, solid black line on white, omit the background, and let artistic freedom come from the pen movement and omitted details.',
 'sparse-face':'Make a spare observational line portrait in no more than about five flowing strokes, with a single uniform black pen on white. Match the reference framing, pose and proportions exactly, placing the eyes, glasses if present, nose, mouth and jaw so they align when overlaid, and leave contours open wherever the likeness survives. Spend almost all the marks on those facial features, suggest hair with at most one brief outer gesture, and leave out background, individual hairs, teeth, shading and decorative loops.',
 'sparse-connected':'Create a very sparse, expressive continuous-line portrait that matches the photograph\'s framing, pose, proportions and feature positions so it aligns when overlaid. Use at most around five long uninterrupted pen strokes, each a confident flowing journey between the eyes, glasses if present, nose, mouth and jaw, allowing brief retracing along observed contours to keep the pen moving. Suggest the hair with one broad outer gesture and an empty interior; suggest the smile without drawing individual teeth, and leave out background and minor details. Use one constant-width solid black pen on pure white: every drawn stroke must stay connected from start to finish, with no dashed or broken marks, fading, tapering, shading, decorative loops or geometric facial symbols; create the gesture through sweeping movement and selective omission, never by fragmenting the line.',
};
const ARCHIVE_GESTURE='CONTINUOUS GESTURE: Aim for 5 to 15 actual continuous pen strokes TOTAL for the whole portrait, preferably around 8. Plan each stroke as a long unbroken journey before drawing it. Do not add detached accents, tiny correction marks, individual hairs, dots, or short hatching strokes. Let one gesture discover an eyebrow, turn around an eye, travel beside the nose, revisit the mouth and sweep into the jaw or hair. Use restrained overlaps and retracing to connect these journeys along observed contours. Preserve likeness through the exact placement and shape of the key contours; simplify the number of marks, never the facial proportions. Suggest the entire hair silhouette with one or two broad directional gestures. Suggest the smile through its observed opening, not individual teeth or closed lip symbols. Let unfinished contours and confident sweeping movement carry the gesture. Avoid parallel outlines that repeat the same boundary without adding identity. Aim for the energy of a 30-second observational life drawing with one constant-width pen. Do not polish it into a cartoon. Before returning the image, check that it reads as roughly 5-15 long continuous strokes rather than dozens of short fragments.';
export function portraitPrompt(style){
 if(style===SWATCH_STYLE)return swatchPrompt();
 if(Object.hasOwn(SPARSE_PROMPTS,style))return SPARSE_PROMPTS[style];
 if(style==='sparse-previous')return PORTRAIT_PROMPT+'\n'+STYLE.gestural+'\nKeep the entire portrait to around five strokes or fewer. Hair needs only one open silhouette gesture, with its interior completely white: no individual strands, texture, repeated curls or hatching.';
 if(style==='archive-five-fifteen')return PORTRAIT_PROMPT.replace('one assertive, uniform black pen','one uniform black pen').replace('Approximately 3 pixels wide at 1024-pixel image size, with a solid opaque black core that reads strongly at a small viewing size.','Approximately 2 pixels wide at 1024-pixel image size, with an opaque black core.')+'\n'+ARCHIVE_GESTURE;
 if(Object.hasOwn(STYLE,style))return PORTRAIT_PROMPT+'\n'+STYLE[style];
 throw new Error('Unknown portrait treatment.');
}
export function swatchPrompt(){
 const positions=['top left','top middle','top right','bottom left','bottom middle','bottom right'];
 return `Create ONE image containing six separate sketches of the SAME person in the attached color photograph. Use a strict 3-column by 2-row grid of six equal square cells on a white 3:2 landscape canvas, filling the canvas with no outer title or extra page margins. The cell order is A, F, B across the top and C, G, H across the bottom.
Apply the individual prompt below only to its assigned cell; do not combine all six prompts into one portrait or copy one drawing six times. In every cell use the attached photo as the same fixed positional reference, with the same pose, proportions and framing. Fit the complete reference composition uniformly inside the central 90% of each cell, keeping a completely white 5% margin on every side so no stroke crosses a cell boundary. Any stroke-width instruction is relative to a 1024px-wide CELL, not the whole sheet.
Do not draw grid lines, panel borders, letters, labels, numbers, captions, signatures or decorations. The cell names below are routing instructions only; the final image must contain only the six black-on-white portraits.

${PROD_PROMPT_PRESETS.map((p,i)=>`CELL ${i+1}: ${p.label[0]} (${positions[i]})\nBEGIN INDIVIDUAL PROMPT\n${portraitPrompt(p.id)}\nEND INDIVIDUAL PROMPT`).join('\n\n')}`;
}
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
export async function generateGemini({image,model=IMAGE_MODELS[0],style='gestural',inputCrop}, {key,signal,fetchImpl=fetch}){
 if(!key)throw new Error('Set GEMINI_API_KEY in .env.local on the local server.');
 if(!IMAGE_MODELS.includes(model))throw new Error('Unsupported Gemini image model.');
 const png=parsePng(image),prompt=portraitPrompt(style);
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
 return {image:`data:${output.mimeType};base64,${output.data}`,model,style,prompt,inputCrop,created:new Date().toISOString(),usage:payload.usageMetadata||null,
  ...(swatch?{swatch:{...SWATCH_LAYOUT,imageConfig:generationConfig.imageConfig,panels:PROD_PROMPT_PRESETS.map(p=>({...p,prompt:portraitPrompt(p.id)}))}}:{})};
}
export function geminiApi(root,{generate=generateGemini,readKey=geminiKey}={}){
 const active=new Set();
 return async(req,res,next)=>{
  if(!req.url?.startsWith('/api/gemini'))return next();
  const reply=(code,data)=>{if(!res.destroyed){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
  const host=req.headers.host||'';
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)||req.headers.origin&&req.headers.origin!==`http://${host}`)return reply(403,{error:'Local same-origin API only.'});
  if(req.url==='/api/gemini/health'&&req.method==='GET')return reply(200,{configured:!!await readKey(root),models:IMAGE_MODELS,busy:active.size>0,active:active.size,swatchSupported:true,prodPromptOrder:PROD_PROMPT_PRESETS.map(p=>p.id)});
  const isReference=req.url==='/api/gemini/reference';
  if((req.url!=='/api/gemini/generate'&&!isReference)||req.method!=='POST')return reply(405,{error:'POST /api/gemini/generate or /api/gemini/reference required.'});
  if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required.'});
  if(active.size>=PROMPT_PRESETS.length&&!isReference)return reply(429,{error:'All Gemini generation slots are occupied. Wait for this batch to finish.'});
  let size=0,chunks=[];
  try{for await(const chunk of req){size+=chunk.length;if(size>17*1024*1024)return reply(413,{error:'Image request too large.'});chunks.push(chunk);}}catch{return;}
  let input;
  try{input=JSON.parse(Buffer.concat(chunks).toString());parsePng(input.image);if(!isReference){if(!IMAGE_MODELS.includes(input.model))throw new Error('Invalid model.');portraitPrompt(input.style);}}catch(error){return reply(400,{error:error.message});}
  if(isReference){
   try{
    const id=randomUUID(),folder=path.join(root,'.private','references',id);
    await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'reference.png'),parsePng(input.image).bytes);
    await writeFile(path.join(folder,'reference.json'),JSON.stringify({created:new Date().toISOString(),inputCrop:input.inputCrop},null,2));
    return reply(200,{id});
   }catch{return reply(500,{error:'Unable to save the color reference locally.'});}
  }
  if(active.size>=PROMPT_PRESETS.length)return reply(429,{error:'All Gemini generation slots are occupied. Wait for this batch to finish.'});
  const controller=new AbortController();active.add(controller);
  const timer=setTimeout(()=>controller.abort(),240000);
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  try{
   const result=await generate(input,{key:await readKey(root),signal:controller.signal});
   // Private recovery copy; this directory is excluded from Git AND HTTP serving.
   const id=randomUUID(),folder=path.join(root,'.private','gemini',id);
   await mkdir(folder,{recursive:true});
   await writeFile(path.join(folder,'reference.png'),parsePng(input.image).bytes);
   const ext=result.image.startsWith('data:image/png;')?'png':result.image.startsWith('data:image/jpeg;')?'jpg':'webp';
   await writeFile(path.join(folder,`line-art.${ext}`),Buffer.from(result.image.split(',')[1],'base64'));
   const {image,...metadata}=result;await writeFile(path.join(folder,'generation.json'),JSON.stringify(metadata,null,2));
   reply(200,{...result,id});
  }catch(error){reply(controller.signal.aborted?504:502,{error:controller.signal.aborted?'Gemini request canceled or timed out.':String(error.message).replaceAll(await readKey(root)||'__NO_KEY__','[redacted]')});}
  finally{clearTimeout(timer);active.delete(controller);}
 };
}
