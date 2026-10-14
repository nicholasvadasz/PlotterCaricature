import { SpringPortrait, fitTravel } from './gesture.js';
let model,input,timer,previous=0;
function tick() {
  try {
    const start=performance.now();for(let i=0;i<3;i++)model.step();
    const now=performance.now();self.postMessage({preview:model.path(),iteration:model.iteration,computeMs:now-start,fps:previous?1000/(now-previous):0});previous=now;
    timer=setTimeout(tick,Math.max(10,65-(now-start)));
  }catch(error){self.postMessage({error:error.message});}
}
self.onmessage=({data})=>{
  try {
    if(data.type==='start'){clearTimeout(timer);input=data.input;model=new SpringPortrait(input);tick();}
    if(data.type==='frame'){input=data.input;if(model.n)model.update(input);else model=new SpringPortrait(input);self.postMessage({frameAccepted:true});}
    if(data.type==='freeze'){
      clearTimeout(timer);const fit=fitTravel(model.path(),input.travelBudget*1000*input.width/input.paperWidth,model.target,input.width,input.height);
      self.postMessage({results:[{id:'live-spring',name:'Frozen spring gesture',description:'Frozen from persistent brightness-driven spring dynamics. Travel-budget simplification can introduce bridges across highlights.',paths:fit.path.length>1?[fit.path]:[]}]});
    }
  }catch(error){self.postMessage({error:error.message});}
};
