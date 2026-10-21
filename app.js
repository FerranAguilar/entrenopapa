(() => {
/* ---------- Supabase: the shared database and media storage ---------- */
const CFG = window.ENTRENO_CONFIG || {};
const PAGE = document.body.dataset.page === 'coach' ? 'coach' : 'athlete';
const sb = (window.supabase && CFG.url && CFG.key) ? window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: false } }) : null;
const mediaUrl = id => `${CFG.url}/storage/v1/object/public/media/${id}`;
const sbErr = e => ({ code: e && (e.code === '42501' || e.status === 401 || e.status === 403) ? 'invalid_argument' : 'unavailable', message: (e && e.message) || 'error' });
/* Small document-store wrapper: doc('table/id').set/update/delete and collection('table').onSnapshot. */
function makeDb() {
  const doc = path => {
    const [table, id] = path.split('/');
    return {
      async set(data) { const { error } = await sb.from(table).upsert({ id, data, updated_at: new Date().toISOString() }); if (error) throw sbErr(error); },
      async update(patch) {
        const { data: row, error } = await sb.from(table).select('data').eq('id', id).maybeSingle();
        if (error) throw sbErr(error);
        if (!row) throw { code: 'invalid_argument', message: 'missing' };
        const { error: e2 } = await sb.from(table).update({ data: { ...row.data, ...patch }, updated_at: new Date().toISOString() }).eq('id', id);
        if (e2) throw sbErr(e2);
      },
      async delete() { const { error } = await sb.from(table).delete().eq('id', id); if (error) throw sbErr(error); }
    };
  };
  const collection = table => ({
    onSnapshot(next, onErr) {
      let rows = new Map(), loading = null;
      const emit = () => next({ docs: [...rows.values()].map(r => ({ id: r.id, data: () => r.data })) });
      const load = () => loading || (loading = (async () => {
        try {
          const { data, error } = await sb.from(table).select('id,data');
          if (error) throw sbErr(error);
          rows = new Map(data.map(r => [r.id, r])); emit();
        } catch (e) { onErr && onErr(e); }
        finally { loading = null; }
      })());
      sb.channel('live-' + table)
        .on('postgres_changes', { event: '*', schema: 'public', table }, p => {
          if (p.eventType === 'DELETE') { if (p.old && p.old.id) rows.delete(p.old.id); }
          else if (p.new && p.new.id) rows.set(p.new.id, { id: p.new.id, data: p.new.data });
          emit();
        })
        .subscribe(status => { if (status === 'SUBSCRIBED') load(); });
      load();
      /* Phones drop the live connection in the background: refresh on return and now and then. */
      document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
      setInterval(() => { if (!document.hidden) load(); }, 45000);
    }
  });
  return { doc, collection };
}
const hexId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const assetStore = {
  async upload(blob, { type }) {
    const id = hexId();
    const { error } = await sb.storage.from('media').upload(id, blob, { contentType: type, cacheControl: '31536000', upsert: false });
    if (error) {
      const m = String(error.message || ''), st = Number(error.statusCode || error.status || 0);
      throw { code: st === 413 || /size|large/i.test(m) ? 'too_large' : /mime|type/i.test(m) ? 'unsupported_type' : 'upstream_error', message: m };
    }
    return { id, url: mediaUrl(id) };
  }
};

const $app = document.getElementById('app');
const $dock = document.getElementById('dock');
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem('pp:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pp:' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('pp:' + k); } catch {} }
};
const clone = o => JSON.parse(JSON.stringify(o));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- icons ---------- */
const I = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2h5"/>',
  weight: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  note: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 01-10 0c0-2.5 1.5-3.5 2-5 1 1.5 2 2 3 2-.5-2-1-4 0-7z"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  run: '<circle cx="15" cy="4.5" r="2"/><path d="M13 8l-2.2 5 3.2 3-1 5M10.8 13l-3 4H5M8 10.5l5-2.5 3 3.2h3"/>'
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
function face(n) {
  const m = { 1: 'M12 26 Q18 19 24 26', 2: 'M12 25 Q18 22 24 25', 3: 'M12 24 L24 24', 4: 'M12 22 Q18 27 24 22', 5: 'M11 21 Q18 30 25 21' }[n] || 'M12 24 L24 24';
  return `<svg class="f${n}" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="13" cy="14.5" r="2" fill="currentColor"/><circle cx="23" cy="14.5" r="2" fill="currentColor"/><path d="${m}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}
const rpeCls = n => n <= 4 ? 'lo' : n <= 7 ? 'mid' : 'hi';

/* ---------- dates ---------- */
const parseD = s => { if (!s) return null; const [y, m, d] = String(s).split('-').map(Number); return (y && m && d) ? new Date(y, m - 1, d) : null; };
const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mon = d => d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
function weekRange(s) {
  const d = parseD(s); if (!d) return '';
  const e = new Date(d); e.setDate(e.getDate() + 6);
  return d.getMonth() === e.getMonth() ? `${d.getDate()}–${e.getDate()} ${mon(e)}` : `${d.getDate()} ${mon(d)} – ${e.getDate()} ${mon(e)}`;
}
function mondayOf(dt) { const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
const fmtWhen = iso => { try { return new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const DAYK = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
const DAYL = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const dayIdx = s => DAYK.indexOf(fold(s).slice(0, 3));

const FEEL = ['', 'Muy duro', 'Duro', 'Normal', 'Bien', 'Genial'];
const RPE = ['', 'Muy suave', 'Muy suave', 'Suave', 'Suave', 'Moderado', 'Moderado', 'Duro', 'Duro', 'Muy duro', 'Máximo'];
const RPE_HINT = ['', 'Casi sin esfuerzo', 'Casi sin esfuerzo', 'Podrías seguir mucho rato', 'Podrías seguir mucho rato', 'Cuesta un poco, puedes hablar', 'Cuesta, hablas con frases cortas', 'Te quedaban 2–3 repeticiones', 'Te quedaban 1–2 repeticiones', 'No podías hacer más de 1', 'No podías hacer ni una más'];

/* ---------- state ---------- */
const S = {
  mode: PAGE,
  status: 'loading', db: null, canWrite: true,
  weeks: [], feedback: {}, gotWeeks: false, gotFb: false,
  weekIdx: null, open: null, editFb: null, atab: 'week', histMonth: null, histDay: null,
  tab: 'plan', edit: null, armed: null,
  assets: null, vidOpen: new Set(), uploading: null, lib: {},
  runs: {}, runOpen: null, runDraft: null
};
const validAsset = id => /^[0-9a-f]{32}$/i.test(String(id || '')) ? String(id) : '';

/* ---------- exercise video library: one video per exercise name ---------- */
const slug = n => fold(n).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
function libOf(e) { return S.lib[slug(e && e.name)] || {}; }
function exVideo(e) { return validAsset(e.videoAsset) || validAsset(libOf(e).videoAsset); }
function exImage(e) { return validAsset(e.imageAsset) || validAsset(libOf(e).imageAsset); }
/* Library per exercise name: uploaded image, uploaded video and a pasted link. patch: '' clears that field; the doc goes away once empty. */
const LIBF = ['videoAsset', 'imageAsset', 'link'];
const libVal = (f, v) => f === 'link' ? safeUrl(v) : validAsset(v);
async function saveLib(name, patch) {
  const k = slug(name); if (!k) return;
  const cur = S.lib[k] || {};
  const next = { name: String(name).trim() };
  for (const f of LIBF) next[f] = libVal(f, f in patch ? patch[f] : cur[f]);
  if (S.lib[k] && LIBF.every(f => next[f] === libVal(f, cur[f]))) return;
  try {
    if (LIBF.every(f => !next[f])) { if (S.lib[k]) await write('library/' + k, ref => ref.delete()); return; }
    await write('library/' + k, ref => ref.set({ ...next, updatedAt: new Date().toISOString() }));
  } catch {}
}

/* ---------- pasted links: YouTube, Vimeo, Google Drive, direct images and videos ---------- */
const normUrl = u => { u = String(u || '').trim(); if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && /^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(u)) u = 'https://' + u; return u; };
const libLink = e => safeUrl(libOf(e).link);
const exLink = e => safeUrl(normUrl(e.video)) || libLink(e);
function parseT(t) { if (!t) return 0; const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; }
function parseMedia(raw) {
  const u = safeUrl(normUrl(raw)); if (!u) return null;
  let url; try { url = new URL(u); } catch { return null; }
  const h = url.hostname.toLowerCase().replace(/^(www|m)\./, ''), path = url.pathname;
  if (h === 'youtu.be' || h === 'youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com') {
    let id = h === 'youtu.be' ? path.slice(1).split('/')[0] : path === '/watch' ? url.searchParams.get('v') : ((path.match(/^\/(shorts|embed|live|v)\/([\w-]+)/) || [])[2]);
    if (id && /^[\w-]{11}$/.test(id)) return { kind: 'youtube', id, url: u, start: parseT(url.searchParams.get('t') || url.searchParams.get('start')), vertical: path.startsWith('/shorts/') };
  }
  if (h === 'vimeo.com' || h === 'player.vimeo.com') {
    const m = path.match(/(\d{6,})(?:\/([0-9a-f]{6,}))?/);
    if (m) return { kind: 'vimeo', id: m[1], hash: url.searchParams.get('h') || m[2] || '', url: u };
  }
  if (h === 'drive.google.com') {
    const id = (path.match(/\/file\/d\/([\w-]+)/) || [])[1] || url.searchParams.get('id');
    if (id) return { kind: 'drive', id, url: u };
  }
  const p = path.toLowerCase();
  if (/\.(mp4|webm|m4v|mov)$/.test(p)) return { kind: 'video', url: u };
  if (/\.(jpe?g|png|gif|webp|avif|svg)$/.test(p)) return { kind: 'image', url: u };
  return { kind: 'link', url: u };
}
function embedSrc(m, o = {}) {
  if (m.kind === 'youtube') return `https://www.youtube-nocookie.com/embed/${m.id}?rel=0&playsinline=1&modestbranding=1${m.start ? `&start=${m.start}` : ''}${o.autoplay ? '&autoplay=1' : ''}${o.muted ? '&mute=1' : ''}${o.loop ? `&loop=1&playlist=${m.id}&controls=0` : ''}`;
  if (m.kind === 'vimeo') return `https://player.vimeo.com/video/${m.id}?playsinline=1${m.hash ? `&h=${m.hash}` : ''}${o.autoplay ? '&autoplay=1' : ''}${o.muted ? '&muted=1' : ''}${o.loop ? '&loop=1&controls=0' : ''}`;
  if (m.kind === 'drive') return `https://drive.google.com/file/d/${m.id}/preview`;
  return '';
}
const ytThumb = m => `https://i.ytimg.com/vi/${m.id}/hqdefault.jpg`;
const LINKNAME = { youtube: 'YouTube', vimeo: 'Vimeo', drive: 'Drive' };
/* What the exercise card shows: a picture (uploaded, else a linked image) and a player (uploaded video, else a linked video). */
function cardImage(e) {
  const im = exImage(e); if (im) return { src: mediaUrl(im) };
  const m = parseMedia(exLink(e));
  if (m && (m.kind === 'image' || m.kind === 'link')) return { src: m.url, try: true };
  return null;
}
function cardVideo(e) {
  const va = exVideo(e); if (va) return { kind: 'file', src: mediaUrl(va) };
  const m = parseMedia(exLink(e)); if (!m) return null;
  if (m.kind === 'video') return { kind: 'file', src: m.url };
  if (m.kind === 'youtube' || m.kind === 'vimeo' || m.kind === 'drive') return { kind: 'embed', m };
  return null;
}
function playerHtml(cv, e) {
  if (cv.kind === 'file') return `<div class="vidbox"><video controls muted playsinline preload="metadata" src="${esc(cv.src)}"></video></div>`;
  return `<div class="vidbox embed${cv.m.vertical ? ' vertical' : ''}"><iframe src="${esc(embedSrc(cv.m, { autoplay: true, muted: true }))}" title="Vídeo: ${esc(e.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}
/* Coach editor: what a pasted link will turn into. */
function linkPreview(raw) {
  if (!String(raw || '').trim()) return '';
  const m = parseMedia(raw);
  if (!m) return `<span class="bad">Pega un enlace completo, que empiece por https://</span>`;
  const ok = t => `<span><span class="ok">✓ ${t}</span></span>`;
  if (m.kind === 'youtube') return `<img src="${esc(ytThumb(m))}" alt="">${ok(`Vídeo de YouTube${m.vertical ? ' (Short)' : ''} · se verá dentro de la app`)}`;
  if (m.kind === 'vimeo') return ok('Vídeo de Vimeo · se verá dentro de la app');
  if (m.kind === 'drive') return `<span><span class="ok">✓ Archivo de Google Drive</span><br>Compártelo como «Cualquier persona con el enlace».</span>`;
  if (m.kind === 'video') return `<video muted playsinline preload="metadata" src="${esc(m.url)}"></video>${ok('Vídeo · se verá dentro de la app')}`;
  if (m.kind === 'image') return `<img src="${esc(m.url)}" alt="" data-try>${ok('Imagen · sale en la tarjeta y en el temporizador')}`;
  return `<img src="${esc(m.url)}" alt="" data-try><span>Se intentará mostrar como imagen. Si no se puede, Papá verá un botón para abrir el enlace.</span>`;
}
/* Bring a saved link into the editor when the exercise name already has one. */
function prepEx(ex) { if (!String(ex.video || '').trim() && libLink(ex)) ex.video = libLink(ex); ex._had = String(ex.video || '').trim(); return ex; }

/* ---------- toast ---------- */
let toastT;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3400); }

