// A full batch can run together; overlapping batches wait instead of losing work.
export class JobPool {
  constructor(limit){this.limit=limit;this.active=0;this.waiting=[];}
  acquire(signal){
    return new Promise((resolve,reject)=>{
      if(signal.aborted)return reject(signal.reason);
      const job={start:()=>{
        signal.removeEventListener('abort',cancel);this.active++;
        let released=false;
        resolve(()=>{if(released)return;released=true;this.active--;this.drain();});
      }};
      const cancel=()=>{this.waiting=this.waiting.filter(j=>j!==job);reject(signal.reason);};
      signal.addEventListener('abort',cancel,{once:true});
      this.waiting.push(job);this.drain();
    });
  }
  drain(){while(this.active<this.limit&&this.waiting.length)this.waiting.shift().start();}
}
