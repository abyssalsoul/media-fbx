/* app.js — catalogue Médiathèque Freebox */

const BASE = 'https://stream.maupiflix.com/share/fU07_4Ej17-jFYh3/';
let TMDB_KEY = '';

/* ── Chargement : films.json + tmdb.key ── */
async function loadResources() {
  const [catalogRes, keyRes] = await Promise.allSettled([
    fetch('films.json').then(r => r.json()),
    fetch('tmdb.key').then(r => r.text())
  ]);

  const raw = catalogRes.status === 'fulfilled' ? catalogRes.value : [];

  if (keyRes.status === 'fulfilled') {
    const key = keyRes.value.trim();
    if (key && !key.startsWith('COLLE_')) TMDB_KEY = key;
  }

  return raw;
}

let RAW = [];

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

/* ── Construire l'URL vidéo ── */
function videoUrl(type, name) {
  if (type === 'f') return BASE + encodeURIComponent(name.trim());
  // dossier: BASE/FOLDER/FOLDER.mkv
  const folder = encodeURIComponent(name);
  return BASE + folder + '/' + encodeURIComponent(name + '.mkv');
}

function folderUrl(name) {
  return BASE + encodeURIComponent(name) + '/';
}

/* ── Épisodes d'une série, déduits des fichiers du catalogue ── */
function parseEpisodes(item) {
  const seen = new Set();
  const eps = [];
  for (const f of (item.files || [])) {
    const fname = f.split('/').pop();
    const m = fname.match(/S(\d{2})E(\d{2})/i);
    if (!m) continue;
    const season = parseInt(m[1], 10);
    const episode = parseInt(m[2], 10);
    const key = `${season}-${episode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    eps.push({ season, episode, label: `S${m[1]}E${m[2].toUpperCase()}`.toUpperCase() });
  }
  eps.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return eps;
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

  // Fichier direct → M3U immédiat
  if (item.type === 'f') {
    _triggerM3U(label + '.m3u', '#EXTM3U\n#EXTINF:-1,' + label + '\n' + item.url);
    return;
  }

  // Dossier / série avec liste pré-scannée (update_catalog.ps1)
  if (item.files && item.files.length) {
    const lines = ['#EXTM3U'];
    for (const f of item.files) {
      const t = f.replace(/\.(mkv|mp4|avi)$/i, '').replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
      // f peut être "ep.mkv" ou "Saison1/ep.mkv"
      const url = BASE + encodeURIComponent(item.name) + '/' + f.split('/').map(encodeURIComponent).join('/');
      lines.push('#EXTINF:-1,' + t, url);
    }
    _triggerM3U(label + '.m3u', lines.join('\n'));
    return;
  }

  alert('Aucune vidéo listée pour « ' + item.name +' ».\nRelancez update_catalog.ps1 pour rescanner.');
}

/* ── Filtre & tri ── */
let activeCategory = 'all';

function filtered() {
  const q = document.getElementById('search').value.toLowerCase();
  const sort = document.getElementById('sort').value;
  let list = CATALOG.filter(item => {
    if (activeCategory === 'film' && item.isSerie) return false;
    if (activeCategory === 'serie' && !item.isSerie) return false;
    return !q || item.title.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
  });
  list.sort((a, b) => {
    if (sort === 'alpha') return a.title.localeCompare(b.title);
    if (sort === 'year-desc') return (b.year || '0') > (a.year || '0') ? 1 : -1;
    if (sort === 'year-asc') return (a.year || '9') > (b.year || '9') ? 1 : -1;
    return 0;
  });
  return list;
}

/* ── Rendu ── */
function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let loaded = 0;
async function render(list) {
  loaded = 0;
  const st = document.getElementById('poster-status');
  if (st) st.textContent = '';
  document.getElementById('counter').textContent = list.length + ' éléments';
  document.getElementById('status').textContent = CATALOG.length + ' éléments détectés sur le partage Freebox';
  const grid = document.getElementById('grid');
  if (!list.length) { grid.innerHTML = '<div id="empty">Aucun résultat.</div>'; return; }
  grid.innerHTML = '';
  for (const item of list) {
    const idx = CATALOG.indexOf(item);
    const card = document.createElement('div');
    card.className = 'card';
    const badgeHtml = item.resolution === '4K'
      ? '<span class="badge uhd">4K</span>'
      : item.resolution === '1080p' ? '<span class="badge">HD</span>' : '';
    const browseBtn = item.type === 'd'
      ? `<a class="btn-browse" href="${escH(folderUrl(item.name))}" target="_blank">📂 Parcourir</a>`
      : '';

    // Série : dropdown listant les épisodes. Film : bouton Lire.
    let playControl;
    if (item.isSerie) {
      const eps = parseEpisodes(item);
      if (eps.length) {
        const opts = eps.map(e =>
          `<option value="${e.season}-${e.episode}">${escH(e.label)}</option>`
        ).join('');
        playControl = `<select class="ep-select" data-idx="${idx}"><option value="">▶ Choisir un épisode…</option>${opts}</select>`;
      } else {
        playControl = `<button class="btn-play" data-idx="${idx}">▶ Lire</button>`;
      }
    } else {
      playControl = `<button class="btn-play" data-idx="${idx}">▶ Lire</button>`;
    }

    card.innerHTML = `
      <div class="poster" id="pw${grid.children.length}">
        <div class="ph"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg><span>${escH(item.title)}</span></div>
        ${badgeHtml}
      </div>
      <div class="card-body">
        <div class="card-title" title="${escH(item.name)}">${escH(item.title)}</div>
        <div class="card-meta">${item.isSerie ? '📺' : '🎬'} ${item.year || '—'}</div>
        ${playControl}
        <button class="btn-vlc" data-idx="${idx}">⬇ Playlist VLC</button>
        ${browseBtn}
      </div>`;
    grid.appendChild(card);
    const pwId = 'pw' + (grid.children.length - 1);
    getPoster(item.title, item.year, item.isSerie).then(url => {
      if (!url) return;
      const pw = document.getElementById(pwId);
      if (!pw) return;
      const img = new Image();
      img.src = url;
      img.alt = item.title;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      img.onload = () => {
        const ph = pw.querySelector('.ph');
        if (ph) pw.replaceChild(img, ph);
        loaded++;
        const st = document.getElementById('poster-status');
        if (!st) return;
        const src = TMDB_KEY ? '🎬 TMDB' : '🎵 iTunes';
        if (loaded >= list.length) {
          st.style.color = '#4caf50';
          st.textContent = `✓ ${loaded} affiches (${src})`;
        } else {
          st.style.color = '#e2b714';
          st.textContent = `⬇ ${loaded} / ${list.length} (${src})`;
        }
      };
    });
  }
}

/* ── Events ── */
document.getElementById('grid').addEventListener('click', e => {
  const vlc = e.target.closest('.btn-vlc');
  if (vlc && !vlc.disabled) downloadM3U(vlc, CATALOG[+vlc.dataset.idx]);
  const play = e.target.closest('.btn-play');
  if (play) openPlayer(CATALOG[+play.dataset.idx]);
});

document.getElementById('grid').addEventListener('change', e => {
  const sel = e.target.closest('.ep-select');
  if (!sel || !sel.value) return;
  const [season, episode] = sel.value.split('-').map(Number);
  openPlayer(CATALOG[+sel.dataset.idx], { season, episode });
  sel.value = '';
});

document.getElementById('search').addEventListener('input', () => render(filtered()));
document.getElementById('sort').addEventListener('change', () => render(filtered()));
document.querySelectorAll('.pill').forEach(p => p.addEventListener('click', () => {
  document.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  activeCategory = p.dataset.cat;
  render(filtered());
}));

/* ── Démarrage ── */
loadResources().then(raw => {
  RAW = raw;
  CATALOG.length = 0;
  RAW.forEach(([type, name, files]) => {
    // Ignorer les dossiers sans aucune vidéo (audio, livres, métadonnées…)
    if (type === 'd' && Array.isArray(files) && files.length === 0) return;
    const { title, year, isSerie: isSerieDetected, resolution } = parse(name);
    const isSerie = type === 's' ? true : isSerieDetected;
    const url = type === 'f' ? videoUrl(type, name) : '';
    CATALOG.push({ type, name, title, year, isSerie, resolution, url, files: files || null });
  });
  render(filtered());
});
