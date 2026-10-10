/* Local-only media and results, explicitly chosen by the owner. */
(() => {
  'use strict';
  const urls = new Map();
  let database;
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function read(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch(e) { return fallback; } }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch(e) { throw new Error('Не удалось сохранить данные в этом браузере. Проверьте свободное место и настройки приватности.'); }
  }
  function db() {
    if (database) return database;
    database = new Promise((resolve,reject) => {
      try {
        const request = indexedDB.open('v3-local-media',1);
        request.onupgradeneeded = () => request.result.createObjectStore('files',{ keyPath:'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Локальное хранилище недоступно. Откройте приложение в обычном Safari или Chrome.'));
        request.onblocked = () => reject(new Error('Закройте другие вкладки приложения и попробуйте загрузить файл снова.'));
      } catch(e) { reject(new Error('Браузер блокирует локальное хранение файлов. Откройте сайт напрямую в Safari или Chrome.')); }
    });
    return database;
  }
  async function storeFile(file, allowed = ['image','video']) {
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : '';
    if (!allowed.includes(type)) throw new Error('Выберите файл подходящего типа: фото или видео.');
    if (file.size > 150 * 1024 * 1024) throw new Error('Файл больше 150 МБ. Сожмите видео или добавьте прямую ссылку на него.');
    const id = 'f-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
    const connection = await db();
    await new Promise((resolve,reject) => {
      const tx = connection.transaction('files','readwrite');
      tx.objectStore('files').put({ id,blob:file,name:file.name,type,size:file.size });
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(new Error('Файл не сохранён. Возможно, на устройстве недостаточно свободного места.'));
    });
    return { src:'v3media:' + id,type,name:file.name };
  }
  async function resolveSource(source) {
    if (!source) return '';
    if (!source.startsWith('v3media:')) {
      if (/^(?:javascript|vbscript|file):/i.test(source)) return '';
      return source;
    }
    const id = source.slice(8);
    if (urls.has(id)) return urls.get(id);
    const connection = await db();
    const record = await new Promise((resolve,reject) => {
      const tx = connection.transaction('files','readonly');
      const request = tx.objectStore('files').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    });
    if (!record) throw new Error('Этот файл хранится на другом устройстве или был удалён.');
    const url = URL.createObjectURL(record.blob);
    urls.set(id,url);
    return url;
  }
  async function bindMedia(element, source) {
    element.dataset.mediaRef = source || '';
    try {
      const url = await resolveSource(source);
      if (element.dataset.mediaRef && element.dataset.mediaRef !== source) return;
      if (url) element.src = url;
    } catch(e) {
      element.setAttribute('aria-label', e.message);
      const parent = element.closest('.project-media-slide,.content-video-card');
      if (parent && !parent.querySelector('.media-error')) {
        const note = document.createElement('span'); note.className = 'media-error'; note.textContent = e.message; parent.appendChild(note);
      }
    }
  }
  function getProjectMedia(project) {
    if (Array.isArray(project.media)) return project.media;
    return (project.gallery && project.gallery.length ? project.gallery : [project.img]).filter(Boolean).map(src => ({
      src, type:/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(src) ? 'video' : 'image',name:''
    }));
  }
  function mediaList(container, items, remove) {
    container.replaceChildren();
    items.forEach((item,i) => {
      const row = document.createElement('div'); row.className = 'admin-media-row';
      const label = document.createElement('span'); label.textContent = (item.type === 'video' ? 'Видео / ' : 'Фото / ') + (item.name || ('материал ' + (i + 1)));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-btn'; button.textContent = 'Удалить';
      button.onclick = () => remove(i);
      row.append(label,button); container.appendChild(row);
    });
  }
  function uploadControl(label, accept, multiple = false) {
    const el = document.createElement('label'); el.className = 'local-upload';
    el.append(document.createTextNode(label));
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.multiple = multiple;
    el.appendChild(input); return { el,input };
  }
  function notice(container, message, error = false) {
    let el = container.querySelector('.local-status');
    if (!el) { el = document.createElement('p'); el.className = 'local-status'; container.appendChild(el); }
    el.textContent = message; el.classList.toggle('is-error',error);
  }
  async function uploadBatch(input, allowed, done, parent) {
    const files = [...input.files]; if (!files.length) return;
    const locks = [...parent.querySelectorAll('select,button,input[type="file"]')].map(element=>({element,disabled:element.disabled}));
    locks.forEach(({element})=>element.disabled=true);
    input.disabled = true; notice(parent,'Сохраняем файлы на этом устройстве…');
    try {
      for (const file of files) await done(await storeFile(file,allowed));
      notice(parent,'Сохранено на этом устройстве.');
    } catch(e) { notice(parent,e.message,true); }
    finally { locks.forEach(({element,disabled})=>element.disabled=disabled); input.disabled = false; input.value = ''; }
  }
  function getVideos() {
    const saved = read('v3_intro_videos',null);
    return Array.isArray(saved) && saved.length ? saved : [{ src:'ink.mp4',type:'video',name:'Заставка V³ Studio',poster:'frames/f01.jpg' }];
  }
  function setVideos(items) { write('v3_intro_videos',items); }
  function closePlayer() {
    const root = document.getElementById('studioVideoPlayer');
    if (!root) return;
    root.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    root.remove();
  }
  function openPlayer(item) {
    closePlayer();
    const root = document.createElement('section'); root.id = 'studioVideoPlayer'; root.className = 'content-screen content-player';
    root.innerHTML = '<header class="content-header"><button type="button" class="btn-detail">← НАЗАД</button><span></span></header><video controls playsinline preload="metadata"></video>';
    root.querySelector('header span').textContent = item.name || 'Видео';
    root.querySelector('button').onclick = closePlayer;
    const video = root.querySelector('video');
    if (item.poster) resolveSource(item.poster).then(url => { video.poster = url; }).catch(()=>{});
    document.body.appendChild(root);
    resolveSource(item.src).then(url => {
      if (!root.isConnected) return;
      video.src = url;
      const playing = video.play(); if (playing) playing.catch(()=>{});
    }).catch(e => notice(root,e.message,true));
  }
  function openContentScreen(title, presentation = false) {
    closePlayer();
    const previous = document.getElementById('studioContentScreen'); if (previous) previous.remove();
    const root = document.createElement('section'); root.id = 'studioContentScreen'; root.className = 'content-screen';
    root.innerHTML = '<header class="content-header"><button type="button" class="btn-detail">← НАЗАД</button><span></span></header><div class="content-screen-body"></div>';
    root.querySelector('header span').textContent = title;
    root.querySelector('button').onclick = () => { closePlayer(); root.querySelectorAll('video').forEach(v=>v.pause()); root.remove(); };
    document.body.appendChild(root);
    return { root,body:root.querySelector('.content-screen-body'),presentation };
  }
  function appendVideoCard(body,item,remove) {
    const card = document.createElement('article'); card.className = 'content-video-card';
    const preview = document.createElement('video'); preview.muted = true; preview.playsInline = true; preview.preload = 'metadata';
    if (!item.poster) preview.addEventListener('loadedmetadata',() => {
      if (Number.isFinite(preview.duration) && preview.duration > 0) preview.currentTime = Math.min(1,preview.duration * .15);
    },{ once:true });
    if (item.poster) resolveSource(item.poster).then(src=>preview.poster=src).catch(()=>{});
    bindMedia(preview,item.src);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'content-video-open'; button.textContent = item.name || 'Видео';
    button.onclick = () => openPlayer(item); preview.onclick = () => openPlayer(item);
    card.append(preview,button);
    if (remove) {
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn-detail content-video-delete'; del.textContent = 'Удалить';
      del.onclick = remove; card.appendChild(del);
    }
    body.appendChild(card);
  }
  function videoControls(root,body,onAdd,multiple = true) {
    const controls = document.createElement('div'); controls.className = 'content-upload-controls';
    const upload = uploadControl('ДОБАВИТЬ ВИДЕО С УСТРОЙСТВА','video/*',multiple);
    upload.input.onchange = () => uploadBatch(upload.input,['video'],onAdd,controls);
    const url = document.createElement('input'); url.className = 'admin-input'; url.placeholder = 'Прямая ссылка на видео (MP4 / WebM)';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'admin-btn'; add.textContent = 'Добавить по ссылке';
    add.onclick = async () => {
      try { const value = new URL(url.value); if (!['https:','http:'].includes(value.protocol)) throw Error(); await onAdd({ src:value.href,type:'video',name:'Видео по ссылке' }); }
      catch(e) { notice(controls,'Проверьте прямую HTTPS-ссылку на видео.',true); }
    };
    controls.append(upload.el,url,add); body.appendChild(controls);
    return controls;
  }
  function openVideoGallery() {
    const screen = openContentScreen('ЗАСТАВКА / ВИДЕО');
    const admin = window.V3StudioData.isAdmin();
    const grid = document.createElement('div'); grid.className = 'content-video-grid'; screen.body.appendChild(grid);
    getVideos().forEach((item,i) => appendVideoCard(grid,item,admin && item.src !== 'ink.mp4' ? () => {
      const items = getVideos(); items.splice(i,1); setVideos(items); openVideoGallery();
    } : null));
    if (admin) videoControls(screen.root,screen.body,async item => {
      const items = getVideos(); items.push(item); setVideos(items);
      appendVideoCard(grid,item,() => { setVideos(getVideos().filter(v=>v.src!==item.src)); openVideoGallery(); });
    });
    const note = document.createElement('p'); note.className = 'content-local-note'; note.textContent = 'Загруженные файлы сохраняются только на этом устройстве.'; if (admin) screen.body.appendChild(note);
  }
  function openPresentation() {
    const screen = openContentScreen('ПРЕЗЕНТАЦИЯ',true);
    const item = read('v3_presentation',null);
    if (item) appendVideoCard(screen.body,item,null);
    else {
      const empty = document.createElement('div'); empty.className = 'content-empty'; empty.innerHTML = '<span>V³ / ПРЕЗЕНТАЦИЯ</span><h2>Скоро здесь.</h2><p>Видео пока не добавлено.</p>'; screen.body.appendChild(empty);
    }
    if (window.V3StudioData.isAdmin()) videoControls(screen.root,screen.body,async video => {
      write('v3_presentation',video);
      const empty = screen.body.querySelector('.content-empty'); if (empty) empty.remove();
      const old = screen.body.querySelector('.content-video-card'); if (old) old.remove();
      const holder = document.createElement('div'); appendVideoCard(holder,video,null); screen.body.prepend(holder.firstChild);
    },false);
    if (item) openPlayer(item);
  }
  function attachAdmin(box,project,list,team) {
    const picker = document.createElement('select'); picker.id = 'adminProjectPicker'; picker.className = 'admin-input';
    list.forEach((p,i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = 'Проект / ' + p.title; option.selected = p.id === project.id; picker.appendChild(option); });
    picker.onchange = () => { window.V3StudioData.selectProject(+picker.value); };
    box.querySelector('#editTitle').before(picker);
    const cover = uploadControl('Загрузить обложку','image/*');
    cover.input.id = 'projectCoverFile'; box.querySelector('#editCover').after(cover.el);
    cover.input.onchange = () => uploadBatch(cover.input,['image'],async item => {
      project.img = item.src; box.querySelector('#editCover').value = item.src; window.V3StudioData.saveProjects(list);
    },box);
    const upload = uploadControl('Добавить фото / видео в проект','image/*,video/*',true);
    upload.input.id = 'projectMediaFiles';
    const container = document.createElement('div'); container.id = 'adminProjectMedia'; container.className = 'admin-media-list';
    box.querySelector('#editGallery').after(upload.el,container);
    const refresh = () => mediaList(container,getProjectMedia(project),i => {
      const items = getProjectMedia(project).slice(); items.splice(i,1); project.media = items;
      project.gallery = items.filter(m=>m.type==='image').map(m=>m.src);
      box.querySelector('#editGallery').value = project.gallery.join(', ');
      window.V3StudioData.saveProjects(list); refresh();
    });
    upload.input.onchange = () => uploadBatch(upload.input,['image','video'],async item => {
      project.media = [...getProjectMedia(project),item];
      project.gallery = project.media.filter(m=>m.type==='image').map(m=>m.src);
      box.querySelector('#editGallery').value = project.gallery.join(', ');
      window.V3StudioData.saveProjects(list); refresh();
    },box);
    refresh();
    const links = document.createElement('textarea'); links.id = 'editMoreLinks'; links.className = 'admin-input'; links.rows = 2;
    links.placeholder = 'Дополнительные ссылки на проект, каждая с новой строки';
    links.value = (project.links || []).filter(url=>url!==project.link).join('\n');
    box.querySelector('#editLink').after(links);
    team.forEach((person,i) => {
      const avatar = uploadControl('Загрузить аватар / ' + person.name,'image/*');
      avatar.input.id = 'teamAvatarFile' + i;
      const preview = document.createElement('img'); preview.className = 'admin-avatar-preview'; preview.alt = person.name; bindMedia(preview,person.avatar || 'logo.png');
      box.querySelector('#ta'+i).after(avatar.el,preview);
      avatar.input.onchange = () => uploadBatch(avatar.input,['image'],async item => {
        person.avatar = item.src; box.querySelector('#ta'+i).value = item.src; bindMedia(preview,item.src); window.V3StudioData.saveTeam(team);
      },box);
    });
    const shortcuts = document.createElement('div'); shortcuts.className = 'content-admin-shortcuts';
    const intro = document.createElement('button'); intro.type = 'button'; intro.className = 'admin-btn'; intro.textContent = 'Видео заставки'; intro.onclick = openVideoGallery;
    const presentation = document.createElement('button'); presentation.type = 'button'; presentation.className = 'admin-btn'; presentation.textContent = 'Видео презентации'; presentation.onclick = openPresentation;
    shortcuts.append(intro,presentation); box.appendChild(shortcuts);
  }
  function scoreRecord(login) { return login ? read('v3_game_' + login.toLowerCase(),null) : null; }
  function saveScore(login,result) {
    if (!login) return null;
    const old = scoreRecord(login) || { bestScore:0,bestMass:0,plays:0 };
    const data = { bestScore:Math.max(old.bestScore || 0,result.score),bestMass:Math.max(old.bestMass || 0,result.mass),plays:(old.plays || 0) + 1,last:{...result,date:new Date().toISOString()} };
    write('v3_game_' + login.toLowerCase(),data); return data;
  }
  function gameSummary(login) {
    const record = scoreRecord(login);
    return '<div class="game-account-record"><span>V³ / CELL · РЕЗУЛЬТАТЫ НА УСТРОЙСТВЕ</span>' + (record
      ? '<p>Рекорд: ' + escape(record.bestScore) + ' · Максимальная масса: ' + escape(record.bestMass) + '</p><p>Игр: ' + escape(record.plays) + '</p>'
      : '<p>Пока нет сохранённых результатов.</p>') + '</div>';
  }
  window.V3Content = {
    bindMedia,resolveSource,getProjectMedia,attachAdmin,openVideoGallery,openPresentation,
    scoreRecord,saveScore,gameSummary,escape,
    read,write
  };
})();
