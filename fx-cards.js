/* fx-cards.js — vignettes qui bougent « comme des feuilles au vent » selon la
   vitesse de scroll. Pas de canvas : transforms CSS pilotés en JS, gated par
   l'état effets (FX.enabled) et prefers-reduced-motion. */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const grid = document.getElementById('grid');
  if (!grid) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let cards = [];
  let phases = [];
  function refresh() {
    cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
    phases = cards.map((_, i) => (i * 1.7) % 6.28318);
  }
  refresh();
  new MutationObserver(refresh).observe(grid, { childList: true });

  let lastY = window.scrollY;
  let vel = 0;       // vitesse lissée (px/frame)
  let raf = null;
  let animating = false;

  function setAnimating(on) {
    if (on === animating) return;
    animating = on;
    cards.forEach(c => { c.style.transition = on ? 'none' : ''; });
    if (!on) cards.forEach(c => { c.style.transform = ''; });
  }

  function frame() {
    const t = performance.now() * 0.004;
    // amplitude proportionnelle à la vitesse de scroll (plafonnée)
    const amp = Math.min(Math.abs(vel), 60) * 0.22;
    if (amp < 0.15) {
      setAnimating(false);
      vel = 0;
      raf = null;
      return;
    }
    setAnimating(true);
    for (let i = 0; i < cards.length; i++) {
      const ph = phases[i];
      const rot = amp * Math.sin(t + ph) * 0.5;
      const ty = amp * Math.cos(t * 1.3 + ph) * 0.6;
      const tx = amp * Math.sin(t * 0.8 + ph) * 0.4;
      cards[i].style.transform =
        'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) rotate(' + rot.toFixed(2) + 'deg)';
    }
    vel *= 0.9; // friction → retour au repos
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (raf == null) raf = requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', () => {
    if (!FX.enabled || reduce) return;
    const y = window.scrollY;
    const dv = y - lastY;
    lastY = y;
    vel = vel * 0.6 + dv * 0.4;
    kick();
  }, { passive: true });
})();
