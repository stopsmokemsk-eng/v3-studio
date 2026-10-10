/* Partners and a self-contained, single-player cell game. No external libraries. */
(() => {
  'use strict';
  let closeCurrent = null;
  function createScreen(title, type) {
    if (closeCurrent) closeCurrent();
    const page = document.createElement('section');
    page.id = 'studioExtras';
    page.className = 'studio-extra ' + type;
    page.setAttribute('aria-label', title);
    page.innerHTML = '<header class="extra-header"><button type="button" class="extra-exit">← ВЫХОД</button><span class="extra-title"></span></header>';
    page.querySelector('.extra-title').textContent = title;
    document.body.appendChild(page);
    let cleanup = () => {};
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      cleanup();
      page.remove();
      closeCurrent = null;
      const source = document.querySelector('.studio-sidebar button[data-view="' + (type === 'cell-game' ? 'game' : 'partners') + '"]');
      if (source) source.focus();
    };
    page.querySelector('.extra-exit').onclick = close;
    page.querySelector('.extra-exit').focus();
    closeCurrent = close;
    return { page, close, onCleanup(fn) { cleanup = fn; } };
  }

  window.openStudioPartners = () => {
    const screen = createScreen('ПАРТНЕРЫ', 'partners-screen');
    const field = document.createElement('div');
    field.className = 'partners-window';
    const names = [
      'MULTI CUBE', 'Kristina Vodoley', 'Alisa Vostorg', 'MISHEL VERMISHEL',
      'STOP SMOKE', 'NEW WAWE MUSIC', 'BIONIC', 'ALL HOOKAH STARS'
    ];
    const wheel = document.createElement('div'); wheel.className = 'partners-wheel';
    for (let group = 0; group < 3; group++) names.forEach(name => {
      const row = document.createElement('div'); row.className = 'partner-wheel-row';
      if (group !== 1) row.setAttribute('aria-hidden','true');
      const label = document.createElement('span'); label.textContent = name; row.appendChild(label); wheel.appendChild(row);
    });
    field.appendChild(wheel);
    screen.page.appendChild(field);
    const footer = document.createElement('div');
    footer.className = 'partners-footer';
    footer.textContent = 'V³ STUDIO / ВМЕСТЕ СОЗДАЁМ БОЛЬШЕ';
    screen.page.appendChild(footer);
    const rows = [...wheel.children];
    let rowHeight = 100, cycle = 800, padding = 0, scheduled = 0;
    function paint() {
      scheduled = 0;
      if (!screen.page.isConnected) return;
      let top = wheel.scrollTop;
      if (top < cycle * .5) { wheel.scrollTop = top + cycle; top += cycle; }
      else if (top > cycle * 1.5) { wheel.scrollTop = top - cycle; top -= cycle; }
      const center = wheel.clientHeight / 2;
      rows.forEach((row,i) => {
        const distance = Math.abs(padding + i * rowHeight + rowHeight / 2 - top - center);
        const focus = Math.max(0,1 - distance / (rowHeight * 2));
        row.firstChild.style.transform = 'scale(' + (.78 + focus * .5) + ')';
        row.firstChild.style.opacity = String(.16 + focus * .84);
      });
    }
    function resize() {
      rowHeight = Math.max(80,Math.min(130,wheel.clientHeight * .19));
      cycle = rowHeight * names.length; padding = Math.max(0,wheel.clientHeight / 2 - rowHeight / 2);
      wheel.style.setProperty('--partner-row-height',rowHeight + 'px');
      wheel.style.paddingTop = wheel.style.paddingBottom = padding + 'px';
      wheel.scrollTop = cycle;
      paint();
    }
    wheel.onscroll = () => { if (!scheduled) scheduled = requestAnimationFrame(paint); };
    const observer = new ResizeObserver(resize); observer.observe(wheel);
    resize();
    screen.onCleanup(() => { observer.disconnect(); cancelAnimationFrame(scheduled); });
  };

  window.openStudioGame = () => {
    const screen = createScreen('V³ / CELL', 'cell-game');
    const header = screen.page.querySelector('.extra-header');
    header.classList.add('cell-header');
    const pauseButton = document.createElement('button');
    pauseButton.type = 'button';
    pauseButton.className = 'cell-pause';
    pauseButton.textContent = 'ПАУЗА';
    pauseButton.disabled = true;
    header.appendChild(pauseButton);
    const field = document.createElement('div');
    field.className = 'cell-field';
    field.innerHTML = `
      <canvas class="cell-canvas" aria-label="Игровое поле. Стрелки или WASD, мышь или сенсорный джойстик."></canvas>
      <div class="cell-hud"><span>МАССА</span><strong>0</strong><span class="cell-score">СОБРАНО / 0</span></div>
      <div class="cell-leaders"><span>ЛИДЕРЫ / ЛОКАЛЬНАЯ АРЕНА</span><div></div></div>
      <div class="cell-menu"><div class="cell-menu-card">
        <span class="cell-menu-kicker">V³ STUDIO / PLAYGROUND</span>
        <h1>Живи. Расти.</h1>
        <p class="cell-menu-description">Собирай свет. Поглощай меньших.<br>Не попадайся крупным.</p>
        <p class="cell-control-hint">Мышь / WASD / стрелки · ПРОБЕЛ: ускорение<br>На телефоне: веди пальцем, как джойстиком.<br>Бусты на арене дают ускорение. Игра с ботами.</p>
        <button type="button" class="cell-start">ИГРАТЬ</button>
      </div></div>
      <button type="button" class="cell-boost" disabled>УСКОРЕНИЕ</button>
      <div class="cell-bottom"><span>СОБИРАЙ / РАСТИ / НЕ ПОПАДИСЬ</span><span class="cell-debug">60 FPS</span></div>`;
    screen.page.appendChild(field);
    const canvas = field.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { screen.close(); return; }
    const menu = field.querySelector('.cell-menu');
    const menuTitle = menu.querySelector('h1');
    const menuDescription = menu.querySelector('.cell-menu-description');
    const startButton = menu.querySelector('.cell-start');
    const massLabel = field.querySelector('.cell-hud strong');
    const scoreLabel = field.querySelector('.cell-score');
    const leaderboard = field.querySelector('.cell-leaders div');
    const debugLabel = field.querySelector('.cell-debug');
    const boostButton = field.querySelector('.cell-boost');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const WORLD = 1600, STEP = 1 / 60;
    let width = 1, height = 1, dpr = 1, zoom = 1;
    let phase = 'menu', alive = true, time = 0, score = 0;
    let food = [], bots = [], flashes = [], player, camera, boosts = [], absorption = [];
    let boostUntil = 0, boostReady = 0, sessionLogin = '', resultSaved = false;
    let raf = 0, lastTime = performance.now(), accumulator = 0, lastHud = 0;
    let fpsFrames = 0, fpsTime = lastTime, seed = 1313;
    const keys = new Set();
    const pointer = { x:0, y:0, active:false, touch:false, id:null, ax:0, ay:0 };
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const radius = cell => Math.sqrt(cell.mass);
    function pellet() { return { x:30 + random() * (WORLD - 60), y:30 + random() * (WORLD - 60), r:1.5 + random() * 1.8, phase:random() * 6.28 }; }
    function makeBot(i) {
      const names = ['NIKE','APPLE','TESLA','ADIDAS','SAMSUNG','PUMA','SONY','BMW','GOOGLE','PORSCHE'];
      let x, y;
      do { x = 60 + random() * (WORLD - 120); y = 60 + random() * (WORLD - 120); }
      while (Math.hypot(x - player.x, y - player.y) < 260);
      const r = 15 + random() * 32;
      return { name:names[i], x, y, mass:r * r, tx:x, ty:y, turn:0 };
    }
    function reset() {
      seed = 1313;
      score = 0; time = 0; flashes = []; absorption = []; keys.clear();
      boostUntil = 0; boostReady = 0; resultSaved = false;
      sessionLogin = window.V3StudioData?.getUser()?.login || '';
      player = { name:'V³', x:WORLD / 2, y:WORLD / 2, mass:24 * 24, shield:3 };
      camera = { x:player.x, y:player.y };
      food = Array.from({ length:560 }, pellet);
      // A small starting trail makes the growth mechanic immediately discoverable.
      for (let i = 0; i < 12; i++) food[i] = { x:player.x + 32 + i * 15, y:player.y + Math.sin(i) * 5, r:2.4, phase:i };
      bots = Array.from({ length:10 }, (_, i) => makeBot(i));
      // One nearby small rival lets a new player discover cell consumption.
      Object.assign(bots[8], { x:player.x - 150, y:player.y + 60, mass:14 * 14 });
      boosts = Array.from({length:7},() => ({ x:60 + random() * (WORLD-120),y:60 + random() * (WORLD-120),ready:0 }));
      boosts[0].x = player.x + 110; boosts[0].y = player.y + 90;
      pointer.active = false;
      updateHud(true);
    }
    function saveResult(reason) {
      if (resultSaved || !sessionLogin || time < .1 || !window.V3Content) return;
      try {
        window.V3Content.saveScore(sessionLogin,{ score,mass:Math.floor(player.mass),seconds:Math.floor(time),reason });
        resultSaved = true;
      } catch(e) {
        scoreLabel.textContent = 'Результат не сохранён: проверьте хранилище';
      }
    }
    function activateBoost(pickup = false) {
      if (phase !== 'playing' || (!pickup && time < boostReady)) return;
      boostUntil = time + 2.3; boostReady = time + 6;
      flashes.push({ x:player.x,y:player.y,age:0 });
      updateHud(true);
    }
    function resize() {
      const r = field.getBoundingClientRect();
      width = Math.max(1, r.width); height = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      zoom = clamp(1.1 - radius(player) / 240, .55, 1);
      render();
    }
    function moveCell(cell, dx, dy, dt, multiplier = 1) {
      const len = Math.hypot(dx, dy);
      if (len < .01) return;
      const r = radius(cell);
      const speed = 170 / (1 + r / 60) * multiplier;
      cell.x = clamp(cell.x + dx / len * speed * dt, r, WORLD - r);
      cell.y = clamp(cell.y + dy / len * speed * dt, r, WORLD - r);
    }
    function eatFood(cell, isPlayer) {
      const r = radius(cell);
      for (let i = 0; i < food.length; i++) {
        const f = food[i];
        if (Math.abs(f.x - cell.x) > r + 4 || Math.abs(f.y - cell.y) > r + 4) continue;
        if (distance(cell, f) > r + f.r) continue;
        cell.mass += 9;
        if (isPlayer) {
          score++;
          if (flashes.length < 24) flashes.push({ x:f.x, y:f.y, age:0 });
        }
        food[i] = pellet();
      }
    }
    function update(dt) {
      if (phase !== 'playing') return;
      time += dt;
      player.shield = Math.max(0, player.shield - dt);
      let dx = 0, dy = 0;
      if (keys.has('ArrowLeft') || keys.has('a')) dx--;
      if (keys.has('ArrowRight') || keys.has('d')) dx++;
      if (keys.has('ArrowUp') || keys.has('w')) dy--;
      if (keys.has('ArrowDown') || keys.has('s')) dy++;
      if (!dx && !dy && pointer.active) {
        if (pointer.touch) { dx = pointer.x - pointer.ax; dy = pointer.y - pointer.ay; }
        else { dx = pointer.x - width / 2; dy = pointer.y - height / 2; }
        if (Math.hypot(dx, dy) < 12) dx = dy = 0;
      }
      const boosted = time < boostUntil;
      moveCell(player, dx, dy, dt,boosted ? 2.25 : 1);
      boosts.forEach(boost => {
        if (time >= boost.ready && distance(boost,player) < radius(player) + 9) {
          activateBoost(true); boost.ready = time + 10;
          boost.x = 60 + random() * (WORLD-120); boost.y = 60 + random() * (WORLD-120);
        }
      });
      eatFood(player, true);
      for (let i = 0; i < bots.length; i++) {
        const b = bots[i], br = radius(b), pr = radius(player);
        b.turn -= dt;
        const near = distance(b, player) < 380;
        if (near && br > pr * 1.16 && !player.shield) { b.tx = player.x; b.ty = player.y; }
        else if (near && pr > br * 1.16) { b.tx = clamp(b.x + (b.x - player.x) * 2, 0, WORLD); b.ty = clamp(b.y + (b.y - player.y) * 2, 0, WORLD); }
        else if (b.turn <= 0 || Math.hypot(b.tx - b.x, b.ty - b.y) < 20) {
          let target = food[0], best = Infinity;
          for (let j = 0; j < 25; j++) {
            const f = food[(random() * food.length) | 0], d = distance(b, f);
            if (d < best) { best = d; target = f; }
          }
          b.tx = target.x; b.ty = target.y; b.turn = .8 + random() * 1.5;
        }
        moveCell(b, b.tx - b.x, b.ty - b.y, dt, .8);
        eatFood(b, false);
        const gap = distance(b, player);
        if (pr > br * 1.16 && gap < pr - br * .38) {
          for (let n = 0; n < 10; n++) {
            const a = n * Math.PI / 5;
            absorption.push({ x:b.x + Math.cos(a)*br,y:b.y + Math.sin(a)*br,age:0 });
          }
          player.mass += b.mass * .68; score += 20;
          flashes.push({ x:b.x, y:b.y, age:0 });
          bots[i] = makeBot(i);
        } else if (!player.shield && br > pr * 1.16 && gap < br - pr * .38) {
          phase = 'over';
          saveResult('over');
          keys.clear(); pointer.active = false;
          menuTitle.textContent = 'Ещё один круг?';
          menuDescription.textContent = 'Твоя масса: ' + Math.floor(player.mass) + '. Собрано: ' + score + '.' + (resultSaved ? ' Результат сохранён в твоём аккаунте на этом устройстве.' : '');
          startButton.textContent = 'СНОВА';
          menu.hidden = false; pauseButton.disabled = true;
          break;
        }
      }
      const blend = 1 - Math.exp(-dt * 9);
      camera.x += (player.x - camera.x) * blend;
      camera.y += (player.y - camera.y) * blend;
      zoom += (clamp(1.1 - radius(player) / 240, .55, 1) - zoom) * blend;
      flashes.forEach(f => f.age += dt);
      flashes = flashes.filter(f => f.age < .55);
      absorption.forEach(p => { p.age += dt; const pull = 1-Math.exp(-dt*7); p.x += (player.x-p.x)*pull; p.y += (player.y-p.y)*pull; });
      absorption = absorption.filter(p=>p.age<.6);
      updateHud();
    }
    function updateHud(force = false) {
      if (!force && time - lastHud < .15) return;
      lastHud = time;
      massLabel.textContent = String(Math.floor(player.mass));
      scoreLabel.textContent = 'СОБРАНО / ' + score;
      const cooldown = Math.max(0,Math.ceil(boostReady-time));
      boostButton.disabled = phase !== 'playing' || cooldown > 0;
      boostButton.textContent = time < boostUntil ? 'БУСТ АКТИВЕН' : cooldown ? 'БУСТ / ' + cooldown + ' c' : 'УСКОРЕНИЕ';
      boostButton.classList.toggle('is-active',time < boostUntil);
      leaderboard.innerHTML = [player, ...bots].sort((a,b) => b.mass - a.mass).slice(0,5).map(b =>
        '<p class="' + (b === player ? 'is-player' : '') + '"><span>' + b.name + '</span><span>' + Math.floor(b.mass) + '</span></p>').join('');
    }
    function drawCell(cell, mine) {
      const r = radius(cell);
      const pulse = reducedMotion ? 0 : Math.sin(time * (mine && time < boostUntil ? 8 : 2.8) + cell.mass / 100) * (mine && time < boostUntil ? .065 : .035);
      ctx.save();
      ctx.translate(cell.x, cell.y);
      const glow = ctx.createRadialGradient(0,0,r * .5,0,0,r * 1.7);
      glow.addColorStop(0, mine ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.035)');
      glow.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0,0,r * 1.7,0,Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0,0,r * (1 + pulse),0,Math.PI * 2);
      ctx.fillStyle = mine ? '#f3f3f1' : '#171717'; ctx.fill();
      ctx.strokeStyle = mine ? '#fff' : radius(cell) > radius(player) * 1.16 ? '#858585' : '#bcbcbc';
      ctx.lineWidth = mine ? 1.5 : .8; ctx.stroke();
      if (mine) {
        ctx.beginPath(); ctx.arc(0,0,r * (1.13 + pulse),0,Math.PI * 2);
        ctx.strokeStyle = player.shield ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.18)'; ctx.lineWidth = .7; ctx.stroke();
      }
      ctx.fillStyle = mine ? '#0c0c0c' : '#bcbcbc';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = (mine ? Math.max(12, r * .5) : Math.max(8, r * .24)) + 'px "IBM Plex Mono",monospace';
      ctx.fillText(cell.name,0,0,r*1.7);
      ctx.restore();
    }
    function render() {
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle = '#090909'; ctx.fillRect(0,0,width,height);
      ctx.save();
      ctx.translate(width / 2,height / 2); ctx.scale(zoom,zoom); ctx.translate(-camera.x,-camera.y);
      const left = camera.x - width / (2 * zoom), top = camera.y - height / (2 * zoom);
      ctx.strokeStyle = '#161616'; ctx.lineWidth = .5;
      ctx.beginPath();
      for (let x = Math.floor(left / 64) * 64; x < left + width / zoom; x += 64) { ctx.moveTo(x,top); ctx.lineTo(x,top + height / zoom); }
      for (let y = Math.floor(top / 64) * 64; y < top + height / zoom; y += 64) { ctx.moveTo(left,y); ctx.lineTo(left + width / zoom,y); }
      ctx.stroke();
      ctx.strokeStyle = '#656565'; ctx.strokeRect(0,0,WORLD,WORLD);
      for (const f of food) {
        if (f.x < left - 5 || f.x > left + width / zoom + 5 || f.y < top - 5 || f.y > top + height / zoom + 5) continue;
        const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 2 + f.phase) * .18;
        ctx.fillStyle = 'rgba(240,240,236,.65)';
        ctx.beginPath(); ctx.arc(f.x,f.y,f.r * pulse,0,Math.PI * 2); ctx.fill();
      }
      boosts.forEach(boost => {
        if (time < boost.ready) return;
        const pulse = reducedMotion ? 1 : 1 + Math.sin(time*4)*.12;
        ctx.save(); ctx.translate(boost.x,boost.y); ctx.scale(pulse,pulse);
        ctx.strokeStyle = '#f3f3f1'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#f3f3f1'; ctx.beginPath(); ctx.moveTo(1,-6);ctx.lineTo(-4,1);ctx.lineTo(0,1);ctx.lineTo(-1,6);ctx.lineTo(4,-1);ctx.lineTo(0,-1);ctx.closePath();ctx.fill();
        ctx.restore();
      });
      [...bots, player].sort((a,b) => a.mass - b.mass).forEach(b => drawCell(b,b === player));
      for (const f of flashes) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (1 - f.age / .55) * .4 + ')';
        ctx.beginPath(); ctx.arc(f.x,f.y,5 + f.age * 35,0,Math.PI * 2); ctx.stroke();
      }
      absorption.forEach(p => {
        ctx.fillStyle = 'rgba(255,255,255,'+(1-p.age/.6)+')';
        ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill();
      });
      ctx.restore();
      if (pointer.touch && pointer.active && phase === 'playing') {
        const dx = pointer.x - pointer.ax, dy = pointer.y - pointer.ay, len = Math.max(1,Math.hypot(dx,dy));
        ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(pointer.ax,pointer.ay,32,0,Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        ctx.beginPath(); ctx.arc(pointer.ax + dx / len * Math.min(25,len),pointer.ay + dy / len * Math.min(25,len),9,0,Math.PI * 2); ctx.fill();
      }
    }
    function loop(now) {
      if (!alive || !screen.page.isConnected) return;
      raf = requestAnimationFrame(loop);
      const delta = Math.min(.1,(now - lastTime) / 1000); lastTime = now;
      if (document.hidden) return;
      accumulator += delta;
      while (accumulator >= STEP) { update(STEP); accumulator -= STEP; }
      if (phase === 'menu') time += delta;
      render();
      fpsFrames++;
      if (now - fpsTime >= 1000) {
        debugLabel.textContent = Math.round(fpsFrames * 1000 / (now - fpsTime)) + ' FPS';
        fpsFrames = 0; fpsTime = now;
      }
    }
    function togglePause() {
      if (phase !== 'playing' && phase !== 'paused') return;
      phase = phase === 'playing' ? 'paused' : 'playing';
      keys.clear(); pointer.active = false;
      pauseButton.textContent = phase === 'paused' ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА';
      menu.hidden = phase !== 'paused';
      if (phase === 'paused') {
        menuTitle.textContent = 'Пауза.';
        menuDescription.textContent = 'Арена подождёт. Продолжи, когда будешь готов.';
        startButton.textContent = 'ПРОДОЛЖИТЬ';
      }
    }
    startButton.onclick = () => {
      if (phase === 'paused') { togglePause(); return; }
      reset(); phase = 'playing'; menu.hidden = true; pauseButton.disabled = false; pauseButton.textContent = 'ПАУЗА';
    };
    pauseButton.onclick = togglePause;
    boostButton.onclick = () => activateBoost();
    function keydown(e) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'Escape') { e.preventDefault(); screen.close(); return; }
      if (key === 'p') { e.preventDefault(); if (!e.repeat) togglePause(); return; }
      if (key === ' ') { e.preventDefault(); if (!e.repeat) activateBoost(); return; }
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d'].includes(key)) { e.preventDefault(); keys.add(key); }
    }
    const keyup = e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const blur = () => { keys.clear(); pointer.active = false; if (phase === 'playing') togglePause(); };
    window.addEventListener('keydown',keydown);
    window.addEventListener('keyup',keyup);
    window.addEventListener('blur',blur);
    const point = e => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; };
    canvas.addEventListener('pointerdown',e => {
      if (phase !== 'playing') return;
      point(e); pointer.active = true; pointer.touch = e.pointerType !== 'mouse'; pointer.id = e.pointerId;
      pointer.ax = pointer.x; pointer.ay = pointer.y; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e => {
      if (phase !== 'playing') return;
      if (e.pointerType === 'mouse') { point(e); pointer.active = true; pointer.touch = false; }
      else if (pointer.active && e.pointerId === pointer.id) point(e);
    });
    const pointerEnd = e => { if (e.pointerId === pointer.id && pointer.touch) pointer.active = false; };
    canvas.addEventListener('pointerup',pointerEnd);
    canvas.addEventListener('pointercancel',pointerEnd);
    canvas.addEventListener('lostpointercapture',pointerEnd);
    canvas.addEventListener('pointerleave',e => { if (e.pointerType === 'mouse') pointer.active = false; });
    reset(); resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(field);
    const previousText = window.render_game_to_text, previousAdvance = window.advanceTime;
    window.render_game_to_text = () => JSON.stringify({
      mode:phase, coordinates:'world origin top-left; x right, y down', world:{ width:WORLD,height:WORLD },
      player:{ x:+player.x.toFixed(1),y:+player.y.toFixed(1),r:+radius(player).toFixed(1),mass:Math.floor(player.mass),shield:+player.shield.toFixed(2) },
      camera:{ x:+camera.x.toFixed(1),y:+camera.y.toFixed(1),zoom:+zoom.toFixed(2) }, score,
      boost:{active:time<boostUntil,readyIn:Math.max(0,+(boostReady-time).toFixed(1))},login:sessionLogin || null,
      boostItems:boosts.filter(b=>time>=b.ready).map(b=>({x:+b.x.toFixed(1),y:+b.y.toFixed(1)})),
      bots:bots.map(b=>({ name:b.name,x:+b.x.toFixed(1),y:+b.y.toFixed(1),r:+radius(b).toFixed(1) })),
      nearbyFood:food.filter(f=>distance(f,player)<300).slice(0,20).map(f=>({ x:+f.x.toFixed(1),y:+f.y.toFixed(1) })),
      controls:'mouse follows pointer; touch drag joystick; arrows/WASD move; Space boost; P pause; Escape exit'
    });
    window.advanceTime = ms => {
      const steps = Math.max(1,Math.ceil(Math.max(0,ms) / (STEP * 1000)));
      for (let i = 0; i < steps; i++) update(STEP);
      updateHud(true); render();
    };
    screen.onCleanup(() => {
      if (phase === 'playing' || phase === 'paused') saveResult('exit');
      alive = false; cancelAnimationFrame(raf); resizeObserver.disconnect();
      window.removeEventListener('keydown',keydown); window.removeEventListener('keyup',keyup); window.removeEventListener('blur',blur);
      if (previousText === undefined) delete window.render_game_to_text; else window.render_game_to_text = previousText;
      if (previousAdvance === undefined) delete window.advanceTime; else window.advanceTime = previousAdvance;
    });
    raf = requestAnimationFrame(loop);
  };
})();
