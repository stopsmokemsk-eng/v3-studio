/* Server sync for administrator content. Visitors read, the administrator writes. */
(() => {
  'use strict';
  const API = 'https://v3-studio.vercel.app';
  const KEYS = ['v3_projects','v3_team2','v3_contacts','v3_services','v3_intro_videos','v3_presentation','v3_documents','v3_background_track'];
  const scriptBase = new URL('.', document.currentScript.src);
  let adminPass = '';
  let serverState = 'unknown'; // unknown | ok | offline

  function timeoutFetch(url, options = {}, ms = 9000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  const ready = timeoutFetch(API + '/api/state', { cache: 'no-store' }, 7000)
    .then(r => r.ok ? r.json() : Promise.reject(new Error('state ' + r.status)))
    .then(json => {
      serverState = 'ok';
      const data = (json && json.data) || {};
      Object.keys(data).forEach(key => {
        if (!KEYS.includes(key)) return;
        try {
          if (data[key] === null) localStorage.removeItem(key);
          else localStorage.setItem(key, JSON.stringify(data[key]));
        } catch (e) {}
      });
      window.dispatchEvent(new CustomEvent('v3:synced', { detail: { keys: Object.keys(data) } }));
      return true;
    })
    .catch(() => { serverState = 'offline'; return false; });

  function setAdmin(pass) { adminPass = pass || ''; }
  function clearAdmin() { adminPass = ''; }

  async function verifyAdmin(login, pass) {
    try {
      const r = await timeoutFetch(API + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, pass }) }, 7000);
      const json = await r.json().catch(() => ({}));
      return { reachable: typeof json.ok === 'boolean', ok: json.ok === true };
    } catch (e) { return { reachable: false, ok: false }; }
  }

  let clientPromise;
  function loadClient() {
    if (window.V3BlobClient) return Promise.resolve(window.V3BlobClient);
    if (!clientPromise) clientPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('studio-blob-client.js', scriptBase).href;
      s.onload = () => window.V3BlobClient ? resolve(window.V3BlobClient) : reject(new Error('Модуль загрузки недоступен.'));
      s.onerror = () => { clientPromise = null; reject(new Error('Не удалось загрузить модуль загрузки файлов.')); };
      document.head.appendChild(s);
    });
    return clientPromise;
  }

  function kindOf(file) {
    const t = file.type || '';
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(file.name || '')) return 'audio';
    return 'document';
  }

  function safeName(name) {
    const clean = String(name || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return (clean || 'file').slice(-80);
  }

  async function uploadFile(file, folder = 'files') {
    if (!adminPass) throw new Error('Войдите как администратор, чтобы загружать файлы на сервер.');
    if (file.size > 500 * 1024 * 1024) throw new Error('Файл больше 500 МБ.');
    const client = await loadClient();
    const pathname = 'media/' + folder + '/' + Date.now().toString(36) + '-' + safeName(file.name || ('file-' + kindOf(file)));
    try {
      const blob = await client.upload(pathname, file, {
        access: 'public',
        handleUploadUrl: API + '/api/upload',
        clientPayload: adminPass,
        contentType: file.type || undefined,
        multipart: file.size > 8 * 1024 * 1024
      });
      return { src: blob.url, type: kindOf(file), name: file.name || '', size: file.size };
    } catch (e) {
      throw new Error('Файл не загружен на сервер: ' + (e && e.message ? e.message : 'нет связи с сервером') + '.');
    }
  }

  async function removeRemote(url) {
    if (!adminPass || typeof url !== 'string' || !/\.blob\.vercel-storage\.com\/media\//.test(url)) return;
    try { await timeoutFetch(API + '/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-V3-Admin': adminPass }, body: JSON.stringify({ url }) }); } catch (e) {}
  }

  // Files saved earlier only on this device (v3media:) are moved to the server before publishing.
  async function migrateLocal(value) {
    if (typeof value === 'string') {
      if (!value.startsWith('v3media:') || !window.V3Content) return value;
      try {
        const objectURL = await window.V3Content.resolveSource(value);
        const blob = await fetch(objectURL).then(r => r.blob());
        const ext = (blob.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
        const file = new File([blob], 'local-' + value.slice(8) + '.' + ext, { type: blob.type });
        return (await uploadFile(file, 'migrated')).src;
      } catch (e) { return value; }
    }
    if (Array.isArray(value)) { const out = []; for (const v of value) out.push(await migrateLocal(v)); return out; }
    if (value && typeof value === 'object') {
      const out = {};
      for (const k of Object.keys(value)) out[k] = await migrateLocal(value[k]);
      return out;
    }
    return value;
  }

  const queues = {};
  function push(key, value) {
    if (!KEYS.includes(key)) return Promise.resolve({ ok: true, local: true });
    if (!adminPass) return Promise.reject(new Error('Нет доступа администратора. Войдите заново.'));
    const run = async () => {
      const payload = await migrateLocal(value);
      if (JSON.stringify(payload) !== JSON.stringify(value)) {
        try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) {}
      }
      let r;
      try {
        r = await timeoutFetch(API + '/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-V3-Admin': adminPass }, body: JSON.stringify({ key, value: payload }) }, 15000);
      } catch (e) { serverState = 'offline'; throw new Error('Нет связи с сервером. Изменения сохранены только на этом устройстве.'); }
      const json = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error('Сервер не принял пароль администратора.');
      if (r.status === 503) throw new Error('Хранилище на сервере ещё не подключено. Изменения сохранены только на этом устройстве.');
      if (!r.ok || !json.ok) throw new Error('Сервер не сохранил данные' + (json.error ? ': ' + json.error : '') + '.');
      serverState = 'ok';
      return { ok: true };
    };
    const prev = queues[key] || Promise.resolve();
    const next = prev.catch(() => {}).then(run);
    queues[key] = next;
    return next;
  }

  window.V3Sync = {
    API, KEYS, ready, push, uploadFile, removeRemote, setAdmin, clearAdmin, verifyAdmin,
    isAdmin: () => !!adminPass,
    status: () => serverState
  };
})();
