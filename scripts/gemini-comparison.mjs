import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from '@playwright/test';
const directory='examples/gemini-v11';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1024,height:1024}});
 for(const mode of ['gestural','continuous']){
  const svg=await readFile(`${directory}/${mode}/gemini-flowing.svg`,'utf8');
  await page.setContent(`<style>body{margin:0;background:white}svg{display:block;width:1024px;height:1024px}</style>${svg}`);
  await page.screenshot({path:`${directory}/${mode}/gemini-flowing.png`});
 }
 const sections=[];
 for(const [mode,title,note]of [
  ['gestural','Continuous gesture — new default','Fewer separate details, long returning strokes and a loosely suggested smile. This generation omits the shoulders despite the composition constraint.'],
  ['continuous','One wandering line','More hair/shoulder structure and looping transitions. A continuous-looking PNG still contains disconnected ink after extraction.']]){
  const metadata=JSON.parse(await readFile(`${directory}/${mode}/settings.json`,'utf8'));
  const stats=metadata.studies.find(s=>s.id==='gemini-flowing');
  sections.push(`<section><h2>${title}</h2><p>${note} Smooth SVG: ${stats.strokes} strokes, ${(stats.lengthMm/1000).toFixed(2)} m on a 180 mm page.</p><p><a href="${mode}/studies.zip">PNG + four SVGs + settings</a> · <a href="${mode}/generation.json">Exact prompt</a></p><div class="grid"><figure><img src="${mode}/line-art.png" alt="Generated ${mode} sketch"><figcaption>Gemini raster</figcaption></figure><figure><a href="${mode}/gemini-flowing.svg"><img src="${mode}/gemini-flowing.svg" alt="Smooth centerline SVG"></a><figcaption>Smoothed pen centerlines</figcaption></figure><figure><div class="overlay"><img src="${mode}/masked-reference.png" alt="Photo"><img id="${mode}-overlay" src="${mode}/line-art.png" alt="Sketch overlay" style="opacity:.5"></div><label>Sketch opacity<input type="range" min="0" max="1" value=".5" step=".05" oninput="document.getElementById('${mode}-overlay').style.opacity=this.value"></label></figure></div></section>`);
 }
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gemini: from illustration to continuous gesture</title><style>body{font:16px/1.5 system-ui;background:#f5f4ed;color:#173a34;max-width:1500px;margin:auto;padding:30px}h1,h2{font-family:Georgia,serif;font-weight:400}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}figure{margin:0;padding:12px;background:white;border-radius:10px}img{width:100%;display:block}a{color:inherit}section{margin:35px 0}.overlay{position:relative;aspect-ratio:1}.overlay img{position:absolute;width:100%;height:100%;object-fit:contain}input{width:100%}</style><h1>From illustration to continuous gesture</h1><p>Same masked reference, revised Gemini prompts. Artistic freedom is in line movement; measured facial proportions remain a requirement. Generated geometry can still drift. The sketches are traced as separate pen paths without fabricated white-space connectors.</p><div class="grid"><figure><img src="../gemini-v10/masked-reference.png" alt="Original reference"><figcaption>Reference</figcaption></figure><figure><img src="../gemini-v10/line-art.png" alt="Earlier outlined illustration"><figcaption>Earlier prompt: too polished and fully outlined</figcaption></figure><figure><img src="gestural/line-art.png" alt="New continuous gesture"><figcaption>New default: open continuous gesture</figcaption></figure></div>${sections.join('')}</html>`;
 await writeFile(`${directory}/comparison.html`,html);
 await page.setViewportSize({width:1500,height:1000});
 await page.goto(pathToFileURL(path.resolve(`${directory}/comparison.html`)).href);
 await page.screenshot({path:`${directory}/comparison.png`,fullPage:true});
}finally{await browser.close();}
