/* ============================================================
   JENGA MINESWEEPER — game.js
   KG Studio
   ------------------------------------------------------------
   PART 1 — Core System Architecture & Logic Array
   1.1 Tower data grid   1.2 Mine placement   1.3 Proximity counts
   ============================================================ */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------- 1.0 CONFIG ---------- */

const CONFIG = {
  LAYERS: 12,
  BLOCKS_PER_LAYER: 3,
  MINE_COUNT: 10,
  // Real Jenga is 75 x 25 x 15mm -> 3 : 1 : 0.6
  BLOCK: { length: 3, width: 1, height: 0.6 },

  START_HEARTS: 3,
  MAX_REVIVES: 1,   // ad-revives per game; unlimited would remove the fail state
  AD_SECONDS: 3,    // simulated ad length, replaced by a real network in 5.2
};

/* Runtime state. Everything the renderer needs hangs off this. */
const state = {
  blocks: [],     // flat array of 36 block records
  grid: [],       // grid[layer][slot] -> same block record (by reference)
  seed: 0,
  safeTotal: 0,

  hearts: CONFIG.START_HEARTS,
  safeCleared: 0,
  revivesUsed: 0,
  status: 'playing',   // 'playing' | 'won' | 'lost'
  hardMode: false,     // survives a restart, so it lives outside initGame()
};

/* ---------- 1.0b SEEDED RNG ----------
   Math.random is fine for shipping, but a seed lets us reproduce a
   specific tower when a layout looks wrong. initGame({ seed }) pins it. */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 1.1 TOWER DATA GRID ----------
   Even layers run along X, odd layers along Z. Slot 0/1/2 sits at
   lateral offset -1 / 0 / +1. World Y is the block's center height. */

function createTower() {
  const { LAYERS, BLOCKS_PER_LAYER, BLOCK } = CONFIG;
  const blocks = [];
  const grid = [];

  for (let layer = 0; layer < LAYERS; layer++) {
    const axis = layer % 2 === 0 ? 'x' : 'z';
    grid[layer] = [];

    for (let slot = 0; slot < BLOCKS_PER_LAYER; slot++) {
      const offset = (slot - (BLOCKS_PER_LAYER - 1) / 2) * BLOCK.width;

      const block = {
        id: layer * BLOCKS_PER_LAYER + slot,
        key: `L${layer}S${slot}`,
        layer,
        slot,
        axis,                                   // long axis of this block
        x: axis === 'x' ? 0 : offset,
        y: (layer + 0.5) * BLOCK.height,
        z: axis === 'x' ? offset : 0,
        size: axis === 'x'
          ? { x: BLOCK.length, y: BLOCK.height, z: BLOCK.width }
          : { x: BLOCK.width, y: BLOCK.height, z: BLOCK.length },
        isMine: false,
        adjacent: 0,        // proximity number, 0-8
        neighbors: [],      // neighbor ids
        cleared: false,     // pulled out of the tower
        triggered: false,   // mine that has been set off (stays in the tower)
      };

      blocks.push(block);
      grid[layer][slot] = block;
    }
  }

  return { blocks, grid };
}

/* ---------- 1.2 MINE PLACEMENT ----------
   Partial Fisher-Yates over the id pool: unbiased, no retry loop,
   and it can never place two mines in the same slot. */

function placeMines(blocks, count, rand) {
  const pool = blocks.map((b) => b.id);

  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    blocks[pool[i]].isMine = true;
  }

  return pool.slice(0, count).sort((a, b) => a - b);
}

/* ---------- 1.3 PROXIMITY COUNTS ----------
   Two blocks are neighbors when they physically touch:
     - same layer  -> slots side by side
     - layer +/-1  -> footprints overlap in the XZ plane
   Because layers alternate axes, every block in the layer above and
   below overlaps this one, so the ceiling is 3 + 3 + 2 = 8. */

function footprintsOverlap(a, b) {
  const overlap = (ca, sa, cb, sb) =>
    Math.abs(ca - cb) < (sa + sb) / 2 - 1e-6;
  return overlap(a.x, a.size.x, b.x, b.size.x) &&
         overlap(a.z, a.size.z, b.z, b.size.z);
}