/* ---------- writes (one at a time per document) ---------- */
const chains = {};
function errMsg(e) {
  const c = e && e.code;
  if (c === 'invalid_argument') return 'No se ha podido guardar. Recarga la página y vuelve a intentarlo.';
  if (c === 'quota_exceeded') return 'Se ha llenado el espacio de datos. Borra semanas antiguas y vuelve a intentarlo.';
  return 'No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.';
}
function write(path, fn) {
  if (!S.db) { toast('Los datos no están disponibles aquí.'); return Promise.reject(new Error('nodb')); }
  const ref = S.db.doc(path);
  const run = (chains[path] || Promise.resolve()).catch(() => {}).then(async () => {
    try { return await fn(ref); }
    catch (e) {
      if (e && e.code === 'unavailable') { await new Promise(r => setTimeout(r, 600 + Math.random() * 800)); return fn(ref); }
      throw e;
    }
  });
  chains[path] = run;
  return run.catch(e => { toast(errMsg(e)); throw e; });
}

/* ---------- helpers ---------- */
function findWorkout(wid) {
  for (const w of S.weeks) for (const x of (w.workouts || [])) if (x.id === wid) return { week: w, workout: x };
  return null;
}
function weekDone(w) { const list = w.workouts || []; return { done: list.filter(x => S.feedback[x.id]).length, total: list.length }; }
function defaultWeekIdx() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  let i = S.weeks.findIndex(w => { const d = parseD(w.startDate); if (!d) return false; const e = new Date(d); e.setDate(e.getDate() + 7); return t >= d && t < e; });
  if (i < 0) i = S.weeks.findIndex(w => (w.workouts || []).some(x => !S.feedback[x.id]));
  if (i < 0) i = S.weeks.length - 1;
  return Math.max(0, i);
}
const safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '';
function parseRest(s) {
  const t = fold(s).replace(',', '.');
  let m = t.match(/(\d+):(\d{1,2})/); if (m) return (+m[1]) * 60 + (+m[2]);
  m = t.match(/(\d+(?:\.\d+)?)\s*(min|mn|m\b|')/); if (m) return Math.round(parseFloat(m[1]) * 60);
  m = t.match(/(\d+)/); if (m) return +m[1];
  return 60;
}
const fmtSec = s => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

/* ---------- render (deferred while typing or watching a video) ---------- */
let pending = false;
function busy() {
  if ([...$app.querySelectorAll('video')].some(v => !v.paused && !v.ended)) return true;
  if ($app.querySelector('.vidbox iframe')) return true;
  const a = document.activeElement;
  return a && $app.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'file'].includes(a.type)));
}
function render(force) {
  if (!force && busy()) { pending = true; return; }
  pending = false;
  document.body.classList.toggle('m-athlete', S.mode === 'athlete');
  document.body.classList.toggle('m-coach', S.mode === 'coach');
  document.getElementById('brand').innerHTML = S.mode === 'coach' ? 'Plan de Papá<small>PÁGINA DEL ENTRENADOR</small>' : 'Plan de Papá';
  document.getElementById('hdr').innerHTML = S.mode === 'coach' ? `<a class="hact" href="./">${ic('play')}Ver la de Papá</a>` : '';
  let dock = '';
  if (S.status === 'nodb') {
    $app.innerHTML = `<div class="wrap section"><div class="empty"><h2>No se pueden cargar los datos</h2><p class="muted">No hay conexión con la base de datos. Revisa la conexión a internet y vuelve a abrir la página.</p></div></div>`;
  } else if (!S.mode || !S.gotWeeks || !S.gotFb) {
    $app.innerHTML = `<div class="wrap section"><p class="muted">Cargando la programación…</p></div>`;
  } else if (S.mode === 'coach') {
    const r = renderCoach(); $app.innerHTML = r.html; dock = r.dock || '';
  } else {
    const r = renderAthlete(); $app.innerHTML = r.html; dock = r.dock || '';
  }
  $dock.innerHTML = dock;
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));
['pause', 'ended'].forEach(ev => document.addEventListener(ev, () => setTimeout(() => { if (pending) render(); }, 0), true));

/* ================= HIIT ================= */
const HD = { work: 40, rest: 20, sets: 3, reps: 1, setRest: 60, prep: 10 };
function hiitCfg(x) {
  const h = (x && x.hiit) || {};
  const n = (v, d) => { const k = parseInt(v, 10); return Number.isFinite(k) && k >= 0 ? Math.min(k, 3600) : d; };
  return { on: !!h.on, work: Math.max(5, n(h.work, HD.work)), rest: n(h.rest, HD.rest), sets: Math.max(1, Math.min(30, n(h.sets, HD.sets))), reps: Math.max(1, Math.min(30, n(h.reps, HD.reps))), setRest: n(h.setRest, HD.setRest), prep: n(h.prep, HD.prep) };
}
/* Order: for each series, for each exercise, `reps` work/rest intervals; between series the long rest. `ex` on a rest phase is the exercise coming next. */
function hiitPlan(cfg, n) {
  const P = []; if (!n) return P;
  if (cfg.prep) P.push({ t: 'prep', d: cfg.prep, ex: 0, set: 1, rep: 1 });
  for (let s = 1; s <= cfg.sets; s++) for (let i = 0; i < n; i++) for (let r = 1; r <= cfg.reps; r++) {
    P.push({ t: 'work', d: cfg.work, ex: i, set: s, rep: r });
    const endOfSet = i === n - 1 && r === cfg.reps;
    if (endOfSet && s === cfg.sets) continue;
    if (endOfSet) { const d = cfg.setRest || cfg.rest; if (d) P.push({ t: cfg.setRest ? 'setrest' : 'rest', d, ex: 0, set: s + 1, rep: 1 }); }
    else if (cfg.rest) P.push({ t: 'rest', d: cfg.rest, ex: r < cfg.reps ? i : i + 1, set: s, rep: r < cfg.reps ? r + 1 : 1 });
  }
  return P;
}
const planTotal = P => P.reduce((a, p) => a + p.d, 0);
const fmtLong = s => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : fmtSec(s); };

const $h = document.getElementById('hiit');
const H = { bad: new Set(), fsrc: '', P: [], i: 0, end: 0, left: 0, paused: false, done: false, int: null, exs: [], cfg: null, wid: null, beep: null, armed: false, armT: null, vsrc: '' };
function tone(freq, dur) {
  try { const ctx = T.audio; if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; g.gain.value = 0.2; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur); } catch {}
}
const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
function hiitStart(wid) {
  const f = findWorkout(wid); if (!f) return;
  const exs = (f.workout.exercises || []).filter(e => e.name), cfg = hiitCfg(f.workout);
  const P = hiitPlan(cfg, exs.length);
  if (!P.length) { toast('Este entreno no tiene ejercicios.'); return; }
  try { T.audio = T.audio || new (window.AudioContext || window.webkitAudioContext)(); T.audio.resume && T.audio.resume(); } catch {}
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => H.lock = l).catch(() => {}); } catch {}
  Object.assign(H, { P, exs, cfg, wid, done: false, armed: false, vsrc: '', isrc: '', fsrc: '' });
  document.getElementById('h-dots').innerHTML = Array.from({ length: cfg.sets }, () => '<i></i>').join('');
  $h.hidden = false; document.documentElement.style.overflow = 'hidden';
  hiitGo(0);
  clearInterval(H.int); H.int = setInterval(hiitTick, 200);
}
function hiitGo(i, carry) {
  H.i = i; H.beep = null;
  H.end = carry != null ? carry + H.P[i].d * 1000 : Date.now() + H.P[i].d * 1000;
  H.left = H.end - Date.now();
  if (H.paused) H.left = H.P[i].d * 1000;
  hiitPaint();
}
function hiitTick() {
  if (H.paused || H.done) return;
  const now = Date.now();
  let changed = false;
  while (H.end <= now) {
    if (H.i >= H.P.length - 1) return hiitFinish();
    const prevEnd = H.end; H.i++; H.end = prevEnd + H.P[H.i].d * 1000; H.beep = null; changed = true;
  }
  H.left = H.end - now;
  if (changed) { const t = H.P[H.i].t; tone(t === 'work' ? 990 : 520, 0.4); vib(t === 'work' ? [300] : [150, 80, 150]); }
  const s = Math.ceil(H.left / 1000);
  if (s >= 1 && s <= 3 && H.beep !== s) { H.beep = s; tone(700, 0.1); }
  hiitPaint();
}
/* Timer picture: uploaded image, then a linked image, then uploaded video, linked video, and last a muted looping YouTube/Vimeo/Drive player. */
function timerMedia(ex) {
  const im = exImage(ex); if (im) return { t: 'img', src: mediaUrl(im) };
  const m = parseMedia(exLink(ex));
  if (m && (m.kind === 'image' || m.kind === 'link') && !H.bad.has(m.url)) return { t: 'img', src: m.url, try: true };
  const va = exVideo(ex); if (va) return { t: 'video', src: mediaUrl(va) };
  if (m && m.kind === 'video') return { t: 'video', src: m.url };
  if (m && (m.kind === 'youtube' || m.kind === 'vimeo' || m.kind === 'drive')) return { t: 'frame', src: embedSrc(m, { autoplay: true, muted: true, loop: true }) };
  return null;
}
const PHASE = { work: 'Trabajo', rest: 'Descanso', setrest: 'Descanso entre series', prep: 'Prepárate' };
function hiitPaint() {
  const p = H.P[H.i], ex = H.exs[p.ex] || {}, c = H.cfg;
  $h.dataset.phase = p.t;
  const sec = Math.max(0, Math.ceil(H.left / 1000));
  document.getElementById('h-time').textContent = sec >= 60 ? fmtSec(sec) : String(sec);
  document.getElementById('h-phase').textContent = H.paused ? 'En pausa' : PHASE[p.t];
  document.getElementById('h-pos').textContent = `Serie ${p.set} de ${c.sets} · Ejercicio ${p.ex + 1} de ${H.exs.length}${c.reps > 1 ? ` · Ronda ${p.rep}/${c.reps}` : ''}`;
  document.querySelectorAll('#h-dots i').forEach((d, k) => d.classList.toggle('on', k < p.set - (p.t === 'setrest' ? 1 : 0) || (k === p.set - 1 && p.t !== 'setrest')));
  document.getElementById('h-next').textContent = p.t === 'work' ? 'Ahora' : 'Siguiente';
  document.getElementById('h-ex').textContent = ex.name || '';
  document.getElementById('h-sub').textContent = p.t === 'setrest' ? `Serie ${p.set} de ${c.sets} a continuación` : [ex.load, ex.notes].filter(Boolean).join(' · ');
  const tm = timerMedia(ex), box = document.getElementById('h-vid'), v = document.getElementById('h-video'), img = document.getElementById('h-img'), fr = document.getElementById('h-frame');
  box.hidden = !tm;
  img.hidden = !(tm && tm.t === 'img');
  if (tm && tm.t === 'img' && H.isrc !== tm.src) { H.isrc = tm.src; if (tm.try) img.setAttribute('data-try', ''); else img.removeAttribute('data-try'); img.src = tm.src; img.alt = ex.name || ''; }
  v.hidden = !(tm && tm.t === 'video');
  if (tm && tm.t === 'video') { if (H.vsrc !== tm.src) { H.vsrc = tm.src; v.src = tm.src; } if (v.paused) v.play().catch(() => {}); }
  else if (H.vsrc) { H.vsrc = ''; v.pause(); v.removeAttribute('src'); v.load(); }
  fr.hidden = !(tm && tm.t === 'frame');
  if (tm && tm.t === 'frame') { if (H.fsrc !== tm.src) { H.fsrc = tm.src; fr.src = tm.src; } }
  else if (H.fsrc) { H.fsrc = ''; fr.src = 'about:blank'; }
  const total = planTotal(H.P), el = H.P.slice(0, H.i).reduce((a, q) => a + q.d, 0) + (p.d - H.left / 1000);
  document.getElementById('h-el').textContent = fmtLong(el);
  document.getElementById('h-left').textContent = `quedan ${fmtLong(total - el)}`;
  document.getElementById('h-bar').style.width = Math.min(100, el / total * 100).toFixed(1) + '%';
  const ctrl = document.getElementById('h-ctrl');
  const want = H.paused ? 'paused' : 'run';
  if (ctrl.dataset.s !== want) {
    ctrl.dataset.s = want; ctrl.classList.remove('fin');
    ctrl.innerHTML = `<button type="button" data-h="prev" aria-label="Volver al intervalo anterior">${ic('back')}Atrás</button>
      <button type="button" class="main" data-h="pause">${H.paused ? `${ic('play')}Seguir` : `<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>Pausa`}</button>
      <button type="button" data-h="next" aria-label="Saltar al siguiente intervalo">Saltar${ic('next')}</button>`;
  }
}
function hiitFinish() {
  H.done = true; clearInterval(H.int);
  tone(990, 0.25); setTimeout(() => tone(1320, 0.5), 280); vib([200, 100, 200, 100, 400]);
  $h.dataset.phase = 'done';
  const total = planTotal(H.P);
  document.getElementById('h-phase').textContent = '¡HIIT completado!';
  document.getElementById('h-time').textContent = fmtLong(total);
  document.getElementById('h-next').textContent = 'Tiempo total';
  document.getElementById('h-ex').textContent = 'Buen trabajo';
  document.getElementById('h-sub').textContent = 'Al cerrar, los ejercicios quedan marcados como hechos. Cuéntale a tu entrenador cómo te ha ido.';
  document.getElementById('h-pos').textContent = `${H.cfg.sets} series terminadas`;
  document.querySelectorAll('#h-dots i').forEach(d => d.classList.add('on'));
  document.getElementById('h-vid').hidden = true; document.getElementById('h-video').pause(); document.getElementById('h-frame').src = 'about:blank'; H.fsrc = '';
  document.getElementById('h-bar').style.width = '100%';
  document.getElementById('h-left').textContent = 'quedan 0:00'; document.getElementById('h-el').textContent = fmtLong(total);
  const ctrl = document.getElementById('h-ctrl'); ctrl.dataset.s = 'fin'; ctrl.classList.add('fin');
  ctrl.innerHTML = `<button type="button" class="main" data-h="finish">${ic('check')}Terminar</button>`;
  if (!S.feedback[H.wid] || S.editFb === H.wid) {
    const d = getDraft(H.wid); H.exs.forEach(e => d.checks[e.id] = true); saveDraft(H.wid, d);
  }
}
function hiitClose() {
  clearInterval(H.int); H.int = null; $h.hidden = true; document.documentElement.style.overflow = '';
  const v = document.getElementById('h-video'); v.pause();
  document.getElementById('h-frame').src = 'about:blank'; H.fsrc = '';
  try { H.lock && H.lock.release(); } catch {} H.lock = null;
  const wasDone = H.done; H.paused = false; H.done = false;
  render(true);
  if (wasDone) setTimeout(() => document.getElementById('fb')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}
document.getElementById('h-ctrl').addEventListener('click', e => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  const a = b.dataset.h;
  if (a === 'finish') return hiitClose();
  if (a === 'pause') {
    if (H.paused) { H.paused = false; H.end = Date.now() + H.left; }
    else { H.paused = true; H.left = H.end - Date.now(); }
    return hiitPaint();
  }
  if (a === 'next') { if (H.i >= H.P.length - 1) return hiitFinish(); return hiitGo(H.i + 1); }
  if (a === 'prev') {
    const elapsed = H.P[H.i].d * 1000 - (H.paused ? H.left : H.end - Date.now());
    return hiitGo(elapsed > 2500 || H.i === 0 ? H.i : H.i - 1);
  }
});
document.getElementById('h-close').addEventListener('click', () => {
  const b = document.getElementById('h-close');
  if (H.done || H.armed) { clearTimeout(H.armT); H.armed = false; b.textContent = 'Salir'; return hiitClose(); }
  H.armed = true; b.textContent = '¿Salir? Toca otra vez';
  clearTimeout(H.armT); H.armT = setTimeout(() => { H.armed = false; b.textContent = 'Salir'; }, 3000);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$h.hidden && !H.done) { hiitTick(); try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => H.lock = l).catch(() => {}); } catch {} } });

