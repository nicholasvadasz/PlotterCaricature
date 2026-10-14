import {clamp,sample,simplify,blur} from './geometry.js';
import {sobelField,traceEyeEdges} from './edges.js';
import {headOutline} from './scribble.js';
import {pathLength} from './gesture.js';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const bounds=p=>({x0:Math.min(...p.map(q=>q[0])),x1:Math.max(...p.map(q=>q[0])),y0:Math.min(...p.map(q=>q[1])),y1:Math.max(...p.map(q=>q[1]))});
function visit(path,callback,spacing=1){for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],n=Math.max(1,Math.ceil(distance(a,b)/spacing));for(let j=0;j<=n;j++)callback([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);}}

// Interpolate measured anchors with cubic Catmull–Rom segments. Closed four-point
// iris rings become rounded contours instead of diamonds; no synthetic pupil is added.
export function smoothFeature(path){
  if(path.length<3)return path;
  const closed=distance(path[0],path.at(-1))<1e-6,p=closed?path.slice(0,-1):path,out=[];
  for(let i=0;i<(closed?p.length:p.length-1);i++){
    const a=p[closed?(i-1+p.length)%p.length:Math.max(0,i-1)],b=p[i],c=p[(i+1)%p.length],d=p[closed?(i+2)%p.length:Math.min(p.length-1,i+2)];
    const steps=Math.max(2,Math.ceil(distance(b,c)/1.3));
    for(let j=0;j<steps;j++){const t=j/steps;out.push([0,1].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)));}
  }
  out.push(closed?out[0]:p.at(-1));return out;
}

export function faceCurves(input){
  const {width:w,height:h,features=[]}=input;
  if(!features[0]?.length)return null;
  const face=bounds(features[0]),fw=face.x1-face.x0,fh=face.y1-face.y0;
  const region={x0:Math.max(3,face.x0-fw*.25),x1:Math.min(w-4,face.x1+fw*.25),y0:3,y1:Math.min(h-4,face.y1+fh*.04)};
  const field=sobelField({...input,edgeThreshold:input.faceEdgeThreshold??.045});
  const outline=headOutline(input).path;
  const semantic=(input.semanticFeatures||features.slice(1).map((path,i)=>({path,kind:i<2?'eye':'feature'}))).map(c=>({...c,path:smoothFeature(c.path).map(p=>[clamp(p[0],0,w-1),clamp(p[1],0,h-1)])})).filter(c=>c.path.length>1);
  const mandatory=[{kind:'head',path:outline},...semantic].filter(c=>c.path.length>1);
  const occupied=new Uint8Array(w*h);
  const mark=p=>visit(p,([x,y])=>{for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=Math.round(x)+dx,yy=Math.round(y)+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h)occupied[yy*w+xx]=1;}});
  mandatory.forEach(c=>mark(c.path));
  const nearFeature=p=>semantic.some(c=>{const b=bounds(c.path);return p[0]>b.x0-fw*.04&&p[0]<b.x1+fw*.04&&p[1]>b.y0-fh*.04&&p[1]<b.y1+fh*.04;});
  const candidates=traceEyeEdges(input,field,region).map(path=>{
    let contrast=0,fresh=0,n=0;visit(path,p=>{contrast+=sample(field.magnitude,w,h,...p);fresh+=1-sample(occupied,w,h,...p);n++;});
    const length=pathLength(path),middle=path[Math.floor(path.length/2)];
    return{kind:'photo-edge',path,score:length*(contrast/Math.max(1,n))*(nearFeature(middle)?2:1),fresh:fresh/Math.max(1,n)};
  }).filter(c=>c.fresh>.45&&pathLength(c.path)>w*.008).sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const candidate of candidates){
    if(selected.length>=(input.faceDetail??110))break;
    let fresh=0,n=0;visit(candidate.path,p=>{fresh+=1-sample(occupied,w,h,...p);n++;});
    if(fresh/Math.max(1,n)<.45)continue;
    selected.push(candidate);mark(candidate.path);
  }
  const tone=blur(input.darkness,w,h,2),hatches=[];
  const gap=Math.max(3,w/150),minLength=w*.012;
  for(let y=region.y0;y<region.y1;y+=gap){let path=[];
    const flush=()=>{if(pathLength(path)>minLength)hatches.push({kind:'shadow',path:simplify(path,.3)});path=[];};
    for(let x=region.x0;x<region.x1;x+=1.5){const yy=y+(x-w/2)*.22;
      if(yy>2&&yy<region.y1&&sample(input.mask,w,h,x,yy)>.7&&sample(tone,w,h,x,yy)>(input.faceShadowThreshold??.45))path.push([x,yy]);else flush();}
    flush();
  }
  // Sample shadow strokes across the whole head instead of keeping only the crown.
  const stride=Math.max(1,Math.ceil(hatches.length/(input.faceDetail??110)));
  return{mandatory,details:selected,shadows:hatches.filter((_,i)=>i%stride===0),field,face};
}

class Heap{
  items=[];
  push(value){const a=this.items;let i=a.length;a.push(value);while(i){const p=(i-1)>>1;if(a[p][0]<=value[0])break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;if(a[j][0]>=last[0])break;a[i]=a[j];i=j;}a[i]=last;}return top;}
}