function areNeighbors(a, b) {
  if (a.id === b.id) return false;

  const dLayer = Math.abs(a.layer - b.layer);
  if (dLayer > 1) return false;

  if (dLayer === 0) return Math.abs(a.slot - b.slot) === 1;
  return footprintsOverlap(a, b);
}

function computeAdjacency(blocks) {
  for (const block of blocks) {
    block.neighbors = [];
    block.adjacent = 0;
  }

  // Single pass over unique pairs, both sides recorded.
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (!areNeighbors(a, b)) continue;

      a.neighbors.push(b.id);
      b.neighbors.push(a.id);
      if (b.isMine) a.adjacent++;
      if (a.isMine) b.adjacent++;
    }
  }
}

/* ---------- 1.4 INIT ---------- */

function initGame(options = {}) {
  const seed = options.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const mineCount = options.mines ?? CONFIG.MINE_COUNT;
  const rand = mulberry32(seed);

  const { blocks, grid } = createTower();
  placeMines(blocks, mineCount, rand);
  computeAdjacency(blocks);

  state.blocks = blocks;
  state.grid = grid;
  state.seed = seed;
  state.safeTotal = blocks.length - mineCount;

  state.hearts = CONFIG.START_HEARTS;
  state.safeCleared = 0;
  state.revivesUsed = 0;
  state.status = 'playing';
  // state.hardMode is deliberately not reset - it's a player preference.

  return state;
}

/* ---------- 1.5 DEBUG VIEW ----------
   Prints the tower top layer first. [*] = mine, digit = proximity.
   Layer axis is shown so the alternation is easy to eyeball. */

function debugPrintTower() {
  const lines = [`tower seed ${state.seed} — ${state.safeTotal} safe / ${CONFIG.MINE_COUNT} mines`];

  for (let layer = CONFIG.LAYERS - 1; layer >= 0; layer--) {
    const cells = state.grid[layer]
      .map((b) => (b.isMine ? ' * ' : ` ${b.adjacent} `))
      .join('|');
    lines.push(`L${String(layer).padStart(2)} ${state.grid[layer][0].axis}  ${cells}`);
  }

  console.log(lines.join('\n'));
}

/* ============================================================
   PART 2 — 3D Primitive Rendering (Three.js)
   2.1 Portrait scene   2.2 Box primitives   2.3 Touch raycasting
   ============================================================ */

const VIEW = {
  FOV: 45,
  GAP: 0.04,          // shaved off each box so blocks read as separate
  FIT_MARGIN: 1.18,   // breathing room around the tower
  MIN_PHI: 0.65,      // camera stays above the floor...
  MAX_PHI: 1.62,      // ...and below the ceiling
  DRAG_SPEED: 0.007,
  TAP_SLOP: 10,       // px of movement still counted as a tap
  TAP_TIME: 400,      // ms held still counted as a tap

  CORNER_RADIUS: 0.075,   // must stay under half the smallest dim (0.56 / 2)
  CORNER_SEGMENTS: 4,
  LABEL_SCALE: 0.44,      // fits inside the 0.6-tall gap a block leaves
  LABEL_INSET: 0.3,       // how far inside the gap mouth the number sits
};

/* ---------- 4.1 PALETTE ----------
   Six pastel stops, interpolated across the 12 layers so the tower reads as
   one continuous ombré rather than twelve separate colours. */

const LAYER_STOPS = [
  '#f7c3d5',  // rose      (bottom)
  '#f4c8e6',
  '#dfc9f2',
  '#c9d3f6',
  '#c3e5f1',
  '#c7efdf',  // mint      (top)
];

/* Digit colours run cool -> warm as the number climbs, so "how dangerous"
   is legible before you've even read the glyph. */
const DIGIT_COLORS = [
  '#b0a3ad', '#4faa96', '#4295c9', '#7377cf',
  '#a065c6', '#cc5c96', '#d95a68', '#d4713f', '#bf3d3d',
];

function layerColor(layer) {
  const t = layer / (CONFIG.LAYERS - 1);
  const scaled = t * (LAYER_STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), LAYER_STOPS.length - 2);

  return new THREE.Color(LAYER_STOPS[i])
    .lerp(new THREE.Color(LAYER_STOPS[i + 1]), scaled - i);
}

/* Render-side state, kept separate from gameplay `state`. */
const view = {
  scene: null, camera: null, renderer: null, stage: null,
  spherical: null, target: null,
  raycaster: null, pointer: null,
  meshes: [], meshById: new Map(),
  labels: new Map(),              // block id -> number sprite
  layerMaterials: null, mineMaterial: null,
};

