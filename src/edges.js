import {clamp,sample,simplify} from './geometry.js';
import {contrastTarget,residualScribble,pathLength} from './gesture.js';
import {shadowTarget,generateScribbles} from './scribble.js';

export const edgeStyles=[
  ['edge-baseline','Residual baseline','Unchanged residual baseline for comparison.'],
  ['edge-shadow-control','Shadow-rich control','The earlier shadow-rich scribble, retained as a second comparison.'],
  ['edge-sobel','Sobel-biased scribble','Add fine photographic gradients to the residual target, emphasizing existing edges around the eyes.'],
  ['edge-tangent','Edge-following scribble','Sobel target plus short, tangent-aligned candidates to follow narrow features.'],
  ['edge-frames','Frame detail + scribble','Reserve a small travel allowance for measured edge chains near the eyes, then continue the residual scribble.'],
  ['edge-shadow','Shadows + frame detail','Combine measured eye-region edge chains, dark-region scribbling and the baseline facial target.'],
];

function box(path){return path?.length?{x0:Math.min(...path.map(p=>p[0])),x1:Math.max(...path.map(p=>p[0])),y0:Math.min(...path.map(p=>p[1])),y1:Math.max(...path.map(p=>p[1]))}:null;}
export function eyeRegion(input){
  const face=box(input.features?.[0]),eyes=box((input.features||[]).slice(1,5).flat());
  if(!face||!eyes)return null;
  const fw=face.x1-face.x0,fh=face.y1-face.y0;
  return{x0:Math.max(2,eyes.x0-fw*.12),x1:Math.min(input.width-3,eyes.x1+fw*.12),y0:Math.max(2,eyes.y0-fh*.07),y1:Math.min(input.height-3,eyes.y1+fh*.12)};
}
const inRegion=(r,x,y)=>r&&x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1;

export function sobelField(input){
  const {width:w,height:h,mask,edgeThreshold=.075}=input,source=input.edgeSource||input.darkness;
  const smooth=new Float32Array(w*h),magnitude=new Float32Array(w*h),tx=new Float32Array(w*h),ty=new Float32Array(w*h),thin=new Float32Array(w*h);
  // A single 3x3 binomial Gaussian preserves thin frames better than broad box smoothing.
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=source[(y+dy)*w+x+dx]*(dx===0?2:1)*(dy===0?2:1);smooth[y*w+x]=sum/16;
  }
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    const i=y*w+x;let inside=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(mask[(y+dy)*w+x+dx]<.6)inside=false;
    if(!inside)continue;
    const gx=(-smooth[i-w-1]+smooth[i-w+1]-2*smooth[i-1]+2*smooth[i+1]-smooth[i+w-1]+smooth[i+w+1])/4;
    const gy=(-smooth[i-w-1]-2*smooth[i-w]-smooth[i-w+1]+smooth[i+w-1]+2*smooth[i+w]+smooth[i+w+1])/4;
    const m=Math.hypot(gx,gy);magnitude[i]=m;tx[i]=m?-gy/m:0;ty[i]=m?gx/m:0;
  }
  for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){
    const i=y*w+x,m=magnitude[i];if(m<edgeThreshold*.4)continue;
    const angle=(Math.atan2(-tx[i],ty[i])*180/Math.PI+180)%180;
    const offset=angle<22.5||angle>=157.5?1:angle<67.5?w+1:angle<112.5?w:w-1;
    if(m>=magnitude[i-offset]&&m>magnitude[i+offset])thin[i]=m;
  }
  // Hysteresis keeps weak frame sections only when connected to a strong edge.
  const edges=new Uint8Array(w*h),stack=[];
  for(let i=0;i<thin.length;i++)if(thin[i]>=edgeThreshold){edges[i]=1;stack.push(i);}
  while(stack.length){const i=stack.pop();for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const j=i+dy*w+dx;if(!edges[j]&&thin[j]>=edgeThreshold*.4){edges[j]=1;stack.push(j);}}}
  return{magnitude,tx,ty,edges,thin};
}

export function edgeTarget(input,field){
  const target=contrastTarget(input),region=eyeRegion(input),strength=input.edgeWeight??.75,eyeBoost=input.glassesWeight??1.5;
  for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){
    const i=y*input.width+x;if(input.mask[i]<.6){target[i]=0;continue;}
    const edge=clamp(field.magnitude[i]*3)*(inRegion(region,x,y)?eyeBoost:1);
    target[i]=clamp(target[i]+strength*edge);
  }
  return target;
}

