import {stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {geminiKey} from '../backend/gemini.mjs';
import {findInkscape} from '../backend/inkscape.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
let failures=0;
function report(ok,message){console.log(`${ok?'OK':'FAIL'}  ${message}`);if(!ok)failures++;}
const [major,minor]=process.versions.node.split('.').map(Number);
report(major>22||major===22&&minor>=12,`Node ${process.versions.node} (requires 22.12+; tested on 24)`);
for(const module of ['vite','fflate','@mediapipe/tasks-vision']){
 try{await import(module);report(true,`${module} installed`);}
 catch{report(false,`${module} missing or unusable; run npm ci`);}
}
for(const name of ['models/face_landmarker.task','models/selfie_segmenter.tflite',
 'wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm',
 'wasm/vision_wasm_nosimd_internal.js','wasm/vision_wasm_nosimd_internal.wasm']){
 const ok=await stat(path.join(root,'public',name)).then(s=>s.size>1000).catch(()=>false);
 report(ok,`${name}${ok?'':'; run npm run setup'}`);
}
const python=process.env.PLOTTER_PYTHON||path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const code=`import sys, struct
assert sys.version_info[:2] == (3, 13) and struct.calcsize('P') == 8
import numpy, scipy, PIL, ortools, svgpathtools, vtracer, skimage, vpype, networkx
from backend.plotter_optimize import finish_for_plotter
result = finish_for_plotter({'paths': [[[0, 0], [1, 0]], [[1, 0], [2, 0]]]}, 1)
assert len(result['paths']) == 1
print('Python ' + sys.version.split()[0] + ': tracing imports and vpype smoke check passed')`;
const check=spawnSync(python,['-c',code],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
report(!check.error&&check.status===0,check.status===0?check.stdout.trim():
 ['EPERM','EACCES'].includes(check.error?.code)?'Permission blocked launching Python; run this check from a normal local terminal':
 'Python tracing unavailable; run npm run setup:backend (Python 3.13, 64-bit)');
if(check.error||check.status!==0)console.log((check.error?.message||check.stderr||'').slice(-1400));
const hasKey=Boolean(await geminiKey(root));
console.log(hasKey?'OK  Gemini key configured (not printed or sent; API validity not checked)':'NOTE  Set GEMINI_API_KEY in .env.local for generation. Local PNG tracing works without it.');
try{
 const exe=findInkscape();
 const r=spawnSync(exe,['--version'],{encoding:'utf8',windowsHide:true,timeout:15000});
 if(r.error)throw r.error;
 if(r.status!==0)throw new Error('unavailable');
 console.log('OK  Inkscape is available');
}catch(error){console.log(['EPERM','EACCES'].includes(error.code)?
 'NOTE  Permission blocked the Inkscape launch check; run doctor from a normal local terminal':
 'NOTE  Install Inkscape for the Open in Inkscape button. SVG downloads still work.');}
console.log(failures?`\n${failures} setup check(s) failed.`:'\nLocal setup ready. Run npm start.');
process.exitCode=failures?1:0;