/* ---------- 2.1 SCENE ---------- */

function initScene() {
  const stage = document.getElementById('stage');
  view.stage = stage;

  view.scene = new THREE.Scene();

  // Transparent canvas: the background gradient is a CSS layer underneath,
  // which is cheaper than a skybox and stays crisp at any pixel ratio.
  view.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  view.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  view.renderer.shadowMap.enabled = true;
  view.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(view.renderer.domElement);

  // Soft studio reflections. Turned well down - at full strength it washes
  // the pastels out to near-white and the palette stops reading.
  const pmrem = new THREE.PMREMGenerator(view.renderer);
  view.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  view.scene.environmentIntensity = 0.35;
  pmrem.dispose();

  const towerHeight = CONFIG.LAYERS * CONFIG.BLOCK.height;
  view.target = new THREE.Vector3(0, towerHeight / 2, 0);
  view.camera = new THREE.PerspectiveCamera(VIEW.FOV, 1, 0.1, 100);

  // Orbit is stored as spherical coords around the tower's midpoint.
  view.spherical = new THREE.Spherical(10, 1.30, 0.62);

  buildLightRig(towerHeight);

  view.raycaster = new THREE.Raycaster();
  view.pointer = new THREE.Vector2();
  view.sizeScratch = new THREE.Vector2();

  view.renderer.setAnimationLoop(renderFrame);
}

/* ---------- 4.2 LIGHT RIG ----------
   Warm key from above-right for the soft top highlight, cool fill from the
   left so the shadow side stays pastel instead of going grey, and a
   hemisphere wash to keep the undersides from crushing to black. */

function buildLightRig(towerHeight) {
  const hemi = new THREE.HemisphereLight(0xfff4fa, 0xd8c6d4, 1.05);
  view.scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff6f2, 1.5);
  key.target.position.set(0, towerHeight / 2, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 3;
  key.shadow.bias = -0.0015;

  // Ortho box sized to swallow the whole tower from the light's viewpoint.
  const d = 7;
  Object.assign(key.shadow.camera, {
    left: -d, right: d, top: d, bottom: -d, near: 1, far: 34,
  });
  key.shadow.camera.updateProjectionMatrix();

  view.scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.55);
  view.scene.add(fill);

  view.keyLight = key;
  view.fillLight = fill;
  updateLightRig();

  // Catches the contact shadow so the tower sits on something.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ opacity: 0.17 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.001;
  floor.receiveShadow = true;
  view.scene.add(floor);
}

/* The rig orbits with the camera, offset a little to one side so the tower
   keeps a lit face and a shaded face. A world-fixed rig looked good from
   the front and left the whole back of the tower muddy - and the player can
   spin freely, so half the angles were dead. */
function updateLightRig() {
  if (!view.keyLight) return;
  const theta = view.spherical.theta;

  view.keyLight.position.set(
    Math.sin(theta + 0.6) * 9, 12, Math.cos(theta + 0.6) * 9,
  );
  view.fillLight.position.set(
    Math.sin(theta - 1.9) * 8, 4, Math.cos(theta - 1.9) * 8,
  );
}

/* Frames the whole tower on any screen. Portrait is usually height-bound,
   but we solve both axes and take whichever needs more distance so a
   landscape flip or a squat desktop window still fits. */
function fitCamera() {
  const height = CONFIG.LAYERS * CONFIG.BLOCK.height;
  const width = Math.hypot(CONFIG.BLOCK.length, CONFIG.BLOCK.length);

  const vFov = (VIEW.FOV * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * view.camera.aspect);

  const distV = (height * VIEW.FIT_MARGIN) / 2 / Math.tan(vFov / 2);
  const distH = (width * VIEW.FIT_MARGIN) / 2 / Math.tan(hFov / 2);

  view.spherical.radius = Math.max(distV, distH);
  updateCamera();
}

function updateCamera() {
  view.spherical.phi = THREE.MathUtils.clamp(
    view.spherical.phi, VIEW.MIN_PHI, VIEW.MAX_PHI);
  view.camera.position.setFromSpherical(view.spherical).add(view.target);
  view.camera.lookAt(view.target);
  updateLightRig();
}

