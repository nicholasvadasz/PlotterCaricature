export async function generateWithBackend(input,signal,progress){
  return portraitRequest({engine:input.collection,width:input.width,height:input.height,darkness:Array.from(input.darkness,v=>Math.round(v*65535)/65535),seed:input.seed,tspPoints:input.tspPoints,tspIterations:input.tspIterations,tspSeconds:input.tspSeconds,tspTone:input.tspTone,sldIterations:input.sldIterations},signal,progress);
}
export async function portraitRequest(payload,signal,progress){
  const response=await fetch('/api/portrait',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(payload)});
  if(!response.ok){const message=await response.json().catch(()=>({error:'Local backend unavailable. Run npm run dev with the Python backend installed.'}));throw new Error(message.error);}
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',results;
  function consume(line){if(!line.trim())return;const event=JSON.parse(line);if(event.error)throw new Error(event.error);if(event.progress)progress(event.progress);if(event.results)results=event.results;}
  try{while(true){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let end;while((end=pending.indexOf('\n'))>=0){consume(pending.slice(0,end));pending=pending.slice(end+1);}}pending+=decoder.decode();consume(pending);}finally{await reader.cancel().catch(()=>{});}
  if(!results)throw new Error('Backend ended without a drawing');return results;
}
