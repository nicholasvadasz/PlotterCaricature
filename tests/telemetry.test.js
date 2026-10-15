import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {recordActivity,telemetryApi,telemetryPath} from '../backend/telemetry.mjs';
test('concurrent events append intact with unique IDs and server timestamps; HTTP strips secrets',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'plotter-telemetry-'));
 const api=telemetryApi(root),server=createServer((req,res)=>void api(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  await Promise.all(Array.from({length:30},(_,i)=>recordActivity(root,'fixture',{index:i})));
  const records=(await readFile(telemetryPath(root),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(new Set(records.map(r=>r.id)).size,30);assert.ok(records.every(r=>Number.isFinite(Date.parse(r.timestamp))));
  const post=(data,origin)=>fetch(base+'/api/telemetry/events',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
  assert.equal((await post({event:'route_preference_selected',context:{generationId:'g',routePreference:'overdraw',image:'secret-image',key:'secret-key',settings:{resolution:720,key:'secret-setting'}}})).status,200);
  assert.equal((await post({event:'inkscape_opened'})).status,400);
  assert.equal((await post({event:'svg_download'},'https://outside.example')).status,403);
  const response=await fetch(base+'/api/telemetry/export'),log=await response.text();
  assert.match(response.headers.get('content-disposition'),/attachment/);assert.doesNotMatch(log,/secret/);
  assert.equal(JSON.parse(log.trim().split('\n').at(-1)).context.generationId,'g');
 }finally{await new Promise(resolve=>server.close(resolve));assert.ok(root.startsWith(path.join(tmpdir(),'plotter-telemetry-')));await rm(root,{recursive:true,force:true});}
});
