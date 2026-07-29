import { LEVELS, parse } from './shapes.js';
const OFF=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const K=(x,y,z)=>`${x},${y},${z}`;

function build(shape){
  const {cells,mass}=parse(shape); const keep=new Set(cells.keys());
  const all=[...mass].map(k=>{const [x,y,z]=k.split(',').map(Number);
    return {k,x,y,z,keeper:keep.has(k),carved:false,struck:false};});
  const by=new Map(all.map(c=>[c.k,c]));
  for(const c of all) c.near=OFF.reduce((n,[dx,dy,dz])=>{
    const o=by.get(K(c.x+dx,c.y+dy,c.z+dz)); return n+(o&&o.keeper?1:0);},0);
  return {all,by};
}
const nbrs=(g,c)=>OFF.map(([dx,dy,dz])=>g.by.get(K(c.x+dx,c.y+dy,c.z+dz))).filter(Boolean);

// one pass of the exact rules findHint() uses
function propagate(g){
  let moved=true, steps=0;
  while(moved){ moved=false;
    for(const c of g.all){ if(!c.carved) continue;
      const n=nbrs(g,c); const known=n.filter(x=>x.struck).length;
      const unk=n.filter(x=>!x.carved&&!x.struck);
      if(!unk.length) continue;
      const rem=c.near-known;
      if(rem===0){ unk.forEach(u=>{u.carved=true;}); moved=true; steps++; }
      else if(rem===unk.length){ unk.forEach(u=>{u.struck=true;}); moved=true; steps++; }
    }
  }
  return steps;
}

const out=LEVELS.map(shape=>{
  const g=build(shape);
  const waste=g.all.filter(c=>!c.keeper);
  // best possible opening: a waste cell with the lowest clue (most informative)
  const seed=[...waste].sort((a,b)=>a.near-b.near)[0];
  seed.carved=true;
  let guesses=1;
  propagate(g);
  // keep making the most-favourable guess until solved or provably stuck
  while(g.all.some(c=>!c.keeper&&!c.carved)){
    const cand=g.all.filter(c=>!c.keeper&&!c.carved).sort((a,b)=>a.near-b.near)[0];
    if(!cand) break;
    cand.carved=true; guesses++;
    propagate(g);
    if(guesses>200) break;
  }
  const solved=!g.all.some(c=>!c.keeper&&!c.carved);
  return {name:shape.name,waste:waste.length,guesses,solved,
    zeroSeed:seed.near===0,
    deduced:waste.length-guesses};
});

const pure=out.filter(r=>r.guesses===1).length;
console.log(`levels: ${out.length}`);
console.log(`solvable from ONE opening guess, pure deduction after: ${pure}  (${(pure/out.length*100).toFixed(0)}%)`);
console.log(`levels with a zero-clue opening available: ${out.filter(r=>r.zeroSeed).length}`);
console.log(`guesses needed — min ${Math.min(...out.map(r=>r.guesses))}, median ${out.map(r=>r.guesses).sort((a,b)=>a-b)[30]}, max ${Math.max(...out.map(r=>r.guesses))}`);
console.log(`\nworst offenders (most blind guesses required):`);
out.sort((a,b)=>b.guesses-a.guesses).slice(0,8)
   .forEach(r=>console.log(`  ${r.name.padEnd(14)} ${String(r.guesses).padStart(3)} guesses / ${r.waste} waste  (${(r.deduced/r.waste*100).toFixed(0)}% deduced)`));
console.log(`\nbest (most deducible):`);
out.slice(-6).reverse().forEach(r=>console.log(`  ${r.name.padEnd(14)} ${String(r.guesses).padStart(3)} guesses / ${r.waste} waste`));
const avgDed=out.reduce((s,r)=>s+r.deduced/r.waste,0)/out.length;
console.log(`\naverage share of waste removed by DEDUCTION rather than guessing: ${(avgDed*100).toFixed(1)}%`);
