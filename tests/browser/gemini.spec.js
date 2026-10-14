import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {PROMPT_PRESETS,PROD_PROMPT_PRESETS,SWATCH_STYLE} from '../../src/prompt-presets.js';

const reference='examples/gemini-v13/masked-reference.png';
const ink='examples/gemini-v13/line-art.png';

test('Gemini-only UI uploads, generates, and exports local pen studies',async({page})=>{
  await page.goto('/');
  let calls=0;
  const models=[];page.on('request',r=>{if(r.url().includes('/models/'))models.push(r.url());});
  let savedReference;
  await page.route('**/api/gemini/reference',route=>{savedReference=route.request().postDataJSON();return route.fulfill({json:{id:'fixture-reference'}});});
  const generated=await readFile(ink);
  await page.route('**/api/gemini/generate',async route=>{
    calls++;
    const body=route.request().postDataJSON();
    expect(body.image).toMatch(/^data:image\/png/);
    expect(body).not.toHaveProperty('key');
    expect(body.inputCrop.processing).toBe('color-crop-only');
    expect(body.inputCrop.faceDetected).toBe(true);
    expect(body.image).toBe(savedReference.image);
    await route.fulfill({json:{image:`data:image/png;base64,${generated.toString('base64')}`,prompt:'Fixture prompt',model:body.model,style:body.style}});
  });
  await page.locator('#upload').setInputFiles(reference);
  await expect(page.locator('#status')).toContainText('Color crop ready');
  await expect.poll(()=>savedReference?.image).toBeTruthy();
  await expect(page.locator('#generate')).toBeEnabled();
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('studies ready',{timeout:120000});
  expect(calls).toBe(1);
  expect(models.some(url=>url.includes('segmenter'))).toBe(false);
  expect(await page.locator('#gallery .card').count()).toBe(11);
  expect(await page.locator('#gallery .card').filter({hasText:'Minimum lifts: existing ink'}).count()).toBe(1);
  const waiting=page.waitForEvent('download');
  await page.locator('#downloadAll').click();
  const download=await waiting;
  const files=unzipSync(await readFile(await download.path()));
  expect(files['gemini-minimum-route.svg']).toBeTruthy();
  expect(files['gemini-repaired-route.svg']).toBeTruthy();
  expect(strFromU8(files['settings.json'])).toContain('traceRepairGap');
  expect(JSON.parse(strFromU8(files['settings.json'])).studies.every(r=>r.plotterOptimization?.mergeGapMm===1)).toBe(true);
  expect(files['reference.png']).toBeTruthy();
  let opened;
  await page.route('**/api/inkscape/open',route=>{opened=route.request().postDataJSON();return route.fulfill({json:{file:'fixture-5x7.svg',pageWidthIn:5,pageHeightIn:7}});});
  await page.locator('#showComparisons').check();
  await page.locator('#gallery .card').filter({hasText:'Minimum lifts: existing ink'}).getByRole('button',{name:'Open in Inkscape'}).click();
  await expect(page.locator('#status')).toContainText('Opened in Inkscape: 5');
  expect(opened.name).toBe('Minimum lifts: existing ink');
  expect(opened.penWidthMm).toBe(.45);
  expect(opened.svg).toBe(strFromU8(files['gemini-minimum-route.svg']));
});

test('standalone report handoff opens the selected SVG through the local API',async({page})=>{
  const payload={svg:'<svg><path d="M0,0 L1,1"/></svg>',name:'Report portrait',penWidthMm:.45};let received;
  await page.route('**/api/inkscape/open',route=>{received=route.request().postDataJSON();return route.fulfill({json:{file:'fixture-5x7.svg'}});});
  await page.goto('/inkscape.html#'+encodeURIComponent(JSON.stringify(payload)));
  await expect(page.locator('#message')).toContainText('Opened in Inkscape');
  expect(received).toEqual(payload);
  expect(new URL(page.url()).hash).toBe('');
});

test('color input preserves background and RGB values when face detection is unavailable',async({page})=>{
  await page.route('**/models/face_landmarker.task',route=>route.abort());
  let saved;
  await page.route('**/api/gemini/reference',route=>{saved=route.request().postDataJSON();return route.fulfill({json:{id:'fixture-reference'}});});
  await page.goto('/');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=400;const x=c.getContext('2d');x.fillStyle='rgb(32,128,224)';x.fillRect(0,0,400,400);x.fillStyle='rgb(201,77,39)';x.fillRect(100,100,200,200);return c.toDataURL('image/png');});
  await page.locator('#upload').setInputFiles({name:'color.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});
  await expect.poll(()=>saved?.image).toBeTruthy();
  expect(saved.inputCrop.faceDetected).toBe(false);
  const pixels=await page.evaluate(async url=>{const i=new Image();i.src=url;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return [[...x.getImageData(0,0,1,1).data],[...x.getImageData(200,200,1,1).data]];},saved.image);
  expect(pixels).toEqual([[32,128,224,255],[201,77,39,255]]);
  await expect(page.locator('#notice')).toContainText('whole color photo');
});