// Dijkstra routing on an image-cost grid. Required curves are never budget-truncated.
// Existing ink is cheap, so the route can retrace it rather than cross a bright cheek.
export function routeFaceCurves(curves,input,field,progress=()=>{}){
  if(!curves.length)return [];
  const w=input.width,h=input.height,gw=Math.min(160,w),gh=Math.max(2,Math.round(h*gw/w)),sx=(w-1)/(gw-1),sy=(h-1)/(gh-1),size=gw*gh;
  const cell=p=>Math.round(clamp(p[1]/sy,0,gh-1))*gw+Math.round(clamp(p[0]/sx,0,gw-1)),point=i=>[i%gw*sx,Math.floor(i/gw)*sy];
  const cost=new Float32Array(size),drawn=new Uint8Array(size),guide=new Uint8Array(size);
  const mark=(path,array)=>visit(path,p=>{array[cell(p)]=1;},Math.min(sx,sy)/2);
  curves.forEach(c=>mark(c.path,guide));
  const eyeBoxes=(input.semanticFeatures||[]).filter(c=>c.kind==='eye'||c.kind==='lip').map(c=>bounds(c.path));
  for(let i=0;i<size;i++){const p=point(i),d=sample(input.darkness,w,h,...p),e=sample(field.magnitude,w,h,...p),mask=sample(input.mask,w,h,...p);
    cost[i]=mask<.5?35:1+7*(1-d)**2- Math.min(1,e*4);
    if(input.organicRouting){for(const b of eyeBoxes){const dx=(p[0]-(b.x0+b.x1)/2)/Math.max(2,(b.x1-b.x0)*.45),dy=(p[1]-(b.y0+b.y1)/2)/Math.max(2,(b.y1-b.y0)*.45);cost[i]+=10*Math.exp(-(dx*dx+dy*dy)*2);}}
    else if(eyeBoxes.some(b=>p[0]>b.x0&&p[0]<b.x1&&p[1]>b.y0&&p[1]<b.y1))cost[i]+=18;
    if(guide[i])cost[i]=.65;
  }
  const remaining=curves.map(c=>c.path.map(p=>[...p])),route=remaining.shift();mark(route,drawn);
  while(remaining.length){
    const start=cell(route.at(-1)),dist=new Float64Array(size).fill(Infinity),prev=new Int32Array(size).fill(-1),heap=new Heap();dist[start]=0;heap.push([0,start]);
    const endpoints=new Map();
    remaining.forEach((path,index)=>{
      const closed=distance(path[0],path.at(-1))<1e-6;
      const positions=closed?path.map((_,i)=>i).filter(i=>i<path.length-1):[0,path.length-1];
      for(const at of positions){const id=cell(path[at]);if(!endpoints.has(id))endpoints.set(id,{index,at,closed});}
    });
    let goal=-1;
    while(heap.items.length){const [d,i]=heap.pop();if(d!==dist[i])continue;if(endpoints.has(i)){goal=i;break;}
      const x=i%gw,y=Math.floor(i/gw);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy||x+dx<0||x+dx>=gw||y+dy<0||y+dy>=gh)continue;
        const j=i+dy*gw+dx,weight=(drawn[j] ? .12 : cost[j])+(drawn[i] ? .12 : cost[i]),candidate=d+Math.hypot(dx*sx,dy*sy)*weight/2;
        if(candidate<dist[j]){dist[j]=candidate;prev[j]=i;heap.push([candidate,j]);}
      }
    }
    if(goal<0)throw new Error('Unable to connect selected facial curves');
    const chosen=endpoints.get(goal),path=remaining.splice(chosen.index,1)[0];
    if(chosen.closed){const ring=path.slice(0,-1),rotated=[...ring.slice(chosen.at),...ring.slice(0,chosen.at)];rotated.push(rotated[0]);path.splice(0,path.length,...rotated);}else if(chosen.at)path.reverse();
    const bridge=[];for(let i=goal;i!==-1;i=prev[i])bridge.push(point(i));bridge.reverse();
    let connector=simplify([route.at(-1),...bridge,path[0]],.2);
    if(input.organicRouting){for(let pass=0;pass<2;pass++){const next=[connector[0]];for(let k=1;k<connector.length;k++){const a=connector[k-1],b=connector[k];next.push([a[0]*.8+b[0]*.2,a[1]*.8+b[1]*.2],[a[0]*.2+b[0]*.8,a[1]*.2+b[1]*.8]);}next.push(connector.at(-1));connector=next;}}
    mark(connector,drawn);mark(path,drawn);
    route.push(...connector.slice(1),...path.slice(1));
    if(remaining.length%20===0)progress(`Routing facial curves: ${remaining.length} remaining`);
  }
  return [route];
}

export function generateFaceGraph(input,progress=()=>{}){
  progress('Selecting measured facial curves');const extracted=faceCurves(input);
  if(!extracted)throw new Error('No face landmarks detected. Use a clearer face photo; the face-specific collection will not invent a face.');
  if(!input.darkness.some((v,i)=>v>.01&&input.mask[i]>.6))return{results:[]};
  const {mandatory,details,shadows,field}=extracted,detail=[...mandatory,...details],rich=[...detail,...shadows];
  const results=[{id:'face-reference',name:'Facial detail reference',description:'Measured landmark curves and selected photographic edges before connecting. Multiple pen lifts; use this to assess extraction quality.',paths:detail.map(c=>c.path)}];
  results.push({id:'face-routed',name:'Detailed continuous face',description:`All ${detail.length} selected curves retained. Image-weighted routing favors existing ink and avoids bright skin. Connecting marks and retracing remain visible.`,paths:routeFaceCurves(detail,input,field,progress)});
  results.push({id:'face-shaded',name:'Shaded continuous face',description:`All ${rich.length} feature, edge and shadow strokes retained. No travel truncation; inspect the actual plotting length.`,paths:routeFaceCurves(rich,input,field,progress)});
  return{results,edgePreview:field.edges};
}
