import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, svgFor, contours, connectPaths } from '../src/geometry.js';
test('continuous exports have one geometric subpath and all coordinates stay on page',()=>{
  const width=120,height=120,darkness=new Float32Array(width*height),mask=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const d=Math.hypot(x-60,y-60);mask[y*width+x]=d<45?1:0;darkness[y*width+x]=d<45?(1-d/60):0;}
  const results=generate({darkness,mask,width,height,features:[[[35,40],[45,35],[50,40]],[[70,40],[80,35],[90,40]]],detail:10});
  assert.equal(results.length,9);
  for(const result of results){
    const out=svgFor(result,width,height,180,.35);
    assert(!/NaN|Infinity|<image|clipPath/.test(out.svg));
    for(const path of result.paths)for(const [x,y]of path)assert(x>=0&&x<=width&&y>=0&&y<=height,`${result.id}: ${x},${y}`);
    if(['connected','serpentine','spiral','tsp'].includes(result.id)){assert.equal(out.strokes,1);assert.equal((out.svg.match(/<path d="M/g)||[]).length,1);}
    assert(out.lengthMm>0);
  }
});
test('blank input produces no artificial contours or TSP path',()=>{
  const results=generate({darkness:new Float32Array(1600),mask:new Float32Array(1600),width:40,height:40,detail:10});
  for(const id of ['outline','hatch','topography','tsp','features','connected','squiggle'])assert.equal(results.find(r=>r.id===id).paths.length,0,id);
});
test('marching squares stitches a closed shape',()=>{
  const data=new Float32Array(400);for(let y=5;y<15;y++)for(let x=5;x<15;x++)data[y*20+x]=1;
  const paths=contours(data,20,20,.5,1);assert.equal(paths.length,1);assert.deepEqual(paths[0][0],paths[0].at(-1));
});
test('path bridges preserve geometry and reverse nearest endpoint',()=>{
  assert.deepEqual(connectPaths([[[0,0],[1,0]],[[4,0],[2,0]]]),[[[0,0],[1,0],[2,0],[4,0]]]);
});

