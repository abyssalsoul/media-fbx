/* fx-cards.js — « voilure » : les vignettes ondulent comme un film de papier fin
   qui bouge tel un rideau (esprit curtain-js) au scroll. Onde horizontale propagée
   d'une carte à l'autre selon leur position, amplitude liée à la vitesse de scroll.
   Pas de canvas : transforms CSS pilotés en JS, gated par effets + reduced-motion. */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const grid = document.getElementById('grid');
  if (!grid) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let cards = [];
  let phase = [];   // déphasage par carte → l'onde se propage horizontalement
  function refresh() {
    cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
    // onde voyageuse : le déphasage suit surtout la position horizontale (rideau),
    // avec une légère variation verticale pour éviter des colonnes trop synchrones.
    phase = cards.map(c => c.offsetLeft * 0.020 + c.offsetTop * 0.004);
  }
  refresh();
  new MutationObserver(refresh).observe(grid, { childList: true });

  let lastY = window.scrollY;
  let vel = 0;        // vitesse de scroll lissée (px/frame)
  let raf = null;
  let animating = false;

  function setAnimating(on) {
    if (on === animating) return;
    animating = on;
    cards.forEach(c => { c.style.transition = on ? 'none' : ''; });
    if (!on) cards.forEach(c => { c.style.transform = ''; });
  }

  function frame() {
    const t = performance.now() * 0.003;
    // amplitude discrète, proportionnelle à la vitesse de scroll (plafonnée)
    const amp = Math.min(Math.abs(vel), 55) * 0.13; // ~0 → 7°
    if (amp < 0.1) {
      setAnimating(false);
      vel = 0;
      raf = null;
      return;
    }
    setAnimating(true);
    for (let i = 0; i < cards.length; i++) {
      const w = amp * Math.sin(t * 2.0 - phase[i]); // ondulation du « tissu »
      const skew = w * 0.18;
      const sx = 1 - Math.abs(w) * 0.0018;           // léger pli/compression
      cards[i].style.transform =
        'perspective(700px) rotateY(' + w.toFixed(2) + 'deg) skewX(' +
        skew.toFixed(2) + 'deg) scaleX(' + sx.toFixed(4) + ')';
    }
    vel *= 0.9; // friction → la voilure se calme
    raf = requestAnimationFrame(frame);
  }

  function kick() { if (raf == null) raf = requestAnimationFrame(frame); }

  window.addEventListener('scroll', () => {
    if (!FX.enabled || reduce) return;
    const y = window.scrollY;
    const dv = y - lastY;
    lastY = y;
    vel = vel * 0.6 + dv * 0.4;
    kick();
  }, { passive: true });
})();
