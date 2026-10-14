import {blur,clamp,contours,sample,simplify} from './geometry.js';
import {sobelField,traceEyeEdges} from './edges.js';
import {flowLines,trimToMask} from './portrait.js';
import {routeFaceCurves} from './face-graph.js';
import {pathLength,residualScribble} from './gesture.js';

export const sourceStyles=[
 ['source-edges','Photo contours','Photographic edges only. Landmarks rank regions but contribute no drawing geometry.'],
 ['source-broken','Broken contour gestures','Omit weaker contour sections and open closed rings at their weakest section. No random facial distortion.'],
 ['source-curves','Sweeping contour gestures','Smooth short runs of the measured contours within a bounded deviation. Multiple pen lifts.'],
 ['source-tonal','Tonal contour sketch','Several image-intensity contours reveal form and shadows; no anatomical templates.'],
 ['source-flow','Flowing pencil marks','Structure-following tonal strokes, with measured contour gestures for facial detail.'],
 ['source-layered','Layered photographic gestures','Combine broken, smooth contour gestures and a restrained layer of tonal marks.'],
 ['source-connected','Connected photo gestures','Route the measured gestures with softened connectors and smooth regional costs. Connecting strokes remain visible.'],
 ['source-scribble','Photo-guided residual gestures','Retain a measured-edge route, then add residual gestures from photographic gradients and darkness.'],
];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const box=p=>({x0:Math.min(...p.map(q=>q[0])),x1:Math.max(...p.map(q=>q[0])),y0:Math.min(...p.map(q=>q[1])),y1:Math.max(...p.map(q=>q[1]))});

export function soften(path,amount=.5){
 if(path.length<3)return path.map(p=>[...p]);
 // Bounded corner cutting, not fitted circles or fabricated anatomy.
 let out=path.map(p=>[...p]);
 for(let pass=0;pass<2;pass++){const next=[out[0]];for(let i=0;i<out.length-1;i++){const a=out[i],b=out[i+1],t=.12+amount*.13;next.push([a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t],[a[0]*t+b[0]*(1-t),a[1]*t+b[1]*(1-t)]);}next.push(out.at(-1));out=next;}
 return simplify(out,.12);
}

export function photographicCurves(input){
 const {width:w,height:h,features=[]}=input,raw=input.edgeSource||input.darkness;
 const face=features[0]?.length?box(features[0]):{x0:2,x1:w-3,y0:2,y1:h-3},fw=face.x1-face.x0,fh=face.y1-face.y0;
 const region={x0:Math.max(3,face.x0-fw*.3),x1:Math.min(w-4,face.x1+fw*.3),y0:3,y1:Math.min(h-4,face.y1+fh*.08)};
 const regionalMask=Float32Array.from(input.mask,(v,i)=>{const x=i%w,y=Math.floor(i/w);return x>=region.x0&&x<=region.x1&&y>=region.y0&&y<=region.y1?v:0;});
 const source=Float32Array.from(raw,(v,i)=>v*regionalMask[i]);
 // Read original edgeSource for gradients; a cropped density must not invent a crop edge.
 const field=sobelField({...input,edgeThreshold:input.gestureThreshold??.035});
 const regions=(input.semanticFeatures||[]).filter(c=>c.kind!=='iris').map(c=>box(c.path));
 const score=path=>{let sum=0;for(const p of path){const important=regions.some(b=>p[0]>b.x0-fw*.035&&p[0]<b.x1+fw*.035&&p[1]>b.y0-fh*.025&&p[1]<b.y1+fh*.025);sum+=sample(field.magnitude,w,h,...p)*(important?2:1);}return pathLength(path)*sum/path.length;};
 const candidates=traceEyeEdges(input,field,region).filter(p=>pathLength(p)>w*.009).map(path=>({path,score:score(path)})).sort((a,b)=>b.score-a.score);
 const occupied=new Uint8Array(w*h),paths=[];
 for(const {path}of candidates){
   if(paths.length>=(input.gestureCurves??150))break;
   const fresh=path.filter(p=>!sample(occupied,w,h,...p)).length/path.length;if(fresh<.4)continue;
   paths.push(path);
   for(let k=1;k<path.length;k++){const a=path[k-1],b=path[k],n=Math.ceil(dist(a,b));for(let j=0;j<=n;j++){const x=Math.round(a[0]+(b[0]-a[0])*j/Math.max(1,n)),y=Math.round(a[1]+(b[1]-a[1])*j/Math.max(1,n));for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)occupied[(y+dy)*w+x+dx]=1;}}
 }
 return{paths,source,regionalMask,field,region};
}

