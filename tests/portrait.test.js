import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enhanceTone, flowLines, engraving, relaxedParticles, particleTour, generatePortrait, trimToMask } from '../src/portrait.js';
import { svgFor } from '../src/geometry.js';

function fixture() {
  const width = 96, height = 96, darkness = new Float32Array(width * height), mask = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (Math.hypot(x - 48, y - 48) < 36) {
    mask[y * width + x] = 1; darkness[y * width + x] = x < 48 ? 0.25 : 0.75;
  }
  return { width, height, darkness, mask };
}
const length = path => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);

test('local contrast respects mask and does not halo a uniform subject', () => {
  const {width:w,height:h,mask} = fixture();
  const data = Float32Array.from(mask, m => m * 0.4), out = enhanceTone(data, mask, w, h, 1, 1);
  for (let i = 0; i < out.length; i++) assert(Math.abs(out[i] - data[i]) < 0.00001);
});

test('flow is deterministic, mask-trimmed, stroke-only and respects minimum length', () => {
  const {width:w,height:h,darkness:d,mask:m} = fixture();
  const options = { detail:50,seed:42,penPx:0.6,flowScale:0.9,minLengthPx:3 };
  const paths = flowLines(d,m,w,h,options,true);
  assert(paths.length > 20);
  assert.deepEqual(paths,flowLines(d,m,w,h,options,true));
  for (const path of paths) {
    assert(length(path) >= 2.9);
    for (let i = 1; i < path.length; i++) for (let t = 0; t <= 1; t += 0.2) {
      const x = path[i-1][0] * (1-t) + path[i][0] * t, y = path[i-1][1] * (1-t) + path[i][1] * t;
      assert(m[Math.round(y)*w+Math.round(x)] > 0.5);
    }
  }
  const svg = svgFor({name:'Test',description:'',paths},w,h).svg;
  assert(!/NaN|Infinity|clipPath|<image/.test(svg));
});

test('engraving retains higher ink density in shadows without filling highlights', () => {
  const {width:w,height:h,darkness:d,mask:m} = fixture();
  const paths = engraving(d,m,w,h,0.5,60);
  let light = 0, dark = 0;
  for (const p of paths) { if(p[0][0] < 46) light += length(p)+0.5; if(p[0][0]>50) dark += length(p)+0.5; }
  assert(dark > light * 1.8, `${dark} vs ${light}`);
});

test('relaxed particles preserve mask, count, repeatability and tonal weighting; tour preserves every point', () => {
  const {width:w,height:h,darkness:d,mask:m} = fixture();
  const points = relaxedParticles(d,m,w,h,300,7,8,2);
  assert.equal(points.length,300); assert.deepEqual(points,relaxedParticles(d,m,w,h,300,7,8,2));
  assert(points.filter(p=>p[0]>48).length>220);
  for(const [x,y] of points) assert(m[Math.round(y)*w+Math.round(x)]>0.5);
  const tour=particleTour(points); assert.equal(tour.length,1);assert.equal(tour[0].length,points.length);
  assert.equal(new Set(tour[0]).size,points.length);
  const svg=svgFor({name:'Test',description:'',paths:tour},w,h).svg;
  assert.equal((svg.match(/<path d="M/g)||[]).length,1);
});

test('new styles emit no marks for white input or fully removed background', () => {
  for (const mask of [new Float32Array(1600),new Float32Array(1600).fill(1)]) {
    const results=generatePortrait({darkness:new Float32Array(1600),mask,width:40,height:40,detail:10,relaxation:0});
    assert.equal(results.length,5);for(const result of results)assert.equal(result.paths.length,0,result.id);
  }
});

test('geometric trimming splits a stroke crossing a removed gap', () => {
  const mask = new Float32Array(100).fill(1);
  for(let y=0;y<10;y++)mask[y*10+5]=0;
  const paths=trimToMask([[[1,4],[9,4]]],mask,10,10);
  assert.equal(paths.length,2);
  assert(paths[0].at(-1)[0]<4.5);assert(paths[1][0][0]>5.5);
});
