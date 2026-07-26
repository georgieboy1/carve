/* ============================================================
   CARVE — themes
   KG Studio
   ------------------------------------------------------------
   One theme per pack: the stone ramp the sculpture is coloured with, and
   the background it stands against.

   THE RULE THIS FILE EXISTS TO ENFORCE — a theme owns the SURFACE and never
   the SIGNAL. Four colours carry meaning rather than mood:

     coral  a struck block, and the audit ghost
     amber  the player's own mark
     teal   a hint
     digits the clue value itself, cool -> warm

   If a pack theme is free to wander anywhere, a gold Relics palette eats
   the amber mark and a steel Workshop palette eats the teal hint. So every
   ramp stop is checked against every signal colour, in Lab, and a theme
   that crowds one is a build error rather than a thing a player discovers.
   ============================================================ */

import { PACKS } from './shapes.js';

/* Fixed for the life of the game. Not themeable, on purpose. */
export const SIGNALS = {
  danger: '#ff6b8a',   // struck + audit
  mark: '#ffc978',     // player's flag
  // Deepened from #6fd3c4: the old teal sat 21 from the shipped mint stone
  // and 21 from Garden's greens, so a hint on a green block barely read.
  hint: '#2f9c96',     // certain move
};

/* Every ramp stays in a light, low-saturation family. The clue chips are
   near-white cards with coloured glyphs; a dark or vivid stone would need a
   second chip treatment, which is a bigger change than a palette swap. */
export const THEMES = {
  'first-cuts': {
    name: 'Blush',
    ramp: ['#f7c3d5', '#dfc9f2', '#c3e5f1', '#c7efdf'],
    bg: ['#fdf3f8', '#f6e9f3', '#eddfec'],
  },
  stonework: {
    name: 'Quarry',
    ramp: ['#d9d5cf', '#cfd3d6', '#c6cdd8', '#c2c8cf'],
    bg: ['#f6f5f2', '#ececeb', '#e2e3e4'],
  },
  landmarks: {
    name: 'Limestone',
    ramp: ['#ecd9bd', '#e6d3b4', '#dfcfb6', '#d6cbb8'],
    bg: ['#fbf5ea', '#f4ebda', '#eae0cd'],
  },
  'great-works': {
    name: 'Slate',
    ramp: ['#c8ccd6', '#bfc6d4', '#b9c3d2', '#b3bed0'],
    bg: ['#f2f4f8', '#e8ebf1', '#dee3ec'],
  },
  menagerie: {
    name: 'Fawn',
    ramp: ['#e8d3c1', '#e2cdba', '#dbc7b4', '#d3c0b0'],
    bg: ['#faf3ec', '#f2e9df', '#e9ded1'],
  },
  'wild-things': {
    name: 'Dusk',
    ramp: ['#d6c9e6', '#cdc4e4', '#c4c1e2', '#bcbfdf'],
    bg: ['#f6f1fa', '#ede7f5', '#e3dcef'],
  },
  garden: {
    name: 'Meadow',
    ramp: ['#cfe4c2', '#c6e0bd', '#bddbba', '#b6d7bb'],
    bg: ['#f3f9ee', '#e9f2e3', '#dfebd8'],
  },
  relics: {
    name: 'Patina',
    ramp: ['#d8cdb4', '#cfc9b2', '#c5c5b3', '#bcc2b6'],
    bg: ['#f7f4e9', '#eeebdd', '#e4e2d2'],
  },
  workshop: {
    name: 'Ironworks',
    ramp: ['#cdc6c6', '#c4c0c3', '#bcbac1', '#b4b5bf'],
    bg: ['#f5f2f3', '#eae7ea', '#dfdde1'],
  },
  voyage: {
    name: 'Harbour',
    ramp: ['#c4d8e6', '#bad2e4', '#b1cce1', '#a9c6de'],
    bg: ['#eff6fb', '#e4eff7', '#d9e7f1'],
  },
};

export const DEFAULT_THEME = THEMES['first-cuts'];

export const themeFor = (packId) => THEMES[packId] || DEFAULT_THEME;

/* Shape name -> the theme of the pack it belongs to, so the catalogue and
   the shelf colour a sculpture the same way the game does. */
const packOfShape = new Map();
for (const pack of PACKS) {
  for (const name of pack.shapes) packOfShape.set(name, pack.id);
}

export const themeForShape = (name) => themeFor(packOfShape.get(name));

/* ---------- colour distance ---------- */

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/* sRGB -> linear -> XYZ (D65) -> Lab. Enough for a "can a player tell these
   apart" check; we are not colour-managing print. */
function toLab(hex) {
  const lin = hexToRgb(hex).map((c) =>
    (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

  const [r, g, b] = lin;
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/* A signal has to stay obviously distinct from the stone it sits on. 25 is
   comfortably past "these look similar" without demanding garish stone. */
export const MIN_SIGNAL_DISTANCE = 25;

export function validateThemes() {
  const problems = [];

  for (const [id, theme] of Object.entries(THEMES)) {
    if (!PACKS.some((p) => p.id === id)) {
      problems.push(`theme "${id}" belongs to no pack`);
    }

    theme.ramp.forEach((stop, i) => {
      for (const [signal, colour] of Object.entries(SIGNALS)) {
        const d = deltaE(stop, colour);
        if (d < MIN_SIGNAL_DISTANCE) {
          problems.push(
            `${id} ramp[${i}] ${stop} is ${d.toFixed(1)} from ${signal} ${colour}`);
        }
      }
    });
  }

  for (const pack of PACKS) {
    if (!THEMES[pack.id]) problems.push(`pack "${pack.id}" has no theme`);
  }

  return problems;
}
