export function calculate({n,k,delays,overhead=0,stalls=0,unit='ns'}) {
 if(!Number.isInteger(n)||n<1||n>10000) throw new Error('Instruction count must be an integer from 1 to 10,000.');
 if(!Number.isInteger(k)||k<1||k>20) throw new Error('Stage count must be an integer from 1 to 20.');
 if(!Array.isArray(delays)||delays.length!==k||delays.some(d=>!Number.isFinite(d)||d<=0||d>1000000)) throw new Error('Enter one positive delay per stage, up to 1,000,000.');
 if(!Number.isFinite(overhead)||overhead<0||overhead>1000000) throw new Error('Overhead must be between 0 and 1,000,000.');
 if(!Number.isInteger(stalls)||stalls<0||stalls>1000000) throw new Error('Stall cycles must be an integer from 0 to 1,000,000.');
 if(!['ps','ns','μs','ms'].includes(unit)) throw new Error('Select a supported time unit.');
 const sum=delays.reduce((a,b)=>a+b,0),clock=Math.max(...delays)+overhead,cycles=k+n-1+stalls;
 const sequential=n*sum,pipelined=cycles*clock,speedup=sequential/pipelined;
 return {n,k,delays,overhead,stalls,unit,sum,clock,cycles,sequential,pipelined,speedup,cpi:cycles/n,throughput:n/pipelined,efficiency:delays.every(d=>d===delays[0])&&overhead===0&&stalls===0?speedup/k:null};
}
export function numericMatches(input,answer,unit='') {
 const match=String(input).trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-zA-Zμµ%×]*)$/);
 if(!match) return false;
 let value=Number(match[1]), supplied=match[2].replace('µ','μ');
 const scales={ps:1e-12,ns:1e-9,'μs':1e-6,us:1e-6,ms:1e-3};
 if(supplied && supplied!==unit) {
  if(scales[supplied]&&scales[unit]) value=value*scales[supplied]/scales[unit];
  else if(!(['x','×'].includes(supplied)&&unit==='x')) return false;
 }
 return Number.isFinite(value)&&Math.abs(value-answer)<=Math.max(0.011,Math.abs(answer)*0.005);
}
