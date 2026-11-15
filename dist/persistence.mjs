export const STORAGE_KEY='pipelinelab.v1';
export function freshData(){return {version:1,settings:{forwarding:true,sharedMemory:false,speed:700},programs:[],problems:[],progress:{}};}
export function recoverData(raw){
 try {
  const d=JSON.parse(raw);
  if(d?.version!==1) return freshData();
  const clean=freshData();
  if(typeof d.settings?.forwarding==='boolean') clean.settings.forwarding=d.settings.forwarding;
  if(typeof d.settings?.sharedMemory==='boolean') clean.settings.sharedMemory=d.settings.sharedMemory;
  if(Number.isFinite(d.settings?.speed)&&d.settings.speed>=100&&d.settings.speed<=2000) clean.settings.speed=d.settings.speed;
  clean.programs=Array.isArray(d.programs)?d.programs.filter(p=>typeof p.name==='string'&&p.name.length<=60&&typeof p.code==='string'&&p.code.length<=12000).slice(0,20):[];
  clean.problems=Array.isArray(d.problems)?d.problems.filter(p=>p&&typeof p==='object'&&Number.isInteger(p.n)&&Number.isInteger(p.k)&&Array.isArray(p.delays)).slice(0,20):[];
  clean.progress=d.progress&&typeof d.progress==='object'&&!Array.isArray(d.progress)?Object.fromEntries(Object.entries(d.progress).filter(([k,v])=>/^[\w-]{1,50}$/.test(k)&&v===true)):{};
  return clean;
 }catch{return freshData();}
}
export function readData(storage){try{return recoverData(storage.getItem(STORAGE_KEY));}catch{return freshData();}}
export function writeData(storage,data){try{storage.setItem(STORAGE_KEY,JSON.stringify(data));return true;}catch{return false;}}
