/* app.js — catalogue Médiathèque, source unique : Jellyfin */

let TMDB_KEY = '';

/* ── Config Jellyfin (injectée par build.js dans js/jellyfin-config.js) ── */
function jf() { return window.JELLYFIN_CONFIG || null; }

/* ── URL de fichier Jellyfin en lecture directe (pour VLC / M3U) ── */
function jellyfinFileUrl(id) {
  const cfg = jf();
  if (!cfg || !id) return '';
  return `${cfg.base}/Videos/${id}/stream?static=true&mediaSourceId=${id}&api_key=${cfg.apiKey}`;
}

/* ── Chargement : catalogue Jellyfin + tmdb.key ──
      items = tableau d'items Jellyfin, ou null si config absente / requête KO. ── */
async function loadResources() {
  const cfg = jf();
  const jellyfinReq = cfg
    ? fetch(`${cfg.base}/Users/${cfg.userId}/Items?IncludeItemTypes=Movie,Series&Recursive=true&Fields=Path&Limit=5000&api_key=${cfg.apiKey}`)
        .then(r => r.json()).then(d => d.Items || [])
    : Promise.reject(new Error('config Jellyfin absente'));

  const [itemsRes, keyRes] = await Promise.allSettled([
    jellyfinReq,
    fetch('data/tmdb.key').then(r => r.text())
  ]);

  if (keyRes.status === 'fulfilled') {
    const key = keyRes.value.trim();
    if (key && !key.startsWith('COLLE_')) TMDB_KEY = key;
  }

  return { items: itemsRes.status === 'fulfilled' ? itemsRes.value : null };
}

/* ── Parsing titre / année ── */
function parse(name) {
  const noExt = name.replace(/\.(mkv|mp4|avi|mov)$/i, '');
  const episodeMatch = noExt.match(/[._\s]S(\d{2})E(\d{2})/i);
  const yearMatch    = noExt.match(/[.([\s-]((?:19|20)\d{2})[.)\]\s-]/);
  const year = yearMatch ? yearMatch[1] : '';
  let title = noExt;

  const techTokens = /\b(MULTi|TRUEFRENCH|FRENCH|VOSTFR|SUBFRENCH|FASTSUB|VFF|VF2|VFQ|VFi|VOF|MULTI|PROPER|REPACK|FANSUB|1080p|720p|2160p|4K|BluRay|BDRip|WEB[-.]DL|WEBRip|WEBrip|HDRip|HDLight|mHD|x264|x265|H264|H265|H\.264|H\.265|AV1|AC3|DTS|AAC|EAC3|DDP|HEVC|HDR|DV|DOLBY|Atmos|BRrip|DVDRip|DVD5|MPEG2|XviD)\b.*/i;

  if (yearMatch)         title = noExt.slice(0, yearMatch.index);
  else if (episodeMatch) title = noExt.slice(0, episodeMatch.index);

  title = title
    .replace(/\s*\[[^\]]*\]?/g, '')        // 1. [FR-EN], [1080p]… + crochet non fermé
    .replace(/\s*\[.*$/, '')              // 1b. crochet ouvert restant en fin de chaîne
    .replace(/\s*\(\d{1,2}\)/g, '')       // 1c. (1), (2)… numéros de suite
    .replace(techTokens, '')              // 2. tokens techniques et tout ce qui suit
    .replace(/[._]/g, ' ')               // 3. points/underscores → espaces
    .replace(/\s*\bS\d{1,2}\b\s*$/i, '') // 4. S01, S02… en fin de titre
    .replace(/\s+/g, ' ')
    .trim();

  // Série si S01E01 ou .S01. ou " S01 " ou fin de chaîne
  const isSerie = /S\d{2}E\d{2}|[._]S\d{2}[._]|[._]S\d{2}$|[\s]S\d{2}[\s._]/i.test(noExt);
  const resolution = /2160p|4K/i.test(noExt) ? '4K' : /1080p/i.test(noExt) ? '1080p' : /720p/i.test(noExt) ? '720p' : '';
  return { title: title || noExt, year, isSerie, resolution };
}

/* ── Épisodes d'une série (déjà parsés/triés à la construction du catalogue) ── */
function parseEpisodes(item) {
  return item.episodes || [];
}

