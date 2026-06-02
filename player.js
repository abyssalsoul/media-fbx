/* player.js — lecteur vidéo intégré avec support playlist */

(function () {
document.addEventListener('DOMContentLoaded', function () {

  const overlay  = document.getElementById('player-overlay');
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
      plPanel.style.display = 'block';
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
  // Le backdrop sert d'écran de chargement : on le masque dès que la vidéo démarre
  video.addEventListener('playing', () => backdrop.classList.remove('show'));

  document.getElementById('player-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  /* ── API publique ── */
  window.openPlayer = open;

}); // DOMContentLoaded
})();
