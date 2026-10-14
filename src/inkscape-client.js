export async function openInInkscape(svg,name,penWidthMm){
 const response=await fetch('/api/inkscape/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({svg,name,penWidthMm})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to open Inkscape.');return result;
}
