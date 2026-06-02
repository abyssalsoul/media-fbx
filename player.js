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

#player-playlist-title {
  padding: 10px 12px;
  font-size: .78rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: .05em;
  border-bottom: 1px solid #222;
  position: sticky;
  top: 0;
  background: #141414;
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
    <div id="player-playlist-title">Épisodes</div>
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

  let playlist = [];
  let current  = 0;

  function episodeLabel(filename) {
    return filename
      .replace(/\.(mkv|mp4|avi)$/i, '')
      .replace(/[._]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  let hlsInstance = null;

  /* ── Jellyfin : chercher un item par titre ── */
  async function jellyfinSearch(title, isSerie) {
    const cfg = window.JELLYFIN_CONFIG;
    if (!cfg) return null;
    const type = isSerie ? 'Episode,Series' : 'Movie';
    const url = `${cfg.base}/Users/${cfg.userId}/Items?searchTerm=${encodeURIComponent(title)}&IncludeItemTypes=${type}&Limit=5&Recursive=true&api_key=${cfg.apiKey}`;
    try {
      const r = await fetch(url);
      const d = await r.json();
      return d.Items?.[0] || null;
    } catch { return null; }
  }

  /* ── Jellyfin : URL HLS transcodé ── */
  function jellyfinHlsUrl(itemId) {
    const cfg = window.JELLYFIN_CONFIG;
    return `${cfg.base}/Videos/${itemId}/master.m3u8?api_key=${cfg.apiKey}&VideoCodec=h264&AudioCodec=aac&AudioSampleRate=44100&MaxAudioChannels=2&TranscodingContainer=ts`;
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
    } else {
      video.src = url;
      video.load();
    }
  }

  function play(index) {
    current = index;
    const ep = playlist[index];
    playUrl(ep.url);
    title.textContent = ep.label;

    btnPrev.disabled = index === 0;
    btnNext.disabled = index === playlist.length - 1;

    plItems.querySelectorAll('.pl-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
    const active = plItems.querySelector('.pl-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  async function open(item) {
    playlist = [];
    overlay.classList.add('open');
    title.textContent = '⏳ Chargement…';
    plPanel.style.display = 'none';
    plItems.innerHTML = '';

    const cfg = window.JELLYFIN_CONFIG;

    if (cfg) {
      // ── Jellyfin disponible : stream transcodé ──
      const jItem = await jellyfinSearch(item.title, item.isSerie);

      if (jItem) {
        if (item.isSerie) {
          // Série : récupérer tous les épisodes
          const seriesId = jItem.SeriesId || jItem.Id;
          const eps = await jellyfinEpisodes(seriesId);
          if (eps.length) {
            playlist = eps.map(e => ({
              url: jellyfinHlsUrl(e.Id),
              label: `S${String(e.ParentIndexNumber).padStart(2,'0')}E${String(e.IndexNumber).padStart(2,'0')} — ${e.Name}`
            }));
          }
        }

        if (!playlist.length) {
          // Film ou série sans épisodes trouvés
          playlist = [{ url: jellyfinHlsUrl(jItem.Id), label: item.title + (item.year ? ' (' + item.year + ')' : '') }];
        }
      }
    }

    // ── Fallback : URL directe Freebox ──
    if (!playlist.length) {
      if (item.type === 'f') {
        playlist = [{ url: item.url, label: item.title + (item.year ? ' (' + item.year + ')' : '') }];
      } else if (item.files && item.files.length) {
        playlist = item.files.map(f => ({
          url: BASE + encodeURIComponent(item.name) + '/' + f.split('/').map(encodeURIComponent).join('/'),
          label: episodeLabel(f.split('/').pop())
        }));
      } else {
        alert('Introuvable dans Jellyfin et aucune liste d\'épisodes.\nRelancez update_catalog.ps1.');
        overlay.classList.remove('open');
        return;
      }
    }

    // Panneau playlist si > 1 épisode
    if (playlist.length > 1) {
      plPanel.style.display = '';
      plItems.innerHTML = playlist.map((ep, i) =>
        `<div class="pl-item" data-i="${i}">${ep.label}</div>`
      ).join('');
      plItems.querySelectorAll('.pl-item').forEach(el => {
        el.addEventListener('click', () => play(+el.dataset.i));
      });
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
  btnPrev.addEventListener('click', () => { if (current > 0) play(current - 1); });
  btnNext.addEventListener('click', () => { if (current < playlist.length - 1) play(current + 1); });
  document.getElementById('player-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  video.addEventListener('ended', () => { if (current < playlist.length - 1) play(current + 1); });

  /* ── API publique ── */
  window.openPlayer = open;

}); // DOMContentLoaded
})();
