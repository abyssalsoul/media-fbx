/* fx-loader.js — anneau animé pendant le chargement du player (#fx-loader)
   Fallback (effets off / reduced-motion) = spinner CSS #player-loader */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-loader');
  if (!el) return;

  const frag = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_accent;
    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
      float r = length(uv);
      float t = u_time * 2.0;
      float ring = smoothstep(0.03, 0.0, abs(r - 0.30 - 0.02 * sin(t)));
      float spin = 0.45 + 0.55 * sin(atan(uv.y, uv.x) * 3.0 - t * 2.0);
      gl_FragColor = vec4(u_accent, ring * spin);
    }`;

  FX.register({ name: 'loader', el: el, frag: frag, scale: 1.0 });

  FX.on('player:loading', () => FX.activate('loader'));
  FX.on('player:playing', () => FX.deactivate('loader'));
  FX.on('player:close', () => FX.deactivate('loader'));
})();
