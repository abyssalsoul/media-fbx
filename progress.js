/* progress.js — mémorisation de l'état de lecture (localStorage)
   Clés : pw_<nom de fichier>. Valeur JSON : { t, d, name, isSerie, season, episode, label, ts } */

(function () {
  const PREFIX = 'pw_';
  const MIN_SECONDS = 10;   // ne rien sauvegarder sous 10 s de lecture
  const DONE_RATIO  = 0.90; // >= 90 % = terminé → on efface

  function key(file) { return PREFIX + file; }

  function get(file) {
    if (!file) return null;
    try {
      const raw = localStorage.getItem(key(file));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function remove(file) {
    if (!file) return;
    try { localStorage.removeItem(key(file)); } catch (e) {}
  }

  /* save(file, { t, d, name, isSerie, season, episode, label })
     - ignore si lecture trop courte
     - efface (au lieu de sauver) si quasi terminé */
  function save(file, data) {
    if (!file || !data) return;
    const t = data.t || 0;
    const d = data.d || 0;
    if (t < MIN_SECONDS) return;
    if (d > 0 && t / d >= DONE_RATIO) { remove(file); return; }
    try {
      localStorage.setItem(key(file), JSON.stringify({
        t: t, d: d,
        name: data.name || '',
        isSerie: !!data.isSerie,
        season: data.season != null ? data.season : null,
        episode: data.episode != null ? data.episode : null,
        label: data.label || '',
        ts: Date.now()
      }));
    } catch (e) {}
  }

  /* list() → toutes les entrées { file, ...valeur }, triées par ts décroissant */
  function list() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(PREFIX) !== 0) continue;
        try {
          const v = JSON.parse(localStorage.getItem(k));
          if (v) out.push(Object.assign({ file: k.slice(PREFIX.length) }, v));
        } catch (e) {}
      }
    } catch (e) {}
    out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return out;
  }

  window.MaupiflixProgress = { key, get, save, remove, list };
})();
