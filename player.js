/* player.js — lecteur vidéo intégré avec support playlist */

(function () {
document.addEventListener('DOMContentLoaded', function () {

  /* ── Injection CSS ── */
  const style = document.createElement('style');
  style.textContent = `
#player-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.88);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
#player-overlay.open { display: flex; }

#player-box {
  display: flex;
  gap: 0;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  max-width: 95vw;
  max-height: 90vh;
  box-shadow: 0 8px 40px rgba(0,0,0,.7);
}

#player-video-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

#player-video {
  width: min(72vw, 1100px);
  max-height: 72vh;
  background: #000;
  display: block;
}

#player-info {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #111;
}

#player-title {
  flex: 1;
  font-size: .95rem;
  color: #e2b714;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#player-nav { display: flex; gap: 6px; }

#player-nav button, #player-close {
  background: #2a2a2a;
  border: 1px solid #333;
  color: #ccc;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: .85rem;
}
#player-nav button:hover, #player-close:hover { background: #3a3a3a; color: #fff; }
#player-nav button:disabled { opacity: .3; cursor: default; }

#player-close {
  margin-left: auto;
  color: #aaa;
  padding: 4px 8px;
}

#player-playlist {
  width: 220px;
  overflow-y: auto;
  background: #141414;
  border-left: 1px solid #2a2a2a;
}

#player-playlist-header {
  position: sticky;
  top: 0;
  background: #141414;
  border-bottom: 1px solid #222;
}

#player-playlist-title {
  padding: 10px 12px 6px;
  font-size: .78rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: .05em;
}

#player-season-select {
  display: block;
  width: calc(100% - 24px);
  margin: 0 12px 8px;
  background: #1e1e1e;
  color: #ccc;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: .82rem;
  cursor: pointer;
}
#player-season-select:focus { outline: none; border-color: #e2b714; }

.pl-item {
  padding: 9px 12px;
  font-size: .82rem;
  color: #bbb;
  cursor: pointer;
  border-bottom: 1px solid #1e1e1e;
  line-height: 1.3;
  transition: background .1s;
}
.pl-item:hover { background: #1e1e1e; color: #fff; }
.pl-item.active { background: #e2b71422; color: #e2b714; border-left: 3px solid #e2b714; padding-left: 9px; }
`;
  document.head.appendChild(style);

  /* ── Structure HTML ── */
  const overlay = document.createElement('div');
  overlay.id = 'player-overlay';
  overlay.innerHTML = `
<div id="player-box">
  <div id="player-video-col">
    <video id="player-video" controls></video>
    <div id="player-info">
      <span id="player-title"></span>
      <div id="player-nav">
        <button id="btn-prev">◀ Préc.</button>
        <button id="btn-next">Suiv. ▶</button>
      </div>
      <button id="player-close">✕</button>
    </div>
  </div>
  <div id="player-playlist" style="display:none">
    <div id="player-playlist-header">
      <div id="player-playlist-title">Épisodes</div>
      <select id="player-season-select" style="display:none"></select>
    </div>
    <div id="player-playlist-items"></div>
  </div>
</div>`;
  document.body.appendChild(overlay);

  const video        = document.getElementById('player-video');
  const title        = document.getElementById('player-title');
  const btnPrev      = document.getElementById('btn-prev');
  const btnNext      = document.getElementById('btn-next');
  const plPanel      = document.getElementById('player-playlist');
  const plItems      = document.getElementById('player-playlist-items');
  const seasonSelect = document.getElementById('player-season-select');

  let playlist = [];   // tous les épisodes (toutes saisons)
  let current  = 0;    // index dans playlist (pas dans la vue filtrée)

  /* ── Saison active ── */
  let activeSeason = null;   // null = toutes

  function seasonOf(ep) {
    if (ep.season != null) return ep.season;
    const m = ep.label.match(/S(\d{2})E/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  function visiblePlaylist() {
    if (activeSeason === null) return playlist;
    return playlist.filter(ep => seasonOf(ep) === activeSeason);
  }

  function renderSeasonSelect() {
    const seasons = [...new Set(playlist.map(ep => seasonOf(ep)))].sort((a, b) => a - b);
    if (seasons.length <= 1) { seasonSelect.style.display = 'none'; return; }

    seasonSelect.style.display = '';
    seasonSelect.innerHTML =
      `<option value="">Toutes les saisons</option>` +
      seasons.map(s => `<option value="${s}">Saison ${String(s).padStart(2, '0')}</option>`).join('');
    seasonSelect.value = activeSeason != null ? String(activeSeason) : '';
  }

  function renderPlItems() {
    const visible = visiblePlaylist();
    plItems.innerHTML = visible.map((ep, i) =>
      `<div class="pl-item" data-idx="${playlist.indexOf(ep)}">${ep.label}</div>`
    ).join('');
    plItems.querySelectorAll('.pl-item').forEach(el => {
      el.addEventListener('click', () => play(+el.dataset.idx));
    });
    highlightActive();
  }

  function highlightActive() {
    plItems.querySelectorAll('.pl-item').forEach(el => {
      el.classList.toggle('active', +el.dataset.idx === current);
    });
    const active = plItems.querySelector('.pl-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function episodeLabel(filename) {
    return filename
      .replace(/\.(mkv|mp4|avi)$/i, '')
      .replace(/[._]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  let hlsInstance = null;
  let jellyfinCache = null;

  /* ── Jellyfin : charger tous les items une fois ── */
  async function jellyfinLoadAll() {
    if (jellyfinCache) return jellyfinCache;
    const cfg = window.JELLYFIN_CONFIG;
    if (!cfg) return [];
    try {
      const url = `${cfg.base}/Users/${cfg.userId}/Items?IncludeItemTypes=Movie,Series&Recursive=true&Fields=Path&Limit=1000&api_key=${cfg.apiKey}`;
      const r = await fetch(url);
      const d = await r.json();
      jellyfinCache = d.Items || [];
    } catch { jellyfinCache = []; }
    return jellyfinCache;
  }

  /* ── Jellyfin : trouver un item dont le Path contient item.name ── */
  async function jellyfinSearch(item) {
    const items = await jellyfinLoadAll();
    // type "s" : chercher par nom de série, avec repli sur le chemin
    if (item.type === 's') {
      const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const name = norm(item.name);
      return items.find(i => i.Type === 'Series' && norm(i.Name) === name) ||
             items.find(i => i.Type === 'Series' && norm(i.Name).includes(name)) ||
             items.find(i => i.Path && norm(i.Path).includes(name)) ||
             null;
    }
    // type "d" ou "f" : matcher par chemin de fichier
    return items.find(i => i.Path && i.Path.includes(item.name)) || null;
  }

  /* ── Jellyfin : URL HLS transcodé ── */
  function jellyfinHlsUrl(itemId) {
    const cfg = window.JELLYFIN_CONFIG;
    const deviceId = 'maupiflix-browser';
    return `${cfg.base}/Videos/${itemId}/master.m3u8?DeviceId=${deviceId}&UserId=${cfg.userId}&api_key=${cfg.apiKey}&VideoCodec=h264&AudioCodec=aac&AudioSampleRate=44100&MaxAudioChannels=2&TranscodingContainer=ts&MediaSourceId=${itemId}`;
  }

  /* ── Jellyfin : items d'une série ── */
  async function jellyfinEpisodes(seriesId) {
    const cfg = window.JELLYFIN_CONFIG;
    const url = `${cfg.base}/Shows/${seriesId}/Episodes?UserId=${cfg.userId}&api_key=${cfg.apiKey}&Fields=Name,IndexNumber,ParentIndexNumber`;
    try {
      const r = await fetch(url);
      const d = await r.json();
      return d.Items || [];
    } catch { return []; }
  }

  /* ── Lecture avec HLS.js si nécessaire ── */
  function playUrl(url) {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    if (url.includes('.m3u8') && window.Hls && Hls.isSupported()) {
      hlsInstance = new Hls();
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else {
      video.src = url;
      video.play().catch(() => {});
    }
  }

  function play(index) {
    current = index;
    const ep = playlist[index];
    playUrl(ep.url);
    title.textContent = ep.label;

    const visible = visiblePlaylist();
    const visIdx  = visible.indexOf(ep);
    btnPrev.disabled = visIdx <= 0;
    btnNext.disabled = visIdx >= visible.length - 1;

    highlightActive();
  }

  async function open(item) {
    playlist = [];
    activeSeason = null;
    overlay.classList.add('open');
    title.textContent = '⏳ Chargement…';
    plPanel.style.display = 'none';
    plItems.innerHTML = '';
    seasonSelect.style.display = 'none';
    seasonSelect.innerHTML = '';

    const cfg = window.JELLYFIN_CONFIG;

    if (cfg) {
      // ── Jellyfin disponible : stream transcodé ──
      const jItem = await jellyfinSearch(item);

      if (jItem) {
        if (item.isSerie) {
          // Série : récupérer tous les épisodes
          const seriesId = jItem.SeriesId || jItem.Id;
          const eps = await jellyfinEpisodes(seriesId);
          if (eps.length) {
            playlist = eps.map(e => ({
              url: jellyfinHlsUrl(e.Id),
              label: `S${String(e.ParentIndexNumber).padStart(2,'0')}E${String(e.IndexNumber).padStart(2,'0')} — ${e.Name}`,
              season: e.ParentIndexNumber
            }));
          }
        }

        if (!playlist.length) {
          // Film ou série sans épisodes trouvés
          playlist = [{ url: jellyfinHlsUrl(jItem.Id), label: item.title + (item.year ? ' (' + item.year + ')' : ''), season: null }];
        }
      }
    }

    // ── Introuvable dans Jellyfin ──
    if (!playlist.length) {
      title.textContent = '';
      overlay.classList.remove('open');
      alert('Introuvable dans Jellyfin.\nVérifiez que Jellyfin est démarré et que le film est bien dans la bibliothèque.');
      return;
    }

    // Panneau playlist si > 1 épisode
    if (playlist.length > 1) {
      plPanel.style.display = '';
      renderSeasonSelect();
      renderPlItems();
    }

    play(0);
  }

  function close() {
    overlay.classList.remove('open');
    video.pause();
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    video.src = '';
  }

  /* ── Events ── */
  btnPrev.addEventListener('click', () => {
    const visible = visiblePlaylist();
    const visIdx = visible.findIndex(ep => playlist.indexOf(ep) === current);
    if (visIdx > 0) play(playlist.indexOf(visible[visIdx - 1]));
  });
  btnNext.addEventListener('click', () => {
    const visible = visiblePlaylist();
    const visIdx = visible.findIndex(ep => playlist.indexOf(ep) === current);
    if (visIdx < visible.length - 1) play(playlist.indexOf(visible[visIdx + 1]));
  });
  video.addEventListener('ended', () => {
    const visible = visiblePlaylist();
    const visIdx = visible.findIndex(ep => playlist.indexOf(ep) === current);
    if (visIdx < visible.length - 1) play(playlist.indexOf(visible[visIdx + 1]));
  });

  seasonSelect.addEventListener('change', () => {
    const val = seasonSelect.value;
    activeSeason = val === '' ? null : parseInt(val, 10);
    renderPlItems();
    // Jouer le premier épisode de la saison sélectionnée
    const visible = visiblePlaylist();
    if (visible.length) play(playlist.indexOf(visible[0]));
  });

  document.getElementById('player-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  /* ── API publique ── */
  window.openPlayer = open;

}); // DOMContentLoaded
})();