/* Resize is checked per frame rather than via ResizeObserver. The observer
   only ever fired while #stage still measured 0x0, so setSize() never ran
   and the camera kept its 1:1 startup aspect. Polling the size in the loop
   doesn't care when layout settles, and it picks up orientation flips and
   the mobile URL bar sliding away for free. */
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
  positionLabels();
  view.renderer.render(view.scene, view.camera);
}

/* ---------- 2.2 BOX PRIMITIVES ----------
   block.size is already axis-swapped by createTower(), so it feeds
   straight into BoxGeometry with no orientation math here. */

function buildTower3D() {
  // Built once and shared. Restart calls this again, so guard against
  // stacking up a fresh set of materials on every new tower.
  if (!view.layerMaterials) {
    // One material per layer, shared by that layer's three blocks.
    view.layerMaterials = [];
    for (let layer = 0; layer < CONFIG.LAYERS; layer++) {
      view.layerMaterials.push(new THREE.MeshStandardMaterial({
        color: layerColor(layer), roughness: 0.62, metalness: 0,
      }));
    }
    view.mineMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2607d, roughness: 0.5, metalness: 0,
    });
  }

  for (const block of state.blocks) {
    const mesh = makeBlockMesh(block);
    view.scene.add(mesh);
    view.meshes.push(mesh);
    view.meshById.set(block.id, mesh);
  }
}

function makeBlockMesh(block) {
  // Rounded corners catch the key light along every edge, which is what
  // sells these as physical objects rather than flat-shaded boxes.
  const geometry = new RoundedBoxGeometry(
    block.size.x - VIEW.GAP,
    block.size.y - VIEW.GAP,
    block.size.z - VIEW.GAP,
    VIEW.CORNER_SEGMENTS,
    VIEW.CORNER_RADIUS,
  );

  const mesh = new THREE.Mesh(geometry, view.layerMaterials[block.layer]);
  mesh.position.set(block.x, block.y, block.z);
  mesh.userData.id = block.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // The Part 2 wireframe outlines are gone: the per-layer colours separate
  // the blocks now, and EdgesGeometry scribbles all over rounded corners.
  return mesh;
}

/* ---------- 2.3 TOUCH INPUT ----------
   One pointer stream drives both gestures: drag rotates the tower, and a
   release that never travelled far enough counts as a tap and fires the
   raycast. Without that split every attempt to look around would pull a
   block out from under you. */

function initInput() {
  const el = view.renderer.domElement;
  el.style.touchAction = 'none';

  let dragging = false, moved = 0, startTime = 0, lastX = 0, lastY = 0;

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    startTime = performance.now();
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.hypot(dx, dy);

    view.spherical.theta -= dx * VIEW.DRAG_SPEED;
    view.spherical.phi -= dy * VIEW.DRAG_SPEED;
    updateCamera();
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    const quick = performance.now() - startTime < VIEW.TAP_TIME;
    if (moved < VIEW.TAP_SLOP && quick) tapAt(e.clientX, e.clientY);
  };

  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => { dragging = false; });
}

function tapAt(clientX, clientY) {
  const rect = view.renderer.domElement.getBoundingClientRect();
  view.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  view.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  view.raycaster.setFromCamera(view.pointer, view.camera);
  const hits = view.raycaster.intersectObjects(view.meshes, false);
  if (!hits.length) return;

  clearBlock(hits[0].object.userData.id);
}

/* The single entry point for acting on a block, so all game rules live in
   one place. Returns the block record, or null if the tap did nothing. */
function clearBlock(id) {
  const block = state.blocks[id];
  if (!block || block.cleared || block.triggered) return null;
  if (state.status !== 'playing') return null;

  logBlock(block);

  if (block.isMine) {
    // Mines are NOT removed. Minesweeper convention is that a tripped mine
    // stays visible - deleting it would erase the one piece of information
    // the player just paid a heart for.
    block.triggered = true;
    markMineMesh(id);
    loseHeart();
    return block;
  }

  block.cleared = true;
  state.safeCleared++;
  removeMesh(id);
  addLabel(block);
  updateHUD();

  if (state.safeCleared === state.safeTotal) endGame('won');
  return block;
}

