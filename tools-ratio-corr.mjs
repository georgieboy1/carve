import { LEVELS, parse } from './shapes.js';
const OFF=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const K=(x,y,z)=>`${x},${y},${z}`;
function build(s){const {cells,mass}=parse(s);const keep=new Set(cells.keys());
 const all=[...mass].map(k=>{const [x,y,z]=k.split(',').map(Number);
  return {k,x,y,z,keeper:keep.has(k),carved:false,struck:false};});
 const by=new Map(all.map(c=>[c.k,c]));
 for(const c of all)c.near=OFF.reduce((n,[dx,dy,dz])=>{const o=by.get(K(c.x+dx,c.y+dy,c.z+dz));return n+(o&&o.keeper?1:0);},0);
 return {all,by,keptRatio:cells.size/mass.size};}
const nb=(g,c)=>OFF.map(([dx,dy,dz])=>g.by.get(K(c.x+dx,c.y+dy,c.z+dz))).filter(Boolean);
function prop(g){let m=true;while(m){m=false;for(const c of g.all){if(!c.carved)continue;
 const n=nb(g,c),kn=n.filter(x=>x.struck).length,u=n.filter(x=>!x.carved&&!x.struck);
 if(!u.length)continue;const r=c.near-kn;
 if(r===0){u.forEach(x=>x.carved=true);m=true;}else if(r===u.length){u.forEach(x=>x.struck=true);m=true;}}}}
const rows=LEVELS.map(s=>{const g=build(s);const w=g.all.filter(c=>!c.keeper);
 let gu=0;while(g.all.some(c=>!c.keeper&&!c.carved)){
  const c=g.all.filter(x=>!x.keeper&&!x.carved).sort((a,b)=>a.near-b.near)[0];
  c.carved=true;gu++;prop(g);if(gu>300)break;}
 return {name:s.name,ratio:g.keptRatio,waste:w.length,guesses:gu,ded:1-gu/w.length};});
// correlation between kept-ratio and share deduced
const n=rows.length,mx=rows.reduce((s,r)=>s+r.ratio,0)/n,my=rows.reduce((s,r)=>s+r.ded,0)/n;
const cov=rows.reduce((s,r)=>s+(r.ratio-mx)*(r.ded-my),0);
const sx=Math.sqrt(rows.reduce((s,r)=>s+(r.ratio-mx)**2,0)),sy=Math.sqrt(rows.reduce((s,r)=>s+(r.ded-my)**2,0));
console.log(`correlation(kept-ratio, share deduced) = ${(cov/(sx*sy)).toFixed(3)}`);
console.log(`  negative => a SMALLER sculpture in a BIGGER box deduces better\n`);
const band=(lo,hi)=>{const b=rows.filter(r=>r.ratio>=lo&&r.ratio<hi);
 if(!b.length)return;
 console.log(`kept ${(lo*100).toFixed(0)}-${(hi*100).toFixed(0)}%  n=${String(b.length).padStart(2)}  avg deduced ${(b.reduce((s,r)=>s+r.ded,0)/b.length*100).toFixed(0).padStart(3)}%   avg guesses ${(b.reduce((s,r)=>s+r.guesses,0)/b.length).toFixed(1)}`);};
[[0.1,0.35],[0.35,0.45],[0.45,0.55],[0.55,0.65],[0.65,0.8]].forEach(([a,b])=>band(a,b));
