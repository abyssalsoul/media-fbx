/* fx-background.js — fond ambiant animé derrière la grille (#fx-bg) */
(function () {
  'use strict';
  const FX = window.MaupiflixFX;
  if (!FX) return;
  const el = document.getElementById('fx-bg');
  if (!el) return;

  // Marbré animé : bruit fractal + veines sinusoïdales, accent peu lumineux sur
  // base sombre → ça reste un fond.
  const frag = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_accent;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
      return v;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p = uv * 3.0;
      float t = u_time * 0.4;
      float q = fbm(p + vec2(t * 0.8, -t * 0.5));
      float marble = 0.5 + 0.5 * sin((p.x + p.y) * 2.0 + q * 6.0 + t * 2.0);
      marble *= marble; // veines plus marquées
      vec3 base = vec3(0.04, 0.04, 0.05);
      vec3 col = base + u_accent * marble * 0.16; // accent peu lumineux
      col *= 0.7 + 0.3 * smoothstep(1.2, 0.2, length(uv - 0.5)); // léger vignettage
      gl_FragColor = vec4(col, 1.0);
    }`;

  // Fond sous-échantillonné (scale 0.6) : suffisant pour un dégradé doux
  FX.register({ name: 'bg', el: el, frag: frag, scale: 0.6 });

  FX.on('browse', () => FX.activate('bg'));
  FX.on('player:open', () => FX.deactivate('bg'));
})();
