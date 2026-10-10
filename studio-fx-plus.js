/* Cinematic layer for the three "Эффект" concept sites. Works on top of the existing markup. */
(() => {
  'use strict';
  const fxo = document.getElementById('fxo');
  const site = document.getElementById('fxSite');
  if (!fxo || !site) return;
  const hero = site.querySelector('.fx-hero');
  const media = site.querySelector('.fx-media');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const finePointer = matchMedia('(pointer:fine)').matches;

  const THEMES = {
    t0: { curtain: '#0d100f', line: '#e9e3d6', marquee: ['PERFORMANCE', 'CHARACTER', 'GRAND TOUR', 'PURE FORM', 'DESIGN IN MOTION'] },
    t1: { curtain: '#efe7da', line: '#524438', marquee: ['сезонные цветы', 'ручная работа', 'живая форма', 'маленькие истории', 'с заботой'] },
    t2: { curtain: '#050a10', line: '#a6f1e5', marquee: ['OBSERVE', 'ANALYZE', 'CONNECT', 'LOW EARTH ORBIT', 'MISSION CONTROL'] }
  };

  // Static helpers inserted once
  const canvas = document.createElement('canvas'); canvas.className = 'fxp-canvas'; canvas.setAttribute('aria-hidden', 'true');
  const spot = document.createElement('div'); spot.className = 'fxp-spot'; spot.setAttribute('aria-hidden', 'true');
  const grain = document.createElement('div'); grain.className = 'fxp-grain'; grain.setAttribute('aria-hidden', 'true');
  hero.append(canvas, spot, grain);
  const progress = document.createElement('div'); progress.className = 'fxp-progress'; progress.setAttribute('aria-hidden', 'true');
  const curtain = document.createElement('div'); curtain.className = 'fxp-curtain'; curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = '<span></span>';
  fxo.append(progress, curtain);
  const marquee = document.createElement('div'); marquee.className = 'fxp-marquee'; marquee.setAttribute('aria-hidden', 'true');
  document.getElementById('fxCards').after(marquee);

  const ctx = canvas.getContext('2d');
  let raf = 0, theme = 't0', w = 1, h = 1, dpr = 1, items = [], t0 = 0, last = 0, alive = false;
  let observer = null, scrollRaf = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function size() {
    const r = hero.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    items = [];
    const small = w < 600;
    if (theme === 't0') {
      for (let i = 0; i < (small ? 26 : 46); i++) items.push(streak(true));
    } else if (theme === 't1') {
      for (let i = 0; i < (small ? 18 : 30); i++) items.push(petal(true));
    } else {
      for (let i = 0; i < (small ? 140 : 260); i++) items.push({ x: Math.random() * w, y: Math.random() * h, z: rnd(.2, 1), p: Math.random() * 6.28 });
      items.shooting = null;
    }
  }
  function streak(initial) {
    return { x: initial ? Math.random() * w * 1.4 : w + rnd(20, 300), y: h * rnd(.18, .98), len: rnd(60, 260), speed: rnd(7, 19), alpha: rnd(.08, .4), thick: rnd(.6, 2), red: Math.random() < .14 };
  }
  function petal(initial) {
    return { x: initial ? Math.random() * w : rnd(-60, w * .7), y: initial ? Math.random() * h : -30, r: rnd(5, 12), rot: Math.random() * 6.28, vr: rnd(-.02, .02), vx: rnd(.15, .55), vy: rnd(.25, .7), sway: Math.random() * 6.28, hue: Math.random() < .5 ? '255,214,226' : '250,238,222', alpha: rnd(.35, .8) };
  }

  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (!alive || document.hidden) return;
    const dt = last ? Math.min(3, (now - last) / 16.667) : 1; last = now;
    const time = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    if (theme === 't0') {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of items) {
        s.x -= s.speed * dt;
        if (s.x + s.len < -40) Object.assign(s, streak(false));
        const g = ctx.createLinearGradient(s.x, 0, s.x + s.len, 0);
        const col = s.red ? '255,70,60' : '255,236,210';
        g.addColorStop(0, 'rgba(' + col + ',' + s.alpha + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.strokeStyle = g; ctx.lineWidth = s.thick; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.len, s.y); ctx.stroke();
      }
      // headlight bloom sweeping slowly
      const bx = w * (.55 + .25 * Math.sin(time * .35)), by = h * .62;
      const bloom = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(w, h) * .35);
      bloom.addColorStop(0, 'rgba(255,240,220,.10)'); bloom.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = bloom; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    } else if (theme === 't1') {
      for (const p of items) {
        p.sway += .02 * dt; p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.sway) * .45) * dt; p.y += p.vy * dt;
        if (p.y > h + 30 || p.x > w + 40) Object.assign(p, petal(false));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = 'rgba(' + p.hue + ',' + p.alpha + ')';
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + (p.alpha * .5) + ')';
        ctx.beginPath(); ctx.ellipse(-p.r * .25, -p.r * .12, p.r * .45, p.r * .18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else {
      const cx = w * .68, cy = h * .46;
      for (const s of items) {
        s.x -= s.z * .25 * dt; if (s.x < -2) { s.x = w + 2; s.y = Math.random() * h; }
        const a = .25 + .75 * Math.abs(Math.sin(time * (.6 + s.z) + s.p));
        ctx.fillStyle = 'rgba(220,240,255,' + (a * s.z * .9) + ')';
        const sz = s.z * 1.5;
        ctx.fillRect(s.x, s.y, sz, sz);
      }
      // orbit with satellite
      const rx = Math.min(w, h) * .42, ry = rx * .32, tilt = -.32;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
      ctx.strokeStyle = 'rgba(166,241,229,.22)'; ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const ang = time * .45;
      const sx = Math.cos(ang) * rx, sy = Math.sin(ang) * ry;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
      glow.addColorStop(0, 'rgba(166,241,229,.95)'); glow.addColorStop(1, 'rgba(166,241,229,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // occasional shooting star
      if (!items.shooting && Math.random() < .006 * dt) items.shooting = { x: rnd(w * .3, w), y: rnd(0, h * .4), life: 0 };
      const sh = items.shooting;
      if (sh) {
        sh.life += dt; sh.x -= 9 * dt; sh.y += 3.6 * dt;
        const k = Math.max(0, 1 - sh.life / 60);
        const g = ctx.createLinearGradient(sh.x, sh.y, sh.x + 90, sh.y - 36);
        g.addColorStop(0, 'rgba(255,255,255,' + k + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x + 90, sh.y - 36); ctx.stroke();
        if (k <= 0) items.shooting = null;
      }
    }
  }

  function splitTitle() {
    const title = document.getElementById('fxTitle');
    const lines = title.innerHTML.split(/<br\s*\/?>/i);
    title.innerHTML = lines.map((line, i) => '<span class="fxp-line"><span class="fxp-in" style="--d:' + i + '">' + line + '</span></span>').join('');
  }
  function scramble(el) {
    const text = el.textContent; if (!text || reduced) return;
    const glyphs = 'ABCDEFGHJKLMNOPQRSTUVWXYZ0123456789/·';
    let frame = 0; const total = 26;
    clearInterval(el._fxpTimer);
    el._fxpTimer = setInterval(() => {
      frame++;
      const done = Math.floor(text.length * frame / total);
      el.textContent = text.split('').map((c, i) => i < done || c === ' ' ? c : glyphs[(Math.random() * glyphs.length) | 0]).join('');
      if (frame >= total) { clearInterval(el._fxpTimer); el.textContent = text; }
    }, 28);
  }
  function countUp(el) {
    const m = el.textContent.match(/^(\d+)(\D*)$/); if (!m || reduced) return;
    const target = +m[1], pad = m[1].length, suffix = m[2];
    if (target < 2) return;
    const start = performance.now(), dur = 1300;
    const step = now => {
      const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(target * e)).padStart(pad, '0') + suffix;
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function setupReveal() {
    if (observer) observer.disconnect();
    const targets = [...site.querySelectorAll('.fx-card, .fx-offer-eye, .fx-offer h2, .fx-offer > p, .fx-offer-grid article, .fx-philosophy, .fxp-marquee')];
    targets.forEach((el, i) => { el.classList.add('fxp-reveal'); el.classList.remove('fxp-shown'); el.style.setProperty('--rd', (i % 3) * .12 + 's'); });
    if (reduced || !('IntersectionObserver' in window)) { targets.forEach(el => el.classList.add('fxp-shown')); return; }
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('fxp-shown');
      if (entry.target.classList.contains('fx-card')) { const b = entry.target.querySelector('b'); if (b) countUp(b); }
      observer.unobserve(entry.target);
    }), { root: site, threshold: .18 });
    targets.forEach(el => observer.observe(el));
  }
  function setMarquee(cls) {
    const words = (THEMES[cls] || THEMES.t0).marquee;
    const row = words.map(w => '<span>' + w + '</span><i>✦</i>').join('');
    marquee.innerHTML = '<div class="fxp-marquee-track">' + row + row + row + '</div>';
  }
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const top = site.scrollTop, max = Math.max(1, site.scrollHeight - site.clientHeight);
      progress.style.transform = 'scaleX(' + Math.min(1, top / max).toFixed(4) + ')';
      if (!reduced && media) {
        const k = theme === 't1' ? .12 : .35;
        media.style.setProperty('--fxp-par', (top * k).toFixed(1) + 'px');
      }
      if (!reduced) hero.style.setProperty('--fxp-fade', Math.max(0, 1 - top / (hero.offsetHeight * .9)).toFixed(3));
    });
  }
  site.addEventListener('scroll', onScroll, { passive: true });
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    hero.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    hero.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    hero.classList.add('fxp-lit');
    if (finePointer && !reduced) {
      const cta = document.getElementById('fxCta');
      const cr = cta.getBoundingClientRect();
      const dx = e.clientX - (cr.left + cr.width / 2), dy = e.clientY - (cr.top + cr.height / 2);
      const d = Math.hypot(dx, dy);
      cta.style.translate = d < 160 ? (dx * .18).toFixed(1) + 'px ' + (dy * .25).toFixed(1) + 'px' : '0 0';
      const copy = site.querySelector('.fx-copy');
      copy.style.setProperty('--tx', ((x - .5) * -10).toFixed(1) + 'px');
      copy.style.setProperty('--ty', ((y - .5) * -8).toFixed(1) + 'px');
    }
  });
  hero.addEventListener('pointerleave', () => { hero.classList.remove('fxp-lit'); const cta = document.getElementById('fxCta'); if (cta) cta.style.translate = '0 0'; });
  window.addEventListener('resize', () => { if (alive) { size(); seed(); } });

  function enter(t) {
    theme = t.cls;
    fxo.dataset.fxpTheme = theme;
    splitTitle();
    scramble(document.getElementById('fxEye'));
    setMarquee(theme);
    hero.classList.remove('fxp-enter'); void hero.offsetWidth; hero.classList.add('fxp-enter');
    progress.style.transform = 'scaleX(0)';
    if (media) media.style.setProperty('--fxp-par', '0px');
    hero.style.setProperty('--fxp-fade', '1');
    alive = true; t0 = performance.now(); last = 0;
    requestAnimationFrame(() => { size(); seed(); setupReveal(); });
    if (!raf && !reduced) raf = requestAnimationFrame(draw);
  }
  function leave() {
    alive = false; cancelAnimationFrame(raf); raf = 0;
    if (observer) observer.disconnect();
    ctx.clearRect(0, 0, w, h);
  }
  function wipe(nextCls) {
    if (reduced) return;
    const th = THEMES[nextCls] || THEMES.t0;
    curtain.style.setProperty('--fxp-curtain', th.curtain);
    curtain.style.setProperty('--fxp-line', th.line);
    curtain.classList.remove('run'); void curtain.offsetWidth; curtain.classList.add('run');
  }
  window.V3FxPlus = { enter, leave, wipe };
})();
