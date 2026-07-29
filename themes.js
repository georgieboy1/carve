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

   A theme also owns a MATERIAL FINISH — see FINISHES below. That is a
   second way to darken a surface, so it is validated the same way: the
   check runs on the ramp stop AFTER the finish has multiplied it, not on
   the raw hex. Otherwise a finish could quietly walk a stop into a signal
   that the raw ramp cleared by miles.
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
    name: 'Limewood',
    material: 'wood',
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
    material: 'wood',
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
  numerals: {
    name: 'Terracotta',
    ramp: ['#e6bfae', '#dfb7a6', '#d8b09f', '#d0a998'],
    bg: ['#fbf1eb', '#f3e6de', '#ebdbd1'],
  },
  alphabet: {
    name: 'Inkwell',
    ramp: ['#c6c4dc', '#bdbcd8', '#b4b4d4', '#acadd0'],
    bg: ['#f2f1f9', '#e8e7f3', '#dedded'],
  },
};

/* ---------- MATERIAL FINISH ----------
   A theme names a MATERIAL as well as a palette. The finish never replaces
   the ramp — it multiplies it — so a pack keeps its identity and only the
   surface changes underneath.

   Why these two packs and not the others: this is decided by what the
   sculpture would actually have been carved from. Menagerie is Turtle,
   Frog, Snail, Bear, Bird — the entire canon of folk woodcarving, and pale
   limewood is the wood it is carved in. Garden is Pine tree, Cactus,
   Mushroom, Flower, Pinecone — foliage carved in limewood is Grinling
   Gibbons' whole body of work. Everything else stays stone or reads as
   another material entirely: Stonework is masonry by name, Relics is
   bronze, Workshop is iron, Numerals is terracotta.

   Garden keeps its greens. Painted limewood is a real and old tradition —
   Alpine and Scandinavian folk carving is painted, and the grain still
   reads through worn paint. That is also what keeps this a *finish* rather
   than a palette: it is independent of hue, so it composes with any ramp.

   A grain texture is a MULTIPLY, so left alone it makes every wood pack a
   few percent darker than the ramp it validated — Meadow would ship as a
   different green from the one in this file. GAIN corrects that: the base
   colour is brightened by exactly the mean the grain removes, so the
   average surface is the ramp stop and the grain modulates either side of
   it. A finish changes the material, not the palette.

   The ΔE check runs on the surface the grain actually produces — see
   grainStats(), which measures the texture rather than trusting a number
   typed in next to it. Tightening GRAIN below moves the check with it. */
export const FINISHES = {
  wood: {
    // Multiplied over the ramp. Barely tinted, but losing blue faster than
    // red is the single thing that separates "wood" from "grey with lines".
    tint: [1.0, 0.988, 0.955],
    roughness: 0.8,      // matte. Stone is 0.62 and reads more polished.
    get gain() { return 1 / grainStats().mean; },
    get shades() { return [1, grainStats().p5]; },
  },
};

export const finishOf = (theme) => FINISHES[theme?.material] || null;

/* ---------- WOOD GRAIN ----------
   Drawn once into a canvas and handed to whoever wants a texture out of it.
   Deliberately a canvas and not a THREE.Texture: the game and the thumbnail
   renderer are different WebGL contexts with their own texture caches, and
   both want this same image.

   Zero external requests is a hard constraint, so there is no wood photo to
   load — this is rings plus flecks over value noise. The noise is hashed
   from the coordinate rather than Math.random(), so the grain is identical
   every launch; a sculpture screenshotted twice looks the same both times. */

/* Every one of these was first set several times too high, and the result
   was a zebra. The thing that makes it read as wood rather than as a
   pattern is that there is barely any of it:

   RINGS is counted per CUBE FACE, not per sculpture — the box geometry maps
   this texture 0..1 across each face, and a face is 60-90px on a 375px
   screen. At 7.5 that put a dark line every 10 pixels, which at cube scale
   is moire, not grain. Two-ish lines per face is a piece of wood.

   LATE is a multiply, so 0.15 means the darkest lines sit 15% down. That
   sounds like nothing and is plainly visible on a pale surface; the earlier
   0.26 turned Limewood grey. */
const GRAIN = {
  size: 256,
  rings: 2.1,       // ring count across ONE CUBE FACE
  warp: 1.0,        // how far the noise bends them. 0 is a barcode.
  late: 0.15,       // how dark a latewood line goes
  pore: 0.09,       // fine fleck on top of it
};

const hash = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
};
const ease = (t) => t * t * (3 - 2 * t);

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = ease(x - xi), v = ease(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const top = a + (b - a) * u;
  return top + ((c + (d - c) * u) - top) * v;
}

