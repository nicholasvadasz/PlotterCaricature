import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {geminiApi} from '../backend/gemini.mjs';
import {PROMPT_PRESETS} from '../src/prompt-presets.js';
import {JobPool} from '../backend/job-pool.mjs';

test('overlapping trace batches wait for capacity and queued cancellation frees the queue',async()=>{
 const pool=new JobPool(7),controller=new AbortController();
 const releases=await Promise.all(Array.from({length:7},()=>pool.acquire(controller.signal)));
 assert.equal(pool.active,7);
 const canceled=new AbortController(),queued=pool.acquire(canceled.signal);
 let started=false;const next=pool.acquire(controller.signal).then(release=>{started=true;return release;});
 canceled.abort();await assert.rejects(queued,{name:'AbortError'});
 assert.equal(started,false);assert.equal(pool.waiting.length,1);
 releases[0]();const finish=await next;assert.equal(started,true);assert.equal(pool.active,7);
 releases.forEach(release=>release());finish();assert.equal(pool.active,0);
});

test('all active real HTTP generation requests overlap; cancellation and errors stay isolated', {timeout:15000},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'plotter-parallel-'));
 const header=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(header);header.writeUInt32BE(64,16);header.writeUInt32BE(64,20);
 const image='data:image/png;base64,'+header.toString('base64');
 const signals=[];let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const api=geminiApi(root,{readKey:async()=> 'fixture-secret',generate:async(input,{signal})=>{
  signals.push(signal);
  await Promise.race([gate,new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('canceled')),{once:true}))]);
  if(input.style==='sparse-hair')throw new Error('Fixture quota error');
  return {...input,prompt:input.style,created:new Date().toISOString()};
 }});
 const server=createServer((req,res)=>{void api(req,res,()=>{res.writeHead(404);res.end();});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const controllers=PROMPT_PRESETS.map(()=>new AbortController());
 const body=style=>JSON.stringify({image,model:'gemini-3-pro-image',style});
 const waitFor=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Timed out waiting for overlapping requests');};
 let pending=[];
 try{
  pending=PROMPT_PRESETS.map((p,i)=>fetch(base+'/api/gemini/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:body(p.id),signal:controllers[i].signal}).then(async r=>({status:r.status,data:await r.json()})).catch(e=>({error:e.name})));
  await waitFor(()=>signals.length===PROMPT_PRESETS.length);
  const health=await (await fetch(base+'/api/gemini/health')).json();assert.equal(health.active,PROMPT_PRESETS.length);
  const overflow=await fetch(base+'/api/gemini/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:body('sparse-five')});assert.equal(overflow.status,429);
  controllers[0].abort();
  await waitFor(()=>signals.some(s=>s.aborted));assert.equal(signals.filter(s=>s.aborted).length,1);
  release();
  const results=await Promise.all(pending);
  assert.equal(results[0].error,'AbortError');assert.equal(results[1].status,502);
  assert.equal(results.filter(r=>r.status===200).length,PROMPT_PRESETS.length-2);
  assert.equal(new Set(results.filter(r=>r.status===200).map(r=>r.data.id)).size,PROMPT_PRESETS.length-2);
  assert.equal((await readdir(path.join(root,'.private','gemini'))).length,PROMPT_PRESETS.length-2);
  assert.ok(!JSON.stringify(results).includes('fixture-secret'));
  await waitFor(async()=>!(await (await fetch(base+'/api/gemini/health')).json()).busy);
 }finally{
  controllers.forEach(c=>c.abort());release();await Promise.allSettled(pending);
  await new Promise(resolve=>server.close(resolve));
  // Only the exact temporary directory created above is removed.
  await rm(root,{recursive:true,force:true});
 }
});
