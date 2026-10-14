import {test} from 'node:test';
import assert from 'node:assert/strict';
import {photographicCurves,generateSourceGestures,soften} from '../src/source-gestures.js';
const fixture=()=>({width:100,height:100,mask:new Float32Array(10000).fill(1),darkness:new Float32Array(10000),features:[[[10,10],[90,10],[90,90],[10,90],[10,10]]],semanticFeatures:[{kind:'eye',path:[[20,20],[40,20],[40,40],[20,40],[20,20]]},{kind:'nose',path:[[50,30],[50,70]]}],gestureCurves:30,travelBudget:.5});
test('blank photograph never gains landmark eyes, lips, nose or silhouette',()=>{
 const input=fixture();assert.equal(photographicCurves(input).paths.length,0);assert(generateSourceGestures(input).results.every(r=>r.paths.length===0));
});
test('actual photographic edges survive while a landmark-only center nose stays absent',()=>{
 const input=fixture();for(let y=45;y<49;y++)for(let x=15;x<38;x++)input.darkness[y*100+x]=.9;
 const paths=photographicCurves(input).paths;assert(paths.length>0);assert(paths.flat().every(p=>p[0]<42));
 const out=generateSourceGestures(input);assert.equal(out.results.length,8);for(const result of out.results){assert(result.paths.flat(2).every(Number.isFinite));if(['source-connected','source-scribble'].includes(result.id))assert.equal(result.paths.length,1);}
});
test('softened gesture preserves endpoints and stays within the source convex hull',()=>{
 const out=soften([[0,0],[10,0],[10,10]]);assert.deepEqual(out[0],[0,0]);assert.deepEqual(out.at(-1),[10,10]);assert(out.every(p=>p.every(v=>v>=0&&v<=10)));
});
