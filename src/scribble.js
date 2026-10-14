import { blur, clamp, sample, contours, simplify } from './geometry.js';
import { contrastTarget, residualScribble, pathLength } from './gesture.js';

export const scribbleStyles = [
  ['scribble-baseline','Residual baseline','The previous contrast-led scribble, kept for comparison. No reserved outline or shadow budget.'],
  ['scribble-outline','Outline + scribble','Trace the head silhouette first, then draw residual facial gestures. One connected path.'],
  ['scribble-shadows','Shadow-rich scribble','Reserve travel for dark head regions before drawing facial contrast. No explicit outline.'],
  ['scribble-complete','Outline + shadow scribble','Combine a complete head outline, reserved shadow gestures, and residual facial detail.'],
  ['scribble-hatch','Outline + hatched shadows','Combine a head outline and connected shadow hatching with residual facial gestures.'],
];

function bounds(path) {
  if(!path?.length)return null;
  return {left:Math.min(...path.map(p=>p[0])),right:Math.max(...path.map(p=>p[0])),top:Math.min(...path.map(p=>p[1])),bottom:Math.max(...path.map(p=>p[1]))};
}

// Clip a closed contour by a horizontal half-plane, merging wraparound pieces.
function halfContour(path, cut, above) {
  if(path.length<2)return [];
  const runs=[];let run=[];
  const inside=p=>above?p[1]<=cut:p[1]>=cut;
  const flush=()=>{if(run.length>1)runs.push(run);run=[];};
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],ia=inside(a),ib=inside(b);
    if(ia&&!run.length)run.push(a);
    if(ia!==ib){const t=(cut-a[1])/(b[1]-a[1]),q=[a[0]+(b[0]-a[0])*t,cut];run.push(q);if(ia)flush();}
    if(ib)run.push(b);
  }
  flush();
  if(runs.length>1&&inside(path[0])&&Math.hypot(path[0][0]-path.at(-1)[0],path[0][1]-path.at(-1)[1])<2){runs[0]=[...runs.pop(),...runs[0].slice(1)];}
  return runs.sort((a,b)=>pathLength(b)-pathLength(a))[0]||[];
}

export function headOutline(input) {
  const {mask,width:w,height:h,features=[]}=input,face=features[0],box=bounds(face);
  const candidates=contours(blur(mask,w,h,1),w,h,.5,1).filter(p=>{
    const b=bounds(p);return b&&!(b.right-b.left>w*.92&&b.bottom-b.top>h*.92);
  });
  // Prefer the component containing the face; without landmarks, use the largest subject.
  const selected=candidates.filter(p=>{const b=bounds(p);return !box||(b.left<(box.left+box.right)/2&&b.right>(box.left+box.right)/2&&b.top<box.top);}).sort((a,b)=>pathLength(b)-pathLength(a))[0];
  if(box&&selected){
    const cut=box.top+(box.bottom-box.top)*.66;
    let crown=halfContour(selected,cut,true),jaw=halfContour(face,cut,false);
    if(crown.length>2&&jaw.length>2){
      if(crown[0][0]>crown.at(-1)[0])crown.reverse();
      if(jaw[0][0]<jaw.at(-1)[0])jaw.reverse();
      let path=simplify([...crown,...jaw,crown[0]],.35);
      // Finish at the top of the head so the shadow stage can enter hair without
      // an unnecessary connector from the cheek across the face.
      const ring=path.slice(0,-1);let top=0;ring.forEach((p,i)=>{if(p[1]<ring[top][1])top=i;});
      path=[...ring.slice(top),...ring.slice(0,top),ring[top]];
      return {path,kind:'Head outline: person-mask crown and sides joined to the detected jaw.'};
    }
  }
  if(box)return {path:face.map(p=>[...p]),kind:'Face-oval fallback: a reliable outer hair mask was unavailable.'};
  if(selected)return {path:selected,kind:'Subject-outline fallback: no facial landmarks; may include shoulders.'};
  return {path:[],kind:'No reliable outline found. Other marks remain available.'};
}

export function shadowTarget(input) {
  const {darkness,mask,width:w,height:h,features=[],shadowThreshold=.6,shadowStrength=1}=input;
  const box=bounds(features[0]),smooth=blur(darkness,w,h,1),out=new Float32Array(darkness.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(mask[i]<.6)continue;
    // This is a dark-region detector, not a semantic hair classifier.
    if(box&&(y>box.bottom+w*.015||x<box.left-(box.right-box.left)*.4||x>box.right+(box.right-box.left)*.4))continue;
    const d=clamp((smooth[i]-shadowThreshold)/(1-shadowThreshold));
    out[i]=clamp(Math.sqrt(d)*shadowStrength);
  }
  return out;
}