/* Pulls a safe block out of the scene and frees its GPU buffers. */
function removeMesh(id) {
  const mesh = view.meshById.get(id);
  if (!mesh) return;

  view.scene.remove(mesh);
  view.meshById.delete(id);

  const i = view.meshes.indexOf(mesh);
  if (i !== -1) view.meshes.splice(i, 1);

  mesh.geometry.dispose();
  for (const child of mesh.children) child.geometry.dispose();
}

/* Recolours a tripped mine and drops it from the raycast list so it stays
   on screen as a warning but can't be tapped for a second heart. */
function markMineMesh(id) {
  const mesh = view.meshById.get(id);
  if (!mesh) return;

  mesh.material = view.mineMaterial;

  const i = view.meshes.indexOf(mesh);
  if (i !== -1) view.meshes.splice(i, 1);
}

/* ---------- 4.3 NUMBERS IN THE CLEARED SPACES ----------
   Each digit is drawn once into a canvas and reused as a sprite texture.
   Sprites always face the camera, so a number stays readable from any orbit
   angle, and depth testing means it's correctly hidden by the blocks in
   front of it when you spin round to the far side. */

const digitTextures = new Map();

function digitTexture(n) {
  if (digitTextures.has(n)) return digitTextures.get(n);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${size * 0.72}px -apple-system, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // White halo first so the glyph survives against any layer colour.
  ctx.lineWidth = size * 0.11;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineJoin = 'round';
  ctx.strokeText(n, size / 2, size * 0.53);

  ctx.fillStyle = DIGIT_COLORS[n];
  ctx.fillText(n, size / 2, size * 0.53);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  digitTextures.set(n, texture);
  return texture;
}

function addLabel(block) {
  if (state.hardMode || view.labels.has(block.id)) return;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: digitTexture(block.adjacent),
    transparent: true,
    depthWrite: false,   // never punch a hole in what's behind it
  }));

  sprite.position.set(block.x, block.y, block.z);
  sprite.scale.setScalar(VIEW.LABEL_SCALE);

  view.scene.add(sprite);
  view.labels.set(block.id, sprite);
}

/* Slides every number to the mouth of whichever opening currently faces the
   camera, instead of leaving it stranded at the block's centre where the
   surrounding blocks slice it in half. The label rides the inset surface of
   the gap it belongs to, so it stays inside its own hole and gets correctly
   occluded when you orbit round to the far side. */
const labelDir = new THREE.Vector3();

function positionLabels() {
  for (const [id, sprite] of view.labels) {
    const block = state.blocks[id];

    labelDir.set(
      view.camera.position.x - block.x,
      0,
      view.camera.position.z - block.z,
    );

    const insetX = Math.max(block.size.x / 2 - VIEW.LABEL_INSET, 0.01);
    const insetZ = Math.max(block.size.z / 2 - VIEW.LABEL_INSET, 0.01);

    // Scale the direction until the first axis hits its inset bound - that
    // axis is the face the camera is looking through.
    const tx = Math.abs(labelDir.x) > 1e-6 ? insetX / Math.abs(labelDir.x) : Infinity;
    const tz = Math.abs(labelDir.z) > 1e-6 ? insetZ / Math.abs(labelDir.z) : Infinity;
    const t = Math.min(tx, tz);

    sprite.position.set(
      block.x + labelDir.x * t,
      block.y,
      block.z + labelDir.z * t,
    );
  }
}

function removeLabel(id) {
  const sprite = view.labels.get(id);
  if (!sprite) return;

  view.scene.remove(sprite);
  sprite.material.dispose();   // the shared digit texture is NOT disposed
  view.labels.delete(id);
}

/* Rebuilds every label to match the current hard-mode setting, so the
   toggle takes effect mid-game instead of only on the next tap. */
function refreshLabels() {
  for (const id of [...view.labels.keys()]) removeLabel(id);
  if (state.hardMode) return;

  for (const block of state.blocks) {
    if (block.cleared) addLabel(block);
  }
}

/* Tears the whole tower down ahead of a restart. */
function disposeTower3D() {
  for (const mesh of view.meshById.values()) {
    view.scene.remove(mesh);
    mesh.geometry.dispose();
    for (const child of mesh.children) child.geometry.dispose();
  }
  view.meshById.clear();
  view.meshes.length = 0;

  for (const id of [...view.labels.keys()]) removeLabel(id);
}

