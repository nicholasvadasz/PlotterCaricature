import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const win=process.platform==='win32';
const python=path.join(root,'.venv',win?'Scripts/python.exe':'bin/python');
const probe='import sys,struct; assert sys.version_info[:2] == (3,13) and struct.calcsize("P") == 8; print(sys.executable)';
function supportsPython(command,args=[]){
 const r=spawnSync(command,[...args,'-c',probe],{encoding:'utf8',windowsHide:true,timeout:15000});
 if(r.error&&['EPERM','EACCES'].includes(r.error.code))throw new Error(`Permission blocked launching ${command}. Run setup from a normal local terminal. No environment files were changed.`);
 return !r.error&&r.status===0;
}
function run(command,args){
 const out=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});
 if(out.error)throw out.error;
 if(out.status!==0)throw new Error(`Backend setup failed (exit ${out.status ?? 'unknown'}).`);
}
try{
 let base;
 if(existsSync(path.join(root,'.venv'))){
  if(!supportsPython(python))throw new Error('Existing .venv is incompatible or was copied from another laptop. Rename that .venv folder, then rerun setup. Use 64-bit Python 3.13.');
 }else{
  const candidates=process.env.PLOTTER_SETUP_PYTHON?[[process.env.PLOTTER_SETUP_PYTHON,[]]]:
   (win?[['py',['-3.13']],['python',[]]]:[['python3.13',[]],['python3',[]]]);
  base=candidates.find(([command,args])=>supportsPython(command,args));
  if(!base)throw new Error('Install 64-bit Python 3.13 from https://www.python.org/downloads/windows/ and reopen the terminal. For a custom install, set PLOTTER_SETUP_PYTHON to its python executable.');
 }
 if(process.argv.includes('--check')){
  console.log('Python 3.13 (64-bit) is available.');
 }else{
  if(base)run(base[0],[...base[1],'-m','venv',path.join(root,'.venv')]);
  run(python,['-m','pip','install','-r','backend/requirements-lock.txt']);
  run(python,['-m','pip','check']);
  run(python,['-c','import numpy, scipy, PIL, ortools, svgpathtools, vtracer, skimage, vpype, networkx']);
  console.log('Python tracing, VTracer and vpype ready. Start with npm start.');
 }
}catch(error){console.error(error.message);process.exitCode=1;}
