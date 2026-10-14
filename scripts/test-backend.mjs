import {spawnSync} from 'node:child_process';
const python=process.env.PLOTTER_PYTHON||(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const out=spawnSync(python,['-m','unittest','discover','-s','backend','-p','test_*.py'],{stdio:'inherit',windowsHide:true});if(out.error)throw out.error;process.exit(out.status||0);
