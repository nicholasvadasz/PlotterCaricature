import { blur, clamp, sample, simplify } from './geometry.js';
import { rng, particleTour } from './portrait.js';

export function contrastTarget(input, focus = input.edgeFocus ?? 0.75) {
  const {darkness:d,mask,width:w,height:h} = input, fine=blur(d,w,h,1), broad=blur(d,w,h,Math.max(2,Math.round(w/90)));
  const target=new Float32Array(d.length);
  // Landmarks only weight existing photographic contrast; no landmark lines are drawn.
  const boxes=(input.features||[]).map(path=>{const xs=path.map(p=>p[0]),ys=path.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];});
  const face=boxes[0],features=boxes.slice(1),margin=w*.012;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++) {
    const i=y*w+x;if(mask[i]<0.6)continue;
    const edge=Math.hypot(fine[i+1]-fine[i-1],fine[i+w]-fine[i-w]);
    const detail=clamp(edge*3.8+Math.max(0,fine[i]-broad[i])*3);
    // Keep a little deep shadow; flat cheeks and clothing get much less ink.
    let weight=1;
    if(face&&y>face[3]+margin)weight=.2;
    if(features.some(b=>x>b[0]-margin&&x<b[2]+margin&&y>b[1]-margin&&y<b[3]+margin))weight=2.5;
    target[i]=clamp(((1-focus)*d[i]+focus*Math.max(detail,d[i]**4*0.2))*weight*(1+focus*.7));
  }
  return target;
}

/** Persistent, damped spring pressure model. k = floor + gain * brightness.
 * Equal/opposite short-range pair forces, a weak target-gradient attraction,
 * and velocity damping move particles; changing a frame preserves IDs and route.
 * This is an explicit approximation of the blog mechanism, not its unpublished equations.
 */