function hiitSummary(cfg, n) {
  const total = planTotal(hiitPlan(cfg, n));
  return `<div class="hplan">
    <div class="w"><small>Trabajo</small><b>${cfg.work} s</b></div>
    <div class="r"><small>Descanso</small><b>${cfg.rest} s</b></div>
    <div><small>Series</small><b>${cfg.sets}${cfg.reps > 1 ? ` <span style="font-size:16px">× ${cfg.reps} rondas</span>` : ''}</b></div>
    <div class="sr"><small>Entre series</small><b>${cfg.setRest} s</b></div>
  </div><p class="muted" style="font-size:15px">${n} ejercicio${n === 1 ? '' : 's'} por serie · duración total <b class="mono" style="color:var(--ink)">${fmtLong(total)}</b></p>`;
}

/* ================= RUNS ================= */
/* A run is planned (done: false) or done, with time (durationSec) and distance (km). Stored in the runs table. */
const parseKm = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
const fmtKm = n => n == null ? '' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const todayIso = () => isoD(new Date());
const WDS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const dayShort = s => { const d = parseD(s); return d ? `${WDS[(d.getDay() + 6) % 7]} ${d.getDate()}` : ''; };
const fmtDayLong = s => { const d = parseD(s); if (!d) return ''; const t = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', ''); return t.charAt(0).toUpperCase() + t.slice(1); };
function inWeekStart(start, dateStr) { const d = parseD(dateStr); if (!start || !d) return false; const e = new Date(start); e.setDate(e.getDate() + 7); return d >= start && d < e; }
const inWeek = (w, dateStr) => inWeekStart(parseD(w && w.startDate), dateStr);
const runsFrom = start => Object.values(S.runs).filter(r => inWeekStart(start, r.date)).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
const runPace = r => (r.durationSec > 0 && r.km > 0) ? fmtSec(Math.round(r.durationSec / r.km)) : '';
const runHeadline = r => r.km ? `${fmtKm(r.km)} km${r.durationSec ? ` en ${fmtLong(r.durationSec)}` : ''}` : r.durationSec ? `${fmtLong(r.durationSec)} corriendo` : 'Carrera';
function paceText(d) {
  const n = v => { const k = parseInt(v, 10); return Number.isFinite(k) && k > 0 ? k : 0; };
  const dur = n(d.h) * 3600 + n(d.m) * 60 + n(d.s), km = parseKm(d.km);
  return dur && km ? `Ritmo: <b>${fmtSec(Math.round(dur / km))}</b> por km` : 'Pon tiempo y distancia y verás tu ritmo por kilómetro.';
}
function runCard(r) {
  const past = String(r.date) <= todayIso();
  const body = r.done
    ? `<span class="rbig">${esc(runHeadline(r))}</span><span class="wmeta">${runPace(r) ? `<span>${ic('timer')}${runPace(r)} /km</span>` : ''}${r.feeling ? `<span>${esc(FEEL[r.feeling] || '')}</span>` : ''}</span>`
    : `<span class="rbig">Voy a correr</span><span class="wmeta"><span>${past ? 'Toca para apuntar tiempo y distancia' : esc(r.comment || 'Planificada')}</span></span>`;
  return `<button type="button" class="rcard ${r.done ? 'is-done' : 'planned'}" data-act="runopen" data-id="${esc(r.id)}">
    <span class="rday"><small>${esc(WDS[(parseD(r.date).getDay() + 6) % 7])}</small><b>${parseD(r.date).getDate()}</b></span>
    <span class="wbody">${body}${r.coachReply ? `<span><span class="chip reply">${ic('chat')}Tu entrenador te ha respondido</span></span>` : ''}</span>
    <span class="wstate">${r.done ? ic('check') : ic('next')}</span>
  </button>`;
}
function runSection(start) {
  const list = runsFrom(start), km = list.filter(r => r.done).reduce((a, r) => a + (r.km || 0), 0);
  return `<section class="runsec" aria-labelledby="runh">
    <div class="headrow"><div><span class="eyebrow">${km ? `${fmtKm(km)} km esta semana` : 'Esta semana'}</span><h2 id="runh">Carreras</h2></div>
      <button type="button" class="btn runbtn" data-act="runnew" ${S.canWrite ? '' : 'disabled'}>${ic('plus')}Añadir</button></div>
    ${list.map(runCard).join('') || `<div class="empty"><span class="runicon">${ic('run')}</span><p class="muted">Apunta los días que vas a correr. Cuando vuelvas, pon el tiempo y la distancia.</p></div>`}
  </section>`;
}
function runDraftFrom(r) {
  const s = r.durationSec || 0;
  return { id: r.id, date: r.date, done: !!r.done, h: s >= 3600 ? String(Math.floor(s / 3600)) : '', m: s ? String(Math.floor(s % 3600 / 60)) : '', s: s % 60 ? String(s % 60) : '', km: r.km ? fmtKm(r.km) : '', feeling: r.feeling || null, comment: r.comment || '' };
}
function defaultRunDate() {
  const w = S.weeks[S.weekIdx], t = todayIso();
  return !w || !parseD(w.startDate) || inWeek(w, t) ? t : w.startDate;
}
function renderRunForm(ro) {
  const d = S.runDraft, prev = S.runs[d.id], armed = S.armed === 'run:' + d.id;
  const num = (k, label, ph, max) => `<label class="f"><span>${label}</span><input class="inp" id="run-${k}" data-run="${k}" type="number" inputmode="numeric" min="0" max="${max}" value="${esc(d[k])}" placeholder="${ph}"></label>`;
  const chat = prev && ((prev.done && prev.comment) || prev.coachReply) ? `<section class="fbcard"><div class="chat">
      ${prev.done && prev.comment ? `<div class="bubble right"><span class="who">Tú</span>${esc(prev.comment)}</div>` : ''}
      ${prev.coachReply ? `<div class="bubble left"><span class="who">Entrenador</span>${esc(prev.coachReply)}</div>` : ''}</div></section>` : '';
  return { html: `<section class="dhead"><div class="wrap">
      <button type="button" class="backbtn" data-act="runback">${ic('back')}Volver</button>
      <div><div class="eyebrow">Carrera</div><h1>${prev ? esc(fmtDayLong(prev.date)) : 'Nueva carrera'}</h1></div>
    </div></section>
    <div class="wrap section stack">${ro}
      <section class="fbcard">
        <label class="f"><span>Día</span><input class="inp" type="date" id="run-date" data-run="date" value="${esc(d.date)}"></label>
        <span class="lbl2">¿Ya has corrido?</span>
        <div class="seg2">
          <button type="button" data-act="rundone" data-v="1" aria-pressed="${!!d.done}">${ic('check')}Ya he corrido</button>
          <button type="button" data-act="rundone" data-v="0" aria-pressed="${!d.done}">${ic('cal')}Voy a correr</button>
        </div>
        ${d.done ? `
        <span class="lbl2">Tiempo</span>
        <div class="durin">${num('h', 'Horas', '0', 24)}${num('m', 'Minutos', '30', 59)}${num('s', 'Segundos', '0', 59)}</div>
        <span class="lbl2">Distancia</span>
        <div class="kmrow"><input class="inp" id="run-km" data-run="km" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.km)}" placeholder="5,0" aria-label="Distancia en kilómetros"><b>km</b></div>
        <div class="kmchips">${[3, 5, 8, 10].map(k => `<button type="button" data-act="runkm" data-km="${k}">${k} km</button>`).join('')}</div>
        <p class="pace" id="run-pace">${paceText(d)}</p>
        <span class="lbl2">¿Cómo te has sentido?</span>
        <div class="faces">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="f${n}" data-act="runfeel" data-n="${n}" aria-pressed="${d.feeling === n}" aria-label="${FEEL[n]}">${face(n)}<small>${FEEL[n]}</small></button>`).join('')}</div>
        <label class="f"><span>Comentario para tu entrenador (opcional)</span><textarea class="inp" id="run-comment" data-run="comment" rows="3" placeholder="Por dónde has ido, cómo te has notado…">${esc(d.comment)}</textarea></label>`
        : `<p class="muted">Apunta el día. Cuando vuelvas de correr, entra aquí y pon el tiempo y la distancia.</p>
        <label class="f"><span>Nota (opcional)</span><input class="inp" id="run-note" data-run="comment" value="${esc(d.comment)}" placeholder="Ej.: rodaje suave de 30 min"></label>`}
        <button type="button" class="btn big runbtn" data-act="runsave" ${S.canWrite ? '' : 'disabled'}>${ic('check')}${d.done ? 'Guardar carrera' : 'Apuntar el día'}</button>
        ${prev ? `<button type="button" class="btn ghost danger ${armed ? 'armed' : ''}" data-act="rundel" data-id="${esc(d.id)}" style="align-self:flex-start">${ic('trash')}${armed ? '¿Seguro? Borrar' : 'Borrar carrera'}</button>` : ''}
      </section>
      ${chat}
    </div>` };
}
async function saveRun() {
  const d = S.runDraft; if (!d) return;
  if (!parseD(d.date)) { toast('Elige el día de la carrera.'); return; }
  const n = v => { const k = parseInt(v, 10); return Number.isFinite(k) && k > 0 ? k : 0; };
  const dur = d.done ? n(d.h) * 3600 + Math.min(59, n(d.m)) * 60 + Math.min(59, n(d.s)) : 0;
  const km = d.done ? parseKm(d.km) : null;
  if (d.done && !dur && !km) { toast('Apunta el tiempo o la distancia que has corrido.'); return; }
  const prev = S.runs[d.id], now = new Date().toISOString();
  const body = {
    id: d.id, date: d.date, done: !!d.done, durationSec: dur || null, km: km || null,
    feeling: d.done ? (d.feeling || null) : null, comment: String(d.comment || '').trim(),
    createdAt: (prev && prev.createdAt) || now, updatedAt: now,
    seen: !d.done, coachReply: (prev && prev.coachReply) || '', replyAt: (prev && prev.replyAt) || null
  };
  try {
    await write('runs/' + d.id, ref => ref.set(body));
    const wi = S.weeks.findIndex(w => inWeek(w, d.date)); if (wi >= 0) S.weekIdx = wi;
    S.runOpen = null; S.runDraft = null; S.armed = null;
    toast(d.done ? '¡Carrera guardada!' : `Apuntado: ${fmtDayLong(d.date).toLowerCase()} vas a correr.`);
    render(true); window.scrollTo({ top: 0 });
  } catch {}
}
function updatePace() { const el = document.getElementById('run-pace'); if (el && S.runDraft) el.innerHTML = paceText(S.runDraft); }

/* ================= HISTORY ================= */
const localIso = iso => { const d = new Date(iso); return isNaN(d) ? '' : isoD(d); };
/* The day a workout was done: first time it was sent (later edits keep it). */
const woDoneDate = f => localIso(f.doneAt || f.submittedAt);
function activity() {
  const m = {}, at = k => m[k] || (m[k] = { wos: [], runs: [] });
  Object.values(S.feedback).forEach(f => { const k = woDoneDate(f); if (k) at(k).wos.push(f); });
  Object.values(S.runs).forEach(r => { if (parseD(r.date)) at(r.date).runs.push(r); });
  return m;
}
function monthStats(y, mo, act) {
  const days = new Date(y, mo + 1, 0).getDate(); let wos = 0, runs = 0, km = 0, active = 0;
  for (let d = 1; d <= days; d++) {
    const a = act[isoD(new Date(y, mo, d))]; if (!a) continue;
    const dr = a.runs.filter(r => r.done);
    wos += a.wos.length; runs += dr.length; km += dr.reduce((s, r) => s + (r.km || 0), 0);
    if (a.wos.length || dr.length) active++;
  }
  return { wos, runs, km, active };
}
function histDetail(k, act, coach) {
  const a = act[k] || { wos: [], runs: [] }, today = todayIso();
  if (!a.wos.length && !a.runs.length) return `<p class="muted">${esc(fmtDayLong(k))}: ${k > today ? 'nada apuntado todavía.' : 'día de descanso.'}</p>`;
  const wos = a.wos.map(f => {
    const can = !coach && findWorkout(f.workoutId), tag = can ? 'button' : 'div';
    return `<${tag} ${can ? `type="button" data-act="hopen" data-id="${esc(f.workoutId)}"` : ''} class="hitem">${face(f.feeling)}
      <span class="wbody"><span class="h3">${esc(f.workoutTitle || 'Entreno')}</span>
      <span class="wmeta"><span>${esc(FEEL[f.feeling] || '')}</span>${f.rpe ? `<span>Esfuerzo ${f.rpe}/10</span>` : ''}${f.minutes ? `<span>${ic('timer')}${f.minutes} min</span>` : ''}${f.weekTitle ? `<span>${esc(f.weekTitle)}</span>` : ''}</span></span>
      ${can ? ic('next') : ''}</${tag}>`;
  }).join('');
  const runs = a.runs.map(r => {
    const tag = coach ? 'div' : 'button';
    return `<${tag} ${coach ? '' : `type="button" data-act="runopen" data-id="${esc(r.id)}"`} class="hitem ${r.done ? '' : 'planned'}"><span class="runicon">${ic('run')}</span>
      <span class="wbody"><span class="h3">${esc(r.done ? runHeadline(r) : 'Carrera planificada')}</span>
      <span class="wmeta">${runPace(r) ? `<span>${runPace(r)} /km</span>` : ''}${r.feeling ? `<span>${esc(FEEL[r.feeling])}</span>` : ''}${!r.done && r.comment ? `<span>${esc(r.comment)}</span>` : ''}</span></span>
      ${coach ? '' : ic('next')}</${tag}>`;
  }).join('');
  return `<span class="eyebrow">${esc(fmtDayLong(k))}</span>${wos}${runs}`;
}
function historyCalendar(coach) {
  const now = new Date();
  if (!S.histMonth) S.histMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const m0 = S.histMonth, y = m0.getFullYear(), mo = m0.getMonth(), act = activity(), today = todayIso();
  const days = new Date(y, mo + 1, 0).getDate(), lead = (m0.getDay() + 6) % 7;
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span aria-hidden="true"></span>';
  for (let d = 1; d <= days; d++) {
    const k = isoD(new Date(y, mo, d)), a = act[k] || { wos: [], runs: [] };
    const dr = a.runs.filter(r => r.done), pr = a.runs.filter(r => !r.done), did = a.wos.length || dr.length;
    const say = [a.wos.length && `${a.wos.length} entreno${a.wos.length > 1 ? 's' : ''}`, dr.length && `${dr.length} carrera${dr.length > 1 ? 's' : ''}`, pr.length && 'carrera planificada'].filter(Boolean).join(', ');
    cells += `<button type="button" class="cal-d ${did ? 'did' : ''} ${k === today ? 'today' : ''} ${S.histDay === k ? 'sel' : ''} ${k > today ? 'future' : ''}" data-act="hday" data-d="${k}" aria-label="${d}${say ? ': ' + say : ''}" aria-pressed="${S.histDay === k}">
      <span class="n">${d}</span><span class="mk">${a.wos.length ? `<i class="wo">${ic('weight')}</i>` : ''}${dr.length ? `<i class="ru">${ic('run')}</i>` : pr.length ? `<i class="ru plan">${ic('run')}</i>` : ''}</span></button>`;
  }
  const title = (t => t.charAt(0).toUpperCase() + t.slice(1))(m0.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
  const sel = S.histDay && S.histDay.slice(0, 7) === isoD(m0).slice(0, 7) ? S.histDay : (today.slice(0, 7) === isoD(m0).slice(0, 7) ? today : null);
  return {
    stats: monthStats(y, mo, act),
    html: `<section class="calcard" aria-label="Calendario">
      <div class="cal-nav"><button type="button" data-act="hmon" data-d="-1" aria-label="Mes anterior">${ic('back')}</button><h3>${esc(title)}</h3><button type="button" data-act="hmon" data-d="1" aria-label="Mes siguiente">${ic('next')}</button></div>
      <div class="cal-grid">${DAYL.map(l => `<span class="cal-h">${l}</span>`).join('')}${cells}</div>
      <div class="cal-legend"><span><i class="wo">${ic('weight')}</i>Entreno</span><span><i class="ru">${ic('run')}</i>Carrera</span><span><i class="ru plan">${ic('run')}</i>Planificada</span></div>
    </section>
    <section class="stack" aria-live="polite">${sel ? histDetail(sel, act, coach) : `<p class="muted">Toca un día para ver lo que ${coach ? 'hizo' : 'hiciste'}.</p>`}</section>`
  };
}
const statText = s => [`<span><b>${s.active}</b>día${s.active === 1 ? '' : 's'} activo${s.active === 1 ? '' : 's'}</span>`, `<span><b>${s.wos}</b>entreno${s.wos === 1 ? '' : 's'}</span>`, `<span><b>${s.runs}</b>carrera${s.runs === 1 ? '' : 's'}</span>`, s.km ? `<span><b>${fmtKm(s.km)}</b>km</span>` : ''].join('');
const athTabs = () => `<nav class="dock tabbar" aria-label="Secciones"><div class="wrap" role="tablist">
  <button type="button" role="tab" id="atab-week" aria-selected="${S.atab !== 'hist'}" data-act="atab" data-t="week">${ic('list')}Entrenos</button>
  <button type="button" role="tab" id="atab-hist" aria-selected="${S.atab === 'hist'}" data-act="atab" data-t="hist">${ic('cal')}Historial</button>
