/* fx-cards.js — effet « sheen » sur une carte (#fx-card, un seul canvas réutilisé)
   Mobile (priorité) : balayage bref au tap. Desktop (bonus) : balayage continu au survol. */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-card');
  const grid = document.getElementById('grid');
  if (!el || !grid) return;

  const frag = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_progress;
    uniform vec3 u_accent;
    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      float d = (uv.x + uv.y) * 0.5;
      float pos = u_progress * 1.4 - 0.2;
      float band = smoothstep(0.14, 0.0, abs(d - pos));
      float fade = sin(clamp(u_progress, 0.0, 1.0) * 3.14159);
      float shimmer = 0.9 + 0.1 * sin(u_time * 8.0 + uv.y * 10.0);
      vec3 col = u_accent * band * shimmer;
      gl_FragColor = vec4(col, band * fade * 0.55);
    }`;

  FX.register({ name: 'card', el: el, frag: frag, scale: 1.0 });

  const canHover = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const TAP_MS = 550, HOVER_MS = 1200;
  let raf = null, mode = null, startT = 0, hoverCard = null, curCard = null;

  function placeOn(card) {
    const r = card.getBoundingClientRect();
    el.style.left = r.left + 'px';
    el.style.top = r.top + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
  }
  function setProg(p) {
    const m = FX.get('card');
    if (m && m.sandbox) m.sandbox.setUniform('u_progress', p);
  }
  function loop() {
    const now = performance.now();
    if (mode === 'tap') {
      const p = (now - startT) / TAP_MS;
      if (p >= 1) { stop(); return; }
      if (curCard) placeOn(curCard); // suit la carte si on scrolle pendant le tap
      setProg(p);
    } else if (mode === 'hover' && hoverCard) {
      placeOn(hoverCard);
      setProg((now % HOVER_MS) / HOVER_MS);
    }
    raf = requestAnimationFrame(loop);
  }
  function start(card, m) {
    if (!FX.enabled) return;
    placeOn(card);
    el.classList.add('fx-card-show');
    FX.activate('card');
    mode = m; startT = performance.now(); curCard = card;
    if (raf) cancelAnimationFrame(raf);
    loop();
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null; mode = null; hoverCard = null; curCard = null;
    el.classList.remove('fx-card-show');
    FX.deactivate('card');
    const ov = document.getElementById('player-overlay');
    if (!ov || !ov.classList.contains('open')) FX.activate('bg');
  }

  if (canHover) {
    grid.addEventListener('pointerover', e => {
      const c = e.target.closest('.card');
      if (c && c !== hoverCard) { hoverCard = c; start(c, 'hover'); }
    });
    grid.addEventListener('pointerout', e => {
      const c = e.target.closest('.card');
      if (c && !c.contains(e.relatedTarget)) stop();
    });
  } else {
    grid.addEventListener('pointerdown', e => {
      const c = e.target.closest('.card');
      if (c) start(c, 'tap');
    });
  }

  // L'ouverture du player range l'effet carte
  FX.on('player:open', () => { if (mode) stop(); });
})();
