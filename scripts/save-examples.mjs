import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { portraitStyles } from '../src/portrait.js';

// Run after the real-photo browser test. Only known filenames are extracted.
const root = new URL('../', import.meta.url), dest = new URL('examples/portrait-v2/', root);
const archive = await readFile(new URL('test-results/real-portrait-studies.zip', root));
const entries = unzipSync(archive);
await mkdir(dest, { recursive: true });
for (const [id, name] of portraitStyles) {
  if (!entries[`${id}.svg`]) throw new Error(`Run the real-photo browser test first: missing ${id}`);
  await writeFile(new URL(`${id}.svg`, dest), entries[`${id}.svg`]);
  await copyFile(new URL(`test-results/${name.toLowerCase().replaceAll(' ', '-')}.png`, root), new URL(`${id}.png`, dest));
}
await writeFile(new URL('settings.json', dest), entries['settings.json']);
await writeFile(new URL('studies.zip', dest), archive);
await writeFile(new URL('comparison.html', dest), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portrait approaches — comparison</title><style>body{font:16px system-ui;background:#f5f4ed;color:#173a34;max-width:1500px;margin:40px auto;padding:0 24px}h1,h2{font-family:Georgia,serif;font-weight:400}p{line-height:1.6}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:24px}article{background:white;padding:20px;border:1px solid #d9ddd2;border-radius:10px}img{width:100%;height:auto}a{color:inherit}small{display:block;margin-bottom:24px}</style><h1>Five new portrait approaches</h1><p>Same reference photo, same preparation, different marks. Click an image to inspect its SVG at full size.</p><small>Local validation example. Source: <a href="https://storage.googleapis.com/mediapipe-assets/portrait.jpg">Google's MediaPipe sample portrait</a>. Processing settings: <a href="settings.json">settings.json</a> · <a href="studies.zip">Download all SVGs</a></small><main>${portraitStyles.map(([id,name,description]) => `<article><h2>${name}</h2><a href="${id}.svg"><img src="${id}.svg" alt="${name} portrait"></a><p>${description}</p><a href="${id}.svg" download>Download SVG</a></article>`).join('')}</main></html>`);
console.log('Saved examples/portrait-v2/comparison.html and five SVG/PNG studies.');
