/* films.js — posters TMDB, chargé par films.html */

const posterCache = {};

/* ── Limiteur de concurrence (max 4 requêtes simultanées) ── */
const TMDB_MAX = 4;
let _active = 0;
const _waiting = [];

function _acquire() {
  return new Promise(resolve => {
    if (_active < TMDB_MAX) { _active++; resolve(); }
    else _waiting.push(resolve);
  });
}

function _release() {
  if (_waiting.length) { _waiting.shift()(); }
  else _active--;
}

/* ── Helpers URL / auth ── */
function _tmdbAuth() {
  if (!TMDB_KEY) return {};
  return TMDB_KEY.length > 50
    ? { Authorization: 'Bearer ' + TMDB_KEY }
    : {};
}

function _tmdbBase(path, params) {
  const qs = new URLSearchParams(params).toString();
  const url = 'https://api.themoviedb.org/3' + path + '?' + qs;
  return (TMDB_KEY && TMDB_KEY.length <= 50)
    ? url + '&api_key=' + TMDB_KEY
    : url;
}

/* ── Fetch avec retry sur 429 ── */
async function _tmdbFetch(url, headers) {
  let delay = 2000;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers });
    if (r.status !== 429) return r;
    await new Promise(res => setTimeout(res, delay));
    delay *= 2; // backoff exponentiel : 2s, 4s, 8s
  }
  throw new Error('TMDB 429 – trop de requêtes');
}

/* ── Récupération de l'affiche ── */
async function getPoster(title, year, isSerie) {
  const key = title + '|' + year + '|' + isSerie;
  if (posterCache[key] !== undefined) return posterCache[key];
  if (!TMDB_KEY) { posterCache[key] = null; return null; }

  const type   = isSerie ? 'tv' : 'movie';
  const params = { query: title, language: 'fr-FR' };
  if (!isSerie && year) params.year = year;

  await _acquire();
  try {
    const r = await _tmdbFetch(_tmdbBase('/search/' + type, params), _tmdbAuth());
    const d = await r.json();
    const p = d.results?.[0]?.poster_path ?? null;
    posterCache[key] = p ? 'https://image.tmdb.org/t/p/w300' + p : null;
  } catch {
    posterCache[key] = null;
  } finally {
    _release();
  }
  return posterCache[key];
}
