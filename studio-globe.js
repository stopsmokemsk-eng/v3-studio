/* Isolated, dependency-free Earth renderer. No changes to the cube or effects. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  let atlasPromise;
  function loadAtlas() {
    if (atlasPromise) return atlasPromise;
    atlasPromise = new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 256;
          const ctx = canvas.getContext('2d', { willReadFrequently:true });
          ctx.drawImage(image, 0, 0, 512, 256);
          resolve({ pixels:ctx.getImageData(0, 0, 512, 256).data, width:512, height:256 });
        } catch (error) { resolve(null); }
      };
      image.onerror = () => resolve(null);
      image.src = 'designs/earth-texture.jpg';
    });
    return atlasPromise;
  }

  window.initStudioEarth = function initStudioEarth(stage) {
    if (!stage) return;
    const sphere = stage.querySelector('.studio-earth-sphere');
    const particleCanvas = stage.querySelector('.studio-earth-particles');
    const ctx = sphere.getContext('2d');
    const pctx = particleCanvas.getContext('2d');
    if (!ctx || !pctx) return;
    const size = 160;
    const radius = 73;
    sphere.width = sphere.height = size;
    const frame = ctx.createImageData(size, size);
    const surface = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x + .5 - size / 2) / radius;
        const ny = -(y + .5 - size / 2) / radius;
        const depth = 1 - nx * nx - ny * ny;
        if (depth < 0) continue;
        const nz = Math.sqrt(depth);
        const light = Math.max(0, -.35 * nx + .35 * ny + .87 * nz);
        surface.push({ i:(y * size + x) * 4, nx, ny, nz, shade:.16 + .84 * light });
      }
    }
    let atlas = null, active = true, frameId = 0;
    let yaw = -.1, pitch = .12, velocity = 0;
    let dragging = false, pointerId = null, lastX = 0, lastY = 0, lastMove = 0;
    let previous = performance.now(), lastDraw = 0, emissionTime = 0;
    let width = 1, height = 1, centerX = 0, centerY = 0, displayedRadius = 70;
    const people = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const box = stage.getBoundingClientRect();
      const visual = sphere.getBoundingClientRect();
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      centerX = visual.left - box.left + visual.width / 2;
      centerY = visual.top - box.top + visual.height / 2;
      displayedRadius = visual.width * radius / size;
      particleCanvas.width = Math.round(width * dpr);
      particleCanvas.height = Math.round(height * dpr);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resizeObserver.observe(sphere);
    resize();

    function renderSphere() {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (const n of surface) {
        const ry = n.ny * cp + n.nz * sp;
        const rz = n.nz * cp - n.ny * sp;
        const rx = n.nx * cy - rz * sy;
        const z = n.nx * sy + rz * cy;
        let tone = 90;
        if (atlas) {
          const u = ((Math.atan2(rx, z) / TAU + .5) * atlas.width) | 0;
          const v = Math.min(atlas.height - 1, Math.max(0, ((.5 - Math.asin(Math.max(-1, Math.min(1, ry))) / Math.PI) * atlas.height) | 0));
          const i = (v * atlas.width + (u + atlas.width) % atlas.width) * 4;
          tone = atlas.pixels[i] * .3 + atlas.pixels[i + 1] * .59 + atlas.pixels[i + 2] * .11;
        }
        const value = Math.min(255, tone * 1.55 * n.shade + 8);
        frame.data[n.i] = value;
        frame.data[n.i + 1] = value;
        frame.data[n.i + 2] = value;
        frame.data[n.i + 3] = Math.min(255, n.nz * 1400);
      }
      ctx.putImageData(frame, 0, 0);
      const atmosphere = ctx.createRadialGradient(80, 80, radius - 5, 80, 80, radius + 2);
      atmosphere.addColorStop(0, 'rgba(220,235,240,0)');
      atmosphere.addColorStop(.65, 'rgba(220,235,240,.1)');
      atmosphere.addColorStop(1, 'rgba(220,235,240,0)');
      ctx.fillStyle = atmosphere;
      ctx.beginPath();
      ctx.arc(80, 80, radius + 2, 0, TAU);
      ctx.fill();
    }
    function launchPerson() {
      if (people.length >= 70) return;
      const angle = Math.random() * TAU;
      const speed = 50 + Math.random() * 85;
      people.push({
        x:centerX + Math.cos(angle) * displayedRadius * .82,
        y:centerY + Math.sin(angle) * displayedRadius * .82,
        vx:Math.cos(angle) * speed,
        vy:Math.sin(angle) * speed,
        age:0, life:1.1 + Math.random() * .7,
        size:1.3 + Math.random() * .8,
        angle:angle + Math.PI / 2,
        spin:(Math.random() - .5) * 3
      });
    }
    function drawPeople(dt) {
      pctx.clearRect(0, 0, width, height);
      for (let i = people.length - 1; i >= 0; i--) {
        const p = people[i];
        p.age += dt;
        if (p.age >= p.life) { people.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        pctx.save();
        pctx.translate(p.x, p.y);
        pctx.rotate(p.angle + p.age * p.spin);
        pctx.scale(p.size, p.size);
        pctx.globalAlpha = Math.min(1, p.age * 10) * (1 - p.age / p.life);
        pctx.strokeStyle = '#f3f3f1';
        pctx.lineWidth = .55;
        pctx.lineCap = 'round';
        pctx.beginPath();
        pctx.arc(0, -2.5, .7, 0, TAU);
        pctx.moveTo(0, -1.5); pctx.lineTo(0, .8);
        pctx.moveTo(-1.4, -.4); pctx.lineTo(0, -1); pctx.lineTo(1.4, -.4);
        pctx.moveTo(-1.1, 2.2); pctx.lineTo(0, .8); pctx.lineTo(1.1, 2.2);
        pctx.stroke();
        pctx.restore();
      }
    }
    function tick(now) {
      if (!active || !stage.isConnected) {
        active = false;
        resizeObserver.disconnect();
        return;
      }
      frameId = requestAnimationFrame(tick);
      if (now - lastDraw < 32) return;
      const dt = Math.min(.05, (now - previous) / 1000);
      previous = now;
      lastDraw = now;
      const visible = document.getElementById('shell').classList.contains('on')
        && !document.getElementById('studioExtras')
        && !document.getElementById('studioContentScreen') && !document.getElementById('studioVideoPlayer')
        && !document.getElementById('capabilitiesPage') && !document.getElementById('projPage')
        && !document.getElementById('projectModal').classList.contains('on');
      if (!visible || document.hidden) return;
      if (!dragging) {
        yaw += velocity * dt * 1000 + (reducedMotion ? 0 : dt * .09);
        velocity *= Math.exp(-dt * 2.2);
      } else if (now - lastMove > 90) velocity *= .8;
      if (!reducedMotion && Math.abs(velocity) > .0025 && now - emissionTime > 45) {
        launchPerson(); launchPerson();
        emissionTime = now;
      }
      renderSphere();
      drawPeople(dt);
    }
    stage.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragging = true;
      pointerId = e.pointerId;
      lastX = e.clientX; lastY = e.clientY; lastMove = performance.now();
      velocity = 0;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pointerId) return;
      const now = performance.now();
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      yaw += dx * .014;
      pitch = Math.max(-.7, Math.min(.7, pitch + dy * .008));
      velocity = Math.max(-.025, Math.min(.025, dx * .014 / Math.max(8, now - lastMove)));
      lastX = e.clientX; lastY = e.clientY; lastMove = now;
    });
    function endDrag(e) {
      if (e.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('lostpointercapture', () => { dragging = false; pointerId = null; });
    stage.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        velocity = e.key === 'ArrowRight' ? .007 : -.007;
        yaw += velocity * 25;
      } else pitch = Math.max(-.7, Math.min(.7, pitch + (e.key === 'ArrowDown' ? .1 : -.1)));
    });
    loadAtlas().then(value => {
      if (!active || !stage.isConnected) return;
      atlas = value;
      renderSphere();
    });
    renderSphere();
    frameId = requestAnimationFrame(tick);
  };
})();
