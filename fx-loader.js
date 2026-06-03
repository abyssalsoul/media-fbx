/* fx-loader.js — ondulation sphérique pendant le chargement du player (#fx-loader)
   Fallback (effets off / reduced-motion) = spinner CSS #player-loader */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-loader');
  if (!el) return;

  // Ondulation sphérique neutre (blanche, pas de couleur d'accent), fond transparent
  // → l'écran de chargement reste neutre (#0d0d0d derrière).
  const frag = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
      float r = length(uv);
      // anneaux concentriques qui s'étendent depuis le centre
      float ripple = max(0.0, sin(r * 42.0 - u_time * 5.0));
      ripple *= smoothstep(0.55, 0.0, r); // s'atténue vers l'extérieur
      gl_FragColor = vec4(vec3(1.0), ripple * 0.35);
    }`;

  FX.register({ name: 'loader', el: el, frag: frag, scale: 1.0 });

  FX.on('player:loading', () => FX.activate('loader'));
  FX.on('player:playing', () => FX.deactivate('loader'));
  FX.on('player:close', () => FX.deactivate('loader'));
})();
