import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateDenseStudies,denseTargets} from '../src/dense.js';
import {pathLength,residualScribble} from '../src/gesture.js';
function portrait(){
 const width=120,height=140,darkness=new Float32Array(width*height),mask=new Float32Array(width*height),oval=[];
 for(let k=0;k<=64;k++){const a=k/64*Math.PI*2;oval.push([60+30*Math.cos(a),75+45*Math.sin(a)]);}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(((x-60)/38)**2+((y-65)/56)**2<1){mask[y*width+x]=1;darkness[y*width+x]=y<40?.9:.18+.15*x/width;}
 for(let y=61;y<65;y++)for(let x=40;x<80;x++)if(x<48||x>72)darkness[y*width+x]=.9;
 return{width,height,darkness,mask,features:[oval,[[40,61],[48,64]],[[73,61],[80,64]]],travelBudget:3,inkMultiplier:3,paperWidth:180,seed:42};
}
test('dense portraits add ink, preserve baseline and full head, and remain one budgeted path',()=>{
 const input=portrait(),{results}=generateDenseStudies(input);assert.deepEqual(results[0].paths,residualScribble(input));
 const baseline=pathLength(results[0].paths[0]);
 for(const r of results.slice(1)){assert.equal(r.paths.length,1);const length=pathLength(r.paths[0]);assert(length>baseline*2,r.id);assert(length*180/120<=9000+.1,r.id);assert(r.paths[0].flat().every(Number.isFinite));}
 const outline=denseTargets(input).outline;for(const r of results.slice(3))assert(Math.min(...r.paths[0].map(p=>p[1]))<=Math.min(...outline.map(p=>p[1]))+.3);
});
test('dense target is generic, supports missing landmarks, and does not draw blank subjects',()=>{
 const input=portrait();assert.deepEqual(generateDenseStudies({...input,glassesWeight:1}),generateDenseStudies({...input,glassesWeight:3}));
 assert(generateDenseStudies({...input,features:[]}).results.every(r=>r.paths.length===1));
 input.darkness.fill(0);assert(generateDenseStudies(input).results.every(r=>r.paths.length===0));input.mask.fill(0);assert(generateDenseStudies(input).results.every(r=>r.paths.length===0));
});
