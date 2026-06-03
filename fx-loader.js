/* fx-loader.js — ondulation sphérique sur le backdrop pendant le chargement (#fx-loader)
   Échantillonne l'image #player-backdrop (chargée par player.js) et la déforme
   en anneaux concentriques. Tant que la texture n'est pas chargée : transparent
   (le backdrop statique reste visible dessous). Fallback effets-off = spinner CSS. */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-loader');
  const bd = document.getElementById('player-backdrop');
  if (!el || !bd) return;

  const frag = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform sampler2D u_backdrop;
    uniform vec2 u_backdropResolution;
    void main() {
      // Pas encore de texture : transparent (le backdrop statique reste visible).
      if (u_backdropResolution.x < 1.0) { gl_FragColor = vec4(0.0); return; }
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 c = uv - 0.5;
      float r = length(c);
      // déplacement radial : anneaux concentriques qui s'étendent depuis le centre
      float disp = sin(r * 42.0 - u_time * 5.0) * 0.010 * smoothstep(0.65, 0.0, r);
      uv += normalize(c + 1e-5) * disp;
      // remappage « cover » écran → image (conserve le ratio, centré)
      float s = max(u_resolution.x / u_backdropResolution.x,
                    u_resolution.y / u_backdropResolution.y);
      vec2 scaled = u_backdropResolution * s;
      vec2 offset = (u_resolution - scaled) * 0.5;
      vec2 tuv = (uv * u_resolution - offset) / scaled;
      gl_FragColor = texture2D(u_backdrop, tuv);
    }`;

  FX.register({ name: 'loader', el: el, frag: frag, scale: 1.0 });

  function backdropUrl() {
    const bg = getComputedStyle(bd).backgroundImage;
    const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : null;
  }
  function applyTexture() {
    const m = FX.get('loader');
    const url = backdropUrl();
    if (m && m.sandbox && url) { m.sandbox.setUniform('u_backdrop', url); return true; }
    return false;
  }

  let obs = null;
  function stopObs() { if (obs) { obs.disconnect(); obs = null; } }

  FX.on('player:loading', () => {
    FX.activate('loader');
    // L'URL du backdrop est posée en asynchrone par player.js : on l'observe.
    if (!applyTexture()) {
      stopObs();
      obs = new MutationObserver(() => { if (applyTexture()) stopObs(); });
      obs.observe(bd, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  });

  function stop() { FX.deactivate('loader'); stopObs(); }
  FX.on('player:playing', stop);
  FX.on('player:close', stop);
})();
