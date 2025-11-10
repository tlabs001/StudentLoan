function mkRNG(seed){let t=seed>>>0;return function(){t+=0x6D2B79F5;let r=Math.imul(t^t>>>15,1|t);r^=r+Math.imul(r^r>>>7,61|r);return((r^r>>>14)>>>0)/4294967296;};}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist2=(x1,y1,x2,y2)=>{const dx=x1-x2,dy=y1-y2;return dx*dx+dy*dy;};

function buildSegments(platforms,{spawnSpreadMin=120,worldPadding=24,forbidLeftX=null}){
  const rows=platforms
    .filter(p=>!p.type||p.type!=='move')
    .map(p=>({x:p.x,w:p.w,y:p.y,semi:p.semisolid!==false}))
    .filter(r=>r.w>=80);
  const segs=[];
  for(const r of rows){
    const blocks=Math.max(1,Math.floor(r.w/Math.max(spawnSpreadMin,80)));
    const segW=r.w/blocks;
    for(let i=0;i<blocks;i++){
      const sx=r.x+i*segW+10;
      const sw=Math.max(40,segW-20);
      if(forbidLeftX!==null && (sx+sw)<forbidLeftX) continue;
      segs.push({x:sx,w:sw,y:r.y,pad:worldPadding});
    }
  }
  return segs;
}

function blueNoisePick(segs,rng,{count,minDist,avoidPoints=[]}){
  for(let i=segs.length-1;i>0;i--){const j=(rng()*(i+1))|0;[segs[i],segs[j]]=[segs[j],segs[i]];}
  const picks=[];
  const ok=(x,y)=>{
    for(const p of picks){if(dist2(x,y,p.x,p.y)<minDist*minDist) return false;}
    for(const q of avoidPoints){if(dist2(x,y,q.x,q.y)<(q.r*q.r)) return false;}
    return true;
  };
  let i=0;
  while(picks.length<count && i<segs.length*3){
    const s=segs[i%segs.length];
    const x=clamp(s.x+(rng()*s.w),s.x+s.pad,s.x+s.w-s.pad);
    const y=s.y-1;
    if(ok(x,y)) picks.push({x,y});
    i++;
  }
  return picks;
}

export function generateGuardSpawnsInitial({platforms,playerX,count=12,minDist=140,seed=1337,spawnSpreadMin=120,worldPadding=24,leftMargin=50}){
  const rng=mkRNG(seed|0);
  const segs=buildSegments(platforms,{spawnSpreadMin,worldPadding,forbidLeftX:playerX+leftMargin});
  return blueNoisePick(segs,rng,{count,minDist,avoidPoints:[{x:playerX,y:Infinity,r:160}]});
}

export function generateGuardSpawnsRefill({platforms,playerX,count=24,minDist=140,seed=202,spawnSpreadMin=120,worldPadding=24,avoidRadius=140}){
  const rng=mkRNG(seed|0);
  const segs=buildSegments(platforms,{spawnSpreadMin,worldPadding,forbidLeftX:null});
  return blueNoisePick(segs,rng,{count,minDist,avoidPoints:[{x:playerX,y:Infinity,r:avoidRadius}]});
}