// Scan dark regions with curved short strokes; join neighboring endpoints with
// visible bridges. Stop before the reserved length is spent, including bridge travel.
function shadowHatching(input,target,prefix,budget) {
  const {width:w,height:h,penWidth=.25,paperWidth=180}=input,paths=[];
  const gap=Math.max(penWidth*w/paperWidth*1.7,w/210);
  for(let y=3,row=0;y<h-3;y+=gap,row++){
    let run=[];
    const flush=()=>{if(run.length>2){if(row%2)run.reverse();paths.push(simplify(run,.15));}run=[];};
    for(let x=3;x<w-3;x+=1){const yy=y+Math.sin(x/w*10)*w*.008;if(yy>=2&&yy<h-2&&sample(target,w,h,x,yy)>.12)run.push([x,yy]);else flush();}
    flush();
  }
  let path=prefix.map(p=>[...p]),travel=pathLength(path);
  // Spread the available hatching across the entire dark region. Greedy nearest
  // strokes alone can spend the whole budget on one sideburn.
  const total=paths.reduce((sum,p)=>sum+pathLength(p),0),stride=Math.max(1,Math.ceil(total/Math.max(1,(budget-travel)*.75)));
  const selected=paths.filter((_,i)=>i%stride===Math.floor(stride/2));
  for(const next of selected){
    const end=path.at(-1),distance=q=>end?Math.hypot(q[0]-end[0],q[1]-end[1]):0;
    if(distance(next.at(-1))<distance(next[0]))next.reverse();
    const cost=distance(next[0])+pathLength(next);if(travel+cost>budget)continue;
    path.push(...next);travel+=cost;
  }
  return path;
}

function finishFace(input,target,prefix) {
  const {width:w,height:h,paperWidth=180,travelBudget=3,features=[]}=input,face=bounds(features[0]);
  if(!face)return residualScribble(input,{target,prefix});
  let path=prefix,spent=pathLength(path),remaining=travelBudget*1000*w/paperWidth-spent;
  const fw=face.right-face.left,fh=face.bottom-face.top,pad=w*.02;
  const eyeBox=i=>{const b=bounds(features[i]);return b?{left:b.left-pad,right:b.right+pad,top:b.top-pad,bottom:b.bottom+pad}:null;};
  const regions=[eyeBox(1),eyeBox(2),{left:face.left+fw*.18,right:face.right-fw*.18,top:face.top+fh*.60,bottom:face.top+fh*.91}].filter(Boolean);
  // A hair stage must not consume the opportunity to draw both eyes and the mouth.
  // These are local photographic targets, not traced landmark feature strokes.
  for(const region of regions){
    const local=new Float32Array(target.length);
    for(let y=Math.max(0,Math.floor(region.top));y<Math.min(h,Math.ceil(region.bottom));y++)for(let x=Math.max(0,Math.floor(region.left));x<Math.min(w,Math.ceil(region.right));x++)local[y*w+x]=target[y*w+x];
    if(!local.some(v=>v>.01))continue;
    spent+=remaining*.18;
    const result=residualScribble({...input,travelBudget:spent*paperWidth/w/1000},{target:local,prefix:path});
    if(result.length)path=result[0];
  }
  return residualScribble(input,{target,prefix:path});
}

export function generateScribbles(input,progress=()=>{}) {
  const {width:w,height:h,paperWidth=180,travelBudget=3,shadowShare=.3}=input;
  const budget=travelBudget*1000*w/paperWidth,base=contrastTarget(input),shadow=shadowTarget(input),outline=headOutline(input);
  const box=bounds(input.features?.[0]);
  const crown=Float32Array.from(shadow,(v,i)=>box&&Math.floor(i/w)>box.top+(box.bottom-box.top)*.22?0:v);
  const hasTone=input.darkness.some((v,i)=>v>.01&&input.mask[i]>.6);
  const results=[];
  for(const [id,name,description]of scribbleStyles){
    progress(name);
    if(!hasTone){results.push({id,name,description,paths:[]});continue;}
    if(id==='scribble-baseline'){results.push({id,name,description,paths:residualScribble(input)});continue;}
    const needsOutline=['scribble-outline','scribble-complete','scribble-hatch'].includes(id);
    let path=needsOutline?outline.path.map(p=>[...p]):[];
    const outlineLength=pathLength(path);
    if(outlineLength>budget){results.push({id,name,description:`The complete outline needs ${(outlineLength*paperWidth/w/1000).toFixed(2)} m. Increase the travel budget to preserve it.`,paths:[]});continue;}
    const reserved=(budget-outlineLength)*shadowShare;
    if(id==='scribble-hatch'){
      if(box&&crown.some(v=>v>.01))path=shadowHatching(input,crown,path,outlineLength+reserved*.8);
      path=shadowHatching(input,shadow,path,outlineLength+reserved);
    }
    else if(['scribble-shadows','scribble-complete'].includes(id)&&shadow.some(v=>v>.01)){
      // Protect upper-head darkness explicitly: eyebrows must not consume the hair allocation.
      if(box&&crown.some(v=>v>.01)) {
        const hair=residualScribble({...input,travelBudget:(outlineLength+reserved*.7)*paperWidth/w/1000},{target:crown,prefix:path});
        if(hair.length)path=hair[0];
      }
      const dark=residualScribble({...input,travelBudget:(outlineLength+reserved)*paperWidth/w/1000},{target:shadow,prefix:path});
      if(dark.length)path=dark[0];
    }
    const result=finishFace(input,base,path);
    // Blank contrast fields must not discard a valid reserved outline/shadow stroke.
    results.push({id,name,description:`${description}${needsOutline?' '+outline.kind:''}`,paths:result.length?result:path.length>1?[path]:[]});
  }
  return results;
}