export class SpringPortrait {
  constructor(input) {
    this.w=input.width;this.h=input.height;this.random=rng(input.seed??42);
    this.n=Math.round(input.gesturePoints??2200);this.x=new Float32Array(this.n);this.y=new Float32Array(this.n);
    this.vx=new Float32Array(this.n);this.vy=new Float32Array(this.n);this.order=Int32Array.from({length:this.n},(_,i)=>i);this.position=this.order.slice();
    this.stiffness=new Float32Array(this.n);this.next=new Int32Array(this.n);this.iteration=0;
    this.update(input);this.n=this.valid.length&&this.target.some(v=>v>.01)?this.n:0;
    // Tone-weighted seeding gets a legible first preview; springs continue moving all particles.
    for(let i=0;i<this.n;i++)this.seedPoint(i,true);
    this.radius=Math.max(3,Math.sqrt(Math.max(1,this.valid.length)/Math.max(1,this.n))*2.1);
    this.cols=Math.ceil(this.w/this.radius);this.rows=Math.ceil(this.h/this.radius);this.head=new Int32Array(this.cols*this.rows);
    if(this.n) {
      const points=Array.from({length:this.n},(_,i)=>[this.x[i],this.y[i]]),ids=new Map(points.map((p,i)=>[p,i]));
      const tour=particleTour(points);
      tour[0]?.forEach((p,i)=>{const id=ids.get(p);this.order[i]=id;this.position[id]=i;});
    }
  }
  update(input) {
    if(input.width!==this.w||input.height!==this.h)throw new Error('Live frame dimensions must remain fixed');
    this.mask=input.mask;this.target=contrastTarget(input);this.hasTone=this.target.some(v=>v>.01);this.valid=[];
    for(let y=3;y<this.h-3;y++)for(let x=3;x<this.w-3;x++)if(this.mask[y*this.w+x]>0.6)this.valid.push(y*this.w+x);
    this.springGain=input.springGain??1.2;this.edgeFocus=input.edgeFocus??0.75;
    for(let i=0;i<this.n;i++)if(!this.inside(this.x[i],this.y[i]))this.seedPoint(i,false);
  }
  inside(x,y) {return x>=3&&y>=3&&x<this.w-3&&y<this.h-3&&sample(this.mask,this.w,this.h,x,y)>0.6;}
  seedPoint(i,weighted) {
    if(!this.valid.length)return;
    let p=0;
    for(let tries=0;tries<300;tries++) {p=this.valid[Math.floor(this.random()*this.valid.length)];if(!weighted||this.random()<0.001+this.target[p]**1.5)break;}
    this.x[i]=p%this.w;this.y[i]=Math.floor(p/this.w);this.vx[i]=this.vy[i]=0;
  }
  grid() {
    this.head.fill(-1);
    for(let i=0;i<this.n;i++) {const cell=Math.floor(this.y[i]/this.radius)*this.cols+Math.floor(this.x[i]/this.radius);this.next[i]=this.head[cell];this.head[cell]=i;}
  }
  neighbors(i,visit) {
    const cx=Math.floor(this.x[i]/this.radius),cy=Math.floor(this.y[i]/this.radius);
    for(let y=Math.max(0,cy-1);y<=Math.min(this.rows-1,cy+1);y++)for(let x=Math.max(0,cx-1);x<=Math.min(this.cols-1,cx+1);x++)for(let j=this.head[y*this.cols+x];j!==-1;j=this.next[j])visit(j);
  }
  step() {
    if(!this.n||!this.valid.length||!this.hasTone)return;
    this.grid();const fx=new Float32Array(this.n),fy=new Float32Array(this.n),r=this.radius;
    for(let i=0;i<this.n;i++)this.stiffness[i]=0.025+this.springGain*(1-sample(this.target,this.w,this.h,this.x[i],this.y[i]));
    for(let i=0;i<this.n;i++)this.neighbors(i,j=>{
      if(j<=i)return;let dx=this.x[i]-this.x[j],dy=this.y[i]-this.y[j],dist=Math.hypot(dx,dy);if(dist>=r)return;
      if(dist<0.001){const theta=this.random()*Math.PI*2;dx=Math.cos(theta)*0.01;dy=Math.sin(theta)*0.01;dist=0.01;}
      const k=(this.stiffness[i]+this.stiffness[j])/2,force=k*(1-dist/r)*0.11;
      dx=dx/dist*force;dy=dy/dist*force;fx[i]+=dx;fy[i]+=dy;fx[j]-=dx;fy[j]-=dy;
    });
    for(let i=0;i<this.n;i++) {
      const x=this.x[i],y=this.y[i],at=(xx,yy)=>sample(this.target,this.w,this.h,xx,yy);
      // Separate, documented attraction helps a still-photo simulation converge toward features.
      fx[i]+=(at(x+2,y)-at(x-2,y))*0.42;fy[i]+=(at(x,y+2)-at(x,y-2))*0.42;
      this.vx[i]=(this.vx[i]+fx[i])*0.72;this.vy[i]=(this.vy[i]+fy[i])*0.72;
      const speed=Math.hypot(this.vx[i],this.vy[i]),limit=Math.max(0.4,r*0.12);
      if(speed>limit){this.vx[i]*=limit/speed;this.vy[i]*=limit/speed;}
      const nx=x+this.vx[i],ny=y+this.vy[i];
      if(this.inside(nx,ny)){this.x[i]=nx;this.y[i]=ny;}else {this.vx[i]*=-0.25;this.vy[i]*=-0.25;}
    }
    this.iteration++;this.improveRoute(32);
  }
  improveRoute(maxSwaps=32) {
    if(this.n<4)return;this.grid();let swaps=0;
    const distance=(a,b)=>Math.hypot(this.x[a]-this.x[b],this.y[a]-this.y[b]);
    // Keep the existing permutation. Only accept local reversals that shorten the current route.
    const offset=(this.iteration*97)%this.n;
    for(let k=0;k<Math.min(this.n,600)&&swaps<maxSwaps;k++) {
      const i=(k+offset)%(this.n-2),a=this.order[i];
      this.neighbors(a,c=>{
        if(swaps>=maxSwaps)return;const j=this.position[c];if(j<=i+1||j>=this.n-1)return;
        const b=this.order[i+1],d=this.order[j+1];
        if(distance(a,c)+distance(b,d)+0.001>=distance(a,b)+distance(c,d))return;
        for(let lo=i+1,hi=j;lo<hi;lo++,hi--){[this.order[lo],this.order[hi]]=[this.order[hi],this.order[lo]];this.position[this.order[lo]]=lo;this.position[this.order[hi]]=hi;}
        swaps++;
      });
    }
  }
  path() { return this.hasTone&&this.valid.length?Array.from(this.order.slice(0,this.n),i=>[this.x[i],this.y[i]]):[]; }
}

