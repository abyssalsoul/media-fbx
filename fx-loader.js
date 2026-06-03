/* fx-loader.js — anneau animé pendant le chargement du player (#fx-loader)
   Fallback (effets off / reduced-motion) = spinner CSS #player-loader */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-loader');
  if (!el) return;

  // Spinner compact (taille fixe en px) : seul l'anneau est coloré, fond transparent
  // → l'écran de chargement reste neutre (#0d0d0d derrière).
  const frag = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_accent;
    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
      float r = length(uv);
      float ring = smoothstep(0.012, 0.0, abs(r - 0.075)); // anneau fin et compact
      float ang = atan(uv.y, uv.x);
      float head = 0.25 + 0.75 * (0.5 + 0.5 * sin(ang - u_time * 4.0)); // tête lumineuse qui tourne
      gl_FragColor = vec4(u_accent, ring * head);
    }`;

  FX.register({ name: 'loader', el: el, frag: frag, scale: 1.0 });

  FX.on('player:loading', () => FX.activate('loader'));
  FX.on('player:playing', () => FX.deactivate('loader'));
  FX.on('player:close', () => FX.deactivate('loader'));
})();
