import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {activityContext,tryRecordActivity} from './telemetry.mjs';

const escape=value=>String(value).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
export function pageForInkscape({svg,penWidthMm=.45,name='Portrait'}){
 if(typeof svg!=='string'||svg.length>16*1024*1024)throw new Error('Expected a plotter SVG under 16 MB.');
 if(!Number.isFinite(penWidthMm)||penWidthMm<.05||penWidthMm>3)throw new Error('Invalid pen width.');
 // Read only the M/L geometry that this app exports, never executable SVG,
 // external references, transforms or user-selected filesystem paths.
 const paths=[];let vertices=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const tag of svg.matchAll(/<path\b[^>]*>/g)){
  const d=/\bd="([^"]*)"/.exec(tag[0])?.[1];
  if(!d||!/^M[-+\d.eE,\s]+(?:L[-+\d.eE,\s]+)+$/.test(d))throw new Error('Use a stroke-only SVG exported by this app.');
  const points=d.trim().split(/[ML]/).slice(1).map(pair=>{
   const p=pair.trim().split(/[,\s]+/).map(Number);
   if(p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))throw new Error('Invalid SVG coordinates.');
   minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);return p;
  });
  vertices+=points.length;if(vertices>500000)throw new Error('Drawing is too large to open.');paths.push(points);
 }
 if(!paths.length||maxX===minX&&maxY===minY)throw new Error('This SVG has no drawable strokes.');
 const width=127,height=177.8,margin=6.35;
 const scale=Math.min(maxX>minX?(width-2*margin-penWidthMm)/(maxX-minX):Infinity,maxY>minY?(height-2*margin-penWidthMm)/(maxY-minY):Infinity);
 const offsetX=(width-(maxX-minX)*scale)/2,offsetY=(height-(maxY-minY)*scale)/2;
 const ink=paths.map(points=>'<path d="'+points.map(([x,y],i)=>`${i?'L':'M'}${((x-minX)*scale+offsetX).toFixed(4)},${((y-minY)*scale+offsetY).toFixed(4)}`).join(' ')+'"/>').join('\n');
 const color=/\bstroke="(#[0-9a-fA-F]{6}|black)"/.exec(svg)?.[1]||'#000000';
 return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="5in" height="7in" viewBox="0 0 127 177.8"><title>${escape(String(name).slice(0,160))}</title><desc>Centered on a 5 by 7 inch portrait page with quarter-inch margins; aspect ratio and physical pen width preserved.</desc><g fill="none" stroke="${color}" stroke-width="${penWidthMm}" stroke-linecap="round" stroke-linejoin="round">${ink}</g></svg>`;
}
export function findInkscape(){
 const candidates=[process.env.INKSCAPE_PATH,...[process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean).flatMap(p=>[path.join(p,'Inkscape','bin','inkscape.exe'),path.join(p,'Inkscape','inkscape.exe')]),process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs','Inkscape','bin','inkscape.exe')].filter(Boolean);
 const found=candidates.find(p=>existsSync(p));
 if(found)return found;
 if(process.platform!=='win32')return 'inkscape';
 throw new Error('Inkscape was not found. Set INKSCAPE_PATH to its executable and restart the local app.');
}
export async function openInInkscape(input,root,{executable,launch=spawn}={}){
 const svg=pageForInkscape(input),folder=path.join(root,'.private','inkscape');
 await mkdir(folder,{recursive:true});
 const name=String(input.name||'portrait').replace(/[^a-z0-9_-]+/gi,'-').slice(0,70)||'portrait';
 const id=randomUUID(),created=new Date().toISOString();
 const file=path.join(folder,`${created.replace(/[:.]/g,'-')}-${name}-5x7-${id}.svg`);
 await writeFile(file,svg,'utf8');
 const context=activityContext({...input.context,drawingName:input.context?.drawingName||input.name||'Portrait'}),metadataFile=file.replace(/\.svg$/,'.json');
 const metadata={id,created,file,context,name:String(input.name||'Portrait').slice(0,160),penWidthMm:input.penWidthMm??.45,pageWidthIn:5,pageHeightIn:7,marginIn:.25};
 let telemetryWarning;
 const save=async status=>{
  try{await writeFile(metadataFile,JSON.stringify({...metadata,status,updated:new Date().toISOString()},null,2));}
  catch{telemetryWarning='Inkscape SVG saved, but its activity sidecar could not be written.';}
  telemetryWarning=await tryRecordActivity(root,status,{openId:id,file,context})||telemetryWarning;
 };
 await save('inkscape_open_requested');
 try{
 executable??=findInkscape();
 await new Promise((resolve,reject)=>{
  const child=launch(executable,['--with-gui',file],{shell:false,windowsHide:true,detached:true,stdio:'ignore'});
  let timer;
  child.once('error',error=>{clearTimeout(timer);reject(new Error(`Could not start Inkscape: ${error.message}`));});
  child.once('spawn',()=>{timer=setTimeout(()=>{child.unref();resolve();},700);});
  child.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error(`Inkscape exited with code ${code}. The SVG was saved at ${file}`));});
 });
 }catch(error){await save('inkscape_open_failed');throw new Error(`${error.message} Saved SVG: ${file}${telemetryWarning?'. '+telemetryWarning:''}`);}
 await save('inkscape_opened');
 return {file,metadataFile,openId:id,created,pageWidthIn:5,pageHeightIn:7,marginIn:.25,telemetryWarning};
}
export function inkscapeApi(root){
 return async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const host=req.headers.host||'';
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)||req.headers.origin&&req.headers.origin!==`http://${host}`)return reply(403,{error:'Local same-origin requests only.'});
  if(req.url!=='/api/inkscape/open'||req.method!=='POST')return reply(405,{error:'POST /api/inkscape/open required.'});
  if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required.'});
  try{
   const chunks=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;if(bytes>20*1024*1024)return reply(413,{error:'Drawing is too large.'});chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString());pageForInkscape(input);}catch(error){return reply(400,{error:error.message});}
   reply(200,await openInInkscape(input,root));
  }catch(error){reply(500,{error:error.message});}
 };
}
