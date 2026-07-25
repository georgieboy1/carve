/* ============================================================
   CARVE — prototype
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
  glyphs: 'numbers',     // numbers | letters | shapes
  mode: 'scored',        // scored | zen
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

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* private mode / quota - the run still works, it just won't persist */
  }
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

let levelIndex = Math.min(Math.max(save.level | 0, 0), LEVELS.length - 1);
let SHAPE = LEVELS[levelIndex];

const PALETTE = ['#f7c3d5', '#dfc9f2', '#c3e5f1', '#c7efdf'];
const DIGIT_COLORS = ['#b0a3ad', '#4faa96', '#4295c9', '#7377cf',
  '#a065c6', '#cc5c96', '#d95a68'];

const state = {
  cells: [], byKey: new Map(),
  wasteTotal: 0, wasteLeft: 0,
  status: 'playing',
  clueMode: save.clueMode,
  glyphs: save.glyphs || 'numbers',
  mode: save.mode || 'scored',
  hintsLeft: CONFIG.HINTS,
  revivesUsed: 0,
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
};

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

  view.spherical.radius = needed * 1.06;
  updateCamera();
}

function updateCamera() {
  view.spherical.phi = THREE.MathUtils.clamp(view.spherical.phi, PHI_MIN, PHI_MAX);
  view.cameraBase.setFromSpherical(view.spherical).add(view.target);
  view.camera.position.copy(view.cameraBase);
  view.camera.lookAt(view.target);
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
}

function renderFrame() {
  syncSize();
  view.renderer.render(view.scene, view.camera);
}

/* ---------- VOXELS ---------- */

function worldPos(cell) {
  return new THREE.Vector3(
    (cell.x - (CONFIG.GRID.x - 1) / 2) * CONFIG.CUBE,
    cell.y * CONFIG.CUBE,
    (cell.z - (CONFIG.GRID.z - 1) / 2) * CONFIG.CUBE);
}

