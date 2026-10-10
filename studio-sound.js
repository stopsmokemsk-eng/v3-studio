/* Optional original local soundtrack, independent of all existing app state. */
(() => {
  'use strict';
  const source = new URL('audio/v3-soft-circuit.mp3',document.currentScript.src).href;
  const KEY = 'v3_sound_choice';
  const TRACK_KEY = 'v3_background_track';
  let currentTrack = null, trackRevision = 0, loadingTrack = true;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch(e) {}
  let wanted = saved === 'on', interacted = false, blocked = false, pending = false;
  let promptDone = saved === 'on' || saved === 'off';
  let fadeFrame = 0, noteTimer = 0, observerFrame = 0, focusBeforePrompt = null;
  let audio, button, dialog, note;

  function saveChoice(value) {
    promptDone = true;
    try { localStorage.setItem(KEY,value ? 'on' : 'off'); } catch(e) {}
  }
  function otherAudioPlaying() {
    return [...document.querySelectorAll('video')].some(v => !v.paused && !v.ended && !v.muted && v.volume > 0);
  }
  function temporarilyPaused() { return document.hidden || otherAudioPlaying(); }
  function paint() {
    const playing = !audio.paused && !temporarilyPaused();
    button.setAttribute('aria-pressed',String(wanted));
    button.dataset.playing = String(playing);
    button.dataset.blocked = String(blocked);
    const label = !wanted ? 'Включить фоновую музыку' : blocked ? 'Повторить включение фоновой музыки' :
      temporarilyPaused() ? 'Выключить фоновую музыку (сейчас на паузе)' : 'Выключить фоновую музыку';
    button.setAttribute('aria-label',label);
    button.title = label;
  }
  function stop() {
    cancelAnimationFrame(fadeFrame);
    audio.pause();
    audio.volume = 0;
    paint();
  }
  function fadeIn() {
    cancelAnimationFrame(fadeFrame);
    const started = performance.now();
    const tick = now => {
      if (!wanted || audio.paused || temporarilyPaused()) return;
      audio.volume = Math.max(0,Math.min(.65,.65*(now-started)/1100));
      if (audio.volume < .65) fadeFrame = requestAnimationFrame(tick);
    };
    fadeFrame = requestAnimationFrame(tick);
  }
  function showNote(message) {
    note.textContent = message;
    note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note.hidden = true; },6000);
  }
  function reconcile() {
    if (!audio) return;
    if (!wanted || temporarilyPaused()) { stop(); return; }
    if (loadingTrack || !interacted || pending || !audio.paused) { paint(); return; }
    pending = true;
    const revision = trackRevision;
    audio.volume = 0;
    audio.play().then(() => {
      if (revision !== trackRevision) return;
      pending = false;
      blocked = false;
      if (!wanted || temporarilyPaused()) { stop(); return; }
      note.hidden = true;
      fadeIn();
      paint();
    }).catch(error => {
      if (revision !== trackRevision) return;
      pending = false;
      if (!wanted) return;
      if (error.name === 'AbortError') {
        paint();
        if (!temporarilyPaused()) setTimeout(reconcile,0);
        return;
      }
      blocked = true;
      paint();
      showNote('Не удалось включить звук. Нажмите на кнопку звука, чтобы попробовать снова.');
    });
  }
  function closePrompt() {
    if (dialog.hidden) return;
    dialog.hidden = true;
    if (focusBeforePrompt?.isConnected) focusBeforePrompt.focus();
  }
  function choose(value) {
    wanted = value;
    interacted = true;
    blocked = false;
    saveChoice(value);
    closePrompt();
    reconcile();
  }
  function maybePrompt() {
    const install = document.getElementById('installWelcome');
    const menu = document.getElementById('shell');
    if (promptDone || !dialog.hidden || install?.classList.contains('on') || !menu?.classList.contains('on')) return;
    focusBeforePrompt = document.activeElement;
    dialog.hidden = false;
    dialog.querySelector('[data-sound="yes"]').focus();
  }
  function applyTrack(url, item) {
    trackRevision++;
    pending = false;
    stop();
    currentTrack = item;
    audio.src = url;
    audio.load();
    blocked = false;
    loadingTrack = false;
    reconcile();
  }
  async function restoreSavedTrack() {
    const revision = trackRevision;
    const item = window.V3Content.read(TRACK_KEY,null);
    if (item?.src && /^https:\/\//.test(item.src)) {
      if (!currentTrack || currentTrack.src !== item.src) applyTrack(item.src,item);
      else { loadingTrack = false; reconcile(); }
      return;
    }
    if (!item?.src?.startsWith('v3media:')) { loadingTrack = false; reconcile(); return; }
    try {
      const url = await window.V3Content.resolveSource(item.src);
      if (revision === trackRevision) applyTrack(url,item);
    } catch(e) {
      if (revision !== trackRevision) return;
      loadingTrack = false;
      showNote('Сохранённый трек недоступен. Используется стандартная музыка.');
      reconcile();
    }
  }
  function validateAudio(file) {
    if (!file.size) return Promise.reject(new Error('Выбранный файл пуст.'));
    if (file.size > 50 * 1024 * 1024) return Promise.reject(new Error('Выберите аудиофайл до 50 МБ.'));
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(file.name))
      return Promise.reject(new Error('Выберите аудиофайл, например MP3, M4A или WAV.'));
    return new Promise((resolve,reject) => {
      const probe = document.createElement('audio');
      const url = URL.createObjectURL(file);
      const finish = error => {
        clearTimeout(timer); probe.onloadedmetadata = probe.onerror = null;
        probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(url);
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(()=>finish(new Error('Не удалось прочитать трек. Попробуйте MP3 или M4A.')),15000);
      probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) && probe.duration > 0 ? null : new Error('Не удалось определить длительность трека.'));
      probe.onerror = () => finish(new Error('Браузер не поддерживает этот файл. Попробуйте MP3 или M4A.'));
      probe.preload = 'metadata'; probe.src = url;
    });
  }
  function attachAdmin(box) {
    if (!window.V3StudioData.isAdmin() || box.querySelector('#adminSoundPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'adminSoundPanel'; panel.className = 'studio-sound-admin';
    panel.innerHTML = '<h3>ФОНОВАЯ МУЗЫКА</h3><p class="studio-sound-current"></p><label class="local-upload">ЗАГРУЗИТЬ ФОНОВЫЙ ТРЕК<input id="backgroundMusicFile" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus"></label><button type="button" class="admin-btn">ВЕРНУТЬ СТАНДАРТНЫЙ ТРЕК</button><small>MP3, M4A, WAV и другие поддерживаемые аудиофайлы · до 50 МБ. Трек загружается на сервер и звучит у всех посетителей.</small><p class="local-status" role="status" aria-live="polite"></p>';
    (box.querySelector('.admin-topbar') || box.querySelector('.admin-badge')).after(panel);
    const input = panel.querySelector('input'), reset = panel.querySelector('button'), status = panel.querySelector('.local-status');
    const refresh = () => {
      const item = window.V3Content.read(TRACK_KEY,null);
      panel.querySelector('.studio-sound-current').textContent = 'Текущий трек: ' + (item?.name || 'V³ / Soft Circuit');
      reset.disabled = !item;
    };
    const lock = value => { input.disabled = value; reset.disabled = value || !window.V3Content.read(TRACK_KEY,null); };
    const report = (message,error=false) => { status.textContent = message; status.classList.toggle('is-error',error); };
    input.onchange = async () => {
      const file = input.files[0]; if (!file || !window.V3StudioData.isAdmin()) return;
      lock(true); report('Проверяем и сохраняем трек…');
      let item, committed = false;
      try {
        await validateAudio(file);
        if (!window.V3StudioData.isAdmin()) throw new Error('Войдите в режим администратора снова.');
        item = await window.V3Content.storeFile(file,['audio']);
        const url = await window.V3Content.resolveSource(item.src);
        const previous = window.V3Content.read(TRACK_KEY,null);
        window.V3Content.write(TRACK_KEY,item); committed = true;
        applyTrack(url,item);
        if (previous?.src) window.V3Content.removeFile(previous.src).catch(()=>{});
        refresh(); report('Трек заменён и сохранён. Включить музыку можно кнопкой в верхнем углу.');
      } catch(e) {
        if (item && !committed) window.V3Content.removeFile(item.src).catch(()=>{});
        report(e.message,true);
      } finally { lock(false); input.value = ''; }
    };
    reset.onclick = () => {
      if (!window.V3StudioData.isAdmin()) return;
      try {
        const previous = window.V3Content.read(TRACK_KEY,null);
        window.V3Content.write(TRACK_KEY,null);
        applyTrack(source,null);
        if (previous?.src) window.V3Content.removeFile(previous.src).catch(()=>{});
        refresh(); report('Стандартный трек восстановлен.');
      } catch(e) { report(e.message,true); }
    };
    refresh();
  }
  window.V3Sound = { attachAdmin };
  function setup() {
    audio = document.createElement('audio');
    audio.id = 'studioBackgroundAudio';
    audio.src = source;
    audio.loop = true;
    audio.preload = 'none';
    audio.hidden = true;
    audio.setAttribute('aria-hidden','true');
    button = document.createElement('button');
    button.id = 'studioSoundToggle';
    button.type = 'button';
    button.innerHTML = '<i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>';
    dialog = document.createElement('section');
    dialog.className = 'studio-sound-dialog';
    dialog.hidden = true;
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','studioSoundTitle');
    dialog.setAttribute('aria-describedby','studioSoundDescription');
    dialog.innerHTML = '<div class="studio-sound-card"><span class="studio-sound-kicker">V³ / ЗВУК ПРОСТРАНСТВА</span><h2 id="studioSoundTitle">Включить<br>фоновую музыку?</h2><p id="studioSoundDescription">Светлый космический эмбиент, мягкие цифровые переливы и точные движения механизмов. Ненавязчивый звук творческой студии.</p><small>Звук можно включить или выключить в любой момент кнопкой в верхнем правом углу.</small><div class="studio-sound-actions"><button type="button" data-sound="yes">ДА</button><button type="button" data-sound="no">НЕТ</button></div></div>';
    note = document.createElement('div');
    note.className = 'studio-sound-note';
    note.setAttribute('role','status');
    note.hidden = true;
    document.body.append(audio,button,dialog,note);
    document.body.classList.add('studio-sound-ready');
    restoreSavedTrack();
    window.addEventListener('v3:synced',() => { if (!window.V3StudioData?.isAdmin()) restoreSavedTrack(); });
    button.onclick = () => {
      interacted = true;
      if (blocked && wanted) {
        blocked = false;
        if (audio.error) audio.load();
        reconcile();
        return;
      }
      wanted = !wanted;
      blocked = false;
      saveChoice(wanted);
      closePrompt();
      reconcile();
    };
    dialog.querySelectorAll('[data-sound]').forEach(b => b.onclick = () => choose(b.dataset.sound === 'yes'));
    dialog.addEventListener('keydown',event => {
      if (event.key === 'Tab') {
        event.preventDefault();
        const choices = [...dialog.querySelectorAll('button')];
        const index = choices.indexOf(document.activeElement);
        choices[(index+choices.length+(event.shiftKey ? -1 : 1))%choices.length].focus();
      }
    });
    window.addEventListener('keydown',event => {
      if (!dialog.hidden && event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); choose(false);
      }
    },true);
    document.addEventListener('click',event => {
      interacted = true;
      if (!event.target.closest('#studioSoundToggle,.studio-sound-dialog')) reconcile();
    },true);
    ['play','playing','pause','ended','volumechange'].forEach(type => document.addEventListener(type,event => {
      if (event.target instanceof HTMLVideoElement) reconcile();
    },true));
    ['playing','pause','ended'].forEach(type=>audio.addEventListener(type,paint));
    document.addEventListener('visibilitychange',reconcile);
    window.addEventListener('pagehide',stop);
    window.addEventListener('pageshow',reconcile);
    const observer = new MutationObserver(records => {
      const relevant = records.some(r => r.target.id === 'installWelcome' || r.target.id === 'shell' || r.target === document.body ||
        [...r.removedNodes].some(n=>n.nodeType===1 && (n.tagName==='VIDEO' || n.querySelector?.('video'))));
      if (!relevant || observerFrame) return;
      observerFrame = requestAnimationFrame(() => { observerFrame = 0; maybePrompt(); reconcile(); });
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    paint();
    maybePrompt();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
