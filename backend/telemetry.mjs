import {appendFile, mkdir, readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const queues=new Map();
export const telemetryPath=root=>path.join(root,'.private','telemetry','events.jsonl');
// Explicit fields only: never persist images, prompts, credentials or arbitrary request data.
export function activityContext(input={}){
 const out={};
 for(const key of ['generationId','provider','apiProvider','model','deployment','style','promptMode','promptVersion','drawingId','drawingName','routePreference','source','sourceName','traceId'])
  if(typeof input?.[key]==='string')out[key]=input[key].slice(0,200);
 for(const key of ['strokes','lengthMm','retracedMm','connectorMm','removedInkMm','originalInkMm','penUpMm','swatchPanel'])
  if(Number.isFinite(input?.[key]))out[key]=input[key];
 const settings={};
 for(const key of ['paperWidth','penWidth','resolution','drawSpeed','traceThreshold','traceMinLength','traceSmooth','traceRepairGap','traceMergeGap','traceSimplify','traceStrokeTarget'])
  if(Number.isFinite(input?.settings?.[key]))settings[key]=input.settings[key];
 if(Object.keys(settings).length)out.settings=settings;
 return out;
}
export async function recordActivity(root,event,data={}){
 const record={schemaVersion:1,id:randomUUID(),timestamp:new Date().toISOString(),event,...data};
 const file=telemetryPath(root);
 const pending=(queues.get(file)||Promise.resolve()).catch(()=>{}).then(async()=>{
  await mkdir(path.dirname(file),{recursive:true});
  await appendFile(file,JSON.stringify(record)+'\n','utf8');
 });
 queues.set(file,pending);
 try{await pending;return record;}finally{if(queues.get(file)===pending)queues.delete(file);}
}
export async function tryRecordActivity(root,event,data){
 try{await recordActivity(root,event,data);return null;}
 catch{return 'Activity log could not be saved. Check write access to .private/telemetry.';}
}
export function telemetryApi(root){
 return async(req,res)=>{
  const reply=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const host=req.headers.host||'';
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)||req.headers.origin&&req.headers.origin!==`http://${host}`)return reply(403,{error:'Local same-origin requests only.'});
  try{
   if(req.url==='/api/telemetry/export'&&req.method==='GET'){
    let data;try{data=await readFile(telemetryPath(root));}catch(error){if(error.code!=='ENOENT')throw error;data='';}
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','Content-Disposition':'attachment; filename="plotter-activity.jsonl"'});return res.end(data);
   }
   if(req.url!=='/api/telemetry/events'||req.method!=='POST')return reply(405,{error:'Unsupported activity endpoint.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required.'});
   const chunks=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;if(bytes>32768)return reply(413,{error:'Activity record too large.'});chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{return reply(400,{error:'Invalid JSON.'});}
   if(!['svg_download','route_preference_selected','trace_completed'].includes(input?.event))return reply(400,{error:'Unsupported activity event.'});
   const record=await recordActivity(root,input.event,{context:activityContext(input.context)});
   reply(200,{id:record.id,timestamp:record.timestamp});
  }catch{reply(500,{error:'Unable to save or read local activity.'});}
 };
}
