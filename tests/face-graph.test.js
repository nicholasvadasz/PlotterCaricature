import {test} from 'node:test';
import assert from 'node:assert/strict';
import {faceCurves,routeFaceCurves,generateFaceGraph,smoothFeature} from '../src/face-graph.js';
import {svgFor} from '../src/geometry.js';
function fixture(){const width=100,height=120,darkness=new Float32Array(width*height).fill(.2),mask=new Float32Array(width*height).fill(1),face=[[20,20],[80,20],[85,80],[50,110],[15,80],[20,20]],eye=[[28,50],[35,46],[43,50],[35,53],[28,50]],mouth=[[35,82],[50,78],[65,82],[50,89],[35,82]];return{width,height,darkness,mask,features:[face,eye,mouth],semanticFeatures:[{kind:'eye',path:eye},{kind:'lip',path:mouth}],faceDetail:20};}
test('routing retains every selected feature vertex and emits exactly one connected subpath',()=>{
 const input=fixture(),extracted=faceCurves(input),curves=[...extracted.mandatory,...extracted.details],paths=routeFaceCurves(curves,input,extracted.field);
 assert.equal(paths.length,1);for(const c of curves)for(const p of c.path)assert(paths[0].some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-6));
 assert(paths[0].flat().every(Number.isFinite));const out=svgFor({paths,name:'test',description:''},100,120);assert.equal((out.svg.match(/\bM/g)||[]).length,1);
});
test('face collection provides reference and continuous alternatives, refuses missing landmarks',()=>{
 const input=fixture(),out=generateFaceGraph(input);assert.equal(out.results.length,3);assert(out.results[0].paths.length>1);assert(out.results.slice(1).every(r=>r.paths.length===1));
 assert.throws(()=>generateFaceGraph({...input,features:[]}),/No face landmarks/);input.darkness.fill(0);assert.deepEqual(generateFaceGraph(input).results,[]);
});
test('connectors prefer a longer dark corridor over a bright direct shortcut',()=>{
 const width=100,height=100,darkness=new Float32Array(10000),mask=new Float32Array(10000).fill(1);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<16||x>74||y>54&&y<66)darkness[y*width+x]=1;
 const paths=routeFaceCurves([{path:[[10,10],[10,20]]},{path:[[80,20],[80,10]]}],{width,height,darkness,mask},{magnitude:new Float32Array(10000)});
 assert(paths[0].some(p=>p[1]>54),'Connector should take the dark detour');
});
test('cubic iris interpolation retains measured anchors and closes its contour',()=>{
 const ring=[[10,0],[20,10],[10,20],[0,10],[10,0]],out=smoothFeature(ring);
 assert(out.length>ring.length);assert.deepEqual(out[0],out.at(-1));for(const p of ring)assert(out.some(q=>q[0]===p[0]&&q[1]===p[1]));
});
