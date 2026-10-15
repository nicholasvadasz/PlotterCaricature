import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {geminiApi} from './gemini.mjs';
import {inkscapeApi} from './inkscape.mjs';
import {generateMai,maiConfig,MAI_MODELS} from './mai.mjs';
import {telemetryApi} from './telemetry.mjs';
import {PROMPT_PRESETS} from '../src/prompt-presets.js';
import {JobPool} from './job-pool.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=process.env.PLOTTER_PYTHON||path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
export function portraitBackend(){
  const gemini=geminiApi(root);
  const mai=geminiApi(root,{provider:'mai',models:MAI_MODELS,generate:generateMai,readConfig:maiConfig});
  const telemetry=telemetryApi(root);
  const inkscape=inkscapeApi(root);
  const active=new Set();
  const pool=new JobPool(PROMPT_PRESETS.length);
  let probe;
  const ready=()=>probe??=new Promise(resolve=>{
    if(!existsSync(python))return resolve(false);
    const child=spawn(python,['-c','import numpy, scipy, PIL, ortools, svgpathtools, vtracer, skimage, vpype'],{windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{child.kill();resolve(false);},15000);
    child.on('error',()=>{clearTimeout(timer);resolve(false);});child.on('close',code=>{clearTimeout(timer);resolve(code===0);});
  });
  function kill(child){
    if(!child?.pid)return;
    if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else {try{process.kill(-child.pid,'SIGTERM');}catch{}}
  }
  const middleware=async(req,res,next)=>{
    let pathname;try{pathname=decodeURIComponent((req.url||'').split('?')[0]).replaceAll('\\','/');}catch{res.writeHead(400);res.end();return;}
    if(pathname.split('/').some(p=>p==='.private'||p==='.env'||p.startsWith('.env.'))){res.writeHead(403);res.end('Private server file');return;}
    if(req.url?.startsWith('/api/gemini'))return gemini(req,res,next);
    if(req.url?.startsWith('/api/mai'))return mai(req,res,next);
    if(req.url?.startsWith('/api/telemetry'))return telemetry(req,res);
    if(req.url?.startsWith('/api/inkscape'))return inkscape(req,res);
    if(!req.url?.startsWith('/api/portrait'))return next();
    const fail=(status,error)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error}));};
    const host=req.headers.host||'';
    if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return fail(403,'Local API only');
    if(req.headers.origin&&req.headers.origin!==`http://${host}`)return fail(403,'Same-origin requests only');
    if(req.url==='/api/portrait/health'&&req.method==='GET'){
      const installed=await ready();res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({pytspart:installed,vtracer:installed,sldgen:!!process.env.SLDGEN_PYTHON&&existsSync(path.join(process.env.SLDGEN_DIR||'','sldgen.py')),busy:active.size>0,active:active.size}));
    }
    if(req.url!=='/api/portrait'||req.method!=='POST')return fail(405,'POST required');
    if(!req.headers['content-type']?.startsWith('application/json'))return fail(415,'JSON required');
    if(!existsSync(python))return fail(503,'Python backend missing. Run npm run setup:backend.');
    let size=0,chunks=[];
    try{for await(const chunk of req){size+=chunk.length;if(size>24*1024*1024)return fail(413,'Image request too large');chunks.push(chunk);}}catch{return;}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{return fail(400,'Invalid JSON');}
    if(!data||!['pytspart','sldgen','vtracer','lineart'].includes(data.engine))return fail(400,'Unknown engine');
    if(res.destroyed)return;
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});
    const controller=new AbortController();res.on('close',()=>controller.abort());
    if(pool.active>=pool.limit)res.write(JSON.stringify({progress:'Waiting for a local tracing worker…'})+'\n');
    let release;try{release=await pool.acquire(controller.signal);}catch{return;}
    if(res.destroyed){release();return;}
    let child;
    try{child=spawn(python,['-u',path.join(root,'backend/portrait.py')],{cwd:root,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe'],env:{...process.env,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1'}});}
    catch(error){release();res.end(JSON.stringify({error:error.message})+'\n');return;}
    active.add(child);
    let stderr='',finished=false;
    const timer=setTimeout(()=>{res.write(JSON.stringify({error:'Backend time limit exceeded'})+'\n');kill(child);},data.engine==='sldgen'?7200000:600000);
    child.stdout.on('data',chunk=>{if(!res.destroyed)res.write(chunk);});child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2500);});
    child.on('error',error=>{if(!res.destroyed)res.write(JSON.stringify({error:error.message})+'\n');});
    child.on('close',code=>{finished=true;clearTimeout(timer);active.delete(child);release();if(!res.destroyed){if(code&&stderr)res.write(JSON.stringify({error:stderr})+'\n');res.end();}});
    res.on('close',()=>{if(!finished)kill(child);});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));
  };
  return{name:'portrait-python-api',configureServer(server){server.middlewares.use(middleware);server.httpServer?.on('close',()=>active.forEach(kill));},configurePreviewServer(server){server.middlewares.use(middleware);server.httpServer?.on('close',()=>active.forEach(kill));}};
}
