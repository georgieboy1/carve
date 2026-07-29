/* ============================================================
   CARVE
   KG Studio
   ------------------------------------------------------------
   Proving the pivot: start from a solid mass of cubes and chip away the
   waste to reveal a hidden sculpture.

   The load-bearing idea: structural integrity is an AUTHORING constraint,
   not a player rule. validateLevel() checks the shape stands up before the
   player ever sees it, so there is exactly one rule at play time -
   "is this cube part of the shape or not?"

   Deliberately NOT ported from the main build: ads, PWA, hard mode,
   revives. This exists to answer one question - does the reveal feel good?
   ============================================================ */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LEVELS, PACKS, parse, key as cellKey } from './shapes.js';
import { SIGNALS, themeFor, finishOf, woodGrainCanvas } from './themes.js';

/* ---------- MOTION PREFERENCE ----------
   Read once into a plain boolean rather than calling matches() in the frame
   loop, and kept live by the change event so toggling it in the OS takes
   effect without a reload.

   Everything gated on this is listed in one place on purpose, because the
   failure mode is a new effect quietly forgetting to ask: dust, camera
   shake, the impact light, the reveal camera move, and haptics. The shards
   are NOT gated — they predate this and they are the primary "that block
   is gone" signal, so removing them would remove information, not motion.
   carve.css carries the matching rules for the DOM side. */
const calmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let calm = calmQuery.matches;
calmQuery.addEventListener('change', (e) => { calm = e.matches; });

const CONFIG = {
  GRID: null,        // set per shape
  MAX_Y: 0,          // derived from the level list below, not hand-maintained
  CUBE: 1,
  GAP: 0.07,
  STARS: 3,          // the only gauge: score AND lives, see starsFor()
  HINTS: 3,          // once spent, this is the natural second ad slot
  MAX_REVIVES: 1,    // per level; unlimited would remove the fail state
  AD_SECONDS: 3,
  LONG_PRESS: 480,
  TAP_SLOP: 10,
  TAP_TIME: 400,

  SHARDS: 12,          // pieces a carved block bursts into
  SHARD_LIFE: 0.85,    // seconds before a shard is gone
  GRAVITY: 15,
  TURNTABLE: 0.25,     // rad/sec of idle rotation in Examine mode
  TURNTABLE_WAIT: 2200, // ms of stillness before it resumes after a drag
  ZOOM_MIN: 0.45,      // multiples of the fitted distance
  ZOOM_MAX: 1.8,

  /* ---- IMPACT ----
     This fires several hundred times a session, so every number here is
     deliberately smaller than it wants to be. */
  DUST: 9,             // motes of stone powder per carve
  DUST_LIFE: 1.15,     // seconds. Longer than a shard: powder hangs.
  DUST_GRAVITY: 1.4,   // a tenth of the shards'. It settles, it doesn't drop.
  DUST_DRAG: 2.2,      // air resistance, which is what makes it read as dust

  CUT_LIFE: 0.5,       // seconds a newly exposed face stays bright
  CUT_PEAK: 0.42,      // opacity. At 0.85 this was camera flare, not stone.
  SPARK_LIFE: 0.22,    // the chisel's light on the stone around the cut
  SPARK_PEAK: 2.4,     // candela at the impact. Tuned by eye at 375px.

  // MICRO. Two and a half pixels for a sixth of a second, on a phone held a
  // foot from your face. Anything you can consciously see here is too much:
  // the point is that the tap lands in your hand, not that the screen moves.
  SHAKE_LIFE: 0.16,
  SHAKE_PIXELS: 2.5,
  SHAKE_HZ: 13,

  /* ---- THE REVEAL ----
     Three beats, and the gaps between them are the whole design. See
     beginReveal(). */
  REVEAL_SETTLE: 0.45,  // s of nothing at all, while the last dust falls
  REVEAL_MOVE: 2.2,     // s of camera move
  REVEAL_BREATH: 0.6,   // s the camera holds still BEFORE the choice appears
  REVEAL_TURN: 2.35,    // rad the move travels round the sculpture
  REVEAL_PHI: 1.02,     // where it settles: a little above the equator
  REVEAL_ARC: 0.2,      // it pulls back mid-move before pushing in
  /* The strip of screen the reveal frames into, as fractions of the stage.
     NOT the whole viewport: the HUD keeps the top and the reward card is
     about to take the bottom third, so framing to the viewport puts a third
     of the sculpture behind the card and leaves dead space above it.
     Measured on the Lighthouse at 375px, that was 139px hidden under the
     card with 184px of empty stage over its head. */
  REVEAL_BAND_TOP: 0.05,
  REVEAL_BAND_BOTTOM: 0.60,
};

/* Levels, their order and their grouping all come from shapes.js now. One
   library, shared by the game, the catalogue and the gallery — a level that
   validates in CI is the same level that ships. */
const packOf = (i) => PACKS.find((p) => p.id === LEVELS[i].pack);
const packStart = (i) => LEVELS.findIndex((l) => l.pack === LEVELS[i].pack);
const stepIn = (i) => i - packStart(i);

/* Navigation is scoped to the pack the player is in. Walking off the end of
   a pack used to roll straight into the next one — which quietly marched a
   free player into paid content — and a failed level dropped them wherever
   the counter happened to land. A pack is four levels and a closed set:
   finish or fail one and you go back to choosing among its four. */
const ownsPack = (pack) => pack.free || save.owned.includes(pack.id);
const canPlay = (i) => ownsPack(packOf(i));

/* ---------- ZEN ENTITLEMENT ----------
   Zen is premium, but deliberately NOT its own SKU sitting behind a wall
   that says "pay to play comfortably". Two ways in:

     - it comes free with ANY pack purchase, so it sweetens the first sale
       rather than competing with it
     - or it can be unlocked on its own

   Plus one free run, because nobody should be asked to buy a feel they have
   never felt. The genuine accessibility setting — clue display mode —
   stays free forever and is NOT part of this gate. */
const PAID_PACKS = PACKS.filter((p) => !p.free).map((p) => p.id);

const hasZen = () =>
  !!save.zenUnlocked || save.owned.some((id) => PAID_PACKS.includes(id));

const zenTrialAvailable = () => !hasZen() && !save.zenTrialUsed;

/* Derived, so adding a taller level can't silently leave its top row with
   no material. Hand-maintaining this number cost the Keep a white roof. */
CONFIG.MAX_Y = Math.max(...LEVELS.map((s) => parse(s).grid.y));

/* ---------- SAVE ----------
   One versioned record instead of loose keys, because progress is about to
   be worth something. Two rules it has to honour:
     - a corrupt or half-written save must never brick the game
     - a save from an older build must never be silently dropped
   A static PWA has no server, so there's also an export code: the whole
   save as text the player can carry to another device by hand. */

const SAVE_KEY = 'carve.save';
const SAVE_VERSION = 1;

const blankSave = () => ({
  version: SAVE_VERSION,
  level: 0,
  best: {},              // level name -> { stars, slips, hints, mode, at }
  owned: PACKS.filter((p) => p.free).map((p) => p.id),
  clueMode: 'chips',
  mode: 'scored',        // scored | zen
  zenUnlocked: false,
  zenTrialUsed: false,
  muted: false,
  focus: 'off',          // off | pulse | binaural
  haptics: true,         // navigator.vibrate, where the device has it
});

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return migrateLooseKeys();

    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return blankSave();

    // Unknown future version: keep what we understand rather than wiping.
    return { ...blankSave(), ...data, version: SAVE_VERSION };
  } catch {
    return blankSave();   // corrupt JSON must not brick the game
  }
}

/* Earlier builds wrote carve.level / carve.clueMode directly. Fold them in
   once so nobody loses the progress they already had. */
function migrateLooseKeys() {
  const save = blankSave();
  const level = Number(localStorage.getItem('carve.level'));
  const mode = localStorage.getItem('carve.clueMode');
  if (Number.isFinite(level) && level > 0) save.level = level;
  if (mode) save.clueMode = mode;
  return save;
}

const save = readSave();

/* Writes to both. localStorage is the local truth and works everywhere;
   the platform copy is what survives a different device. Their SDK debounces
   internally, so calling this on every change is fine, and our save is a
   couple of hundred bytes against their 1MB ceiling. */
function writeSave() {
  const body = JSON.stringify(save);
  try {
    localStorage.setItem(SAVE_KEY, body);
  } catch {
    /* private mode / quota - the run still works, it just won't persist */
  }
  try {
    if (CRAZY.ready) CRAZY.sdk.data.setItem(SAVE_KEY, body);
  } catch { /* platform storage unavailable; the local copy still stands */ }
}

/* Runs once the SDK is up, which is necessarily AFTER the synchronous read
   at module load. Two jobs:
     - adopt the platform's copy, because it is the one that followed the
       player from another device
     - otherwise push the local copy up, which their docs explicitly instruct
       ("copy all the existing localStorage keys into the data module if the
       user played your game before") — skip it and every existing player
       silently starts over
   This is also the cross-device save we thought needed a backend. On this
   platform it is free. */
function syncPlatformSave() {
  if (!CRAZY.ready) return false;

  let remote = null;
  try {
    remote = CRAZY.sdk.data.getItem(SAVE_KEY);
  } catch { return false; }

  if (!remote) {
    writeSave();                    // first run here: seed it from local
    return false;
  }

  try {
    const data = JSON.parse(remote);
    if (typeof data !== 'object' || data === null) return false;
    Object.assign(save, blankSave(), data, { version: SAVE_VERSION });
  } catch {
    return false;                   // corrupt remote must not brick the game
  }

  state.clueMode = save.clueMode;
  state.mode = save.mode || 'scored';
  return true;
}

/* ---------- SCORING ----------
   ONE gauge. Hearts and stars used to run side by side, but they were
   driven by the same thing — a slip took a heart AND a star — so the HUD
   showed the same fact twice and the player felt punished twice for one
   mistake. The stars ARE the lives now.

   A star has two halves and they mean different things:
     a slip takes a WHOLE star  — and whole stars are your life
     a hint takes a HALF        — score only, never the last half

   So hints cost you score and cost you nothing else: they can never be the
   thing that ends a run. Only slips can. And the invariant the player can
   actually read off the screen holds — alive means some star is left, zero
   stars means the stone cracked. */
const isZen = () => state.mode === 'zen';

function starsFor(slips, hints) {
  const left = Math.max(0, CONFIG.STARS - slips);
  if (left === 0) return 0;

  // Hints eat into the remainder but stop short of taking the last half,
  // so "no stars" never shows on a run that is still alive.
  return left - Math.min(hints * 0.5, left - 0.5);
}

const currentStars = () =>
  (isZen() || state.unscored ? 0 : starsFor(state.errors, state.hintsUsed));

function starMarkup(stars) {
  let out = '';
  for (let i = 1; i <= 3; i++) {
    const cls = stars >= i ? 'star full' : stars >= i - 0.5 ? 'star half' : 'star';
    out += `<span class="${cls}">&#9733;</span>`;
  }
  return out;
}

/* A Zen finish still puts the sculpture on the shelf — the reveal is the
   whole point of the game and withholding it would be mean. It records zero
   stars, so the shelf keeps an honest record and there's a reason to come
   back. It must never overwrite a scored result. */
function recordWin(name, stars, slips, hints, mode) {
  const prev = save.best[name];
  if (!prev || stars > (prev.stars ?? -1)) {
    save.best[name] = { stars, slips, hints, mode, at: Date.now() };
    writeSave();
  }
}

const completedCount = () => Object.keys(save.best).length;

/* ---------- HAPTICS ----------
   One funnel for every buzz in the game, because there are three reasons a
   vibration must not fire and scattering those checks across call sites is
   how one of them ends up missing it:

     - the device has no vibrator (every desktop, and all of iOS Safari,
       which has never shipped navigator.vibrate)
     - the player turned it off under Display
     - the player asked the OS for reduced motion

   hasHaptics is what the settings row keys off, so a device that cannot
   vibrate never offers a switch for it. */
const hasHaptics = typeof navigator !== 'undefined' && !!navigator.vibrate;

function buzz(pattern) {
  if (!hasHaptics || calm || save.haptics === false) return;
  // Some browsers throw here rather than returning false when the page is
  // not user-activated. A missing buzz must never cost a carve.
  try { navigator.vibrate(pattern); } catch { /* not worth reporting */ }
}

/* Portable save code. Base64 of the record with a short checksum so a
   mistyped code is rejected instead of half-applied. */
function exportSave() {
  const body = JSON.stringify(save);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum = (sum * 31 + body.charCodeAt(i)) >>> 0;
  return `${btoa(body)}.${sum.toString(36)}`;
}

function importSave(code) {
  try {
    const [encoded, checksum] = String(code).trim().split('.');
    const body = atob(encoded);
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum = (sum * 31 + body.charCodeAt(i)) >>> 0;
    if (sum.toString(36) !== checksum) return false;

    Object.assign(save, blankSave(), JSON.parse(body), { version: SAVE_VERSION });
    writeSave();
    return true;
  } catch {
    return false;
  }
}

/* Set when the Collection hands us a level through the URL. A deliberate
   choice must outrank any stored progress, cloud or local. */
let cameFromLink = false;

let levelIndex = Math.min(Math.max(save.level | 0, 0), LEVELS.length - 1);
let SHAPE = LEVELS[levelIndex];

/* ---------- THEMES ----------
   The stone ramp is no longer one global palette. Each pack carries its own,
   and moving between packs eases the cubes and the background across rather
   than cutting — the ease runs on the same dt the shards use.

   Signal colours are imported, never derived from the theme: see themes.js
   for why that separation is load-bearing. */
const themeState = {
  current: null,
  targets: [],
  // What a freshly exposed face flashes. Stone reads cold-white; wood is
  // paler and creamier under the surface than on it, which is the actual
  // thing you see when a gouge opens up limewood.
  cutColour: new THREE.Color('#fff5ee'),
};

function rampColour(ramp, y, maxY) {
  const t = maxY > 1 ? y / (maxY - 1) : 0;
  const scaled = t * (ramp.length - 1);
  const i = Math.min(Math.floor(scaled), ramp.length - 2);
  return new THREE.Color(ramp[i])
    .lerp(new THREE.Color(ramp[i + 1]), scaled - i);
}

/* ---------- MATERIAL FINISH ----------
   themes.js owns what a finish IS; this owns applying it to the materials
   the game happens to be made of. Both the cubes and the shards take it,
   because a chip off a wooden block is wooden.

   The signal materials deliberately do NOT: a struck cube, a mark and a
   hint stay smooth and untextured. Breaking material as well as colour
   makes a signal read louder on a grained surface, not weaker, and it
   keeps the ΔE that themes.js validates as the whole story. */
let currentFinish = 'stone';
const WHITE = new THREE.Color(0xffffff);

function applyFinish(theme) {
  const name = theme.material || 'stone';

  /* A fresh cut is not white. It is the SAME material with none of the
     weathering — so it is the pack's own stone taken most of the way to
     white, which keeps a pink pack pink and a green pack green underneath
     the brightness. Flat white here made every carve look like a lens
     flare pasted over the sculpture regardless of the theme. Wood stops
     shorter of white and keeps a cream cast, because exposed limewood is
     paler than its surface but nowhere near bleached. */
  themeState.cutColour
    .copy(rampColour(theme.ramp, CONFIG.MAX_Y / 2, CONFIG.MAX_Y))
    .lerp(WHITE, name === 'wood' ? 0.62 : 0.76);

  // Setting needsUpdate recompiles the material's shader program. That is
  // cheap once on a level load and expensive every load, so two wooden
  // packs in a row cost nothing.
  if (name === currentFinish) return;
  currentFinish = name;

  const finish = finishOf(theme);
  const map = finish ? woodTexture() : null;

  for (const material of view.cubeMaterials) {
    material.map = map;
    material.roughness = finish ? finish.roughness : 0.62;
    material.needsUpdate = true;
  }

  for (const material of shards.materials) {
    material.map = map;
    material.roughness = finish ? 0.6 : 0.35;
    material.needsUpdate = true;
  }
}

/* The game's own copy of the grain. themes.js hands out the canvas; the
   texture object belongs to whichever WebGL context is going to sample it,
   and the thumbnail renderer has its own. */
let grainTexture = null;

function woodTexture() {
  if (!grainTexture) {
    grainTexture = new THREE.CanvasTexture(woodGrainCanvas());
    grainTexture.colorSpace = THREE.SRGBColorSpace;
    grainTexture.anisotropy = 4;
  }
  return grainTexture;
}