export const pathLength = path => path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0);

export function softenGesture(path) {
  if(path.length<3)return path;
  const out=[path[0]];
  for(let i=0;i<path.length-1;i++) {const a=path[i],b=path[i+1];out.push([a[0]*.8+b[0]*.2,a[1]*.8+b[1]*.2],[a[0]*.2+b[0]*.8,a[1]*.2+b[1]*.8]);}
  out.push(path.at(-1));return out;
}

// Remove low-information bends throughout the route, preserving its endpoints and
// whole-portrait coverage instead of stopping halfway through a tour.
export function fitTravel(path, budget, target, w, h) {
  let out=path.map(p=>[...p]);let length=pathLength(out);
  while(length>budget&&out.length>2) {
    const candidates=[];
    for(let i=1;i<out.length-1;i++) {
      const a=out[i-1],b=out[i],c=out[i+1],saving=Math.hypot(a[0]-b[0],a[1]-b[1])+Math.hypot(b[0]-c[0],b[1]-c[1])-Math.hypot(a[0]-c[0],a[1]-c[1]);
      if(saving>1e-5)candidates.push({i,score:saving/(0.1+sample(target,w,h,...b)*3)});
    }
    if(!candidates.length)break;candidates.sort((a,b)=>b.score-a.score);
    const remove=new Set(),limit=Math.max(1,Math.round(out.length*0.06));
    for(const c of candidates){if(remove.size>=limit)break;if(!remove.has(c.i-1)&&!remove.has(c.i+1))remove.add(c.i);}
    out=out.filter((_,i)=>!remove.has(i));length=pathLength(out);
  }
  out=softenGesture(out);
  return {path:out,withinBudget:pathLength(out)<=budget+0.001};
}

