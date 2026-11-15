export const STAGES = ['F', 'D', 'E', 'W'];
export const defaultRegisters = [0, 4, 6, 0, 2, 1, 0, 0];
export const defaultMemory = Array.from({length:32}, (_, i) => i === 0 ? 10 : 0);
export const presets = {
 single: {name:'One instruction', code:'ADD R3, R1, R2'},
 independent: {name:'Five independent instructions',code:'ADD R3, R1, R2\nSUB R6, R1, R2\nADD R7, R1, R2\nSUB R4, R1, R2\nADD R5, R1, R2'},
 dependency: {name:'Arithmetic dependency',code:'ADD R3, R1, R2\nSUB R4, R3, R1\nADD R5, R4, R2'},
 load: {name:'Load-use dependency',code:'LOAD R3, 0(R0)\nADD R4, R3, R1\nSUB R5, R4, R2'},
 structural: {name:'Shared memory conflict',code:'LOAD R3, 0(R0)\nADD R6, R1, R2\nSUB R7, R1, R2\nADD R4, R1, R2\nADD R5, R1, R2'},
 branch: {name:'Taken branch',code:'BEQ R1, R1, target\nADD R3, R1, R2\nSTORE R1, 1(R0)\ntarget: SUB R4, R2, R1'},
 mixed: {name:'Mixed program',code:'LOAD R3, 0(R0)\nADD R4, R3, R1\nSTORE R4, 2(R0)\nBEQ R4, R0, end\nSUB R5, R4, R2\nend: NOP'}
};
export const model = [
 'F–D–E–W is a single-issue, in-order educational pipeline. Each cycle lasts 2 ns by default. R0 is always zero. R1–R7 hold signed 32-bit integers. Memory has 32 word-addressed cells, 0–31.',
 'Write commits at the start of a cycle. Decode reads operands at the end of that cycle, so a Write and a Decode may use the same register in one cycle.',
 'ADD, SUB, NOP and BEQ occupy Execute for one cycle. LOAD and STORE occupy Execute for two cycles. Their memory access happens at the end of the second Execute cycle.',
 'Forwarding sends a result from the end of Execute to the Decode operand latch for use in Execute next cycle. An adjacent arithmetic dependency needs no stall with forwarding. A load-use pair still waits for the two-cycle Execute unit.',
 'Without forwarding, Decode waits until the producer reaches Write. With forwarding, Decode may use the final Execute result. Execute backpressure holds Decode and Fetch. The pipeline never issues out of order.',
 'With the wait-for-branch option, new Fetch pauses while a branch occupies Decode or Execute. The default predicts not taken. Branches predict not taken and resolve at the end of Execute. A taken BEQ flushes younger instructions in Fetch and Decode. Target fetching starts next cycle. Branches and NOPs retire through Write.',
 'A memory transaction reserves the shared port for both Execute cycles of LOAD or STORE (address phase then data phase), blocking new Fetch requests. Split instruction/data memory removes that fetch conflict. Data accesses remain in order.',
 'STORE changes memory at the end of Execute. LOAD reads memory then and writes its destination register in Write. Operands are latched in Decode. Arithmetic wraps to signed 32 bits. Invalid addresses stop execution with an explanation.',
 'Sequential mode fetches only when all four stages are empty. Simulations stop after 256 cycles. Timing charts show dynamic instances, including flushed instances. Counts of completed instructions exclude flushed instructions.'
];
function reg(token, line) {
 if (!/^R[0-7]$/i.test(token)) throw new Error('Line '+line+': expected register R0–R7, received '+token);
 return Number(token.slice(1));
}
export function parseProgram(source) {
 if (typeof source !== 'string' || source.length > 12000) throw new Error('Program must be text of at most 12,000 characters.');
 const labels = new Map(), pending = [];
 source.split(/\r?\n/).forEach((raw,index) => {
  let text = raw.split(';')[0].trim();
  const label = text.match(/^([A-Za-z_]\w*):/);
  if (label) {
   if(labels.has(label[1])) throw new Error('Line '+(index+1)+': duplicate label '+label[1]);
   labels.set(label[1],pending.length); text=text.slice(label[0].length).trim();
  }
  if(text) pending.push({text,line:index+1});
 });
 if (!pending.length || pending.length > 64) throw new Error('Enter 1–64 instructions.');
 return pending.map(({text,line},pc) => {
  const [op,...rest] = text.split(/\s+/), kind=op.toUpperCase();
  const args=rest.join(' ').split(',').map(s=>s.trim());
  const instruction={op:kind,text,line,pc,src:[],dest:null,cycles:1};
  if(['ADD','SUB','BEQ'].includes(kind)) {
   if(args.length!==3) throw new Error('Line '+line+': '+kind+' requires three operands separated by commas.');
   if(kind==='BEQ') {
    instruction.src=[reg(args[0],line),reg(args[1],line)];
    if(!labels.has(args[2])) throw new Error('Line '+line+': unknown branch label '+args[2]);
    instruction.target=labels.get(args[2]);
   } else {
    instruction.dest=reg(args[0],line); instruction.src=[reg(args[1],line),reg(args[2],line)];
   }
  } else if(['LOAD','STORE'].includes(kind)) {
   if(args.length!==2) throw new Error('Line '+line+': use '+kind+' Rn, offset(Rbase).');
   const address=args[1].match(/^(-?\d+)\s*\(\s*(R[0-7])\s*\)$/i);
   if(!address) throw new Error('Line '+line+': expected word offset(R0–R7).');
   instruction.offset=Number(address[1]);
   if(!Number.isSafeInteger(instruction.offset) || Math.abs(instruction.offset)>10000) throw new Error('Line '+line+': offset is out of range.');
   instruction.base=reg(address[2],line);
   instruction.src=kind==='STORE'?[reg(args[0],line),instruction.base]:[instruction.base];
   if(kind==='LOAD') instruction.dest=reg(args[0],line);
   instruction.cycles=2;
  } else if(kind!=='NOP' || rest.length) throw new Error('Line '+line+': unsupported instruction or operands. Use ADD, SUB, LOAD, STORE, BEQ or NOP.');
  return instruction;
 });
}
function validateValues(values,length,name) {
 if(!Array.isArray(values)||values.length!==length||values.some(v=>!Number.isInteger(v)||v < -2147483648||v >2147483647)) throw new Error(name+' requires '+length+' signed 32-bit integers.');
 return [...values];
}
const clone = value => JSON.parse(JSON.stringify(value));
export function simulate(source, options={}) {
 const program=parseProgram(source);
 const registers=validateValues(options.registers??defaultRegisters,8,'Registers'); registers[0]=0;
 const memory=validateValues(options.memory??defaultMemory,32,'Memory');
 const forwarding=options.forwarding??true, sharedMemory=options.sharedMemory??false, sequential=options.mode==='sequential';
 const maxCycles=Math.min(256,Math.max(1,options.maxCycles??256));
 const instances=[], snapshots=[];
 let slots=[null,null,null,null], pc=0, completed=0, error=null;
 const snapshot=(cycle,events,stalls=[],forwarded=[],flushed=[],changes=[]) => ({
  cycle,slots:slots.map(id=>id===null?null:clone(instances[id])),registers:[...registers],memory:[...memory],
  completed,pc,events,stalls,forwarded,flushed,changes
 });
 snapshots.push(snapshot(0,['Ready. Advance one cycle to fetch the first instruction.']));
 for(let cycle=1;cycle<=maxCycles;cycle++) {
  const events=[],stalls=[],forwarded=[],flushed=[],changes=[];
  const executing=slots[2]===null?null:instances[slots[2]];
  const memoryBusy=executing && ['LOAD','STORE'].includes(executing.op);
  if(slots[0]===null && pc<program.length && (!sequential || slots.every(s=>s===null))) {
   if(options.branchPolicy==='wait' && slots.slice(1,3).some(id=>id!==null&&instances[id].op==='BEQ')) {stalls.push({stage:'F',reason:'Fetch waits until the branch resolves.'});}
   else if(sharedMemory && memoryBusy) {stalls.push({stage:'F',reason:'Shared memory is serving '+executing.label+'. Fetch waits.'});}
   else {
    const instance={...program[pc],id:instances.length,label:'I'+(instances.length+1),remaining:program[pc].cycles,values:[],history:{},status:'active'};
    instances.push(instance);slots[0]=instance.id;pc++;events.push(instance.label+' fetched from line '+instance.line+'.');
   }
  }
  slots.forEach((id,stage)=>{if(id!==null) instances[id].history[cycle]=STAGES[stage];});
  if(slots[3]!==null) {
   const w=instances[slots[3]];
   if(w.dest!==null && w.dest!==0) {const before=registers[w.dest];registers[w.dest]=w.result;changes.push({kind:'register',index:w.dest,before,after:w.result});}
   w.status='completed';completed++;events.push(w.label+' completed'+(w.dest ? ' and wrote R'+w.dest+' = '+w.result : '')+'.');
  }
  let executeDone=false,taken=false;
  if(executing) {
   executing.remaining--;
   executeDone=executing.remaining===0;
   if(executeDone) {
    const [a,b]=executing.values;
    if(executing.op==='ADD') executing.result=(a+b)|0;
    if(executing.op==='SUB') executing.result=(a-b)|0;
    if(['LOAD','STORE'].includes(executing.op)) {
     const base=executing.op==='LOAD'?a:b, address=base+executing.offset;
     if(!Number.isInteger(address)||address<0||address>=32) error=executing.label+' on line '+executing.line+': memory address '+address+' is outside 0–31.';
     else if(executing.op==='LOAD') {executing.result=memory[address];events.push(executing.label+' loaded M['+address+'] = '+executing.result+'.');}
     else {changes.push({kind:'memory',index:address,before:memory[address],after:a});memory[address]=a;events.push(executing.label+' stored '+a+' in M['+address+'].');}
    }
    if(executing.op==='BEQ') {
     taken=a===b;
     events.push(executing.label+' branch '+(taken?'taken to instruction '+(executing.target+1):'not taken')+'.');
     if(taken) {
      pc=executing.target;
      for(const id of slots.slice(0,2)) if(id!==null) {
       instances[id].status='flushed';instances[id].history[cycle]+='×';flushed.push(id);
       events.push(instances[id].label+' flushed before execution.');
      }
     }
    } else events.push(executing.label+' finished Execute.');
   } else events.push(executing.label+' uses Execute for its first memory cycle.');
  }
  let decodeReady=true;
  if(slots[1]!==null && !taken) {
   const d=instances[slots[1]];
   if(executing && !executeDone) {decodeReady=false;stalls.push({stage:'D',id:d.id,reason:'Execute is occupied by '+executing.label+' for a second cycle.'});}
   const values=[];
   for(const source of d.src) {
    if(source!==0 && executing?.dest===source) {
     if(forwarding && executeDone && !error) {values.push(executing.result);forwarded.push({from:executing.id,to:d.id,register:source,value:executing.result});}
     else {decodeReady=false;stalls.push({stage:'D',id:d.id,reason:d.label+' needs R'+source+' from '+executing.label+'; wait for '+(forwarding?'the end of Execute':'Write')+'.'});}
    } else values.push(registers[source]);
   }
   if(decodeReady) {d.values=values;events.push(d.label+' decoded and latched its operands.');}
   else {
    d.history[cycle]='D·';
    if(slots[0]!==null) {instances[slots[0]].history[cycle]='F·';stalls.push({stage:'F',id:slots[0],reason:'Fetch is held behind Decode.'});}
   }
  }
  forwarded.forEach(f=>events.push('Forward R'+f.register+' = '+f.value+' from I'+(f.from+1)+' to I'+(f.to+1)+'.'));
  stalls.forEach(s=>events.push(s.reason));
  snapshots.push(snapshot(cycle,events,stalls,forwarded,flushed,changes));
  if(error) break;
  const nextW=executeDone?slots[2]:null;
  const nextE=executing&&!executeDone?slots[2]:(!taken&&decodeReady?slots[1]:null);
  const nextD=taken?null:(decodeReady?slots[0]:slots[1]);
  const nextF=taken||decodeReady?null:slots[0];
  slots=[nextF,nextD,nextE,nextW];
  if(pc>=program.length && slots.every(s=>s===null)) break;
 }
 const limited=!error && (pc<program.length || slots.some(s=>s!==null));
 if(limited) error='Execution stopped at '+maxCycles+' cycles. A loop or long program reached the safety limit.';
 return {snapshots,instances,cycles:snapshots.length-1,completed,registers,memory,error,limited,program};
}