function applyTheme(theme, instant = false) {
  if (!theme || themeState.current === theme) return;
  themeState.current = theme;

  const finish = finishOf(theme);
  themeState.targets = view.cubeMaterials.map((_, y) => {
    const colour = rampColour(theme.ramp, y, CONFIG.MAX_Y);
    // Brightened by exactly what the grain will take back out, so a wooden
    // pack averages the ramp stop rather than a darker cousin of it.
    if (finish) colour.multiplyScalar(finish.gain);
    return colour;
  });

  applyFinish(theme);

  if (instant) {
    view.cubeMaterials.forEach((m, i) => m.color.copy(themeState.targets[i]));
  }

  crossfadeBackground(theme.bg);
}

/* Gradients cannot be transitioned, so the background is two stacked layers
   and we fade the incoming one over the outgoing one. */
let bgFront = true;

function crossfadeBackground(stops) {
  const gradient = `radial-gradient(118% 62% at 50% 16%, ${stops[0]} 0%, `
    + `${stops[1]} 46%, transparent 100%), `
    + `linear-gradient(180deg, ${stops[0]} 0%, ${stops[1]} 62%, ${stops[2]} 100%)`;

  const incoming = document.getElementById(bgFront ? 'bg-b' : 'bg-a');
  const outgoing = document.getElementById(bgFront ? 'bg-a' : 'bg-b');
  if (!incoming || !outgoing) return;

  incoming.style.background = gradient;
  incoming.style.opacity = '1';
  outgoing.style.opacity = '0';
  bgFront = !bgFront;
}

/* Framerate-independent ease: the same wall-clock feel at 30fps or 120. */
function stepTheme(dt) {
  if (!themeState.targets.length) return;
  const k = 1 - Math.exp(-dt * 5);

  view.cubeMaterials.forEach((material, i) => {
    const target = themeState.targets[i];
    if (!target) return;
    material.color.lerp(target, k);

    // Shards are chips off the block, so they follow the stone.
    const shard = shards.materials[i];
    if (shard) { shard.color.copy(material.color); shard.emissive.copy(material.color); }
  });
}
const DIGIT_COLORS = ['#b0a3ad', '#4faa96', '#4295c9', '#7377cf',
  '#a065c6', '#cc5c96', '#d95a68'];

const state = {
  cells: [], byKey: new Map(),
  wasteTotal: 0, wasteLeft: 0,
  status: 'playing',
  clueMode: save.clueMode,
  mode: save.mode || 'scored',
  hintsLeft: CONFIG.HINTS,
  revivesUsed: 0,
  paused: false,        // frozen behind a platform ad
  errors: 0,             // keepers struck this attempt
  hintsUsed: 0,
  unscored: false,       // set the moment an attempt touches Zen
};

const view = {
  scene: null, camera: null, renderer: null, stage: null,
  spherical: null, target: null, cameraBase: null, sizeScratch: null,
  raycaster: null, pointer: null,
  group: null, meshes: [], meshByKey: new Map(), labels: [],
  cubeMaterials: [], keeperMaterial: null, markMaterial: null,
  auditMaterial: null,

  fitRadius: 0,        // the distance fitCamera chose; zoom is relative to it
  examining: false,
  turntablePause: 0,
};

/* Shards live in their own pool. Twelve per carve with forty carves a level
   is a lot of churn, so meshes are reused rather than allocated and thrown
   away mid-play. */
const shards = { free: [], live: [], geometry: null, materials: [] };

/* Stone powder. Flat typed arrays and ONE draw call for the lot, rather
   than a mesh each: dust wants three times the count of the shards at a
   twentieth of the visual weight, and forty meshes a carve is not a trade
   worth making on a phone. Slots are a ring buffer — a burst that finds
   every slot alive overwrites the oldest instead of growing the pool. */
const dust = {
  points: null, geometry: null, material: null,
  position: null, colour: null, alpha: null, peak: null, size: null,
  vx: null, vy: null, vz: null, life: null,
  cap: 0, cursor: 0, live: 0,
};

/* The bright face a neighbouring cube shows once the stone in front of it
   is gone. Each quad owns its material for the life of the game, because
   they fade independently and a shared material can only hold one opacity —
   allocating one per carve is exactly the churn the shard pool exists to
   avoid. */
const cuts = { free: [], live: [], geometry: null };

/* Reused every frame while a shake is running. */
const shake = { t: 0, mag: 0, phase: 0 };
const shakeRight = new THREE.Vector3();
const shakeUp = new THREE.Vector3();

const ui = {};

/* ---------- LEVEL ---------- */

const key = (x, y, z) => `${x},${y},${z}`;

/* Face-adjacent only. Six neighbours reads far better on a cube than the
   26-cell Moore neighbourhood, and keeps the numbers small. */
const OFFSETS = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];

function buildLevel() {
  // The text map decides everything: which cells exist at all (the mass)
  // and which of those are the sculpture.
  const { cells: keepers, mass, grid } = parse(SHAPE);
  CONFIG.GRID = grid;

  state.cells = [];
  state.byKey.clear();

  for (let y = 0; y < grid.y; y++) {
    for (let z = 0; z < grid.z; z++) {
      for (let x = 0; x < grid.x; x++) {
        const k = key(x, y, z);
        if (!mass.has(k)) continue;

        const cell = {
          x, y, z, key: k,
          keeper: keepers.has(k),
          carved: false, marked: false, struck: false,
          near: 0,
        };
        state.cells.push(cell);
        state.byKey.set(k, cell);
      }
    }
  }

  // Clue = how many face-neighbours belong to the shape.
  for (const cell of state.cells) {
    cell.near = OFFSETS.reduce((n, [dx, dy, dz]) => {
      const other = state.byKey.get(key(cell.x + dx, cell.y + dy, cell.z + dz));
      return n + (other && other.keeper ? 1 : 0);
    }, 0);
  }

  state.wasteTotal = state.cells.filter((c) => !c.keeper).length;
  state.wasteLeft = state.wasteTotal;
  state.status = 'playing';
  state.revivesUsed = 0;
  state.errors = 0;
  state.hintsUsed = 0;
  state.unscored = isZen();   // a fresh attempt in Zen is unscored from the off
}

/* THE AUTHORING CONSTRAINT — the rule the player never has to think about.

   Every keeper must connect back to the ground through other keepers.
   NOT "must have a keeper directly beneath it": that stricter rule reads as
   more physical but it outlaws the arch, the bridge and every overhang,
   because a span is held up sideways by its legs. Connectivity permits all
   of those and still rejects genuinely floating islands. */
function validateLevel() {
  const grounded = new Set();
  const queue = state.cells.filter((c) => c.keeper && c.y === 0);
  queue.forEach((c) => grounded.add(c.key));

  while (queue.length) {
    const cell = queue.shift();
    for (const [dx, dy, dz] of OFFSETS) {
      const next = state.byKey.get(key(cell.x + dx, cell.y + dy, cell.z + dz));
      if (!next || !next.keeper || grounded.has(next.key)) continue;
      grounded.add(next.key);
      queue.push(next);
    }
  }

  const floating = state.cells.filter((c) => c.keeper && !grounded.has(c.key));

  const report = {
    shape: SHAPE.name,
    grid: `${CONFIG.GRID.x}x${CONFIG.GRID.y}x${CONFIG.GRID.z}`,
    cubes: state.cells.length,
    keepers: state.cells.length - state.wasteTotal,
    toCarve: state.wasteTotal,
    floatingKeepers: floating.map((c) => c.key),
    stands: floating.length === 0,
  };
  console.log('[level validator]', report);
  return report;
}

/* ---------- SCENE ---------- */

function initScene() {
  view.stage = document.getElementById('stage');
  view.scene = new THREE.Scene();

  view.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  view.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  view.renderer.shadowMap.enabled = true;
  view.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  view.stage.appendChild(view.renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(view.renderer);
  view.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  view.scene.environmentIntensity = 0.35;
  pmrem.dispose();

  view.group = new THREE.Group();
  view.scene.add(view.group);

  view.target = new THREE.Vector3(0, (CONFIG.GRID.y - 1) / 2, 0);
  view.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  view.cameraBase = new THREE.Vector3();
  view.spherical = new THREE.Spherical(12, 1.12, 0.7);

  view.scene.add(new THREE.HemisphereLight(0xfff4fa, 0xd8c6d4, 1.05));

  const light = new THREE.DirectionalLight(0xfff6f2, 1.5);
  light.position.set(6, 11, 8);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.radius = 3;
  light.shadow.bias = -0.0015;
  Object.assign(light.shadow.camera,
    { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 32 });
  light.shadow.camera.updateProjectionMatrix();
  view.scene.add(light);

  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.5);
  fill.position.set(-7, 4, -5);
  view.scene.add(fill);

  /* The chisel's light. Added here, at intensity 0, and never removed:
     three keys its shader programs on the NUMBER of lights, so adding this
     on the first carve would recompile every material in the scene mid-tap.
     It costs one term in the lighting loop for the whole session instead.
     No shadow — a shadow map per carve is not worth a fifth of a second. */
  view.spark = new THREE.PointLight(0xffeacf, 0, 3.6, 2);
  view.spark.userData.life = 0;
  view.scene.add(view.spark);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ opacity: 0.17 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -CONFIG.CUBE / 2 - 0.001;
  floor.receiveShadow = true;
  view.scene.add(floor);

  view.raycaster = new THREE.Raycaster();
  view.pointer = new THREE.Vector2();
  view.sizeScratch = new THREE.Vector2();

  view.renderer.setAnimationLoop(renderFrame);
}

/* Solves the framing properly instead of treating width and height as
   independent. Two things broke the old version: at an elevated angle the
   mass's DEPTH adds to its on-screen height, and its horizontal extent
   changes as you orbit. Measured, 3 of 4 shapes clipped, worst at 1.17 NDC.

   Here every corner of the bounding box is tested against every camera
   orientation the player can actually reach, and we keep the largest
   distance any of them demands. Computed once per level, so the framing
   never pumps in and out while you drag. */
const PHI_MIN = 0.35, PHI_MAX = 1.5;

function fitCamera() {
  const { x: gx, y: gy, z: gz } = CONFIG.GRID;
  const c = CONFIG.CUBE;
  const half = new THREE.Vector3(gx * c / 2, gy * c / 2, gz * c / 2);

  view.target.set(0, (gy - 1) / 2 * c, 0);

  const tanV = Math.tan((view.camera.fov * Math.PI) / 180 / 2);
  const tanH = tanV * view.camera.aspect;

  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    corners.push(new THREE.Vector3(sx * half.x, sy * half.y, sz * half.z));
  }

  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let needed = 0;

  for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 12) {
    for (let s = 0; s <= 4; s++) {
      const phi = PHI_MIN + (PHI_MAX - PHI_MIN) * (s / 4);
      dir.setFromSphericalCoords(1, phi, theta);      // target -> camera
      right.crossVectors(UP, dir).normalize();
      up.crossVectors(dir, right).normalize();

      for (const corner of corners) {
        const depth = corner.dot(dir);                // toward the camera
        needed = Math.max(needed,
          Math.abs(corner.dot(right)) / tanH + depth,
          Math.abs(corner.dot(up)) / tanV + depth);
      }
    }
  }

  view.fitRadius = needed * 1.06;
  view.spherical.radius = view.fitRadius;
  updateCamera();
}

function updateCamera() {
  view.spherical.phi = THREE.MathUtils.clamp(view.spherical.phi, PHI_MIN, PHI_MAX);
  view.cameraBase.setFromSpherical(view.spherical).add(view.target);
  view.camera.position.copy(view.cameraBase);
  view.camera.lookAt(view.target);
  view.camera.updateMatrixWorld();

  if (shake.t <= 0) return;

  // Pixels to world units at the distance we are actually standing, so the
  // wobble is the same size on screen for every shape and every zoom.
  const height = view.renderer.domElement.clientHeight || 1;
  const perPixel = 2 * view.spherical.radius
    * Math.tan((view.camera.fov * Math.PI) / 360) / height;

  const k = shake.t / CONFIG.SHAKE_LIFE;                  // 1 -> 0
  const amp = CONFIG.SHAKE_PIXELS * perPixel * shake.mag * k * k;
  const w = shake.t * CONFIG.SHAKE_HZ * Math.PI * 2;

  // Screen axes, taken from the matrix we just built, so the shake is
  // always across the view rather than through the sculpture.
  shakeRight.setFromMatrixColumn(view.camera.matrixWorld, 0);
  shakeUp.setFromMatrixColumn(view.camera.matrixWorld, 1);

  // Irrational-ish frequency ratio: the two axes never line up into a
  // diagonal, which is what makes a two-axis shake look like a rattle.
  view.camera.position
    .addScaledVector(shakeRight, Math.sin(w + shake.phase) * amp)
    .addScaledVector(shakeUp, Math.cos(w * 1.37 + shake.phase) * amp * 0.62);
  view.camera.updateMatrixWorld();
}

function syncSize() {
  const { clientWidth: w, clientHeight: h } = view.stage;
  if (!w || !h) return;
  const current = view.renderer.getSize(view.sizeScratch);
  if (current.x === w && current.y === h) return;

  view.renderer.setSize(w, h, false);
  view.camera.aspect = w / h;
  fitCamera();
  view.camera.updateProjectionMatrix();

  /* fitCamera() resets the distance and the look-at to the values PLAY
     wants, which is right for play and wrong for a sculpture that has
     already been framed for the reward card. Without this, anything that
     changes the viewport after a win — turning the phone, mobile browser
     chrome sliding away — throws the reveal framing out and snaps the
     sculpture back to the middle of the screen behind the card.
     Recomputing rather than restoring, because the new aspect deserves a
     new answer. */
  if (view.examining && state.status === 'won') reframeReveal();

  // gl_PointSize is in device pixels, so the dust shader needs the drawing
  // buffer height and the vertical FOV to turn a world size into one. Set
  // here rather than per frame: it only changes when the viewport does.
  if (dust.material) {
    dust.material.uniforms.uScale.value =
      (h * view.renderer.getPixelRatio())
      / (2 * Math.tan((view.camera.fov * Math.PI) / 360));
  }
}

let lastFrame = performance.now();

function renderFrame() {
  const now = performance.now();
  // Clamped: a backgrounded tab hands back a huge delta on its first frame,
  // which would fling every live shard off into the distance.
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  syncSize();
  if (!state.paused) {
    stepShards(dt);
    stepDust(dt);
    stepCuts(dt);
    stepSpark(dt);
    stepShake(dt);
    stepTheme(dt);

    // The reveal drives the camera itself, so the turntable stands down
    // until it has landed. Two things easing the same spherical would
    // fight, and the fight looks like a stutter at the end of the move.
    if (reveal.phase !== 'off') stepReveal(dt);
    else if (view.examining) stepExamine(dt, now);
  }

  view.renderer.render(view.scene, view.camera);
}

/* ---------- VOXELS ---------- */

function worldPosInto(cell, out) {
  return out.set(
    (cell.x - (CONFIG.GRID.x - 1) / 2) * CONFIG.CUBE,
    cell.y * CONFIG.CUBE,
    (cell.z - (CONFIG.GRID.z - 1) / 2) * CONFIG.CUBE);
}

function worldPos(cell) {
  return worldPosInto(cell, new THREE.Vector3());
}

/* One carve now feeds four effects that all want the same point in space.
   Computed once into this and passed down, rather than four Vector3 a tap. */
const impact = new THREE.Vector3();

/* The outward normal of the face a neighbour turns toward the gap, for each
   of the six OFFSETS. Built once: a fresh cut spawns up to six of these and
   the alternative is six Vector3 per carve. */
const FACE_NORMALS = OFFSETS.map(([x, y, z]) => new THREE.Vector3(-x, -y, -z));

function buildVoxels() {
  if (!view.cubeMaterials.length) {
    // Ramp spans MAX_Y, not the current grid, so materials survive a shape
    // change without needing to be rebuilt and disposed.
    for (let y = 0; y < CONFIG.MAX_Y; y++) {
      view.cubeMaterials.push(new THREE.MeshStandardMaterial(
        { color: 0xffffff, roughness: 0.62, metalness: 0 }));
    }
    view.keeperMaterial = new THREE.MeshStandardMaterial(
      { color: SIGNALS.danger, roughness: 0.5 });
    view.markMaterial = new THREE.MeshStandardMaterial(
      { color: SIGNALS.mark, emissive: 0x6b4310, emissiveIntensity: 0.3, roughness: 0.45 });
    // Cool teal, so a hint can never be mistaken for an amber player mark.
    view.hintMaterial = new THREE.MeshStandardMaterial(
      { color: SIGNALS.hint, emissive: 0x0f5b50, emissiveIntensity: 0.45, roughness: 0.4 });

    // Audit ghost. depthTest off so buried sculpture reads through the stone.
    view.auditMaterial = new THREE.MeshStandardMaterial({
      color: SIGNALS.danger, emissive: SIGNALS.danger, emissiveIntensity: 0.55,
      transparent: true, opacity: 0.42, depthTest: false, depthWrite: false,
    });
  }

  const size = CONFIG.CUBE - CONFIG.GAP;
  for (const cell of state.cells) {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(size, size, size, 4, 0.1),
      view.cubeMaterials[cell.y]);
    mesh.position.copy(worldPos(cell));
    mesh.userData.key = cell.key;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    view.group.add(mesh);
    view.meshes.push(mesh);
    view.meshByKey.set(cell.key, mesh);
  }
  view.scene.updateMatrixWorld(true);
}

