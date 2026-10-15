export async function recordActivity(event,context){
 try{
  const response=await fetch('/api/telemetry/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,context}),keepalive:true});
  if(!response.ok)throw new Error('Activity save failed');
  return null;
 }catch{return 'Activity log could not be saved. Check that the local server is running.';}
}
