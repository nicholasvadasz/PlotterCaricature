import {openInInkscape} from './inkscape-client.js';
const message=document.getElementById('message');
try{
 const input=JSON.parse(decodeURIComponent(location.hash.slice(1)));
 history.replaceState(null,'',location.pathname);
 const result=await openInInkscape(input.svg,input.name,input.penWidthMm);
 message.textContent='Opened in Inkscape on a 5 × 7 inch page. You can close this tab.';
 document.getElementById('savedPath').textContent=result.file;
}catch(error){message.textContent=error.message||'Unable to open this drawing.';message.className='error';}