function disposeVoxels() {
  for (const mesh of view.meshByKey.values()) {
    view.group.remove(mesh);
    mesh.geometry.dispose();
  }
  view.meshByKey.clear();
  view.meshes.length = 0;
  for (const sprite of view.labels) {
    view.group.remove(sprite);
    sprite.material.dispose();
  }
  view.labels.length = 0;
}

/* ---------- SHATTER ----------
   A carved block bursts into twelve glowing chips of its own colour, thrown
   outward and pulled down by gravity. They shrink to nothing rather than
   fading, which keeps every shard on ONE shared material per layer — fading
   would need a material instance per shard and that is a lot of garbage for
   an effect that lasts under a second. */

function initShards() {
  shards.geometry = new THREE.BoxGeometry(0.24, 0.24, 0.24);

  for (const base of view.cubeMaterials) {
    shards.materials.push(new THREE.MeshStandardMaterial({
      color: base.color,
      emissive: base.color,
      // Was 0.5. On these pale ramps, half the layer colour added on top of
      // an already-lit surface saturates: every chip came out white, off
      // every pack, so a burst read as paper rather than as pieces of the
      // block. Quarter keeps the lift that stops chips going muddy against
      // the stone behind them, without bleaching out which stone they are.
      emissiveIntensity: 0.25,
      roughness: 0.35,
    }));
  }

  // Enough for several overlapping bursts; they expire fast so this is ample.
  for (let i = 0; i < CONFIG.SHARDS * 6; i++) {
    const mesh = new THREE.Mesh(shards.geometry, shards.materials[0]);
    mesh.visible = false;
    view.group.add(mesh);
    shards.free.push(mesh);
  }
}

function burst(cell, origin = worldPos(cell)) {
  const material = shards.materials[
    Math.min(cell.y, shards.materials.length - 1)];

  for (let i = 0; i < CONFIG.SHARDS; i++) {
    const mesh = shards.free.pop();
    if (!mesh) return;               // pool exhausted: skip, never allocate

    mesh.material = material;
    mesh.position.copy(origin);
    mesh.position.x += (Math.random() - 0.5) * 0.35;
    mesh.position.y += (Math.random() - 0.5) * 0.35;
    mesh.position.z += (Math.random() - 0.5) * 0.35;
    mesh.scale.setScalar(1);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    mesh.visible = true;

    // Biased upward so the burst reads as a pop, not a puff sideways.
    const velocity = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 1.3 + 0.45,
      Math.random() * 2 - 1,
    ).normalize().multiplyScalar(1.9 + Math.random() * 1.7);

    shards.live.push({ mesh, velocity, life: 0, spin: (Math.random() - 0.5) * 9 });
  }
}

function stepShards(dt) {
  for (let i = shards.live.length - 1; i >= 0; i--) {
    const shard = shards.live[i];
    shard.life += dt;

    if (shard.life >= CONFIG.SHARD_LIFE) {
      shard.mesh.visible = false;
      shards.free.push(shard.mesh);
      shards.live.splice(i, 1);
      continue;
    }

    shard.velocity.y -= CONFIG.GRAVITY * dt;
    shard.mesh.position.addScaledVector(shard.velocity, dt);
    shard.mesh.rotation.x += shard.spin * dt;
    shard.mesh.rotation.y += shard.spin * dt * 0.7;
    shard.mesh.scale.setScalar(1 - shard.life / CONFIG.SHARD_LIFE);
  }
}

/* ---------- DUST ----------
   The shards say "a block broke". The dust says "it was stone". It is the
   difference between a puzzle piece vanishing and a chisel going in, and it
   only works if you never quite notice it — so it is small, slow, and there
   is not much of it.

   One THREE.Points, one draw call, one shader. Sizes and alphas are
   attributes rather than uniforms so a single buffer can hold motes at
   different ages, and the whole thing is a fixed allocation made at load. */

const DUST_VERT = `
  attribute vec3 aColour;
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColour;
  varying float vAlpha;
  void main() {
    vColour = aColour;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // uScale carries the viewport, so aSize is a real world size and a mote
    // does not change size when the player pinches to zoom.
    gl_PointSize = max(1.0, aSize * uScale / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = `
  varying vec3 vColour;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;                       // square sprite -> round mote
    float a = vAlpha * smoothstep(0.25, 0.02, r2);
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColour, a);
  }
`;

function initDust() {
  const cap = CONFIG.DUST * 8;      // several overlapping carves, no more
  dust.cap = cap;

  dust.position = new Float32Array(cap * 3);
  dust.colour = new Float32Array(cap * 3);
  dust.alpha = new Float32Array(cap);
  dust.size = new Float32Array(cap);
  dust.peak = new Float32Array(cap);
  dust.vx = new Float32Array(cap);
  dust.vy = new Float32Array(cap);
  dust.vz = new Float32Array(cap);
  dust.life = new Float32Array(cap);

  dust.geometry = new THREE.BufferGeometry();
  dust.geometry.setAttribute('position', new THREE.BufferAttribute(dust.position, 3));
  dust.geometry.setAttribute('aColour', new THREE.BufferAttribute(dust.colour, 3));
  dust.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(dust.alpha, 1));
  dust.geometry.setAttribute('aSize', new THREE.BufferAttribute(dust.size, 1));

  dust.material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,          // dust must never punch a hole in the stone
  });

  dust.points = new THREE.Points(dust.geometry, dust.material);
  // The bounding sphere is computed from a buffer we rewrite every frame,
  // so leaving culling on would let three cull live motes at the edges.
  dust.points.frustumCulled = false;
  dust.points.renderOrder = 1;
  view.group.add(dust.points);
}

function puff(cell, origin) {
  if (calm || !dust.points) return;

  const base = view.cubeMaterials[Math.min(cell.y, view.cubeMaterials.length - 1)];
  // Powder is the same stone seen in its own shadow. Lighter would vanish
  // against these backgrounds; this is the smallest step that still reads.
  const r = base.color.r * 0.74, g = base.color.g * 0.74, b = base.color.b * 0.74;

  for (let n = 0; n < CONFIG.DUST; n++) {
    const i = dust.cursor;
    dust.cursor = (dust.cursor + 1) % dust.cap;

    const p = i * 3;
    dust.position[p] = origin.x + (Math.random() - 0.5) * 0.8;
    dust.position[p + 1] = origin.y + (Math.random() - 0.5) * 0.8;
    dust.position[p + 2] = origin.z + (Math.random() - 0.5) * 0.8;

    dust.colour[p] = r; dust.colour[p + 1] = g; dust.colour[p + 2] = b;

    // Mostly sideways off the cut, a little up. Powder is thrown out of a
    // groove, it is not launched the way a chip is.
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 0.8;
    dust.vx[i] = Math.cos(angle) * speed;
    dust.vz[i] = Math.sin(angle) * speed;
    dust.vy[i] = (0.15 + Math.random() * 0.75) * speed;

    dust.size[i] = 0.035 + Math.random() * 0.055;
    dust.peak[i] = 0.3 + Math.random() * 0.28;
    dust.alpha[i] = dust.peak[i];
    dust.life[i] = CONFIG.DUST_LIFE * (0.7 + Math.random() * 0.3);
  }

  dust.live = 1;      // the step will count them properly

  // All four, not just the two this function writes. stepDust flags position
  // and alpha every frame it runs, but if a frame renders between the puff
  // and the next step — the tab coming back from hidden does exactly this —
  // the new motes would be drawn at the previous occupant's coordinates.
  dust.geometry.attributes.position.needsUpdate = true;
  dust.geometry.attributes.aColour.needsUpdate = true;
  dust.geometry.attributes.aAlpha.needsUpdate = true;
  dust.geometry.attributes.aSize.needsUpdate = true;
}

function stepDust(dt) {
  if (!dust.live) return;

  // Framerate-independent drag, evaluated once for the whole buffer.
  const drag = Math.exp(-CONFIG.DUST_DRAG * dt);
  const fall = CONFIG.DUST_GRAVITY * dt;
  let live = 0;

  for (let i = 0; i < dust.cap; i++) {
    let t = dust.life[i];
    if (t <= 0) continue;

    t -= dt;
    if (t <= 0) {
      dust.life[i] = 0;
      dust.alpha[i] = 0;
      dust.size[i] = 0;
      continue;
    }
    dust.life[i] = t;
    live++;

    dust.vy[i] -= fall;
    dust.vx[i] *= drag; dust.vy[i] *= drag; dust.vz[i] *= drag;

    const p = i * 3;
    dust.position[p] += dust.vx[i] * dt;
    dust.position[p + 1] += dust.vy[i] * dt;
    dust.position[p + 2] += dust.vz[i] * dt;

    // Squared, so it hangs at full opacity and then leaves quickly rather
    // than lingering as a grey haze over the sculpture.
    const k = t / CONFIG.DUST_LIFE;
    dust.alpha[i] = dust.peak[i] * k * k;
  }

  dust.live = live;
  dust.geometry.attributes.position.needsUpdate = true;
  dust.geometry.attributes.aAlpha.needsUpdate = true;
  dust.geometry.attributes.aSize.needsUpdate = true;
}

/* ---------- FRESH CUT ----------
   Two things happen to light when stone comes away, and the game showed
   neither: the face behind it has never been exposed, and for an instant
   there is more light in the gap than there was in the solid.

   The face is a quad laid a few thousandths off the neighbour's surface,
   inside the 0.07 gap the grid already leaves between cubes, so it can
   never poke through anything. The light is one PointLight that lives in
   the scene from load with intensity 0 — adding and removing a light
   changes the light COUNT, which recompiles every material in the scene,
   and doing that on a tap is a frame the player feels. */

function initCuts() {
  const face = CONFIG.CUBE - CONFIG.GAP;
  cuts.geometry = new THREE.PlaneGeometry(face, face);

  /* Held in from the edges and falling off fast. A wide, slow gradient
     reads as a lens flare sitting in front of the sculpture; this reads as
     the middle of a face catching the light, which is what a cut does. */
  const map = texture('fresh-cut', (ctx, size) => {
    const glow = ctx.createRadialGradient(
      size / 2, size / 2, 0, size / 2, size / 2, size * 0.52);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.34, 'rgba(255,255,255,0.86)');
    glow.addColorStop(0.72, 'rgba(255,255,255,0.26)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  });

  // Six faces per carve, and carves overlap. Three bursts' worth.
  for (let i = 0; i < 18; i++) {
    const mesh = new THREE.Mesh(cuts.geometry, new THREE.MeshBasicMaterial({
      map, transparent: true, opacity: 0, depthWrite: false,
    }));
    mesh.visible = false;
    mesh.renderOrder = 2;
    view.group.add(mesh);
    cuts.free.push(mesh);
  }
}

function cutFaces(cell) {
  const warm = themeState.cutColour;

  for (let i = 0; i < OFFSETS.length; i++) {
    const [dx, dy, dz] = OFFSETS[i];
    const neighbour = state.byKey.get(key(cell.x + dx, cell.y + dy, cell.z + dz));
    if (!neighbour || neighbour.carved) continue;

    const mesh = view.meshByKey.get(neighbour.key);
    if (!mesh) continue;

    const quad = cuts.free.pop();
    if (!quad) return;              // pool exhausted: skip, never allocate

    const normal = FACE_NORMALS[i];
    quad.position.copy(mesh.position)
      .addScaledVector(normal, (CONFIG.CUBE - CONFIG.GAP) / 2 + 0.012);
    // lookAt points +Z at the target, and +Z is a plane's normal.
    quad.lookAt(
      quad.position.x + normal.x,
      quad.position.y + normal.y,
      quad.position.z + normal.z);

    quad.material.color.copy(warm);
    quad.material.opacity = CONFIG.CUT_PEAK;
    quad.visible = true;
    cuts.live.push({ mesh: quad, life: 0 });
  }
}

function stepCuts(dt) {
  for (let i = cuts.live.length - 1; i >= 0; i--) {
    const cut = cuts.live[i];
    cut.life += dt;

    if (cut.life >= CONFIG.CUT_LIFE) {
      cut.mesh.visible = false;
      cut.mesh.material.opacity = 0;
      cuts.free.push(cut.mesh);
      cuts.live.splice(i, 1);
      continue;
    }

    const k = 1 - cut.life / CONFIG.CUT_LIFE;
    cut.mesh.material.opacity = CONFIG.CUT_PEAK * k * k;
  }
}

function spark(origin) {
  if (calm || !view.spark) return;
  view.spark.position.copy(origin);
  view.spark.userData.life = CONFIG.SPARK_LIFE;
}

function stepSpark(dt) {
  const light = view.spark;
  if (!light || light.userData.life <= 0) return;

  light.userData.life = Math.max(0, light.userData.life - dt);
  const k = light.userData.life / CONFIG.SPARK_LIFE;
  light.intensity = CONFIG.SPARK_PEAK * k * k;
}

/* ---------- CAMERA SHAKE ----------
   The brief on this is one word: micro. Overdone shake on a phone held a
   foot from your face is nausea, and every game that ships it ships it too
   big — so the amplitude here is specified in PIXELS and converted to world
   units against the current camera distance, which means it stays two and a
   half pixels whether the shape is a 3-cube Pillar or a 7-cube Ziggurat and
   whatever the player has pinched the zoom to.

   It translates the camera and leaves the orientation alone. Rotating it
   would swing the far side of the sculpture much further than the near
   side, which is the thing that reads as a lurch. */

function addShake(strength = 1) {
  if (calm) return;
  shake.t = CONFIG.SHAKE_LIFE;
  shake.mag = strength;
  shake.phase = Math.random() * Math.PI * 2;
}

function stepShake(dt) {
  if (shake.t <= 0) return;
  shake.t = Math.max(0, shake.t - dt);
  updateCamera();          // the offset is applied there, on the way out
}

/* Retire everything in flight, immediately.

   Debris outlives a level: the pools are not touched by disposeVoxels, so
   whatever was mid-air when the level changed carries into the next one.
   That was survivable when it was only shards and only reachable by
   finishing a level, because the reveal runs for three seconds and nothing
   lives that long. It stopped being survivable once the reveal became
   skippable — tap to skip, tap "Carve the next one", and you are half a
   second from the last carve with a cut-face quad still glowing where a
   cube used to be in a level that no longer exists. */
function clearEffects() {
  for (const shard of shards.live) {
    shard.mesh.visible = false;
    shards.free.push(shard.mesh);
  }
  shards.live.length = 0;

  for (const cut of cuts.live) {
    cut.mesh.visible = false;
    cut.mesh.material.opacity = 0;
    cuts.free.push(cut.mesh);
  }
  cuts.live.length = 0;

  if (dust.points) {
    dust.life.fill(0);
    dust.alpha.fill(0);
    dust.size.fill(0);
    dust.live = 0;
    dust.geometry.attributes.aAlpha.needsUpdate = true;
    dust.geometry.attributes.aSize.needsUpdate = true;
  }

  if (view.spark) { view.spark.userData.life = 0; view.spark.intensity = 0; }
  shake.t = 0;
  shake.mag = 0;
}

/* ---------- NUMBER CHIPS ---------- */

const textures = new Map();

function texture(cacheKey, draw) {
  if (textures.has(cacheKey)) return textures.get(cacheKey);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);

  const made = new THREE.CanvasTexture(canvas);
  made.colorSpace = THREE.SRGBColorSpace;
  made.anisotropy = 4;
  textures.set(cacheKey, made);
  return made;
}

const font = (size, weight = 800) =>
  `${weight} ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;

/* CHIP: small, opaque, high contrast. Easiest to read one at a time. */
function digitTexture(n) {
  return texture(`chip${n}`, (ctx, size) => {
    const pad = size * 0.1;
    ctx.shadowColor = 'rgba(74,59,73,0.32)';
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetY = size * 0.025;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, size * 0.26);
    ctx.fillStyle = '#fffcfd';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = size * 0.04;
    ctx.strokeStyle = DIGIT_COLORS[n];
    ctx.stroke();

    ctx.fillStyle = DIGIT_COLORS[n];
    ctx.font = font(size * 0.46);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n, size / 2, size * 0.53);
  });
}

