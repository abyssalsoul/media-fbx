/* sw.js — service worker minimal pour Maupiflix (PWA installable).
   Stratégie : network-first pour le même origine (fraîcheur après déploiement
   Vercel + repli cache hors-ligne) ; passthrough réseau pour le cross-origin
   (Jellyfin, CDN hls.js/glslCanvas/fonts) → jamais d'API périmée ni de flux
   vidéo mis en cache. */
'use strict';

const CACHE = 'maupiflix-v4';

// Coquille statique précachée. js/jellyfin-config.js est volontairement absent
// (peut être gitignoré/manquant) : il sera mis en cache à la volée s'il existe.
const SHELL = [
  '/',
  'index.html',
  'css/base.css',
  'css/effects.css',
  'css/header.css',
  'css/menu.css',
  'css/genres.css',
  'css/catalog.css',
  'css/player.css',
  'js/app.js',
  'js/player.js',
  'js/progress.js',
  'js/films.js',
  'js/sw-register.js',
  'js/fx/fx-core.js',
  'js/fx/fx-background.js',
  'js/fx/fx-loader.js',
  'js/fx/fx-cards.js',
  'assets/favicon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll échoue en bloc si une URL 404 → on ajoute une par une, tolérant.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Cross-origin (Jellyfin, CDN, fonts) : réseau direct, pas de cache.
  if (url.origin !== self.location.origin) return;

  // Network-first : on tente le réseau, on met à jour le cache, repli cache hors-ligne.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => {
          if (hit) return hit;
          // Repli navigation → coquille index.html
          if (req.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        })
      )
  );
});
