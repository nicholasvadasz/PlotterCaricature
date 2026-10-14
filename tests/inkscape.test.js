import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {pageForInkscape,openInInkscape} from '../backend/inkscape.mjs';

const sample='<svg><g stroke="#000000"><path d="M-20,10 L80,10 L80,210"/><path d="M20,110 L40,110"/></g></svg>';
test('5 by 7 inch page centers all ink, retains strokes and aspect ratio, and keeps physical pen width',()=>{
 const svg=pageForInkscape({svg:sample,penWidthMm:.45,name:'A < B'});
 assert.match(svg,/width="5in" height="7in" viewBox="0 0 127 177.8"/);
 assert.match(svg,/stroke-width="0.45"/);assert.match(svg,/<title>A &lt; B<\/title>/);
 const paths=[...svg.matchAll(/<path d="([^"]+)"/g)].map(m=>[...m[1].matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(p=>[Number(p[1]),Number(p[2])]));
 assert.deepEqual(paths.map(p=>p.length),[3,2]);
 const points=paths.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 assert.ok(Math.abs((minX+maxX)/2-63.5)<.0001);
 assert.ok(Math.abs((minY+maxY)/2-88.9)<.0001);
 assert.ok(Math.abs((maxX-minX)/(maxY-minY)-.5)<.0001);
 assert.ok(minX-.225>=6.35&&minY-.225>=6.35-.0001);
 assert.ok(maxX+.225<=127-6.35&&maxY+.225<=177.8-6.35+.0001);
});
test('only finite line geometry is reconstructed; active SVG content cannot reach Inkscape',()=>{
 const svg=pageForInkscape({svg:'<svg><script>bad()</script><image href="file:///private"/><path d="M0,0 L5,5" onclick="bad()"/></svg>'});
 assert.doesNotMatch(svg,/script|image|href|onclick|bad\(/);
 for(const bad of ['<svg/>','<svg><path d="M0,0 LInfinity,2"/></svg>','<svg><path d="M0,0 L2,3 M4,5 L6,7"/></svg>'])assert.throws(()=>pageForInkscape({svg:bad}));
});
test('opening writes a separate 5x7 file and invokes Inkscape without a shell',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'plotter-inkscape-'));let invoked;
 try{
  const result=await openInInkscape({svg:sample,name:'../portrait',penWidthMm:.3},root,{executable:'test-inkscape',launch:(exe,args,options)=>{
   invoked={exe,args,options};const child=new EventEmitter();child.unref=()=>{};
   queueMicrotask(()=>{child.emit('spawn');child.emit('exit',0);});return child;
  }});
  assert.equal(invoked.exe,'test-inkscape');assert.deepEqual(invoked.args,['--with-gui',result.file]);assert.equal(invoked.options.shell,false);
  assert.equal(path.dirname(result.file),path.join(root,'.private','inkscape'));
  assert.match(await readFile(result.file,'utf8'),/width="5in" height="7in"/);
 }finally{assert.ok(root.startsWith(path.join(tmpdir(),'plotter-inkscape-')));await rm(root,{recursive:true,force:true});}
});