/* GHOST: block-sized and translucent, so a clue reads as the socket the cube
   left behind rather than a sticker floating in front of it. */
function ghostTexture(n) {
  return texture(`ghost${n}`, (ctx, size) => {
    ctx.font = font(size * 0.82);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.085;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineJoin = 'round';
    ctx.strokeText(n, size / 2, size * 0.54);
    ctx.fillStyle = DIGIT_COLORS[n];
    ctx.fillText(n, size / 2, size * 0.54);
  });
}


/* The cavity a carved cube leaves is exactly one cube wide, so the clue can
   simply sit at its centre - no need for the gap-mouth maths the Jenga
   build needed for its long bars. */
function addLabel(cell) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: digitTexture(cell.near), transparent: true, depthWrite: false }));
  sprite.position.copy(worldPos(cell));
  sprite.userData.cellKey = cell.key;
  view.group.add(sprite);
  view.labels.push(sprite);
  styleLabel(sprite);
}

/* ---------- CLUE LOAD ----------
   Carving 30 cubes leaves 30 clues on screen and no way to tell which ones
   still have anything to say. Two separate reliefs:
     - satisfied clues fade back automatically (nothing to decide there)
     - the player can dial the whole layer down by hand
   Dimmed rather than deleted, so a clue can still be re-read, and because
   satisfaction depends on the player's own marks it has to be reversible. */

const neighboursOf = (cell) => OFFSETS
  .map(([dx, dy, dz]) => state.byKey.get(key(cell.x + dx, cell.y + dy, cell.z + dz)))
  .filter(Boolean);

function clueSatisfied(cell) {
  return neighboursOf(cell)
    .every((n) => n.carved || n.struck || n.marked);
}

function styleLabel(sprite) {
  const cell = state.byKey.get(sprite.userData.cellKey);
  const mode = state.clueMode;

  if (mode === 'off') {
    sprite.visible = false;
    return;
  }

  const ghost = mode === 'ghost';
  const spent = clueSatisfied(cell);

  sprite.visible = true;
  sprite.material.map = ghost ? ghostTexture(cell.near) : digitTexture(cell.near);
  sprite.scale.setScalar(ghost ? 0.92 : 0.55);
  sprite.material.opacity = spent ? 0.16 : (ghost ? 0.62 : 1);
  sprite.material.needsUpdate = true;
}

function refreshClues() {
  view.labels.forEach(styleLabel);
}

/* Switching into Zen taints the current attempt for good. Without that you
   could carve in Zen until the shape was obvious, flip back and claim three
   stars. Retrying the level clears it — the penalty is on the attempt, not
   on the player. */
function toggleMode() {
  // Leaving Zen is always free. Only entering it is gated.
  if (!isZen()) {
    if (!hasZen()) {
      if (!zenTrialAvailable()) return openZenOffer();
      save.zenTrialUsed = true;
      writeSave();
      toast('Zen trial — this one is on us');
    }
  }

  state.mode = isZen() ? 'scored' : 'zen';
  save.mode = state.mode;
  writeSave();

  if (isZen()) state.unscored = true;

  updateHUD();
  toast(isZen()
    ? 'Zen — no limits, no stars'
    : (state.unscored ? 'Scored — this attempt still unscored' : 'Scored — 3 stars to lose'));
}

function openZenOffer() {
  ui.zenSheet.hidden = false;
}

/* Prototype stand-in for a real purchase. In production this is the store
   callback; everything downstream of it stays exactly as it is. */
function unlockZen() {
  save.zenUnlocked = true;
  writeSave();
  ui.zenSheet.hidden = true;
  updateHUD();
  toast('Zen unlocked — carve as long as you like');
}

function cycleClueMode() {
  const order = ['chips', 'ghost', 'off'];
  state.clueMode = order[(order.indexOf(state.clueMode) + 1) % order.length];
  save.clueMode = state.clueMode;
  writeSave();
  refreshClues();
  updateHUD();
  toast(`Clues: ${state.clueMode}`);
}

/* ---------- PLAY ---------- */

function carve(cellKey) {
  const cell = state.byKey.get(cellKey);
  if (!cell || cell.carved || cell.struck || state.status !== 'playing') return;
  if (cell.marked) return;              // marked cubes are protected

  if (cell.keeper) {
    // Struck the sculpture. It stays, flushed coral, and can't be hit twice.
    cell.struck = true;
    const mesh = view.meshByKey.get(cellKey);
    if (mesh) mesh.material = view.keeperMaterial;
    view.meshes.splice(view.meshes.indexOf(mesh), 1);

    // A strike is the chisel hitting something that does not give. Harder
    // and duller than a carve: a longer buzz, a bigger jolt, no dust.
    buzz(60);
    addShake(1.9);
    playStrike();
    state.errors++;

    // Zen keeps the information — you still learn this cube is sculpture —
    // and drops the punishment. There is no way to fail a Zen carve.
    if (!isZen()) {
      refreshClues();
      updateHUD();
      if (state.errors >= CONFIG.STARS) fractureThenAd();
      return;
    }

    refreshClues();
    updateHUD();
    return;
  }

  cell.carved = true;
  state.wasteLeft--;

  const mesh = view.meshByKey.get(cellKey);
  if (mesh) {
    view.group.remove(mesh);
    view.meshes.splice(view.meshes.indexOf(mesh), 1);
    view.meshByKey.delete(cellKey);
    mesh.geometry.dispose();
  }

  /* THE IMPACT. Five things, computed off one point in space, each of them
     individually too small to notice and collectively the difference
     between a block disappearing and a chisel going in:

       burst      chips of the block, thrown
       puff       powder, which is what says "stone" rather than "tile"
       cutFaces   the faces behind it, which have never seen light
       spark      more light in the gap for a fifth of a second
       shake      two and a half pixels, so the tap lands in the hand

     cutFaces runs BEFORE the clue label goes in, so it lights the stone and
     not the chip that is about to sit in the hole. */
  worldPosInto(cell, impact);
  burst(cell, impact);
  puff(cell, impact);
  cutFaces(cell);
  spark(impact);
  addShake(1);
  buzz(12);
  playCarve(cell);

  syncMusicLayers();

  addLabel(cell);
  refreshClues();          // this carve may have satisfied nearby clues
  updateHUD();
  if (state.wasteLeft === 0) finish('won');
}

function toggleMark(cellKey) {
  const cell = state.byKey.get(cellKey);
  if (!cell || cell.carved || cell.struck || state.status !== 'playing') return;

  cell.marked = !cell.marked;
  const mesh = view.meshByKey.get(cellKey);
  if (mesh) {
    mesh.material = cell.marked ? view.markMaterial : view.cubeMaterials[cell.y];
  }
  buzz(15);
  playMark(cell.marked);
  refreshClues();          // a decided cube can retire the clues around it
}

/* THE PAYOFF. Strip the clue chips and let the sculpture stand clean. */
function finish(result) {
  state.status = result;

  if (result === 'won') {
    playReveal();
    for (const sprite of view.labels) {
      view.group.remove(sprite);
      sprite.material.dispose();
    }
    view.labels.length = 0;
    for (const cell of state.cells) {
      if (!cell.keeper) continue;
      const mesh = view.meshByKey.get(cell.key);
      if (mesh && !cell.struck) mesh.material = view.cubeMaterials[cell.y];
    }
  }

  const won = result === 'won';
  const pack = packOf(levelIndex);
  const setDone = won && stepIn(levelIndex) === pack.shapes.length - 1;
  const canRevive = !won && state.revivesUsed < CONFIG.MAX_REVIVES;

  const stars = currentStars();
  if (won) {
    // The mode actually finished in, NOT derived from `unscored` — a revived
    // scored run is unscored too, and badging that as Zen on the shelf would
    // be a plain lie about how it was played.
    recordWin(SHAPE.name, stars, state.errors, state.hintsUsed,
      isZen() ? 'zen' : 'scored');
  }

  ui.bannerEmoji.textContent = won ? (setDone ? '🏛️' : '✨') : '💔';
  ui.bannerTitle.textContent = won
    ? (setDone ? `${pack.name} complete` : `${SHAPE.name} revealed`)
    : 'The stone cracked';
  if (won) {
    const tally = [];
    if (state.errors) tally.push(`${state.errors} slip${state.errors > 1 ? 's' : ''}`);
    if (state.hintsUsed) tally.push(`${state.hintsUsed} hint${state.hintsUsed > 1 ? 's' : ''}`);

    ui.bannerStars.hidden = false;
    ui.bannerStars.innerHTML = starMarkup(stars);
    ui.bannerBody.textContent = state.unscored
      ? `Carved in Zen — no stars, but it's on the shelf. ${completedCount()} of ${LEVELS.length} collected.`
      : (tally.length
        ? `${tally.join(' and ')}. ${completedCount()} of ${LEVELS.length} collected.`
        : `Flawless. ${completedCount()} of ${LEVELS.length} collected.`);
  } else {
    ui.bannerStars.hidden = true;
    ui.bannerBody.textContent =
      `${state.wasteTotal - state.wasteLeft} of ${state.wasteTotal} carved before the chisel slipped.`;
  }

  ui.adBtn.hidden = !canRevive;
  if (canRevive) { resetAdButton(); prepareRewardedAd(); }

  // A pack is finished when all four of its sculptures are on the shelf.
  const packDone = pack.shapes.every((n) => save.best[n]);

  ui.again.textContent = won
    ? (packDone ? 'See the collection' : 'Carve the next one')
    : 'Try again';
  ui.again.onclick = won
    ? (packDone ? toCollection : nextInPack)
    : retryLevel;

  // Always a way back to the four, whichever way the level ended.
  ui.pick.hidden = won && packDone;
  ui.pick.textContent = won ? 'Go to the Collection' : 'Choose a level';
  ui.pick.onclick = toCollection;

  // The card is built now but stays hidden either way. A win earns the
  // reveal; a crack goes straight to the turntable and waits behind the X,
  // because there is nothing to show off and a victory lap over a failure
  // is the wrong note.
  ui.banner.classList.toggle('reward', won);
  if (won) beginReveal();
  else enterExamine();
}

/* ---------- THE REVEAL ----------
   What was here before: the last block came away and Examine mode started
   in the same frame, from whatever angle the player's last tap happened to
   leave the camera at. It was not wrong, it was just over — the sculpture
   appeared and nothing marked it.

   Three beats, and the GAPS are the design:

     SETTLE  (0.45s) Nothing moves. The last burst is still falling and the
                     dust is still in the air, and cutting the camera into
                     that would throw away the one moment the player is
                     actually looking at what they made.
     MOVE    (2.2s)  Two and a third radians round, easing in and out, with
                     a slight pull back at the midpoint before it pushes in
                     closer than the fitted distance. The pull back is what
                     makes it read as a camera rather than a lerp: it opens
                     the shape up, then comes to it.
     BREATH  (0.6s)  The camera has landed and it STAYS landed, with no UI
                     at all, before anything is asked of the player. This is
                     the beat the old flow was missing. A choice that
                     appears the instant a move ends reads as the move
                     having been a loading spinner for the choice.

   Then the card rises from the bottom — see #banner.reward in carve.css —
   and the turntable takes over. Deliberately not the full-screen scrim the
   loss card uses: the sculpture stays visible above the card and stays
   draggable, so the reward is still on screen while the question is asked.

   Total is a little over three seconds, which is a long time on the fortieth
   level. So any pointer skips to the end. */

const reveal = {
  phase: 'off',      // off | settle | move | breath
  t: 0,
  fromTheta: 0, fromPhi: 0, fromRadius: 0,
  toTheta: 0, toPhi: 0, toRadius: 0,
  from: new THREE.Vector3(), to: new THREE.Vector3(),   // look-at, eased
  arc: 0,
};

/* Reused by frameReveal; it runs once per win, but allocating a basis and a
   bounding box per win for the life of the app is pointless churn. */
const revealDir = new THREE.Vector3();
const revealRight = new THREE.Vector3();
const revealUp = new THREE.Vector3();
const revealMin = new THREE.Vector3();
const revealMax = new THREE.Vector3();
const revealCentre = new THREE.Vector3();
const revealCorner = new THREE.Vector3();
const revealTarget = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/* Where the camera should end up to show THIS sculpture off.

   fitCamera() cannot answer this and should not try. It runs once per level
   and solves a different problem: fit the whole MASS, at every angle the
   player can drag to, into the whole viewport. By the time the reveal runs,
   two thirds of that is wrong — most of the mass is gone, only one angle is
   going to be used, and a third of the viewport is about to be a card.

   So this solves the actual problem: fit what is LEFT, at the one angle we
   are landing on, into the strip of screen that will still be visible. Same
   method as fitCamera — every corner of the bounding box tested against the
   camera basis, with depth added because a corner nearer the camera needs
   more room than one further away. */
function frameReveal(theta, phi) {
  const tanV = Math.tan((view.camera.fov * Math.PI) / 360);
  const tanH = tanV * view.camera.aspect;

  revealDir.setFromSphericalCoords(1, phi, theta);      // target -> camera
  revealRight.crossVectors(WORLD_UP, revealDir).normalize();
  revealUp.crossVectors(revealDir, revealRight).normalize();

  // The sculpture's own bounds, not the block's.
  revealMin.set(Infinity, Infinity, Infinity);
  revealMax.set(-Infinity, -Infinity, -Infinity);
  let found = false;

  for (const cell of state.cells) {
    if (!cell.keeper) continue;
    const mesh = view.meshByKey.get(cell.key);
    if (!mesh) continue;
    revealMin.min(mesh.position);
    revealMax.max(mesh.position);
    found = true;
  }

  // No keepers standing should be impossible on a win, but a framing
  // routine is not the place to find out the hard way.
  if (!found) {
    revealTarget.set(0, (CONFIG.GRID.y - 1) / 2 * CONFIG.CUBE, 0);
    return { radius: view.fitRadius, target: revealTarget };
  }

  const half = (CONFIG.CUBE - CONFIG.GAP) / 2;
  revealMin.subScalar(half);
  revealMax.addScalar(half);
  revealCentre.addVectors(revealMin, revealMax).multiplyScalar(0.5);

  const band = CONFIG.REVEAL_BAND_BOTTOM - CONFIG.REVEAL_BAND_TOP;
  let radius = 0;

  for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
    revealCorner.set(
      (sx ? revealMax : revealMin).x - revealCentre.x,
      (sy ? revealMax : revealMin).y - revealCentre.y,
      (sz ? revealMax : revealMin).z - revealCentre.z);

    const depth = revealCorner.dot(revealDir);
    radius = Math.max(radius,
      Math.abs(revealCorner.dot(revealUp)) / (tanV * band) + depth,
      Math.abs(revealCorner.dot(revealRight)) / tanH + depth);
  }

  radius *= 1.04;

  /* Aim at the SCULPTURE, not at where the block used to be. The extents
     above are measured about the sculpture's own centre, so aiming anywhere
     else silently invalidates them — which is exactly what happened: Well
     and Turtle sit off-centre in their block and ran 12px off the side of a
     375px screen while the fit calculation insisted they fitted.

     Orbiting the sculpture's centre is also the better turntable: an
     off-centre shape stays put while the background swings, rather than the
     shape swinging around a point beside it. */
  revealTarget.copy(revealCentre);

  /* Then put its middle at the middle of the BAND rather than of the
     screen. This one shift is along world Y and not camera-up on purpose:
     the turntable keeps turning after this lands, and a camera-up offset
     would rotate with it and make the composition drift. */
  const bandCentre = (CONFIG.REVEAL_BAND_TOP + CONFIG.REVEAL_BAND_BOTTOM) / 2;
  const ndc = 1 - 2 * bandCentre;              // +1 screen top, -1 bottom
  // Guarded: at a near-overhead angle world Y barely projects to screen Y,
  // and the correction would run away to infinity.
  revealTarget.y -= (ndc * radius * tanV) / Math.max(0.25, revealUp.y);

  return { radius, target: revealTarget };
}

/* Re-solve the framing for the current viewport. Mid-move it only moves the
   destination, so the ease carries on into the new answer instead of
   jumping; once landed it applies straight away. */
function reframeReveal() {
  const framing = frameReveal(reveal.toTheta, reveal.toPhi);
  reveal.toRadius = framing.radius;
  reveal.to.copy(framing.target);
  reveal.arc = view.fitRadius * CONFIG.REVEAL_ARC;

  if (reveal.phase !== 'off') return;
  view.spherical.radius = framing.radius;
  view.target.copy(framing.target);
  updateCamera();
}

