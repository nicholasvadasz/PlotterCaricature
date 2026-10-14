// Face landmarks select the rectangle only. Pixel processing is deliberately
// limited to cropping/resizing: no segmentation, grayscale or tone adjustment.
export function faceCrop(width, height, landmarks, framing='face') {
  const points=landmarks?.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(framing!=='face'||!points?.length)return {x:0,y:0,width,height,faceDetected:!!points?.length};
  const xs=points.map(p=>p.x*width),ys=points.map(p=>p.y*height);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  // Landmarks end at the forehead, so leave extra room above it for hair.
  const size=Math.min(Math.max((right-left)*1.85,(bottom-top)*1.8),width,height);
  const clamp=(v,max)=>Math.max(0,Math.min(v,max));
  return {x:clamp((left+right-size)/2,width-size),y:clamp((top+bottom)/2-size*.60,height-size),width:size,height:size,faceDetected:true};
}

export function cropColorPhoto(source, landmarks, framing='face', maxSize=1024) {
  const crop=faceCrop(source.width,source.height,landmarks,framing);
  const scale=Math.min(1,maxSize/Math.max(crop.width,crop.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(crop.width*scale));canvas.height=Math.max(1,Math.round(crop.height*scale));
  const ctx=canvas.getContext('2d');
  ctx.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
  return {canvas,image:canvas.toDataURL('image/png'),crop:{...crop,sourceWidth:source.width,sourceHeight:source.height,outputWidth:canvas.width,outputHeight:canvas.height,processing:'color-crop-only'}};
}
