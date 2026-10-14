import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sobelField,edgeTarget,protectedEdgePrefix,generateEdgeStudies} from '../src/edges.js';
import {contrastTarget,residualScribble,pathLength} from '../src/gesture.js';
function fixture(){
  const width=160,height=160,darkness=new Float32Array(width*height),mask=new Float32Array(width*height).fill(1);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    for(const cx of [49,111])if(Math.abs(Math.hypot((x-cx)/24,(y-68)/17)-1)<.065)darkness[y*width+x]=.95;
    if(x>=73&&x<=87&&Math.abs(y-65)<1)darkness[y*width+x]=.95;
  }
  return{width,height,darkness,mask,features:[[[20,20],[140,20],[140,140],[20,140]],[[35,65],[63,68]],[[97,65],[125,68]]],travelBudget:3,paperWidth:180,seed:42};
}
test('Sobel finds thin rims and tracing preserves both lower rims without a template',()=>{
  const input=fixture(),field=sobelField(input),prefix=protectedEdgePrefix(input,field);
  assert(field.edges.reduce((a,b)=>a+b,0)>100);
  for(const cx of [49,111])assert(prefix.some(([x,y])=>Math.abs(x-cx)<15&&y>79),`Missing lower rim at ${cx}`);
  assert(pathLength(prefix)<=.22*3000*160/180+.01);
  input.darkness.fill(0);assert.equal(sobelField(input).edges.reduce((a,b)=>a+b,0),0);assert.equal(protectedEdgePrefix(input,sobelField(input)).length,0);
});
test('zero edge bias retains target; six variants retain baseline and travel budget',()=>{
  const input=fixture(),field=sobelField(input);
  assert.deepEqual(edgeTarget({...input,edgeWeight:0},field),contrastTarget(input));
  const {results}=generateEdgeStudies(input);assert.equal(results.length,6);assert.deepEqual(results[0].paths,residualScribble(input));
  for(const r of results){assert.equal(r.paths.length,1,r.id);assert(pathLength(r.paths[0])*180/160<=3000+.1,r.id);assert(r.paths[0].flat().every(Number.isFinite));}
});