</div></nav>`;

/* ================= ATHLETE ================= */
function ring(done, total) {
  const r = 30, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return `<div class="ringbox"><svg viewBox="0 0 76 76" aria-hidden="true">
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--hero-soft)" stroke-width="8"/>
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--hero-ink)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}" transform="rotate(-90 38 38)"/>
  </svg><span class="mono-d">${done}/${total}</span></div>`;
}
function renderAthlete() {
  const ro = !S.canWrite ? `<div class="banner">Puedes ver los entrenos, pero esta cuenta no puede enviar respuestas. Pide que te inviten a la página como editor.</div>` : '';
  if (S.runOpen && S.runDraft) return renderRunForm(ro);
  if (S.open && findWorkout(S.open)) return renderWorkout(S.open, ro);
  if (S.atab === 'hist') {
    const h = historyCalendar(false);
    return { dock: athTabs(), html: `<section class="hero"><div class="wrap">
        <div><div class="eyebrow">Historial</div><h1>Lo que has hecho</h1></div>
        <div class="hstats">${statText(h.stats)}</div>
      </div></section>
      <div class="wrap section stack">${ro}${h.html}</div>` };
  }
  if (!S.weeks.length) {
    return { html: `<section class="hero"><div class="wrap"><h1>Hola, Papá</h1></div></section>
      <div class="wrap section stack">${ro}<div class="empty"><h2>Todavía no hay entrenos</h2><p class="muted">Tu entrenador está preparando la primera semana. Cuando la publique, aparecerá aquí.</p></div>
      ${runSection(mondayOf(new Date()))}</div>`, dock: athTabs() };
  }
  if (S.weekIdx == null || S.weekIdx >= S.weeks.length) S.weekIdx = defaultWeekIdx();
  if (S.open && findWorkout(S.open)) return renderWorkout(S.open, ro);
  S.open = null;
  const w = S.weeks[S.weekIdx];
  const wos = w.workouts || [];
  const { done, total } = weekDone(w);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = parseD(w.startDate);
  const weekRuns = start ? runsFrom(start) : [];
  const weekKm = weekRuns.filter(r => r.done).reduce((a, r) => a + (r.km || 0), 0);
  const act = activity();
  const strip = DAYL.map((l, i) => {
    const has = false, ok = !!(start && (act[isoD(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))] || { wos: [] }).wos.length);
    let isToday = false, num = '';
    if (start) { const d = new Date(start); d.setDate(d.getDate() + i); isToday = d.getTime() === today.getTime(); num = d.getDate(); }
    const dRuns = start ? weekRuns.filter(r => parseD(r.date).getTime() === new Date(start.getFullYear(), start.getMonth(), start.getDate() + i).getTime()) : [];
    const rmk = `<span class="rmk ${dRuns.length ? 'has' : ''} ${dRuns.some(r => r.done) ? 'on' : ''}" ${dRuns.length ? `aria-label="${dRuns.some(r => r.done) ? 'Ha corrido' : 'Va a correr'}"` : 'aria-hidden="true"'}>${ic('run')}</span>`;
    return `<div class="dcell ${has ? 'has' : ''} ${ok ? 'done' : ''} ${isToday ? 'today' : ''}"><span class="lbl">${l}</span><span class="dot">${ok ? ic('check') : `<span class="mono">${num}</span>`}</span>${rmk}</div>`;
  }).join('');
  const msg = total === 0 ? 'Semana sin entrenos' : done === total ? '¡Semana completada!' : done === 0 ? `${total} entreno${total === 1 ? '' : 's'} esta semana` : `Llevas ${done} de ${total}`;

  const nextId = (wos.find(x => !S.feedback[x.id]) || {}).id;
  const cards = wos.map((x, oi) => {
    const fb = S.feedback[x.id];
    const n = (x.exercises || []).filter(e => e.name).length;
    const vids = (x.exercises || []).filter(e => e.name && cardVideo(e)).length;
    return `<button type="button" class="wcard ${fb ? 'is-done' : ''}" data-act="open" data-id="${esc(x.id)}">
      <span class="wday"><small>Nº</small><b>${oi + 1}</b></span>
      <span class="wbody">${x.id === nextId ? `<span><span class="chip next">${ic('play')}Siguiente</span></span>` : ''}<span class="h3">${esc(x.title || 'Entreno')}</span>
        ${fb ? `<span class="wmeta"><span>${ic('check')}Hecho el ${esc(dayShort(woDoneDate(fb)).toLowerCase())}</span></span>` : ''}
        <span class="wmeta">${hiitCfg(x).on ? `<span class="hiit-tag">${ic('flame')}HIIT · ${fmtLong(planTotal(hiitPlan(hiitCfg(x), n)))}</span>` : ''}<span>${ic('list')}${n} ejercicio${n === 1 ? '' : 's'}</span>${vids ? `<span>${ic('play')}${vids} vídeo${vids === 1 ? '' : 's'}</span>` : ''}${x.format ? `<span>${ic('repeat')}${esc(x.format.split(/[·,]/)[0].trim())}</span>` : ''}</span>
        ${fb && fb.coachReply ? `<span><span class="chip reply">${ic('chat')}Tu entrenador te ha respondido</span></span>` : ''}
      </span>
      <span class="wstate">${fb ? ic('check') : ic('next')}</span>
    </button>`;
  }).join('');

  return { html: `<section class="hero"><div class="wrap">
      <div class="weeknav">
        <button type="button" class="arrow" data-act="wk" data-d="-1" aria-label="Semana anterior" ${S.weekIdx === 0 ? 'disabled' : ''}>${ic('back')}</button>
        <div class="mid"><div class="eyebrow">${esc(weekRange(w.startDate) || `Semana ${S.weekIdx + 1} de ${S.weeks.length}`)}</div><h1>${esc(w.title || 'Semana')}</h1></div>
        <button type="button" class="arrow" data-act="wk" data-d="1" aria-label="Semana siguiente" ${S.weekIdx === S.weeks.length - 1 ? 'disabled' : ''}>${ic('next')}</button>
      </div>
      <div class="hero-row">${ring(done, total)}<div class="txt"><span class="big">${msg}</span>${weekKm ? `<span class="runsum">${ic('run')}${fmtKm(weekKm)} km corridos</span>` : ''}${w.focus ? `<span class="focus">${esc(w.focus)}</span>` : ''}</div></div>
      ${start ? `<div class="days" aria-label="Días de la semana">${strip}</div>` : ''}
    </div></section>
    <div class="wrap section stack">${ro}${cards || `<p class="muted">Esta semana no tiene entrenos.</p>`}
      ${start ? runSection(start) : ''}</div>`, dock: athTabs() };
}

function getDraft(wid) {
  const d = ls.get('draft:' + wid, null);
  if (d) return d;
  const fb = S.feedback[wid];
  if (fb) {
    const checks = {}, notes = {};
    for (const [k, v] of Object.entries(fb.exercises || {})) { checks[k] = !!v.done; if (v.note) notes[k] = v.note; }
    return { checks, notes, feeling: fb.feeling || null, rpe: fb.rpe || null, minutes: fb.minutes ?? '', comment: fb.comment || '' };
  }
  return { checks: {}, notes: {}, feeling: null, rpe: null, minutes: '', comment: '' };
}
const saveDraft = (wid, d) => ls.set('draft:' + wid, d);

function renderWorkout(wid, ro) {
  const { week, workout: x } = findWorkout(wid);
  const fb = S.feedback[wid];
  const editing = !fb || S.editFb === wid;
  const d = getDraft(wid);
  const exs = (x.exercises || []).filter(e => e.name);
  const hc = hiitCfg(x);
  const checkedN = exs.filter(e => editing ? d.checks[e.id] : fb.exercises && fb.exercises[e.id] && fb.exercises[e.id].done).length;

  const exHtml = exs.map((e, i) => {
    const on = editing ? !!d.checks[e.id] : !!(fb.exercises && fb.exercises[e.id] && fb.exercises[e.id].done);
    const myNote = editing ? (d.notes[e.id] || '') : (fb.exercises && fb.exercises[e.id] && fb.exercises[e.id].note) || '';
    const ci = cardImage(e), cv = cardVideo(e), lm = parseMedia(exLink(e)), vOpen = !!cv && S.vidOpen.has(e.id);
    const thumb = !vOpen && !ci && cv && cv.kind === 'embed' && cv.m.kind === 'youtube';
    const pills = [];
    if (hc.on) pills.push(`<span class="pill">${ic('timer')}<b>${hc.work} s</b><small>${hc.reps > 1 ? `× ${hc.reps} · ` : ''}trabajo</small></span>`);
    else if (e.sets || e.reps) pills.push(`<span class="pill">${ic('repeat')}<b>${e.sets && e.reps ? `${esc(e.sets)} × ${esc(e.reps)}` : e.sets ? `${esc(e.sets)} series` : esc(e.reps)}</b></span>`);
    if (e.load) pills.push(`<span class="pill">${ic('weight')}<b>${esc(e.load)}</b></span>`);
    if (e.rest && !hc.on) pills.push(`<button type="button" class="pill" data-act="timer" data-sec="${parseRest(e.rest)}" data-name="${esc(e.name)}" aria-label="Empezar descanso de ${esc(e.rest)}">${ic('timer')}<b>${esc(e.rest)}</b><small>Iniciar</small></button>`);
    return `<article class="xcard ${on ? 'checked' : ''}" id="ex-${esc(e.id)}">
      <div class="xtop"><span class="xnum">${i + 1}</span><h3>${esc(e.name)}</h3></div>
      ${ci && !vOpen ? `<img class="ximg" src="${esc(ci.src)}" alt="${esc(e.name)}" loading="lazy"${ci.try ? ' data-try' : ''}>` : ''}
      ${thumb ? `<button type="button" class="ythumb" data-act="vid" data-id="${esc(e.id)}" aria-label="Ver vídeo de ${esc(e.name)}"><img src="${esc(ytThumb(cv.m))}" alt="" loading="lazy"><span class="pb"><span>${ic('play')}</span></span></button>` : ''}
      ${pills.length ? `<div class="pills">${pills.join('')}</div>` : ''}
      ${e.notes ? `<p class="xnote">${esc(e.notes)}</p>` : ''}
      ${vOpen ? playerHtml(cv, e) : ''}
      ${((cv && !thumb) || vOpen || lm) ? `<div class="xlinks">
        ${cv && (!thumb || vOpen) ? `<button type="button" class="btn" data-act="vid" data-id="${esc(e.id)}" aria-expanded="${vOpen}">${vOpen ? `${ic('close')}${ci ? 'Ver imagen' : 'Ocultar vídeo'}` : `${ic('play')}${cv.kind === 'embed' && cv.m.kind === 'drive' ? 'Ver archivo' : 'Ver vídeo'}`}</button>` : ''}
        ${lm ? `<a class="btn ghost" href="${esc(lm.url)}" target="_blank" rel="noopener">${ic('link')}${LINKNAME[lm.kind] ? `Abrir en ${LINKNAME[lm.kind]}` : 'Abrir enlace'}</a>` : ''}
      </div>` : ''}
      ${editing ? `<details class="mynote" ${myNote ? 'open' : ''}><summary>${ic('note')}${myNote ? 'Tu nota' : 'Añadir una nota'}</summary>
          <input class="inp" id="exn-${esc(e.id)}" data-exnote="${esc(e.id)}" value="${esc(myNote)}" placeholder="Ej.: me molestó la rodilla, subí a 8 kg"></details>`
        : (myNote ? `<p class="xnote">${ic('note')} ${esc(myNote)}</p>` : '')}
      <button type="button" class="donebtn" data-act="tick" data-id="${esc(e.id)}" aria-pressed="${on}" ${editing ? '' : 'disabled'}>${ic('check')}<span>${on ? 'Hecho' : 'Marcar como hecho'}</span></button>
    </article>`;
  }).join('');

  let tail, dock = '';
  if (editing) {
    tail = `<section class="fbcard" id="fb" aria-labelledby="fbh">
      <h2 id="fbh">¿Cómo te ha ido?</h2>
      <span class="lbl2">Sensación general</span>
      <div class="faces">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="f${n}" data-act="feel" data-n="${n}" aria-pressed="${d.feeling === n}" aria-label="${FEEL[n]}">${face(n)}<small>${FEEL[n]}</small></button>`).join('')}</div>
      <span class="lbl2" style="margin-top:6px">Esfuerzo: 1 muy suave · 10 máximo</span>
      <div class="rpe">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button type="button" class="${rpeCls(n)}" data-act="rpe" data-n="${n}" aria-pressed="${d.rpe === n}" aria-label="Esfuerzo ${n}" style="height:${28 + n * 5}px">${n}</button>`).join('')}</div>
      <div class="hint" id="rpe-hint">${d.rpe ? `<b>${RPE[d.rpe]}</b> · ${RPE_HINT[d.rpe]}` : 'Toca una barra.'}</div>
      <span class="lbl2">Minutos que has tardado</span>
      <div class="stepper">
        <button type="button" data-act="min" data-d="-5" aria-label="Restar 5 minutos">−</button>
        <input class="inp" id="fb-min" type="number" inputmode="numeric" min="0" max="300" data-fb="minutes" value="${esc(d.minutes)}" placeholder="0" aria-label="Minutos">
        <button type="button" data-act="min" data-d="5" aria-label="Sumar 5 minutos">+</button>
      </div>
      <label class="f"><span>Comentarios para tu entrenador</span><textarea class="inp" id="fb-comment" data-fb="comment" rows="3" placeholder="Cómo te has sentido, qué ha costado, si algo ha dolido…">${esc(d.comment)}</textarea></label>
      <button type="button" class="btn primary big" data-act="send" ${S.canWrite ? '' : 'disabled'}>${ic('send')}${fb ? 'Guardar cambios' : 'Enviar al entrenador'}</button>
      ${fb ? `<button type="button" class="btn ghost" data-act="cancelfb">Cancelar</button>` : ''}
    </section>`;
    dock = `<div class="dock"><div class="wrap">
      <span class="count"><b id="ab-count">${checkedN}/${exs.length}</b> ejercicios hechos</span>
      <button type="button" class="btn primary" data-act="tofb">Terminar</button></div></div>`;
  } else {
    tail = `<section class="fbcard">
      <div class="sent-head"><span class="bigcheck">${ic('check')}</span><div><h2>Entreno hecho</h2><span class="muted" style="font-size:15px">Enviado ${esc(fmtWhen(fb.submittedAt))}</span></div></div>
      <div class="stats">
        <span class="stat">${face(fb.feeling)}${FEEL[fb.feeling] || ''}</span>
        ${fb.rpe ? `<span class="stat"><span class="rpebadge ${rpeCls(fb.rpe)}">${fb.rpe}</span>${RPE[fb.rpe]}</span>` : ''}
        ${fb.minutes ? `<span class="stat">${ic('timer')}<b>${fb.minutes}</b>min</span>` : ''}
      </div>
      <div class="chat">
        ${fb.comment ? `<div class="bubble right"><span class="who">Tú</span>${esc(fb.comment)}</div>` : ''}
        ${fb.coachReply ? `<div class="bubble left"><span class="who">Entrenador</span>${esc(fb.coachReply)}</div>` : `<p class="muted" style="font-size:15px">Tu entrenador todavía no ha respondido.</p>`}
      </div>
      <button type="button" class="btn" data-act="editfb" style="align-self:flex-start" ${S.canWrite ? '' : 'disabled'}>${ic('edit')}Cambiar mi respuesta</button>
    </section>`;
  }

  return { dock, html: `<section class="dhead"><div class="wrap">
      <button type="button" class="backbtn" data-act="back">${ic('back')}${esc(week.title || 'Semana')}</button>
      <div><div class="eyebrow">Entreno ${(week.workouts || []).indexOf(x) + 1} de ${(week.workouts || []).length}</div><h1>${esc(x.title || 'Entreno')}</h1></div>
      ${x.format ? `<span class="fmt">${ic('repeat')}${esc(x.format)}</span>` : ''}
      <div class="hbar"><div class="bar"><i id="ab-bar" style="width:${exs.length ? Math.round(checkedN / exs.length * 100) : 0}%"></i></div><span class="mono" id="ab-count2">${checkedN}/${exs.length}</span></div>
    </div></section>
    <div class="wrap section stack">
      ${ro}
      ${x.warmup ? `<div class="info"><span class="icb">${ic('flame')}</span><span class="eyebrow">Calentamiento</span><p>${esc(x.warmup)}</p></div>` : ''}
      ${hc.on && exs.length ? `<section class="hiitcard"><div class="headrow"><div><span class="hiit-tag">${ic('flame')}HIIT</span><h2 style="margin-top:6px">Temporizador</h2></div></div>
        ${hiitSummary(hc, exs.length)}
        <button type="button" class="btn big go" data-act="hiit">${ic('play')}Empezar HIIT</button></section>` : ''}
      ${exHtml || '<p class="muted">Sin ejercicios.</p>'}
      ${x.notes ? `<div class="info"><span class="icb">${ic('info')}</span><span class="eyebrow">Notas del entrenador</span><p>${esc(x.notes)}</p></div>` : ''}
      ${tail}
    </div>` };
}

function updateProgress() {
  const found = findWorkout(S.open); if (!found) return;
  const exs = (found.workout.exercises || []).filter(e => e.name);
  const d = getDraft(S.open), n = exs.filter(e => d.checks[e.id]).length;
  const t = `${n}/${exs.length}`;
  ['ab-count', 'ab-count2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = t; });
  const bar = document.getElementById('ab-bar'); if (bar) bar.style.width = (exs.length ? Math.round(n / exs.length * 100) : 0) + '%';
}

async function sendFeedback(wid) {
  const found = findWorkout(wid); if (!found) return;
  const { week, workout } = found;
  const d = getDraft(wid);
  if (!d.feeling) { toast('Elige cómo te ha ido tocando una cara.'); document.getElementById('fb')?.scrollIntoView({ behavior: 'smooth' }); return; }
  const prev = S.feedback[wid];
  const mins = parseInt(d.minutes, 10);
  const body = {
    weekId: week.id, weekTitle: week.title || '', workoutId: wid, workoutTitle: workout.title || '',
    submittedAt: new Date().toISOString(), doneAt: (prev && (prev.doneAt || prev.submittedAt)) || new Date().toISOString(), feeling: d.feeling, rpe: d.rpe || null, minutes: Number.isFinite(mins) && mins > 0 ? mins : null,
    comment: (d.comment || '').trim(),
    exercises: Object.fromEntries((workout.exercises || []).filter(e => e.name).map(e => [e.id, { name: e.name, done: !!d.checks[e.id], note: (d.notes[e.id] || '').trim() }])),
    seen: false, coachReply: (prev && prev.coachReply) || '', replyAt: (prev && prev.replyAt) || null
  };
  try {
    await write('feedback/' + wid, ref => ref.set(body));
    ls.del('draft:' + wid); S.editFb = null;
    toast(prev ? 'Cambios guardados.' : 'Enviado. ¡Buen trabajo!');
    render(true); window.scrollTo({ top: 0 });
  } catch {}
}

/* ---------- rest timer ---------- */
const T = { left: 0, total: 0, int: null, audio: null, lock: null };
const $sheet = document.getElementById('sheet');
function timerPaint() {
  document.getElementById('t-left').textContent = fmtSec(T.left);
  const c = 326.73, p = T.total ? Math.max(0, T.left) / T.total : 0;
  document.getElementById('t-arc').setAttribute('stroke-dashoffset', (c * (1 - p)).toFixed(2));
}
function beep() {
  try {
    const ctx = T.audio; if (!ctx) return;
    [0, 0.3, 0.6].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.18; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18); });
  } catch {}
  try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch {}
}
function openTimer(sec, name) {
  try { T.audio = T.audio || new (window.AudioContext || window.webkitAudioContext)(); T.audio.resume && T.audio.resume(); } catch {}
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => T.lock = l).catch(() => {}); } catch {}
  T.total = T.left = Math.max(5, sec);
  document.getElementById('t-name').textContent = `Descanso · ${name}`;
  document.getElementById('t-msg').textContent = 'Respira y prepárate para la siguiente serie.';
  $sheet.classList.remove('finished'); $sheet.hidden = false; timerPaint();
  clearInterval(T.int);
  T.int = setInterval(() => {
    T.left--; timerPaint();
    if (T.left <= 0) { clearInterval(T.int); $sheet.classList.add('finished'); document.getElementById('t-msg').textContent = '¡Tiempo! A por la siguiente serie.'; beep(); }
  }, 1000);
  document.getElementById('t-close').focus();
}
function closeTimer() { clearInterval(T.int); $sheet.hidden = true; try { T.lock && T.lock.release(); } catch {} T.lock = null; }
document.getElementById('t-close').addEventListener('click', closeTimer);
document.getElementById('t-plus').addEventListener('click', () => { if (T.left <= 0) return openTimer(15, document.getElementById('t-name').textContent.replace(/^Descanso · /, '')); T.left += 15; T.total = Math.max(T.total, T.left); timerPaint(); });
document.getElementById('t-minus').addEventListener('click', () => { T.left = Math.max(1, T.left - 15); timerPaint(); });
$sheet.addEventListener('click', e => { if (e.target === $sheet) closeTimer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$sheet.hidden) closeTimer(); });

/* ================= COACH ================= */
function renderCoach() {
  const unseen = Object.values(S.feedback).filter(f => !f.seen).length + Object.values(S.runs).filter(r => r.done && !r.seen).length;
  const ro = !S.canWrite ? `<div class="banner">Esta cuenta solo puede ver. Para editar, abre la página con la cuenta del dueño o pide acceso de editor.</div>` : '';
  const tabbar = `<nav class="dock tabbar" aria-label="Secciones"><div class="wrap" role="tablist">
    <button type="button" role="tab" id="tab-plan" aria-selected="${S.tab === 'plan'}" data-act="tab" data-t="plan">${ic('list')}Programación</button>
    <button type="button" role="tab" id="tab-fb" aria-selected="${S.tab === 'fb'}" data-act="tab" data-t="fb">${ic('chat')}Feedback${unseen ? `<span class="badge">${unseen}</span>` : ''}</button>
    <button type="button" role="tab" id="tab-hist" aria-selected="${S.tab === 'hist'}" data-act="tab" data-t="hist">${ic('cal')}Historial</button>
  </div></nav>`;
  if (S.tab === 'hist') { const h = historyCalendar(true); return { dock: tabbar, html: `<div class="wrap section stack">${ro}<div><span class="eyebrow">Historial</span><h2>Lo que ha hecho Papá</h2></div><div class="stats hsum">${statText(h.stats)}</div>${h.html}</div>` }; }
  if (S.tab === 'fb') return { html: `<div class="wrap section stack">${ro}<div><span class="eyebrow">${unseen ? `${unseen} sin leer` : 'Todo leído'}</span><h2>Feedback de Papá</h2></div>${renderInbox()}</div>`, dock: tabbar };
  if (S.edit) return renderEditor(ro);
  const cards = S.weeks.map((w, i) => {
    const { done, total } = weekDone(w);
    const armed = S.armed === 'wk:' + w.id;
    return `<article class="wkcard">
      <div class="top2"><div><span class="eyebrow">${esc(weekRange(w.startDate) || 'Sin fecha')}</span><h3>${esc(w.title || 'Semana ' + (i + 1))}</h3></div>
        <button type="button" class="btn" data-act="editwk" data-id="${esc(w.id)}">${ic('edit')}Editar</button></div>
      <div class="wklist">${(w.workouts || []).map(x => `<span class="${S.feedback[x.id] ? 'ok' : ''}">${S.feedback[x.id] ? '✓ ' : ''}${(w.workouts || []).indexOf(x) + 1}. ${esc(x.title || 'Entreno')}</span>`).join('')}</div>
      <div class="wkbar"><div class="bar"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div><span class="mono">${done}/${total}</span> hechos</div>
      ${(() => { const rs = runsFrom(parseD(w.startDate)); if (!rs.length) return ''; const km = rs.filter(r => r.done).reduce((a, r) => a + (r.km || 0), 0);
        return `<div class="wklist">${rs.map(r => `<span class="run ${r.done ? '' : 'plan'}">${ic('run')}${esc(dayShort(r.date))} · ${r.done ? esc(r.km ? fmtKm(r.km) + ' km' : fmtLong(r.durationSec)) : 'planificada'}</span>`).join('')}</div>
        ${km ? `<span class="muted" style="font-size:14px">${rs.filter(r => r.done).length} carrera${rs.filter(r => r.done).length === 1 ? '' : 's'} · <b class="mono" style="color:var(--ink)">${fmtKm(km)} km</b></span>` : ''}`; })()}
      <div class="actions">
        <button type="button" class="btn ghost" data-act="dupwk" data-id="${esc(w.id)}">${ic('copy')}Duplicar</button>
        <button type="button" class="btn ghost danger ${armed ? 'armed' : ''}" data-act="delwk" data-id="${esc(w.id)}">${ic('trash')}${armed ? '¿Seguro? Eliminar' : 'Eliminar'}</button>
      </div>
    </article>`;
  }).join('');
  return { dock: tabbar, html: `<div class="wrap section stack">${ro}
    <div class="headrow"><div><span class="eyebrow">${S.weeks.length} semana${S.weeks.length === 1 ? '' : 's'}</span><h2>Programación</h2></div>
      <button type="button" class="btn primary" data-act="newwk">${ic('plus')}Nueva semana</button></div>
    ${cards || `<div class="empty"><h3>Aún no hay semanas</h3><p class="muted">Crea la primera semana con sus entrenos. Papá la verá en su vista en cuanto la guardes.</p><button type="button" class="btn primary" data-act="newwk">${ic('plus')}Crear semana 1</button></div>`}
  </div>` };
}

function blankEx() { return { id: uid(), name: '', sets: '', reps: '', load: '', rest: '', notes: '', video: '', videoAsset: '', imageAsset: '' }; }
function blankWo(day) { return { id: uid(), day: day || '', title: '', format: '', warmup: '', notes: '', hiit: null, exercises: [blankEx()] }; }
function hiitEditor(x, wi) {
  const on = !!(x.hiit && x.hiit.on), h = x.hiit || {};
  const f = (k, label, ph) => `<label class="f"><span>${label}</span><input class="inp" type="number" inputmode="numeric" min="0" id="f-h:${wi}:${k}" data-bind="h:${wi}:${k}" value="${esc(h[k] ?? '')}" placeholder="${ph}"></label>`;
  return `<div class="hiit-ed ${on ? 'on' : ''}">
    <label class="switch"><input type="checkbox" id="f-hon-${wi}" data-hon="${wi}" ${on ? 'checked' : ''}><span>${ic('flame')} Entreno HIIT con temporizador</span></label>
    ${on ? `<div class="grid3">${f('work', 'Trabajo (s)', HD.work)}${f('rest', 'Descanso (s)', HD.rest)}${f('sets', 'Series', HD.sets)}${f('reps', 'Rondas por ejercicio', HD.reps)}${f('setRest', 'Descanso entre series (s)', HD.setRest)}${f('prep', 'Preparación (s)', HD.prep)}</div>
      <p class="muted" style="font-size:14px" id="htot-${wi}">${hiitTotalText(x)}</p>` : `<p class="muted" style="font-size:14px">Trabajo y descanso por ejercicio, series y descanso entre series, con el ejercicio en pantalla.</p>`}
  </div>`;
}
function hiitTotalText(x) {
  const n = x.exercises.filter(e => String(e.name || '').trim()).length, c = hiitCfg(x);
  return `Cada serie: ${n} ejercicio${n === 1 ? '' : 's'}${c.reps > 1 ? ` × ${c.reps} rondas` : ''} · Duración total: <b class="mono">${fmtLong(planTotal(hiitPlan(c, n)))}</b>`;
}
function nextStart() {
  const last = S.weeks.map(w => parseD(w.startDate)).filter(Boolean).sort((a, b) => b - a)[0];
  if (last) { const d = new Date(last); d.setDate(d.getDate() + 7); return isoD(d); }
  return isoD(mondayOf(new Date()));
}
const nextOrder = () => S.weeks.reduce((m, w) => Math.max(m, Number(w.order) || 0), 0) + 1;

function mediaEditor(e, wi, ei) {
  const row = (kind) => {
    const isImg = kind === 'image', id = isImg ? exImage(e) : exVideo(e), key = `${kind}:${wi}:${ei}`;
    const noun = isImg ? 'imagen' : 'vídeo';
    if (S.uploading === key) return `<div class="upl"><span class="muted">Subiendo ${noun}… no cierres la página.</span></div>`;
    if (id) return `<div class="upl">${isImg ? `<img src="${mediaUrl(id)}" alt="">` : `<video controls muted playsinline preload="metadata" src="${mediaUrl(id)}"></video>`}
      <span class="muted" style="flex:1;min-width:140px">${isImg ? 'Imagen' : 'Vídeo'} guardado en «${esc(e.name)}». ${isImg ? 'Sale en la tarjeta y en el temporizador.' : 'Sale en todas las semanas con este ejercicio.'}</span>
      <button type="button" class="btn ghost danger" data-act="mediarm" data-kind="${kind}" data-w="${wi}" data-e="${ei}">${ic('trash')}Quitar ${noun}</button></div>`;
    if (!S.assets) return '';
    const accept = isImg ? 'image/*' : 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
    return `<div class="upl"><label class="btn" for="up-${key}">${ic('upload')}Subir ${noun}</label>
      <input type="file" id="up-${key}" accept="${accept}" data-upload="${wi}:${ei}" data-kind="${kind}">
      <span class="muted">${isImg ? 'Foto o dibujo del ejercicio' : 'MP4 o WebM, hasta 20 MB'}</span></div>`;
  };
  if (!S.assets && !exImage(e) && !exVideo(e)) return `<div class="upl"><span class="muted">Para subir imágenes y vídeos, abre la página con tu cuenta de dueño.</span></div>`;
  return `<div class="media-row">${row('image')}${row('video')}</div>`;
}

function renderEditor(ro) {
  const d = S.edit.draft;
  if (S.edit.openWo == null) S.edit.openWo = 0;
  const wos = d.workouts.map((x, wi) => {
    const fb = S.feedback[x.id], isOpen = S.edit.openWo === wi, armed = S.armed === 'wo:' + wi;
    const nEx = x.exercises.filter(e => e.name).length;
    const head = `<button type="button" class="acc-head" data-act="wotoggle" data-w="${wi}" aria-expanded="${isOpen}">
      <span class="wday"><small>Nº</small><b>${wi + 1}</b></span>
      <span class="wbody"><span class="h3">${esc(x.title || 'Entreno sin título')}</span><span class="wmeta"><span>${nEx} ejercicio${nEx === 1 ? '' : 's'}</span>${fb ? '<span class="chip done">Hecho</span>' : ''}</span></span>
      ${ic('next', 'chev')}</button>`;
    if (!isOpen) return `<section class="acc">${head}</section>`;
    const w = k => `w:${wi}:${k}`;
    const exs = x.exercises.map((e, ei) => {
      const b = k => `e:${wi}:${ei}:${k}`;
      const inp = (k, label, ph) => `<label class="f"><span>${label}</span><input class="inp" id="f-${b(k)}" data-bind="${b(k)}" value="${esc(e[k])}" placeholder="${ph}"${k === 'name' ? ' list="exlib" autocomplete="off"' : ''}></label>`;
      return `<div class="ex-edit">
        <div class="ex-top"><span class="xnum">${ei + 1}</span>${inp('name', 'Ejercicio', 'Sentadilla a caja')}</div>
        ${x.hiit && x.hiit.on ? inp('load', 'Carga', '8 kg') : `<div class="grid4">${inp('sets', 'Series', '3')}${inp('reps', 'Reps / tiempo', '10 o 30 s')}${inp('load', 'Carga', '8 kg')}${inp('rest', 'Descanso', '60 s')}</div>`}
        ${inp('notes', 'Indicaciones', 'Baja controlado, 3 s')}
        <label class="f"><span>Enlace de imagen o vídeo</span><input class="inp" type="url" inputmode="url" autocomplete="off" id="f-${b('video')}" data-bind="${b('video')}" value="${esc(e.video)}" placeholder="YouTube, Vimeo, Drive, .jpg, .gif, .mp4…"></label>
        <div class="lprev" id="lp-${wi}-${ei}">${linkPreview(e.video)}</div>
        ${mediaEditor(e, wi, ei)}
        <div class="ex-tools">
          <button type="button" class="btn ghost" data-act="exup" data-w="${wi}" data-e="${ei}" aria-label="Subir ejercicio" ${ei === 0 ? 'disabled' : ''}>${ic('up')}</button>
          <button type="button" class="btn ghost" data-act="exdown" data-w="${wi}" data-e="${ei}" aria-label="Bajar ejercicio" ${ei === x.exercises.length - 1 ? 'disabled' : ''}>${ic('down')}</button>
          <button type="button" class="btn ghost danger" data-act="exdel" data-w="${wi}" data-e="${ei}" aria-label="Quitar ejercicio">${ic('trash')}</button>
        </div>
      </div>`;
    }).join('');
    return `<section class="acc open">${head}<div class="acc-body">
      <label class="f"><span>Título</span><input class="inp" id="f-${w('title')}" data-bind="${w('title')}" value="${esc(x.title)}" placeholder="Fuerza tren inferior"></label>
      ${hiitEditor(x, wi)}
      <label class="f"><span>Formato (opcional)</span><input class="inp" id="f-${w('format')}" data-bind="${w('format')}" value="${esc(x.format)}" placeholder="Circuito · 3 vueltas, 90 s entre vueltas"></label>
      <label class="f"><span>Calentamiento (opcional)</span><textarea class="inp" rows="2" id="f-${w('warmup')}" data-bind="${w('warmup')}" placeholder="5 min caminando + movilidad de cadera y hombros">${esc(x.warmup)}</textarea></label>
      <span class="eyebrow">Ejercicios</span>
      ${exs}
      <button type="button" class="btn" data-act="exadd" data-w="${wi}">${ic('plus')}Añadir ejercicio</button>
      <label class="f"><span>Notas para Papá (opcional)</span><textarea class="inp" rows="2" id="f-${w('notes')}" data-bind="${w('notes')}" placeholder="Si algo duele, para y apúntalo">${esc(x.notes)}</textarea></label>
      <div class="actions">
        <button type="button" class="btn ghost" data-act="woup" data-w="${wi}" ${wi === 0 ? 'disabled' : ''}>${ic('up')}Subir</button>
        <button type="button" class="btn ghost" data-act="wodown" data-w="${wi}" ${wi === d.workouts.length - 1 ? 'disabled' : ''}>${ic('down')}Bajar</button>
        <button type="button" class="btn ghost danger ${armed ? 'armed' : ''}" data-act="wodel" data-w="${wi}">${ic('trash')}${armed ? '¿Seguro? Quitar' : 'Quitar entreno'}</button>
      </div>
    </div></section>`;
  }).join('');
  const html = `<div class="wrap section stack">${ro}
    <button type="button" class="btn ghost" data-act="cancelwk" style="align-self:flex-start;padding-left:0">${ic('back')}Programación</button>
    <h2>${S.edit.isNew ? 'Nueva semana' : 'Editar semana'}</h2>
    <div class="grid2">
      <label class="f"><span>Empieza el lunes</span><input class="inp" type="date" id="f-wk-start" data-bind="wk:startDate" value="${esc(d.startDate)}"></label>
      <label class="f"><span>Nombre de la semana</span><input class="inp" id="f-wk-title" data-bind="wk:title" value="${esc(d.title)}" placeholder="Semana 1 · Adaptación"></label>
    </div>
    <label class="f"><span>Mensaje de la semana (opcional)</span><textarea class="inp" rows="2" id="f-wk-focus" data-bind="wk:focus" placeholder="Esta semana vamos suave para coger técnica.">${esc(d.focus)}</textarea></label>
    <p class="muted" style="font-size:15px">Papá ve los entrenos en este orden y los hace cuando le viene bien. Usa ↑ ↓ para cambiar el orden.</p>
    ${wos}
    <button type="button" class="btn" data-act="woadd">${ic('plus')}Añadir entreno</button>
    <datalist id="exlib">${Object.values(S.lib).map(l => `<option value="${esc(l.name)}"></option>`).join('')}</datalist>
  </div>`;
  const dock = `<div class="dock"><div class="wrap">
    <span class="count" id="dirty" style="color:var(--warn);font-weight:700">${S.edit.dirty ? 'Sin guardar' : ''}</span>
    <button type="button" class="btn" data-act="cancelwk">Cancelar</button>
    <button type="button" class="btn primary" data-act="savewk" ${S.canWrite ? '' : 'disabled'}>Guardar</button></div></div>`;
  return { html, dock };
}

function setBind(path, v) {
  const d = S.edit.draft, p = path.split(':');
  if (p[0] === 'wk') d[p[1]] = v;
  else if (p[0] === 'w') d.workouts[+p[1]][p[2]] = v;
  else if (p[0] === 'e') d.workouts[+p[1]].exercises[+p[2]][p[3]] = v;
  else if (p[0] === 'h') { const x = d.workouts[+p[1]]; x.hiit = { ...(x.hiit || {}), [p[2]]: v }; }
  if (p[0] === 'e' && p[3] === 'video') { const lp = document.getElementById(`lp-${p[1]}-${p[2]}`); if (lp) lp.innerHTML = linkPreview(v); }
  if (p[0] === 'h' || (p[0] === 'e' && p[3] === 'name')) { const el = document.getElementById('htot-' + p[1]); if (el) el.innerHTML = hiitTotalText(d.workouts[+p[1]]); }
  if (!S.edit.dirty) { S.edit.dirty = true; const el = document.getElementById('dirty'); if (el) el.textContent = 'Sin guardar'; }
}

async function saveWeek() {
  const d = clone(S.edit.draft);
  const t = v => String(v ?? '').trim();
  d.title = t(d.title); d.focus = t(d.focus); d.startDate = t(d.startDate);
  delete d.openWo;
  d.workouts = d.workouts.map(x => ({
    id: x.id, title: t(x.title), format: t(x.format), warmup: t(x.warmup), notes: t(x.notes),
    hiit: x.hiit && x.hiit.on ? hiitCfg(x) : null,
    exercises: x.exercises.map(e => ({ id: e.id, name: t(e.name), sets: t(e.sets), reps: t(e.reps), load: t(e.load), rest: t(e.rest), notes: t(e.notes), video: normUrl(e.video), videoAsset: validAsset(e.videoAsset), imageAsset: validAsset(e.imageAsset), _had: e._had || '' })).filter(e => e.name)
  })).filter(x => x.title || x.exercises.length);
  if (!d.title) d.title = 'Semana ' + (S.weeks.findIndex(w => w.id === d.id) + 1 || S.weeks.length + 1);
  const allEx = d.workouts.flatMap(x => x.exercises);
  const bad = allEx.find(e => e.video && !safeUrl(e.video));
  if (bad) { toast(`El enlace de «${bad.name}» no es válido. Pega el enlace completo, que empiece por https://`); return; }
  const libPatches = allEx.map(e => {
    const patch = {};
    if (e.videoAsset) patch.videoAsset = e.videoAsset;
    if (e.imageAsset) patch.imageAsset = e.imageAsset;
    if (e.video) patch.link = e.video;
    else if (e._had && libLink(e) === safeUrl(normUrl(e._had))) patch.link = '';
    return [e.name, patch];
  });
  allEx.forEach(e => { delete e._had; });
  d.updatedAt = new Date().toISOString();
  try {
    await write('weeks/' + d.id, ref => ref.set(d));
    for (const [name, patch] of libPatches) if (Object.keys(patch).length) await saveLib(name, patch);
    S.edit = null; S.armed = null; toast('Semana guardada. Papá ya la puede ver.');
    render(true); window.scrollTo({ top: 0 });
  } catch {}
}

