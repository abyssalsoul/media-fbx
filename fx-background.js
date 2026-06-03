/* fx-background.js — fond ambiant animé derrière la grille (#fx-bg)
   Warp fBM (domain warping de bruit fractal) teinté avec l'accent, lent.
   precision mediump (garantie WebGL1 mobile) + hash compatible mediump :
   le hash sin(dot()*43758) dégénère en mediump → écran noir sur certains mobiles. */
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

    // hash stable en mediump (pas de gros multiplicateur sur sin)
    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p){
      vec2 ip = floor(p);
      vec2 u = fract(p);
      u = u * u * (3.0 - 2.0 * u);
      float res = mix(
        mix(hash(ip), hash(ip + vec2(1.0, 0.0)), u.x),
        mix(hash(ip + vec2(0.0, 1.0)), hash(ip + vec2(1.0, 1.0)), u.x), u.y);
      return res;
    }
    const mat2 mtx = mat2(0.80, 0.60, -0.60, 0.80);
    float fbm(vec2 p, float t){
      float f = 0.0;
      f += 0.5000 * noise(p + t); p = mtx * p * 2.02;
      f += 0.2500 * noise(p);     p = mtx * p * 2.03;
      f += 0.1250 * noise(p);     p = mtx * p * 2.01;
      f += 0.0625 * noise(p + sin(t) * 0.5);
      return f / 0.9375;
    }
    void main() {
      float t = u_time * 0.12; // tempo lent
      vec2 uv = gl_FragCoord.xy / u_resolution.x; // ratio conservé
      float shade = fbm(uv * 1.6 + fbm(uv * 1.6, t), t); // warp 2 niveaux
      vec3 dark = vec3(0.03, 0.03, 0.04);
      vec3 col = mix(dark, u_accent, shade);
      col = mix(col, u_accent * 1.35, smoothstep(0.62, 1.0, shade) * 0.5);
      col *= 0.78; // visible mais reste un fond
      gl_FragColor = vec4(col, 1.0);
    }`;

  FX.register({ name: 'bg', el: el, frag: frag, scale: 0.5 });

  FX.on('browse', () => FX.activate('bg'));
  FX.on('player:open', () => FX.deactivate('bg'));
})();
