import {test,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {sourceStyles} from '../../src/source-gestures.js';
const vtracerStyles=[
 ['vtracer-adaptive','VTracer adaptive tone'],
 ['vtracer-adaptive-coarse','VTracer adaptive coarse curves'],
 ['vtracer-edge-both','VTracer bilateral edge map'],
 ['vtracer-edge-dark','VTracer dark-edge map'],
 ['vtracer-edge-broad','VTracer broad gestural edges'],
 ['vtracer-shadow','VTracer shadow regions'],
 ['vtracer-silhouette','VTracer fixed silhouette'],
 ['vtracer-watershed','VTracer watershed tone'],
];
for(const mode of ['photo','astronaut','glasses'])test(`source-based gesture comparisons on ${mode}`,async({page})=>{
 const file=mode==='astronaut'?process.env.PORTRAIT_SECOND_IMAGE:process.env.PORTRAIT_TEST_IMAGE;test.skip(mode!=='glasses'&&!file,'Set portrait image environment variables');
 await page.goto('/');await page.locator('#collection').selectOption('sourcegestures');if(mode==='glasses')await page.locator('#glassesDemo').click();else await page.locator('#upload').setInputFiles(file);
 await page.locator('#generate').click();await expect(page.locator('#status')).toContainText('8 studies ready',{timeout:90000});
 const wait=page.waitForEvent('download');await page.locator('#downloadAll').click();const dl=await wait,files=unzipSync(await readFile(await dl.path()));
 const folder=`examples/gestural-v9/${mode}`;await mkdir(folder,{recursive:true});await dl.saveAs(`${folder}/studies.zip`);await writeFile(`${folder}/settings.json`,files['settings.json']);await page.locator('#original').screenshot({path:`${folder}/source.png`});
 for(const [id,name]of sourceStyles){const svg=strFromU8(files[`${id}.svg`]);expect(svg).not.toMatch(/NaN|Infinity/);if(['source-connected','source-scribble'].includes(id))expect((svg.match(/<path d="M/g)||[]).length).toBe(1);await writeFile(`${folder}/${id}.svg`,svg);await page.getByRole('button',{name:`Enlarge ${name}`,exact:true}).click();await page.locator('#largePreview').screenshot({path:`${folder}/${id}.png`});await page.locator('#closeLightbox').click();}
 if(mode==='photo'){
  await page.locator('#collection').selectOption('vtracer');await page.locator('#generate').click();await expect(page.locator('#status')).toContainText('8 studies ready',{timeout:90000});
  const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();const download=await waiting,extra=unzipSync(await readFile(await download.path()));await download.saveAs(`${folder}/vtracer.zip`);
  for(const [id,name]of vtracerStyles){expect(extra[`${id}.svg`]).toBeTruthy();const svg=strFromU8(extra[`${id}.svg`]);expect(svg).not.toMatch(/NaN|Infinity/);await writeFile(`${folder}/${id}.svg`,extra[`${id}.svg`]);await page.getByRole('button',{name:`Enlarge ${name}`,exact:true}).click();await page.locator('#largePreview').screenshot({path:`${folder}/${id}.png`});await page.locator('#closeLightbox').click();}
 }
});