/* Photos are shrunk to 1280 px JPEG on the phone first (also turns iPhone HEIC into JPEG); GIFs keep their animation. */
async function shrinkImage(file) {
  if (/gif$/i.test(file.type)) return { blob: file, type: 'image/gif' };
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
    if (blob) return { blob, type: 'image/jpeg' };
  } catch {}
  const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  return ok ? { blob: file, type: file.type } : null;
}
async function uploadMedia(input) {
  const file = input.files && input.files[0]; if (!file || !S.edit) return;
  const kind = input.dataset.kind === 'image' ? 'image' : 'video', isImg = kind === 'image', noun = isImg ? 'la imagen' : 'el vídeo';
  const [wi, ei] = input.dataset.upload.split(':').map(Number);
  const exName = (S.edit.draft.workouts[wi]?.exercises[ei]?.name || '').trim();
  if (!slug(exName)) { toast(`Escribe primero el nombre del ejercicio y luego sube ${noun}.`); input.value = ''; return; }
  let blob = file, type;
  if (isImg) {
    const r = await shrinkImage(file);
    if (!r) { toast('No se puede leer esa imagen. Usa una foto JPG o PNG.'); input.value = ''; return; }
    blob = r.blob; type = r.type;
  } else {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    type = file.type === 'video/webm' || ext === 'webm' ? 'video/webm' : 'video/mp4';
  }
  if (blob.size > 20 * 1024 * 1024) { toast(isImg ? 'La imagen pesa más de 20 MB.' : 'El vídeo pesa más de 20 MB. Recórtalo o grábalo con menos calidad.'); input.value = ''; return; }
  S.uploading = `${kind}:${wi}:${ei}`; render(true);
  try {
    let res;
    try { res = await S.assets.upload(blob, { type }); }
    catch (err) { if (err && err.code === 'store_unavailable') { await new Promise(r => setTimeout(r, 1200)); res = await S.assets.upload(blob, { type }); } else throw err; }
    const ex = S.edit && S.edit.draft.workouts[wi] && S.edit.draft.workouts[wi].exercises[ei];
    const field = isImg ? 'imageAsset' : 'videoAsset';
    if (ex) { ex[field] = res.id; S.edit.dirty = true; }
    await saveLib(exName, { [field]: res.id });
    toast(`${isImg ? 'Imagen guardada' : 'Vídeo guardado'} en «${exName}». Saldrá en cada semana que tenga este ejercicio.`);
  } catch (err) {
    const c = err && err.code;
    toast(c === 'too_large' ? `${isImg ? 'La imagen' : 'El vídeo'} pesa más de 20 MB.`
      : c === 'unsupported_type' ? (isImg ? 'Ese formato no vale. Usa una foto JPG o PNG.' : 'Ese formato no vale. Usa un vídeo MP4 o WebM.')
      : c === 'quota_or_state' ? 'No queda espacio. Quita imágenes o vídeos que ya no uses.'
      : c === 'rate_limited' ? 'Demasiadas subidas seguidas. Espera un momento y vuelve a intentarlo.'
      : `No se ha podido subir ${noun}. Revisa la conexión y vuelve a intentarlo.`);
  } finally { S.uploading = null; render(true); }
}

