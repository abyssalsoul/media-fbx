// build.js — génère tmdb.key depuis la variable d'environnement Vercel
const fs = require('fs');

const key = process.env.TMDB_KEY || '';
if (key) {
  fs.writeFileSync('tmdb.key', key);
  console.log('tmdb.key généré depuis TMDB_KEY env var');
} else {
  console.warn('TMDB_KEY non définie — tmdb.key non généré');
}
