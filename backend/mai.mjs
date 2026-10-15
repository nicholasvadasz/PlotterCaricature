import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import path from 'node:path';
import {parsePng,portraitPrompt,promptVersion} from './gemini.mjs';
import {SWATCH_STYLE,SWATCH_LAYOUT,PROD_PROMPT_PRESETS} from '../src/prompt-presets.js';

export const MAI_MODELS=['microsoft/mai-image-2.6'];
const IMAGE_ENDPOINT='https://openrouter.ai/api/v1/images';
export async function maiConfig(root){
 let local={};try{local=parseEnv(await readFile(path.join(root,'.env.local'),'utf8'));}catch{}
 const key=(process.env.OPENROUTER_API_KEY??local.OPENROUTER_API_KEY??'').trim();
 return {key,configured:!!key,error:key?undefined:'Set OPENROUTER_API_KEY in .env.local on the local server.'};
}
export async function generateMai({image,model=MAI_MODELS[0],style='gestural',inputCrop,promptMode='line-minimization'},{key,signal,fetchImpl=fetch}){
 if(!key)throw new Error('Set OPENROUTER_API_KEY in .env.local on the local server.');
 if(!MAI_MODELS.includes(model))throw new Error('Unsupported MAI image model.');
 parsePng(image);
 const prompt=portraitPrompt(style,promptMode),swatch=style===SWATCH_STYLE;
 const body={model,prompt,n:1,aspect_ratio:swatch?SWATCH_LAYOUT.aspectRatio:'auto',
  input_references:[{type:'image_url',image_url:{url:image}}],
  provider:{options:{azure:{web_grounding:false}}}};
 let response;
 try{response=await fetchImpl(IMAGE_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal,redirect:'error'});}
 catch(error){if(signal?.aborted)throw error;throw new Error('Could not reach OpenRouter. Check your connection.');}
 const payload=await response.json().catch(()=>({}));
 if(!response.ok||payload.error){
  const detail=String(payload.error?.message||response.statusText||'Request failed').replaceAll(key,'[redacted]').slice(0,800);
  const metadata=payload.error?.metadata;
  const moderation=/content[_ -]?(moderation|filter|policy)|moderation[_ -]?(blocked|error)/i.test(detail+' '+String(metadata?.error_type||''));
  if(moderation){
   // Show only documented reasons, never arbitrary upstream metadata or flagged input.
   const reasons=Array.isArray(metadata?.reasons)?metadata.reasons.filter(r=>typeof r==='string').slice(0,5).map(r=>r.replaceAll(key,'[redacted]').slice(0,200)).join('; '):'';
   throw new Error('OpenRouter MAI '+response.status+': '+detail+
    (reasons?' Provider reason: '+reasons+'.':' The provider did not supply a specific moderation reason.')+
    ' This is a content-filter rejection, not a key or quota error. If this ordinary portrait was flagged in error, report the request to OpenRouter support.');
  }
  const hint=response.status===401?' Check OPENROUTER_API_KEY.':response.status===402?' Check your OpenRouter credits.':response.status===429?' Reduce the batch size or check OpenRouter rate limits.':'';
  throw new Error('OpenRouter MAI '+response.status+': '+detail+hint);
 }
 const output=payload.data?.[0],data=output?.b64_json,mime=output?.media_type||'image/png';
 if(typeof data!=='string'||!data)throw new Error('OpenRouter MAI returned no image. Try another treatment or check the provider response.');
 if(!['image/png','image/jpeg','image/webp'].includes(mime)||data.length>32*1024*1024||! /^[A-Za-z0-9+/=]+$/.test(data))throw new Error('Unsupported or oversized OpenRouter image response.');
 const resultImage='data:'+mime+';base64,'+data;
 if(mime==='image/png')parsePng(resultImage);
 return {image:resultImage,provider:'mai',apiProvider:'openrouter',model,style,prompt,promptMode,promptVersion:promptVersion(promptMode),inputCrop,created:new Date().toISOString(),usage:payload.usage||null,
  ...(swatch?{swatch:{...SWATCH_LAYOUT,panels:PROD_PROMPT_PRESETS.map(p=>({...p,prompt:portraitPrompt(p.id,promptMode)}))}}:{})};
}