function runInboxCard(r) {
  const draft = ls.get('reply:run:' + r.id, '');
  return `<article class="fbc ${r.seen ? '' : 'unseen'}">
    <div class="fbc-head">${r.feeling ? face(r.feeling) : `<span class="runicon">${ic('run')}</span>`}<div style="min-width:0"><span class="eyebrow">Carrera · ${esc(fmtDayLong(r.date))}</span><h3>${esc(runHeadline(r))}</h3></div>${r.seen ? '' : '<span class="chip new">Nuevo</span>'}</div>
    <div class="stats">
      ${r.km ? `<span class="stat">${ic('run')}<b>${fmtKm(r.km)}</b>km</span>` : ''}
      ${r.durationSec ? `<span class="stat">${ic('timer')}<b>${fmtLong(r.durationSec)}</b></span>` : ''}
      ${runPace(r) ? `<span class="stat"><b>${runPace(r)}</b>/km</span>` : ''}
      ${r.feeling ? `<span class="stat"><b>${FEEL[r.feeling]}</b></span>` : ''}
    </div>
    <div class="chat">
      ${r.comment ? `<div class="bubble left"><span class="who">Papá</span>${esc(r.comment)}</div>` : ''}
      ${r.coachReply ? `<div class="bubble right"><span class="who">Tú</span>${esc(r.coachReply)}</div>` : ''}
    </div>
    <div class="composer">
      <textarea class="inp" rows="1" id="reply-run-${esc(r.id)}" data-reply="run:${esc(r.id)}" placeholder="${r.coachReply ? 'Cambiar tu respuesta…' : 'Responder a Papá…'}" aria-label="Respuesta">${esc(draft)}</textarea>
      <button type="button" class="btn primary icon" data-act="runreply" data-id="${esc(r.id)}" aria-label="Enviar respuesta" ${S.canWrite ? '' : 'disabled'}>${ic('send')}</button>
    </div>
    ${r.seen ? '' : `<button type="button" class="btn ghost" data-act="runseen" data-id="${esc(r.id)}" style="align-self:flex-start" ${S.canWrite ? '' : 'disabled'}>${ic('check')}Marcar como leído</button>`}
  </article>`;
}
function renderInbox() {
  const items = [
    ...Object.values(S.feedback).map(f => ({ t: String(f.submittedAt || ''), f })),
    ...Object.values(S.runs).filter(r => r.done).map(r => ({ t: String(r.updatedAt || r.date || ''), r }))
  ].sort((a, b) => b.t.localeCompare(a.t));
  if (!items.length) return `<div class="empty"><h3>Sin feedback todavía</h3><p class="muted">Cuando Papá termine un entreno o apunte una carrera, verás aquí cómo le ha ido.</p></div>`;
  return items.map(({ f, r }) => {
    if (r) return runInboxCard(r);
    const exs = Object.values(f.exercises || {});
    const skipped = exs.filter(e => !e.done).map(e => e.name);
    const notes = exs.filter(e => e.note);
    const draft = ls.get('reply:' + f.workoutId, '');
    return `<article class="fbc ${f.seen ? '' : 'unseen'}">
      <div class="fbc-head">${face(f.feeling)}<div style="min-width:0"><span class="eyebrow">${esc(f.weekTitle)}${f.day ? ' · ' + esc(f.day) : ''}</span><h3>${esc(f.workoutTitle || 'Entreno')}</h3></div>${f.seen ? '' : '<span class="chip new">Nuevo</span>'}</div>
      <div class="stats">
        <span class="stat"><b>${FEEL[f.feeling] || '—'}</b></span>
        ${f.rpe ? `<span class="stat"><span class="rpebadge ${rpeCls(f.rpe)}">${f.rpe}</span>${RPE[f.rpe]}</span>` : ''}
        ${f.minutes ? `<span class="stat">${ic('timer')}<b>${f.minutes}</b>min</span>` : ''}
        <span class="stat">${ic('check')}<b>${exs.filter(e => e.done).length}/${exs.length}</b></span>
      </div>
      ${skipped.length ? `<p style="font-size:15px"><span class="eyebrow" style="color:var(--warn)">No marcados</span><br>${skipped.map(esc).join(', ')}</p>` : ''}
      ${notes.length ? `<div><span class="eyebrow">Notas por ejercicio</span><ul>${notes.map(e => `<li><b>${esc(e.name)}:</b> ${esc(e.note)}</li>`).join('')}</ul></div>` : ''}
      <div class="chat">
        ${f.comment ? `<div class="bubble left"><span class="who">Papá</span>${esc(f.comment)}</div>` : ''}
        ${f.coachReply ? `<div class="bubble right"><span class="who">Tú</span>${esc(f.coachReply)}</div>` : ''}
      </div>
      <div class="composer">
        <textarea class="inp" rows="1" id="reply-${esc(f.workoutId)}" data-reply="${esc(f.workoutId)}" placeholder="${f.coachReply ? 'Cambiar tu respuesta…' : 'Responder a Papá…'}" aria-label="Respuesta">${esc(draft)}</textarea>
        <button type="button" class="btn primary icon" data-act="reply" data-id="${esc(f.workoutId)}" aria-label="Enviar respuesta" ${S.canWrite ? '' : 'disabled'}>${ic('send')}</button>
      </div>
      ${f.seen ? '' : `<button type="button" class="btn ghost" data-act="seen" data-id="${esc(f.workoutId)}" style="align-self:flex-start" ${S.canWrite ? '' : 'disabled'}>${ic('check')}Marcar como leído</button>`}
    </article>`;
  }).join('');
}

