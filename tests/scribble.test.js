import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateScribbles,headOutline,shadowTarget} from '../src/scribble.js';
import {pathLength,residualScribble} from '../src/gesture.js';
import {svgFor} from '../src/geometry.js';
function portrait(){
  const w=120,h=140,mask=new Float32Array(w*h),darkness=new Float32Array(w*h),oval=[];
  for(let t=0;t<=64;t++){const a=t/64*Math.PI*2;oval.push([60+28*Math.cos(a),76+40*Math.sin(a)]);}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(((x-60)/38)**2+((y-66)/53)**2<1){mask[y*w+x]=1;darkness[y*w+x]=y<45?.96:.15;}
  for(let y=62;y<67;y++)for(let x=40;x<80;x++)if(x<49||x>70)darkness[y*w+x]=.95;
  return{width:w,height:h,mask,darkness,features:[oval,[[40,63],[48,65]],[[71,63],[79,65]]],travelBudget:3,paperWidth:180,shadowShare:.35,shadowThreshold:.6,edgeFocus:.75,seed:42};
}
test('outline follows outer hair above the landmark forehead and retains chin',()=>{
  const input=portrait(),{path,kind}=headOutline(input);assert(kind.startsWith('Head outline'));
  assert(Math.min(...path.map(p=>p[1]))<20);assert(Math.max(...path.map(p=>p[1]))>110);assert.deepEqual(path[0],path.at(-1));
});
test('uniform black hair has strong target despite having no internal gradient',()=>{
  const input=portrait(),target=shadowTarget(input);assert(target[30*120+60]>.8);assert.equal(target[90*120+60],0);
});
test('hybrids preserve baseline, emit one path, meet budget, and reserve dark-region ink',()=>{
  const input=portrait(),results=generateScribbles(input);assert.equal(results.length,5);
  assert.deepEqual(results[0].paths,residualScribble(input));
  for(const r of results){assert.equal(r.paths.length,1,r.id);assert(pathLength(r.paths[0])*input.paperWidth/input.width<=3000+.05,r.id);const svg=svgFor(r,input.width,input.height).svg;assert.equal((svg.match(/<path d="M/g)||[]).length,1);assert(!/NaN|Infinity/.test(svg));}
  const hybrid=results.find(r=>r.id==='scribble-complete').paths[0],outline=headOutline(input).path;
  // Crown extremum and jaw survive the scribble stage; no budget truncation deletes them.
  assert(Math.min(...hybrid.map(p=>p[1]))<=Math.min(...outline.map(p=>p[1]))+.3);
  assert(Math.max(...hybrid.map(p=>p[1]))>=110);
  let darkTravel=0;for(let i=1;i<hybrid.length;i++)if(hybrid[i][1]<43&&hybrid[i-1][1]<43)darkTravel+=Math.hypot(hybrid[i][0]-hybrid[i-1][0],hybrid[i][1]-hybrid[i-1][1]);
  assert(darkTravel>150,`Only ${darkTravel} px in dark hair`);
});
test('white input stays blank, tiny budget reports outline limit, no-mask fallback avoids a page frame',()=>{
  const input=portrait();input.darkness.fill(0);for(const r of generateScribbles(input))assert.equal(r.paths.length,0);
  const low=generateScribbles({...portrait(),travelBudget:.05});assert.equal(low[1].paths.length,0);assert(low[1].description.includes('Increase the travel budget'));
  const unmasked=portrait();unmasked.mask.fill(1);const fallback=headOutline(unmasked);assert(fallback.kind.includes('Face-oval fallback'));assert.deepEqual(fallback.path,unmasked.features[0]);
});