test('saved PNG retraces locally without an API request',async({page})=>{
  await page.goto('/');
  let calls=0;
  await page.route('**/api/gemini/generate',route=>{calls++;return route.abort();});
  await page.locator('#lineartUpload').setInputFiles(ink);
  await expect(page.locator('#retraceGemini')).toBeEnabled();
  await page.locator('#retraceGemini').click();
  await expect(page.locator('#status')).toContainText('studies ready',{timeout:120000});
  expect(calls).toBe(0);
});

test('Gemini errors are shown and leave the upload flow usable',async({page})=>{
  await page.goto('/');
  await page.route('**/api/gemini/generate',route=>route.fulfill({status:502,json:{error:'Gemini quota exceeded'}}));
  await page.locator('#upload').setInputFiles(reference);
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('quota exceeded',{timeout:120000});
  await expect(page.locator('#generate')).toBeEnabled();
});

async function batchPhoto(page){
 await page.route('**/models/face_landmarker.task',route=>route.abort());
 await page.route('**/api/gemini/reference',route=>route.fulfill({json:{id:'fixture-reference'}}));
 await page.goto('/');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,128,128);x.strokeStyle='black';x.lineWidth=3;x.beginPath();x.moveTo(20,20);x.lineTo(60,80);x.lineTo(100,20);x.stroke();return c.toDataURL();});
 await page.locator('#upload').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
 await expect(page.locator('#status')).toContainText('Color crop ready');return image;
}