/* ---------- events ---------- */
document.addEventListener('play', ev => { const v = ev.target; if (v && v.tagName === 'VIDEO' && !v.dataset.soundOk) { v.muted = true; v.dataset.soundOk = '1'; } }, true);
document.addEventListener('error', ev => {
  const el = ev.target;
  if (!el || el.tagName !== 'IMG' || !el.hasAttribute('data-try')) return;
  if (el.id === 'h-img') { H.bad.add(el.getAttribute('src')); H.isrc = ''; if (!$h.hidden && !H.done) hiitPaint(); return; }
  el.hidden = true;
}, true);


$app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.upload) return uploadMedia(t);
  if (t.dataset.bind && S.edit) {
    const p = t.dataset.bind.split(':');
    if (p[0] === 'e' && p[3] === 'name') {
      const ex = S.edit.draft.workouts[+p[1]].exercises[+p[2]];
      if (!String(ex.video || '').trim() && libLink(ex)) {
        prepEx(ex);
        const li = document.getElementById(`f-e:${p[1]}:${p[2]}:video`); if (li) li.value = ex.video;
        const lp = document.getElementById(`lp-${p[1]}-${p[2]}`); if (lp) lp.innerHTML = linkPreview(ex.video);
      }
    }
    return;
  }
  if (t.dataset.hon != null && S.edit) {
    const x = S.edit.draft.workouts[+t.dataset.hon];
    x.hiit = t.checked ? { ...HD, ...(x.hiit || {}), on: true } : { ...(x.hiit || {}), on: false };
    S.edit.dirty = true; render(true);
  }
});
$app.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.bind && S.edit) return setBind(t.dataset.bind, t.value);
  if (t.dataset.reply) return ls.set('reply:' + t.dataset.reply, t.value);
  if (t.dataset.run && S.runDraft) { S.runDraft[t.dataset.run] = t.value; if (t.dataset.run !== 'comment') updatePace(); return; }
  if (S.open && (t.dataset.fb || t.dataset.exnote)) {
    const d = getDraft(S.open);
    if (t.dataset.fb) d[t.dataset.fb] = t.value; else d.notes[t.dataset.exnote] = t.value;
    saveDraft(S.open, d);
  }
});

