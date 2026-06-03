/* fx-player.js — voile lumineux animé sur le fond du player (#fx-player) */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-player');
  if (!el) return;

  // Glow d'ambiance DERRIÈRE la vidéo (z-index:0) : ne déborde que dans les marges
  // (letterbox). Discret pour ne jamais teinter l'image.
  const frag = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_accent;
    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      float t = u_time * 0.15;
      float wave = sin(uv.x * 6.0 + t) * 0.04 + sin(uv.y * 4.0 - t * 1.2) * 0.04;
      float glow = smoothstep(0.7, 0.0, abs(uv.y - 0.5 + wave));
      vec3 col = u_accent * glow * 0.22;
      gl_FragColor = vec4(col, glow * 0.08);
    }`;

  FX.register({ name: 'player', el: el, frag: frag, scale: 0.75 });

  FX.on('player:playing', () => FX.activate('player'));
  FX.on('player:close', () => FX.deactivate('player'));
})();
