// Render and inspect the saved local vpype experiments; no model requests.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from '@playwright/test';
const root='examples/vpype-v12';
const samples=[['gestural','Continuous gesture'],['continuous','One wandering line'],['vtracer','VTracer outline trace']];
const reports=await Promise.all(samples.map(async([key,title])=>({key,title,...JSON.parse(await readFile(`${root}/${key}/report.json`,'utf8'))})));
const rows=reports.map(r=>`<tr><td><a href="${r.key}/comparison.html">${r.title}</a></td><td>${r.before.strokes}</td>${r.studies.map(s=>`<td>${s.after.strokes}</td>`).join('')}</tr>`).join('');
const cards=[['original','Before','206 strokes, 5.55 m pen-up travel'],['vpype-merge','1.5 mm joins','86 strokes, 0.42 m pen-up travel'],['vpype-sparse','3 mm joins + cleanup','39 strokes, 0.31 m pen-up travel']].map(([file,title,note])=>`<figure><h2>${title}</h2><a href="gestural/${file}.svg"><img src="gestural/${file}.svg" alt="${title}"></a><figcaption>${note}</figcaption></figure>`).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>vpype: fewer strokes</title><style>body{font:17px/1.5 system-ui;background:#f5f4ed;color:#173a34;max-width:1500px;margin:auto;padding:28px}h1,h2{font-family:Georgia,serif;font-weight:400}h2{font-size:24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0;padding:18px;background:white;border-radius:12px}img{width:100%;display:block}a{color:inherit}table{border-collapse:collapse;background:white;width:100%;margin-top:30px}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}@media(max-width:700px){.grid{display:block}figure{margin:15px 0}table{font-size:12px}}</style><h1>Fewer strokes with vpype</h1><p>Same saved images, four local optimization presets. No new Gemini generations. Click a sample below for downloadable SVGs, a gap sweep, and red highlights showing the connecting marks.</p><div class="grid">${cards}</div><table><thead><tr><th>Sample / detailed comparison</th><th>Original</th><th>Sort only</th><th>0.5 mm joins</th><th>1.5 mm joins</th><th>3 mm + cleanup</th></tr></thead><tbody>${rows}</tbody></table><p>Counts are separate pen strokes. Sorting preserves geometry and reduces travel; larger joins add ink. The cleanup preset also removes isolated strokes under 1 mm after merging. The 1.5 mm version keeps all original marks. None of these outputs is guaranteed to be a single continuous line.</p><p><a href="gestural/comparison.html">Inspect the main portrait and added connectors</a> / <a href="gestural/studies.zip" download>Download main comparison ZIP</a></p></html>`;
await writeFile(`${root}/comparison.html`,html);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100},deviceScaleFactor:1});
 await page.goto(pathToFileURL(path.resolve(`${root}/comparison.html`)).href);
 await page.screenshot({path:`${root}/comparison.png`,fullPage:true});
 for(const file of ['vpype-merge','vpype-sparse']){
  const svg=await readFile(`${root}/gestural/${file}-connections.svg`,'utf8');
  await page.setViewportSize({width:1024,height:1024});
  await page.setContent(`<style>body{margin:0;background:white}svg{display:block;width:1024px;height:1024px}</style>${svg}`);
  await page.screenshot({path:`${root}/gestural/${file}-connections.png`});
 }
}finally{await browser.close();}
