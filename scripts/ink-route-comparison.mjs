// Local route comparisons from a saved PNG. Never calls Gemini.
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {svgFor} from '../src/geometry.js';
const directory='examples/gemini-v13';
const python=process.env.PLOTTER_PYTHON||(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const image='data:image/png;base64,'+(await readFile(`${directory}/line-art.png`)).toString('base64');
const variants=[];
for(const target of [5,12,15]){
 const request={engine:'lineart',width:720,height:720,paperWidth:180,traceThreshold:.65,traceMinLength:.35,traceSmooth:.6,traceStrokeTarget:target,image};
 const run=spawnSync(python,['-u','backend/portrait.py'],{input:JSON.stringify(request),encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
 if(run.status!==0)throw new Error(run.stderr||run.stdout);
 const result=run.stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s)).find(r=>r.results).results.find(r=>r.id==='gemini-ink-route');
 const svg=svgFor(result,720,720,180,.25);
 const filename=`route-target-${target}.svg`;
 await writeFile(`${directory}/${filename}`,svg.svg);
 variants.push({target,filename,strokes:svg.strokes,lengthMm:svg.lengthMm,routing:result.routing,optimization:result.optimization});
 console.log(JSON.stringify(variants.at(-1)));
}
await writeFile(`${directory}/routing-comparison.json`,JSON.stringify(variants,null,2));
const main=await readFile(`${directory}/route-target-12.svg`,'utf8');
const rows=variants.map(v=>`<tr><td><a href="${v.filename}" download>${v.strokes} strokes (${v.target} requested)</a></td><td>${(v.lengthMm/1000).toFixed(2)} m</td><td>${(v.routing.retracedMm/1000).toFixed(2)} m</td><td>${(v.optimization.after.penUpMm/1000).toFixed(2)} m</td></tr>`).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>12-stroke portrait</title><style>body{font:17px/1.5 system-ui;background:#f5f4ed;color:#173a34;max-width:1500px;margin:auto;padding:28px}h1,h2{font-family:Georgia,serif;font-weight:400}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0;padding:18px;background:white;border-radius:12px}img,figure svg{width:100%;height:auto;display:block}a{color:inherit}table{border-collapse:collapse;background:white;width:100%;margin-top:30px}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}@media(max-width:750px){.grid{display:block}}</style><h1>A portrait in 12 actual pen strokes</h1><p>The new prompt asks for 5-15 long gestures with one constant-width, solid black pen. Gemini still varied the line weight and introduced some tapered marks. The centerline SVG uses a uniform 0.25 mm pen on a 180 mm page.</p><div class="grid"><figure><img src="masked-reference.png" alt="Masked source"><figcaption>Exact photographic reference sent to Gemini.</figcaption></figure><figure><img src="line-art.png" alt="Generated sketch"><figcaption>New Gemini raster; source proportions can still drift.</figcaption></figure><figure id="route"><div>${main}</div><figcaption>12 continuous SVG paths, 11 lifts. No added white-space connectors.</figcaption><label><input type="checkbox" id="colors"> Color each pen stroke for inspection</label></figure></div><p>The ordinary centerline extraction splits this image into 268 paths. The new route follows branches through crossings and retraces existing geometry to use fewer lifts. Its 4.75 m length includes 1.32 m of retracing, which can darken actual ink. This reduces pen lifts; it does not make the drawing visually sparser.</p><table><thead><tr><th>Download SVG</th><th>Pen-down distance</th><th>Retraced ink</th><th>Pen-up travel</th></tr></thead><tbody>${rows}</tbody></table><p>The 5-stroke request produces 6 paths because the retained centerline graph has six separate components. The router keeps them separate instead of inventing connectors. Other photos can also exceed the target if they contain too many disconnected marks.</p><p><a href="studies.zip" download>Download nine-study ZIP (default 12-stroke route)</a> / <a href="generation.json">Exact generation prompt</a> / <a href="routing-comparison.json">Route measurements</a></p><script>document.getElementById('colors').onchange=e=>document.querySelectorAll('#route path').forEach((p,i)=>p.setAttribute('stroke',e.target.checked?'hsl('+i*137.508+' 70% 38%)':'#172e2b'));</script></html>`;
await writeFile(`${directory}/comparison.html`,html);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1050}});
 await page.goto(pathToFileURL(path.resolve(`${directory}/comparison.html`)).href);
 await page.screenshot({path:`${directory}/comparison.png`,fullPage:true});
 await page.locator('#colors').check();
 await page.locator('#route').screenshot({path:`${directory}/twelve-strokes.png`});
}finally{await browser.close();}
