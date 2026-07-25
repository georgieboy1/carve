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

const CONFIG = {
  GRID: null,        // set per shape
  MAX_Y: 6,          // tallest grid any shape uses, for the colour ramp
  CUBE: 1,
  GAP: 0.07,
  START_HEARTS: 3,
  LONG_PRESS: 480,
  TAP_SLOP: 10,
  TAP_TIME: 400,
};

/* Three shapes to feel the difference. Note the proportions: a phone is a
   tall thin window, so a squat mass leaves the screen half empty. Portrait
   wants shapes that are taller than they are wide. */
const SHAPES = [
  { name: 'Obelisk',              // 3x6x3 - reads best in portrait
    grid: { x: 3, y: 6, z: 3 },
    keeps: (x, y, z) => y <= 1 || (x === 1 && z === 1) },

  { name: 'Arch',                 // 5x4x3 - two legs and a span
    grid: { x: 5, y: 4, z: 3 },
    keeps: (x, y, z) => y === 3 || x === 0 || x === 4 },

  { name: 'Pyramid',              // 5x3x5 - squat, wastes vertical space
    grid: { x: 5, y: 3, z: 5 },
    keeps: (x, y, z) => x >= y && x < 5 - y && z >= y && z < 5 - y },

  /* The starting MASS is a level-design variable too, not just the shape
     hidden inside it. A perfect cuboid is the most digital-looking option
     available; a rough boulder sells "sculpting" instead of "deleting", and
     its silhouette leaks a little information for free. */
  { name: 'Spire in stone',
    grid: { x: 5, y: 6, z: 5 },
    mass: (x, y, z) => {
      const dx = x - 2, dz = z - 2;
      const r = 2.6 - Math.abs(y - 2) * 0.2;    // bulges at the waist
      return dx * dx + dz * dz <= r * r;
    },
    keeps: (x, y, z) =>
      (y <= 1 && Math.max(Math.abs(x - 2), Math.abs(z - 2)) <= 1)
      || (x === 2 && z === 2) },
];

let shapeIndex = 0;
let SHAPE = SHAPES[0];

const PALETTE = ['#f7c3d5', '#dfc9f2', '#c3e5f1', '#c7efdf'];
const DIGIT_COLORS = ['#b0a3ad', '#4faa96', '#4295c9', '#7377cf',
  '#a065c6', '#cc5c96', '#d95a68'];

const state = {
  cells: [], byKey: new Map(),
  hearts: CONFIG.START_HEARTS,
  wasteTotal: 0, wasteLeft: 0,
  status: 'playing',
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
  CONFIG.GRID = SHAPE.grid;
  const { x: X, y: Y, z: Z } = CONFIG.GRID;
  state.cells = [];
  state.byKey.clear();

  // A cell only exists where the mass exists. Shapes without a `mass` are
  // solid cuboids, which is just the special case where everything exists.
  const inMass = SHAPE.mass || (() => true);

  for (let y = 0; y < Y; y++) {
    for (let z = 0; z < Z; z++) {
      for (let x = 0; x < X; x++) {
        if (!inMass(x, y, z)) continue;

        const cell = {
          x, y, z, key: key(x, y, z),
          keeper: !!SHAPE.keeps(x, y, z),
          carved: false, marked: false, struck: false,
          near: 0,
        };
        state.cells.push(cell);
        state.byKey.set(cell.key, cell);
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
  state.hearts = CONFIG.START_HEARTS;
  state.status = 'playing';
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

function fitCamera() {
  const spanY = CONFIG.GRID.y * CONFIG.CUBE;
  const spanXZ = Math.hypot(CONFIG.GRID.x, CONFIG.GRID.z) * CONFIG.CUBE;
  const vFov = (view.camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * view.camera.aspect);

  view.spherical.radius = Math.max(
    (spanY * 1.6) / 2 / Math.tan(vFov / 2),
    (spanXZ * 1.15) / 2 / Math.tan(hFov / 2));
  updateCamera();
}

function updateCamera() {
  view.spherical.phi = THREE.MathUtils.clamp(view.spherical.phi, 0.35, 1.5);
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

function digitTexture(n) {
  if (textures.has(n)) return textures.get(n);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
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
  ctx.font = `800 ${size * 0.46}px -apple-system, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(n, size / 2, size * 0.53);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textures.set(n, texture);
  return texture;
}

/* The cavity a carved cube leaves is exactly one cube wide, so the clue can
   simply sit at its centre - no need for the gap-mouth maths the Jenga
   build needed for its long bars. */
function addLabel(cell) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: digitTexture(cell.near), transparent: true, depthWrite: false }));
  sprite.position.copy(worldPos(cell));
  sprite.scale.setScalar(0.55);
  view.group.add(sprite);
  view.labels.push(sprite);
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
    state.hearts = Math.max(0, state.hearts - 1);
    updateHUD();
    if (state.hearts === 0) finish('lost');
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

  ui.bannerEmoji.textContent = result === 'won' ? '✨' : '💔';
  ui.bannerTitle.textContent = result === 'won'
    ? `${SHAPE.name} revealed` : 'Out of hearts';
  ui.bannerBody.textContent = result === 'won'
    ? `Carved away all ${state.wasteTotal} blocks with ${state.hearts} of ${CONFIG.START_HEARTS} hearts left.`
    : `${state.wasteTotal - state.wasteLeft} of ${state.wasteTotal} carved before the chisel slipped.`;
  ui.banner.hidden = false;
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

  let markup = '';
  for (let i = 0; i < CONFIG.START_HEARTS; i++) {
    markup += `<span class="heart${i < state.hearts ? '' : ' spent'}">&hearts;</span>`;
  }
  ui.hearts.innerHTML = markup;
}

/* Cycles to the next shape so the proportions can be compared back to back. */
function restart() {
  shapeIndex = (shapeIndex + 1) % SHAPES.length;
  SHAPE = SHAPES[shapeIndex];

  disposeVoxels();
  buildLevel();
  validateLevel();
  buildVoxels();

  view.target.set(0, (CONFIG.GRID.y - 1) / 2, 0);
  fitCamera();

  ui.banner.hidden = true;
  updateHUD();
}

/* ---------- BOOTSTRAP ---------- */

ui.hearts = document.getElementById('hearts');
ui.left = document.getElementById('left');
ui.fill = document.getElementById('progress-fill');
ui.hint = document.getElementById('hint');
ui.banner = document.getElementById('banner');
ui.bannerEmoji = document.getElementById('banner-emoji');
ui.bannerTitle = document.getElementById('banner-title');
ui.bannerBody = document.getElementById('banner-body');
document.getElementById('again').addEventListener('click', restart);

buildLevel();
validateLevel();
initScene();
buildVoxels();
initInput();
updateHUD();

window.Carve = { CONFIG, SHAPE, state, view, carve, toggleMark, pick, restart, validateLevel };

export default window.Carve;
