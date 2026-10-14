import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateGemini,parsePng,PORTRAIT_PROMPT} from '../backend/gemini.mjs';
const header=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(header);header.writeUInt32BE(64,16);header.writeUInt32BE(64,20);
const image='data:image/png;base64,'+header.toString('base64');
test('Gemini request sends reference and constraints; returns only final image, no credential',async()=>{
 let calls=0;
 const result=await generateGemini({image},{key:'fixture-secret',fetchImpl:async(url,options)=>{
  calls++;assert.match(url,/generativelanguage\.googleapis\.com/);assert.equal(options.headers['x-goog-api-key'],'fixture-secret');
  const body=JSON.parse(options.body);assert.equal(body.contents[0].parts[1].inlineData.data,header.toString('base64'));assert.match(body.contents[0].parts[0].text,/proportions/);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:'ignored'}},{inlineData:{mimeType:'image/png',data:header.toString('base64')}}]}}]})};
 }});
 assert.equal(calls,1);assert.equal(result.image,image);assert(!JSON.stringify(result).includes('fixture-secret'));assert.match(PORTRAIT_PROMPT,/proportions/);assert.equal(result.style,'gestural');assert.match(result.prompt,/CONTINUOUS GESTURE/);assert.match(result.prompt,/fewest pen strokes possible/);assert.match(result.prompt,/constant stroke width and constant ink darkness/);
});
test('API errors redact credentials and text-only results fail clearly',async()=>{
 await assert.rejects(generateGemini({image},{key:'secret',fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:{message:'bad secret'}})})}),/bad \[redacted\]/);
 await assert.rejects(generateGemini({image},{key:'secret',fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'hello'}]}}]})})}),/no image/);
 assert.throws(()=>parsePng('data:image/png;base64,abc'),/header/);
});