function logBlock(block) {
  const remaining = state.blocks.filter((b) => !b.cleared && !b.isMine).length;

  console.log(
    `%c ${block.key} %c ${block.isMine ? '*** MINE ***' : `safe · ${block.adjacent} adjacent`}`,
    `background:${block.isMine ? '#d94f6e' : '#7fb2a6'};color:#fff;border-radius:3px`,
    'color:inherit',
  );
  console.log({
    layer: block.layer,
    slot: block.slot,
    axis: block.axis,
    isMine: block.isMine,
    adjacent: block.adjacent,
    neighbors: block.neighbors.map((n) => state.blocks[n].key),
    position: [block.x, block.y, block.z],
    safeRemaining: remaining,
  });
}

/* ============================================================
   PART 3 — UI Integration & Monetization Loops
   3.1 Progress bar   3.2 Heart engine + modal   3.3 Ad revive / Hard mode
   ============================================================ */

const HARD_MODE_KEY = 'jenga.hardMode';
const ui = {};

function initUI() {
  ui.hearts = document.getElementById('hearts');
  ui.safeCount = document.getElementById('safe-count');
  ui.fill = document.getElementById('progress-fill');
  ui.scrim = document.getElementById('modal-scrim');
  ui.modal = document.getElementById('modal');
  ui.emoji = document.getElementById('modal-emoji');
  ui.title = document.getElementById('modal-title');
  ui.body = document.getElementById('modal-body');
  ui.adBtn = document.getElementById('btn-ad');
  ui.restartBtn = document.getElementById('btn-restart');
  ui.hardInput = document.getElementById('hard-mode');

  ui.adBtn.addEventListener('click', watchAd);
  ui.restartBtn.addEventListener('click', restartGame);
  ui.hardInput.addEventListener('change', (e) => setHardMode(e.target.checked));

  setHardMode(localStorage.getItem(HARD_MODE_KEY) === '1');
  updateHUD();
}

/* ---------- 3.1 SAFE BLOCKS REMAINING ----------
   Bar width is driven straight off the data array: how many safe blocks
   are still standing, over how many there were to begin with. */

function updateHUD() {
  const remaining = state.safeTotal - state.safeCleared;

  ui.safeCount.textContent = remaining;
  ui.fill.style.width = `${(remaining / state.safeTotal) * 100}%`;

  // A revive can push hearts past the starting count, so size to whichever
  // is larger rather than assuming three slots.
  const slots = Math.max(CONFIG.START_HEARTS, state.hearts);
  let markup = '';
  for (let i = 0; i < slots; i++) {
    markup += `<span class="heart${i < state.hearts ? '' : ' spent'}">&hearts;</span>`;
  }
  ui.hearts.innerHTML = markup;
}

/* ---------- 3.2 HEART ENGINE ---------- */

function loseHeart() {
  state.hearts = Math.max(0, state.hearts - 1);
  updateHUD();

  document.body.classList.add('damage');
  setTimeout(() => document.body.classList.remove('damage'), 350);

  if (state.hearts === 0) endGame('lost');
}

function endGame(result) {
  state.status = result;
  showModal(result);
}

function showModal(kind) {
  const won = kind === 'won';
  const canRevive = !won && state.revivesUsed < CONFIG.MAX_REVIVES;

  ui.emoji.textContent = won ? '🏆' : '💔';
  ui.title.textContent = won ? 'Tower swept!' : 'Out of hearts';
  ui.body.textContent = won
    ? `All ${state.safeTotal} safe blocks cleared. The tower still stands.`
    : `You cleared ${state.safeCleared} of ${state.safeTotal} safe blocks.`;

  ui.adBtn.hidden = !canRevive;
  resetAdButton();
  if (canRevive) prepareRewardedAd();

  ui.scrim.hidden = false;

  // Retrigger the drop animation: strip the class, force a reflow so the
  // browser registers the removal, then re-add it.
  ui.modal.classList.remove('drop');
  void ui.modal.offsetWidth;
  ui.modal.classList.add('drop');
}

function hideModal() {
  ui.scrim.hidden = true;
  ui.modal.classList.remove('drop');
}

/* ---------- 3.3 MONETIZATION ----------
   Simulated ad. Step 5.2 swaps the body of watchAd() for a real network
   callback; everything downstream of grantRevive() stays as-is. */

