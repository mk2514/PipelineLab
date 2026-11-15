import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,parseProgram,presets,defaultRegisters} from '../dist/engine.mjs';
import {calculate,numericMatches} from '../dist/numeric.mjs';
import {recoverData,readData,writeData,freshData} from '../dist/persistence.mjs';
import {lessons,questions,presentationSteps} from '../dist/content.mjs';
const ideal={n:5,k:4,delays:[2,2,2,2],unit:'ns'};
test('verified equal-stage example and simulation agree',()=>{
 const r=calculate(ideal),s=simulate(presets.independent.code);
 assert.equal(r.sequential,40);assert.equal(r.cycles,8);assert.equal(r.pipelined,16);assert.equal(r.speedup,2.5);assert.equal(r.efficiency,.625);
 assert.equal(s.cycles,r.cycles);assert.equal(simulate(presets.independent.code,{mode:'sequential'}).cycles*2,r.sequential);
});
test('single instruction fills and drains in four cycles',()=>{
 const r=simulate(presets.single.code);assert.equal(r.cycles,4);assert.equal(r.completed,1);assert.equal(r.registers[3],10);
 assert.deepEqual(r.instances[0].history,{1:'F',2:'D',3:'E',4:'W'});
});
test('unequal delays use max clock and sum baseline',()=>{
 const r=calculate({...ideal,delays:[1,2,3,4]});assert.equal(r.clock,4);assert.equal(r.sequential,50);assert.equal(r.pipelined,32);assert.equal(r.efficiency,null);
});
test('overhead affects pipeline clock only',()=>{
 const r=calculate({...ideal,overhead:1});assert.equal(r.clock,3);assert.equal(r.pipelined,24);assert.equal(r.sequential,40);assert.equal(r.efficiency,null);
});
test('additional total lost cycles',()=>{const r=calculate({...ideal,stalls:3});assert.equal(r.cycles,11);assert.equal(r.pipelined,22);});
test('arithmetic dependency and forwarding preserve results',()=>{
 const code='ADD R3, R1, R2\nSUB R4, R3, R1';
 const on=simulate(code),off=simulate(code,{forwarding:false});
 assert.equal(on.cycles,5);assert.equal(off.cycles,6);assert.deepEqual(on.registers,off.registers);assert.equal(on.registers[4],6);
 assert.equal(on.snapshots[3].forwarded[0].register,3);assert.equal(off.instances[1].history[3],'D·');
});
test('write at start can feed decode at end in the same cycle',()=>{
 const r=simulate('ADD R3, R1, R2\nSUB R4, R3, R1',{forwarding:false});
 assert.equal(r.instances[1].history[4],'D');assert.equal(r.instances[1].history[5],'E');assert.equal(r.registers[4],6);
});
test('load-use keeps one structural wait with forwarding',()=>{
 const on=simulate('LOAD R3, 0(R0)\nADD R4, R3, R1');
 const off=simulate('LOAD R3, 0(R0)\nADD R4, R3, R1',{forwarding:false});
 assert.equal(on.cycles,6);assert.equal(off.cycles,7);assert.equal(on.registers[4],14);
 assert.equal(on.instances[1].history[3],'D·');assert.equal(on.instances[1].history[4],'D');
});
test('shared memory introduces an actual fetch conflict',()=>{
 const code=presets.structural.code,split=simulate(code),shared=simulate(code,{sharedMemory:true});
 assert.ok(shared.cycles>split.cycles);assert.deepEqual(split.registers,shared.registers);
 assert.ok(shared.snapshots.some(s=>s.stalls.some(x=>x.reason.includes('Shared memory'))));
});
test('taken branch flushes both younger instructions without their side effects',()=>{
 const r=simulate(presets.branch.code);assert.equal(r.completed,2);assert.equal(r.registers[3],0);assert.equal(r.memory[1],0);assert.equal(r.registers[4],2);
 assert.equal(r.instances.filter(i=>i.status==='flushed').length,2);
});
test('not-taken branch retains fall-through instructions',()=>{
 const r=simulate('BEQ R1, R2, end\nADD R3, R1, R2\nend: NOP');
 assert.equal(r.completed,3);assert.equal(r.registers[3],10);assert.equal(r.instances.filter(i=>i.status==='flushed').length,0);
});
test('wait-for-branch policy avoids wrong-path fetch',()=>{
 const r=simulate(presets.branch.code,{branchPolicy:'wait'});assert.equal(r.instances.filter(i=>i.status==='flushed').length,0);assert.equal(r.registers[4],2);
});
test('store and load use ordered word memory and forwarded operands',()=>{
 const r=simulate('ADD R3, R1, R2\nSTORE R3, 2(R0)\nLOAD R4, 2(R0)');
 assert.equal(r.memory[2],10);assert.equal(r.registers[4],10);
});
test('newest in-flight writer supplies the dependency',()=>{
 const r=simulate('ADD R3, R1, R2\nSUB R3, R1, R2\nADD R4, R3, R1');
 assert.equal(r.registers[4],2);
});
test('zero register and signed arithmetic',()=>{
 const r=simulate('ADD R0, R1, R2\nADD R3, R0, R1');assert.equal(r.registers[0],0);assert.equal(r.registers[3],4);
 const registers=[...defaultRegisters];registers[1]=2147483647;registers[2]=1;
 assert.equal(simulate(presets.single.code,{registers}).registers[3],-2147483648);
});
test('exact prior state snapshots survive subsequent execution',()=>{
 const r=simulate(presets.mixed.code),saved=JSON.stringify(r.snapshots[4]);
 let cursor=4;cursor++;cursor--;assert.equal(JSON.stringify(r.snapshots[cursor]),saved);
 r.registers[3]=999;assert.notEqual(r.snapshots[4].registers[3],999);
});
test('invalid syntax gives line-specific errors',()=>{
 for(const code of ['NOP\nMUL R1,R2,R3','ADD R9,R1,R2','BEQ R1,R2,missing','STORE R1, cats','NOP R1','x: NOP\nx: NOP'])assert.throws(()=>parseProgram(code),/Line/);
 assert.throws(()=>parseProgram(''));assert.throws(()=>parseProgram(Array(65).fill('NOP').join('\n')));
});
test('invalid addresses and loops stop safely',()=>{
 assert.match(simulate('LOAD R1, 32(R0)').error,/outside/);
 const r=simulate('loop: BEQ R0, R0, loop');assert.equal(r.cycles,256);assert.equal(r.limited,true);
});
test('numeric validation and equivalent units',()=>{
 assert.throws(()=>calculate({...ideal,n:0}));assert.throws(()=>calculate({...ideal,delays:[2,0,2,2]}));assert.throws(()=>calculate({...ideal,overhead:-1}));assert.throws(()=>calculate({...ideal,stalls:.5}));
 assert.ok(numericMatches('0.016 μs',16,'ns'));assert.ok(numericMatches('16000 ps',16,'ns'));assert.ok(numericMatches('2.50x',2.5,'x'));assert.ok(numericMatches('33.33%',100/3,'%'));assert.equal(numericMatches('16 ms',16,'ns'),false);
});
test('malformed and outdated persistence recovers',()=>{
 assert.deepEqual(recoverData('{bad'),freshData());assert.deepEqual(recoverData('{"version":0}'),freshData());
 const r=recoverData(JSON.stringify({version:1,programs:[{name:'x',code:'NOP'},{bad:true}],settings:{speed:-4},progress:{q:true,bad:'yes'}}));
 assert.equal(r.programs.length,1);assert.equal(r.settings.speed,700);assert.deepEqual(r.progress,{q:true});
 assert.deepEqual(readData({getItem(){throw Error();}}),freshData());assert.equal(writeData({setItem(){throw Error();}},freshData()),false);
});
test('all prescribed content exists and options point to valid answers',()=>{
 assert.equal(lessons.length,8);assert.ok(questions.length>=24);assert.equal(presentationSteps.length,8);
 assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
 for(const q of questions){assert.ok(q.hints.length>=2);assert.ok(q.explanation);if(q.options)assert.ok(q.answer>=0&&q.answer<q.options.length);}
 for(const l of lessons){assert.ok(presets[l.preset]);assert.ok(l.check.options[l.check.answer]);}
});
test('chart occupancy and stage snapshots agree each cycle',()=>{
 for(const p of Object.values(presets)){
  const r=simulate(p.code,{forwarding:false,sharedMemory:true});
  for(const s of r.snapshots.slice(1)){
   s.slots.forEach((i,index)=>{if(i)assert.ok(r.instances[i.id].history[s.cycle].startsWith(['F','D','E','W'][index]));});
   assert.equal(s.completed,r.instances.filter(i=>Object.entries(i.history).some(([c,v])=>v==='W'&&Number(c)<=s.cycle)).length);
  }
 }
});