/* ── Catalogue enrichi ── */
const CATALOG = [];

/* getPoster() est défini dans films.js */

/* ── Playlist VLC (M3U) ── */
function _triggerM3U(filename, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'audio/x-mpegurl' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadM3U(btn, item) {
  const label = item.title + (item.year ? ' (' + item.year + ')' : '');

  // Film → une entrée directe Jellyfin
  if (!item.isSerie) {
    const url = jellyfinFileUrl(item.id);
    if (!url) { alert('Vidéo introuvable dans Jellyfin.'); return; }
    _triggerM3U(label + '.m3u', '#EXTM3U\n#EXTINF:-1,' + label + '\n' + url);
    return;
  }

  // Série → une entrée par épisode
  if (item.episodes && item.episodes.length) {
    const lines = ['#EXTM3U'];
    for (const ep of item.episodes) {
      lines.push('#EXTINF:-1,' + label + ' — ' + ep.label, jellyfinFileUrl(ep.id));
    }
    _triggerM3U(label + '.m3u', lines.join('\n'));
    return;
  }

  alert('Aucune vidéo pour « ' + item.title + ' ».');
}

/* ── Filtre & tri ── */
// activeFilter : 'all' | 'series' | clé de genre
let activeFilter = 'all';

/* Genres → IDs TMDB (films + séries) */
const GENRE_IDS = {
  action:      [28, 12, 10759],
  comedie:     [35],
  animation:   [16],
  famille:     [10751, 10762],
  fantastique: [14, 10765],
  scifi:       [878, 10765],
  horreur:     [27],
  romance:     [10749]
};

function filtered() {
  const q = document.getElementById('search').value.toLowerCase();
  const seriesOnly = activeFilter === 'series';
  const genreIds = (activeFilter !== 'all' && !seriesOnly) ? (GENRE_IDS[activeFilter] || []) : null;
  let list = CATALOG.filter(item => {
    if (seriesOnly && !item.isSerie) return false;
    if (genreIds && !(item.genres && item.genres.some(g => genreIds.includes(g)))) return false;
    return !q || item.title.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
      || (item.frTitle && item.frTitle.toLowerCase().includes(q));
  });
  // Tri par défaut : année décroissante (année TMDB si connue, sinon parsée du fichier)
  list.sort((a, b) => ((b.frYear || b.year || '0') > (a.frYear || a.year || '0') ? 1 : -1));
  return list;
}

/* Re-tri débouncé : les années TMDB arrivent en asynchrone ; dès qu'une nouvelle
   est connue on replanifie un rendu trié. getPoster étant caché, ce re-rendu est
   instantané et ne déclenche plus de nouvelle planification une fois tout résolu. */
let _resortTimer = null;
function scheduleResort() {
  clearTimeout(_resortTimer);
  _resortTimer = setTimeout(() => render(filtered()), 500);
}

/* ── Rendu ── */
function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function render(list) {
  document.getElementById('status').textContent = list.length + ' éléments';
  const grid = document.getElementById('grid');
  if (!list.length) { grid.innerHTML = '<div id="empty">Aucun résultat.</div>'; return; }
  grid.innerHTML = '';
  for (const item of list) {
    const idx = CATALOG.indexOf(item);
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.idx = idx;
    const badgeHtml = item.resolution === '4K'
      ? '<span class="badge uhd">4K</span>'
      : item.resolution === '1080p' ? '<span class="badge">HD</span>' : '';
    // Clic sur la card = lecture (1er épisode pour une série).
    // Pour une série, la dropdown reste pour choisir un épisode précis.
    let playControl = '';
    if (item.isSerie) {
      const eps = parseEpisodes(item);
      if (eps.length) {
        const opts = eps.map(e =>
          `<option value="${e.season}-${e.episode}">${escH(e.label)}</option>`
        ).join('');
        playControl = `<select class="ep-select" data-idx="${idx}"><option value="">Episode(s)</option>${opts}</select>`;
      }
    }

    const displayTitle = item.frTitle || item.title;
    card.innerHTML = `
      <div class="poster" id="pw${grid.children.length}">
        <div class="ph"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg><span>${escH(displayTitle)}</span></div>
        ${badgeHtml}
        <button class="btn-vlc" data-idx="${idx}" title="Playlist VLC" aria-label="Playlist VLC"><i class="ti ti-brand-vlc"></i></button>
      </div>
      <div class="card-body">
        <div class="card-title" title="${escH(item.name)}">${escH(displayTitle)}</div>
        <div class="card-meta"><i class="ti ti-${item.isSerie ? 'device-tv' : 'movie'}"></i> ${item.frYear || item.year || '—'}</div>
        ${playControl}
      </div>`;
    grid.appendChild(card);
    const pwId = 'pw' + (grid.children.length - 1);
    getPoster(item.title, item.year, item.isSerie).then(res => {
      item.genres = (res && res.genres) || [];
      // Titre FR (TMDB) : on remplace le titre parsé du fichier sur la vignette
      if (res && res.frTitle) {
        item.frTitle = res.frTitle;
        const titleEl = card.querySelector('.card-title');
        if (titleEl) titleEl.textContent = res.frTitle;
        const phSpan = card.querySelector('.ph span');
        if (phSpan) phSpan.textContent = res.frTitle;
      }
      // Année TMDB : met à jour l'affichage et, si nouvelle, replanifie un re-tri
      if (res && res.frYear && item.frYear !== res.frYear) {
        item.frYear = res.frYear;
        const metaEl = card.querySelector('.card-meta');
        if (metaEl) metaEl.innerHTML =
          `<i class="ti ti-${item.isSerie ? 'device-tv' : 'movie'}"></i> ${escH(res.frYear)}`;
        scheduleResort();
      }
      const url = res && res.poster;
      if (!url) return;
      const pw = document.getElementById(pwId);
      if (!pw) return;
      const img = new Image();
      img.src = url;
      img.alt = item.frTitle || item.title;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      img.onload = () => {
        const ph = pw.querySelector('.ph');
        if (ph) pw.replaceChild(img, ph);
      };
    });
  }
}

/* ── Rangée « Reprendre la lecture » ── */
function renderContinue() {
  const row = document.getElementById('continue-row');
  const wrap = document.getElementById('continue-items');
  if (!row || !wrap || !window.MaupiflixProgress) return;

  const entries = window.MaupiflixProgress.list();
  wrap.innerHTML = '';
  if (!entries.length) { row.hidden = true; return; }

  let count = 0;
  for (const entry of entries) {
    // Retrouver l'item du catalogue (par titre mémorisé)
    const item = CATALOG.find(it => it.title === entry.name || it.frTitle === entry.name);
    if (!item) continue;
    count++;

    const pct = entry.d > 0 ? Math.min(100, Math.round((entry.t / entry.d) * 100)) : 0;
    const displayTitle = item.frTitle || item.title;
    const sub = entry.isSerie && entry.label ? entry.label : (item.frYear || item.year || '');

    const card = document.createElement('div');
    card.className = 'card continue-card';
    card.dataset.file = entry.file;
    card.innerHTML = `
      <div class="poster">
        <div class="ph"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>${escH(displayTitle)}</span></div>
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
      </div>
      <div class="card-body">
        <div class="card-title" title="${escH(item.name)}">${escH(displayTitle)}</div>
        <div class="card-meta"><i class="ti ti-${item.isSerie ? 'device-tv' : 'movie'}"></i> ${escH(sub)}</div>
      </div>`;

    // Affiche TMDB en fond (réutilise getPoster)
    getPoster(item.title, item.year, item.isSerie).then(res => {
      const url = res && res.poster;
      if (!url) return;
      const pw = card.querySelector('.poster');
      if (!pw) return;
      const img = new Image();
      img.src = url;
      img.alt = displayTitle;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      img.onload = () => {
        const ph = pw.querySelector('.ph');
        if (ph) pw.replaceChild(img, ph);
      };
    });

    card.addEventListener('click', () => {
      openPlayer(item, entry.isSerie ? { season: entry.season, episode: entry.episode } : undefined);
    });
    wrap.appendChild(card);
  }
  row.hidden = count === 0;
}

// Rafraîchir la rangée à la fermeture du player (hook appelé dans player.js)
window.onPlayerClose = renderContinue;

/* ── Events ── */
document.getElementById('grid').addEventListener('click', e => {
  const vlc = e.target.closest('.btn-vlc');
  if (vlc && !vlc.disabled) { downloadM3U(vlc, CATALOG[+vlc.dataset.idx]); return; }
  // Laisser la dropdown d'épisodes agir sans déclencher la lecture
  if (e.target.closest('.ep-select')) return;
  const card = e.target.closest('.card');
  if (card) openPlayer(CATALOG[+card.dataset.idx]);
});

document.getElementById('grid').addEventListener('change', e => {
  const sel = e.target.closest('.ep-select');
  if (!sel || !sel.value) return;
  const [season, episode] = sel.value.split('-').map(Number);
  openPlayer(CATALOG[+sel.dataset.idx], { season, episode });
  sel.value = '';
});

const searchInput = document.getElementById('search');
const searchClear = document.getElementById('search-clear');
searchInput.addEventListener('input', () => {
  searchClear.hidden = !searchInput.value;
  render(filtered());
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.hidden = true;
  searchInput.focus();
  render(filtered());
});

document.querySelectorAll('.genre').forEach(g => g.addEventListener('click', () => {
  // Re-cliquer la catégorie déjà active la désélectionne (retour à "Tout").
  const deselect = g.dataset.genre === activeFilter && g.dataset.genre !== 'all';
  activeFilter = deselect ? 'all' : g.dataset.genre;
  document.querySelectorAll('.genre').forEach(x =>
    x.classList.toggle('active', x.dataset.genre === activeFilter));
  render(filtered());
}));

/* ── Recherche vocale (Web Speech API, si supportée) ── */
const micBtn = document.getElementById('search-mic');
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRec && micBtn) {
  const rec = new SpeechRec();
  rec.lang = 'fr-FR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  micBtn.addEventListener('click', () => {
    try { rec.start(); micBtn.classList.add('listening'); } catch (e) {}
  });
  rec.addEventListener('result', e => {
    const text = e.results[0][0].transcript;
    searchInput.value = text;
    searchClear.hidden = !text;
    render(filtered());
  });
  rec.addEventListener('end', () => micBtn.classList.remove('listening'));
  rec.addEventListener('error', () => micBtn.classList.remove('listening'));
} else if (micBtn) {
  micBtn.hidden = true;
}

