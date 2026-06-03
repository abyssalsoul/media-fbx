/* fx-core.js — cœur partagé des effets shaders (glslCanvas)
   - état activé global (toggle a11y_fx + prefers-reduced-motion)
   - couleur d'accent du thème → uniform u_accent
   - bus d'événements + MutationObserver sur #player-overlay
   - règle « un seul canvas actif à la fois » (perf mobile)
*/
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // DPR plafonné pour limiter le coût GPU sur mobile
  const DPR = Math.min(window.devicePixelRatio || 1, 1.25);

  const registered = [];   // descripteurs en attente d'init
  const modules = [];      // modules initialisés
  let enabled = false;
  let activeName = null;
  let accent = [0.886, 0.718, 0.078]; // #e2b714 par défaut

  function glAvailable() { return typeof window.GlslCanvas === 'function'; }

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem('a11y_' + k);
      localStorage.setItem('a11y_' + k, v);
    } catch (e) { return null; }
  }

  function hexToVec3(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return accent;
    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  /* ── Bus d'événements ── */
  const listeners = {};
  function on(evt, cb) { (listeners[evt] || (listeners[evt] = [])).push(cb); }
  function emit(evt) { (listeners[evt] || []).forEach(cb => { try { cb(); } catch (e) {} }); }

  /* ── Création d'un canvas glslCanvas ── */
  function makeSandbox(el, frag, scale) {
    const s = new window.GlslCanvas(el);
    s.realToCSSPixels = DPR * (scale || 1); // cap + sous-échantillonnage
    s.load(frag);
    s.setUniform('u_accent', accent[0], accent[1], accent[2]);
    s.pause();
    return s;
  }

  /* ── register({ name, el, frag, scale }) ── */
  function register(desc) {
    registered.push(desc);
    if (enabled) initOne(desc);
  }

  function initOne(desc) {
    if (modules.find(m => m.name === desc.name)) return;
    if (!glAvailable() || !desc.el) return;
    let sandbox = null;
    const m = {
      name: desc.name,
      el: desc.el,
      playing: false,
      _ensure() {
        if (!sandbox) {
          try { sandbox = makeSandbox(desc.el, desc.frag, desc.scale); }
          catch (e) { sandbox = null; }
        }
        return sandbox;
      },
      play() {
        const s = this._ensure();
        if (s && !this.playing) { s.play(); this.playing = true; kick(); }
        desc.el.classList.add('fx-on');
      },
      pause() {
        if (sandbox && this.playing) { sandbox.pause(); this.playing = false; }
        desc.el.classList.remove('fx-on');
      },
      setAccent(a) { if (sandbox) sandbox.setUniform('u_accent', a[0], a[1], a[2]); },
      get sandbox() { return sandbox; }
    };
    modules.push(m);
  }

  function get(name) { return modules.find(m => m.name === name); }

  /* ── un seul canvas actif à la fois ── */
  function activate(name) {
    if (!enabled) return;
    activeName = name;
    modules.forEach(m => { if (m.name === name) m.play(); else m.pause(); });
  }
  function deactivate(name) {
    const m = get(name);
    if (m) m.pause();
    if (activeName === name) activeName = null;
  }

  function pauseAll() { modules.forEach(m => m.pause()); activeName = null; }

  /* ── Boucle de rendu maison ──
     glslCanvas 0.2.6 n'auto-rend QUE les éléments à classe .glslCanvas découverts
     au load ; nos canvases créés via `new GlslCanvas(el)` ne sont jamais animés.
     On pilote donc nous-mêmes le rendu des modules en lecture (1 RAF tant qu'actif). */
  let rafId = null;
  function frame() {
    let any = false;
    modules.forEach(m => {
      if (m.playing && m.sandbox) {
        try { m.sandbox.render(); } catch (e) {}
        any = true;
      }
    });
    rafId = any ? requestAnimationFrame(frame) : null;
  }
  function kick() { if (rafId == null) rafId = requestAnimationFrame(frame); }

  /* ── activé global ── */
  function computeEnabled() {
    const pref = store('fx');
    const want = pref === null ? true : pref === '1'; // ON par défaut…
    return want && !reduceMotion.matches;              // …sauf reduced-motion
  }

  function apply() {
    enabled = computeEnabled();
    document.body.classList.toggle('fx-off', !enabled || !glAvailable());
    if (enabled && glAvailable()) {
      registered.forEach(initOne);
      syncFromOverlay(); // relance l'état courant
    } else {
      pauseAll();
    }
  }

  function setEnabled(v) { store('fx', v ? '1' : '0'); apply(); }

  /* ── Synchro player via classes de #player-overlay ── */
  function syncFromOverlay() {
    const ov = document.getElementById('player-overlay');
    if (!ov || !ov.classList.contains('open')) { emit('browse'); return; }
    emit('player:open');
    emit(ov.classList.contains('loading') ? 'player:loading' : 'player:playing');
  }

  function watchOverlay() {
    const ov = document.getElementById('player-overlay');
    if (!ov) return;
    let prevOpen = ov.classList.contains('open');
    let prevLoading = ov.classList.contains('loading');
    new MutationObserver(() => {
      const open = ov.classList.contains('open');
      const loading = ov.classList.contains('loading');
      if (open !== prevOpen) {
        if (open) emit('player:open');
        else { emit('player:close'); emit('browse'); }
        prevOpen = open;
      }
      if (open && loading !== prevLoading) {
        emit(loading ? 'player:loading' : 'player:playing');
        prevLoading = loading;
      }
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── API publique ── */
  window.MaupiflixFX = {
    register, on, emit, activate, deactivate, get,
    DPR,
    setAccent(hex) {
      accent = hexToVec3(hex);
      modules.forEach(m => m.setAccent(accent));
    },
    setEnabled,
    get enabled() { return enabled; },
    get activeName() { return activeName; },
    _debug() {
      return { enabled, activeName, glAvailable: glAvailable(),
               modules: modules.map(m => ({ name: m.name, playing: m.playing })) };
    }
  };

  /* ── Démarrage (après que les modules defer se soient enregistrés) ── */
  function start() {
    // Seed l'accent depuis la variable CSS --accent (déjà posée par app.js/applyTheme)
    const cssAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    if (cssAccent) accent = hexToVec3(cssAccent);
    watchOverlay();
    apply();
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', apply);
  }
  // Les modules d'effets sont chargés (defer) APRÈS ce fichier ; on attend donc
  // DOMContentLoaded (qui suit l'exécution de tous les scripts defer) pour que
  // les listeners soient bien enregistrés avant le premier emit('browse').
  if (document.readyState === 'complete') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