async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const act = b.dataset.act, id = b.dataset.id;
  const wi = b.dataset.w != null ? +b.dataset.w : null, ei = b.dataset.e != null ? +b.dataset.e : null;
  const armedKey = act === 'delwk' ? 'wk:' + id : act === 'wodel' ? 'wo:' + wi : act === 'rundel' ? 'run:' + id : null;
  if (!armedKey) S.armed = null;

  switch (act) {
    /* athlete */
    case 'wk': S.weekIdx = Math.min(S.weeks.length - 1, Math.max(0, S.weekIdx + Number(b.dataset.d))); return render(true);
    case 'open': S.open = id; S.editFb = null; S.runOpen = null; render(true); return window.scrollTo({ top: 0 });
    case 'back': S.open = null; S.editFb = null; render(true); return window.scrollTo({ top: 0 });
    case 'tick': {
      const d = getDraft(S.open); d.checks[id] = !d.checks[id]; saveDraft(S.open, d);
      b.setAttribute('aria-pressed', d.checks[id]); b.querySelector('span').textContent = d.checks[id] ? 'Hecho' : 'Marcar como hecho';
      document.getElementById('ex-' + id)?.classList.toggle('checked', d.checks[id]);
      updateProgress();
      if (d.checks[id]) { try { navigator.vibrate && navigator.vibrate(30); } catch {} }
      return;
    }
    case 'feel': case 'rpe': {
      const d = getDraft(S.open), n = Number(b.dataset.n), k = act === 'feel' ? 'feeling' : 'rpe';
      d[k] = n; saveDraft(S.open, d);
      b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      if (k === 'rpe') document.getElementById('rpe-hint').innerHTML = `<b>${RPE[n]}</b> · ${RPE_HINT[n]}`;
      return;
    }
    case 'min': {
      const d = getDraft(S.open), v = Math.max(0, Math.min(300, (parseInt(d.minutes, 10) || 0) + Number(b.dataset.d)));
      d.minutes = v; saveDraft(S.open, d); const inp = document.getElementById('fb-min'); if (inp) inp.value = v; return;
    }
    case 'hiit': return hiitStart(S.open);
    case 'timer': return openTimer(Number(b.dataset.sec) || 60, b.dataset.name || '');
    case 'tofb': return document.getElementById('fb')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    case 'vid': {
      const opening = !S.vidOpen.has(id);
      if (opening) S.vidOpen.add(id); else S.vidOpen.delete(id);
      render(true);
      if (opening) { const v = document.querySelector(`#ex-${CSS.escape(id)} video`); if (v) { v.muted = true; v.play().catch(() => {}); } }
      return;
    }
    case 'runnew': {
      const date = defaultRunDate();
      S.runDraft = { id: uid(), date, done: date <= todayIso(), h: '', m: '', s: '', km: '', feeling: null, comment: '' };
      S.runOpen = S.runDraft.id; render(true); return window.scrollTo({ top: 0 });
    }
    case 'runopen': { const r = S.runs[id]; if (!r) return; S.runDraft = runDraftFrom(r); S.runOpen = id; render(true); return window.scrollTo({ top: 0 }); }
    case 'runback': S.runOpen = null; S.runDraft = null; render(true); return window.scrollTo({ top: 0 });
    case 'rundone': if (S.runDraft) { S.runDraft.done = b.dataset.v === '1'; render(true); } return;
    case 'runkm': if (S.runDraft) { S.runDraft.km = b.dataset.km; const k = document.getElementById('run-km'); if (k) k.value = b.dataset.km; updatePace(); } return;
    case 'runfeel': if (S.runDraft) { S.runDraft.feeling = Number(b.dataset.n); b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); } return;
    case 'runsave': return saveRun();
    case 'rundel':
      if (S.armed !== armedKey) { S.armed = armedKey; return render(true); }
      S.armed = null;
      try { await write('runs/' + id, ref => ref.delete()); S.runOpen = null; S.runDraft = null; toast('Carrera borrada.'); } catch {}
      return render(true);
    case 'runreply': {
      const ta = document.getElementById('reply-run-' + id); const txt = (ta?.value || '').trim();
      if (!txt) { toast('Escribe una respuesta antes de enviarla.'); return; }
      try { await write('runs/' + id, ref => ref.update({ coachReply: txt, replyAt: new Date().toISOString(), seen: true })); ls.del('reply:run:' + id); toast('Respuesta enviada.'); render(true); } catch {}
      return;
    }
    case 'runseen':
      try { await write('runs/' + id, ref => ref.update({ seen: true })); render(true); } catch {}
      return;
    case 'send': return sendFeedback(S.open);
    case 'editfb': S.editFb = S.open; ls.del('draft:' + S.open); return render(true);
    case 'cancelfb': S.editFb = null; ls.del('draft:' + S.open); return render(true);

    /* coach */
    case 'tab': S.tab = b.dataset.t; render(true); return window.scrollTo({ top: 0 });
    case 'atab': S.atab = b.dataset.t; S.open = null; S.runOpen = null; S.runDraft = null; render(true); return window.scrollTo({ top: 0 });
    case 'hday': S.histDay = b.dataset.d; return render(true);
    case 'hmon': { const m = S.histMonth || new Date(); S.histMonth = new Date(m.getFullYear(), m.getMonth() + Number(b.dataset.d), 1); S.histDay = null; return render(true); }
    case 'hopen': { const f = findWorkout(id); if (!f) return; S.weekIdx = S.weeks.indexOf(f.week); S.open = id; S.editFb = null; render(true); return window.scrollTo({ top: 0 }); }
    case 'newwk': {
      const n = S.weeks.length + 1;
      S.edit = { isNew: true, dirty: true, openWo: 0, draft: { id: uid(), order: nextOrder(), title: `Semana ${n}`, startDate: nextStart(), focus: '', workouts: [blankWo(), blankWo(), blankWo()] } };
      render(true); return window.scrollTo({ top: 0 });
    }
    case 'editwk': { const w = S.weeks.find(x => x.id === id); if (!w) return;
      const draft = clone(w); draft.workouts = (draft.workouts || []).map(x => ({ ...blankWo(), ...x, exercises: (x.exercises || []).map(ex => prepEx({ ...blankEx(), ...ex })) }));
      S.edit = { isNew: false, dirty: false, openWo: 0, draft }; render(true); return window.scrollTo({ top: 0 }); }
    case 'dupwk': { const w = S.weeks.find(x => x.id === id); if (!w) return;
      const c = clone(w); c.id = uid(); c.order = nextOrder(); c.title = `Semana ${S.weeks.length + 1}`; c.startDate = nextStart(); delete c.updatedAt;
      c.workouts = (c.workouts || []).map(x => ({ ...blankWo(), ...x, id: uid(), exercises: (x.exercises || []).map(ex => prepEx({ ...blankEx(), ...ex, id: uid() })) }));
      S.edit = { isNew: true, dirty: true, openWo: 0, draft: c }; toast('Copia lista. Ajusta lo que quieras y guarda.'); render(true); return window.scrollTo({ top: 0 }); }
    case 'delwk':
      if (S.armed !== armedKey) { S.armed = armedKey; return render(true); }
      S.armed = null;
      try { await write('weeks/' + id, ref => ref.delete()); toast('Semana eliminada.'); } catch {}
      return render(true);
    case 'cancelwk': S.edit = null; render(true); return window.scrollTo({ top: 0 });
    case 'savewk': return saveWeek();
    case 'wotoggle': S.edit.openWo = S.edit.openWo === wi ? -1 : wi; render(true);
      return document.querySelectorAll('.acc')[wi]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    case 'woadd': S.edit.draft.workouts.push(blankWo()); S.edit.openWo = S.edit.draft.workouts.length - 1; S.edit.dirty = true; render(true);
      return document.querySelectorAll('.acc')[S.edit.openWo]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    case 'wodel':
      if (S.armed !== armedKey) { S.armed = armedKey; return render(true); }
      S.armed = null; S.edit.draft.workouts.splice(wi, 1); S.edit.openWo = -1; S.edit.dirty = true; return render(true);
    case 'woup': case 'wodown': { const a = S.edit.draft.workouts, j = wi + (act === 'woup' ? -1 : 1); [a[wi], a[j]] = [a[j], a[wi]]; S.edit.openWo = j; S.edit.dirty = true; return render(true); }
    case 'exadd': S.edit.draft.workouts[wi].exercises.push(blankEx()); S.edit.dirty = true; render(true);
      { const exs = S.edit.draft.workouts[wi].exercises; document.getElementById(`f-e:${wi}:${exs.length - 1}:name`)?.focus(); } return;
    case 'mediarm': {
      const kind = b.dataset.kind === 'image' ? 'image' : 'video', field = kind === 'image' ? 'imageAsset' : 'videoAsset';
      const ex = S.edit.draft.workouts[wi].exercises[ei], cur = kind === 'image' ? exImage(ex) : exVideo(ex);
      ex[field] = ''; S.edit.dirty = true;
      if (validAsset(libOf(ex)[field]) === cur) await saveLib(ex.name, { [field]: '' });
      toast(`${kind === 'image' ? 'Imagen quitada' : 'Vídeo quitado'} de «${ex.name}».`);
      return render(true);
    }
    case 'exdel': S.edit.draft.workouts[wi].exercises.splice(ei, 1); S.edit.dirty = true; return render(true);
    case 'exup': case 'exdown': { const a = S.edit.draft.workouts[wi].exercises, j = ei + (act === 'exup' ? -1 : 1); [a[ei], a[j]] = [a[j], a[ei]]; S.edit.dirty = true; return render(true); }
    case 'reply': {
      const ta = document.getElementById('reply-' + id); const txt = (ta?.value || '').trim();
      if (!txt) { toast('Escribe una respuesta antes de enviarla.'); return; }
      try { await write('feedback/' + id, ref => ref.update({ coachReply: txt, replyAt: new Date().toISOString(), seen: true })); ls.del('reply:' + id); toast('Respuesta enviada.'); render(true); } catch {}
      return;
    }
    case 'seen':
      try { await write('feedback/' + id, ref => ref.update({ seen: true })); render(true); } catch {}
      return;
  }
}
$app.addEventListener('click', onClick);
$dock.addEventListener('click', onClick);

/* ---------- boot ---------- */
async function boot() {
  render(true);
  if (!sb) { S.status = 'nodb'; return render(true); }
  const db = makeDb();
  S.db = db; S.assets = assetStore; S.status = 'ready';
  render();
  db.collection('weeks').onSnapshot(snap => {
    S.weeks = snap.docs.map(d => ({ ...d.data(), id: d.id }))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.startDate || '').localeCompare(String(b.startDate || '')));
    S.gotWeeks = true; render();
  }, err => { toast(errMsg(err)); });
  db.collection('library').onSnapshot(snap => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); });
    S.lib = m; render();
  }, () => {});
  db.collection('feedback').onSnapshot(snap => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = { ...d.data(), workoutId: d.id }; });
    S.feedback = m; S.gotFb = true; render();
  }, err => { toast(errMsg(err)); });
  db.collection('runs').onSnapshot(snap => {
    const m = {}; snap.docs.forEach(d => { const r = d.data(); if (r && parseD(r.date)) m[d.id] = { ...r, id: d.id }; });
    S.runs = m; render();
  }, () => {});
}
boot();
})();