/* ── Menu accessibilité ── */
(function () {
  const panel = document.getElementById('menu-panel');
  const btn = document.getElementById('menu-btn');
  const close = document.getElementById('menu-close');
  const backdrop = document.getElementById('menu-backdrop');
  const dyslexia = document.getElementById('opt-dyslexia');
  const contrast = document.getElementById('opt-contrast');
  const fsDec = document.getElementById('fs-dec');
  const fsInc = document.getElementById('fs-inc');
  const fsVal = document.getElementById('fs-val');
  if (!panel || !btn) return;

  const MIN = 80, MAX = 150;
  const store = {
    get: k => { try { return localStorage.getItem('a11y_' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('a11y_' + k, v); } catch (e) {} }
  };

  function applyFontSize(pct) {
    pct = Math.min(MAX, Math.max(MIN, pct));
    document.documentElement.style.setProperty('--fs', pct + '%');
    fsVal.textContent = pct + '%';
    // Mobile : moins de colonnes quand le texte grossit (3 → 2 → 1)
    document.body.classList.toggle('fs-2col', pct >= 120 && pct < 140);
    document.body.classList.toggle('fs-1col', pct >= 140);
    store.set('fs', pct);
    return pct;
  }
  let fontPct = applyFontSize(parseInt(store.get('fs'), 10) || 100);

  function applyToggle(el, cls, key, on) {
    document.body.classList.toggle(cls, on);
    el.checked = on;
    store.set(key, on ? '1' : '0');
  }
  applyToggle(dyslexia, 'dyslexia', 'dyslexia', store.get('dyslexia') === '1');
  applyToggle(contrast, 'hc', 'contrast', store.get('contrast') === '1');

  // Thèmes : couleur d'accent + couleur du texte sur l'accent
  const THEMES = {
    gold:   ['#e2b714', '#000'],
    red:    ['#e50914', '#fff'],
    blue:   ['#3b82f6', '#fff'],
    purple: ['#a855f7', '#fff'],
    green:  ['#22c55e', '#06210f'],
    pink:   ['#ec4899', '#fff']
  };
  const swatches = document.getElementById('menu-themes');
  function applyTheme(name) {
    const t = THEMES[name] || THEMES.gold;
    name = THEMES[name] ? name : 'gold';
    document.documentElement.style.setProperty('--accent', t[0]);
    document.documentElement.style.setProperty('--on-accent', t[1]);
    if (swatches) swatches.querySelectorAll('.theme-swatch').forEach(b =>
      b.classList.toggle('active', b.dataset.theme === name));
    if (window.MaupiflixFX) window.MaupiflixFX.setAccent(t[0]);
    store.set('theme', name);
  }
  applyTheme(store.get('theme') || 'gold');
  if (swatches) swatches.addEventListener('click', e => {
    const b = e.target.closest('.theme-swatch');
    if (b) applyTheme(b.dataset.theme);
  });

  // Effets visuels (pilotés par fx-core ; off par défaut si reduced-motion)
  const fxToggle = document.getElementById('opt-fx');
  if (fxToggle) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pref = store.get('fx');
    fxToggle.checked = (pref === null ? true : pref === '1') && !reduce;
    fxToggle.disabled = reduce;
    fxToggle.addEventListener('change', () => {
      if (window.MaupiflixFX) window.MaupiflixFX.setEnabled(fxToggle.checked);
      else store.set('fx', fxToggle.checked ? '1' : '0');
    });
  }

  function openMenu() { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('open')); btn.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { panel.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); setTimeout(() => { panel.hidden = true; }, 250); }

  btn.addEventListener('click', openMenu);
  close.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closeMenu(); });

  dyslexia.addEventListener('change', () => applyToggle(dyslexia, 'dyslexia', 'dyslexia', dyslexia.checked));
  contrast.addEventListener('change', () => applyToggle(contrast, 'hc', 'contrast', contrast.checked));
  fsDec.addEventListener('click', () => { fontPct = applyFontSize(fontPct - 10); });
  fsInc.addEventListener('click', () => { fontPct = applyFontSize(fontPct + 10); });
})();