function beginReveal() {
  gameplayStop();       // the run is over; this is a break
  view.examining = true;
  view.turntablePause = Infinity;    // the reveal owns the camera until it lands

  ui.banner.hidden = true;
  ui.examineExit.hidden = true;      // nothing to exit: the choice comes to you
  document.body.classList.add('examining', 'revealing');

  reveal.fromTheta = view.spherical.theta;
  reveal.fromPhi = view.spherical.phi;
  reveal.fromRadius = view.spherical.radius;
  reveal.from.copy(view.target);

  reveal.toTheta = reveal.fromTheta + CONFIG.REVEAL_TURN;
  reveal.toPhi = CONFIG.REVEAL_PHI;
  const framing = frameReveal(reveal.toTheta, reveal.toPhi);
  reveal.toRadius = framing.radius;
  reveal.to.copy(framing.target);
  reveal.arc = view.fitRadius * CONFIG.REVEAL_ARC;

  // Reduced motion gets the destination without the journey. It still gets
  // the framing — landing on a considered angle is composition, not motion.
  if (calm) { landReveal(); return; }

  reveal.phase = 'settle';
  reveal.t = 0;
}

function stepReveal(dt) {
  reveal.t += dt;

  if (reveal.phase === 'settle') {
    if (reveal.t >= CONFIG.REVEAL_SETTLE) { reveal.phase = 'move'; reveal.t = 0; }
    return;
  }

  if (reveal.phase === 'move') {
    const p = Math.min(reveal.t / CONFIG.REVEAL_MOVE, 1);
    // easeInOutCubic. A camera that starts and stops at zero velocity is the
    // difference between a move and a slide.
    const e = p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;

    view.spherical.theta = reveal.fromTheta + (reveal.toTheta - reveal.fromTheta) * e;
    view.spherical.phi = reveal.fromPhi + (reveal.toPhi - reveal.fromPhi) * e;
    view.spherical.radius = reveal.fromRadius
      + (reveal.toRadius - reveal.fromRadius) * e
      + Math.sin(p * Math.PI) * reveal.arc;      // out at the midpoint, in by the end
    view.target.lerpVectors(reveal.from, reveal.to, e);
    updateCamera();

    if (p >= 1) { reveal.phase = 'breath'; reveal.t = 0; }
    return;
  }

  // breath: hold, and ask nothing.
  if (reveal.t >= CONFIG.REVEAL_BREATH) landReveal();
}

/* The end of the sequence, wherever it was interrupted. Snapping to the
   destination rather than stopping where the skip happened means an
   impatient player and a patient one end up looking at the same framing. */
function landReveal() {
  if (reveal.phase === 'off' && !ui.banner.hidden) return;

  reveal.phase = 'off';
  view.spherical.theta = reveal.toTheta;
  view.spherical.phi = reveal.toPhi;
  view.spherical.radius = reveal.toRadius;
  view.target.copy(reveal.to);
  updateCamera();

  view.turntablePause = 0;                 // the slow turn takes over
  document.body.classList.remove('revealing');
  ui.banner.hidden = false;
}

/* ---------- EXAMINE MODE ----------
   A finished carve used to be interrupted by a card the moment it ended —
   the reveal was covered by the thing congratulating you for it. Now the
   run ends into a turntable: overlays gone, HUD frozen, the sculpture
   turning slowly, free to spin and zoom. The results card waits behind the
   X until the player is done looking. */

function enterExamine() {
  gameplayStop();      // the run is over; this is a break
  view.examining = true;
  view.turntablePause = 0;

  ui.banner.hidden = true;
  ui.examineExit.hidden = false;
  document.body.classList.add('examining');

  applyAudit(true);
}

function exitExamine() {
  leaveExamine();
  applyAudit(false);
  ui.banner.hidden = false;      // now the results, once they've had a look
}

/* Everything examine mode turned on, turned off. Its own function because
   there are now two ways out — the X on a crack, and simply starting the
   next level from the reward card, which the win path leaves examining. */
function leaveExamine() {
  view.examining = false;
  reveal.phase = 'off';
  ui.examineExit.hidden = true;
  document.body.classList.remove('examining', 'revealing');
}

function stepExamine(dt, now) {
  if (now >= view.turntablePause) {
    view.spherical.theta += CONFIG.TURNTABLE * dt;
    updateCamera();
  }
  if (view.auditMaterial) {
    view.auditMaterial.opacity = 0.3 + 0.2 * Math.sin(now / 280);
  }
}

/* Shows where the sculpture actually was. Only meaningful when stone is
   still standing — after a clean finish nothing is hidden, so this correctly
   does nothing. depthTest is off so buried blocks read straight through the
   stone that is covering them; that's the whole point of an audit. */
function applyAudit(on) {
  if (on && state.wasteLeft === 0) return;

  for (const [k, mesh] of view.meshByKey) {
    const cell = state.byKey.get(k);
    if (!cell) continue;

    if (on) {
      if (cell.keeper && !cell.struck) mesh.material = view.auditMaterial;
      continue;
    }

    mesh.material = cell.struck ? view.keeperMaterial
      : cell.marked ? view.markMaterial
        : view.cubeMaterials[cell.y];
  }
}

/* ---------- ZOOM ---------- */

function zoomBy(factor) {
  if (!view.fitRadius) return;
  view.spherical.radius = THREE.MathUtils.clamp(
    view.spherical.radius * factor,
    view.fitRadius * CONFIG.ZOOM_MIN,
    view.fitRadius * CONFIG.ZOOM_MAX);
  updateCamera();
}

/* ---------- HINTS ----------
   Deliberately reasons only from ground truth - carved cells are known
   waste, struck cells are known keepers. The player's own marks are treated
   as unknown, because a hint built on a wrong guess would confidently point
   at the wrong cube and destroy trust in the button. */

function findHint() {
  for (const cell of state.cells) {
    if (!cell.carved) continue;

    const neighbours = neighboursOf(cell);
    const knownKeepers = neighbours.filter((n) => n.struck).length;
    const unknown = neighbours.filter((n) => !n.carved && !n.struck);
    if (!unknown.length) continue;

    const remaining = cell.near - knownKeepers;
    if (remaining === 0) return { kind: 'carve', cell: unknown[0], from: cell };
    if (remaining === unknown.length) return { kind: 'keep', cell: unknown[0], from: cell };
  }
  return null;
}

function useHint() {
  if (state.status !== 'playing') return;
  if (!isZen() && state.hintsLeft <= 0) return;

  const hint = findHint();
  if (!hint) return toast('No certain move — try a different angle');

  // Zen hands out hints freely; in a scored run each one costs half a star.
  if (!isZen()) state.hintsLeft--;
  state.hintsUsed++;
  playHint();
  updateHUD();

  const mesh = view.meshByKey.get(hint.cell.key);
  if (mesh) {
    mesh.material = view.hintMaterial;
    clearTimeout(view.hintTimer);

    // Recompute on restore rather than replaying a captured material: the
    // player may well mark the cube while it's still glowing, and putting
    // the old material back would silently erase that mark.
    view.hintTimer = setTimeout(() => {
      const still = view.meshByKey.get(hint.cell.key);
      const cell = state.byKey.get(hint.cell.key);
      if (still && cell) {
        still.material = cell.marked ? view.markMaterial : view.cubeMaterials[cell.y];
      }
    }, 2600);
  }

  toast(hint.kind === 'carve'
    ? `The ${hint.from.near} says this one is waste`
    : `The ${hint.from.near} says this one is part of the shape`);
}

/* ---------- INPUT ---------- */

function pick(clientX, clientY) {
  const rect = view.renderer.domElement.getBoundingClientRect();
  view.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  view.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  view.raycaster.setFromCamera(view.pointer, view.camera);
  const hits = view.raycaster.intersectObjects(view.meshes, false);
  return hits.length ? hits[0].object.userData.key : null;
}

function initInput() {
  const el = view.renderer.domElement;
  el.style.touchAction = 'none';

  let dragging = false, moved = 0, startTime = 0, lastX = 0, lastY = 0;
  let pressTimer = null, longFired = false;
  const cancelHold = () => { clearTimeout(pressTimer); pressTimer = null; };

  // Two-finger pinch needs every live pointer, not just the primary one.
  const touches = new Map();
  let pinchStart = 0;

  const holdTurntable = () => {
    view.turntablePause = performance.now() + CONFIG.TURNTABLE_WAIT;
  };

  const pinchGap = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  el.addEventListener('pointerdown', (e) => {
    if (state.paused) return;

    // Three seconds of reveal is right the first time and long the fortieth.
    // Any touch takes the ending; it does not also start a drag, so the
    // gesture that skipped is not also the gesture that spun the sculpture.
    if (reveal.phase !== 'off') { landReveal(); return; }

    ui.hint.classList.add('gone');
    startAudio();
    holdTurntable();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touches.size === 2) {
      // Second finger down: this is a pinch, so abandon the tap/hold gesture.
      pinchStart = pinchGap();
      dragging = false;
      cancelHold();
      return;
    }

    dragging = true; moved = 0; longFired = false;
    startTime = performance.now();
    lastX = e.clientX; lastY = e.clientY;
    el.setPointerCapture(e.pointerId);

    const { clientX, clientY } = e;
    pressTimer = setTimeout(() => {
      longFired = true; dragging = false;
      const hit = pick(clientX, clientY);
      if (hit) toggleMark(hit);
    }, CONFIG.LONG_PRESS);
  });

  el.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (touches.size === 2) {
      const gap = pinchGap();
      if (pinchStart > 0 && gap > 0) zoomBy(pinchStart / gap);
      pinchStart = gap;
      holdTurntable();
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.hypot(dx, dy);
    if (moved >= CONFIG.TAP_SLOP) cancelHold();

    view.spherical.theta -= dx * 0.007;
    view.spherical.phi -= dy * 0.007;
    updateCamera();
    holdTurntable();
  });

  const release = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinchStart = 0;
    holdTurntable();
  };

  el.addEventListener('pointerup', (e) => {
    cancelHold();
    release(e);
    if (!dragging || longFired) return;
    dragging = false;
    if (moved < CONFIG.TAP_SLOP && performance.now() - startTime < CONFIG.TAP_TIME) {
      const hit = pick(e.clientX, e.clientY);
      if (hit) carve(hit);
    }
  });

  el.addEventListener('pointercancel', (e) => {
    cancelHold(); release(e); dragging = false;
  });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomBy(1 + e.deltaY * 0.0012);
    holdTurntable();
  }, { passive: false });
}

/* ---------- HUD ---------- */

function updateHUD() {
  ui.left.textContent = state.wasteLeft;
  ui.fill.style.width = `${(state.wasteLeft / state.wasteTotal) * 100}%`;

  // Zen has nothing to lose, so it says so rather than showing a gauge
  // that cannot move.
  ui.stars.innerHTML = isZen() || state.unscored
    ? '<span class="zen-tag">' + (isZen() ? 'Zen' : 'Unscored') + '</span>'
    : starMarkup(currentStars());
  // The lock is shown on the pill rather than sprung on tap, so nobody
  // taps expecting Zen and gets a sales pitch instead.
  ui.modeBtn.textContent = isZen()
    ? 'Mode · Zen'
    : `Mode · Scored${hasZen() || zenTrialAvailable() ? '' : ' 🔒'}`;

  // Spelled out rather than iconographic on purpose: an icon that means
  // three different things is exactly the wrong call for a game that's
  // already asking a lot of working memory.
  const pack = packOf(levelIndex);
  ui.levelName.textContent = `${pack.name} · ${SHAPE.name}`;

  let pips = '';
  for (let i = 0; i < pack.shapes.length; i++) {
    const cls = i < stepIn(levelIndex) ? 'done'
      : i === stepIn(levelIndex) ? 'current' : '';
    pips += `<span class="pip ${cls}"></span>`;
  }
  ui.pips.innerHTML = pips;

  ui.clueBtn.querySelector('b').textContent = state.clueMode;
  ui.muteBtn.querySelector('b').textContent = save.muted ? 'Off' : 'On';
  ui.focusBtn.querySelector('b').textContent = save.focus || 'off';

  // Says "Off (system)" rather than lying about being on, when the OS
  // reduced-motion setting is what is actually silencing it.
  ui.hapticsBtn.hidden = !hasHaptics;
  ui.hapticsBtn.querySelector('b').textContent = calm ? 'Off (system)'
    : save.haptics === false ? 'Off' : 'On';
  ui.hapticsBtn.disabled = calm;
  ui.hintBtn.textContent = isZen() ? 'Hint · ∞' : `Hint · ${state.hintsLeft}`;
  ui.hintBtn.disabled = !isZen() && state.hintsLeft <= 0;
}

let toastTimer = null;

function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
}

function loadLevel(index) {
  let wanted = THREE.MathUtils.clamp(index, 0, LEVELS.length - 1);

  // Never open a level from a pack the player doesn't own, however they
  // got here — a stale save, a shared link, a hand-typed URL.
  if (!canPlay(wanted)) wanted = 0;

  levelIndex = wanted;
  SHAPE = LEVELS[levelIndex];
  save.level = levelIndex;
  writeSave();

  disposeVoxels();
  clearEffects();          // nothing from the last level flies into this one
  buildLevel();
  validateLevel();
  buildVoxels();

  state.hintsLeft = CONFIG.HINTS;
  resetMusicLayers();
  applyTheme(themeFor(LEVELS[levelIndex].pack));

  // The reward card sits ON TOP of a live examine session, so "Carve the
  // next one" arrives here with the turntable still turning and the HUD
  // still faded out. Without this the next level plays with no controls.
  leaveExamine();
  fitCamera();                    // also re-centres the target on the new mass

  ui.banner.hidden = true;
  ui.banner.classList.remove('reward');
  updateHUD();
  gameplayStart();                // a level starting is gameplay resuming
}

/* Next level WITHIN the pack. At the end of a pack there is no next — the
   player goes to the collection and picks, which is also where the next
   pack is offered for sale. */
function nextInPack() {
  const start = packStart(levelIndex);
  const size = packOf(levelIndex).shapes.length;
  const next = start + ((stepIn(levelIndex) + 1) % size);
  loadLevel(next);
}

const retryLevel = () => loadLevel(levelIndex);
const toCollection = () => { location.href = 'gallery.html'; };



/* ---------- MONETIZATION ----------
   Lifted wholesale from the Jenga build, which already had this shaped
   right: a run ends, and the ad is offered as a way to continue rather than
   as a tax on starting. Same two-path structure - a real rewarded ad when a
   publisher id is configured, a local simulation otherwise, so the game is
   always playable and no third-party request fires until we mean it. */

/* ---- THE ONE LINE TO CHANGE WHEN ADSENSE APPROVES ----
   Paste the ca-pub-XXXXXXXXXXXXXXXX id from your AdSense account into
   publisherId. Everything else is already wired: setting it turns on the
   consent prompt, the Display > Ads row, and the rewarded ad on a crack.
   Leave it empty and the game runs with no ad code and no consent question.

   Set testMode to false for real ads. While true, Google serves test ads
   only - which is what you want until the site is approved, because live
   ads on an unapproved site is a policy violation. */
const ADS = { publisherId: '', testMode: true, ready: false, showAd: null };

/* Loading the AdSense script sets third-party cookies, and GDPR/ePrivacy
   want consent BEFORE that happens, not after. Rather than remembering to
   add a banner the day we paste in a publisher id, the gate lives here
   permanently: no consent, no script, no exceptions.

   Today publisherId is empty so nothing loads either way and no banner is
   shown — asking for consent to something that never fires is its own dark
   pattern. The moment an id is set, this starts demanding an answer. */
const CONSENT_KEY = 'carve.consent';

function consentState() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

/* Only EU/UK visitors legally need the prompt, but we cannot detect that
   client-side without a geo lookup that is itself a privacy problem. So we
   ask everyone. It is one tap, once. */
function needsConsent() {
  return !!ADS.publisherId && consentState() === null;
}

function setConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* private mode */ }
  ui.consent.hidden = true;
  if (value === 'granted') { initAds(); prepareRewardedAd(); }
}

/* Consent has to be withdrawable to be consent at all, so this is reachable
   from Display, not only on first run. Revoking cannot unload a script that
   has already run — the honest thing is to say the change lands on reload
   rather than to imply we can claw it back. */
function openConsent() {
  if (!ADS.publisherId) return false;
  ui.consent.hidden = false;
  return true;
}

function consentLabel() {
  const state = consentState();
  return state === 'granted' ? 'On' : state === 'denied' ? 'Off' : 'Ask';
}

