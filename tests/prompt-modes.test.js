import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {portraitPrompt,swatchPrompt,promptVersion,generateGemini} from '../backend/gemini.mjs';
import {generateMai} from '../backend/mai.mjs';
import {PROMPT_PRESETS,PROD_PROMPT_PRESETS,SWATCH_STYLE} from '../src/prompt-presets.js';
import {activityContext} from '../backend/telemetry.mjs';

const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);
bytes.writeUInt32BE(64,16);bytes.writeUInt32BE(64,20);
const image='data:image/png;base64,'+bytes.toString('base64');
const modes={'fidelity':'feature-fidelity-v1','line-minimization':'line-minimization-v1'};

for(const [mode,version] of Object.entries(modes)){
 test(`${mode} uses the archived strings for all nine treatments and six swatch panels`,async()=>{
  const snapshot=JSON.parse(await readFile(new URL(`../prompt-archive/${version}.json`,import.meta.url),'utf8'));
  assert.equal(promptVersion(mode),version);
  for(const p of PROMPT_PRESETS){
   assert.equal(portraitPrompt(p.id,mode),snapshot.treatments[p.id]);
   if(mode==='line-minimization')assert.equal(portraitPrompt(p.id),snapshot.treatments[p.id]);
   if(mode==='line-minimization')assert.match(portraitPrompt(p.id,mode),/plan about two to five long, uninterrupted pen journeys/);
  }
  assert.equal(swatchPrompt(mode),snapshot.swatch);
  const blocks=[...swatchPrompt(mode).matchAll(/BEGIN INDIVIDUAL PROMPT\n([\s\S]*?)\nEND INDIVIDUAL PROMPT/g)].map(m=>m[1]);
  assert.deepEqual(blocks,PROD_PROMPT_PRESETS.map(p=>portraitPrompt(p.id,mode)));
 });
 for(const provider of ['gemini','mai'])test(`${provider} sends ${mode} prompts and retains mode/version in individual and swatch metadata`,async()=>{
  for(const style of ['sparse-five',SWATCH_STYLE]){
   const generate=provider==='gemini'?generateGemini:generateMai;
   const result=await generate({image,style,promptMode:mode},{key:'fixture',fetchImpl:async(url,options)=>{
    const sent=provider==='gemini'?JSON.parse(options.body).contents[0].parts[0].text:JSON.parse(options.body).prompt;
    assert.equal(sent,portraitPrompt(style,mode));
    return {ok:true,json:async()=>provider==='gemini'?{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:bytes.toString('base64')}}]}}]}:{data:[{b64_json:bytes.toString('base64')}]}};
   }});
   assert.equal(result.promptMode,mode);assert.equal(result.promptVersion,version);
   if(style===SWATCH_STYLE)assert.deepEqual(result.swatch.panels.map(p=>p.prompt),PROD_PROMPT_PRESETS.map(p=>portraitPrompt(p.id,mode)));
   assert.deepEqual(activityContext({promptMode:mode,promptVersion:version}),{promptMode:mode,promptVersion:version});
  }
 });
}

test('invalid modes fail before making any provider request',async()=>{
 for(const mode of ['unknown','toString',null]){
  assert.throws(()=>portraitPrompt('sparse-five',mode),/Unknown prompt mode/);
  for(const generate of [generateGemini,generateMai])await assert.rejects(generate({image,promptMode:mode},{key:'fixture',fetchImpl:async()=>assert.fail('Must not contact provider')}),/Unknown prompt mode/);
 }
});