function watchAd() {
  if (state.revivesUsed >= CONFIG.MAX_REVIVES) return;

  ui.adBtn.disabled = true;

  // A real rewarded ad if the network is configured AND one is actually
  // loaded; otherwise the simulation, so the game is never un-playable
  // because an ad failed to fill.
  if (ADS.showAd) {
    ui.adBtn.textContent = 'Loading ad…';
    const show = ADS.showAd;
    ADS.showAd = null;
    show();
    return;
  }

  simulateAd();
}

function resetAdButton() {
  ui.adBtn.disabled = false;
  ui.adBtn.textContent = '▶  Watch ad  ·  +1 heart';
}

function simulateAd() {
  let left = CONFIG.AD_SECONDS;
  ui.adBtn.textContent = `Ad playing…  ${left}`;

  const timer = setInterval(() => {
    left--;
    if (left > 0) {
      ui.adBtn.textContent = `Ad playing…  ${left}`;
      return;
    }
    clearInterval(timer);
    ui.adBtn.textContent = 'Reward granted  ·  +1 heart';
    setTimeout(grantRevive, 450);
  }, 1000);
}

function grantRevive() {
  state.revivesUsed++;
  state.hearts++;
  state.status = 'playing';
  updateHUD();
  hideModal();
}

/* Hard mode hides every proximity number. Live as of 4.3: flipping it
   rebuilds the labels immediately rather than waiting for the next tap. */
function setHardMode(on) {
  state.hardMode = !!on;
  ui.hardInput.checked = state.hardMode;
  document.body.dataset.hard = state.hardMode ? '1' : '0';
  localStorage.setItem(HARD_MODE_KEY, state.hardMode ? '1' : '0');
  if (view.scene) refreshLabels();
}

function restartGame() {
  disposeTower3D();
  initGame();
  buildTower3D();
  hideModal();
  updateHUD();
  debugPrintTower();
}

/* ============================================================
   PART 5 — Multi-Platform Optimization & Deployment
   5.1 PWA wrapper   5.2 Web monetization tier
   ============================================================ */

/* ---------- 5.1 PWA ---------- */

function initPWA() {
  if (!('serviceWorker' in navigator)) return;

  // Relative path, so it also registers correctly from a GitHub Pages
  // subpath. Service workers need https or localhost - over file:// this
  // silently no-ops, which is fine.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

/* ---------- 5.2 MONETIZATION ----------
   Google's H5 Games Ads (the AdSense Ad Placement API) is the right fit
   here: it's the web-game product that actually supports *rewarded* ads,
   which is what a revive needs. Plain AdSense display units can't grant a
   reward callback.

   While `publisherId` is empty NO ad script is loaded and no third-party
   request is made at all - the simulated ad from Part 3 runs instead. */

const ADS = {
  publisherId: '',    // <- paste 'ca-pub-...' here to go live
  testMode: true,     // set false only after AdSense approves the site
  ready: false,
  showAd: null,       // set by beforeReward when a reward is preloaded
};

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

/* Asks for a rewarded ad as the modal opens, so it has time to load before
   the player reaches for the button. `beforeReward` hands back a function
   that must be called from a user gesture - we stash it and let the button
   click fire it. */
function prepareRewardedAd() {
  ADS.showAd = null;
  if (!ADS.ready) return;

  window.adBreak({
    type: 'reward',
    name: 'revive-heart',
    beforeReward: (showAdFn) => { ADS.showAd = showAdFn; },
    adViewed: grantRevive,
    adDismissed: resetAdButton,
    adBreakDone: (info) => {
      if (info && info.breakStatus !== 'viewed') resetAdButton();
    },
  });
}

/* ---------- BOOTSTRAP ---------- */

const api = {
  CONFIG, state, view, initGame, debugPrintTower,
  createTower, placeMines, computeAdjacency, areNeighbors,
  initScene, buildTower3D, clearBlock, fitCamera, syncSize,
  ui, initUI, updateHUD, loseHeart, endGame, showModal, hideModal,
  watchAd, grantRevive, setHardMode, restartGame, disposeTower3D,
  layerColor, addLabel, removeLabel, refreshLabels,
  ADS, initPWA, initAds, prepareRewardedAd, simulateAd,
};

window.JengaSweeper = api;

initGame();
initScene();
buildTower3D();
initInput();
initUI();
initAds();
initPWA();
debugPrintTower();

export default api;