function initAds() {
  // Never run a second ad stack alongside the platform's own.
  if (window.CrazyGames?.SDK) return;
  if (!ADS.publisherId) return;
  if (consentState() !== 'granted') return;
  /* Idempotent. Consent is revocable, so grant -> revoke -> grant is a real
     sequence a player can produce, and without this each pass appended
     another copy of Google's script. Three loader tags on one page is both
     wasted bandwidth and the kind of thing that fails an AdSense review. */
  if (ADS.ready) return;

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='
    + encodeURIComponent(ADS.publisherId);
  script.dataset.adClient = ADS.publisherId;
  if (ADS.testMode) script.dataset.adbreakTest = 'on';
  document.head.appendChild(script);

  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adConfig = (o) => { window.adsbygoogle.push(o); };
  window.adConfig({ preloadAdBreaks: 'on', sound: 'off' });
  ADS.ready = true;
}

/* Relative path, so it also registers correctly from a GitHub Pages
   subpath. Service workers need https or localhost — over file:// this
   silently no-ops, which is fine. Not registered inside the CrazyGames
   iframe: the platform serves the game itself and a worker of ours would
   be competing with theirs for the same requests. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.CrazyGames?.SDK) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

function prepareRewardedAd() {
  ADS.showAd = null;
  if (!ADS.ready) return;

  window.adBreak({
    type: 'reward',
    name: 'carve-revive',
    beforeReward: (showAdFn) => { ADS.showAd = showAdFn; },
    adViewed: grantRevive,
    adDismissed: resetAdButton,
    adBreakDone: (info) => { if (info && info.breakStatus !== 'viewed') resetAdButton(); },
  });
}

function resetAdButton() {
  ui.adBtn.disabled = false;
  ui.adBtn.textContent = '▶  Watch ad  ·  Keep carving';
}

function watchAd() {
  if (state.revivesUsed >= CONFIG.MAX_REVIVES) return;
  ui.adBtn.disabled = true;

  // Platform first: on CrazyGames this is the only permitted ad path.
  const onPlatform = requestCrazyAd('rewarded', {
    onFinished: grantRevive,
    onError: () => { resetAdButton(); toast('Ad unavailable — carry on'); },
  });
  if (onPlatform) { ui.adBtn.textContent = 'Loading ad…'; return; }

  if (ADS.showAd) {
    ui.adBtn.textContent = 'Loading ad…';
    const show = ADS.showAd;
    ADS.showAd = null;
    show();
    return;
  }

  let left = CONFIG.AD_SECONDS;
  ui.adBtn.textContent = `Ad playing…  ${left}`;
  const timer = setInterval(() => {
    left--;
    if (left > 0) { ui.adBtn.textContent = `Ad playing…  ${left}`; return; }
    clearInterval(timer);
    ui.adBtn.textContent = 'Reward granted  ·  +1 heart';
    setTimeout(grantRevive, 450);
  }, 1000);
}

/* Revive resumes the same carve rather than restarting it - losing the
   progress would make the ad feel like a punishment. */
function grantRevive() {
  state.revivesUsed++;
  state.errors = Math.max(0, state.errors - 1);   // one slip's worth of margin back
  state.unscored = true;                          // ads buy the reveal, never the stars
  state.status = 'playing';
  ui.banner.hidden = true;
  updateHUD();
}

/* ============================================================
   LAYERED MUSIC
   ------------------------------------------------------------
   Vertical remixing: three stems that all start at the SAME instant and
   never stop. Progress only moves their gain. That is the whole trick —
   starting a stem late would put it out of phase with the others forever,
   and no amount of fading fixes a track that is off the beat.

   Files drop into TRACKS. While those are null the layers are synthesised,
   so the mixer is testable today and swapping in real stems is a one-line
   change that touches nothing else.
   ============================================================ */

const AUDIO = {
  TRACKS: { base: null, rhythm: null, melody: null },   // put URLs here
  FADE: 3,          // seconds, per the brief
  CUT: 0.015,       // a true instant cut is an audible click, not silence
  LOOP: 8,          // seconds; every generated part is built to divide this
  THRESHOLDS: { rhythm: 0.33, melody: 0.66 },
  VOLUME: 0.5,
};

const audio = {
  ctx: null, master: null, layers: {},
  started: false, ready: false,
  faded: { rhythm: false, melody: false },
};

/* The brief calls this layersCleared. Carve's equivalent is how much of the
   waste stone is gone. */
const musicProgress = () =>
  (state.wasteTotal ? (state.wasteTotal - state.wasteLeft) / state.wasteTotal : 0);

/* ---------- generated stems ---------- */

function buffer(seconds, fill) {
  const rate = audio.ctx.sampleRate;
  const buf = audio.ctx.createBuffer(1, Math.floor(rate * seconds), rate);
  fill(buf.getChannelData(0), rate);
  return buf;
}

/* Frequencies are whole numbers of cycles per loop, so the seam is silent.
   110Hz and 165Hz give 880 and 1320 cycles across 8 seconds exactly. */
function makeBase() {
  return buffer(AUDIO.LOOP, (d, rate) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / rate;
      const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / AUDIO.LOOP);
      d[i] = (0.16 * Math.sin(2 * Math.PI * 110 * t)
        + 0.10 * Math.sin(2 * Math.PI * 165 * t)) * swell;
    }
  });
}

/* 90bpm: a beat is 2/3s and twelve of them fill the loop exactly. */
function makeRhythm() {
  const beat = 60 / 90;
  return buffer(AUDIO.LOOP, (d, rate) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / rate;
      const into = t % beat;
      const env = Math.exp(-into * 22);
      d[i] = 0.34 * Math.sin(2 * Math.PI * 180 * into) * env;
    }
  });
}

function makeMelody() {
  const beat = 60 / 90;
  const notes = [440, 550, 660, 550, 495, 660, 880, 660,
    440, 550, 660, 495];       // pentatonic, twelve slots, one per beat
  return buffer(AUDIO.LOOP, (d, rate) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / rate;
      const slot = Math.floor(t / beat) % notes.length;
      const into = t % beat;
      const env = Math.exp(-into * 5) * (1 - Math.min(into / beat, 1) ** 3);
      d[i] = 0.16 * Math.sin(2 * Math.PI * notes[slot] * into) * env;
    }
  });
}

async function loadStem(name, generate) {
  const url = AUDIO.TRACKS[name];
  if (!url) return generate();

  try {
    const res = await fetch(url);
    return await audio.ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    return generate();   // a missing stem must never take the game down
  }
}

/* ---------- transport ---------- */

/* Browsers refuse audio until a gesture, so this is armed by the first
   pointerdown rather than at load. */
async function startAudio() {
  if (audio.started) return;
  audio.started = true;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  audio.ctx = new Ctx();
  if (audio.ctx.state === 'suspended') await audio.ctx.resume();

  audio.master = audio.ctx.createGain();
  audio.master.gain.value = save.muted ? 0 : AUDIO.VOLUME;
  audio.master.connect(audio.ctx.destination);

  // Built before the stems are awaited: decoding a real stem could take a
  // second and the first carve must not be the one sound that goes missing.
  sfx.rig = makeSfxRig(audio.ctx, audio.master);

  const stems = {
    base: await loadStem('base', makeBase),
    rhythm: await loadStem('rhythm', makeRhythm),
    melody: await loadStem('melody', makeMelody),
  };

  // ONE start time shared by all three. This is what keeps them in phase.
  const at = audio.ctx.currentTime + 0.08;

  for (const [name, buf] of Object.entries(stems)) {
    const gain = audio.ctx.createGain();
    gain.gain.value = name === 'base' ? 1 : 0;   // rhythm + melody start silent
    gain.connect(audio.master);

    const source = audio.ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    source.connect(gain);
    source.start(at);

    audio.layers[name] = { gain, source };
  }

  audio.ready = true;
  syncMusicLayers();
  if (save.focus && save.focus !== 'off') startFocus(save.focus);   // in case progress is already past a threshold
}

/* Ramps are scheduled on the audio clock, not a JS timer — a setInterval
   fade stutters under load and this one cannot. */
function fadeLayer(name, to, seconds) {
  const layer = audio.layers[name];
  if (!layer) return;

  const now = audio.ctx.currentTime;
  layer.gain.gain.cancelScheduledValues(now);
  layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
  layer.gain.gain.linearRampToValueAtTime(to, now + seconds);
}

function syncMusicLayers() {
  if (!audio.ready) return;
  const progress = musicProgress();

  if (!audio.faded.rhythm && progress >= AUDIO.THRESHOLDS.rhythm) {
    audio.faded.rhythm = true;
    fadeLayer('rhythm', 1, AUDIO.FADE);
  }
  if (!audio.faded.melody && progress >= AUDIO.THRESHOLDS.melody) {
    audio.faded.melody = true;
    fadeLayer('melody', 1, AUDIO.FADE);
  }
}

function resetMusicLayers() {
  audio.faded = { rhythm: false, melody: false };
  if (!audio.ready) return;
  fadeLayer('base', 1, 0.4);
  fadeLayer('rhythm', 0, 0.25);
  fadeLayer('melody', 0, 0.25);
}

/* The stone cracked: cut every layer and drop the rubble on top. */
function musicCrumble() {
  if (!audio.ready) return;
  for (const name of Object.keys(audio.layers)) fadeLayer(name, 0, AUDIO.CUT);
  playCrumble();
}

/* Filtered noise with a falling cutoff — rubble settling, not a hiss. */
function playCrumble() {
  const ctx = audio.ctx;
  const now = ctx.currentTime;
  const seconds = 1.2;

  const noise = buffer(seconds, (d, rate) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / rate;
      d[i] = (Math.random() * 2 - 1) * (1 - t / seconds) ** 2.2;
    }
  });

  const source = ctx.createBufferSource();
  source.buffer = noise;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(2200, now);
  lowpass.frequency.exponentialRampToValueAtTime(130, now + seconds);

  const gain = ctx.createGain();
  gain.gain.value = 0.6;

  // Through the foley ceiling when there is one, so the crumble and a strike
  // that lands in the same instant cannot sum past it.
  source.connect(lowpass).connect(gain).connect(sfx.rig?.raw || audio.master);
  source.start(now);
  source.stop(now + seconds);
  source.onended = () => {
    for (const node of [source, lowpass, gain]) { try { node.disconnect(); } catch { /* gone */ } }
  };
}

function fadeMaster(to, seconds) {
  if (!audio.master) return;
  const now = audio.ctx.currentTime;
  audio.master.gain.cancelScheduledValues(now);
  audio.master.gain.setValueAtTime(audio.master.gain.value, now);
  audio.master.gain.linearRampToValueAtTime(to, now + seconds);
}

/* ============================================================
   FOLEY
   ------------------------------------------------------------
   Everything the chisel does. Synthesised, because zero external requests
   is a hard rule here and the privacy page is written against it.

   The model is modal synthesis: a struck solid is a noise burst poured into
   a handful of high-Q resonators. The resonant frequency IS the perceived
   size of the fragment, so pitch is not decoration — it is the one parameter
   that tells the player how big a piece just came off. That is why it moves
   with context rather than being sprayed randomly.

   Three rules the mix obeys:

   1. NOTHING BELOW 120Hz. The drone lives at 110/165Hz and a phone speaker
      reproduces none of it anyway, so sub energy would only mud the music
      and eat headroom. A highpass on the bus enforces it for every sound at
      once rather than trusting each synth to behave.

   2. THE BUS CANNOT CLIP. A WaveShaper sits last with a curve whose maximum
      value is 0.871. A WaveShaper clamps its input to [-1,1] before the
      lookup, so the output is bounded by the curve's extreme NO MATTER what
      arrives — this is arithmetic, not a compressor's best effort. The curve
      is exactly unity below 0.6 so it is inert in normal play.
      oversample stays 'none' on purpose: 4x resampling can overshoot the
      curve's bound by a fraction of a dB, and the bound is the point.

   3. NO TWO STRIKES ALIKE. Carve fires hundreds of times a session. Pitch,
      the inharmonic mode ratios, Q, decay, pan and the noise read offset are
      all redrawn per strike, and a pitch landing within a semitone of the
      previous one gets pushed off it.
   ============================================================ */

const SFX = {
  LEVEL: 0.62,        // bus trim; every voice below is written against this
  KNEE: 0.6,          // soft clip is unity under here
  CEILING: 0.92,      // ...and asymptotes here. Curve max works out at 0.871
  HIGHPASS: 120,      // out of the drone's register, off the phone's sub
  NOISE: 2,           // seconds of shared noise bed, read from a random offset
  MAX_VOICES: 16,     // past this a strike is dropped, never piled on

  /* Every level in the game, in one place, so the balance can be read
     without hunting through the synths. Numbers are branch envelope peaks,
     which after the resonator compensation below are directly comparable
     between a noise branch and an oscillator branch.

     Reference: the three music stems together peak at 0.31 and sit at
     0.068 RMS out of the master. These are set against that. */
  MIX: {
    CARVE_BODY: 0.42, CARVE_TICK: 0.21, CARVE_DUST: 0.19,
    MARK_LOW: 0.50, MARK_HIGH: 0.40, MARK_TAP: 0.10,
    STRIKE_CRACK: 0.28, STRIKE_FALL: 0.26, STRIKE_THUD: 0.16,
    REVEAL: [0.39, 0.143, 0.058], REVEAL_AIR: 0.10,
    HINT: 0.10,
  },
};

const sfx = { rig: null };

/* Unity up to the knee, then a tanh shoulder that flattens into CEILING.
   Continuous in value AND slope at the knee, so there is no audible corner
   where the shoulder takes over. */
function softClipCurve(knee, ceiling, steps = 2049) {
  const curve = new Float32Array(steps);
  const room = ceiling - knee;

  for (let i = 0; i < steps; i++) {
    const x = (i / (steps - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= knee ? a : knee + room * Math.tanh((a - knee) / room));
  }
  return curve;
}

/* The rig is built against a context rather than reading `audio.ctx`, so the
   exact same graph can be rendered into an OfflineAudioContext and measured.
   An SFX chain you cannot measure is one you are guessing about. */
function makeSfxRig(ctx, destination) {
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * SFX.NOISE), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const bus = ctx.createGain();
  bus.gain.value = SFX.LEVEL;

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = SFX.HIGHPASS;

  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve(SFX.KNEE, SFX.CEILING);
  shaper.oversample = 'none';

  /* A second input that skips the highpass but NOT the ceiling. The crumble
     sweeps its own lowpass down to 130Hz and that collapsing low end is the
     whole sound, so it cannot go through the highpass — but it still has to
     be inside the bound, or the one guaranteed number in this file would
     only cover some of the audio. */
  const raw = ctx.createGain();
  raw.gain.value = 1;
  raw.connect(shaper);

  bus.connect(highpass).connect(shaper).connect(destination);

  return { ctx, bus, raw, noise, voices: 0, lastPitch: 0, lastNote: 0, lastStrike: -1 };
}

/* Null until the first gesture has armed the context, and null while muted —
   a muted game should not be building and tearing down graphs for silence.
   The rig hangs off audio.master, so the mute fade covers it either way; this
   is about not doing the work, not about whether it would be heard. */
function liveRig() {
  if (save.muted || !sfx.rig) return null;
  return sfx.rig;
}

/* Every node a voice creates is tracked and hard-disconnected the instant its
   driver stops. Carve alone runs this hundreds of times per session, so
   "the collector will probably get it" is not good enough — an orphaned
   filter still costs a graph traversal every render quantum. */
function sfxVoice(rig) {
  if (rig.voices >= SFX.MAX_VOICES) return null;
  rig.voices++;

  const nodes = [];
  let torn = false;

  return {
    add(node) { nodes.push(node); return node; },

    /* `driver` is the last node to stop, and its onended is the one place a
       voice is ever dismantled.

       Both guards matter. The polyphony cap reads this counter, so a count
       that drifts UP by one per thousand strikes would eventually wedge the
       cap shut and silence the game's main sound permanently — a bug that
       only shows up in a long session, which is the worst kind. `torn` makes
       teardown idempotent whatever the implementation does with onended, and
       the floor means even an unbalanced release can only ever cost one
       voice of polyphony, never the whole channel. */
    release(driver) {
      driver.onended = () => {
        if (torn) return;
        torn = true;
        for (const node of nodes) { try { node.disconnect(); } catch { /* already gone */ } }
        nodes.length = 0;
        rig.voices = Math.max(0, rig.voices - 1);
      };
    },
  };
}

/* Loops the shared bed from a random offset, so the same two seconds of
   noise never lines up with itself twice. */
function noiseSource(rig, voice, when, seconds, rate = 1) {
  const source = voice.add(rig.ctx.createBufferSource());
  source.buffer = rig.noise;
  source.loop = true;
  source.playbackRate.value = rate;
  source.start(when, Math.random() * (SFX.NOISE - 0.25));
  source.stop(when + seconds);
  return source;
}

/* Exponential, because that is how a struck solid actually sheds energy.
   A linear fall on a 120ms transient reads as a synthetic blip. */
