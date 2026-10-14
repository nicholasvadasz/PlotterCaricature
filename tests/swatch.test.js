import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateGemini,portraitPrompt,swatchPrompt} from '../backend/gemini.mjs';
import {PROD_PROMPT_PRESETS,SWATCH_STYLE} from '../src/prompt-presets.js';
import {swatchRectangles,inspectSwatchPanel,swatchContentRect} from '../src/swatch.js';

const header=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(header);
header.writeUInt32BE(64,16);header.writeUInt32BE(64,20);
const image='data:image/png;base64,'+header.toString('base64');

test('production prompt order is A F B C G H and every swatch block is unchanged',()=>{
 assert.deepEqual(PROD_PROMPT_PRESETS.map(p=>p.label[0]),['A','F','B','C','G','H']);
 const prompt=swatchPrompt();
 const blocks=[...prompt.matchAll(/BEGIN INDIVIDUAL PROMPT\n([\s\S]*?)\nEND INDIVIDUAL PROMPT/g)].map(m=>m[1]);
 assert.deepEqual(blocks,PROD_PROMPT_PRESETS.map(p=>portraitPrompt(p.id)));
});

test('swatch makes one image request with six prompts, one unchanged reference and 4K layout',async()=>{
 let calls=0;
 const result=await generateGemini({image,model:'gemini-3-pro-image',style:SWATCH_STYLE},{key:'test-key',fetchImpl:async(url,options)=>{
  calls++;const body=JSON.parse(options.body);
  assert.equal(body.contents[0].parts[0].text,swatchPrompt());
  assert.equal(body.contents[0].parts.filter(p=>p.inlineData).length,1);
  assert.equal(body.contents[0].parts[1].inlineData.data,header.toString('base64'));
  assert.deepEqual(body.generationConfig.imageConfig,{aspectRatio:'3:2',imageSize:'4K'});
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:header.toString('base64')}}]}}]})};
 }});
 assert.equal(calls,1);assert.equal(result.swatch.panels.length,6);
 assert.deepEqual(result.swatch.panels.map(p=>p.prompt),PROD_PROMPT_PRESETS.map(p=>portraitPrompt(p.id)));
 assert.ok(!JSON.stringify(result).includes('test-key'));
});

test('production requests keep existing prompts and generation settings; legacy swatch omits unsupported 4K',async()=>{
 for(const style of [...PROD_PROMPT_PRESETS.map(p=>p.id),SWATCH_STYLE]){
  await generateGemini({image,model:'gemini-2.5-flash-image',style},{key:'test-key',fetchImpl:async(url,options)=>{
   const body=JSON.parse(options.body);
   assert.equal(body.contents[0].parts[0].text,portraitPrompt(style));
   assert.deepEqual(body.generationConfig,style===SWATCH_STYLE?
    {responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'3:2'}}:{responseModalities:['TEXT','IMAGE']});
   return {ok:true,json:async()=>({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:header.toString('base64')}}]}}]})};
  }});
 }
});

test('panel crops tile odd dimensions without gaps, overlap or dropped edge pixels',()=>{
 const w=5056,h=3392,rects=swatchRectangles(w,h);
 assert.deepEqual(rects.map(p=>p.label[0]),['A','F','B','C','G','H']);
 assert.equal(rects.reduce((sum,r)=>sum+r.width*r.height,0),w*h);
 for(const row of [0,1]){
  const cells=rects.filter(r=>r.row===row);assert.equal(cells[0].x,0);
  assert.equal(cells[0].x+cells[0].width,cells[1].x);
  assert.equal(cells[1].x+cells[1].width,cells[2].x);
  assert.equal(cells[2].x+cells[2].width,w);
 }
 assert.equal(rects[0].y+rects[0].height,rects[3].y);
 assert.equal(rects[3].y+rects[3].height,h);
 assert.throws(()=>swatchRectangles(1024,1024),/3:2/);
 assert.throws(()=>swatchRectangles(30,20),/too small/);
});

test('panel diagnostics flag empty and border ink without changing a pixel',()=>{
 const width=800,height=800,data=new Uint8ClampedArray(width*height*4).fill(255);
 assert.match(inspectSwatchPanel({data,width,height}).warnings.join(' '),/empty/);
 for(let y=0;y<20;y++)for(let c=0;c<3;c++)data[(y*width)*4+c]=0;
 const before=data.slice(),result=inspectSwatchPanel({data,width,height});
 assert.equal(result.inkPixels,20);assert.match(result.warnings.join(' '),/boundary/);
 assert.deepEqual(data,before);
});

test('divider cleanup crops narrow frame strips but preserves shorter portrait strokes',()=>{
 const width=400,height=400,data=new Uint8ClampedArray(width*height*4).fill(255);
 const black=(x,y)=>{for(let c=0;c<3;c++)data[(y*width+x)*4+c]=0;};
 // A partial near-edge hair contour is not a frame.
 for(let x=100;x<230;x++)black(x,3);
 assert.deepEqual(swatchContentRect({data,width,height}).removedFramePx,{left:0,right:0,top:0,bottom:0});
 // Near-full-span dividers have shifted a little from their requested edges.
 for(let i=0;i<400;i++){black(2,i);black(397,i);black(i,0);black(i,398);}
 const before=data.slice();
 const r=swatchContentRect({data,width,height});
 assert.deepEqual(r,{x:4,y:2,width:392,height:395,removedFramePx:{left:4,right:4,top:2,bottom:3}});
 assert.deepEqual(data,before);
});
