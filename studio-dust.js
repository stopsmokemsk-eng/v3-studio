/* Original particle wordmark and pointer vortex. No borrowed site code. */
(() => {
  'use strict';
  const logoURL = new URL('logo.png',document.currentScript.src).href;
  let logoPromise, closeCurrent;
  function loadLogo() {
    if (!logoPromise) logoPromise = new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = logoURL;
    });
    return logoPromise;
  }

  window.openStudioDust = () => {
    if (closeCurrent) closeCurrent();
    const previousFocus = document.activeElement;
    const root = document.createElement('section');
    root.id = 'studioDustScreen';
    root.className = 'studio-dust-screen';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','V³ STUDIO. Звёздная пыль и чёрная дыра.');
    root.innerHTML = '<canvas class="studio-dust-canvas" role="img" aria-label="Логотип V³ и слово STUDIO собираются из частиц. Проведите мышью или пальцем, чтобы создать чёрную дыру."></canvas><header class="studio-dust-header"><button type="button">← НАЗАД</button><span>V³ / ЗВЁЗДНАЯ ПЫЛЬ</span></header><footer class="studio-dust-footer"><span>ПРОВЕДИТЕ МЫШЬЮ ИЛИ ПАЛЬЦЕМ</span><span>ПРОСТРАНСТВО РЕАГИРУЕТ НА ВАС</span></footer>';
    document.body.appendChild(root);
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const back = root.querySelector('button');
    const events = new AbortController();
    const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
    let alive = true, raf = 0, width = 1, height = 1, dpr = 1;
    let logo = null, ready = false, started = performance.now(), last = started, elapsed = 0;
    let particles = [], stars = [];
    let seed = 1986;
    const pointer = { active:false,x:0,y:0,tx:0,ty:0,strength:0,touch:false,id:null };
    const random = () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
    const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
    let observer;

    function close() {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      events.abort();
      root.remove();
      closeCurrent = null;
      if (previousFocus?.isConnected) previousFocus.focus();
    }
    closeCurrent = close;
    back.onclick = close;
    back.focus();
    if (!ctx) { root.querySelector('canvas').remove(); return; }

    function buildWordmark() {
      const small = width < 600;
      const mark = Math.min(small ? width*.235 : width*.2,260,height*.34);
      const fontSize = mark * .53;
      const spacing = fontSize * .1;
      const mask = document.createElement('canvas');
      const m = mask.getContext('2d',{willReadFrequently:true});
      m.font = '500 '+fontSize+'px "Helvetica Neue",Arial,sans-serif';
      const text = 'STUDIO';
      const wordWidth = m.measureText(text).width + spacing*(text.length-1);
      const gap = mark*.22;
      mask.width = Math.ceil(mark + gap + wordWidth + 8);
      mask.height = Math.ceil(mark + 8);
      m.fillStyle = '#fff'; m.fillRect(0,0,mask.width,mask.height);
      if (logo) {
        // Preserve the real mark; the existing small STUDIO in the image is replaced by the larger word.
        m.drawImage(logo,0,50,312,304,4,4,mark,mark);
      } else {
        m.fillStyle='#000';m.font='500 '+mark*.68+'px Arial,sans-serif';
        m.textBaseline='middle';m.fillText('V³',4,mask.height/2,mark);
      }
      m.fillStyle='#000'; m.font='500 '+fontSize+'px "Helvetica Neue",Arial,sans-serif'; m.textBaseline='middle';
      let x=mark+gap+4;
      for (const letter of text) { m.fillText(letter,x,mask.height/2); x+=m.measureText(letter).width+spacing; }
      let pixels;
      try { pixels=m.getImageData(0,0,mask.width,mask.height).data; }
      catch(e) {
        // A non-CORS preview must still show a wordmark instead of a blank scene.
        logo=null; buildWordmark(); return;
      }
      const targets=[], step=small ? 1.45 : 2.15;
      const ox=(width-mask.width)/2,oy=(height-mask.height)/2;
      for (let y=1;y<mask.height;y+=step) for(let x=1;x<mask.width;x+=step) {
        const i=(Math.floor(y)*mask.width+Math.floor(x))*4;
        if (pixels[i] > 160 || pixels[i+3] < 100) continue;
        targets.push({x:ox+x+(random()-.5)*step*.6,y:oy+y+(random()-.5)*step*.6});
      }
      const max=small ? 3000 : 7600;
      const stride=Math.max(1,Math.ceil(targets.length/max));
      particles=targets.filter((_,i)=>i%stride===0).map(target => {
        const angle=random()*Math.PI*2;
        const spread=Math.max(width,height)*(.25+random()*.5);
        const x=width/2+Math.cos(angle)*spread,y=height/2+Math.sin(angle)*spread;
        return { tx:target.x,ty:target.y,x,y,sx:x,sy:y,
          vx:0,vy:0,delay:random()*.65,phase:random()*6.28,group:Math.floor(random()*3),size:(small ? .8 : 1)+random()*.6 };
      });
      started=performance.now(); elapsed=0;
      if (reduced) particles.forEach(p=>{p.x=p.tx;p.y=p.ty;});
      root.dataset.particles=String(particles.length);
    }
    function resize() {
      width=Math.max(1,root.clientWidth);height=Math.max(1,root.clientHeight);
      dpr=Math.min(devicePixelRatio || 1,1.75);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      stars=Array.from({length:width<600?120:280},()=>({x:random()*width,y:random()*height,r:.25+random()*.65,phase:random()*6.28}));
      if (ready) buildWordmark();
    }
    function blackHole() {
      if (pointer.strength < .02) return;
      ctx.save(); ctx.translate(pointer.x,pointer.y);
      const strength=pointer.strength;
      const glow=ctx.createRadialGradient(0,0,10,0,0,65);
      glow.addColorStop(0,'rgba(0,0,0,0)');
      glow.addColorStop(.35,'rgba(220,235,245,'+(.07*strength)+')');
      glow.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,65,0,Math.PI*2);ctx.fill();
      ctx.rotate(reduced ? -.3 : elapsed*.15);
      ctx.strokeStyle='rgba(220,230,240,'+(.28*strength)+')';ctx.lineWidth=.7;
      ctx.beginPath();ctx.ellipse(0,0,30,12,0,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='rgba(0,0,0,'+strength+')';ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(240,245,250,'+(.3*strength)+')';
      ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
    function tick(now) {
      if (!alive || !root.isConnected) { close(); return; }
      raf=requestAnimationFrame(tick);
      const dt=clamp((now-last)/16.667,.1,2);last=now;
      if (document.hidden) { started += dt*16.667; return; }
      elapsed=(now-started)/1000;
      const blend=1-Math.pow(.8,dt);
      pointer.x+=(pointer.tx-pointer.x)*blend;pointer.y+=(pointer.ty-pointer.y)*blend;
      pointer.strength+=((pointer.active?1:0)-pointer.strength)*blend;
      const radius=Math.min(190,width*.38);
      ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
      ctx.fillStyle='rgba(225,230,235,.48)';
      ctx.beginPath();
      for(const s of stars) {
        const twinkle=reduced?1:.65+.35*Math.sin(elapsed*.5+s.phase);
        ctx.rect(s.x,s.y,s.r*twinkle,s.r*twinkle);
      }
      ctx.fill();
      for(const p of particles) {
        const assembly=clamp((elapsed-p.delay)/3.2,0,1);
        if (!reduced && assembly < 1) {
          const ease=1-Math.pow(1-assembly,3);
          p.x=p.sx+(p.tx-p.sx)*ease+Math.sin(elapsed*.7+p.phase)*(1-ease)*20;
          p.y=p.sy+(p.ty-p.sy)*ease+Math.cos(elapsed*.7+p.phase)*(1-ease)*20;
          p.vx=0;p.vy=0;
        } else {
          p.vx+=(p.tx-p.x)*.038*dt;p.vy+=(p.ty-p.y)*.038*dt;
          p.vx*=Math.pow(.86,dt);p.vy*=Math.pow(.86,dt);
        }
        if(pointer.strength>.01 && (reduced || assembly>.95)) {
          const dx=p.x-pointer.x,dy=p.y-pointer.y,d=Math.max(5,Math.hypot(dx,dy));
          const force=Math.pow(Math.max(0,1-d/radius),2)*pointer.strength;
          p.vx+=(-dx/d*4.4-dy/d*3.3)*force*dt;
          p.vy+=(-dy/d*4.4+dx/d*3.3)*force*dt;
        }
        p.x+=p.vx*dt;p.y+=p.vy*dt;
      }
      const colors=['rgba(235,242,248,.72)','rgba(248,250,252,.92)','#fff'];
      ctx.shadowColor='rgba(225,238,255,.55)';
      ctx.shadowBlur=3;
      for(let group=0;group<3;group++) {
        ctx.fillStyle=colors[group];ctx.beginPath();
        for(const p of particles) if(p.group===group) {
          const size=p.size*(reduced?1:.82+.18*Math.sin(elapsed*1.2+p.phase));
          ctx.rect(p.x,p.y,size,size);
        }
        ctx.fill();
      }
      ctx.shadowBlur=0;
      blackHole();
      root.dataset.phase=elapsed>4?'assembled':'assembling';
      root.dataset.hole=pointer.strength>.2?'active':'idle';
    }
    const move = e => {
      const rect=canvas.getBoundingClientRect();
      pointer.tx=e.clientX-rect.left;pointer.ty=e.clientY-rect.top;
      if (e.pointerType==='mouse' || pointer.id===e.pointerId) pointer.active=true;
    };
    canvas.addEventListener('pointermove',move,{signal:events.signal});
    canvas.addEventListener('pointerdown',e=>{
      pointer.id=e.pointerId;pointer.touch=e.pointerType!=='mouse';pointer.active=true;
      move(e);pointer.x=pointer.tx;pointer.y=pointer.ty;
      canvas.setPointerCapture(e.pointerId);
    },{signal:events.signal});
    canvas.addEventListener('pointerleave',()=>{if(!pointer.touch)pointer.active=false;},{signal:events.signal});
    const release=e=>{if(e.pointerId===pointer.id){pointer.id=null;if(pointer.touch)pointer.active=false;pointer.touch=false;}};
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,release,{signal:events.signal}));
    window.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){
        e.preventDefault();
        const options=[back,document.getElementById('studioSoundToggle')].filter(Boolean);
        const index=options.indexOf(document.activeElement);
        options[(index+options.length+(e.shiftKey?-1:1))%options.length].focus();
      }
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();
        if(!pointer.active){pointer.tx=width/2;pointer.ty=height/2;}
        pointer.active=true;
        pointer.tx=clamp(pointer.tx+(e.key==='ArrowLeft'?-30:e.key==='ArrowRight'?30:0),0,width);
        pointer.ty=clamp(pointer.ty+(e.key==='ArrowUp'?-30:e.key==='ArrowDown'?30:0),0,height);
      }
      if(e.key===' '){e.preventDefault();pointer.active=false;}
    },{signal:events.signal});
    observer=new ResizeObserver(resize);observer.observe(root);resize();
    raf=requestAnimationFrame(tick);
    loadLogo().then(image=>{if(!alive)return;logo=image;ready=true;buildWordmark();});
  };
})();
