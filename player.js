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
  position: relative;
}

#player-backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  opacity: 0;
  transition: opacity .4s;
  pointer-events: none;
}
#player-backdrop.show { opacity: 1; }

#player-video {
  width: min(72vw, 1100px);
  max-height: 72vh;
  background: transparent;
  display: block;
  position: relative;
  z-index: 1;
}

/* ── Plein écran ── */
#player-overlay:fullscreen { background: #000; }
#player-overlay:fullscreen #player-box {
  width: 100vw; height: 100vh;
  max-width: 100vw; max-height: 100vh;
  border-radius: 0;
}
#player-overlay:fullscreen #player-video-col { flex: 1; min-height: 0; }
#player-overlay:fullscreen #player-video {
  width: 100%; height: 100%; max-height: none;
  object-fit: contain;
}
#player-overlay:fullscreen #player-info { z-index: 2; }

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
    <div id="player-backdrop"></div>
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
    </div>
    <div id="player-playlist-items"></div>
  </div>
</div>`;
  document.body.appendChild(overlay);

  const video    = document.getElementById('player-video');
  const title    = document.getElementById('player-title');
  const btnPrev  = document.getElementById('btn-prev');
  const btnNext  = document.getElementById('btn-next');
  const plPanel  = document.getElementById('player-playlist');
  const plItems  = document.getElementById('player-playlist-items');
  const backdrop = document.getElementById('player-backdrop');

  let playlist = [];   // épisodes Jellyfin dédupliqués
  let current  = 0;

  function renderPlItems() {
    plItems.innerHTML = playlist.map((ep, i) =>
      `<div class="pl-item" data-idx="${i}">${ep.label}</div>`
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

  let hlsInstance = null;
  let jellyfinCache = null;

  function cleanName(filename) {
    return filename.replace(/\.(mkv|mp4|avi|mov)$/i, '').replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ── Jellyfin : charger tous les items une fois ── */
  async function jellyfinLoadAll() {
    if (jellyfinCache) return jellyfinCache;
    const cfg = window.JELLYFIN_CONFIG;
    if (!cfg) return [];
    try {
      const url = `${cfg.base}/Users/${cfg.userId}/Items?IncludeItemTypes=Movie,Series&Recursive=true&Fields=Path&Limit=2000&api_key=${cfg.apiKey}`;
      const r = await fetch(url);
      const d = await r.json();
      jellyfinCache = d.Items || [];
    } catch { jellyfinCache = []; }
    return jellyfinCache;
  }

  /* ── Jellyfin : item dont le chemin contient le nom de fichier ──
        (toutes les vidéos sont des "Movie" à plat dans cette instance) ── */
  function findByFile(items, filename) {
    if (!filename) return null;
    const noExt = filename.replace(/\.(mkv|mp4|avi|mov)$/i, '');
    return items.find(i => i.Path && i.Path.includes(filename)) ||
           items.find(i => i.Path && i.Path.includes(noExt)) ||
           null;
  }

  /* ── Backdrop Jellyfin (avec repli sur l'image Primary) ── */
  function setBackdrop(id) {
    backdrop.classList.remove('show');
    backdrop.style.backgroundImage = '';
    const cfg = window.JELLYFIN_CONFIG;
    if (!cfg || !id) return;
    const urls = [
      `${cfg.base}/Items/${id}/Images/Backdrop?api_key=${cfg.apiKey}`,
      `${cfg.base}/Items/${id}/Images/Primary?api_key=${cfg.apiKey}`
    ];
    let i = 0;
    (function load() {
      if (i >= urls.length) return;
      const img = new Image();
      img.onload  = () => { backdrop.style.backgroundImage = `url("${urls[i]}")`; backdrop.classList.add('show'); };
      img.onerror = () => { i++; load(); };
      img.src = urls[i];
    })();
  }

  /* ── Jellyfin : URL HLS transcodé ── */
  function jellyfinHlsUrl(itemId) {
    const cfg = window.JELLYFIN_CONFIG;
    const deviceId = 'maupiflix-browser';
    return `${cfg.base}/Videos/${itemId}/master.m3u8?DeviceId=${deviceId}&UserId=${cfg.userId}&api_key=${cfg.apiKey}&VideoCodec=h264&AudioCodec=aac&AudioSampleRate=44100&MaxAudioChannels=2&TranscodingContainer=ts&MediaSourceId=${itemId}`;
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
    setBackdrop(ep.id);
    playUrl(ep.url);
    title.textContent = ep.label;
    btnPrev.disabled = index <= 0;
    btnNext.disabled = index >= playlist.length - 1;
    highlightActive();
  }

  /* ── Ouverture du lecteur.
        start (optionnel) = { season, episode } : épisode sur lequel démarrer ── */
  async function open(item, start) {
    playlist = [];
    current = 0;
    overlay.classList.add('open');
    // Plein écran : demandé ici, avant tout await, pour rester dans le geste utilisateur
    if (overlay.requestFullscreen) overlay.requestFullscreen().catch(() => {});
    title.textContent = '⏳ Chargement…';
    plPanel.style.display = 'none';
    plItems.innerHTML = '';

    const cfg = window.JELLYFIN_CONFIG;

    if (cfg) {
      const items = await jellyfinLoadAll();
      if (item.isSerie && item.files && item.files.length) {
        // Chaque épisode est matché par son nom de fichier .mkv
        const seen = new Set();
        for (const f of item.files) {
          const fname = f.split('/').pop();
          const jItem = findByFile(items, fname);
          if (!jItem) continue;
          const se = fname.match(/S(\d{2})E(\d{2})/i);
          const season  = se ? parseInt(se[1], 10) : 0;
          const episode = se ? parseInt(se[2], 10) : 0;
          const key = `${season}-${episode}`;
          if (seen.has(key)) continue;
          seen.add(key);
          playlist.push({
            id: jItem.Id,
            url: jellyfinHlsUrl(jItem.Id),
            label: se ? `S${se[1]}E${se[2]}` : cleanName(fname),
            season, episode
          });
        }
        playlist.sort((a, b) => a.season - b.season || a.episode - b.episode);
      } else {
        const jItem = findByFile(items, item.name) || findByFile(items, item.name + '.mkv');
        if (jItem) {
          playlist = [{
            id: jItem.Id,
            url: jellyfinHlsUrl(jItem.Id),
            label: item.title + (item.year ? ' (' + item.year + ')' : ''),
            season: null, episode: null
          }];
        }
      }
    }

    if (!playlist.length) {
      title.textContent = '';
      exitFs();
      overlay.classList.remove('open');
      alert('Introuvable dans Jellyfin.\nVérifiez que Jellyfin est démarré et que le contenu est bien dans la bibliothèque.');
      return;
    }

    if (playlist.length > 1) {
      plPanel.style.display = '';
      renderPlItems();
    }

    let startIdx = 0;
    if (start) {
      const i = playlist.findIndex(ep => ep.season === start.season && ep.episode === start.episode);
      if (i >= 0) startIdx = i;
    }
    play(startIdx);
  }

  function exitFs() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function close() {
    exitFs();
    overlay.classList.remove('open');
    backdrop.classList.remove('show');
    backdrop.style.backgroundImage = '';
    video.pause();
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    video.src = '';
  }

  /* ── Events ── */
  btnPrev.addEventListener('click', () => { if (current > 0) play(current - 1); });
  btnNext.addEventListener('click', () => { if (current < playlist.length - 1) play(current + 1); });
  video.addEventListener('ended', () => { if (current < playlist.length - 1) play(current + 1); });

  document.getElementById('player-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  /* ── API publique ── */
  window.openPlayer = open;

}); // DOMContentLoaded
})();
