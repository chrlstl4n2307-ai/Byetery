import {DomainError,ensure} from '../domain.ts';
export class ExecutionSupervisor {
  private stopping=false;
  private readonly tasks=new Map<string,Promise<unknown>>();
  private readonly phases=new Map<string,string>();
  private readonly children=new Set<number>();
  get accepting(){return !this.stopping;}
  get active(){return this.tasks.size;}
  get helperCount(){return this.children.size;}
  snapshot(){return {stopping:this.stopping,operations:[...this.phases].map(([operationId,phase])=>({operationId,phase})),helpers:this.children.size};}
  assertAdmission(){ensure(!this.stopping,'RuntimeStopping');}
  childStarted(pid:number){this.children.add(pid);}
  childClosed(pid:number){this.children.delete(pid);}
  async phase<T>(id:string,name:string,work:()=>Promise<T>,persistence=false):Promise<T>{
    if(!persistence)this.assertAdmission();
    this.phases.set(id,name);
    try{return await work();}finally{this.phases.delete(id);}
  }
  run<T>(id:string,work:()=>Promise<T>):Promise<T>{
    this.assertAdmission();
    const prior=this.tasks.get(id);if(prior)return prior as Promise<T>;
    const task=Promise.resolve().then(work);this.tasks.set(id,task);
    void task.finally(()=>{this.tasks.delete(id);}).catch(()=>{});
    return task;
  }
  stop(){this.stopping=true;}
  async drain(milliseconds=120000):Promise<void>{
    this.stop();ensure(Number.isSafeInteger(milliseconds)&&milliseconds>0,'InvalidDrainBudget');
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      await Promise.race([Promise.allSettled([...this.tasks.values()]),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new DomainError('SHUTDOWN_INCOMPLETE_REVIEW_REQUIRED')),milliseconds);
      })]);
      ensure(this.children.size===0,'SHUTDOWN_INCOMPLETE_REVIEW_REQUIRED');
    }finally{clearTimeout(timer);}
  }
}
