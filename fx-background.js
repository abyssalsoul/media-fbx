/* fx-background.js — fond ambiant animé derrière la grille (#fx-bg) */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-bg');
  if (!el) return;

  const frag = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_accent;
    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      float t = u_time * 0.06;
      float w = sin(uv.x * 3.0 + t) * 0.5 + sin(uv.y * 2.0 - t * 1.3) * 0.5;
      float g = smoothstep(0.0, 1.5, uv.y + w * 0.25);
      vec3 base = vec3(0.05, 0.05, 0.06);
      vec3 col = mix(base, base + u_accent * 0.20, g * 0.6 + 0.2 * sin(t + uv.x * 4.0));
      float v = smoothstep(1.25, 0.2, length(uv - 0.5));
      col *= 0.6 + 0.4 * v;
      gl_FragColor = vec4(col, 1.0);
    }`;

  // Fond sous-échantillonné (scale 0.6) : suffisant pour un dégradé doux
  FX.register({ name: 'bg', el: el, frag: frag, scale: 0.6 });

  FX.on('browse', () => FX.activate('bg'));
  FX.on('player:open', () => FX.deactivate('bg'));
})();