/* ── Construction du catalogue depuis les items Jellyfin ──
      Bibliothèque à plat : chaque item = un fichier vidéo (type Movie).
      On parse le nom de fichier et on regroupe les épisodes par série. ── */
function buildCatalog(items) {
  const series = new Map();   // titre de série → item série
  const out = [];

  for (const it of items) {
    if (!it || !it.Id) continue;
    const filename = (it.Path ? it.Path.split(/[\\/]/).pop() : it.Name) || '';
    if (!filename) continue;
    const { title, year, isSerie, resolution } = parse(filename);

    if (isSerie) {
      const m = filename.match(/S(\d{2})E(\d{2})/i);
      const season  = m ? parseInt(m[1], 10) : 0;
      const episode = m ? parseInt(m[2], 10) : 0;
      let s = series.get(title);
      if (!s) {
        s = { type: 's', name: title, title, year, isSerie: true, resolution, episodes: [], _seen: new Set() };
        series.set(title, s);
        out.push(s);
      }
      const k = season + '-' + episode;
      if (s._seen.has(k)) continue;   // dédoublonnage (plusieurs versions d'un même épisode)
      s._seen.add(k);
      s.episodes.push({
        id: it.Id, season, episode, file: filename,
        label: m ? `S${m[1]}E${m[2]}`.toUpperCase() : title
      });
      if (!s.resolution && resolution) s.resolution = resolution;
    } else {
      out.push({ type: 'f', id: it.Id, name: filename, title, year, isSerie: false, resolution });
    }
  }

  // Tri des épisodes + nettoyage du helper interne
  for (const s of series.values()) {
    s.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    delete s._seen;
  }
  return out;
}

/* ── Démarrage ── */
loadResources().then(({ items }) => {
  CATALOG.length = 0;
  if (!items) {
    document.getElementById('status').textContent = 'Jellyfin injoignable — VPN activé ?';
    return;
  }
  buildCatalog(items).forEach(it => CATALOG.push(it));
  render(filtered());
  renderContinue();
});
