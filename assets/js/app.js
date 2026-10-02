
(function(){
"use strict";
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;

const COLORS = {
  protein:'#e8a33d', dna:'#4fd1c5', rna:'#b989ff', membrane:'#e8618c',
  grid:'rgba(148,163,184,0.10)', dim:'#5b6478', panel2:'#0d1522'
};

function hexToRgb(hex){ hex=hex.replace('#',''); const n=parseInt(hex,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function rgbLerp(c1,c2,t){ return c1.map((v,i)=>Math.round(v+(c2[i]-v)*t)); }
function toRgbStr(c){ return 'rgb('+c[0]+','+c[1]+','+c[2]+')'; }

function fitCanvas(canvas){
  const dpr = Math.min(2, window.devicePixelRatio||1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w*dpr || canvas.height !== h*dpr){
    canvas.width = w*dpr; canvas.height = h*dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx, w, h};
}
/* ============================================================
   TAB NAVIGATION
   ============================================================ */
const tabs = document.querySelectorAll('.station-tab');
function activateTab(tab){
  tabs.forEach(t=>{
    t.setAttribute('aria-selected','false');
    t.setAttribute('tabindex','-1');
  });
  document.querySelectorAll('.station').forEach(s=>s.classList.remove('active'));
  tab.setAttribute('aria-selected','true');
  tab.setAttribute('tabindex','0');
  const target = document.getElementById(tab.dataset.target);
  target.classList.add('active');
  target.dispatchEvent(new CustomEvent('stationactive'));
  if (!reduceMotion) document.getElementById('main').scrollIntoView({behavior:'smooth', block:'start'});
}
tabs.forEach(tab=>{
  tab.addEventListener('click', ()=>{
    activateTab(tab);
  });
  tab.addEventListener('keydown', event=>{
    const keys = ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = Array.prototype.indexOf.call(tabs, tab);
    let next = current;
    if (event.key==='ArrowRight' || event.key==='ArrowDown') next=(current+1)%tabs.length;
    if (event.key==='ArrowLeft' || event.key==='ArrowUp') next=(current-1+tabs.length)%tabs.length;
    if (event.key==='Home') next=0;
    if (event.key==='End') next=tabs.length-1;
    tabs[next].focus();
    activateTab(tabs[next]);
  });
});

/* ============================================================
   HERO AMBIENT ANIMATION
   ============================================================ */
(function heroAnim(){
  const canvas = document.getElementById('hero-canvas');
  function genCurve(fn,n){ const pts=[]; for(let i=0;i<=n;i++){ const x=i/n; pts.push({x,y:clamp(fn(x),0,1)}); } return pts; }
  const N=50;
  const curveA = genCurve(x=>0.5+0.42*Math.exp(-3.2*x)*Math.cos(9*x), N);
  const curveB = genCurve(x=>Math.pow(x,0.55), N);
  const curveC = genCurve(x=>Math.exp(-4*x), N);
  const curves=[curveA,curveB,curveC];
  const colors=[COLORS.protein,COLORS.dna,COLORS.membrane];

  function draw(from,to,t,colorFrom,colorTo){
    const {ctx,w,h} = fitCanvas(canvas);
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth=1;
    const gap=44;
    for(let x=0;x<w;x+=gap){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for(let y=0;y<h;y+=gap){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    const padX=w*0.06, plotW=w-padX*2, plotH=h*0.46, baseY=h*0.62;
    const col = toRgbStr(rgbLerp(hexToRgb(colorFrom),hexToRgb(colorTo),t));
    ctx.beginPath();
    for(let i=0;i<from.length;i++){
      const yi = lerp(from[i].y, to[i].y, t);
      const px = padX + from[i].x*plotW;
      const py = baseY - yi*plotH;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.strokeStyle=col; ctx.lineWidth=2.5;
    ctx.shadowColor=col; ctx.shadowBlur=16;
    ctx.stroke();
    ctx.shadowBlur=0;
  }

  if (reduceMotion){ draw(curveA,curveA,0,colors[0],colors[0]); window.addEventListener('resize',()=>draw(curveA,curveA,0,colors[0],colors[0])); return; }

  let start=null;
  const segDur=6, total=segDur*3;
  function loop(ts){
    if(!start) start=ts;
    const elapsed=(ts-start)/1000;
    const tmod = elapsed % total;
    const segIndex = Math.floor(tmod/segDur);
    let localT = (tmod - segIndex*segDur)/segDur;
    localT = localT*localT*(3-2*localT);
    const from = curves[segIndex], to = curves[(segIndex+1)%3];
    draw(from,to,localT,colors[segIndex],colors[(segIndex+1)%3]);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.addEventListener('resize', ()=>{});
})();

/* ============================================================
   STATION 1 — PROTEIN FOLDING (HP lattice model)
   ============================================================ */
(function proteinModule(){
  const canvas = document.getElementById('protein-canvas');
  const seqInput = document.getElementById('protein-seq');
  const speedInput = document.getElementById('protein-speed');
  const speedVal = document.getElementById('protein-speed-val');
  const toggleBtn = document.getElementById('protein-toggle');
  const resetBtn = document.getElementById('protein-reset');
  const energyEl = document.getElementById('protein-energy');
  const bestEl = document.getElementById('protein-best');
  const stepsEl = document.getElementById('protein-steps');
  const tempEl = document.getElementById('protein-temp');
  const funnelCanvas = document.getElementById('protein-funnel-canvas');

  let seq = [], positions = [], currentEnergy = 0, bestEnergy = 0, T = 2.0, stepCount = 0, energyHistory = [], bestPositions = [];
  let running = false, raf = null;
  const T0 = 2.0, coolingRate = 0.9995, Tmin = 0.05;

  function parseSeq(str){
    const clean = str.toUpperCase().replace(/[^HP]/g,'').slice(0,30);
    return clean.length>=6 ? clean.split('') : 'HPHPPHHPHPPHPHHPPHPH'.split('');
  }
  function keyOf(p){ return p[0]+','+p[1]; }
  function occupiedSet(pos, exclude){ const s=new Set(); pos.forEach((p,i)=>{ if(i!==exclude) s.add(keyOf(p)); }); return s; }

  function initChain(n){
    const pos=[]; for(let i=0;i<n;i++) pos.push([i,0]);
    return pos;
  }

  function computeEnergy(pos, s){
    let e=0;
    const map = new Map();
    pos.forEach((p,i)=>map.set(keyOf(p),i));
    for(let i=0;i<pos.length;i++){
      if (s[i]!=='H') continue;
      const [x,y]=pos[i];
      [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].forEach(nb=>{
        const j = map.get(keyOf(nb));
        if (j!==undefined && j>i && j!==i+1 && s[j]==='H') e -= 1;
      });
    }
    return e;
  }

  function tryPivotMove(pos){
    const n=pos.length;
    if (n<4) return null;
    const pivot=1+Math.floor(Math.random()*(n-2));
    const origin=pos[pivot];
    const clockwise=Math.random()<0.5;
    const next=pos.map((p,i)=>{
      if (i<=pivot) return p;
      const dx=p[0]-origin[0], dy=p[1]-origin[1];
      return clockwise ? [origin[0]-dy,origin[1]+dx] : [origin[0]+dy,origin[1]-dx];
    });
    const occupied=new Set(next.map(keyOf));
    return occupied.size===next.length ? next : null;
  }
  function tryMove(pos){
    if (Math.random()<0.22){
      const pivotMove=tryPivotMove(pos);
      if (pivotMove) return pivotMove;
    }
    const n = pos.length;
    const i = Math.floor(Math.random()*n);
    let candidates = [];
    if (i===0 || i===n-1){
      const j = (i===0)?1:n-2;
      const nb = pos[j];
      const occ = occupiedSet(pos, i);
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(d=>{
        const cand=[nb[0]+d[0], nb[1]+d[1]];
        if(!occ.has(keyOf(cand)) && keyOf(cand)!==keyOf(pos[i])) candidates.push(cand);
      });
    } else {
      const a=pos[i-1], b=pos[i], c=pos[i+1];
      const dx=c[0]-a[0], dy=c[1]-a[1];
      if (Math.abs(dx)===1 && Math.abs(dy)===1){
        const opt1=[a[0],c[1]], opt2=[c[0],a[1]];
        const other = (b[0]===opt1[0] && b[1]===opt1[1]) ? opt2 : opt1;
        const occ = occupiedSet(pos, i);
        if(!occ.has(keyOf(other))) candidates.push(other);
      }
    }
    if (candidates.length===0) return null;
    const newPos = candidates[Math.floor(Math.random()*candidates.length)];
    const next = pos.map((p,idx)=> idx===i? newPos : p);
    return next;
  }

  function step(){
    const next = tryMove(positions);
    if (next){
      const newE = computeEnergy(next, seq);
      const dE = newE - currentEnergy;
      let accept = dE<=0;
      if (!accept){ accept = Math.random() < Math.exp(-dE/Math.max(T,0.001)); }
      if (accept){
        positions = next; currentEnergy = newE;
        if (newE < bestEnergy){ bestEnergy = newE; bestPositions = positions.map(p=>p.slice()); }
      }
    }
    T = Math.max(Tmin, T*coolingRate);
    energyHistory.push(currentEnergy); if (energyHistory.length > 240) energyHistory.shift();
    stepCount++;
  }

  function reset(){
    seq = parseSeq(seqInput.value);
    positions = initChain(seq.length);
    currentEnergy = computeEnergy(positions, seq);
    bestEnergy = currentEnergy;
    T = T0; stepCount = 0;
    render();
  }

  function render(){
    const {ctx,w,h} = fitCanvas(canvas);
    ctx.clearRect(0,0,w,h);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    positions.forEach(p=>{ minX=Math.min(minX,p[0]); maxX=Math.max(maxX,p[0]); minY=Math.min(minY,p[1]); maxY=Math.max(maxY,p[1]); });
    const spanX=Math.max(1,maxX-minX), spanY=Math.max(1,maxY-minY);
    const pad=34;
    const scale = Math.min((w-2*pad)/spanX, (h-2*pad)/spanY, 42);
    const originX = w/2 - ((minX+maxX)/2)*scale;
    const originY = h/2 - ((minY+maxY)/2)*scale;
    const toPx = p => [originX+p[0]*scale, originY+p[1]*scale];

    ctx.strokeStyle = 'rgba(232,163,61,0.55)'; ctx.lineWidth=2;
    ctx.beginPath();
    positions.forEach((p,i)=>{ const [px,py]=toPx(p); if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
    ctx.stroke();

    positions.forEach((p,i)=>{
      const [px,py]=toPx(p);
      ctx.beginPath();
      ctx.arc(px,py, scale*0.28, 0, Math.PI*2);
      ctx.fillStyle = seq[i]==='H' ? COLORS.protein : '#5a7ea3';
      ctx.shadowColor = seq[i]==='H' ? COLORS.protein : 'transparent';
      ctx.shadowBlur = seq[i]==='H' ? 8 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    energyEl.textContent = currentEnergy;
    bestEl.textContent = bestEnergy;
    stepsEl.textContent = stepCount;
    tempEl.textContent = T.toFixed(2);

    drawFunnel();
  }

  function drawFunnel(){
    if (!funnelCanvas) return;
    const {ctx,w,h} = fitCanvas(funnelCanvas);
    ctx.clearRect(0,0,w,h);
    const cx=w/2;
    const top=12, bottom=h-18;
    ctx.strokeStyle='rgba(255,255,255,0.10)';
    ctx.lineWidth=1;
    for(let i=0;i<5;i++){
      const y=top+i*(bottom-top)/4;
      const half=lerp(w*0.44,w*0.08,i/4);
      ctx.beginPath(); ctx.moveTo(cx-half,y); ctx.lineTo(cx+half,y); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx-w*0.44,top); ctx.lineTo(cx-w*0.08,bottom);
    ctx.moveTo(cx+w*0.44,top); ctx.lineTo(cx+w*0.08,bottom);
    ctx.strokeStyle='rgba(232,163,61,0.35)'; ctx.stroke();

    const minE=Math.min(...energyHistory, currentEnergy, bestEnergy);
    const maxE=Math.max(...energyHistory, currentEnergy, 0);
    const range=Math.max(1,maxE-minE);
    const ex=energyHistory.map((e,i)=>({x:16+(i/Math.max(1,energyHistory.length-1))*(w-32), y:top+((e-minE)/range)*(bottom-top)}));
    if(ex.length>1){
      ctx.beginPath(); ex.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.strokeStyle='rgba(125,211,252,0.75)'; ctx.lineWidth=1.5; ctx.stroke();
    }
    const norm=clamp((currentEnergy-minE)/range,0,1);
    const dotX=cx + Math.sin(stepCount*0.17)*(w*0.24)*(1-norm);
    const dotY=top+norm*(bottom-top);
    ctx.beginPath(); ctx.arc(dotX,dotY,5.5,0,Math.PI*2);
    ctx.fillStyle=COLORS.protein; ctx.shadowColor=COLORS.protein; ctx.shadowBlur=10; ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle='rgba(231,235,243,0.68)';
    ctx.font='10px "IBM Plex Mono", monospace';
    ctx.fillText('higher free energy',10,11);
    ctx.fillText('lower / more stable',10,h-4);
  }

  function stop(){
    running=false;
    if (raf!==null){ cancelAnimationFrame(raf); raf=null; }
  }
  function loop(){
    if (!running){ raf=null; return; }
    const n = parseInt(speedInput.value,10);
    for(let i=0;i<n;i++) step();
    render();
    raf = requestAnimationFrame(loop);
  }

  toggleBtn.addEventListener('click', ()=>{
    if (running){
      stop();
      toggleBtn.textContent='Run folding search';
    } else {
      running=true;
      toggleBtn.textContent='Pause search';
      loop();
    }
  });
  resetBtn.addEventListener('click', ()=>{ stop(); toggleBtn.textContent='Run folding search'; reset(); });
  speedInput.addEventListener('input', ()=>{ speedVal.textContent = speedInput.value+' steps/frame'; });
  seqInput.addEventListener('change', ()=>{ stop(); toggleBtn.textContent='Run folding search'; reset(); });
  window.addEventListener('resize', ()=>{ render(); drawFunnel(); });

  reset();
})();

/* ============================================================
   STATION 2 — DNA MECHANICS (worm-like chain)
   ============================================================ */
(function dnaModule(){
  const canvas = document.getElementById('dna-canvas');
  const forceInput = document.getElementById('dna-force');
  const lpInput = document.getElementById('dna-lp');
  const forceVal = document.getElementById('dna-force-val');
  const lpVal = document.getElementById('dna-lp-val');
  const extEl = document.getElementById('dna-ext');
  const forceReadEl = document.getElementById('dna-force-read');
  const lpReadEl = document.getElementById('dna-lp-read');

  const kT = 4.1; // pN*nm

  function wlcForce(z, Lp){ return (kT/Lp) * (0.25/Math.pow(1-z,2) - 0.25 + z); }
  function solveExtension(F, Lp){
    let lo=0, hi=0.995;
    for(let i=0;i<70;i++){
      const mid=(lo+hi)/2;
      if (wlcForce(mid,Lp) < F) lo=mid; else hi=mid;
    }
    return (lo+hi)/2;
  }

  let t0 = null;

  function render(ts){
    const {ctx,w,h} = fitCanvas(canvas);
    ctx.clearRect(0,0,w,h);

    const F = parseFloat(forceInput.value);
    const Lp = parseFloat(lpInput.value);
    const z = solveExtension(F, Lp);

    forceVal.textContent = F.toFixed(2)+' pN';
    lpVal.textContent = Lp+' nm';
    extEl.textContent = (z*100).toFixed(1)+'%';
    forceReadEl.textContent = F.toFixed(2)+' pN';
    lpReadEl.textContent = Lp+' nm';

    // grid
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth=1;
    for(let x=0;x<w;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for(let y=0;y<h;y+=40){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    // force-extension theoretical curve
    const padX=44, padY=20, plotW=w-padX-20, plotH=h*0.42, baseY=plotH+padY;
    const Fmax = 18;
    ctx.beginPath();
    for(let i=0;i<=80;i++){
      const zz=i/80*0.97;
      const ff=clamp(wlcForce(zz,Lp),0,Fmax);
      const px=padX+zz*plotW, py=baseY-(ff/Fmax)*plotH;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.strokeStyle='rgba(79,209,197,0.5)'; ctx.lineWidth=2; ctx.stroke();

    // current point
    const cx = padX+z*plotW, cy = baseY-(clamp(F,0,Fmax)/Fmax)*plotH;
    ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2);
    ctx.fillStyle=COLORS.dna; ctx.shadowColor=COLORS.dna; ctx.shadowBlur=12; ctx.fill(); ctx.shadowBlur=0;

    ctx.fillStyle=COLORS.dim; ctx.font='11px "IBM Plex Mono", monospace';
    ctx.fillText('force →', padX, padY-6);
    ctx.fillText('extension x/L →', w-140, baseY+16);

    // DNA strand visual: wavy line that straightens with z, gentle jitter for thermal motion
    const stripY = h*0.78;
    const ampBase = (1-z)*26;
    const jitter = ts ? Math.sin(ts/260)*2 : 0;
    ctx.beginPath();
    const segs=60;
    for(let i=0;i<=segs;i++){
      const px = 20 + (i/segs)*(w-40);
      const py = stripY + Math.sin(i*0.9 + (ts||0)/500)*(ampBase*0.6+jitter*0.3);
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.strokeStyle=COLORS.dna; ctx.lineWidth=2.4; ctx.shadowColor=COLORS.dna; ctx.shadowBlur=6; ctx.stroke(); ctx.shadowBlur=0;

    if (!reduceMotion){ requestAnimationFrame(render); }
  }

  forceInput.addEventListener('input', ()=>{ if(reduceMotion) render(); });
  lpInput.addEventListener('input', ()=>{ if(reduceMotion) render(); });
  window.addEventListener('resize', ()=>{ if(reduceMotion) render(); });

  if (reduceMotion) render(0); else requestAnimationFrame(render);
})();

/* ============================================================
   STATION 3 — RNA MOLECULAR VIEWER
   ============================================================ */
(function rnaModule(){
  const section = document.getElementById('station-rna');
  const canvas = document.getElementById('rna-canvas');
  const spinBtn = document.getElementById('rna-spin');
  const pairsBtn = document.getElementById('rna-pairs');
  const pairCountEl = document.getElementById('rna-pair-count');
  const nucleotideCount = 42;
  let spinning = !reduceMotion;
  let showPairs = false;
  let rotation = 0;
  let lastFrame = null;
  let raf = null;

  function rotateY(point, angle){
    const c=Math.cos(angle), s=Math.sin(angle);
    return {x:point.x*c+point.z*s, y:point.y, z:-point.x*s+point.z*c};
  }
  function project(point, w, h){
    const depth = 280/(280-point.z);
    return {x:w/2+point.x*depth, y:h/2+point.y*depth, z:point.z, scale:depth};
  }
  function drawSphere(ctx, point, radius, colour){
    const r=Math.max(1.5, radius*point.scale);
    const grad=ctx.createRadialGradient(point.x-r*0.35,point.y-r*0.45,r*0.12,point.x,point.y,r);
    grad.addColorStop(0,'rgba(255,255,255,0.98)');
    grad.addColorStop(0.22,colour);
    grad.addColorStop(1,'rgba(10,15,26,0.82)');
    ctx.beginPath(); ctx.arc(point.x,point.y,r,0,Math.PI*2);
    ctx.fillStyle=grad; ctx.shadowColor=colour; ctx.shadowBlur=9*point.scale; ctx.fill(); ctx.shadowBlur=0;
  }
  function nucleotide(i){
    const u=(i/(nucleotideCount-1))*Math.PI*2;
    const centre={
      x:Math.sin(u*2.0)*(60+9*Math.sin(u*5)),
      y:Math.cos(u*3.0)*45 + Math.sin(u*1.3)*12,
      z:Math.sin(u*4.0)*34
    };
    const arm={x:Math.cos(u*3.4)*13,y:Math.sin(u*2.1)*10,z:Math.cos(u*4.3)*10};
    return {
      phosphate:centre,
      sugar:{x:centre.x+arm.x,y:centre.y+arm.y,z:centre.z+arm.z},
      base:{x:centre.x+arm.x*1.9,y:centre.y+arm.y*1.9,z:centre.z+arm.z*1.9}
    };
  }
  function draw(){
    if (!section.classList.contains('active')) return;
    const {ctx,w,h}=fitCanvas(canvas);
    ctx.clearRect(0,0,w,h);
    const halo=ctx.createRadialGradient(w*0.5,h*0.48,8,w*0.5,h*0.48,Math.max(w,h)*0.52);
    halo.addColorStop(0,'rgba(185,137,255,0.17)'); halo.addColorStop(1,'rgba(13,21,34,0)');
    ctx.fillStyle=halo; ctx.fillRect(0,0,w,h);

    const nucleotides=[];
    for(let i=0;i<nucleotideCount;i++){
      const n=nucleotide(i);
      nucleotides.push({
        phosphate:project(rotateY(n.phosphate,rotation),w,h),
        sugar:project(rotateY(n.sugar,rotation),w,h),
        base:project(rotateY(n.base,rotation),w,h)
      });
    }

    ctx.lineWidth=1.5;
    for(let i=1;i<nucleotides.length;i++){
      const a=nucleotides[i-1].phosphate, b=nucleotides[i].phosphate;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      ctx.strokeStyle='rgba(226,215,255,0.34)'; ctx.stroke();
    }
    nucleotides.forEach(n=>{
      ctx.beginPath(); ctx.moveTo(n.phosphate.x,n.phosphate.y); ctx.lineTo(n.sugar.x,n.sugar.y); ctx.lineTo(n.base.x,n.base.y);
      ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.stroke();
    });
    if (showPairs){
      for(let i=6;i<18;i+=2){
        const a=nucleotides[i].base, b=nucleotides[nucleotideCount-1-i].base;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
        ctx.setLineDash([3,4]); ctx.strokeStyle='rgba(79,209,197,0.84)'; ctx.stroke(); ctx.setLineDash([]);
      }
    }

    const atoms=[];
    nucleotides.forEach(n=>{
      atoms.push({point:n.phosphate,r:6.0,colour:'#f1c66b'});
      atoms.push({point:n.sugar,r:5.2,colour:'#83b9ff'});
      atoms.push({point:n.base,r:6.6,colour:COLORS.rna});
    });
    atoms.sort((a,b)=>a.point.z-b.point.z).forEach(a=>drawSphere(ctx,a.point,a.r,a.colour));
    ctx.fillStyle='rgba(231,235,243,0.72)'; ctx.font='11px "IBM Plex Mono", monospace';
    ctx.fillText('folded RNA · molecular view',16,h-16);
  }
  function animate(ts){
    raf=null;
    if (lastFrame!==null) rotation += (ts-lastFrame)*0.00034;
    lastFrame=ts;
    draw();
    if (spinning && section.classList.contains('active')) raf=requestAnimationFrame(animate);
  }
  function start(){
    if (spinning && !reduceMotion && raf===null) raf=requestAnimationFrame(animate);
    else draw();
  }
  spinBtn.addEventListener('click',()=>{
    if (reduceMotion) return;
    spinning=!spinning;
    spinBtn.textContent=spinning?'Pause rotation':'Resume rotation';
    if (!spinning && raf!==null){ cancelAnimationFrame(raf); raf=null; }
    if (spinning){ lastFrame=null; start(); }
  });
  pairsBtn.addEventListener('click',()=>{
    showPairs=!showPairs;
    pairsBtn.textContent=showPairs?'Hide base pairs':'Show base pairs';
    pairsBtn.setAttribute('aria-pressed',String(showPairs));
    pairCountEl.textContent=showPairs?'6 shown':'Hidden';
    draw();
  });
  section.addEventListener('stationactive',()=>{ lastFrame=null; start(); });
  window.addEventListener('resize',draw);
  if (reduceMotion){ spinning=false; spinBtn.textContent='Rotation disabled'; spinBtn.disabled=true; }
})();

/* ============================================================
   STATION 4 — DNA PARTICLE ZOOM
   ============================================================ */
(function dnaZoomModule(){
  const section=document.getElementById('station-dna-zoom');
  const canvas=document.getElementById('dna-zoom-canvas');
  const zoomBtn=document.getElementById('dna-zoom-toggle');
  const motionBtn=document.getElementById('dna-zoom-motion');
  const levelEl=document.getElementById('dna-zoom-level');
  const pairsEl=document.getElementById('dna-zoom-pairs');
  const scaleEl=document.getElementById('dna-zoom-scale');
  const statusEl=document.getElementById('dna-zoom-status');
  let zoomed=false;
  let moving=!reduceMotion;
  let raf=null;

  function particle(ctx,x,y,r,colour){
    const g=ctx.createRadialGradient(x-r*0.35,y-r*0.4,r*0.1,x,y,r);
    g.addColorStop(0,'#fff'); g.addColorStop(0.24,colour); g.addColorStop(1,'rgba(10,15,26,0.88)');
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.shadowColor=colour; ctx.shadowBlur=7; ctx.fill(); ctx.shadowBlur=0;
  }
  function draw(ts=0){
    if (!section.classList.contains('active')) return;
    const {ctx,w,h}=fitCanvas(canvas);
    ctx.clearRect(0,0,w,h);
    const pairCount=zoomed?6:22;
    const turns=zoomed?0.82:2.2;
    const amplitude=zoomed?Math.min(120,w*0.28):Math.min(72,w*0.18);
    const top=zoomed?38:22, bottom=h-(zoomed?42:24);
    const jitter=moving?Math.sin(ts/420)*1.4:0;
    const pairs=[];
    for(let i=0;i<pairCount;i++){
      const f=pairCount===1?0.5:i/(pairCount-1);
      const angle=f*Math.PI*2*turns;
      const y=top+f*(bottom-top);
      const x1=w/2+Math.sin(angle)*amplitude;
      const x2=w/2-Math.sin(angle)*amplitude;
      pairs.push({x1,x2,y,angle});
    }
    ctx.lineWidth=2.2; ctx.strokeStyle='rgba(79,209,197,0.43)';
    ctx.beginPath(); pairs.forEach((p,i)=>i?ctx.lineTo(p.x1,p.y):ctx.moveTo(p.x1,p.y)); ctx.stroke();
    ctx.strokeStyle='rgba(232,97,140,0.5)'; ctx.beginPath(); pairs.forEach((p,i)=>i?ctx.lineTo(p.x2,p.y):ctx.moveTo(p.x2,p.y)); ctx.stroke();
    pairs.forEach((p,i)=>{
      const baseColour=i%2===0?'#e8a33d':'#b989ff';
      ctx.beginPath(); ctx.moveTo(p.x1,p.y); ctx.lineTo(p.x2,p.y); ctx.strokeStyle='rgba(255,255,255,0.32)'; ctx.lineWidth=zoomed?2:1; ctx.stroke();
      particle(ctx,p.x1,p.y+jitter,zoomed?10:4.3,COLORS.dna);
      particle(ctx,p.x2,p.y-jitter,zoomed?10:4.3,COLORS.membrane);
      particle(ctx,(p.x1+p.x2)/2,p.y,zoomed?12:4.8,baseColour);
      if (zoomed){
        ctx.fillStyle='rgba(231,235,243,0.78)'; ctx.font='11px "IBM Plex Mono", monospace';
        ctx.fillText(i%2===0?'A · T':'G · C',(p.x1+p.x2)/2-13,p.y-17);
        ctx.setLineDash([2,3]); ctx.beginPath(); ctx.moveTo((p.x1+p.x2)/2-7,p.y); ctx.lineTo((p.x1+p.x2)/2+7,p.y); ctx.strokeStyle='rgba(255,255,255,0.78)'; ctx.stroke(); ctx.setLineDash([]);
      }
    });
    ctx.fillStyle='rgba(231,235,243,0.72)'; ctx.font='11px "IBM Plex Mono", monospace';
    ctx.fillText(zoomed?'base-pair particle view':'DNA double-helix overview',16,h-16);
  }
  function animate(ts){
    raf=null; draw(ts);
    if (moving && section.classList.contains('active')) raf=requestAnimationFrame(animate);
  }
  function start(){
    if (moving && !reduceMotion && raf===null) raf=requestAnimationFrame(animate);
    else draw();
  }
  function updateReadout(){
    levelEl.textContent=zoomed?'Base pairs':'Helix';
    pairsEl.textContent=zoomed?'6':'22';
    scaleEl.textContent=zoomed?'0.34 nm':'3.4 nm';
    statusEl.textContent=zoomed?'Zoomed in: inspect phosphate, sugar, bases, and hydrogen bonds.':'Overview: trace the two sugar–phosphate backbones.';
  }
  zoomBtn.addEventListener('click',()=>{
    zoomed=!zoomed;
    zoomBtn.textContent=zoomed?'Return to helix':'Zoom into base pairs';
    zoomBtn.setAttribute('aria-pressed',String(zoomed));
    updateReadout(); draw();
  });
  motionBtn.addEventListener('click',()=>{
    if (reduceMotion) return;
    moving=!moving;
    motionBtn.textContent=moving?'Pause particle motion':'Resume particle motion';
    motionBtn.setAttribute('aria-pressed',String(!moving));
    if (!moving && raf!==null){ cancelAnimationFrame(raf); raf=null; }
    if (moving) start();
  });
  section.addEventListener('stationactive',start);
  window.addEventListener('resize',draw);
  if (reduceMotion){ moving=false; motionBtn.textContent='Motion disabled'; motionBtn.disabled=true; }
})();

/* ============================================================
   STATION 5 — MEMBRANE DIFFUSION
   ============================================================ */
(function membraneModule(){
  const canvas = document.getElementById('membrane-canvas');
  const graphCanvas = document.getElementById('membrane-graph');
  const leftInput = document.getElementById('mem-left');
  const rightInput = document.getElementById('mem-right');
  const permInput = document.getElementById('mem-perm');
  const leftVal = document.getElementById('mem-left-val');
  const rightVal = document.getElementById('mem-right-val');
  const permVal = document.getElementById('mem-perm-val');
  const toggleBtn = document.getElementById('mem-toggle');
  const resetBtn = document.getElementById('mem-reset');
  const leftCountEl = document.getElementById('mem-left-count');
  const rightCountEl = document.getElementById('mem-right-count');
  const ticksEl = document.getElementById('mem-ticks');
  const kEl = document.getElementById('mem-k');

  let particles = [];
  let running = false;
  let tick = 0;
  let dataPoints = [];
  let initialized = false;
  const MAX_POINTS = 400;

  function initParticles(){
    particles = [];
    const nL = parseInt(leftInput.value,10);
    const nR = parseInt(rightInput.value,10);
    const {w,h} = fitCanvas(canvas);
    const mid = w/2;
    for(let i=0;i<nL;i++) particles.push({x:Math.random()*(mid-16)+4, y:Math.random()*(h-16)+8});
    for(let i=0;i<nR;i++) particles.push({x:mid+16+Math.random()*(mid-16-4), y:Math.random()*(h-16)+8});
    tick = 0; dataPoints = [];
    initialized = true;
    kEl.textContent = '—';
  }

  function stepParticles(){
    const {w,h} = fitCanvas(canvas);
    const mid = w/2;
    const perm = parseFloat(permInput.value);
    const speed = 3.2;
    particles.forEach(p=>{
      const prevSide = Math.sign(p.x-mid) || 1;
      let nx = p.x + (Math.random()-0.5)*speed*2;
      let ny = p.y + (Math.random()-0.5)*speed*2;
      ny = clamp(ny, 4, h-4);
      nx = clamp(nx, 4, w-4);
      const newSide = Math.sign(nx-mid) || prevSide;
      if (newSide !== prevSide){
        if (Math.random() < perm){ p.x = nx; } // crosses
        else { p.x = mid + prevSide*2; } // stays in the original chamber
      } else {
        p.x = nx;
      }
      p.y = ny;
    });
    tick++;
    if (tick % 3 === 0 && dataPoints.length < MAX_POINTS){
      const {w:ww} = fitCanvas(canvas);
      const midw = ww/2;
      const leftCount = particles.filter(p=>p.x<midw).length;
      dataPoints.push({t:tick, left:leftCount});
    }
  }

  function renderSim(){
    const {ctx,w,h} = fitCanvas(canvas);
    ctx.clearRect(0,0,w,h);
    const mid = w/2;
    const perm = parseFloat(permInput.value);

    // chambers backdrop
    ctx.fillStyle='rgba(232,97,140,0.03)'; ctx.fillRect(0,0,mid,h);
    ctx.fillStyle='rgba(79,209,197,0.03)'; ctx.fillRect(mid,0,w-mid,h);

    // membrane: dashed, gaps scale with permeability
    const gapLen = lerp(4, 22, perm);
    ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=2;
    ctx.setLineDash([gapLen, 10]);
    ctx.beginPath(); ctx.moveTo(mid,0); ctx.lineTo(mid,h); ctx.stroke();
    ctx.setLineDash([]);

    particles.forEach(p=>{
      ctx.beginPath();
      ctx.arc(p.x,p.y,2.6,0,Math.PI*2);
      ctx.fillStyle = COLORS.membrane;
      ctx.fill();
    });

    const leftCount = particles.filter(p=>p.x<mid).length;
    const rightCount = particles.length - leftCount;
    leftCountEl.textContent = leftCount;
    rightCountEl.textContent = rightCount;
    ticksEl.textContent = tick;
  }

  function linreg(xs, ys){
    const n=xs.length;
    let sx=0,sy=0,sxy=0,sxx=0;
    for(let i=0;i<n;i++){ sx+=xs[i]; sy+=ys[i]; sxy+=xs[i]*ys[i]; sxx+=xs[i]*xs[i]; }
    const denom = n*sxx - sx*sx;
    if (denom===0) return {slope:0, intercept: sy/n};
    return { slope:(n*sxy - sx*sy)/denom, intercept:(sy - ((n*sxy-sx*sy)/denom)*sx)/n };
  }

  function renderGraph(){
    const {ctx,w,h} = fitCanvas(graphCanvas);
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle=COLORS.grid; ctx.lineWidth=1;
    for(let x=0;x<w;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for(let y=0;y<h;y+=30){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    if (dataPoints.length<2) return;

    const total = particles.length;
    const Ceq = total/2;
    const maxT = dataPoints[dataPoints.length-1].t;
    const pad=8;
    const toPx = (t,c) => [pad+(t/Math.max(1,maxT))*(w-2*pad), h-pad-(c/Math.max(1,total))*(h-2*pad)];

    // raw data
    ctx.beginPath();
    dataPoints.forEach((d,i)=>{ const [px,py]=toPx(d.t,d.left); if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
    ctx.strokeStyle=COLORS.membrane; ctx.lineWidth=2; ctx.stroke();

    // fit
    if (dataPoints.length>=15){
      const C0 = dataPoints[0].left;
      const initialDiff = C0-Ceq;
      const sign = Math.sign(initialDiff);
      if (sign===0){ kEl.textContent='—'; return; }
      const xs=[], ys=[];
      dataPoints.forEach(d=>{
        const diff = d.left - Ceq;
        if (diff*sign > 1.5){ xs.push(d.t); ys.push(Math.log(Math.abs(diff))); }
      });
      if (xs.length>=8){
        const {slope, intercept} = linreg(xs,ys);
        const k = -slope;
        if (k>0 && isFinite(k)){
          kEl.textContent = k.toExponential(2)+' /tick';
          ctx.beginPath();
          for(let i=0;i<=60;i++){
            const t=(i/60)*maxT;
            const c = Ceq + sign*Math.exp(intercept)*Math.exp(-k*t);
            const [px,py]=toPx(t,c);
            if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
          }
          ctx.setLineDash([5,4]);
          ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.6; ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  let raf = null;
  function ensureInitialized(){
    if (!initialized) initParticles();
  }
  function stop(){
    running=false;
    if (raf!==null){ cancelAnimationFrame(raf); raf=null; }
  }
  function loop(){
    if (!running){ raf=null; return; }
    stepParticles();
    renderSim();
    renderGraph();
    raf = requestAnimationFrame(loop);
  }

  toggleBtn.addEventListener('click', ()=>{
    if (running){
      stop();
      toggleBtn.textContent='Start diffusion';
    } else {
      ensureInitialized();
      running=true;
      toggleBtn.textContent='Pause';
      loop();
    }
  });
  resetBtn.addEventListener('click', ()=>{
    stop(); toggleBtn.textContent='Start diffusion';
    initParticles(); renderSim(); renderGraph();
  });
  [leftInput,rightInput].forEach(inp=>inp.addEventListener('input', ()=>{
    leftVal.textContent = leftInput.value;
    rightVal.textContent = rightInput.value;
    if(!running){ initParticles(); renderSim(); renderGraph(); }
  }));
  permInput.addEventListener('input', ()=>{ permVal.textContent = parseFloat(permInput.value).toFixed(2); });
  const membraneSection=document.getElementById('station-membrane');
  membraneSection.addEventListener('stationactive', ()=>{
    ensureInitialized();
    renderSim();
    renderGraph();
  });
  window.addEventListener('resize', ()=>{
    if (membraneSection.classList.contains('active')){ renderSim(); renderGraph(); }
  });
})();


/* ============================================================
   STATION 6 — KINESIN / BROWNIAN MOTOR
   ============================================================ */
(function kinesinModule(){
  const section=document.getElementById('station-kinesin'), canvas=document.getElementById('kinesin-canvas');
  if(!canvas) return;
  const atp=document.getElementById('kin-atp'), load=document.getElementById('kin-load'), temp=document.getElementById('kin-temp');
  const atpv=document.getElementById('kin-atp-val'), loadv=document.getElementById('kin-load-val'), tempv=document.getElementById('kin-temp-val');
  const vel=document.getElementById('kin-v'), rate=document.getElementById('kin-rate'), eff=document.getElementById('kin-eff');
  let x=0.18, target=0.18, phase=0, last=performance.now(), raf=null;
  const vmax=800, stall=7.0, eta=1.2, stepNm=8;
  function update(){
    const A=parseFloat(atp.value), F=parseFloat(load.value), T=parseFloat(temp.value);
    const forceFactor=F>=stall?0:Math.max(0,1-Math.pow(F/stall,eta));
    const stepRate=25*A*forceFactor;
    const v=vmax*(A/(A+0.25))*forceFactor*(300/T);
    atpv.textContent=A.toFixed(2); loadv.textContent=F.toFixed(1)+' pN'; tempv.textContent=T+' K';
    vel.textContent=v.toFixed(0)+' nm/s'; rate.textContent=stepRate.toFixed(1)+' s⁻¹';
    const work=F*stepNm; eff.textContent=F>0?Math.min(100,100*work/(20*4.14)).toFixed(1)+'%':'0.0%';
    return {v,stepRate,T};
  }
  function draw(now){
    if(!section.classList.contains('active')) return;
    const {ctx,w,h}=fitCanvas(canvas);
    ctx.clearRect(0,0,w,h);
    const dt=Math.min(0.05,(now-last)/1000); last=now;
    const m=update();
    phase += dt*(1+m.stepRate*0.03);
    x += m.v*dt*0.00012;
    if(x>0.86){x=0.18;}
    const baseY=h*0.60;
    ctx.strokeStyle='rgba(125,211,252,0.35)'; ctx.lineWidth=10; ctx.beginPath(); ctx.moveTo(20,baseY); ctx.lineTo(w-20,baseY); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=2;
    for(let i=0;i<28;i++){const px=25+i*(w-50)/27; ctx.beginPath(); ctx.moveTo(px,baseY-7);ctx.lineTo(px,baseY+7);ctx.stroke();}
    const jitter=(Math.random()-0.5)*(m.T/300)*9;
    const mx=x*w, my=baseY-32+jitter;
    ctx.strokeStyle='rgba(232,163,61,0.8)';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(mx-18,my+10);ctx.lineTo(mx-8,my+28);ctx.lineTo(mx+8,my+28);ctx.lineTo(mx+18,my+10);ctx.stroke();
    ctx.fillStyle=COLORS.protein;ctx.beginPath();ctx.arc(mx-10,my,10,0,Math.PI*2);ctx.arc(mx+10,my,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(231,235,243,0.75)';ctx.font='11px "IBM Plex Mono", monospace';
    ctx.fillText('microtubule',20,baseY+28);ctx.fillText('cargo / kinesin',Math.max(10,mx-42),my-22);
    raf=requestAnimationFrame(draw);
  }
  [atp,load,temp].forEach(i=>i.addEventListener('input',update));
  section.addEventListener('stationactive',()=>{last=performance.now();if(raf===null)raf=requestAnimationFrame(draw);});
  if(reduceMotion) update();
})();

/* ============================================================
   STATION 7 — HODGKIN–HUXLEY
   ============================================================ */
(function hhModule(){
  const section=document.getElementById('station-hh'), canvas=document.getElementById('hh-canvas');
  if(!canvas) return;
  const Iin=document.getElementById('hh-current'), Nain=document.getElementById('hh-na'), Kin=document.getElementById('hh-k'), ttx=document.getElementById('hh-ttx');
  const Iv=document.getElementById('hh-current-val'), Nav=document.getElementById('hh-na-val'), Kv=document.getElementById('hh-k-val');
  const Vout=document.getElementById('hh-v'), GNa=document.getElementById('hh-gna'), GK=document.getElementById('hh-gk'), spikesOut=document.getElementById('hh-spikes');
  const resetBtn=document.getElementById('hh-reset'), pauseBtn=document.getElementById('hh-pause');
  const Cm=1, gNaMax=120, gKMax=36, gL=0.3, R=8.314, F=96485, baseTemp=310;
  let V=-65,m=0.0529,h=0.596,n=0.317,t=0, spikes=0, lastV=-65, paused=false, hist=[];
  function alphaM(v){let x=v+40;return Math.abs(x)<1e-6?1:x/(1-Math.exp(-x/10));}
  function betaM(v){return 4*Math.exp(-(v+65)/18);}
  function alphaH(v){return 0.07*Math.exp(-(v+65)/20);}
  function betaH(v){return 1/(1+Math.exp(-(v+35)/10));}
  function alphaN(v){let x=v+55;return Math.abs(x)<1e-6?0.1:x/(10*(1-Math.exp(-x/10)));}
  function betaN(v){return 0.125*Math.exp(-(v+65)/80);}
  function nernst(z,cout,cin,T){return (R*T/(z*F))*1000*Math.log(cout/cin);}
  function reset(){V=-65;m=alphaM(V)/(alphaM(V)+betaM(V));h=alphaH(V)/(alphaH(V)+betaH(V));n=alphaN(V)/(alphaN(V)+betaN(V));t=0;spikes=0;lastV=V;hist=[];draw();}
  function step(dt){
    const T=baseTemp, ena=nernst(1,parseFloat(Nain.value),12,T), ek=nernst(1,parseFloat(Kin.value),140,T);
    const el=-54.4, I=parseFloat(Iin.value), gna=ttx.checked?0:gNaMax*m*m*m*h, gk=gKMax*n*n*n*n;
    const ina=gna*(V-ena), ik=gk*(V-ek), il=gL*(V-el);
    const dV=(I-ina-ik-il)/Cm;
    const am=alphaM(V),bm=betaM(V),ah=alphaH(V),bh=betaH(V),an=alphaN(V),bn=betaN(V);
    V += dt*dV; m += dt*(am*(1-m)-bm*m); h += dt*(ah*(1-h)-bh*h); n += dt*(an*(1-n)-bn*n); t+=dt;
    if(lastV<0 && V>=0) spikes++;
    lastV=V;
    hist.push({t,V,gna,gk}); if(hist.length>900)hist.shift();
  }
  function draw(){
    const {ctx,w,h}=fitCanvas(canvas); ctx.clearRect(0,0,w,h);
    Iv.textContent=parseFloat(Iin.value).toFixed(1)+' µA/cm²'; Nav.textContent=Nain.value+' mM'; Kv.textContent=Kin.value+' mM';
    Vout.textContent=V.toFixed(1)+' mV'; GNa.textContent=(ttx.checked?0:gNaMax*m*m*m*h).toFixed(1); GK.textContent=(gKMax*n*n*n*n).toFixed(1); spikesOut.textContent=spikes;
    ctx.strokeStyle=COLORS.grid;ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    const pad=28, lo=-90, hi=50;
    ctx.strokeStyle='rgba(167,243,208,0.9)';ctx.lineWidth=2;ctx.beginPath();
    hist.forEach((p,i)=>{const x=pad+(i/Math.max(1,hist.length-1))*(w-2*pad), y=h-pad-((p.V-lo)/(hi-lo))*(h-2*pad);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
    ctx.fillStyle='rgba(231,235,243,0.65)';ctx.font='10px "IBM Plex Mono", monospace';ctx.fillText('mV',6,16);ctx.fillText('time →',w-58,h-6);
  }
  let raf=null,last=performance.now();
  function loop(now){if(!section.classList.contains('active')){raf=null;return;}const elapsed=Math.min(40,now-last);last=now;if(!paused){for(let i=0;i<Math.max(1,Math.floor(elapsed/0.02));i++)step(0.02);}draw();raf=requestAnimationFrame(loop);}
  [Iin,Nain,Kin,ttx].forEach(i=>i.addEventListener('input',()=>{}));
  resetBtn.addEventListener('click',reset); pauseBtn.addEventListener('click',()=>{paused=!paused;pauseBtn.textContent=paused?'Resume':'Pause';});
  section.addEventListener('stationactive',()=>{last=performance.now();if(raf===null)raf=requestAnimationFrame(loop);});
  reset();
})();

/* ============================================================
   STATION 8 — ATP SYNTHASE
   ============================================================ */
(function atpModule(){
  const section=document.getElementById('station-atp'), canvas=document.getElementById('atp-canvas');
  if(!canvas) return;
  const dph=document.getElementById('atp-dph'), dpsi=document.getElementById('atp-dpsi'), load=document.getElementById('atp-load'), ring=document.getElementById('atp-ring');
  const dphv=document.getElementById('atp-dph-val'), dpsiv=document.getElementById('atp-dpsi-val'), loadv=document.getElementById('atp-load-val'), ringv=document.getElementById('atp-ring-val');
  const dpOut=document.getElementById('atp-dp'), rpmOut=document.getElementById('atp-rpm'), torqueOut=document.getElementById('atp-torque'), rateOut=document.getElementById('atp-rate');
  const R=8.314,F=96485,T=310,kB=4.141947e-21;
  let angle=0, last=performance.now(), raf=null;
  function calc(){
    const ph=parseFloat(dph.value), psi=parseFloat(dpsi.value)/1000, L=parseFloat(load.value), c=parseInt(ring.value);
    const pmf=psi-(2.303*R*T/F)*ph; const pmf_mV=pmf*1000;
    const usable=Math.max(0,Math.abs(pmf_mV)-35);
    const tauDrive=Math.max(0, Math.abs(pmf)*F/c*1e-21*1e9); // illustrative pN·nm scale
    const tau=Math.min(tauDrive,Math.max(0,tauDrive-L));
    const rpm=1800*usable/200; const atpPerRev=3; const atpRate=rpm/60*atpPerRev;
    dphv.textContent=ph.toFixed(2);dpsiv.textContent=parseFloat(dpsi.value).toFixed(0)+' mV';loadv.textContent=L.toFixed(0)+' pN·nm';ringv.textContent=c;
    dpOut.textContent=Math.abs(pmf_mV).toFixed(1)+' mV';rpmOut.textContent=rpm.toFixed(0)+' rpm';torqueOut.textContent=tau.toFixed(1)+' pN·nm';rateOut.textContent=atpRate.toFixed(1)+' s⁻¹';
    return {rpm,tau,c,ph};
  }
  function draw(now){
    if(!section.classList.contains('active'))return;
    const {ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);const m=calc(),dt=Math.min(0.05,(now-last)/1000);last=now;angle+=dt*m.rpm*2*Math.PI/60;
    const cx=w/2,cy=h/2,r=Math.min(w,h)*0.25;
    ctx.strokeStyle='rgba(232,97,140,0.28)';ctx.lineWidth=18;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<m.c;i++){const a=angle+i*2*Math.PI/m.c;const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;ctx.fillStyle=COLORS.membrane;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='rgba(125,211,252,0.75)';ctx.lineWidth=3;for(let i=0;i<7;i++){const y=22+i*14;ctx.beginPath();ctx.moveTo(12,y);ctx.lineTo(48,y);ctx.stroke();ctx.beginPath();ctx.arc(54,y,4,0,Math.PI*2);ctx.fillStyle='#7dd3fc';ctx.fill();}
    ctx.fillStyle='rgba(231,235,243,0.75)';ctx.font='11px "IBM Plex Mono", monospace';ctx.fillText('H⁺ flow',12,14);ctx.fillText('F₀ rotor',cx-28,cy+5);ctx.fillText('F₁ catalytic head',cx-48,cy-r-22);
    raf=requestAnimationFrame(draw);
  }
  [dph,dpsi,load,ring].forEach(i=>i.addEventListener('input',calc));
  section.addEventListener('stationactive',()=>{last=performance.now();if(raf===null)raf=requestAnimationFrame(draw);});
})();

/* ============================================================
   SYLLABUS TOPIC 7 — TRANSPORT IN PLANTS
   ============================================================ */
(function plantTransportModule(){
  const section=document.getElementById('station-plants'), canvas=document.getElementById('plant-canvas');
  if(!canvas) return;
  const wind=document.getElementById('plant-wind'), temp=document.getElementById('plant-temp'), humidity=document.getElementById('plant-humidity'), light=document.getElementById('plant-light');
  const out={wind:document.getElementById('plant-wind-val'),temp:document.getElementById('plant-temp-val'),humidity:document.getElementById('plant-humidity-val'),light:document.getElementById('plant-light-val'),rate:document.getElementById('plant-rate'),ke:document.getElementById('plant-ke'),flow:document.getElementById('plant-flow'),tension:document.getElementById('plant-tension')};
  function model(){
    const W=+wind.value,T=+temp.value,H=+humidity.value,L=+light.value;
    const vapour=Math.max(0,(100-H)*0.022 + W*0.07 + (T-5)*0.035 + L/1000*0.35);
    const ke=1.5*8.314*(T+273.15)/1000;
    const flow=vapour*0.32, tension=8+vapour*18;
    out.wind.textContent=W.toFixed(1)+' m/s';out.temp.textContent=T+' °C';out.humidity.textContent=H+'%';out.light.textContent=L+' μmol m⁻² s⁻¹';
    out.rate.textContent=vapour.toFixed(2)+' mmol h⁻¹';out.ke.textContent=ke.toFixed(2)+' kJ mol⁻¹';out.flow.textContent=flow.toFixed(2)+' mL h⁻¹';out.tension.textContent='−'+tension.toFixed(0)+' kPa';
    return {W,T,H,L,vapour,flow};
  }
  function draw(){
    if(!section.classList.contains('active')) return;
    const m=model(),{ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);
    const split=w*.52, ground=h*.76, stemX=w*.22, leafY=h*.24;
    ctx.fillStyle='rgba(118,213,138,.08)';ctx.fillRect(0,0,split,h);
    ctx.strokeStyle='rgba(118,213,138,.76)';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(stemX,ground);ctx.lineTo(stemX,leafY+18);ctx.stroke();
    ctx.fillStyle='rgba(118,213,138,.82)';ctx.beginPath();ctx.ellipse(stemX-28,leafY,34,16,-.45,0,Math.PI*2);ctx.ellipse(stemX+27,leafY+7,34,16,.45,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(96,165,250,.3)';ctx.fillRect(stemX-46,ground,92,h-ground-14);ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=1;ctx.strokeRect(stemX-46,ground,92,h-ground-14);
    ctx.strokeStyle='rgba(96,165,250,.85)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(stemX+46,ground+22);ctx.lineTo(split-18,ground+22);ctx.stroke();
    const bubble=stemX+65+(split-stemX-92)*Math.min(.96,m.flow/1.2);ctx.fillStyle='#7dd3fc';ctx.beginPath();ctx.arc(bubble,ground+22,6,0,Math.PI*2);ctx.fill();
    for(let i=0;i<6;i++){const y=ground-18-i*70;const x=stemX+Math.sin(i*2.4)*5;ctx.fillStyle='rgba(125,211,252,.82)';ctx.beginPath();ctx.arc(x,y,3.4,0,Math.PI*2);ctx.fill();}
    for(let i=0;i<7;i++){const x=stemX+(i-3)*12;const y=leafY-25-i%2*8;ctx.strokeStyle='rgba(231,235,243,'+(0.15+m.vapour*.12)+')';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+m.W*2.2,y-12-m.T*.12);ctx.stroke();}
    ctx.fillStyle='rgba(231,235,243,.7)';ctx.font='11px IBM Plex Mono, monospace';ctx.fillText('leaf evaporation',20,20);ctx.fillText('potometer bubble',stemX+50,ground+50);ctx.fillText('water uptake over time',split+16,20);
    const gx=split+18,gy=40,gw=w-split-36,gh=h-78;ctx.strokeStyle='rgba(255,255,255,.15)';ctx.strokeRect(gx,gy,gw,gh);
    ctx.strokeStyle='#76d58a';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<=80;i++){const x=gx+i/80*gw;const y=gy+gh-(1-Math.exp(-i/25))*Math.min(.9,m.flow/.8)*gh;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)}ctx.stroke();
    ctx.fillStyle='rgba(231,235,243,.55)';ctx.fillText('uptake',gx+4,gy+13);ctx.fillText('time →',gx+gw-48,gy+gh-7);
  }
  [wind,temp,humidity,light].forEach(el=>el.addEventListener('input',draw));
  section.addEventListener('stationactive',draw);window.addEventListener('resize',draw);
})();

/* ============================================================
   SYLLABUS TOPIC 8 — TRANSPORT IN MAMMALS
   ============================================================ */
(function mammalTransportModule(){
  const section=document.getElementById('station-mammals'), cardiac=document.getElementById('mammal-cardiac-canvas'), bohr=document.getElementById('mammal-bohr-canvas');
  if(!cardiac||!bohr) return;  const rate=document.getElementById('mammal-rate'), phase=document.getElementById('mammal-phase'), co2=document.getElementById('mammal-pco2');
  const out={rate:document.getElementById('mammal-rate-val'),phase:document.getElementById('mammal-phase-val'),co2:document.getElementById('mammal-pco2-val'),aorta:document.getElementById('mammal-aorta'),lv:document.getElementById('mammal-lv'),p50:document.getElementById('mammal-p50'),sat:document.getElementById('mammal-sat')};
  let current=0,raf=null,last=performance.now();
  const pulse=(x,c,width)=>Math.exp(-Math.pow((x-c)/width,2));
  function pressure(x){const lv=5+118*pulse(x,.25,.12);const aorta=78+43*pulse(x,.30,.16)-7*pulse(x,.56,.035);const atrium=7+7*pulse(x,.08,.07)+5*pulse(x,.67,.12);return {lv,aorta,atrium};}
  function saturation(po2,p50){const n=2.7;return 100*Math.pow(po2,n)/(Math.pow(p50,n)+Math.pow(po2,n));}
  function draw(){
    if(!section.classList.contains('active')) return;
    const r=+rate.value,p=+phase.value/100,c=+co2.value,p50=26.6+(c-40)*.42,pr=pressure(p),now=pressure(current);
    out.rate.textContent=r+' bpm';out.phase.textContent=Math.round(p*100)+'%';out.co2.textContent=c+' mmHg';out.aorta.textContent=pr.aorta.toFixed(0)+' mmHg';out.lv.textContent=pr.lv.toFixed(0)+' mmHg';out.p50.textContent=p50.toFixed(1)+' mmHg';out.sat.textContent=saturation(40,p50).toFixed(0)+'%';
    let fit=fitCanvas(cardiac),ctx=fit.ctx,w=fit.w,h=fit.h;ctx.clearRect(0,0,w,h);
    const heartX=w*.18,heartY=h*.5,beat=.88+.13*(now.lv-5)/118;ctx.save();ctx.translate(heartX,heartY);ctx.scale(beat,beat);ctx.fillStyle='rgba(251,113,133,.78)';ctx.beginPath();ctx.moveTo(0,26);ctx.bezierCurveTo(-64,-16,-28,-58,0,-24);ctx.bezierCurveTo(28,-58,64,-16,0,26);ctx.fill();ctx.restore();
    ctx.fillStyle='rgba(231,235,243,.72)';ctx.font='11px IBM Plex Mono, monospace';ctx.fillText('heart',heartX-15,heartY+52);
    const gx=w*.37,gy=30,gw=w-gx-18,gh=h-72;ctx.strokeStyle='rgba(255,255,255,.16)';ctx.strokeRect(gx,gy,gw,gh);
    const paths=[['#fb7185','left ventricle','lv'],['#facc15','aorta','aorta'],['#60a5fa','left atrium','atrium']];
    paths.forEach((item,index)=>{ctx.strokeStyle=item[0];ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<=120;i++){const x=i/120,v=pressure(x)[item[2]],px=gx+x*gw,py=gy+gh-(v/130)*gh;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py)}ctx.stroke();ctx.fillStyle=item[0];ctx.fillText(item[1],gx+6,gy+16+index*14);});
    ctx.strokeStyle='rgba(231,235,243,.5)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(gx+p*gw,gy);ctx.lineTo(gx+p*gw,gy+gh);ctx.stroke();ctx.setLineDash([]);
    fit=fitCanvas(bohr);ctx=fit.ctx;w=fit.w;h=fit.h;ctx.clearRect(0,0,w,h);const pad=28,gw2=w-pad-12,gh2=h-pad-22;ctx.strokeStyle='rgba(255,255,255,.16)';ctx.strokeRect(pad,12,gw2,gh2);
    [[p50,'#fb7185'],[26.6,'#60a5fa']].forEach(item=>{ctx.strokeStyle=item[1];ctx.lineWidth=2.2;ctx.beginPath();for(let i=0;i<=120;i++){const po=i,s=saturation(po,item[0]),x=pad+po/120*gw2,y=12+gh2-s/100*gh2;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();});
    ctx.fillStyle='rgba(231,235,243,.62)';ctx.font='10px IBM Plex Mono, monospace';ctx.fillText('O₂ saturation (%)',pad+4,25);ctx.fillText('pO₂ →',w-55,h-6);
  }
  function tick(now){if(!section.classList.contains('active')){raf=null;return;}const dt=Math.min(.05,(now-last)/1000);last=now;current=(current+dt*(+rate.value)/60)%1;phase.value=Math.round(current*100);draw();raf=requestAnimationFrame(tick);}
  [rate,phase,co2].forEach(el=>el.addEventListener('input',()=>{if(el===phase)current=+phase.value/100;draw();}));
  section.addEventListener('stationactive',()=>{last=performance.now();if(raf===null)raf=requestAnimationFrame(tick);});
})();

/* ============================================================
   SYLLABUS TOPIC 12 — ENERGY AND RESPIRATION
   ============================================================ */
(function respirationModule(){
  const section=document.getElementById('station-respiration'),canvas=document.getElementById('respiration-canvas');
  if(!canvas) return;
  const oxygen=document.getElementById('respiration-oxygen'),pump=document.getElementById('respiration-pump'),reset=document.getElementById('respiration-reset');
  const out={oxygen:document.getElementById('respiration-oxygen-val'),protons:document.getElementById('respiration-protons'),pmf:document.getElementById('respiration-pmf'),rpm:document.getElementById('respiration-rpm'),atp:document.getElementById('respiration-atp')};
  let protons=8,electrons=0,atp=0,angle=0;
  function draw(){
    if(!section.classList.contains('active')) return;
    const O=+oxygen.value,pmf=protons*2.2*Math.min(1,O/65),rpm=Math.max(0,(protons-10)*O*.42);
    out.oxygen.textContent=O+'%';out.protons.textContent=protons;out.pmf.textContent=Math.round(pmf)+' mV';out.rpm.textContent=Math.round(rpm)+' rpm';out.atp.textContent=atp;
    const {ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);const my=h*.54;
    ctx.fillStyle='rgba(250,204,21,.08)';ctx.fillRect(0,0,w,my-14);ctx.fillStyle='rgba(96,165,250,.06)';ctx.fillRect(0,my+14,w,h-my-14);
    ctx.strokeStyle='rgba(251,191,36,.7)';ctx.lineWidth=24;ctx.beginPath();ctx.moveTo(20,my);ctx.lineTo(w-20,my);ctx.stroke();
    const chain=[w*.16,w*.31,w*.46];chain.forEach((x,i)=>{ctx.fillStyle=['#60a5fa','#a78bfa','#facc15'][i];ctx.beginPath();ctx.arc(x,my,22,0,Math.PI*2);ctx.fill();ctx.fillStyle='#0a0f1a';ctx.font='10px IBM Plex Mono, monospace';ctx.fillText('I'+(i+1),x-6,my+4);});
    for(let i=0;i<protons;i++){const x=28+(i*47)%Math.max(60,w-64),y=22+Math.floor(i*47/Math.max(60,w-64))*26;ctx.fillStyle='#f8fafc';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#facc15';ctx.font='9px IBM Plex Mono, monospace';ctx.fillText('+',x-2,y+3);}
    const cx=w*.76,cy=my,r=38;angle+=rpm*.003;ctx.strokeStyle='#fb7185';ctx.lineWidth=13;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){const a=angle+i*Math.PI/4;ctx.fillStyle='#facc15';ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='rgba(231,235,243,.72)';ctx.font='11px IBM Plex Mono, monospace';ctx.fillText('intermembrane space',16,18);ctx.fillText('matrix',16,h-12);ctx.fillText('ATP synthase',cx-33,my+68);
  }
  pump.addEventListener('click',()=>{const gain=Math.max(1,Math.round(+oxygen.value/18));protons=Math.min(72,protons+gain);electrons++;if(protons>18)atp+=Math.floor((protons-12)/14);draw();});
  reset.addEventListener('click',()=>{protons=8;electrons=0;atp=0;draw();});oxygen.addEventListener('input',draw);section.addEventListener('stationactive',draw);window.addEventListener('resize',draw);
})();

/* ============================================================
   SYLLABUS TOPIC 13 — PHOTOSYNTHESIS
   ============================================================ */
(function photosynthesisModule(){
  const section=document.getElementById('station-photosynthesis'),canvas=document.getElementById('photosynthesis-canvas');
  if(!canvas) return;
  const wave=document.getElementById('photo-wave'),light=document.getElementById('photo-light'),co2=document.getElementById('photo-co2'),temp=document.getElementById('photo-temp');
  const out={wave:document.getElementById('photo-wave-val'),light:document.getElementById('photo-light-val'),co2:document.getElementById('photo-co2-val'),temp:document.getElementById('photo-temp-val'),rate:document.getElementById('photo-rate'),limit:document.getElementById('photo-limit'),energy:document.getElementById('photo-energy')};
  function absorbance(l){return Math.max(.15,Math.exp(-Math.pow((l-440)/45,2))*.88+Math.exp(-Math.pow((l-675)/38,2)));} 
  function draw(){
    if(!section.classList.contains('active')) return;
    const W=+wave.value,L=+light.value,C=+co2.value,T=+temp.value,lightCap=Math.min(1,L/700)*absorbance(W),co2Cap=Math.min(1,C/650),tempCap=Math.exp(-Math.pow((T-27)/11,2)),caps=[['light',lightCap],['CO₂',co2Cap],['temperature',tempCap]],lim=caps.reduce((a,b)=>a[1]<b[1]?a:b),rate=lim[1]*100,e=119626/W;
    out.wave.textContent=W+' nm';out.light.textContent=L+' μmol m⁻² s⁻¹';out.co2.textContent=C+' ppm';out.temp.textContent=T+' °C';out.rate.textContent=rate.toFixed(0)+'%';out.limit.textContent=lim[0];out.energy.textContent=e.toFixed(0)+' kJ mol⁻¹';
    const {ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);const pad=36,gw=w-pad-18,gh=h-56;ctx.strokeStyle='rgba(255,255,255,.16)';ctx.strokeRect(pad,18,gw,gh);ctx.fillStyle='rgba(231,235,243,.65)';ctx.font='10px IBM Plex Mono, monospace';ctx.fillText('relative photosynthesis rate',pad+4,32);ctx.fillText('factor availability →',w-126,h-8);
    const curves=[['#facc15',x=>Math.min(x*1.55*absorbance(W),co2Cap,tempCap)],['#60a5fa',x=>Math.min(lightCap,x*1.55,tempCap)],['#fb7185',x=>Math.min(lightCap,co2Cap,Math.exp(-Math.pow((x*45-27)/11,2)))]];
    curves.forEach(item=>{ctx.strokeStyle=item[0];ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<=100;i++){const x=i/100,y=item[1](x),px=pad+x*gw,py=18+gh-y*gh;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.stroke();});
    ctx.strokeStyle='#e7ebf3';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pad,18+gh-rate/100*gh);ctx.lineTo(pad+gw,18+gh-rate/100*gh);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#facc15';ctx.fillText('light',pad+8,gh+11);ctx.fillStyle='#60a5fa';ctx.fillText('CO₂',pad+55,gh+11);ctx.fillStyle='#fb7185';ctx.fillText('temperature',pad+92,gh+11);
  }
  [wave,light,co2,temp].forEach(el=>el.addEventListener('input',draw));section.addEventListener('stationactive',draw);window.addEventListener('resize',draw);
})();

/* ============================================================
   SYLLABUS TOPIC 15 — CONTROL AND COORDINATION
   ============================================================ */
(function controlModule(){
  const section=document.getElementById('station-control'),canvas=document.getElementById('control-canvas');
  if(!canvas) return;
  const stimulus=document.getElementById('control-stimulus'),fire=document.getElementById('control-fire'),reset=document.getElementById('control-reset');
  const out={stim:document.getElementById('control-stimulus-val'),v:document.getElementById('control-voltage'),na:document.getElementById('control-na'),k:document.getElementById('control-k'),state:document.getElementById('control-state')};
  let firing=false,start=0,raf=null,lastTrace=[];
  function sample(t){if(!firing)return {v:-70,na:'closed',k:'closed',state:'resting'};if(t<.12)return {v:-70+t/0.12*15,na:'opening',k:'closed',state:'threshold'};if(t<.42)return {v:-55+(t-.12)/.30*90,na:'open',k:'closed',state:'depolarising'};if(t<.78)return {v:35-(t-.42)/.36*105,na:'inactivated',k:'open',state:'repolarising'};if(t<1.1)return {v:-70-(1-(t-.78)/.32)*13,na:'closed',k:'closing',state:'hyperpolarising'};return {v:-70,na:'closed',k:'closed',state:'resting'};}
  function draw(now){
    if(!section.classList.contains('active')) return;
    const elapsed=firing?(now-start)/1000:0,nowSample=sample(elapsed);if(firing&&elapsed>1.3)firing=false;
    out.stim.textContent=stimulus.value+' μA';out.v.textContent=nowSample.v.toFixed(0)+' mV';out.na.textContent=nowSample.na;out.k.textContent=nowSample.k;out.state.textContent=nowSample.state;
    const {ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);ctx.strokeStyle=COLORS.grid;ctx.lineWidth=1;for(let x=0;x<w;x+=42){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    const pad=30,lo=-95,hi=50;ctx.strokeStyle='#c4b5fd';ctx.lineWidth=2.5;ctx.beginPath();for(let i=0;i<=180;i++){const t=i/180*1.3,s=sample(t),x=pad+i/180*(w-pad-10),y=h-pad-(s.v-lo)/(hi-lo)*(h-pad-14);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();
    if(firing){const tx=Math.min(1,elapsed/1.3),x=pad+tx*(w-pad-10);ctx.strokeStyle='rgba(255,255,255,.7)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,14);ctx.lineTo(x,h-pad);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle='rgba(231,235,243,.68)';ctx.font='10px IBM Plex Mono, monospace';ctx.fillText('mV',7,16);ctx.fillText('time →',w-54,h-7);
  }
  function tick(now){if(!section.classList.contains('active')){raf=null;return;}draw(now);if(firing)raf=requestAnimationFrame(tick);else raf=null;}
  fire.addEventListener('click',()=>{if(+stimulus.value<12){out.state.textContent='sub-threshold';return;}firing=true;start=performance.now();if(raf===null)raf=requestAnimationFrame(tick);});
  reset.addEventListener('click',()=>{firing=false;lastTrace=[];if(raf!==null)cancelAnimationFrame(raf);raf=null;draw(performance.now());});
  stimulus.addEventListener('input',()=>draw(performance.now()));section.addEventListener('stationactive',()=>draw(performance.now()));window.addEventListener('resize',()=>draw(performance.now()));
})();

/* ============================================================
   GENETIC TECHNOLOGY — GEL ELECTROPHORESIS
   ============================================================ */
(function gelElectrophoresisModule(){
  const section=document.getElementById('station-genetics'),canvas=document.getElementById('gel-canvas');
  if(!canvas) return;
  const voltage=document.getElementById('gel-voltage'),density=document.getElementById('gel-density'),load=document.getElementById('gel-load'),run=document.getElementById('gel-run'),reset=document.getElementById('gel-reset');
  const out={voltage:document.getElementById('gel-voltage-val'),density:document.getElementById('gel-density-val'),field:document.getElementById('gel-field'),time:document.getElementById('gel-time'),small:document.getElementById('gel-small'),large:document.getElementById('gel-large')};
  const fragments=[{bp:100,size:.94,c:'#facc15'},{bp:300,size:.70,c:'#f472b6'},{bp:700,size:.49,c:'#60a5fa'},{bp:1400,size:.32,c:'#a78bfa'},{bp:3000,size:.18,c:'#34d399'}];
  let loaded=false,running=false,seconds=0,last=performance.now(),raf=null;
  function migration(f){return Math.min(.94,seconds*(+voltage.value/100)*(1.15-(+density.value-.5)*.32)*f.size*.022);}
  function draw(){
    if(!section.classList.contains('active')) return;
    const V=+voltage.value,D=+density.value,{ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);const x0=52,x1=w-28,y0=42,y1=h-38,gw=x1-x0,gh=y1-y0;
    out.voltage.textContent=V+' V';out.density.textContent=D.toFixed(1)+'%';out.field.textContent=(V/10).toFixed(1)+' V cm⁻¹';out.time.textContent=seconds.toFixed(1)+' s';out.small.textContent=Math.round(migration(fragments[0])*80)+' mm';out.large.textContent=Math.round(migration(fragments[4])*80)+' mm';
    ctx.fillStyle='rgba(96,165,250,.10)';ctx.fillRect(x0,y0,gw,gh);ctx.strokeStyle='rgba(96,165,250,.6)';ctx.lineWidth=2;ctx.strokeRect(x0,y0,gw,gh);
    ctx.fillStyle='rgba(231,235,243,.7)';ctx.font='11px IBM Plex Mono, monospace';ctx.fillText('− cathode / wells',x0,y0-15);ctx.fillText('+ anode',x1-60,y0-15);ctx.fillText('electric field →',w*.44,h-12);
    for(let lane=0;lane<3;lane++){const y=y0+gh*.25+lane*gh*.25;ctx.fillStyle='rgba(10,15,26,.9)';ctx.fillRect(x0+5,y-13,12,26);if(loaded){fragments.forEach((f,i)=>{const x=x0+16+migration(f)*gw;ctx.fillStyle=f.c;ctx.globalAlpha=.6+.4*Math.sin(i+seconds*4)*.15;ctx.fillRect(x-3,y-4,9,8);ctx.globalAlpha=1;});}}
    if(!loaded){ctx.fillStyle='rgba(231,235,243,.45)';ctx.fillText('load DNA samples into the wells',x0+30,y0+gh/2);}
  }
  function tick(now){if(!section.classList.contains('active')){raf=null;return;}const dt=Math.min(.08,(now-last)/1000);last=now;if(running)seconds=Math.min(45,seconds+dt*4);if(seconds>=45){running=false;run.textContent='Run gel';}draw();if(running)raf=requestAnimationFrame(tick);else raf=null;}
  load.addEventListener('click',()=>{loaded=true;seconds=0;running=false;run.textContent='Run gel';draw();});
  run.addEventListener('click',()=>{if(!loaded)loaded=true;running=!running;run.textContent=running?'Pause gel':'Run gel';last=performance.now();if(running&&raf===null)raf=requestAnimationFrame(tick);draw();});
  reset.addEventListener('click',()=>{loaded=false;running=false;seconds=0;run.textContent='Run gel';if(raf!==null)cancelAnimationFrame(raf);raf=null;draw();});
  [voltage,density].forEach(el=>el.addEventListener('input',draw));section.addEventListener('stationactive',()=>{last=performance.now();draw();if(running&&raf===null)raf=requestAnimationFrame(tick);});window.addEventListener('resize',draw);
})();

/* ============================================================
   CONTROL & COORDINATION EXTENSION — AI VIRTUAL DISSECTION
   ============================================================ */
(function aiDissectionModule(){
  const section=document.getElementById('station-ai-nerve'),canvas=document.getElementById('ai-nerve-canvas');
  if(!canvas) return;
  const input=document.getElementById('ai-nerve-input'),simulateBtn=document.getElementById('ai-nerve-simulate'),replayBtn=document.getElementById('ai-nerve-replay');
  const statusEl=document.getElementById('ai-nerve-status'),badgeEl=document.getElementById('ai-nerve-badge'),summaryEl=document.getElementById('ai-nerve-summary'),factEl=document.getElementById('ai-nerve-fact');
  const evoNoteEl=document.getElementById('ai-nerve-evo-note');
  const legendEl=document.getElementById('ai-nerve-legend');
  const chips=section.querySelectorAll('.animal-chip');
  const out={system:document.getElementById('ai-nerve-system'),diameter:document.getElementById('ai-nerve-diameter'),myelin:document.getElementById('ai-nerve-myelin'),velocity:document.getElementById('ai-nerve-velocity'),resting:document.getElementById('ai-nerve-resting'),peak:document.getElementById('ai-nerve-peak')};

  const PLANS=['vertebrate','insect_dorsal','annelid_tube','cephalopod','cnidarian_bell','generic_bilaterian'];

  const PRESETS={
    'Human motor neurone':{system:'Centralised CNS \u2192 myelinated efferent',body_plan:'vertebrate',diameter_um:15,myelinated:true,velocity_m_s:100,resting_mV:-70,peak_mV:40,
      structures:[
        {name:'Brain',description:'Integrates sensory input and initiates voluntary movement.',x:0.10,y:0.20},
        {name:'Spinal cord',description:'Relays signals between brain and body; runs local reflex arcs.',x:0.38,y:0.32},
        {name:'Spinal nerve',description:"Carries the motor neurone's myelinated axon out to a limb.",x:0.65,y:0.55},
        {name:'Neuromuscular junction',description:'Synapse where the motor axon triggers muscle contraction.',x:0.86,y:0.72}
      ],
      summary:"Large, heavily myelinated motor axons carry the signal from spinal motor neurones to skeletal muscle. Saltatory conduction lets the impulse jump node to node, reaching around 100 m/s.",
      fact:"At that speed, a reflex signal from your spinal cord can reach a leg muscle in well under 20 milliseconds.",
      evolutionary_note:"Vertebrate motor neurones sit at the end of roughly 500 million years of increasing centralisation \u2014 from a diffuse net, through simple ganglia, to a brain and spinal cord that plans a movement before a single muscle fibre fires."},
    'Human C-fibre (pain)':{system:'Centralised CNS \u2192 unmyelinated afferent',body_plan:'vertebrate',diameter_um:1,myelinated:false,velocity_m_s:1,resting_mV:-70,peak_mV:30,
      structures:[
        {name:'Skin nociceptor',description:'Free nerve ending that detects tissue damage or heat.',x:0.80,y:0.75},
        {name:'C-fibre axon',description:'Thin, unmyelinated fibre carrying slow, dull pain signals.',x:0.58,y:0.60},
        {name:'Dorsal root ganglion',description:'Cell bodies of sensory neurones, just outside the cord.',x:0.35,y:0.38},
        {name:'Spinal cord',description:'Pain signal enters here and may trigger a reflex, or ascend to the brain.',x:0.28,y:0.30}
      ],
      summary:"Thin, unmyelinated C-fibres carry dull, aching pain and temperature signals. Without myelin the impulse regenerates along the whole membrane instead of jumping between nodes, so conduction is roughly a hundred times slower than a motor neurone in the very same body.",
      fact:"That is why a stubbed toe often produces a sharp fast pain first, carried by faster myelinated fibres, followed a moment later by a duller throbbing ache from the C-fibres.",
      evolutionary_note:"Unmyelinated pain fibres are evolutionarily ancient wiring \u2014 myelin is a relatively late vertebrate innovation, and slow-conducting C-fibres are a living reminder of what all axons were like before it evolved."},
    'Squid giant axon':{system:'Invertebrate ganglia \u2014 giant axon',body_plan:'cephalopod',diameter_um:500,myelinated:false,velocity_m_s:25,resting_mV:-65,peak_mV:40,
      structures:[
        {name:'Brain (fused ganglia)',description:'A ring of fused ganglia around the oesophagus.',x:0.14,y:0.32},
        {name:'Stellate ganglion',description:'Relay point where the giant axon originates.',x:0.52,y:0.55},
        {name:'Giant axon',description:'Up to 1 mm wide; triggers the mantle for a fast escape jet.',x:0.72,y:0.55},
        {name:'Mantle muscle',description:'Contracts rapidly to expel water and jet the squid away.',x:0.90,y:0.58}
      ],
      summary:"The squid escape-jet circuit runs through one of the widest axons in nature, up to 1\u2009mm across. With no myelin available, the axon itself is simply enormous, which lowers internal resistance and speeds conduction.",
      fact:"This axon was wide enough for Hodgkin and Huxley to thread a wire electrode straight down its centre \u2014 the trick behind their whole 1952 model.",
      evolutionary_note:"Giant axons are a case of convergent evolution: cephalopods and annelids independently arrived at the same fix for a slow, unmyelinated axon \u2014 just make it wider \u2014 without sharing a common ancestor that had one."},
    'Earthworm giant fibre':{system:'Ganglionated nerve cord (annelid)',body_plan:'annelid_tube',diameter_um:60,myelinated:false,velocity_m_s:20,resting_mV:-60,peak_mV:35,
      structures:[
        {name:'Cerebral ganglion',description:"A simple 'brain' of fused ganglia above the pharynx.",x:0.06,y:0.35},
        {name:'Circum-pharyngeal connective',description:'Nerve ring linking the cerebral ganglion to the cord.',x:0.14,y:0.55},
        {name:'Ventral nerve cord',description:'Runs the body length with a ganglion in every segment.',x:0.5,y:0.72},
        {name:'Median giant fibre',description:'Wide fibre inside the cord for a fast whole-body escape reflex.',x:0.5,y:0.62},
        {name:'Segmental ganglion',description:"Local ganglion controlling that segment's muscles.",x:0.82,y:0.72}
      ],
      summary:"Earthworms escape a probing beak using median and lateral giant fibres running the length of the nerve cord. A partial glial wrapping, short of true myelin, plus a wide diameter pushes conduction velocity into a range similar to some myelinated vertebrate axons.",
      fact:"That lets the whole worm contract away from a stimulus in a fraction of a second \u2014 no brain required, just a chain of giant-fibre synapses.",
      evolutionary_note:"Annelids evolved fast giant fibres on an entirely separate branch of the animal family tree from the squid, yet arrived at a strikingly similar engineering solution: width instead of insulation."},
    'Locust giant fibre':{system:'Ganglionated nerve cord (insect)',body_plan:'insect_dorsal',diameter_um:30,myelinated:false,velocity_m_s:7,resting_mV:-60,peak_mV:30,
      structures:[
        {name:'Brain',description:'Fused ganglia above the oesophagus process sensory input.',x:0.08,y:0.35},
        {name:'Subesophageal ganglion',description:'Controls mouthparts; links brain to the nerve cord.',x:0.18,y:0.55},
        {name:'Giant interneuron',description:'Wide, fast fibre that triggers the jump escape response.',x:0.45,y:0.5},
        {name:'Thoracic ganglia',description:'Control the legs and wings; site of jump-reflex synapses.',x:0.45,y:0.62},
        {name:'Ventral nerve cord',description:'Chain of ganglia running the length of the abdomen.',x:0.75,y:0.6}
      ],
      summary:"Insects run a ventral nerve cord of segmental ganglia rather than myelinated tracts. Giant interneurons, wider than ordinary insect axons, give a useful speed boost to fast escape responses such as a locust's jump reflex.",
      fact:"Because insects never evolved myelin, every gain in conduction velocity in their nervous system has to come from a wider axon instead.",
      evolutionary_note:"Insects, like all arthropods, evolved their nervous system from the same protostome ganglionated-cord ancestor as annelids \u2014 segmented ganglia are an ancient, shared inheritance, later fine-tuned by insects for speed."},
    'Jellyfish nerve net':{system:'Diffuse nerve net (no brain or ganglia)',body_plan:'cnidarian_bell',diameter_um:5,myelinated:false,velocity_m_s:.3,resting_mV:-60,peak_mV:20,
      structures:[
        {name:'Nerve net (bell)',description:'Diffuse web of interconnected neurons; no central brain.',x:0.5,y:0.25},
        {name:'Rhopalium',description:'Cluster of light- and gravity-sensors around the bell margin.',x:0.85,y:0.4},
        {name:'Nerve net (tentacle base)',description:'Impulses spread outward to trigger stinging cells.',x:0.25,y:0.65}
      ],
      summary:"Cnidarians such as jellyfish have no brain or ganglia at all, just a diffuse net of interconnected neurons through the body wall. Impulses can spread in several directions at once, but conduction is slow and often weakens with distance.",
      fact:"Some jellyfish also carry a separate fast-conducting giant-axon system reserved purely for a rapid escape swim \u2014 two different gears in the same animal.",
      evolutionary_note:"Cnidarians split off from the rest of the animal kingdom before bilateral symmetry evolved, so their nerve net isn't a 'primitive' brain \u2014 it's a different, still-successful solution that predates the very idea of a head."},
    'Frog sciatic nerve':{system:'Centralised CNS \u2192 myelinated efferent',body_plan:'vertebrate',diameter_um:12,myelinated:true,velocity_m_s:35,resting_mV:-70,peak_mV:35,
      structures:[
        {name:'Brain',description:"Small relative to the spinal cord's role in fast reflexes.",x:0.09,y:0.2},
        {name:'Spinal cord',description:'Coordinates the leg-extension reflex without the brain.',x:0.35,y:0.32},
        {name:'Sciatic nerve',description:'Thick myelinated nerve to the hind leg; the classic teaching prep.',x:0.68,y:0.55},
        {name:'Gastrocnemius muscle',description:'Twitches when the sciatic nerve is stimulated in class.',x:0.88,y:0.68}
      ],
      summary:"The frog sciatic nerve, still a standard teaching preparation in physiology labs, contains many myelinated fibres. Its accessibility made it one of the first nerves used to demonstrate a compound action potential.",
      fact:"Galvani's 18th-century experiments twitching frog legs with static electricity were an early, unwitting glimpse of exactly this kind of nerve conduction.",
      evolutionary_note:"As an early-branching vertebrate lineage, amphibians retain the same basic centralised, myelinated body plan mammals inherited later \u2014 evidence this design was already in place before vertebrates ever left the water."},
    'Giraffe laryngeal nerve':{system:'Centralised CNS \u2192 myelinated efferent',body_plan:'vertebrate',diameter_um:14,myelinated:true,velocity_m_s:70,resting_mV:-70,peak_mV:40,
      structures:[
        {name:'Brain',description:'Sends the signal controlling the larynx during vocalisation.',x:0.09,y:0.18},
        {name:'Larynx',description:'Final target \u2014 close to the brain as the crow flies.',x:0.16,y:0.3},
        {name:'Vagus nerve (neck)',description:'Runs down the neck alongside the trachea.',x:0.32,y:0.35},
        {name:'Recurrent laryngeal loop',description:'Loops around a chest artery, then travels all the way back up.',x:0.55,y:0.6}
      ],
      summary:"This is a fast, ordinary myelinated axon, just like any other large mammal's \u2014 the problem is its route. Instead of a short path to the larynx, the recurrent laryngeal nerve loops all the way down the neck, round a chest artery, and back up.",
      fact:"In an adult giraffe that detour adds several metres to the nerve's path, often cited as a textbook example of evolution reworking an existing body plan rather than designing an optimal one.",
      evolutionary_note:"The nerve's detour is a fossil of history rather than a design flaw: it evolved in fish, where the shortest route ran past that artery, and every descendant \u2014 however long its neck later got \u2014 was stuck extending the same nerve rather than rerouting it."}
  };

  function classify(name){
    const s=name.toLowerCase();
    const has=(...w)=>w.some(x=>s.includes(x));
    if(has('jelly','hydra','coral','anemone','cnidaria')) return Object.assign({},PRESETS['Jellyfish nerve net'],{system:'Diffuse nerve net (offline estimate)'});
    if(has('squid','octopus','cuttlefish','nautilus')) return Object.assign({},PRESETS['Squid giant axon'],{system:'Cephalopod ganglia \u2014 giant axon (offline estimate)'});
    if(has('worm','annelid','leech')) return Object.assign({},PRESETS['Earthworm giant fibre'],{system:'Ganglionated nerve cord, annelid (offline estimate)'});
    if(has('insect','locust','fly','cockroach','ant','bee','beetle','moth','butterfly','wasp')) return Object.assign({},PRESETS['Locust giant fibre'],{system:'Ganglionated nerve cord, insect (offline estimate)'});
    if(has('frog','toad','newt','salamander','amphibian')) return Object.assign({},PRESETS['Frog sciatic nerve'],{system:'Centralised CNS, amphibian (offline estimate)'});
    if(has('fish','shark','ray','salmon','trout','eel')) return {system:'Centralised CNS, fish (offline estimate)',body_plan:'vertebrate',diameter_um:8,myelinated:true,velocity_m_s:30,resting_mV:-70,peak_mV:35,
      structures:[
        {name:'Brain',description:'Coordinates swimming, vision, and the lateral line sense.',x:0.09,y:0.2},
        {name:'Spinal cord',description:'Drives the rhythmic muscle contractions used to swim.',x:0.4,y:0.32},
        {name:'Mauthner cell axon',description:'Wide, fast, unmyelinated fibre in many fish for a startle flick.',x:0.6,y:0.5},
        {name:'Lateral line nerve',description:'Carries pressure-wave information along the body surface.',x:0.75,y:0.55}
      ],
      summary:"Most fish have myelinated axons broadly similar to other vertebrates, though many also carry a wide unmyelinated Mauthner-cell axon dedicated to a millisecond-fast escape flick.",
      fact:"This is a generic offline estimate for a fish rather than a species-specific one.",
      evolutionary_note:"Fish are the earliest-diverging vertebrate lineage with a true brain and spinal cord \u2014 the same centralised body plan later inherited, and elaborated on, by amphibians, reptiles, birds and mammals."};
    if(has('bird','eagle','sparrow','hawk','crow','pigeon','chicken','owl','duck','parrot')) return {system:'Centralised CNS, bird (offline estimate)',body_plan:'vertebrate',diameter_um:10,myelinated:true,velocity_m_s:60,resting_mV:-70,peak_mV:40,
      structures:[
        {name:'Brain',description:'Relatively large for body size; supports rapid flight control.',x:0.09,y:0.18},
        {name:'Spinal cord',description:'Relays signals between brain and flight muscles.',x:0.38,y:0.3},
        {name:'Wing nerve',description:'Myelinated nerve controlling the primary flight feathers.',x:0.62,y:0.42},
        {name:'Leg nerve',description:'Controls perching and the leg-tendon locking mechanism.',x:0.7,y:0.68}
      ],
      summary:"Birds share the standard vertebrate design: myelinated axons giving fast saltatory conduction, supporting the rapid sensorimotor control that flight demands.",
      fact:"This is a generic offline estimate for a bird rather than a species-specific one.",
      evolutionary_note:"Birds evolved from a reptilian lineage and independently evolved unusually high encephalisation for their body size \u2014 convergent with mammals rather than inherited from a shared big-brained ancestor."};
    return {system:'Centralised CNS, vertebrate (generic estimate)',body_plan:'generic_bilaterian',diameter_um:12,myelinated:true,velocity_m_s:60,resting_mV:-70,peak_mV:40,
      structures:[
        {name:'Brain / anterior ganglion',description:'Generic estimate \u2014 no offline entry matches this animal closely.',x:0.15,y:0.3},
        {name:'Main nerve cord',description:'Generic estimate of the main signal pathway through the body.',x:0.55,y:0.55},
        {name:'Peripheral nerve',description:'Generic estimate of a nerve reaching toward the body surface.',x:0.85,y:0.7}
      ],
      summary:"No offline reference entry matches this animal closely, so this is a generic estimate rather than a species-specific one. Try again with a live connection for an AI dissection tailored to this exact animal.",
      fact:"",
      evolutionary_note:""};
  }

  function clampNum(v,lo,hi,fallback){ v=Number(v); if(!Number.isFinite(v)) return fallback; return Math.min(hi,Math.max(lo,v)); }
  function clampStructures(arr){
    if(!Array.isArray(arr)) return [];
    return arr.slice(0,7).map(s=>({
      name:String((s&&s.name)||'Structure').slice(0,40),
      description:String((s&&s.description)||'').slice(0,140),
      x:clampNum(s&&s.x,0.05,0.95,0.5),
      y:clampNum(s&&s.y,0.05,0.95,0.5)
    })).filter(s=>s.name);
  }
  function clampParams(p){
    return {
      system:String(p.system||'Unknown').slice(0,80),
      body_plan:PLANS.includes(p.body_plan)?p.body_plan:'generic_bilaterian',
      diameter_um:clampNum(p.diameter_um,0.1,1200,10),
      myelinated:!!p.myelinated,
      velocity_m_s:clampNum(p.velocity_m_s,0.02,150,10),
      resting_mV:clampNum(p.resting_mV,-95,-40,-70),
      peak_mV:clampNum(p.peak_mV,-10,60,35),
      structures:clampStructures(p.structures),
      summary:String(p.summary||'').slice(0,600),
      fact:String(p.fact||'').slice(0,300),
      evolutionary_note:String(p.evolutionary_note||'').slice(0,300)
    };
  }

  async function callAI(animalName){
    const prompt='Give a biophysically realistic, AS-level-biology-appropriate "virtual dissection" of the nervous system of: "'+animalName+'", with an evolutionary perspective. '+
      'Base every number and structure on real published biology for this species or its closest well-studied relative, and keep it scientifically defensible. '+
      'Choose exactly one body_plan from this fixed list, whichever fits best: vertebrate, insect_dorsal, annelid_tube, cephalopod, cnidarian_bell, generic_bilaterian. '+
      'List 4 to 6 major nervous-system structures a labelled dissection diagram would show, each with a short name, a one-sentence description, and an (x,y) position in a normalised diagram frame where x=0 is the front/head end and x=1 is the rear end, y=0 is the top edge of the diagram and y=1 is the bottom edge (keep both between 0.1 and 0.9). '+
      'Also give one sentence of genuine evolutionary context for this animal\u2019s nervous system \u2014 where its body plan sits relative to other animal lineages, any convergent or shared evolutionary origin worth knowing, or what it reveals about the history of nervous systems. '+
      'Respond with ONLY strict JSON, no markdown fences, no commentary, matching exactly this schema: '+
      '{"system_type": string, "body_plan": string, "axon_diameter_um": number, "myelinated": boolean, "conduction_velocity_m_s": number, "resting_potential_mV": number, "peak_potential_mV": number, '+
      '"structures": [{"name": string, "description": string, "x": number, "y": number}], '+
      '"summary": string (2-3 plain-English sentences for an AS-level biology student), "fun_fact": string (one sentence), "evolutionary_note": string (one sentence)}';
    const response=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1200,messages:[{role:'user',content:prompt}]})
    });
    if(!response.ok) throw new Error('API status '+response.status);
    const data=await response.json();
    const text=(data.content||[]).map(b=>b.text||'').join('');
    const clean=text.replace(/```json|```/g,'').trim();
    const parsed=JSON.parse(clean);
    return clampParams({system:parsed.system_type,body_plan:parsed.body_plan,diameter_um:parsed.axon_diameter_um,myelinated:parsed.myelinated,
      velocity_m_s:parsed.conduction_velocity_m_s,resting_mV:parsed.resting_potential_mV,peak_mV:parsed.peak_potential_mV,
      structures:parsed.structures,summary:parsed.summary,fact:parsed.fun_fact,evolutionary_note:parsed.evolutionary_note});
  }

  function fallbackFor(name){
    const trimmed=name.trim();
    if(PRESETS[trimmed]) return clampParams(PRESETS[trimmed]);
    return clampParams(classify(trimmed));
  }

  let current=null, dissecting=false, start=0, raf=null;

  function fmtDiameter(d){ return d>=1000 ? (d/1000).toFixed(2)+' mm' : Math.round(d)+' \u00b5m'; }
  function fmtVelocity(v){ return (v<1 ? v.toFixed(2) : v>=10 ? Math.round(v) : v.toFixed(1))+' m/s'; }

  function populateLegend(structures){
    legendEl.innerHTML='';
    structures.forEach(s=>{
      const li=document.createElement('li');
      const strong=document.createElement('strong');
      strong.textContent=s.name;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(' \u2014 '+s.description));
      legendEl.appendChild(li);
    });
  }

  function highlightEvo(plan){
    section.querySelectorAll('.evo-group').forEach(g=>{
      g.classList.toggle('active', g.dataset.plan===plan);
    });
  }

  function applyResult(name,params,source){
    current=Object.assign({name:name},params);
    out.system.textContent=params.system;
    out.diameter.textContent=fmtDiameter(params.diameter_um);
    out.myelin.textContent=params.myelinated?'yes':'no';
    out.velocity.textContent=fmtVelocity(params.velocity_m_s);
    out.resting.textContent=Math.round(params.resting_mV)+' mV';
    out.peak.textContent='+'+Math.round(params.peak_mV)+' mV';
    summaryEl.textContent=params.summary||('An estimated nervous-system profile for '+name+'.');
    factEl.textContent=params.fact?('\u2726 '+params.fact):'';
    evoNoteEl.textContent=params.evolutionary_note?('\u2192 '+params.evolutionary_note):'';
    badgeEl.textContent=source==='live'?'live AI estimate':'offline reference';
    badgeEl.className='ai-nerve-badge '+(source==='live'?'live':'offline');
    populateLegend(params.structures);
    highlightEvo(params.body_plan);
    dissecting=true; start=performance.now();
    if(raf===null) raf=requestAnimationFrame(tick);
  }

  async function simulate(){
    const name=(input.value||'').trim()||'Human motor neurone';
    simulateBtn.disabled=true;
    statusEl.textContent='Asking the AI model to dissect '+name+'\u2026';
    statusEl.className='ai-nerve-status is-loading';
    try{
      const params=await callAI(name);
      applyResult(name,params,'live');
      statusEl.textContent='Live AI dissection received.';
      statusEl.className='ai-nerve-status';
    }catch(err){
      const params=fallbackFor(name);
      applyResult(name,params,'offline');
      statusEl.textContent='AI model unreachable here \u2014 showing a built-in offline dissection instead.';
      statusEl.className='ai-nerve-status is-error';
    }finally{
      simulateBtn.disabled=false;
    }
  }

  simulateBtn.addEventListener('click',simulate);
  replayBtn.addEventListener('click',()=>{
    if(!current) return;
    dissecting=true; start=performance.now();
    if(raf===null) raf=requestAnimationFrame(tick);
  });
  chips.forEach(chip=>chip.addEventListener('click',()=>{
    chips.forEach(c=>c.setAttribute('aria-pressed','false'));
    chip.setAttribute('aria-pressed','true');
    input.value=chip.dataset.animal;
    simulate();
  }));
  input.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); simulate(); } });
  input.addEventListener('input',()=>chips.forEach(c=>c.setAttribute('aria-pressed', c.dataset.animal===input.value ? 'true':'false')));

  /* ---- body-plan silhouettes ---- */
  function smoothClosed(ctx,pts){
    if(pts.length<3) return;
    ctx.beginPath();
    const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
    let m=mid(pts[pts.length-1],pts[0]);
    ctx.moveTo(m[0],m[1]);
    for(let i=0;i<pts.length;i++){
      const next=pts[(i+1)%pts.length];
      const nm=mid(pts[i],next);
      ctx.quadraticCurveTo(pts[i][0],pts[i][1],nm[0],nm[1]);
    }
    ctx.closePath();
  }

  function drawVertebrate(ctx,x0,y0,w,h){
    const pts=[[0.06,0.45],[0.10,0.22],[0.20,0.13],[0.32,0.16],[0.48,0.12],[0.68,0.16],[0.87,0.24],
      [0.97,0.45],[0.90,0.66],[0.74,0.80],[0.54,0.86],[0.34,0.86],[0.17,0.79],[0.08,0.65]]
      .map(([fx,fy])=>[x0+fx*w,y0+fy*h]);
    ctx.fillStyle='rgba(196,181,253,.07)'; ctx.strokeStyle='rgba(196,181,253,.5)'; ctx.lineWidth=1.4;
    smoothClosed(ctx,pts); ctx.fill(); ctx.stroke();
  }
  function drawInsectDorsal(ctx,x0,y0,w,h){
    ctx.fillStyle='rgba(196,181,253,.07)'; ctx.strokeStyle='rgba(196,181,253,.5)'; ctx.lineWidth=1.4;
    const cy=y0+0.5*h;
    ctx.beginPath(); ctx.ellipse(x0+0.11*w,cy,0.08*w,0.16*h,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x0+0.32*w,cy,0.13*w,0.20*h,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x0+0.68*w,cy,0.27*w,0.24*h,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgba(196,181,253,.4)'; ctx.lineWidth=1;
    [-1,0,1].forEach(k=>{
      ctx.beginPath(); ctx.moveTo(x0+0.30*w,cy+k*0.14*h); ctx.lineTo(x0+0.20*w,cy+k*0.30*h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0+0.36*w,cy+k*0.14*h); ctx.lineTo(x0+0.46*w,cy+k*0.32*h); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(x0+0.05*w,cy-0.05*h); ctx.lineTo(x0-0.02*w,cy-0.16*h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0+0.05*w,cy+0.05*h); ctx.lineTo(x0-0.02*w,cy+0.16*h); ctx.stroke();
  }
  function drawAnnelidTube(ctx,x0,y0,w,h){
    const pts=[[0.04,0.5],[0.08,0.30],[0.18,0.24],[0.5,0.22],[0.82,0.24],[0.93,0.30],[0.97,0.5],
      [0.93,0.70],[0.82,0.76],[0.5,0.78],[0.18,0.76],[0.08,0.70]]
      .map(([fx,fy])=>[x0+fx*w,y0+fy*h]);
    ctx.fillStyle='rgba(196,181,253,.07)'; ctx.strokeStyle='rgba(196,181,253,.5)'; ctx.lineWidth=1.4;
    smoothClosed(ctx,pts); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgba(196,181,253,.28)'; ctx.lineWidth=1;
    for(let i=1;i<14;i++){
      const fx=0.08+i*0.065; if(fx>0.92) break;
      const x=x0+fx*w;
      ctx.beginPath(); ctx.moveTo(x,y0+0.26*h); ctx.lineTo(x,y0+0.74*h); ctx.stroke();
    }
  }
  function drawCephalopod(ctx,x0,y0,w,h){
    ctx.fillStyle='rgba(196,181,253,.07)'; ctx.strokeStyle='rgba(196,181,253,.5)'; ctx.lineWidth=1.4;
    const pts=[[0.30,0.5],[0.34,0.28],[0.5,0.16],[0.72,0.16],[0.90,0.28],[0.97,0.5],[0.90,0.72],[0.72,0.84],[0.5,0.84],[0.34,0.72]]
      .map(([fx,fy])=>[x0+fx*w,y0+fy*h]);
    smoothClosed(ctx,pts); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x0+0.20*w,y0+0.5*h,0.09*w,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgba(196,181,253,.4)'; ctx.lineWidth=1.2;
    for(let i=-2;i<=2;i++){
      ctx.beginPath(); ctx.moveTo(x0+0.13*w,y0+0.5*h+i*0.05*h);
      ctx.quadraticCurveTo(x0+0.0*w,y0+0.5*h+i*0.16*h, x0-0.06*w, y0+0.5*h+i*0.22*h);
      ctx.stroke();
    }
  }
  function drawCnidarianBell(ctx,x0,y0,w,h){
    ctx.fillStyle='rgba(196,181,253,.07)'; ctx.strokeStyle='rgba(196,181,253,.5)'; ctx.lineWidth=1.4;
    const cx=x0+0.5*w, ty=y0+0.14*h, bw=0.42*w, bh=0.34*h;
    ctx.beginPath(); ctx.ellipse(cx,ty+bh*0.5,bw,bh,0,Math.PI,0,false);
    ctx.lineTo(cx+bw,ty+bh*0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgba(196,181,253,.4)'; ctx.lineWidth=1.1;
    for(let i=-3;i<=3;i++){
      const bx=cx+i*bw/3.4, top=ty+bh*0.45;
      ctx.beginPath(); ctx.moveTo(bx,top);
      ctx.quadraticCurveTo(bx+6*Math.sin(i),top+0.32*h,bx-4*Math.sin(i),top+0.5*h);
      ctx.stroke();
    }
  }
  function drawGeneric(ctx,x0,y0,w,h){
    ctx.fillStyle='rgba(196,181,253,.07)'; ctx.strokeStyle='rgba(196,181,253,.5)'; ctx.lineWidth=1.4;
    const pts=[[0.08,0.5],[0.14,0.28],[0.28,0.18],[0.5,0.15],[0.72,0.18],[0.90,0.30],[0.96,0.5],[0.90,0.70],[0.72,0.82],[0.5,0.85],[0.28,0.82],[0.14,0.72]]
      .map(([fx,fy])=>[x0+fx*w,y0+fy*h]);
    smoothClosed(ctx,pts); ctx.fill(); ctx.stroke();
  }
  const DRAWERS={vertebrate:drawVertebrate,insect_dorsal:drawInsectDorsal,annelid_tube:drawAnnelidTube,cephalopod:drawCephalopod,cnidarian_bell:drawCnidarianBell,generic_bilaterian:drawGeneric};

  function toXY(x0,y0,w,h,fx,fy){ return [x0+0.04*w+fx*0.92*w, y0+0.10*h+fy*0.80*h]; }

  function draw(now){
    if(!section.classList.contains('active')) return;
    const {ctx,w,h}=fitCanvas(canvas);
    ctx.clearRect(0,0,w,h);

    const params=current||{body_plan:'vertebrate',structures:[]};
    const plan=params.body_plan||'vertebrate';
    const pad=18, x0=pad, y0=10, dw=w-pad*2, dh=h-20;

    const revealT=1.5;
    const elapsed=current?(now-start)/1000:0;
    if(dissecting && elapsed>revealT+0.15) dissecting=false;
    const reveal = current ? Math.min(1, elapsed/revealT) : 0;
    const sweepX = x0 + reveal*dw;

    (DRAWERS[plan]||drawGeneric)(ctx,x0,y0,dw,dh);

    if(current){
      ctx.save();
      ctx.beginPath(); ctx.rect(x0,y0,Math.max(0,sweepX-x0),dh); ctx.clip();
      ctx.fillStyle='rgba(196,181,253,.05)'; ctx.fillRect(x0,y0,dw,dh);
      const pts=params.structures.map(s=>toXY(x0,y0,dw,dh,s.x,s.y));
      ctx.strokeStyle='rgba(196,181,253,.35)'; ctx.lineWidth=1.2;
      for(let i=0;i<pts.length-1;i++){ ctx.beginPath(); ctx.moveTo(pts[i][0],pts[i][1]); ctx.lineTo(pts[i+1][0],pts[i+1][1]); ctx.stroke(); }
      pts.forEach((pt,i)=>{
        ctx.fillStyle='#c4b5fd'; ctx.beginPath(); ctx.arc(pt[0],pt[1],9,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#0a0f1a'; ctx.font='600 10px IBM Plex Mono, monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(String(i+1),pt[0],pt[1]+0.5);
      });
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      ctx.restore();

      if(reveal<1){
        const grad=ctx.createLinearGradient(sweepX-10,0,sweepX+3,0);
        grad.addColorStop(0,'rgba(255,255,255,0)'); grad.addColorStop(1,'rgba(255,255,255,.95)');
        ctx.strokeStyle=grad; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.moveTo(sweepX,y0-2); ctx.lineTo(sweepX,y0+dh+2); ctx.stroke();
      }
    } else {
      ctx.fillStyle='rgba(231,235,243,.42)'; ctx.font='11px IBM Plex Mono, monospace';
      ctx.fillText('press "Begin dissection" to reveal the nervous system', x0+8, y0+dh-14);
    }
  }
  function tick(now){
    if(!section.classList.contains('active')){ raf=null; return; }
    draw(now);
    if(dissecting) raf=requestAnimationFrame(tick); else raf=null;
  }
  section.addEventListener('stationactive',()=>{ draw(performance.now()); if(dissecting&&raf===null) raf=requestAnimationFrame(tick); });
  window.addEventListener('resize',()=>draw(performance.now()));
  draw(performance.now());
})();

})();



(function(){
  const body = document.body;
  const home = document.getElementById('home-page');
  const homeExplore = document.getElementById('home-explore');
  const homeConcept = document.getElementById('home-concept');
  const homeCards = document.querySelectorAll('[data-home-target]');
  const moduleTabs = document.querySelectorAll('.station-tab');
  const goHome = document.getElementById('go-home');

  function activateHome(){
    body.classList.add('home-active');
    if(home) home.style.display = 'block';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function activateModule(id){
    body.classList.remove('home-active');
    if(home) home.style.display = 'none';
    const tab = document.querySelector('.station-tab[data-target="'+id+'"]');
    if(tab){ tab.click(); }
    else {
      const section = document.getElementById(id);
      if(section){
        document.querySelectorAll('.station').forEach(s=>s.classList.remove('active'));
        section.classList.add('active');
      }
    }
    setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),80);
  }

  homeCards.forEach(card=>{
    card.addEventListener('click', e=>{
      const target = card.getAttribute('data-home-target');
      if(target) activateModule(target);
    });
  });

  if(homeExplore) homeExplore.addEventListener('click', ()=>{
    const first = document.querySelector('.station-tab[data-target="station-protein"]');
    if(first) activateModule('station-protein');
  });
  if(homeConcept) homeConcept.addEventListener('click', ()=>activateModule('station-learning'));
  if(goHome) goHome.addEventListener('click', activateHome);

  // ---------- off-canvas module bar: hidden until the toggle button is pressed ----------
  const navToggle = document.getElementById('nav-toggle');
  const navScrim = document.getElementById('nav-scrim');
  const navLabel = document.getElementById('nav-toggle-label');

  function openNav(){
    body.classList.add('nav-open');
    if(navToggle) navToggle.setAttribute('aria-expanded','true');
    if(navToggle) navToggle.setAttribute('aria-label','Close module navigation');
    if(navLabel) navLabel.textContent = 'Close';
  }
  function closeNav(){
    body.classList.remove('nav-open');
    if(navToggle) navToggle.setAttribute('aria-expanded','false');
    if(navToggle) navToggle.setAttribute('aria-label','Open module navigation');
    if(navLabel) navLabel.textContent = 'Modules';
  }
  if(navToggle) navToggle.addEventListener('click', ()=>{
    if(body.classList.contains('nav-open')) closeNav(); else openNav();
  });
  if(navScrim) navScrim.addEventListener('click', closeNav);
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && body.classList.contains('nav-open')) closeNav();
  });

  // Direct tab clicks must first leave the home page, otherwise its hidden-main state
  // would keep the selected module invisible. Picking a module from the open bar also
  // closes the bar again, so it never shows unless the toggle is pressed.
  moduleTabs.forEach(tab=>{
    tab.addEventListener('click', ()=>{
      body.classList.remove('home-active');
      if(home) home.style.display = 'none';
      closeNav();
    });
  });

  // Keep the notebook title as a simple home shortcut.
  document.querySelectorAll('header a, .brand, .site-brand').forEach(el=>{
    el.addEventListener('click', e=>{ e.preventDefault(); activateHome(); closeNav(); });
  });

  // Start on the home page.
  activateHome();
})();
