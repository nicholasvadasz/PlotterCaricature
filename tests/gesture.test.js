import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SpringPortrait,contrastTarget,generateGestures,fitTravel,pathLength} from '../src/gesture.js';
function input(){const width=80,height=80,mask=new Float32Array(6400).fill(1),darkness=new Float32Array(6400);for(let y=10;y<70;y++)for(let x=10;x<70;x++)darkness[y*80+x]=x<40?.9:.2;return{width,height,mask,darkness,gesturePoints:150,springSteps:20,seed:42,edgeFocus:0,paperWidth:180,travelBudget:.6};}
test('spring particles move with brightness-dependent stiffness and preserve IDs across frames',()=>{
  const data=input(),model=new SpringPortrait(data),initial=model.path();
  for(let i=0;i<10;i++)model.step();assert.notDeepEqual(initial,model.path());
  let dark=0,bright=0,nd=0,nb=0;
  for(let i=0;i<model.n;i++){if(model.x[i]>10&&model.x[i]<39&&model.y[i]>10&&model.y[i]<69){dark+=model.stiffness[i];nd++;}else if(model.x[i]>41&&model.x[i]<69&&model.y[i]>10&&model.y[i]<69){bright+=model.stiffness[i];nb++;}}
  assert(nd&&nb);assert(dark/nd<bright/nb);
  const coordinates=model.x,order=model.order,before=model.path();model.update({...data,darkness:Float32Array.from(data.darkness,d=>1-d)});
  assert.equal(model.x,coordinates);assert.equal(model.order,order);assert.deepEqual(model.path(),before);
  model.step();assert.equal(new Set(model.order).size,model.n);assert(model.path().flat().every(Number.isFinite));
  model.update({...data,mask:new Float32Array(data.mask.length)});assert.deepEqual(model.path(),[]);
});
test('contrast target suppresses flat tone and travel fitting preserves endpoints',()=>{
  const data=input(),target=contrastTarget(data,1);assert(target[30*80+39]>target[30*80+20]);
  const path=[[0,0],[1,3],[2,0],[3,3],[4,0]],fit=fitTravel(path,5,target,80,80);
  assert(fit.withinBudget);assert(pathLength(fit.path)<=5);assert.deepEqual(fit.path[0],path[0]);assert.deepEqual(fit.path.at(-1),path.at(-1));
});
test('all gesture methods are continuous, finite and within the physical travel budget',()=>{
  const data=input(),results=generateGestures(data);
  assert.equal(results.length,3);
  for(const result of results){assert.equal(result.paths.length,1,result.id);assert(result.paths[0].flat().every(Number.isFinite));assert(pathLength(result.paths[0])*data.paperWidth/data.width<=data.travelBudget*1000+.01,result.id);}
});
test('white or fully masked inputs have no gesture paths',()=>{
  for(const mode of ['white','mask']){const data=input();data[mode==='white'?'darkness':'mask'].fill(0);for(const result of generateGestures(data))assert.equal(result.paths.length,0,result.id);}
});
