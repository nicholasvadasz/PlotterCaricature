const routeIds=new Set(['gemini-no-retrace','gemini-ink-route','gemini-minimum-route','gemini-repaired-route']);
const nonnegative=value=>Number.isFinite(value)?Math.max(0,value):null;
export function retracedMm(result){return nonnegative(result.routing?.retracedMm);}
export function routeMetrics(result){
 const r=result.routing,o=result.optimization,f=result.plotterOptimization;
 return {
  retracedMm:retracedMm(result),
  connectorMm:(nonnegative(r?.connectorMm)??0)+(nonnegative(o?.addedConnectorMm)??0)+(nonnegative(f?.addedConnectorMm)??0),
  removedInkMm:(nonnegative(r?.removedTinyComponentMm)??0)+(nonnegative(o?.removedInkMm)??0)+(nonnegative(f?.removedInkMm)??0),
  penUpMm:nonnegative(f?.after?.penUpMm)??nonnegative(o?.after?.penUpMm)??null,
  originalInkMm:nonnegative(r?.originalInkMm),
 };
}
export function routeScore(result,settings={}){
 const m=routeMetrics(result),speed=Math.max(1,Number(settings.drawSpeed)||40);
 if(m.retracedMm===null)return Infinity;
 // Seconds of travel plus explicit ink-quality costs. Defaults are estimates,
 // not measured hardware timings; coefficients stay stable across comparisons.
 const liftSeconds=.6,retracePenalty=3,connectorPenalty=12;
 return Math.max(0,result.strokes-1)*liftSeconds+((m.penUpMm??0)+m.retracedMm*retracePenalty+m.connectorMm*connectorPenalty)/speed;
}
export function selectPreferred(drawings,mode='balanced',settings={}){
 const available=drawings.filter(r=>r.strokes>0);
 if(!available.length)return null;
 const routed=available.filter(r=>routeIds.has(r.id)&&retracedMm(r)!==null);
 let candidates=routed.length?routed:available;
 // Compare like-for-like coverage; never reward missing marks with a shorter route.
 const reference=candidates.find(r=>r.id==='gemini-no-retrace');
 const bestCoverage=reference?routeMetrics(reference).removedInkMm:Math.min(...candidates.map(r=>routeMetrics(r).removedInkMm));
 candidates=candidates.filter(r=>routeMetrics(r).removedInkMm<=bestCoverage+.01);
 const compare=(a,b)=>{
  const x=routeMetrics(a),y=routeMetrics(b),rx=x.retracedMm??Infinity,ry=y.retracedMm??Infinity;
  const fallback=()=>a.strokes-b.strokes||(x.penUpMm??Infinity)-(y.penUpMm??Infinity)||(a.lengthMm??Infinity)-(b.lengthMm??Infinity)||a.id.localeCompare(b.id);
  if(mode==='strokes')return a.strokes-b.strokes||rx-ry||x.connectorMm-y.connectorMm||fallback();
  if(mode==='overdraw')return rx-ry||x.connectorMm-y.connectorMm||fallback();
  return routeScore(a,settings)-routeScore(b,settings)||rx-ry||x.connectorMm-y.connectorMm||fallback();
 };
 return [...candidates].sort(compare)[0];
}
