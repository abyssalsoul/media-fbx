/* fx-background.js — fond ambiant animé derrière la grille (#fx-bg)
   Style « Balatro » : rotation différentielle + paint iteratif, teinté accent,
   peu lumineux (ça reste un fond). */
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
    uniform vec3 u_accent;
    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
      float t = u_time * 0.18;
      float l = length(uv);
      float a = atan(uv.y, uv.x);
      // rotation différentielle : le centre tourne plus vite que les bords
      a += (0.6 / (l + 0.25)) - t * 0.8;
      vec2 p = vec2(cos(a), sin(a)) * l * 4.0;
      // paint itératif : déforme p en s'enroulant
      for (int i = 0; i < 5; i++) {
        float fi = float(i) + 1.0;
        p += 0.55 * vec2(sin(p.y * 1.4 + t + fi), cos(p.x * 1.4 - t + fi)) / fi;
      }
      float v = 0.5 + 0.5 * sin(p.x + p.y + t * 1.5);
      v *= v;
      vec3 dark = vec3(0.03, 0.03, 0.04);
      vec3 col = mix(dark, u_accent * 0.5, v);
      col = mix(col, u_accent * 1.0, smoothstep(0.55, 1.0, v) * 0.6);
      col *= 0.72; // assez visible mais reste un fond
      col *= 0.75 + 0.25 * smoothstep(1.3, 0.2, l); // léger vignettage
      gl_FragColor = vec4(col, 1.0);
    }`;

  FX.register({ name: 'bg', el: el, frag: frag, scale: 0.5 });

  FX.on('browse', () => FX.activate('bg'));
  FX.on('player:open', () => FX.deactivate('bg'));
})();