const fbm = (x, y) => vnoise(x, y) * 0.55
  + vnoise(x * 2.17, y * 2.17) * 0.28
  + vnoise(x * 4.39, y * 4.39) * 0.17;

/* How much darker the surface is at (u, v). 1 is clear wood. Shared by the
   painter and the validator so the two can never disagree about what the
   grain does. */
function grainShade(u, v) {
  // Grain runs down the block, so the rings vary across it. The warp is the
  // whole trick: without it these are stripes, not wood.
  const warp = fbm(u * 2.6, v * 1.1) - 0.5;
  const ring = 0.5 + 0.5 * Math.sin((u * GRAIN.rings + warp * GRAIN.warp) * Math.PI * 2);

  // Cubed, because latewood is a narrow hard line and the earlywood between
  // rings is wide and almost clear. A plain sine is corduroy.
  const late = ring * ring * ring;
  const pore = Math.max(0, fbm(u * 34, v * 7) - 0.56) * 0.9;

  return 1 - late * GRAIN.late - pore * GRAIN.pore;
}

/* Measured off the same function the texture is painted from, so the two
   can never disagree.

   mean is what GAIN cancels, so the average surface is the ramp stop.

   p5 is the darkest twentieth of the surface, and it is what the ΔE check
   uses for "dark grain". Not the absolute floor, on purpose: the floor is a
   handful of pixels where the darkest point of a ring happens to land under
   a fleck, and nobody perceives a cube as the colour of its darkest pixel.
   The 5th percentile is a real area of dark grain. */
let statsCache = null;

export function grainStats() {
  if (statsCache) return statsCache;

  const N = 64;                    // 4096 samples; the field is smooth
  const samples = new Float64Array(N * N);
  let total = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const s = grainShade(x / N, y / N);
      samples[y * N + x] = s;
      total += s;
    }
  }
  samples.sort();

  statsCache = {
    mean: total / samples.length,
    p5: samples[Math.floor(samples.length * 0.05)],
  };
  return statsCache;
}

let grainCanvas = null;

export function woodGrainCanvas() {
  if (grainCanvas) return grainCanvas;

  const SIZE = GRAIN.size;
  grainCanvas = document.createElement('canvas');
  grainCanvas.width = grainCanvas.height = SIZE;

  const ctx = grainCanvas.getContext('2d');
  const image = ctx.createImageData(SIZE, SIZE);
  const data = image.data;
  const [tr, tg, tb] = FINISHES.wood.tint;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const shade = grainShade(x / SIZE, y / SIZE);
      const i = (y * SIZE + x) * 4;
      data[i] = Math.min(255, shade * tr * 255);
      data[i + 1] = Math.min(255, shade * tg * 255);
      data[i + 2] = Math.min(255, shade * tb * 255);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return grainCanvas;
}

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

/* The stop as the player actually sees it: the ramp colour, brightened by
   the finish's gain (that is what the material is set to), then multiplied
   by the grain at the shade in question (that is what the texture does).
   Stone is the identity case and comes back unchanged, so an unfinished
   pack validates exactly the same hex it always did. */
export function finishedStop(hex, theme, shade = 1) {
  const finish = finishOf(theme);
  if (!finish) return hex;

  const out = hexToRgb(hex).map((c, i) =>
    Math.round(Math.min(1, c * finish.gain * finish.tint[i] * shade) * 255)
      .toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}

export function validateThemes() {
  const problems = [];

  for (const [id, theme] of Object.entries(THEMES)) {
    if (!PACKS.some((p) => p.id === id)) {
      problems.push(`theme "${id}" belongs to no pack`);
    }
    if (theme.material && !FINISHES[theme.material]) {
      problems.push(`theme "${id}" asks for finish "${theme.material}", which does not exist`);
    }

    // Stone has one shade and it is the ramp itself; a finish is checked at
    // both ends of what its texture does to the surface.
    const shades = finishOf(theme)?.shades || [1];

    theme.ramp.forEach((stop, i) => {
      for (const shade of shades) {
        const surface = finishedStop(stop, theme, shade);
        for (const [signal, colour] of Object.entries(SIGNALS)) {
          const d = deltaE(surface, colour);
          if (d < MIN_SIGNAL_DISTANCE) {
            const where = surface === stop ? stop : `${stop} as ${surface}`;
            problems.push(
              `${id} ramp[${i}] ${where} is ${d.toFixed(1)} from ${signal} ${colour}`);
          }
        }
      }
    });
  }

  for (const pack of PACKS) {
    if (!THEMES[pack.id]) problems.push(`pack "${pack.id}" has no theme`);
  }

  return problems;
}
