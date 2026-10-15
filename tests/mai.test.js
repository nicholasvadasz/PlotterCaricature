import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {generateMai,maiConfig,MAI_MODELS} from '../backend/mai.mjs';
import {geminiApi,portraitPrompt} from '../backend/gemini.mjs';
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(64,16);bytes.writeUInt32BE(64,20);
const image='data:image/png;base64,'+bytes.toString('base64');
const config={key:'fixture-secret'};

test('MAI sends the unmodified reference to OpenRouter Image API with supported parameters',async()=>{
 const signal=new AbortController().signal;
 const result=await generateMai({image,style:'sparse-five'},{...config,signal,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://openrouter.ai/api/v1/images');assert.equal(options.signal,signal);assert.equal(options.redirect,'error');
  assert.equal(options.headers.Authorization,'Bearer '+config.key);assert.equal(options.headers['Content-Type'],'application/json');
  const body=JSON.parse(options.body);
  assert.equal(body.model,'microsoft/mai-image-2.6');assert.equal(body.prompt,portraitPrompt('sparse-five'));
  assert.equal(body.n,1);assert.equal(body.aspect_ratio,'auto');
  assert.deepEqual(body.input_references,[{type:'image_url',image_url:{url:image}}]);
  assert.deepEqual(body.provider,{options:{azure:{web_grounding:false}}});
  assert.equal(body.resolution,undefined);
  return {ok:true,json:async()=>({data:[{b64_json:bytes.toString('base64'),media_type:'image/png'}],usage:{cost:.01}})};
 }});
 assert.equal(result.image,image);assert.equal(result.provider,'mai');assert.equal(result.apiProvider,'openrouter');
 assert.equal(result.model,'microsoft/mai-image-2.6');assert.equal(result.usage.cost,.01);
 assert.ok(!JSON.stringify(result).includes(config.key));
});

test('MAI handles OpenRouter errors and malformed images without exposing credentials',async()=>{
 for(const [status,hint] of [[401,/OPENROUTER_API_KEY/],[402,/credits/],[429,/rate limits/]]){
  await assert.rejects(generateMai({image},{...config,fetchImpl:async()=>({ok:false,status,json:async()=>({error:{message:'bad fixture-secret'}})})}),error=>{
   assert.match(error.message,/bad \[redacted\]/);assert.match(error.message,hint);return true;
  });
 }
 await assert.rejects(generateMai({image},{...config,fetchImpl:async()=>({ok:true,json:async()=>({data:[]})})}),/no image/);
 await assert.rejects(generateMai({image},{...config,fetchImpl:async()=>({ok:true,json:async()=>({data:[{b64_json:'garbage'}]})})}),/PNG/);
 await assert.rejects(generateMai({image},{...config,fetchImpl:async()=>{throw Error('fixture-secret');}}),/Could not reach OpenRouter/);
 await assert.rejects(generateMai({image:'invalid'},{...config,fetchImpl:async()=>assert.fail('Must reject before fetching')}),/PNG/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(generateMai({image},{...config,signal:controller.signal,fetchImpl:async()=>{throw controller.signal.reason;}}),{name:'AbortError'});
});

test('MAI explains moderation blocks and shows only sanitized provider reasons without retrying',async()=>{
 for(const metadata of [undefined,{error_type:'content_policy_violation',reasons:['fixture-secret reason'],flagged_input:'private input',raw:'private details'}]){
  let calls=0;
  await assert.rejects(generateMai({image},{...config,fetchImpl:async()=>{
   calls++;return {ok:false,status:400,json:async()=>({error:{message:'Azure MAI blocked this request through content moderation.',metadata}})};
  }}),error=>{
   assert.match(error.message,/content-filter rejection, not a key or quota error/);
   assert.match(error.message,metadata?/Provider reason: \[redacted\] reason/:/did not supply a specific moderation reason/);
   assert.ok(!/fixture-secret|private input|private details/.test(error.message));return true;
  });
  assert.equal(calls,1);
 }
});

test('MAI HTTP route archives PNG and provider metadata separately, and health never returns the key',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'plotter-mai-'));
 const api=geminiApi(root,{provider:'mai',models:MAI_MODELS,readConfig:async()=>({...config,configured:true}),generate:async input=>({...input,provider:'mai',apiProvider:'openrouter',created:new Date().toISOString()})});
 const server=createServer((req,res)=>void api(req,res,()=>{res.writeHead(404);res.end();}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const health=await (await fetch(base+'/api/mai/health')).json();assert.equal(health.configured,true);assert.ok(!JSON.stringify(health).includes(config.key));
  const response=await fetch(base+'/api/mai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,model:MAI_MODELS[0],style:'sparse-five'})});
  assert.equal(response.status,200);const result=await response.json();
  const folder=path.join(root,'.private','mai',result.id);
  assert.deepEqual(await readFile(path.join(folder,'reference.png')),bytes);
  assert.deepEqual(await readFile(path.join(folder,'line-art.png')),bytes);
  assert.equal(JSON.parse(await readFile(path.join(folder,'generation.json'),'utf8')).provider,'mai');
  const events=(await readFile(path.join(root,'.private','telemetry','events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e=>e.event),['generation_started','generation_completed']);
  assert.ok(events.every(e=>e.context.generationId===result.id));
  await writeFile(path.join(root,'.env.local'),'OPENROUTER_API_KEY=local-secret');
  const settings=await maiConfig(root);assert.ok(settings.configured);assert.equal(settings.key,'local-secret');
 }finally{await new Promise(resolve=>server.close(resolve));assert.ok(root.startsWith(path.join(tmpdir(),'plotter-mai-')));await rm(root,{recursive:true,force:true});}
});
