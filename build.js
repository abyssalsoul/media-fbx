// build.js — génère tmdb.key et jellyfin-config.js depuis les variables d'environnement Vercel
const fs = require('fs');

const tmdbKey = process.env.TMDB_KEY || '';
if (tmdbKey) {
  fs.writeFileSync('tmdb.key', tmdbKey);
  console.log('tmdb.key généré depuis TMDB_KEY env var');
} else {
  console.warn('TMDB_KEY non définie — tmdb.key non généré');
}

const jellyfinKey    = process.env.JELLYFIN_API_KEY || '';
const jellyfinUserId = process.env.JELLYFIN_USER_ID || '';
if (jellyfinKey && jellyfinUserId) {
  fs.writeFileSync('jellyfin-config.js',
    `window.JELLYFIN_CONFIG = { apiKey: "${jellyfinKey}", userId: "${jellyfinUserId}", base: "https://jellyfin.maupiflix.com" };\n`
  );
  console.log('jellyfin-config.js généré');
} else {
  console.warn('JELLYFIN_API_KEY ou JELLYFIN_USER_ID non définie — jellyfin-config.js non généré');
}
