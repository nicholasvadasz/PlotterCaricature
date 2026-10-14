import {PROD_PROMPT_PRESETS,SWATCH_LAYOUT} from './prompt-presets.js';

export function swatchRectangles(width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<384||height<256||width*height>40_000_000)
  throw new Error('Swatch dimensions are too small or too large to extract six portraits. The full sheet is still downloadable.');
 const {columns,rows}=SWATCH_LAYOUT;
 if(Math.abs(width/height/(columns/rows)-1)>.025)
  throw new Error('Gemini did not return the requested 3:2 swatch. The sheet is retained; automatic extraction stopped to avoid cutting portraits incorrectly.');
 return PROD_PROMPT_PRESETS.map((p,i)=>{
  const column=i%columns,row=Math.floor(i/columns);
  const x=Math.round(column*width/columns),y=Math.round(row*height/rows);
  return {...p,index:i,row,column,x,y,width:Math.round((column+1)*width/columns)-x,height:Math.round((row+1)*height/rows)-y};
 });
}

// Diagnostics only: never whiten, trim, threshold or otherwise alter panel pixels.
export function inspectSwatchPanel({data,width,height}){
 let ink=0,edgeInk=0;
 const band=Math.max(1,Math.round(Math.min(width,height)*.01));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;
  if(data[i+3]>128&&(data[i]+data[i+1]+data[i+2])/3<180){
   ink++;if(x<band||y<band||x>=width-band||y>=height-band)edgeInk++;
  }
 }
 const warnings=[];
 if(ink<8)warnings.push('This panel appears empty; inspect the sheet layout.');
 if(edgeInk>4)warnings.push('Ink touches a crop boundary; check for a cut portrait or an unwanted border.');
 if(Math.min(width,height)<720)warnings.push('Small panel: fine lines may lose detail. Pro / 3.1 Flash request a 4K sheet.');
 return {inkPixels:ink,edgeInkPixels:edgeInk,warnings};
}

// Gemini sometimes draws dividers even when forbidden. Remove only near-full-span
// straight lines in the outer 2% of a cell, by cropping their narrow margin strips.
// Preserve the entire interior and record the precise source rectangle.
export function swatchContentRect({data,width,height}){
 const dark=(x,y)=>{const i=(y*width+x)*4;return data[i+3]>128&&(data[i]+data[i+1]+data[i+2])/3<180;};
 const bandX=Math.max(1,Math.ceil(width*.02)),bandY=Math.max(1,Math.ceil(height*.02));
 const denseColumn=x=>{let n=0;for(let y=0;y<height;y++)if(dark(x,y))n++;return n/height>.9;};
 const denseRow=y=>{let n=0;for(let x=0;x<width;x++)if(dark(x,y))n++;return n/width>.9;};
 let left=0,right=width,top=0,bottom=height;
 for(let x=0;x<bandX;x++)if(denseColumn(x))left=x+2;
 for(let x=width-bandX;x<width;x++)if(denseColumn(x)){right=x-1;break;}
 for(let y=0;y<bandY;y++)if(denseRow(y))top=y+2;
 for(let y=height-bandY;y<height;y++)if(denseRow(y)){bottom=y-1;break;}
 return {x:left,y:top,width:right-left,height:bottom-top,
  removedFramePx:{left,right:width-right,top,bottom:height-bottom}};
}

export async function splitSwatch(raster,signal){
 signal?.throwIfAborted();
 const image=new Image();image.src=raster.image;await image.decode();
 const rectangles=swatchRectangles(image.naturalWidth,image.naturalHeight);
 return rectangles.map(rect=>{
  signal?.throwIfAborted();
  const canvas=document.createElement('canvas');canvas.width=rect.width;canvas.height=rect.height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,rect.width,rect.height);
  ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
  const content=swatchContentRect(ctx.getImageData(0,0,rect.width,rect.height));
  const clean=document.createElement('canvas');clean.width=content.width;clean.height=content.height;
  const cleanCtx=clean.getContext('2d');
  cleanCtx.drawImage(canvas,content.x,content.y,content.width,content.height,0,0,content.width,content.height);
  const diagnostics=inspectSwatchPanel(cleanCtx.getImageData(0,0,content.width,content.height));
  const {image:sheetImage,swatch,...metadata}=raster;
  return {...metadata,image:clean.toDataURL('image/png'),style:rect.id,
   prompt:swatch?.panels?.find(p=>p.id===rect.id)?.prompt||raster.prompt,
   rasterWidth:content.width,rasterHeight:content.height,
   swatchPanel:{...rect,gridRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
    x:rect.x+content.x,y:rect.y+content.y,width:content.width,height:content.height,
    removedFramePx:content.removedFramePx,sheetWidth:image.naturalWidth,sheetHeight:image.naturalHeight,
    sheetId:raster.id,assignment:'requested-grid-position',...diagnostics}};
 });
}
