import {portraitRequest} from './backend-client.js';

export async function asPng(dataUrl){
 const image=new Image();image.src=dataUrl;await image.decode();
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);
 return {image:canvas.toDataURL('image/png'),rasterWidth:canvas.width,rasterHeight:canvas.height};
}
export async function requestGemini(input,signal){
 const provider=input.provider==='mai'?'mai':'gemini';
 const r=await fetch(`/api/${provider}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(input)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||'Image request failed.');
 return {...result,...await asPng(result.image),sourceImage:input.image};
}
export function traceLineart(raster,settings,signal,progress){
 return portraitRequest({engine:'lineart',image:raster.image,width:settings.resolution,height:settings.resolution,paperWidth:settings.paperWidth,traceThreshold:settings.traceThreshold,traceMinLength:settings.traceMinLength,traceSmooth:settings.traceSmooth,traceStrokeTarget:settings.traceStrokeTarget,traceMergeGap:settings.traceMergeGap,traceSimplify:settings.traceSimplify,traceRepairGap:settings.traceRepairGap},signal,progress);
}
export function imageBytes(url){return Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));}