function strikeEnv(param, when, peak, attack, decay) {
  param.setValueAtTime(0.0001, when);
  param.exponentialRampToValueAtTime(peak, when + attack);
  param.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  param.setValueAtTime(0, when + attack + decay);
}

/* One resonant mode: bandpass at `freq`, level set by its own gain.

   The compensation is not optional. A bandpass fed white noise only passes
   what fits in its bandwidth, so a Q of 20 comes out roughly three times
   quieter than a Q of 2 at the same nominal gain. Without this, randomising Q
   per strike — which is most of what makes strikes sound different — would
   randomise LOUDNESS instead of timbre, and the sound would flap about. */
function resonator(rig, voice, source, freq, q, level, dest) {
  const filter = voice.add(rig.ctx.createBiquadFilter());
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;

  const bandwidth = Math.max(freq / q, 1);
  const gain = voice.add(rig.ctx.createGain());
  gain.gain.value = level * Math.sqrt((rig.ctx.sampleRate / 2) / bandwidth);

  source.connect(filter).connect(gain).connect(dest);
  return filter;
}

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------- context the chisel listens to ---------- */

const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/* 0 = a fragment hanging off the surface, 1 = fully entombed. More stone
   behind the chisel means more mass to move: lower, duller, longer. */
function buriedness(cell) {
  let held = 0;
  for (const [dx, dy, dz] of FACES) {
    const other = state.byKey.get(cellKey(cell.x + dx, cell.y + dy, cell.z + dz));
    if (other && !other.carved) held++;
  }
  return held / FACES.length;
}

/* Pan follows the block's position ON SCREEN, not in the model. The player
   spins the stone constantly, so world-space panning would send a block they
   are looking at straight ahead out to one ear. Kept well inside hard left
   and right — this is a hint about where you struck, not a stereo effect. */
function screenPan(cell) {
  if (!view.camera || !view.group) return 0;
  try {
    const ndc = view.group.localToWorld(worldPos(cell)).project(view.camera);
    return Number.isFinite(ndc.x) ? clamp(ndc.x * 0.5, -0.5, 0.5) : 0;
  } catch {
    return 0;
  }
}

/* ---------- 1. THE CARVE ---------- */

/* A chisel releasing stone, in three simultaneous parts:

   TICK    the steel meeting the surface. 4-11ms, broad and bright, and the
           only reason the sound has a defined moment of contact at all.
   BODY    two inharmonic modes. Real stone is not a tuned bar, so the second
           mode sits at an irrational-ish 1.45-1.8x rather than an octave or a
           fifth — harmonic ratios would make every strike sound like a note
           and the whole session like a broken xylophone.
   DUST    a lowpassed tail that outlives the body. This is the part that
           makes it read as stone rather than as a click. */
function playCarve(cell) {
  const rig = liveRig();
  if (!rig) return;

  const voice = sfxVoice(rig);
  if (!voice) return;

  const { ctx } = rig;
  const now = ctx.currentTime;

  // How fast the player is chiselling. A flurry is a run of light taps, so
  // it gets shorter and quieter — which is also what keeps twenty strikes in
  // a second from summing into a wall.
  const gap = rig.lastStrike < 0 ? 1 : now - rig.lastStrike;
  const flurry = clamp(gap / 0.16, 0.42, 1);
  rig.lastStrike = now;

  const buried = buriedness(cell);
  const revealed = musicProgress();          // 0 at the first strike, 1 at the reveal

  // Fragment size -> pitch. Buried cubes ring low; as the stone thins out
  // towards the reveal every remaining piece is smaller, so it all drifts up.
  const size = clamp(0.58 - 0.40 * buried + 0.26 * revealed + rand(-0.16, 0.16), 0, 1);
  let f0 = 232 * (700 / 232) ** size;

  // Repetition is the enemy. A pitch landing inside a semitone of the last
  // one is shoved off it, so consecutive strikes are always distinguishable.
  if (Math.abs(Math.log2(f0 / rig.lastPitch)) < 1 / 12) f0 *= f0 >= rig.lastPitch ? 1.10 : 0.91;
  f0 = clamp(f0, 200, 780);
  rig.lastPitch = f0;

  const decay = rand(0.075, 0.185) * (1 + 0.35 * buried) * flurry;
  const seconds = decay + 0.14;              // the dust runs on past the body

  const pan = ctx.createStereoPanner ? voice.add(ctx.createStereoPanner()) : null;
  if (pan) { pan.pan.value = screenPan(cell); pan.connect(rig.bus); }
  const out = pan || rig.bus;

  const source = noiseSource(rig, voice, now, seconds, rand(0.9, 1.15));

  // BODY
  const body = voice.add(ctx.createGain());
  strikeEnv(body.gain, now, SFX.MIX.CARVE_BODY * flurry, 0.0016, decay);
  source.connect(body);

  resonator(rig, voice, body, f0, rand(8, 12), 1, out);
  resonator(rig, voice, body, f0 * rand(1.45, 1.82), rand(12, 18), rand(0.4, 0.62), out);

  // TICK — broad and high, gone in 4ms. Contact, not tone.
  const tick = voice.add(ctx.createGain());
  strikeEnv(tick.gain, now, SFX.MIX.CARVE_TICK * flurry, 0.0008, rand(0.004, 0.011));
  source.connect(tick);
  resonator(rig, voice, tick, clamp(f0 * rand(3.4, 4.6), 900, 5200), rand(1.2, 2.6), 1, out);

  // DUST — grit falling away, cutoff collapsing as it settles.
  const dust = voice.add(ctx.createGain());
  strikeEnv(dust.gain, now, SFX.MIX.CARVE_DUST * flurry, 0.004, seconds - 0.02);

  const settle = voice.add(ctx.createBiquadFilter());
  settle.type = 'lowpass';
  settle.frequency.setValueAtTime(rand(3400, 5200), now);
  settle.frequency.exponentialRampToValueAtTime(rand(520, 900), now + seconds);
  settle.Q.value = 0.7;

  source.connect(dust).connect(settle).connect(out);

  voice.release(source);
}

/* ---------- 2. THE MARK ---------- */

/* Recognition, not removal — so this is the one sound in the game with a
   pitch you could hum. The notes come out of the same A major pentatonic the
   melody stem is built from (110/165 drone, 440/550/660/880 melody), which is
   why marking during play lands as part of the music instead of on top of it.
   Marking rises a step; unmarking is the same voice, lower and shorter. */
const MARK_NOTES = [440, 550, 660, 880];

function playMark(on) {
  const rig = liveRig();
  if (!rig) return;

  const voice = sfxVoice(rig);
  if (!voice) return;

  const { ctx } = rig;
  const now = ctx.currentTime;

  let note = MARK_NOTES[Math.floor(Math.random() * MARK_NOTES.length)];
  if (note === rig.lastNote) note = MARK_NOTES[(MARK_NOTES.indexOf(note) + 1) % MARK_NOTES.length];
  rig.lastNote = note;

  const seconds = on ? 0.52 : 0.30;
  const sum = voice.add(ctx.createGain());
  sum.gain.value = 1;
  sum.connect(rig.bus);

  // Two soft partials. Triangle, not sine: a sine this quiet under a drone is
  // felt rather than heard, and the third harmonic is what carries it.
  const steps = on
    ? [[note, 0, SFX.MIX.MARK_LOW], [note * 1.5, 0.075, SFX.MIX.MARK_HIGH]]   // up a fifth
    : [[note * 0.5, 0, SFX.MIX.MARK_LOW * 0.55]];                             // down an octave

  let last = null;
  for (const [hz, delay, level] of steps) {
    const osc = voice.add(ctx.createOscillator());
    osc.type = 'triangle';
    osc.frequency.value = hz;

    const gain = voice.add(ctx.createGain());
    const at = now + delay;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.008);   // soft, never a click
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    gain.gain.setValueAtTime(0, at + seconds);

    osc.connect(gain).connect(sum);
    osc.start(at);
    osc.stop(at + seconds + 0.01);
    last = osc;
  }

  // A dry wooden tap so the mark has a moment, not just a swell.
  const tap = noiseSource(rig, voice, now, 0.03);
  const tapGain = voice.add(ctx.createGain());
  strikeEnv(tapGain.gain, now, SFX.MIX.MARK_TAP, 0.0008, 0.02);
  tap.connect(tapGain);
  resonator(rig, voice, tapGain, on ? 2400 : 1500, 2.2, 1, sum);

  voice.release(last);
}

/* ---------- 3. THE MISTAKE ---------- */

/* The chisel went into the sculpture. Two things make this flinch without
   making it cruel:

   FALLING PITCH. The bandpass sweeps 760Hz -> 170Hz over 200ms. A descending
   resonance is read as "wrong" pretty much universally, and it does the work
   that would otherwise be done by making the sound loud.

   NOTHING SHARP ON TOP. Harshness is high-frequency energy, so the whole
   thing goes through a lowpass at 3kHz and the tail is deliberately short.
   A sound that rings on is what makes a failure feel like a telling-off. */
function playStrike() {
  const rig = liveRig();
  if (!rig) return;

  const voice = sfxVoice(rig);
  if (!voice) return;

  const { ctx } = rig;
  const now = ctx.currentTime;
  const seconds = 0.34;

  const tame = voice.add(ctx.createBiquadFilter());
  tame.type = 'lowpass';
  tame.frequency.value = 3000;
  tame.Q.value = 0.6;
  tame.connect(rig.bus);

  const source = noiseSource(rig, voice, now, seconds);

  // The crack itself.
  const crack = voice.add(ctx.createGain());
  strikeEnv(crack.gain, now, SFX.MIX.STRIKE_CRACK, 0.001, 0.05);
  source.connect(crack);
  resonator(rig, voice, crack, 1450, 2.4, 1, tame);

  // The fracture running away downwards.
  const fall = voice.add(ctx.createGain());
  strikeEnv(fall.gain, now, SFX.MIX.STRIKE_FALL, 0.002, 0.24);
  source.connect(fall);

  const sweep = resonator(rig, voice, fall, 760, 5.5, 1, tame);
  sweep.frequency.setValueAtTime(760, now);
  sweep.frequency.exponentialRampToValueAtTime(170, now + 0.2);

  // Weight. 156Hz sags to 132Hz — just above the bus highpass, so a phone
  // still gets the body of it instead of losing it to a rumble it cannot play.
  const thud = voice.add(ctx.createOscillator());
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(156, now);
  thud.frequency.exponentialRampToValueAtTime(132, now + 0.16);

  const thudGain = voice.add(ctx.createGain());
  strikeEnv(thudGain.gain, now, SFX.MIX.STRIKE_THUD, 0.004, 0.17);
  thud.connect(thudGain).connect(tame);
  thud.start(now);
  thud.stop(now + seconds);

  voice.release(source);
}

/* ---------- 4. THE REVEAL ---------- */

/* Earned, so it is allowed to be the longest sound in the game — but it has
   to land ON the music, not beside it. The arpeggio is A major pentatonic,
   the same set the melody stem walks, and it closes on the A the drone has
   been holding at 110Hz for the entire level.

   Bell tone comes from stretched partials: 2.01x and 3.02x rather than exact
   octaves and fifths. Exact integers give an organ; the slight stretch is
   what a struck bowl does and it beats gently against itself. */
function playReveal() {
  const rig = liveRig();
  if (!rig) return;

  const voice = sfxVoice(rig);
  if (!voice) return;

  const { ctx } = rig;
  const now = ctx.currentTime + 0.05;

  const sum = voice.add(ctx.createGain());
  sum.gain.value = 1;
  sum.connect(rig.bus);

  // Dust lifting off the finished piece, under the first two notes.
  const air = noiseSource(rig, voice, now, 0.75);
  const airGain = voice.add(ctx.createGain());
  airGain.gain.setValueAtTime(0.0001, now);
  airGain.gain.exponentialRampToValueAtTime(SFX.MIX.REVEAL_AIR, now + 0.09);
  airGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
  airGain.gain.setValueAtTime(0, now + 0.73);

  const airLp = voice.add(ctx.createBiquadFilter());
  airLp.type = 'lowpass';
  airLp.frequency.setValueAtTime(3800, now);
  airLp.frequency.exponentialRampToValueAtTime(500, now + 0.75);
  air.connect(airGain).connect(airLp).connect(sum);

  // A, C#, E, A, E — rising, resolving on the octave over the drone's root.
  const notes = [440, 550, 660, 880, 1320];
  const partials = [[1, SFX.MIX.REVEAL[0], 1.7],
    [2.01, SFX.MIX.REVEAL[1], 1.0],
    [3.02, SFX.MIX.REVEAL[2], 0.6]];

  let last = air;
  let end = now + 0.75;

  notes.forEach((hz, i) => {
    const at = now + i * 0.115;

    for (const [ratio, level, decay] of partials) {
      const f = hz * ratio;
      if (f > 9000) continue;                  // nothing up there but fatigue

      const osc = voice.add(ctx.createOscillator());
      osc.type = 'sine';
      osc.frequency.value = f;

      // Later notes are quieter, so the arpeggio does not pile up into a
      // single loud chord at the end of the run.
      const peak = level * (1 - i * 0.11);
      const gain = voice.add(ctx.createGain());
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      gain.gain.setValueAtTime(0, at + decay);

      osc.connect(gain).connect(sum);
      osc.start(at);
      osc.stop(at + decay + 0.02);

      if (at + decay > end) { end = at + decay; last = osc; }
    }
  });

  voice.release(last);
}

/* ---------- 5. THE HINT ---------- */

/* The stone telling you something. Airy and unresolved on purpose — a hint
   is information, not an achievement, and a satisfying chime here would make
   spending one feel like a reward. */
function playHint() {
  const rig = liveRig();
  if (!rig) return;

  const voice = sfxVoice(rig);
  if (!voice) return;

  const { ctx } = rig;
  const now = ctx.currentTime;
  const seconds = 0.6;

  const source = noiseSource(rig, voice, now, seconds);

  const swell = voice.add(ctx.createGain());
  swell.gain.setValueAtTime(0.0001, now);
  swell.gain.exponentialRampToValueAtTime(SFX.MIX.HINT, now + 0.08);
  swell.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  swell.gain.setValueAtTime(0, now + seconds);
  source.connect(swell);

  // A bandpass climbing a fifth: a question, not an answer.
  const sweep = resonator(rig, voice, swell, 900, 7, 1, rig.bus);
  sweep.frequency.setValueAtTime(900, now);
  sweep.frequency.exponentialRampToValueAtTime(1650, now + seconds * 0.7);

  voice.release(source);
}

/* ---------- measurement hook ----------

   Renders any of the above into an OfflineAudioContext and reports the true
   sample peak, so the headroom claims in this file are checked rather than
   asserted. `music: true` runs the three stems alongside at their loudest, so
   what comes back is the worst case that can actually reach the speakers.

   The stem generators read audio.ctx directly, hence the swap; it is confined
   to this function and restored in a finally. */
async function renderSfx(name, { seconds = 3, fire = 1, every = 0.05, music = false, master = AUDIO.VOLUME } = {}) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return null;

  const ctx = new Offline(2, Math.ceil(48000 * seconds), 48000);
  const out = ctx.createGain();
  out.gain.value = master;
  out.connect(ctx.destination);

  const liveCtx = audio.ctx;
  const liveRigRef = sfx.rig;
  const liveMuted = save.muted;

  try {
    audio.ctx = ctx;
    save.muted = false;
    sfx.rig = makeSfxRig(ctx, out);

    if (music) {
      for (const make of [makeBase, makeRhythm, makeMelody]) {
        const src = ctx.createBufferSource();
        src.buffer = make();
        src.loop = true;
        src.connect(out);                     // every stem at full, which only
        src.start(0);                         // happens past the last threshold
      }
    }

    const play = { carve: () => playCarve(state.cells[0] || { x: 0, y: 0, z: 0 }),
      mark: () => playMark(true), unmark: () => playMark(false),
      strike: playStrike, reveal: playReveal, hint: playHint }[name];
    if (!play) throw new Error(`no such sound: ${name}`);

    // The polyphony cap is disabled for measurement: onended does not run
    // mid-render offline, so the cap would silence the tail of a burst and
    // flatter the result. Every fire is allowed through, which is strictly
    // louder than anything the live game will produce.
    const fireOne = () => { sfx.rig.voices = 0; play(); };

    // suspend() is the only way to advance an offline clock, and each
    // callback must be registered before rendering reaches its timestamp.
    for (let i = 1; i < fire; i++) {
      ctx.suspend(i * every).then(() => { fireOne(); ctx.resume(); });
    }

    fireOne();                                // at t=0, before the clock moves
    const rendered = await ctx.startRendering();

    let peak = 0;
    let square = 0;
    let count = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
        square += data[i] * data[i];
        count++;
      }
    }

    return { name, fire, music, peak, rms: Math.sqrt(square / count), seconds };
  } finally {
    audio.ctx = liveCtx;
    save.muted = liveMuted;
    sfx.rig = liveRigRef;
  }
}

