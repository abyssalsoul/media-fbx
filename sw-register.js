/* sw-register.js — enregistre le service worker (PWA installable).
   Chargé en defer ; respecte la règle « pas de JS inline ».
   Silencieux : un échec d'enregistrement ne doit pas casser l'app. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    try {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    } catch (e) {}
  });
})();
