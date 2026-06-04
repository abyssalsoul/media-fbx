/* fx-cards.js — animation au tap d'une carte : zoom radial out + fade out
   (easing inExpo, ça accélère vers la fin). Le player ne s'ouvre qu'une fois
   l'animation terminée. Gated par effets + reduced-motion (sinon ouverture directe). */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURATION = 420; // ms

  // easeInExpo : lent au début, accélère fortement à la fin
  function inExpo(p) { return p <= 0 ? 0 : Math.pow(2, 10 * (p - 1)); }

  function animate(card, done) {
    let finished = false;
    const finish = () => { if (finished) return; finished = true; reset(card); done(); };
    const start = performance.now();
    card.style.transition = 'none';
    card.style.transformOrigin = 'center center';
    card.style.zIndex = '40';
    card.style.willChange = 'transform, opacity';
    function step(now) {
      let p = (now - start) / DURATION;
      if (p > 1) p = 1;
      const e = inExpo(p);
      card.style.transform = 'scale(' + (1 + e * 0.6).toFixed(4) + ')';
      card.style.opacity = (1 - e).toFixed(4);
      if (p < 1) requestAnimationFrame(step);
      else finish();
    }
    requestAnimationFrame(step);
    // Filet de sécurité si rAF est throttlé : on ouvre quand même.
    setTimeout(finish, DURATION + 120);
  }

  function reset(card) {
    card.style.transition = '';
    card.style.transform = '';
    card.style.opacity = '';
    card.style.zIndex = '';
    card.style.willChange = '';
    card.style.transformOrigin = '';
  }

  function init() {
    const grid = document.getElementById('grid');
    const origOpen = window.openPlayer;
    if (!grid || typeof origOpen !== 'function') return;

    // Mémorise la carte sous le doigt/curseur (hors dropdown épisodes et bouton VLC).
    let pending = null;
    grid.addEventListener('pointerdown', e => {
      if (e.target.closest('.ep-select') || e.target.closest('.btn-vlc')) { pending = null; return; }
      pending = e.target.closest('.card');
    }, true);

    window.openPlayer = function () {
      const card = pending;
      pending = null;
      const args = arguments;
      const open = () => origOpen.apply(this, args);
      if (!FX.enabled || reduce || !card) { open(); return; }
      animate(card, open);
    };
  }

  // window.openPlayer est posé par player.js dans son listener DOMContentLoaded ;
  // on s'enregistre après pour pouvoir l'envelopper.
  if (document.readyState === 'complete') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