/* ============================================================
   FOCUS TONE
   ------------------------------------------------------------
   A quiet layer under the music. Two generators, because they are not the
   same thing and only one of them survives a laptop speaker:

   BINAURAL — carrier-beat/2 hard left, carrier+beat/2 hard right. The beat
   exists only where the two ears are combined, so it REQUIRES headphones;
   on a speaker the channels sum in the air and you just hear two tones.
   The perceptual effect is also generally reported to weaken above ~30Hz,
   so a 40Hz "gamma" binaural beat is at the very edge of what the mechanism
   does at all. Offered because it is asked for, capped where it is honest.

   PULSE — one carrier amplitude-modulated at the beat rate. This is what
   the actual 40Hz gamma sensory work uses, it works on speakers, and the
   modulation is genuinely present in the signal rather than inferred by the
   listener. If you want 40Hz, this is the one that delivers 40Hz.

   Deliberately NOT claimed anywhere in the UI: cognition, learning, focus
   as an outcome, or any health benefit. The evidence does not support it
   and a puzzle game is not the place to imply it. It is labelled as what it
   measurably is — a tone. */

const FOCUS = {
  carrier: 200,      // Hz. Low carriers are where binaural perception works
  beat: 40,          // Hz. Difference for binaural, modulation rate for pulse
  level: 0.05,       // sits well under the music
  CROSSFADE: 1.2,    // seconds; the two timbres overlap for this long
  BINAURAL_HONEST_MAX: 30,   // above this the binaural mechanism falls away
};

/* Each mode is its own VOICE with its own gain, so two can overlap. A single
   shared gain could only hard-cut between timbres — the outgoing tone has to
   still be sounding while the incoming one rises, or it is a jump cut with a
   fade painted over it. */
const focus = { bus: null, voices: [], mode: 'off' };

/* Equal power, not linear. Two different timbres are uncorrelated, so linear
   ramps sum to a dip in loudness right at the midpoint of the swap — the
   classic crossfade hole. cos/sin keeps gain_in^2 + gain_out^2 = 1, so the
   perceived level stays flat across the handover. */
function equalPowerRamp(param, peak, seconds, direction) {
  const steps = 48;
  const curve = new Float32Array(steps);

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    curve[i] = peak * (direction === 'out'
      ? Math.cos((t * Math.PI) / 2)
      : Math.sin((t * Math.PI) / 2));
  }

  const now = audio.ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setValueCurveAtTime(curve, now, seconds);
}

function buildVoice(mode) {
  const ctx = audio.ctx;
  const { carrier, beat } = FOCUS;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(focus.bus);

  const nodes = [];

  if (mode === 'binaural') {
    // The beat is the DIFFERENCE, so each ear is offset by half of it.
    for (const [hz, pan] of [[carrier - beat / 2, -1], [carrier + beat / 2, 1]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      osc.connect(panner).connect(gain);
      osc.start();
      nodes.push(osc, panner);
    }
  } else {
    // Modulation actually in the signal: carrier * (0.5 + 0.5 * sin(beat)).
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = carrier;

    const depth = ctx.createGain();
    depth.gain.value = 0.5;              // offset, so the product stays 0..1

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = beat;

    const lfoAmount = ctx.createGain();
    lfoAmount.gain.value = 0.5;

    lfo.connect(lfoAmount).connect(depth.gain);
    osc.connect(depth).connect(gain);
    osc.start();
    lfo.start();
    nodes.push(osc, lfo, lfoAmount, depth);
  }

  return { mode, gain, nodes, retiring: false };
}

/* Fades a voice out and tears it down afterwards. `retiring` makes this
   idempotent: hammering the toggle must not re-ramp a voice that is already
   on its way out, or stack teardown timers on it. */
function retireVoice(voice, seconds) {
  if (voice.retiring) return;
  voice.retiring = true;

  equalPowerRamp(voice.gain.gain, voice.gain.gain.value, seconds, 'out');

  setTimeout(() => {
    for (const node of voice.nodes) {
      try { node.stop?.(); node.disconnect(); } catch { /* already gone */ }
    }
    try { voice.gain.disconnect(); } catch { /* already gone */ }
    focus.voices = focus.voices.filter((v) => v !== voice);
  }, seconds * 1000 + 80);
}

function stopFocus(seconds = FOCUS.CROSSFADE) {
  for (const voice of focus.voices) retireVoice(voice, seconds);
}

function startFocus(mode, seconds = FOCUS.CROSSFADE) {
  if (!audio.ready) return;
  focus.mode = mode;

  if (!focus.bus) {
    focus.bus = audio.ctx.createGain();
    focus.bus.gain.value = 1;
    focus.bus.connect(audio.master);
  }

  // Old voices start fading the moment the new one starts rising, so the
  // two overlap rather than butting up against each other.
  stopFocus(seconds);
  if (mode === 'off') return;

  const voice = buildVoice(mode);
  focus.voices.push(voice);
  equalPowerRamp(voice.gain.gain, FOCUS.level, seconds, 'in');
}


function cycleFocus() {
  const order = ['off', 'pulse', 'binaural'];
  const next = order[(order.indexOf(save.focus || 'off') + 1) % order.length];
  save.focus = next;
  writeSave();

  startAudio().then(() => startFocus(next));
  updateHUD();

  toast(next === 'off' ? 'Tone off'
    : next === 'pulse' ? `Pulse tone · ${FOCUS.beat}Hz`
      : `Binaural · ${FOCUS.beat}Hz · needs headphones`);
}

function toggleHaptics() {
  save.haptics = save.haptics === false;
  writeSave();
  updateHUD();
  buzz(20);            // confirm it in the hand, which is the whole point
  toast(save.haptics ? 'Vibration on' : 'Vibration off');
}

function toggleMute() {
  save.muted = !save.muted;
  writeSave();
  fadeMaster(save.muted ? 0 : AUDIO.VOLUME, 0.2);
  updateHUD();
  toast(save.muted ? 'Sound off' : 'Sound on');
}

/* ============================================================
   CRAZYGAMES
   ------------------------------------------------------------
   The platform layer. Absent off-platform — every call here checks first
   and the game falls through to its own ad paths, so the same build runs
   on CrazyGames, on GitHub Pages, and on a laptop with no network.

   Their rules, which this implements rather than approximates:
     - init() is async and must be awaited; the SDK is unusable before it
     - mute and pause on adStarted, restore on adFinished AND adError
     - gameplayStart/Stop on every break, not just ads
     - the game must still work with an adblocker on
   ============================================================ */

const CRAZY = { sdk: null, ready: false, adOpen: false };

async function initCrazy() {
  const sdk = window.CrazyGames?.SDK;
  if (!sdk) return;                       // not on CrazyGames; nothing to do

  try {
    await sdk.init();                     // async, and unusable until it lands
    CRAZY.sdk = sdk;
    CRAZY.ready = true;

    /* Adopt cloud progress — but NEVER yank a player out of a level they
       explicitly picked. The Collection hands the level over in the URL,
       and the SDK resolves a second later; without this guard every tile
       on the shelf opened whatever level the save happened to hold. */
    const adopted = syncPlatformSave();
    if (adopted && !cameFromLink && (save.level | 0) !== levelIndex) {
      loadLevel(save.level | 0);
    }

    sdk.game.gameplayStart();
  } catch (error) {
    console.warn('[crazygames] init failed, continuing without it:', error);
  }
}

/* Break signals. Safe to call whether or not the SDK is present. */
const gameplayStart = () => { if (CRAZY.ready && !CRAZY.adOpen) CRAZY.sdk.game.gameplayStart(); };
const gameplayStop = () => { if (CRAZY.ready) CRAZY.sdk.game.gameplayStop(); };

/* Pause is a real freeze, not just a flag: the frame loop keeps drawing so
   the canvas never goes black behind the ad, but nothing advances. */
function pauseForAd() {
  CRAZY.adOpen = true;
  state.paused = true;
  gameplayStop();
  fadeMaster(0, 0.2);
}

function resumeAfterAd() {
  CRAZY.adOpen = false;
  state.paused = false;
  fadeMaster(save.muted ? 0 : AUDIO.VOLUME, 0.4);
  if (CRAZY.ready) CRAZY.sdk.game.gameplayStart();
}

/* Returns false when there is no SDK, so callers can fall through.
   `settled` guards the callbacks: an SDK that fires both adError and
   adFinished, or neither, must not double-grant or hang the game. */
function requestCrazyAd(type, { onFinished, onError } = {}) {
  if (!CRAZY.ready) return false;

  let settled = false;
  const settle = (fn, arg) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    resumeAfterAd();
    fn?.(arg);
  };

  /* Guards the REQUEST only, never a playing ad. An adblocker can leave a
     request hanging forever and the game must not be stuck behind an ad
     that will never arrive — but a real interstitial runs 15-30s, so once
     adStarted fires this is cancelled and the SDK drives the rest. */
  const timeout = setTimeout(() => settle(onError, 'no-response'), 8000);

  try {
    CRAZY.sdk.ad.requestAd(type, {
      adStarted: () => { clearTimeout(timeout); pauseForAd(); },
      adFinished: () => settle(onFinished),
      adError: (error) => settle(onError, error),
    });
  } catch (error) {
    settle(onError, error);
  }

  return true;
}

/* The stone cracking is the natural break, so that is where the interstitial
   goes. Gameplay pauses, the ad plays over the frozen tower, and Examine
   mode opens once it clears — whether it finished, errored or timed out. */
function fractureThenAd() {
  musicCrumble();

  const requested = requestCrazyAd('midgame', {
    onFinished: () => finish('lost'),
    onError: () => finish('lost'),
  });

  if (!requested) finish('lost');
}

/* ---------- BOOTSTRAP ---------- */

ui.left = document.getElementById('left');
ui.fill = document.getElementById('progress-fill');
ui.hint = document.getElementById('hint');
ui.banner = document.getElementById('banner');
ui.bannerEmoji = document.getElementById('banner-emoji');
ui.bannerTitle = document.getElementById('banner-title');
ui.bannerBody = document.getElementById('banner-body');
ui.clueBtn = document.getElementById('clue-btn');
ui.hintBtn = document.getElementById('hint-btn');
ui.toast = document.getElementById('toast');
ui.levelName = document.getElementById('level-name');
ui.pips = document.getElementById('pips');
ui.again = document.getElementById('again');
ui.pick = document.getElementById('pick');
ui.adBtn = document.getElementById('ad-btn');
ui.modeBtn = document.getElementById('mode-btn');
ui.stars = document.getElementById('stars');
ui.bannerStars = document.getElementById('banner-stars');

ui.adBtn.addEventListener('click', watchAd);
ui.clueBtn.addEventListener('click', cycleClueMode);
ui.muteBtn = document.getElementById('mute-btn');
ui.muteBtn.addEventListener('click', toggleMute);
ui.focusBtn = document.getElementById('focus-btn');
ui.focusBtn.addEventListener('click', cycleFocus);
ui.hapticsBtn = document.getElementById('haptics-btn');
ui.hapticsBtn.addEventListener('click', toggleHaptics);

ui.adsBtn = document.getElementById('ads-btn');
ui.adsBtn.addEventListener('click', () => { closeSheet(); openConsent(); });

/* The row only exists when ads are actually configured. Reflects the stored
   choice rather than a toggle, because changing it reopens the same prompt
   the player answered the first time - one explanation, one place. */
function syncAdsRow() {
  ui.adsBtn.hidden = !ADS.publisherId;
  ui.adsBtn.querySelector('b').textContent = consentLabel();
}
ui.modeBtn.addEventListener('click', toggleMode);
ui.hintBtn.addEventListener('click', useHint);

ui.examineExit = document.getElementById('examine-exit');
ui.examineExit.addEventListener('click', exitExamine);

ui.zenSheet = document.getElementById('zen-sheet');
document.getElementById('zen-buy').addEventListener('click', unlockZen);
document.getElementById('zen-close')
  .addEventListener('click', () => { ui.zenSheet.hidden = true; });
ui.zenSheet.addEventListener('click', (e) => {
  if (e.target === ui.zenSheet) ui.zenSheet.hidden = true;
});

ui.consent = document.getElementById('consent');
document.getElementById('consent-yes')
  .addEventListener('click', () => { setConsent('granted'); syncAdsRow(); });
document.getElementById('consent-no')
  .addEventListener('click', () => { setConsent('denied'); syncAdsRow(); });
/* No dismiss-by-backdrop and no Escape here, unlike the other sheets. An
   unanswered consent prompt is not a "no" we can act on — it just leaves
   needsConsent() true and asks again next launch, which is worse for the
   player than answering. Both buttons are one tap away. */

ui.sheet = document.getElementById('sheet');
const closeSheet = () => { ui.sheet.hidden = true; };
document.getElementById('display-btn')
  .addEventListener('click', () => { ui.sheet.hidden = false; });
document.getElementById('sheet-close').addEventListener('click', closeSheet);
ui.sheet.addEventListener('click', (e) => { if (e.target === ui.sheet) closeSheet(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !ui.sheet.hidden) closeSheet();
});

/* The collection is the level select, so it hands the chosen level back
   through the URL. loadLevel() re-checks ownership before honouring it. */
/* Number(null) is 0, and 0 is a perfectly valid level — so reading the
   param straight through Number() made every no-param load look like an
   explicit request for level 0, and quietly broke resume-from-save. */
const levelParam = new URLSearchParams(location.search).get('level');
const requested = levelParam === null || levelParam === '' ? NaN : Number(levelParam);
if (Number.isFinite(requested) && requested >= 0 && requested < LEVELS.length) {
  levelIndex = requested;
  cameFromLink = true;
}

// Whatever the save or the URL asked for, a locked pack is not playable.
if (!canPlay(levelIndex)) levelIndex = 0;
SHAPE = LEVELS[levelIndex];

buildLevel();
validateLevel();
initScene();
buildVoxels();
initInput();
initShards();
initDust();
initCuts();
// After initShards/initDust/initCuts: applyTheme reaches into the shard
// materials to hang the finish on them, and they have to exist first.
applyTheme(themeFor(LEVELS[levelIndex].pack), true);
initAds();
initCrazy();
registerServiceWorker();

/* Ask before anything loads, not after. initAds() above already refused if
   consent is missing, so this prompt is what unblocks it — and on a fresh
   visit with ads configured, no ad request has been made at the moment the
   question is asked. That ordering is the whole point of the gate. */
syncAdsRow();
if (needsConsent()) openConsent();
// Establish a fitted distance immediately; zoom is measured relative to
// it, and syncSize() only reaches fitCamera() once a frame has drawn.
fitCamera();
updateHUD();

window.Carve = {
  CONFIG, LEVELS, PACKS, state, view,
  carve, toggleMark, pick, validateLevel,
  cycleClueMode, useHint, findHint, refreshClues, clueSatisfied,
  loadLevel, nextInPack, retryLevel, toCollection, watchAd, grantRevive, ADS,
  initAds, consentState, needsConsent, setConsent, openConsent, consentLabel,
  syncAdsRow, registerServiceWorker,
  toggleMode, starsFor, currentStars, ownsPack, canPlay, packOf,
  burst, shards, enterExamine, exitExamine, leaveExamine, applyAudit, zoomBy,
  applyTheme, themeState, rampColour, SIGNALS, applyFinish,
  dust, puff, cuts, cutFaces, spark, shake, addShake,
  reveal, beginReveal, landReveal, frameReveal, reframeReveal,
  // The per-frame half of each effect, so the frame cost can be measured
  // rather than guessed at. Everything here is driven by renderFrame; call
  // them by hand only to profile.
  stepShards, stepDust, stepCuts, stepSpark, stepShake, stepReveal, clearEffects,
  buzz, toggleHaptics, hasHaptics, get calm() { return calm; },
  CRAZY, initCrazy, requestCrazyAd, fractureThenAd, pauseForAd, resumeAfterAd,
  gameplayStart, gameplayStop, fadeMaster, syncPlatformSave,
  FOCUS, focus, startFocus, stopFocus, cycleFocus,
  AUDIO, audio, startAudio, syncMusicLayers, resetMusicLayers,
  musicCrumble, musicProgress, fadeLayer, toggleMute,
  SFX, sfx, playCarve, playMark, playStrike, playReveal, playHint, renderSfx,
  hasZen, zenTrialAvailable, unlockZen, openZenOffer,
  save, writeSave, readSave, exportSave, importSave, completedCount,
  get shape() { return SHAPE; },        // live, not a stale snapshot
  get levelIndex() { return levelIndex; },
};

export default window.Carve;
