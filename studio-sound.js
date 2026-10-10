/* Optional original local soundtrack, independent of all existing app state. */
(() => {
  'use strict';
  const source = new URL('audio/v3-orbital-mechanics.mp3',document.currentScript.src).href;
  const KEY = 'v3_sound_choice';
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
    if (!interacted || pending || !audio.paused) { paint(); return; }
    pending = true;
    audio.volume = 0;
    audio.play().then(() => {
      pending = false;
      blocked = false;
      if (!wanted || temporarilyPaused()) { stop(); return; }
      note.hidden = true;
      fadeIn();
      paint();
    }).catch(error => {
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
    if (promptDone || !dialog.hidden || install?.classList.contains('on')) return;
    focusBeforePrompt = document.activeElement;
    dialog.hidden = false;
    dialog.querySelector('[data-sound="yes"]').focus();
  }
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
    dialog.innerHTML = '<div class="studio-sound-card"><span class="studio-sound-kicker">V³ / ЗВУК ПРОСТРАНСТВА</span><h2 id="studioSoundTitle">Включить<br>фоновую музыку?</h2><p id="studioSoundDescription">Космические звуки, мягкий гул и лёгкие механические текстуры. Ненавязчивый фон для знакомства со студией.</p><small>Звук можно включить или выключить в любой момент кнопкой в верхнем правом углу.</small><div class="studio-sound-actions"><button type="button" data-sound="yes">ДА</button><button type="button" data-sound="no">НЕТ</button></div></div>';
    note = document.createElement('div');
    note.className = 'studio-sound-note';
    note.setAttribute('role','status');
    note.hidden = true;
    document.body.append(audio,button,dialog,note);
    document.body.classList.add('studio-sound-ready');
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
      const relevant = records.some(r => r.target.id === 'installWelcome' || r.target === document.body ||
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