function buildVoxels() {
  if (!view.cubeMaterials.length) {
    // Ramp spans MAX_Y, not the current grid, so materials survive a shape
    // change without needing to be rebuilt and disposed.
    for (let y = 0; y < CONFIG.MAX_Y; y++) {
      const t = y / (CONFIG.MAX_Y - 1);
      const i = Math.min(Math.floor(t * (PALETTE.length - 1)), PALETTE.length - 2);
      const color = new THREE.Color(PALETTE[i])
        .lerp(new THREE.Color(PALETTE[i + 1]), t * (PALETTE.length - 1) - i);
      view.cubeMaterials.push(new THREE.MeshStandardMaterial(
        { color, roughness: 0.62, metalness: 0 }));
    }
    view.keeperMaterial = new THREE.MeshStandardMaterial(
      { color: 0xe2607d, roughness: 0.5 });
    view.markMaterial = new THREE.MeshStandardMaterial(
      { color: 0xffc978, emissive: 0x6b4310, emissiveIntensity: 0.3, roughness: 0.45 });
    // Cool teal, so a hint can never be mistaken for an amber player mark.
    view.hintMaterial = new THREE.MeshStandardMaterial(
      { color: 0x6fd3c4, emissive: 0x0f5b50, emissiveIntensity: 0.45, roughness: 0.4 });
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

/* ---------- GLYPH SETS ----------
   The clue is always "how many of my six neighbours are sculpture", 0-6.
   How that count is DRAWN is a separate choice:

     numbers  the default
     letters  A-G, for players who read letters more comfortably than digits
     shapes   seven distinct silhouettes, which stay tellable apart without
              relying on reading or on colour at all

   Shapes are drawn rather than typed. Font glyphs for circles and stars are
   wildly inconsistent across platforms, and half of them are emoji on some
   devices — the one place we cannot afford a surprise. */

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

function drawGlyphShape(ctx, size, n, colour) {
  const cx = size / 2;
  const cy = size * 0.52;
  const r = size * 0.21;

  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineWidth = size * 0.075;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  switch (n) {
    case 0:                                        // ring
      ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case 1:                                        // dot
      ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 2:                                        // triangle
      polygon(ctx, cx, cy, r, 3, -Math.PI / 2);
      ctx.fill();
      return;
    case 3:                                        // square
      ctx.rect(cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56);
      ctx.fill();
      return;
    case 4:                                        // diamond
      polygon(ctx, cx, cy, r, 4, 0);
      ctx.fill();
      return;
    case 5:                                        // pentagon
      polygon(ctx, cx, cy, r, 5, -Math.PI / 2);
      ctx.fill();
      return;
    default:                                       // six-point star
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.stroke();
  }
}

function polygon(ctx, cx, cy, r, sides, rotation) {
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/* CHIP: small, opaque, high contrast. Easiest to read one at a time. */
/* Every texture is cached per glyph set, so switching sets mid-level is
   instant and never redraws a canvas twice. */
function paintGlyph(ctx, size, n, colour) {
  if (state.glyphs === 'shapes') return drawGlyphShape(ctx, size, n, colour);

  const text = state.glyphs === 'letters' ? LETTERS[n] : String(n);
  ctx.fillStyle = colour;
  ctx.font = font(size * 0.46);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size * 0.53);
}

function digitTexture(n) {
  return texture(`chip${state.glyphs}${n}`, (ctx, size) => {
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

    paintGlyph(ctx, size, n, DIGIT_COLORS[n]);
  });
}

/* GHOST: block-sized and translucent, so a clue reads as the socket the
   cube left behind rather than a sticker floating in front of it. Thirty
   of these sit far quieter than thirty chips. */
function ghostTexture(n) {
  return texture(`ghost${state.glyphs}${n}`, (ctx, size) => {
    if (state.glyphs === 'shapes') {
      // White underlay first so the silhouette survives on any pastel.
      ctx.save();
      ctx.translate(size / 2, size * 0.52);
      ctx.scale(1.34, 1.34);
      ctx.translate(-size / 2, -size * 0.52);
      drawGlyphShape(ctx, size, n, 'rgba(255,255,255,0.92)');
      ctx.restore();
      ctx.save();
      ctx.translate(size / 2, size * 0.52);
      ctx.scale(1.3, 1.3);
      ctx.translate(-size / 2, -size * 0.52);
      drawGlyphShape(ctx, size, n, DIGIT_COLORS[n]);
      ctx.restore();
      return;
    }

    const text = state.glyphs === 'letters' ? LETTERS[n] : String(n);
    ctx.font = font(size * 0.82);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.085;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, size / 2, size * 0.54);
    ctx.fillStyle = DIGIT_COLORS[n];
    ctx.fillText(text, size / 2, size * 0.54);
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
  state.mode = isZen() ? 'scored' : 'zen';
  save.mode = state.mode;
  writeSave();

  if (isZen()) state.unscored = true;

  updateHUD();
  toast(isZen()
    ? 'Zen — no limits, no stars'
    : (state.unscored ? 'Scored — this attempt still unscored' : 'Scored — 3 stars to lose'));
}

function cycleGlyphs() {
  const order = ['numbers', 'letters', 'shapes'];
  state.glyphs = order[(order.indexOf(state.glyphs) + 1) % order.length];
  save.glyphs = state.glyphs;
  writeSave();

  // Existing sprites point at the old set's textures; re-point them.
  refreshClues();
  updateHUD();
  toast(`Clues shown as ${state.glyphs}`);
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
    navigator.vibrate?.(60);
    state.errors++;

    // Zen keeps the information — you still learn this cube is sculpture —
    // and drops the punishment. There is no way to fail a Zen carve.
    if (!isZen()) {
      refreshClues();
      updateHUD();
      if (state.errors >= CONFIG.STARS) finish('lost');
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
  navigator.vibrate?.(15);
  refreshClues();          // a decided cube can retire the clues around it
}

/* THE PAYOFF. Strip the clue chips and let the sculpture stand clean. */
function finish(result) {
  state.status = result;

  if (result === 'won') {
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
    ? (packDone ? 'See the collection' : 'Next in pack')
    : 'Try again';
  ui.again.onclick = won
    ? (packDone ? toCollection : nextInPack)
    : retryLevel;

  // Always a way back to the four, whichever way the level ended.
  ui.pick.hidden = won && packDone;
  ui.pick.onclick = toCollection;

  ui.banner.hidden = false;
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

  el.addEventListener('pointerdown', (e) => {
    ui.hint.classList.add('gone');
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
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.hypot(dx, dy);
    if (moved >= CONFIG.TAP_SLOP) cancelHold();

    view.spherical.theta -= dx * 0.007;
    view.spherical.phi -= dy * 0.007;
    updateCamera();
  });

  el.addEventListener('pointerup', (e) => {
    cancelHold();
    if (!dragging || longFired) return;
    dragging = false;
    if (moved < CONFIG.TAP_SLOP && performance.now() - startTime < CONFIG.TAP_TIME) {
      const hit = pick(e.clientX, e.clientY);
      if (hit) carve(hit);
    }
  });

  el.addEventListener('pointercancel', () => { cancelHold(); dragging = false; });
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
  ui.modeBtn.textContent = isZen() ? 'Mode · Zen' : 'Mode · Scored';

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
  ui.glyphBtn.querySelector('b').textContent = state.glyphs;
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
  buildLevel();
  validateLevel();
  buildVoxels();

  state.hintsLeft = CONFIG.HINTS;
  fitCamera();                    // also re-centres the target on the new mass

  ui.banner.hidden = true;
  updateHUD();
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

const ADS = { publisherId: '', testMode: true, ready: false, showAd: null };

function initAds() {
  if (!ADS.publisherId) return;

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
ui.glyphBtn = document.getElementById('glyph-btn');
ui.modeBtn = document.getElementById('mode-btn');
ui.stars = document.getElementById('stars');
ui.bannerStars = document.getElementById('banner-stars');

ui.adBtn.addEventListener('click', watchAd);
ui.clueBtn.addEventListener('click', cycleClueMode);
ui.glyphBtn.addEventListener('click', cycleGlyphs);
ui.modeBtn.addEventListener('click', toggleMode);
ui.hintBtn.addEventListener('click', useHint);

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
const requested = Number(new URLSearchParams(location.search).get('level'));
if (Number.isFinite(requested) && requested >= 0 && requested < LEVELS.length) {
  levelIndex = requested;
}

// Whatever the save or the URL asked for, a locked pack is not playable.
if (!canPlay(levelIndex)) levelIndex = 0;
SHAPE = LEVELS[levelIndex];

buildLevel();
validateLevel();
initScene();
buildVoxels();
initInput();
initAds();
updateHUD();

window.Carve = {
  CONFIG, LEVELS, PACKS, state, view,
  carve, toggleMark, pick, validateLevel,
  cycleClueMode, useHint, findHint, refreshClues, clueSatisfied,
  loadLevel, nextInPack, retryLevel, toCollection, watchAd, grantRevive, ADS,
  cycleGlyphs, toggleMode, starsFor, currentStars, ownsPack, canPlay, packOf,
  save, writeSave, readSave, exportSave, importSave, completedCount,
  get shape() { return SHAPE; },        // live, not a stale snapshot
  get levelIndex() { return levelIndex; },
};

export default window.Carve;
