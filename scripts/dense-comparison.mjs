import {mkdir,writeFile} from 'node:fs/promises';
import {denseStyles} from '../src/dense.js';
import {edgeStyles} from '../src/edges.js';
for(const [folder,title,modes,styles]of [['dense-v6','Denser portrait comparisons',['demo','glasses','photo'],denseStyles],['edges-v5','Edge-biased residual comparisons',['glasses','photo'],edgeStyles]]){
 await mkdir(`examples/${folder}`,{recursive:true});
 await writeFile(`examples/${folder}/comparison.html`,`<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:16px system-ui;margin:30px;background:#eee}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:15px}figure{margin:0;background:white;padding:12px}img{width:100%}a{color:#245a48}</style><h1>${title}</h1><p>Each SVG is one continuous path. Dense comparisons use a 3 m baseline and 9 m alternatives. Edge comparisons use 3 m throughout. Demos are illustrations; the photo is a real portrait without glasses. These samples do not establish quality across all faces.</p>${modes.map(mode=>`<h2>${mode}</h2><p><a href="${mode}/studies.zip">Download SVGs and settings</a></p><section><figure><img src="${mode}/source.png"><figcaption>Source</figcaption></figure>${styles.map(([id,name])=>`<figure><a href="${mode}/${id}.svg"><img src="${mode}/${id}.svg"></a><figcaption>${name}</figcaption></figure>`).join('')}</section>`).join('')}`);
}
