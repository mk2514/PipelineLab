import {simulate,presets,model,STAGES,defaultRegisters,defaultMemory} from './engine.mjs';
import {calculate,numericMatches} from './numeric.mjs';
import {readData,writeData} from './persistence.mjs';
import {lessons,questions,presentationSteps} from './content.mjs';
const $=s=>document.querySelector(s);
const h=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v.toFixed(4)).toLocaleString('en-US',{maximumFractionDigits:4});
let storage;
try{storage=localStorage;}catch{storage={getItem(){return null;},setItem(){throw Error('Unavailable');}};}
const data=readData(storage),page=$('#page');
let route='',lessonIndex=0,questionIndex=0,presentationIndex=0;
let hintCount=0,answerShown=false,feedback='',category='All';
let program=presets.independent.code,registers=[...defaultRegisters],memory=[...defaultMemory];
let config={...data.settings,mode:'pipeline',branchPolicy:'predict',clock:2};
let simulation=simulate(program,{...config,registers,memory}),cycle=0,selected=null,timer=null,editTimer=null;
let hazardType='data',variant='before',hazardRuns,solved=null,revealed=1;
const names={learn:'Learn',simulator:'Pipeline Simulator',solver:'Problem Solver',hazards:'Hazard Lab',practice:'Practice',presentation:'Presentation Mode'};
function save(){data.settings={forwarding:config.forwarding,sharedMemory:config.sharedMemory,speed:config.speed};if(!writeData(storage,data))$('#notice').textContent='Storage is unavailable or full. This session works, but changes could not be saved.';}
function pause(){clearTimeout(timer);timer=null;}
function recompute(){pause();cycle=0;selected=null;try{simulation=simulate(program,{...config,registers,memory});return true;}catch(e){simulation=null;$('#notice').textContent=e.message;return false;}}
function loadPreset(key,overrides={}){pause();program=presets[key].code;registers=[...defaultRegisters];memory=[...defaultMemory];config={...config,mode:'pipeline',branchPolicy:'predict',sharedMemory:false,...overrides};recompute();}
function stats(items){return '<div class="stats">'+items.map(([v,l])=>'<div class="stat"><strong>'+h(v)+'</strong><span>'+h(l)+'</span></div>').join('')+'</div>';}
function chart(run,until,interactive=true){
 const from=Math.max(1,until-16),to=Math.min(run.cycles,Math.max(12,until+5));
 const columns=Array.from({length:Math.max(0,to-from+1)},(_,i)=>from+i);
 const rows=run.instances.filter(i=>Object.keys(i.history).some(c=>Number(c)<=until));
 return '<div class="chart-wrap"><table><thead><tr><th>Instruction</th>'+columns.map(c=>'<th class="'+(c===until?'current-col':'')+'">C'+c+'</th>').join('')+'</tr></thead><tbody>'+rows.map(i=>'<tr class="'+(selected===i.id?'selected':'')+'" style="--hue:'+((i.id*57+145)%360)+'"><td>'+(interactive?'<button class="cell-button" data-select="'+i.id+'">':'')+h(i.label+' · '+i.text)+(interactive?'</button>':'')+'</td>'+columns.map(c=>{
 const cell=c<=until?i.history[c]:'';
 return '<td class="'+(cell?'filled ':'')+(cell?.includes('·')?'stall ':'')+(cell?.includes('×')?'flush ':'')+(c===until?'current-col':'')+'">'+h(cell||'')+'</td>';
 }).join('')+'</tr>').join('')+'</tbody></table></div><p class="legend">F / D / E / W = occupied stage · F· / D· = held instruction · × = flushed · blank = no occupancy. Empty processor stages are unused slots (bubbles while another instruction waits). Showing C'+from+'–C'+to+'. Scrub to inspect other cycles.</p>';
}
function simulationView(){
 if(!simulation)return '<p class="error">Fix the program or configuration to run the simulator.</p>';
 const s=simulation.snapshots[cycle],elapsed=cycle*config.clock;
 return '<div class="panel"><div class="split-title"><h2>Inside the processor</h2><span class="pill">Cycle '+cycle+' / '+simulation.cycles+'</span></div><p class="muted">'+(config.mode==='sequential'?'Sequential':'Pipelined')+' · '+config.clock+' ns clock · Forwarding '+(config.forwarding?'on':'off')+' · '+(config.sharedMemory?'Shared':'Split')+' memory</p>'+
 '<div class="controls"><button data-action="play" class="primary">'+(timer?'Pause':'Play')+'</button><button data-action="prev" '+(!cycle?'disabled':'')+'>← Previous cycle</button><button data-action="next" '+(cycle===simulation.cycles?'disabled':'')+'>Next cycle →</button><button data-action="reset">Reset</button><button data-action="finish">Run to completion</button></div>'+
 '<div class="controls"><label>Speed <select id="speed">'+[[1400,'Slow'],[700,'Normal'],[250,'Fast']].map(([v,l])=>'<option value="'+v+'" '+(config.speed===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><input id="scrubber" aria-label="Timeline cycle" type="range" min="0" max="'+simulation.cycles+'" value="'+cycle+'"><label>Cycle <input id="jump-cycle" type="number" min="0" max="'+simulation.cycles+'" value="'+cycle+'"></label><button data-action="jump">Go</button></div>'+
 '<div class="processor">'+STAGES.map((name,index)=>{
 const i=s.slots[index],waiting=s.stalls.some(x=>x.stage===name),flushed=i&&s.flushed.includes(i.id);
 return '<div class="stage '+(waiting?'waiting ':'')+(flushed?'flushed':'')+'"><div class="stage-title">'+['Fetch','Decode','Execute','Write'][index]+' <small>'+name+'</small></div>'+(i?'<button class="token '+(selected===i.id?'selected':'')+'" data-select="'+i.id+'" data-token="'+i.id+'" style="--hue:'+((i.id*57+145)%360)+'"><b>'+i.label+(flushed?' ×':'')+'</b>'+h(i.text)+'</button>':'<div class="empty">'+(waiting?'Waiting':'Empty slot')+'</div>')+'<span class="buffer">'+(index<3?name+'/'+STAGES[index+1]+' boundary latch':'Register commit')+'</span></div>';
 }).join('')+'</div>'+s.forwarded.map(f=>'<div class="forward">E → D forwarding · I'+(f.from+1)+' → I'+(f.to+1)+' · R'+f.register+' = '+f.value+'</div>').join('')+
 stats([[s.completed,'Instructions completed'],[fmt(elapsed)+' ns','Elapsed time'],[s.completed?fmt(cycle/s.completed):'—','Finite-program CPI'],[elapsed?fmt(s.completed/elapsed):'—','Instructions / ns']])+
 '<p class="stat-note">Complete run uses '+simulation.cycles+' cycles ('+fmt(simulation.cycles*config.clock)+' ns). Playback speed changes presentation only.</p>'+(simulation.error&&cycle===simulation.cycles?'<p class="error">'+h(simulation.error)+'</p>':'')+
 '<h3>This cycle</h3><ul class="events">'+s.events.map(e=>'<li>'+h(e)+'</li>').join('')+'</ul></div><div class="panel"><h2>Timing chart</h2>'+chart(simulation,cycle)+'</div><div class="panel"><h2>Register file</h2><div class="register-bank">'+s.registers.map((v,i)=>'<div class="register '+(s.changes.some(c=>c.kind==='register'&&c.index===i)?'changed':'')+'">R'+i+'<b>'+v+'</b></div>').join('')+'</div><details><summary>Memory · 32 word addresses</summary><div class="memory-bank">'+s.memory.map((v,i)=>'<span class="'+(s.changes.some(c=>c.kind==='memory'&&c.index===i)?'changed':'')+'">M['+i+']<br><b>'+v+'</b></span>').join('')+'</div></details><p class="muted">Values after the selected cycle. Highlighted cells changed in this cycle.</p></div>';
}
function updateSimulation(){
 const target=$('#simview');if(!target)return;
 const positions=new Map([...target.querySelectorAll('[data-token]')].map(el=>[el.dataset.token,el.getBoundingClientRect()]));
 const focus=document.activeElement?.dataset.action;
 const focusedId=document.activeElement?.id;
 target.innerHTML=simulationView();
 if(focusedId==='scrubber')target.querySelector('#scrubber')?.focus({preventScroll:true});
 if(focus)target.querySelector('[data-action="'+focus+'"]')?.focus({preventScroll:true});
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)target.querySelectorAll('[data-token]').forEach(el=>{
 const old=positions.get(el.dataset.token);if(!old)return;const now=el.getBoundingClientRect();
 if(old.x!==now.x||old.y!==now.y)el.animate([{transform:'translate('+(old.x-now.x)+'px,'+(old.y-now.y)+'px)'},{transform:'translate(0,0)'}],{duration:Math.min(config.speed*.55,350),easing:'ease-out'});
 });
}
function play(){
 if(timer){pause();updateSimulation();return;}if(!simulation)return;if(cycle>=simulation.cycles)cycle=0;
 const tick=()=>{cycle=Math.min(cycle+1,simulation.cycles);timer=cycle<simulation.cycles?setTimeout(tick,config.speed):null;updateSimulation();};
 timer=setTimeout(tick,config.speed);updateSimulation();
}
function editor(){return '<div class="panel editor"><div><label class="field">Load a preset<select id="preset">'+Object.entries(presets).map(([k,v])=>'<option value="'+k+'" '+(v.code===program?'selected':'')+'>'+h(v.name)+'</option>').join('')+'</select></label><label class="field">Program<textarea id="program" spellcheck="false">'+h(program)+'</textarea></label><p id="program-error" class="error" hidden></p><details><summary>Instruction syntax</summary><code>ADD R3, R1, R2<br>SUB R3, R1, R2<br>LOAD R3, 0(R0)<br>STORE R3, 2(R0)<br>BEQ R1, R2, target<br>target: NOP</code><p>Destination first for ADD, SUB and LOAD. STORE names its source first. Word offsets, case-sensitive labels, semicolon comments.</p></details><div class="controls"><input id="program-name" type="text" maxlength="60" placeholder="Program name" aria-label="Saved program name"><button data-action="save-program">Save program</button></div><label class="field">Saved programs<select id="saved-program"><option value="">Choose saved program</option>'+data.programs.map((p,i)=>'<option value="'+i+'">'+h(p.name)+'</option>').join('')+'</select></label><button data-action="delete-program">Delete selected saved program</button></div><div><label class="field">Execution mode<select id="mode"><option value="pipeline" '+(config.mode==='pipeline'?'selected':'')+'>Pipelined</option><option value="sequential" '+(config.mode==='sequential'?'selected':'')+'>Sequential</option></select></label><label class="checkbox"><input id="forwarding" type="checkbox" '+(config.forwarding?'checked':'')+'>Enable E → D forwarding</label><label class="checkbox"><input id="shared" type="checkbox" '+(config.sharedMemory?'checked':'')+'>Share instruction/data memory</label><label class="field">Branch handling<select id="branch-policy"><option value="predict" '+(config.branchPolicy==='predict'?'selected':'')+'>Predict not taken</option><option value="wait" '+(config.branchPolicy==='wait'?'selected':'')+'>Wait for branch resolution</option></select></label><label class="field">Clock period (ns)<input id="clock-period" type="number" min=".001" max="1000" step="any" value="'+config.clock+'"></label><h3>Initial registers</h3><div class="register-inputs">'+registers.map((v,i)=>'<label>R'+i+'<input class="initial-register" data-register="'+i+'" aria-label="Initial R'+i+'" type="number" step="1" value="'+v+'" '+(i===0?'disabled':'')+'></label>').join('')+'</div><label class="field">Initial memory (32 comma-separated integers)<textarea id="initial-memory" class="memory-input">'+memory.join(', ')+'</textarea></label><p class="muted">Edits stop playback and recompute. Maximum 64 source instructions and 256 cycles.</p></div></div>';}
function renderSimulator(){page.innerHTML='<div class="editor-layout"><div>'+editor()+'</div><div id="simview">'+simulationView()+'</div></div>';}
function renderLearn(){
 const l=lessons[lessonIndex];
 const words=l.title.split(' ');
 const title=h(words.slice(0,-2).join(' '))+' <em>'+h(words.slice(-2).join(' '))+'</em>';
 page.innerHTML='<div class="lesson-list">'+lessons.map((v,i)=>'<button data-lesson="'+i+'" class="'+(i===lessonIndex?'active':'')+'">'+(data.progress['lesson-'+i]?'✓ ':'')+(i+1)+'. '+h(v.title)+'</button>').join('')+'</div><section class="panel hero-panel lesson-copy"><p class="eyebrow">LESSON '+(lessonIndex+1)+' OF 8</p><h2>'+title+'</h2><p>'+h(l.plain)+'</p><details><summary>What the CPU does</summary><p>'+h(l.technical)+'</p></details><h3>Worked example</h3><p>'+h(l.example)+'</p><div class="callout">'+h(l.misconception)+'</div><button class="primary" data-action="lesson-simulator">Open this example in Simulator ↗</button></section><section class="panel"><h2>Check your understanding</h2><p>'+h(l.check.prompt)+'</p><div class="options">'+l.check.options.map((o,i)=>'<label><input type="radio" name="lesson-answer" value="'+i+'">'+h(o)+'</label>').join('')+'</div><div class="controls"><button data-action="lesson-check">Check answer</button><button data-action="next-lesson" '+(lessonIndex===7?'disabled':'')+'>Next lesson →</button></div><p id="lesson-feedback" role="status"></p></section><h2>Explore the example</h2><div id="simview">'+simulationView()+'</div>';
}
function solverClock(r){return r.clock*({ps:.001,ns:1,'μs':1000,ms:1000000}[r.unit]);}
function canOpen(r){return r.k===4&&r.n<=64&&r.stalls===0&&r.overhead===0&&r.delays.every(d=>d===r.delays[0])&&solverClock(r)>=.001&&solverClock(r)<=1000;}
function solverVisual(r){
 if(r.stalls)return '<p class="muted">The total '+r.stalls+' lost cycles has no specified placement. A detailed stall chart requires that information.</p>';
 const count=Math.min(r.n,6),columns=Math.min(r.k+count-1,25);
 return '<p class="muted">First '+count+' instructions. Each column lasts '+fmt(r.clock)+' '+r.unit+'.</p><div class="chart-wrap"><table><tr><th>Instruction</th>'+Array.from({length:columns},(_,i)=>'<th>C'+(i+1)+'</th>').join('')+'</tr>'+Array.from({length:count},(_,i)=>'<tr><th>I'+(i+1)+'</th>'+Array.from({length:columns},(_,c)=>'<td>'+((c-i>=0&&c-i<r.k)?'S'+(c-i+1):'')+'</td>').join('')+'</tr>').join('')+'</table></div>';
}
function solutionHTML(){
 if(!solved)return '<h2>Your solution</h2><p>Calculate the five-instruction example, or enter your own delays.</p>';
 const r=solved,u=r.unit,steps=[
 '<h3>1. Given values</h3>n = '+r.n+', k = '+r.k+', delays = ['+r.delays.join(', ')+'] '+u+'. Overhead = '+r.overhead+' '+u+'. Lost cycles = '+r.stalls+'.',
 '<h3>2. Clock period</h3>max(stage delays) + overhead<div class="formula">'+Math.max(...r.delays)+' + '+r.overhead+' = '+fmt(r.clock)+' '+u+'</div>',
 '<h3>3. Sequential baseline</h3>n × sum(stage delays)<div class="formula">'+r.n+' × '+fmt(r.sum)+' = '+fmt(r.sequential)+' '+u+'</div>',
 '<h3>4. Pipeline cycles and time</h3>k + n − 1 + stalls<div class="formula">'+r.k+' + '+r.n+' − 1 + '+r.stalls+' = '+r.cycles+' cycles<br>'+r.cycles+' × '+fmt(r.clock)+' = '+fmt(r.pipelined)+' '+u+'</div>',
 '<h3>5. Performance</h3><div class="formula">Speedup = '+fmt(r.sequential)+' / '+fmt(r.pipelined)+' = '+fmt(r.speedup)+'×<br>CPI = '+r.cycles+' / '+r.n+' = '+fmt(r.cpi)+'<br>Throughput = '+r.n+' / '+fmt(r.pipelined)+' = '+fmt(r.throughput)+' instructions/'+u+'</div>'+(r.efficiency!==null?'Textbook efficiency = speedup / k = '+fmt(r.efficiency*100)+'%.':'Ideal textbook efficiency is omitted for unequal delays, overhead or stalls.'),
 '<h3>6. Interpretation</h3><p>'+ (r.speedup>=1?'Pipelining finishes '+fmt(r.speedup)+' times as fast as this sequential baseline.':'Pipeline overhead, imbalance or waiting outweighs overlap for this baseline.')+' CPI includes filling and draining. Textbook efficiency differs from measured stage utilisation.</p>'+solverVisual(r)];
 return '<h2>Step-by-step solution</h2>'+steps.slice(0,revealed).map(s=>'<div class="solution-step">'+s+'</div>').join('')+'<div class="controls"><button data-action="reveal" '+(revealed>=6?'disabled':'')+'>Reveal next step</button><button data-action="reveal-all">Show full solution</button></div><button data-action="solver-simulator" '+(!canOpen(r)?'disabled':'')+'>Open in Simulator ↗</button><p class="muted">'+(canOpen(r)?'Opens independent NOPs at the matching clock period.':'Simulator mapping requires 4 equal stages, zero overhead/stalls, at most 64 instructions and a clock from 0.001 to 1,000 ns.')+'</p>';
}
function renderSolver(){
 page.innerHTML='<div class="grid"><section class="panel"><h2>Work through the numbers</h2><p class="muted">1–20 stages. All delays use the selected time unit.</p><form id="solver-form"><div class="grid"><label class="field">Instructions n<input name="n" type="number" min="1" max="10000" value="'+(solved?.n??5)+'" required></label><label class="field">Stages k<input name="k" type="number" min="1" max="20" value="'+(solved?.k??4)+'" required></label></div><label class="field">Stage delays (one equal delay, or k comma-separated delays)<input name="delays" type="text" value="'+(solved?.delays.join(', ')??'2')+'" required></label><div class="grid"><label class="field">Register overhead<input name="overhead" type="number" min="0" step="any" value="'+(solved?.overhead??0)+'" required></label><label class="field">Additional lost cycles<input name="stalls" type="number" min="0" step="1" value="'+(solved?.stalls??0)+'" required></label></div><label class="field">Time unit<select name="unit">'+['ps','ns','μs','ms'].map(u=>'<option '+(u===(solved?.unit??'ns')?'selected':'')+'>'+u+'</option>').join('')+'</select></label><button class="primary" type="submit">Calculate with working</button></form><p id="solver-error" role="alert"></p><details><summary>Baseline and assumptions</summary>Sequential time = n × sum(stage delays), without pipeline-register overhead. Pipeline clock = slowest stage + overhead. Additional cycles represent total lost cycles, without double-counting overlapping causes.</details><div class="controls"><button data-action="save-problem">Save problem</button><button data-action="similar">Try similar problem</button></div><label class="field">Saved problems<select id="saved-problem"><option value="">Choose a problem</option>'+data.problems.map((p,i)=>'<option value="'+i+'">'+p.n+' instructions / '+p.k+' stages</option>').join('')+'</select></label></section><section id="solution" class="panel">'+solutionHTML()+'</section></div>';
}
function setupHazard(){
 pause();variant='before';const key={data:'dependency',load:'load',structural:'structural',control:'branch'}[hazardType];
 program=presets[key].code;registers=[...defaultRegisters];memory=[...defaultMemory];
 const before={...config,mode:'pipeline',sharedMemory:false,forwarding:true,branchPolicy:'predict',clock:2},after={...before};
 if(['data','load'].includes(hazardType))before.forwarding=false;
 if(hazardType==='structural')before.sharedMemory=true;
 if(hazardType==='control')after.branchPolicy='wait';
 hazardRuns={before:simulate(program,{...before,registers,memory}),after:simulate(program,{...after,registers,memory}),beforeConfig:before,afterConfig:after};
 config=before;simulation=hazardRuns.before;cycle=0;selected=null;
}
function renderHazards(){
 const t={
 data:['A consumer needs a result','Decode waits for the value produced by an older instruction. Forwarding supplies a completed arithmetic result before Write.','Forwarding disabled','Forwarding enabled'],
 load:['The load is still working','LOAD occupies Execute for two cycles. Forwarding removes the wait for Write, but cannot supply an unfinished result or free Execute sooner.','Forwarding disabled','Forwarding enabled'],
 structural:['Two requests, one port','A memory access and a new Fetch compete for shared memory. Split instruction/data memory allows both in the same cycle.','Shared memory','Split memory'],
 control:['The predicted path changes','A taken branch flushes younger fall-through instructions. Waiting avoids wrong-path fetching here, but saves no cycles for this taken-branch example. Prediction can help not-taken branches.','Predict not taken','Wait for branch']
 }[hazardType],before=hazardRuns.before,after=hazardRuns.after;
 page.innerHTML='<div class="tabs">'+[['data','Data hazard'],['load','Load-use'],['structural','Structural hazard'],['control','Control hazard']].map(([k,l])=>'<button data-hazard="'+k+'" class="'+(hazardType===k?'active':'')+'">'+l+'</button>').join('')+'</div><section class="panel hero-panel"><h2>'+t[0]+'</h2><p>'+t[1]+'</p>'+stats([[before.cycles+' cycles',t[2]],[after.cycles+' cycles',t[3]],[(before.cycles-after.cycles)+' cycles','Actual cycle difference'],[after.instances.filter(i=>i.status==='flushed').length,'Flushed with remedy']])+'<div class="tabs"><button data-variant="before" class="'+(variant==='before'?'active':'')+'">Explore '+t[2]+'</button><button data-variant="after" class="'+(variant==='after'?'active':'')+'">Explore '+t[3]+'</button></div><p class="muted">Same program and initial state. Counts come from the engine. WAR and WAW require no stalls in this in-order model.</p></section><details class="panel"><summary>Compare complete timing charts</summary><h3>'+t[2]+'</h3>'+chart(before,before.cycles,false)+'<h3>'+t[3]+'</h3>'+chart(after,after.cycles,false)+'</details><div id="simview">'+simulationView()+'</div>';
}
function filteredQuestions(){return questions.filter(q=>category==='All'||q.category===category);}

function practiceVisual(q) {
 const layouts={
  'chart-1':[['Instruction','C1','C2','C3','C4'],['I1','F','D','?','W']],
  'chart-2':[['Instruction','C1','C2','C3','C4','C5'],['I2','','F','?','E','W']],
  'chart-3':[['Instruction','Fetch','Decode','Execute','Write'],['I5','C5','C6','C7','C?']],
  'chart-4':[['Instruction','Before wait','During wait','After wait'],['Consumer','D','?','E']],
  'chart-5':[['Instruction','C1','C2','C3','C4','C5','C6'],['I1 LOAD','F','D','E','E','W',''],['I2 ADD','','F','D·','?','E','W']]
 };
 const rows=layouts[q.id];
 if(!rows)return '';
 return '<div class="chart-wrap"><table aria-label="Complete the missing timing-chart cell">'+rows.map((row,i)=>'<tr>'+row.map(cell=>i===0?'<th>'+h(cell)+'</th>':'<td>'+h(cell)+'</td>').join('')+'</tr>').join('')+'</table></div>';
}

function renderPractice(){
 const list=filteredQuestions();questionIndex=Math.min(questionIndex,list.length-1);const q=list[questionIndex],done=questions.filter(q=>data.progress[q.id]).length;
 page.innerHTML='<div class="panel"><div class="split-title"><h2>Practice, with feedback</h2><span class="pill">'+done+' / '+questions.length+' completed</span></div><div class="progress"><span style="width:'+(done/questions.length*100)+'%"></span></div><p class="muted">Concepts, calculations, timing charts, dependencies, hazards and next-cycle predictions.</p><div class="controls"><label>Category <select id="practice-category">'+['All',...new Set(questions.map(q=>q.category))].map(c=>'<option '+(c===category?'selected':'')+'>'+h(c)+'</option>').join('')+'</select></label><button data-action="reset-progress" class="danger">Reset learning progress</button></div></div><section class="panel"><p class="eyebrow">'+h(q.category)+' / '+h(q.difficulty)+' / '+(questionIndex+1)+' OF '+list.length+'</p><h2>'+h(q.prompt)+'</h2>'+
 practiceVisual(q)+(q.options?'<div class="options">'+q.options.map((o,i)=>'<label><input name="practice-answer" type="radio" value="'+i+'">'+h(o)+'</label>').join('')+'</div>':'<label class="field">Your answer ('+h(q.unit)+')<input type="text" id="numeric-answer" placeholder="Value, optionally with units"></label>')+
 '<div class="controls"><button data-action="check-practice" class="primary">Check answer</button><button data-action="hint" '+(hintCount>=q.hints.length?'disabled':'')+'>Hint '+Math.min(hintCount+1,q.hints.length)+'</button><button data-action="retry">Retry</button><button data-action="worked">Worked explanation</button></div><div id="practice-feedback" role="status">'+feedback+'</div>'+q.hints.slice(0,hintCount).map(t=>'<p class="callout">'+h(t)+'</p>').join('')+(answerShown?'<div class="success">'+h(q.explanation)+'</div>':'')+'<div class="controls"><button data-action="prev-question" '+(!questionIndex?'disabled':'')+'>← Previous</button><button data-action="next-question" '+(questionIndex===list.length-1?'disabled':'')+'>Next question →</button></div></section>';
}
function setupPresentation(){const s=presentationSteps[presentationIndex];loadPreset(s.preset,{mode:s.mode,forwarding:s.forwarding,clock:2});}
function renderPresentation(){
 const s=presentationSteps[presentationIndex];
 page.innerHTML='<section class="panel hero-panel"><p class="eyebrow">CLASSROOM DEMONSTRATION / '+(presentationIndex+1)+' OF 8</p><h2>'+h(s.title)+'</h2><p>'+h(s.body)+'</p><div class="controls"><button data-action="presentation-prev" '+(!presentationIndex?'disabled':'')+'>← Previous step</button><button data-action="presentation-next" '+(presentationIndex===7?'disabled':'')+'>Next step →</button><button data-action="presentation-reset">Restart example</button><button data-action="fullscreen">Fullscreen</button><a href="#learn">Exit presentation</a></div><details class="presentation-notes"><summary>Presenter notes</summary>'+h(s.notes)+'</details><details><summary>Keyboard shortcuts</summary>Space plays/pauses. Left/Right step cycles. Page Up/Page Down change steps. R resets this example. Escape exits browser fullscreen.</details></section><div id="simview">'+simulationView()+'</div>';
}
function navigate(){
 pause();clearTimeout(editTimer);$('#notice').textContent='';route=location.hash.slice(1);if(!names[route])route='learn';
 document.body.classList.toggle('presentation',route==='presentation');$('#page-title').textContent=names[route];
 document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+route));
 if(route==='learn'){loadPreset(lessons[lessonIndex].preset,{mode:lessons[lessonIndex].visual,clock:2,forwarding:true});renderLearn();}
 if(route==='simulator')renderSimulator();if(route==='solver')renderSolver();
 if(route==='hazards'){setupHazard();renderHazards();}if(route==='practice')renderPractice();
 if(route==='presentation'){setupPresentation();renderPresentation();}
 scrollTo(0,0);
}
function checkPractice(){
 const q=filteredQuestions()[questionIndex],input=q.options?document.querySelector('[name="practice-answer"]:checked')?.value:$('#numeric-answer').value;
 if(input===undefined||input===''){feedback='<p class="error">Enter or select an answer first.</p>';$('#practice-feedback').innerHTML=feedback;return;}
 const correct=q.options?Number(input)===q.answer:numericMatches(input,q.answer,q.unit);
 feedback='<p class="'+(correct?'success':'error')+'">'+(correct?'Correct. '+h(q.explanation):'Try again. Use a hint to check the timing assumptions.')+'</p>';
 if(correct){data.progress[q.id]=true;save();}
 $('#practice-feedback').innerHTML=feedback;
 const done=questions.filter(q=>data.progress[q.id]).length;
 $('.progress span').style.width=(done/questions.length*100)+'%';
 $('.split-title .pill').textContent=done+' / '+questions.length+' completed';
}
function readEditor(){
 pause();program=$('#program').value;
 try{
  registers=[...document.querySelectorAll('.initial-register')].map(input=>Number(input.value));
  if([...document.querySelectorAll('.initial-register')].some(i=>!i.value.trim()))throw Error('Every register requires an integer.');
  const parts=$('#initial-memory').value.split(',').map(s=>s.trim());
  if(parts.some(p=>!p))throw Error('Memory requires 32 comma-separated integers.');
  memory=parts.map(Number);config.clock=Number($('#clock-period').value);
  if(!Number.isFinite(config.clock)||config.clock<.001||config.clock>1000)throw Error('Clock period must be 0.001–1,000 ns.');
  config.forwarding=$('#forwarding').checked;config.sharedMemory=$('#shared').checked;config.mode=$('#mode').value;config.branchPolicy=$('#branch-policy').value;
  simulation=simulate(program,{...config,registers,memory});cycle=0;selected=null;$('#program-error').hidden=true;save();updateSimulation();
 }catch(e){simulation=null;$('#program-error').textContent=e.message;$('#program-error').hidden=false;updateSimulation();}
}
page.addEventListener('submit',event=>{
 if(event.target.id!=='solver-form')return;event.preventDefault();
 try{
  const form=new FormData(event.target),k=Number(form.get('k')),parts=String(form.get('delays')).split(',').map(s=>s.trim());
  if(parts.some(p=>!p))throw Error('Enter all stage delays.');
  if(!Number.isInteger(k)||k<1||k>20)throw Error('Stage count must be 1–20.');
  let delays=parts.map(Number);if(delays.length===1)delays=Array(k).fill(delays[0]);
  solved=calculate({n:Number(form.get('n')),k,delays,overhead:Number(form.get('overhead')),stalls:Number(form.get('stalls')),unit:form.get('unit')});revealed=1;$('#solver-error').textContent='';$('#solution').innerHTML=solutionHTML();
 }catch(e){$('#solver-error').className='error';$('#solver-error').textContent=e.message;}
});
page.addEventListener('input',event=>{
 if(event.target.id==='scrubber'){pause();cycle=Number(event.target.value);updateSimulation();return;}
 if(route==='simulator'&&event.target.closest('.editor')&&!['program-name','saved-program','preset'].includes(event.target.id)){
  pause();clearTimeout(editTimer);editTimer=setTimeout(readEditor,400);
 }
});
page.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='speed'){config.speed=Number(el.value);save();if(timer){pause();play();}return;}
 if(el.id==='preset'){clearTimeout(editTimer);loadPreset(el.value,{clock:2});renderSimulator();}
 if(el.id==='saved-program'&&el.value!==''){pause();program=data.programs[Number(el.value)].code;recompute();$('#program').value=program;updateSimulation();}
 if(el.id==='saved-problem'&&el.value!==''){try{solved=calculate(data.problems[Number(el.value)]);revealed=1;renderSolver();}catch(e){$('#solver-error').textContent=e.message;}}
 if(el.id==='practice-category'){category=el.value;questionIndex=0;hintCount=0;answerShown=false;feedback='';renderPractice();}
 if(route==='simulator'&&['forwarding','shared','mode','branch-policy'].includes(el.id)){clearTimeout(editTimer);readEditor();}
});
page.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.select!==undefined){selected=Number(button.dataset.select);updateSimulation();return;}
 if(button.dataset.lesson!==undefined){lessonIndex=Number(button.dataset.lesson);loadPreset(lessons[lessonIndex].preset,{mode:lessons[lessonIndex].visual,clock:2,forwarding:true});renderLearn();return;}
 if(button.dataset.hazard){hazardType=button.dataset.hazard;setupHazard();renderHazards();return;}
 if(button.dataset.variant){pause();variant=button.dataset.variant;simulation=hazardRuns[variant];config={...hazardRuns[variant+'Config']};cycle=0;selected=null;renderHazards();return;}
 const action=button.dataset.action;
 if(action==='play'){play();return;}
 if(['prev','next','reset','finish','jump'].includes(action)){
  pause();if(!simulation)return;
  if(action==='prev')cycle=Math.max(0,cycle-1);
  if(action==='next')cycle=Math.min(simulation.cycles,cycle+1);
  if(action==='reset')cycle=0;
  if(action==='finish')cycle=simulation.cycles;
  if(action==='jump'){const value=Number($('#jump-cycle').value);if(!Number.isInteger(value)||value<0||value>simulation.cycles)return;cycle=value;}
  updateSimulation();return;
 }
 if(action==='save-program'){
  clearTimeout(editTimer);readEditor();if(!simulation){$('#notice').textContent='Fix the program before saving.';return;}
  const name=$('#program-name').value.trim()||'Program '+(data.programs.length+1),entry={name,code:program},index=data.programs.findIndex(p=>p.name===name);
  if(index>=0)data.programs[index]=entry;else data.programs.unshift(entry);
  data.programs=data.programs.slice(0,20);save();renderSimulator();$('#notice').textContent='Program saved locally.';
 }
 if(action==='delete-program'){const value=$('#saved-program').value;if(value!==''){data.programs.splice(Number(value),1);save();renderSimulator();}}
 if(action==='lesson-simulator')location.hash='simulator';
 if(action==='next-lesson'){lessonIndex=Math.min(7,lessonIndex+1);loadPreset(lessons[lessonIndex].preset,{mode:lessons[lessonIndex].visual,clock:2,forwarding:true});renderLearn();}
 if(action==='lesson-check'){
  const choice=document.querySelector('[name="lesson-answer"]:checked'),l=lessons[lessonIndex],correct=choice&&Number(choice.value)===l.check.answer;
  $('#lesson-feedback').className=correct?'success':'error';$('#lesson-feedback').textContent=choice?(correct?'Correct. ':'Try again. ')+l.check.explanation:'Choose an answer first.';
  if(correct){data.progress['lesson-'+lessonIndex]=true;save();}
 }
 if(action==='reveal'||action==='reveal-all'){revealed=action==='reveal-all'?6:Math.min(6,revealed+1);$('#solution').innerHTML=solutionHTML();}
 if(action==='similar'){solved=calculate({n:(solved?.n??5)%12+2,k:4,delays:[2,2,2,2],unit:'ns'});revealed=1;renderSolver();}
 if(action==='save-problem'){if(solved){data.problems.unshift(solved);data.problems=data.problems.slice(0,20);save();renderSolver();$('#notice').textContent='Problem saved locally.';}else $('#notice').textContent='Calculate a valid problem first.';}
 if(action==='solver-simulator'&&solved&&canOpen(solved)){program=Array(solved.n).fill('NOP').join('\n');config={...config,clock:solverClock(solved),mode:'pipeline',forwarding:true,sharedMemory:false,branchPolicy:'predict'};registers=[...defaultRegisters];memory=[...defaultMemory];recompute();location.hash='simulator';}
 if(action==='check-practice')checkPractice();
 if(action==='hint'){hintCount++;renderPractice();}
 if(action==='worked'){answerShown=true;renderPractice();}
 if(action==='retry'){hintCount=0;answerShown=false;feedback='';renderPractice();}
 if(action==='prev-question'||action==='next-question'){questionIndex+=action==='next-question'?1:-1;hintCount=0;answerShown=false;feedback='';renderPractice();}
 if(action==='reset-progress'){if(confirm('Reset all lesson and practice progress on this browser?')){data.progress={};save();renderPractice();}}
 if(['presentation-prev','presentation-next','presentation-reset'].includes(action)){
  if(action==='presentation-prev')presentationIndex=Math.max(0,presentationIndex-1);
  if(action==='presentation-next')presentationIndex=Math.min(7,presentationIndex+1);
  setupPresentation();renderPresentation();
 }
 if(action==='fullscreen'){
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{$('#notice').textContent='Fullscreen is unavailable here. The expanded presentation layout is still active.';}
 }
});
document.addEventListener('keydown',event=>{
 if(route!=='presentation'||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||$('#model-dialog').open)return;
 const keys={' ':'play',ArrowLeft:'prev',ArrowRight:'next',PageUp:'presentation-prev',PageDown:'presentation-next',r:'presentation-reset'};
 if(keys[event.key]){event.preventDefault();page.querySelector('[data-action="'+keys[event.key]+'"]')?.click();}
});
$('#model-rules').innerHTML=model.map(rule=>'<li>'+h(rule)+'</li>').join('');
$('#model-button').addEventListener('click',()=>$('#model-dialog').showModal());
$('#model-dialog .close').addEventListener('click',()=>$('#model-dialog').close());
$('.skip').addEventListener('click',event=>{event.preventDefault();$('#workspace').focus();});
addEventListener('hashchange',navigate);
navigate();

