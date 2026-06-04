// build.js — génère tmdb.key et jellyfin-config.js depuis les variables d'environnement Vercel
const fs = require('fs');

// Génère les fichiers dans data/ (tmdb.key) et js/ (jellyfin-config.js).
fs.mkdirSync('data', { recursive: true });
fs.mkdirSync('js', { recursive: true });

const tmdbKey = process.env.TMDB_KEY || '';
if (tmdbKey) {
  fs.writeFileSync('data/tmdb.key', tmdbKey);
  console.log('data/tmdb.key généré depuis TMDB_KEY env var');
} else {
  console.warn('TMDB_KEY non définie — data/tmdb.key non généré');
}

const jellyfinKey    = process.env.JELLYFIN_API_KEY || '';
const jellyfinUserId = process.env.JELLYFIN_USER_ID || '';
if (jellyfinKey && jellyfinUserId) {
  fs.writeFileSync('js/jellyfin-config.js',
    `window.JELLYFIN_CONFIG = { apiKey: "${jellyfinKey}", userId: "${jellyfinUserId}", base: "https://jellyfin.maupiflix.com" };\n`
  );
  console.log('js/jellyfin-config.js généré');
} else {
  console.warn('JELLYFIN_API_KEY ou JELLYFIN_USER_ID non définie — jellyfin-config.js non généré');
}