test('All Prompts generates concurrently, traces concurrently, archives and retraces every prompt',async({page})=>{
 const image=await batchPhoto(page),pending=[],styles=[];let calls=0,peakTracing=0;
 await page.route('**/api/gemini/generate',async route=>{
  const body=route.request().postDataJSON();calls++;styles.push(body.style);pending.push({route,body});
  // All active requests must be issued before any mock generation completes.
  if(pending.length===PROMPT_PRESETS.length)await Promise.all(pending.map(({route,body})=>route.fulfill({json:{image,model:body.model,style:body.style,prompt:'Prompt '+body.style}})));
 });
 const polling=setInterval(()=>{void page.request.get('/api/portrait/health').then(r=>r.json()).then(h=>{peakTracing=Math.max(peakTracing,h.active||0);}).catch(()=>{});},80);
 try{
  await page.getByRole('button',{name:'All Prompts',exact:true}).click();
  await expect(page.locator('#status')).toContainText(`${PROMPT_PRESETS.length}/${PROMPT_PRESETS.length} ready`,{timeout:120000});
  expect(styles.sort()).toEqual(PROMPT_PRESETS.map(p=>p.id).sort());expect(calls).toBe(PROMPT_PRESETS.length);expect(peakTracing).toBeGreaterThan(1);
  await expect(page.locator('#gallery .card:visible')).toHaveCount(PROMPT_PRESETS.length);
  expect(await page.locator('#gallery .card').count()).toBe(PROMPT_PRESETS.length*11);
  await expect(page.locator('#geminiReview')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Review PNG + prompt'})).toHaveCount(0);
  expect(styles).not.toContain('sparse-observation');
  await expect(page.locator('#geminiStyle option')).toHaveCount(PROMPT_PRESETS.length);
  const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();
  const files=unzipSync(await readFile(await (await waiting).path()));
  expect(JSON.parse(strFromU8(files['batch.json'])).every(j=>j.state==='ready')).toBe(true);
  for(const p of PROMPT_PRESETS){
   expect(files[p.id+'/gemini-minimum-route.svg']).toBeTruthy();
   expect(files[p.id+'/line-art.png']).toBeTruthy();expect(files[p.id+'/reference.png']).toBeTruthy();
   expect(JSON.parse(strFromU8(files[p.id+'/generation.json'])).style).toBe(p.id);
   const studies=JSON.parse(strFromU8(files[p.id+'/settings.json'])).studies;
   expect(studies.every(s=>s.plotterOptimization?.mergeGapMm===1)).toBe(true);
   for(const s of studies)if(s.strokes){
    const svg=strFromU8(files[p.id+'/'+s.id+'.svg']);
    expect((svg.match(/<path /g)||[]).length).toBe(s.strokes);
    expect((svg.match(/d="M/g)||[]).length).toBe(s.strokes);
   }
  }
  await page.locator('#retraceGemini').click();
  await expect(page.locator('#allPrompts')).toBeEnabled({timeout:60000});
  expect(await page.locator('#status').textContent(),await page.locator('.prompt-result > p').allTextContents()).toContain(`${PROMPT_PRESETS.length}/${PROMPT_PRESETS.length} ready`);expect(calls).toBe(PROMPT_PRESETS.length);
  await expect(page.locator('#allPrompts')).toBeEnabled();
 }finally{clearInterval(polling);}
});

test('batch failures keep other results and failed-trace PNGs available for local recovery',async({page})=>{
 const image=await batchPhoto(page);let calls=0,traces=0;
 await page.route('**/api/gemini/generate',route=>{
  const body=route.request().postDataJSON();calls++;
  return route.fulfill(body.style==='sparse-hair'?{status:502,json:{error:'Fixture quota exceeded'}}:{json:{image,model:body.model,style:body.style,prompt:body.style}});
 });
 await page.route('**/api/portrait',route=>{traces++;return traces===1?route.fulfill({status:500,json:{error:'Fixture tracing failed'}}):route.continue();});
 await page.locator('#allPrompts').click();
 await expect(page.locator('#status')).toContainText(`${PROMPT_PRESETS.length-2}/${PROMPT_PRESETS.length} ready`,{timeout:120000});
 await expect(page.locator('#allPrompts')).toBeEnabled();
 await expect(page.locator('#status')).toContainText('2 failed');
 await expect(page.locator('[data-prompt="sparse-hair"]')).toContainText('quota exceeded');
 const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();
 const files=unzipSync(await readFile(await (await waiting).path()));
 expect(Object.keys(files).filter(p=>p.endsWith('/line-art.png')).length).toBe(PROMPT_PRESETS.length-1);
 await page.locator('#retraceGemini').click();
 await expect(page.locator('#status')).toContainText(`${PROMPT_PRESETS.length-1}/${PROMPT_PRESETS.length} ready`,{timeout:120000});
 await expect(page.locator('#status')).toContainText('1 failed');expect(calls).toBe(PROMPT_PRESETS.length);
});

test('cancel stops a batch and re-enables generation without losing finished SVGs',async({page})=>{
 const image=await batchPhoto(page);const waiting=[];
 await page.route('**/api/gemini/generate',route=>{
  const body=route.request().postDataJSON();
  if(body.style==='sparse-five')return route.fulfill({json:{image,style:body.style,model:body.model,prompt:body.style}});
  waiting.push(route);
 });
 await page.locator('#allPrompts').click();
 await expect(page.locator('#status')).toContainText(`1/${PROMPT_PRESETS.length} ready`,{timeout:120000});
 await page.locator('#cancel').click();
 await expect(page.locator('#allPrompts')).toBeEnabled();
 await expect(page.locator('#status')).toContainText(`${PROMPT_PRESETS.length-1} canceled`);
 await expect(page.locator('#gallery .card:visible')).toHaveCount(1);
 await expect(page.locator('#downloadAll')).toBeEnabled();
  await Promise.allSettled(waiting.map(route=>route.abort()));
});

test('overlapping local trace batches queue instead of dropping SVG extraction',async({page})=>{
 const image=await batchPhoto(page);
 const results=await Promise.all(Array.from({length:PROMPT_PRESETS.length*2},async()=>{
  const response=await page.request.post('/api/portrait',{data:{engine:'lineart',image,width:128,height:128,paperWidth:180}});
  expect(response.status()).toBe(200);
  return (await response.text()).trim().split('\n').map(line=>JSON.parse(line));
 }));
 expect(results.every(events=>events.some(e=>e.results?.length===11)&&!events.some(e=>e.error))).toBe(true);
 expect(results.some(events=>events.some(e=>e.progress?.includes('Waiting for a local tracing worker')))).toBe(true);
});

test('live Gemini color crop and exported pen paths',async({page})=>{
  test.skip(process.env.GEMINI_LIVE_TEST!=='1','Opt-in paid image request only');
  test.setTimeout(300000);
  await page.goto('/');
  await page.locator('#upload').setInputFiles(process.env.PORTRAIT_TEST_IMAGE);
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('studies ready',{timeout:270000});
});

test('Prod Pen Treatment runs only A F B C G H concurrently and retains that display order',async({page})=>{
 const image=await batchPhoto(page),pending=[],styles=[];
 await page.route('**/api/gemini/generate',async route=>{
  const body=route.request().postDataJSON();styles.push(body.style);pending.push({route,body});
  if(pending.length===6)await Promise.all(pending.map(({route,body})=>route.fulfill({json:{image,model:body.model,style:body.style,prompt:body.style}})));
 });
 await page.locator('#prodPen').click();
 await expect(page.locator('#status')).toContainText('Prod Pen Treatment: 6/6 ready',{timeout:120000});
 expect(styles).toEqual(PROD_PROMPT_PRESETS.map(p=>p.id));
 expect(await page.locator('.prompt-result').evaluateAll(nodes=>nodes.map(n=>n.dataset.prompt))).toEqual(styles);
 await expect(page.locator('#gallery .card:visible')).toHaveCount(6);
 await expect(page.locator('#prodSwatch')).toBeEnabled();
 await expect(page.locator('#swatchReview')).toBeHidden();
 const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();
 const download=await waiting;expect(download.suggestedFilename()).toBe('prod-pen-treatment.zip');
 const files=unzipSync(await readFile(await download.path()));
 expect(JSON.parse(strFromU8(files['batch-info.json'])).geminiRequestsRequested).toBe(6);
});

test('Prod Swatch makes one request, crops six different panels, optimizes, archives and retraces locally',async({page})=>{
 await batchPhoto(page);let calls=0;
 const sheet=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=960;c.height=640;const ctx=c.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='black';ctx.lineWidth=3;
  for(let i=0;i<6;i++){
   const x=(i%3)*320,y=Math.floor(i/3)*320;
   ctx.beginPath();ctx.moveTo(x+50,y+50);ctx.lineTo(x+150,y+260);ctx.lineTo(x+270,y+70);ctx.stroke();
   ctx.fillStyle='black';ctx.fillRect(x+60+i*25,y+150,8,8);
  }
  return c.toDataURL();
 });
 await page.route('**/api/gemini/generate',route=>{
  calls++;const body=route.request().postDataJSON();expect(body.style).toBe(SWATCH_STYLE);
  return route.fulfill({json:{image:sheet,style:SWATCH_STYLE,model:body.model,prompt:'Six fixture prompts'}});
 });
 await page.locator('#prodSwatch').click();
 await expect(page.locator('#status')).toContainText('Prod Swatch Experiment: 6/6 ready',{timeout:120000});
 expect(calls).toBe(1);await expect(page.locator('#swatchReview')).toBeVisible();
 await expect(page.locator('#gallery .card:visible')).toHaveCount(6);
 const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();
 const download=await waiting;expect(download.suggestedFilename()).toBe('prod-swatch-experiment.zip');
 const files=unzipSync(await readFile(await download.path()));
 expect(files['swatch.png']).toBeTruthy();expect(strFromU8(files['swatch-prompt.txt'])).toBe('Six fixture prompts');
 expect(JSON.parse(strFromU8(files['batch-info.json'])).geminiRequestsRequested).toBe(1);
 for(const [index,p] of PROD_PROMPT_PRESETS.entries()){
  const generation=JSON.parse(strFromU8(files[p.id+'/generation.json']));
  expect(generation.swatchPanel.index).toBe(index);expect(generation.style).toBe(p.id);
  expect(generation.rasterWidth).toBe(320);expect(generation.rasterHeight).toBe(320);
  const studies=JSON.parse(strFromU8(files[p.id+'/settings.json'])).studies;
  expect(studies.every(s=>s.plotterOptimization?.mergeGapMm===1)).toBe(true);
  const pixel=await page.evaluate(async({url,index})=>{
   const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=c.height=320;
   const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return [...ctx.getImageData(62+index*25,152,1,1).data];
  },{url:'data:image/png;base64,'+Buffer.from(files[p.id+'/line-art.png']).toString('base64'),index});
  expect(pixel).toEqual([0,0,0,255]);
 }
 await page.locator('#retraceGemini').click();
 await expect(page.locator('#prodSwatch')).toBeEnabled({timeout:120000});
 await expect(page.locator('#status')).toContainText('6/6 ready');expect(calls).toBe(1);
});

test('wrong swatch aspect ratio retains the sheet and makes no tracing requests',async({page})=>{
 const image=await batchPhoto(page);let traces=0;
 await page.route('**/api/gemini/generate',route=>route.fulfill({json:{image,style:SWATCH_STYLE,prompt:'Fixture'}}));
 await page.route('**/api/portrait',route=>{traces++;return route.abort();});
 await page.locator('#prodSwatch').click();
 await expect(page.locator('#prodSwatch')).toBeEnabled();
 await expect(page.locator('#status')).toContainText('Swatch dimensions');
 expect(traces).toBe(0);await expect(page.locator('#downloadAll')).toBeEnabled();
 await expect(page.locator('#downloadSwatch')).toBeVisible();
 const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();
 const files=unzipSync(await readFile(await (await waiting).path()));expect(files['swatch.png']).toBeTruthy();
 expect(JSON.parse(strFromU8(files['batch.json'])).every(j=>j.state==='error')).toBe(true);
});