export function brokenCurves(paths,field,input){
 const {width:w,height:h}=input,loose=input.gestureLooseness??.55,result=[];
 for(const original of paths){
   // Resample before thresholding: sparse RDP vertices should not dictate gaps.
   let path=[];for(let i=1;i<original.length;i++){const a=original[i-1],b=original[i],n=Math.max(1,Math.ceil(dist(a,b)));for(let j=0;j<n;j++)path.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);}path.push(original.at(-1));
   if(dist(path[0],path.at(-1))<1&&loose>0){
     let weakest=0;for(let i=1;i<path.length-1;i++)if(sample(field.magnitude,w,h,...path[i])<sample(field.magnitude,w,h,...path[weakest]))weakest=i;
     const gap=Math.max(2,Math.round(path.length*.04*loose));path=[...path.slice(weakest+gap,-1),...path.slice(0,Math.max(0,weakest-gap))];
   }
   const threshold=Math.max(input.gestureThreshold??.035,...path.map(p=>sample(field.magnitude,w,h,...p)))*loose*.38;
   let run=[];const flush=()=>{if(pathLength(run)>w*.009)result.push(simplify(run,.4));run=[];};
   for(const p of path){if(sample(field.magnitude,w,h,...p)>=threshold)run.push(p);else flush();}flush();
 }
 return result;
}

export function generateSourceGestures(input,progress=()=>{}){
 const {width:w,height:h}=input,photo=photographicCurves(input),{paths,source,regionalMask,field}=photo;
 if(!source.some(v=>v>.01))return{results:sourceStyles.map(([id,name,description])=>({id,name,description,paths:[]}))};
 progress('Breaking weak photographic contours');
 const broken=brokenCurves(paths,field,input),sweeps=broken.map(p=>soften(simplify(p,.65),(input.gestureLooseness??.55)));
 const tonal=trimToMask([.25,.43,.62].flatMap(level=>contours(blur(source,w,h,2),w,h,level,2)),regionalMask,w,h,w*.015).sort((a,b)=>pathLength(b)-pathLength(a)).slice(0,input.gestureCurves??150).map(p=>soften(p,.4));
 progress('Integrating photographic flow strokes');
 const density=Float32Array.from(source,(v,i)=>clamp(Math.pow(v,2)*.7+field.magnitude[i]*.6));
 const flow=flowLines(density,regionalMask,w,h,{detail:35,seed:input.seed??42,penPx:(input.penWidth??.25)*w/(input.paperWidth??180),flowScale:.55,minLengthPx:w*.018},true);
 const flowSelected=flow.sort((a,b)=>pathLength(b)-pathLength(a)).slice(0,(input.gestureCurves??150)*2);
 const layered=[...sweeps,...flowSelected.filter((_,i)=>i%3===0)];
 progress('Routing photographic gestures');
 const connected=routeFaceCurves(sweeps.map(path=>({path})),{...input,organicRouting:true},field,progress);
 const target=Float32Array.from(source,(v,i)=>regionalMask[i]<.6?0:clamp(field.magnitude[i]*3+Math.pow(v,3)*.45));
 const prefix=connected[0]||[],baseTravel=pathLength(prefix)*(input.paperWidth??180)/w/1000;
 const residual=residualScribble({...input,travelBudget:baseTravel+(input.travelBudget??3)},{target,prefix,edgeField:field,inkDeposit:.12});
 const variants=[paths,broken,sweeps,tonal,[...sweeps,...flowSelected],layered,connected,residual];
 return{results:sourceStyles.map(([id,name,description],i)=>({id,name,description,paths:variants[i]})),edgePreview:field.edges};
}
