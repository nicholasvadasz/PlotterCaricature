import {blur,clamp} from './geometry.js';
import {contrastTarget,residualScribble,pathLength} from './gesture.js';
import {headOutline,shadowTarget} from './scribble.js';
import {sobelField} from './edges.js';

export const denseStyles=[
  ['dense-control','Residual baseline','Original travel budget and algorithm.'],
  ['dense-residual','More-ink residual','Original residual algorithm with the multiplied travel budget.'],
  ['dense-blend','Blended portrait','Simultaneous residual, tonal, shadow, Sobel and head-boundary targets.'],
  ['dense-layered','Layered portrait','Head outline, boundary gestures, shadow gestures, edge-following and residual passes.'],
  ['dense-shadows','Shadow-rich layered portrait','Layered portrait with more of the travel reserved for dark regions.'],
];

export function denseTargets(input){
  const {width:w,height:h,mask,darkness,features=[]}=input,base=contrastTarget(input),shadow=shadowTarget(input),field=sobelField(input),outline=headOutline(input).path;
  const band=new Float32Array(w*h),edge=new Float32Array(w*h),mixed=new Float32Array(w*h);
  for(let i=1;i<outline.length;i++){
    const a=outline[i-1],b=outline[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])));
    for(let j=0;j<=n;j++){const x=Math.round(a[0]+(b[0]-a[0])*j/n),y=Math.round(a[1]+(b[1]-a[1])*j/n);if(x>=0&&x<w&&y>=0&&y<h)band[y*w+x]=1;}
  }
  const radius=Math.max(2,Math.round(w*.006)),boundary=blur(band,w,h,radius),face=features[0];
  const chin=face?.length?Math.max(...face.map(p=>p[1])):h;
  for(let i=0;i<mixed.length;i++){
    if(mask[i]<.6){boundary[i]=0;continue;}
    const weight=Math.floor(i/w)>chin+w*.025?.15:1;
    boundary[i]=clamp(boundary[i]*(radius*2+1))*(input.boundaryWeight??1);
    edge[i]=clamp(field.magnitude[i]*4)*weight;
    mixed[i]=clamp(base[i]*.8+edge[i]*.65+shadow[i]*.55+Math.pow(darkness[i],1.6)*.25*weight+boundary[i]*.8);
  }
  return{base,shadow,field,outline,boundary,edge,mixed};
}

export function generateDenseStudies(input,progress=()=>{}){
  const total=(input.travelBudget??3)*(input.inkMultiplier??3),dense={...input,travelBudget:total},targets=denseTargets(input),results=[];
  const pxPerM=1000*input.width/(input.paperWidth??180),hasTone=input.darkness.some((v,i)=>v>.01&&input.mask[i]>.6);
  for(const [id,name,description]of denseStyles){
    progress(name);let paths=[];
    if(hasTone){
      if(id==='dense-control')paths=residualScribble(input);
      else if(id==='dense-residual')paths=residualScribble(dense);
      else if(id==='dense-blend')paths=residualScribble(dense,{target:targets.mixed,edgeField:targets.field,inkDeposit:.08});
      else{
        // Reserve a complete outline only when it fits comfortably; never crop it mid-face.
        let path=pathLength(targets.outline)<total*pxPerM*.25?targets.outline.map(p=>[...p]):[];
        const remaining=total-pathLength(path)/pxPerM;
        const shares=id==='dense-shadows'?[.18,.42,.20,.20]:[.22,.25,.23,.30];
        const passes=[targets.boundary,targets.shadow,targets.edge,targets.mixed];
        for(let k=0;k<passes.length;k++){
          if(!passes[k].some(v=>v>.01))continue;
          const allowance=Math.min(total,pathLength(path)/pxPerM+remaining*shares[k]);
          const out=residualScribble({...dense,seed:(input.seed??42)+k*997,travelBudget:allowance},{target:passes[k],prefix:path,inkDeposit:.08,edgeField:k===2?targets.field:undefined});
          if(out.length)path=out[0];
        }
        // Spend unused allowances (e.g. no dark hair) on the complete portrait target.
        const out=residualScribble({...dense,seed:(input.seed??42)+4999},{target:targets.mixed,prefix:path,inkDeposit:.08});
        paths=out.length?out:path.length>1?[path]:[];
      }
    }
    results.push({id,name,description:`${description} ${id==='dense-control'?(input.travelBudget??3):total} m maximum.`,paths});
  }
  return{results,edgePreview:targets.field.edges};
}
