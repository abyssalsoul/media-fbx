/* fx-background.js — fond ambiant animé derrière la grille (#fx-bg)
   « Base warp fBM » (domain warping de bruit fractal) teinté avec l'accent.
   La vitesse d'animation accélère au scroll via u_scroll (accumulé sur la vitesse
   de défilement) ; reste un fond (peu lumineux). */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-bg');
  if (!el) return;

  const frag = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_scroll;
    uniform vec3 u_accent;

    float T; // temps effectif (base + boost scroll)

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
    }
    float noise(vec2 p){
      vec2 ip = floor(p);
      vec2 u = fract(p);
      u = u * u * (3.0 - 2.0 * u);
      float res = mix(
        mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
        mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
      return res * res;
    }
    const mat2 mtx = mat2(0.80, 0.60, -0.60, 0.80);
    float fbm(vec2 p){
      float f = 0.0;
      f += 0.500000 * noise(p + T); p = mtx * p * 2.02;
      f += 0.031250 * noise(p);     p = mtx * p * 2.01;
      f += 0.250000 * noise(p);     p = mtx * p * 2.03;
      f += 0.125000 * noise(p);     p = mtx * p * 2.01;
      f += 0.062500 * noise(p);     p = mtx * p * 2.04;
      f += 0.015625 * noise(p + sin(T));
      return f / 0.96875;
    }
    float pattern(vec2 p){
      return fbm(p + fbm(p + fbm(p)));
    }
    void main() {
      T = u_time * 0.35 + u_scroll;
      vec2 uv = gl_FragCoord.xy / u_resolution.x; // ratio conservé (comme l'original)
      float shade = pattern(uv * 1.4);
      vec3 dark = vec3(0.03, 0.03, 0.04);
      vec3 col = mix(dark, u_accent, shade);
      col = mix(col, u_accent * 1.35, smoothstep(0.62, 1.0, shade) * 0.5);
      col *= 0.78; // visible mais reste un fond
      gl_FragColor = vec4(col, 1.0);
    }`;

  FX.register({ name: 'bg', el: el, frag: frag, scale: 0.5 });

  // ── Boost de vitesse au scroll ──
  let warp = 0;       // décalage de temps accumulé
  let lastY = window.scrollY;
  function pushWarp() {
    const m = FX.get('bg');
    if (m && m.sandbox) m.sandbox.setUniform('u_scroll', warp);
  }
  window.addEventListener('scroll', () => {
    if (!FX.enabled) return;
    const y = window.scrollY;
    warp += Math.abs(y - lastY) * 0.012; // plus on scrolle vite, plus ça avance
    lastY = y;
    pushWarp();
  }, { passive: true });

  FX.on('browse', () => { FX.activate('bg'); pushWarp(); });
  FX.on('player:open', () => FX.deactivate('bg'));
})();