// Residual-guided connected scribble. Candidates are sampled quadratic curves;
// score rewards missing ink and penalizes crossing white or already-filled regions.
export function residualScribble(input, options = {}) {
  const {width:w,height:h,mask,seed=42,travelBudget=3,paperWidth=180}=input,target=options.target||contrastTarget(input),random=rng(seed);
  const residual=target.slice(),budget=travelBudget*1000*w/paperWidth;
  let start=0;for(let i=1;i<target.length;i++)if(target[i]>target[start])start=i;
  if(target[start]<0.01)return [];
  const path=options.prefix?.length?options.prefix.map(p=>[...p]):[[start%w,Math.floor(start/w)]];
  let p=path.at(-1),direction=path.length>1?Math.atan2(p[1]-path.at(-2)[1],p[0]-path.at(-2)[0]):0,travel=pathLength(path);
  // Charge all existing strokes and bridges to the residual and the travel budget.
  const debit=q=>{for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=Math.round(q[0])+dx,y=Math.round(q[1])+dy;if(x>=0&&y>=0&&x<w&&y>=0&&y<h)residual[y*w+x]-=(options.inkDeposit??.2)*Math.exp(-(dx*dx+dy*dy)/3);}};
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],n=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/1.3));for(let j=1;j<=n;j++)debit([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);}
  const candidatesPool=[];for(let i=0;i<target.length;i+=3)if(target[i]>.08&&mask[i]>.6)candidatesPool.push(i);
  const evaluate=curve=>{let score=0;for(const [x,y]of curve){const i=Math.round(y)*w+Math.round(x);score+=residual[i]-.18*(1-target[i]);}return score/curve.length;};
  for(let stroke=0;stroke<2400&&travel<budget;stroke++) {
    let best=null,bestScore=-Infinity;
    let goal=p,goalScore=-Infinity;
    for(let k=0;k<250&&candidatesPool.length;k++) {const index=candidatesPool[Math.floor(random()*candidatesPool.length)],q=[index%w,Math.floor(index/w)],score=residual[index]/(1+Math.hypot(q[0]-p[0],q[1]-p[1])/w*.4);if(score>goalScore){goalScore=score;goal=q;}}
    for(let attempt=0;attempt<45;attempt++) {
      let angle=direction+(random()-.5)*Math.PI*1.7,len=w*(.006+random()*.04);
      if(options.edgeField&&attempt<18){
        const field=options.edgeField,i=Math.round(p[1])*w+Math.round(p[0]);
        if(field.magnitude[i]>.015){angle=Math.atan2(field.ty[i],field.tx[i])+(attempt%2?Math.PI:0)+(random()-.5)*.45;len=w*(.003+random()*.018);}
      }
      if(attempt>32&&candidatesPool.length){const dx=goal[0]-p[0],dy=goal[1]-p[1];angle=Math.atan2(dy,dx)+(random()-.5)*.5;len=Math.min(Math.hypot(dx,dy),w*(.05+random()*.2));}
      len=Math.min(len,budget-travel);if(len<.5)continue;
      const end=[clamp(p[0]+Math.cos(angle)*len,3,w-4),clamp(p[1]+Math.sin(angle)*len,3,h-4)];
      const bend=(random()-.5)*len*(options.edgeField&&attempt<18?.16:.6),control=[(p[0]+end[0])/2-Math.sin(angle)*bend,(p[1]+end[1])/2+Math.cos(angle)*bend],curve=[];
      const steps=Math.max(3,Math.ceil(len/1.3));let valid=true;
      for(let i=1;i<=steps;i++){const t=i/steps,q=[(1-t)**2*p[0]+2*(1-t)*t*control[0]+t*t*end[0],(1-t)**2*p[1]+2*(1-t)*t*control[1]+t*t*end[1]];if(q[0]<2||q[1]<2||q[0]>=w-2||q[1]>=h-2){valid=false;break;}curve.push(q);}
      if(!valid)continue;const toward=(Math.hypot(goal[0]-p[0],goal[1]-p[1])-Math.hypot(goal[0]-end[0],goal[1]-end[1]))/Math.max(1,len);
      const score=evaluate(curve)+toward*.24+random()*.018;
      if(score>bestScore){bestScore=score;best={curve,angle};}
    }
    if(!best)break;
    for(const q of best.curve){const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(travel+d>budget)break;path.push(q);travel+=d;p=q;
      debit(q);
    }
    direction=best.angle;
  }
  return path.length>1?[simplify(path,.12)]:[];
}

export function generateGestures(input,progress=()=>{}) {
  const results=[];
  for(const [id,name,focus,count]of [['spring','Spring single-line',input.edgeFocus??.75,input.gesturePoints??2200],['sparse','Sparse contrast gesture',.95,Math.round((input.gesturePoints??2200)*.5)]]) {
    const model=new SpringPortrait({...input,edgeFocus:focus,gesturePoints:count});
    for(let tick=0;tick<(input.springSteps??120);tick++){model.step();if(tick%20===0)progress(`${name}: spring step ${tick+1}`);}
    const fit=fitTravel(model.path(),(input.travelBudget??3)*1000*input.width/(input.paperWidth??180),model.target,input.width,input.height);
    results.push({id,name,description:`Brightness-dependent spring pressure and a persistent route. ${fit.withinBudget?'Within pen-travel budget.':'Endpoint span exceeds budget.'} Connecting lines remain visible.`,paths:fit.path.length>1?[fit.path]:[]});
  }
  progress('Residual scribble');results.push({id:'scribble',name:'Residual scribble',description:'A connected sequence of curved gestures seeks missing contrast and avoids repeatedly filling the same area. May omit features or cross highlights.',paths:residualScribble(input)});
  return results;
}