export function traceEyeEdges(input,field,region=eyeRegion(input)){
  const w=input.width,h=input.height;if(!region)return [];
  const active=Uint8Array.from(field.edges,(v,i)=>v&&inRegion(region,i%w,Math.floor(i/w))?1:0),used=new Uint8Array(w*h),paths=[];
  const neighbors=i=>{
    const result=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const j=i+dy*w+dx;if(!active[j])continue;
      // Avoid diagonal shortcuts when an orthogonal neighbor already links a corner.
      if(dx&&dy&&(active[i+dx]||active[i+dy*w]))continue;
      result.push(j);
    }
    return result;
  };
  function walk(start){
    let current=start,previous=-1;const points=[];
    while(current>=0&&!used[current]){
      used[current]=1;points.push([current%w,Math.floor(current/w)]);
      const next=neighbors(current).filter(i=>!used[i]);
      if(!next.length){if(points.length>4&&neighbors(current).includes(start))points.push(points[0]);break;}
      if(previous>=0&&next.length>1){const vx=current%w-previous%w,vy=Math.floor(current/w)-Math.floor(previous/w);next.sort((a,b)=>((b%w-current%w)*vx+(Math.floor(b/w)-Math.floor(current/w))*vy)-((a%w-current%w)*vx+(Math.floor(a/w)-Math.floor(current/w))*vy));}
      previous=current;current=next[0];
    }
    if(pathLength(points)>=Math.max(4,w*.012))paths.push(simplify(points,.3));
  }
  for(let i=0;i<active.length;i++)if(active[i]&&!used[i]&&neighbors(i).length!==2)walk(i);
  for(let i=0;i<active.length;i++)if(active[i]&&!used[i])walk(i);
  return paths;
}

export function protectedEdgePrefix(input,field){
  const chains=traceEyeEdges(input,field),budget=(input.edgeShare??.22)*(input.travelBudget??3)*1000*input.width/(input.paperWidth??180);
  const path=[];let travel=0;
  // Prefer long, strong structures; balance both halves of the eye region.
  const region=eyeRegion(input),center=region?(region.x0+region.x1)/2:input.width/2,spent=[0,0];
  while(chains.length){
    const end=path.at(-1);let best=-Infinity,index=-1,reverse=false;
    chains.forEach((p,i)=>{
      const dist=q=>end?Math.hypot(q[0]-end[0],q[1]-end[1]):0,rev=dist(p.at(-1))<dist(p[0]),bridge=dist(rev?p.at(-1):p[0]),len=pathLength(p);
      if(travel+bridge+len>budget)return;
      const side=p.reduce((sum,q)=>sum+q[0],0)/p.length<center?0:1,score=len/(1+bridge/input.width*6)/(1+spent[side]/Math.max(1,budget*.2));
      if(score>best){best=score;index=i;reverse=rev;}
    });
    if(index<0)break;const p=chains.splice(index,1)[0];if(reverse)p.reverse();
    const length=pathLength(p),bridge=end?Math.hypot(p[0][0]-end[0],p[0][1]-end[1]):0;
    const side=p.reduce((sum,q)=>sum+q[0],0)/p.length<center?0:1;spent[side]+=length;path.push(...p);travel+=length+bridge;
  }
  return path;
}

export function generateEdgeStudies(input,progress=()=>{}){
  const field=sobelField(input),target=edgeTarget(input,field),prefix=protectedEdgePrefix(input,field),results=[];
  for(const [id,name,description]of edgeStyles){
    progress(name);let paths;
    if(id==='edge-baseline')paths=residualScribble(input);
    if(id==='edge-shadow-control')paths=generateScribbles(input).find(r=>r.id==='scribble-shadows').paths;
    if(id==='edge-sobel')paths=residualScribble(input,{target});
    if(id==='edge-tangent')paths=residualScribble(input,{target,edgeField:field});
    if(id==='edge-frames')paths=residualScribble(input,{target:contrastTarget(input),prefix});
    if(id==='edge-shadow'){
      let path=prefix;
      const used=pathLength(path),total=(input.travelBudget??3)*1000*input.width/(input.paperWidth??180),shadow=shadowTarget(input);
      if(shadow.some(v=>v>.01)){
        const dark=residualScribble({...input,travelBudget:(used+(total-used)*(input.shadowShare??.3))*(input.paperWidth??180)/input.width/1000},{target:shadow,prefix:path});
        if(dark.length)path=dark[0];
      }
      paths=residualScribble(input,{target,prefix:path,edgeField:field});
    }
    results.push({id,name,description:description+(id==='edge-frames'||id==='edge-shadow'?prefix.length?' Actual eye-region edges; no glasses template.':' No usable eye-region chains found; using scribble only.':''),paths:paths||[]});
  }
  return{results,edgePreview:field.edges,eyeRegion:eyeRegion(input)};
}
