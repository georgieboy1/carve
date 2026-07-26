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
  // 7/36 = 19%, matching Minesweeper Expert. At the old 10 (28%) only ~2.4
  // zeros existed per tower and 26% of towers had none at all - with no
  // zero there's no foothold, and the opening move is a coin flip.
  MINE_COUNT: 7,
  // Real Jenga is 75 x 25 x 15mm -> 3 : 1 : 0.6
  BLOCK: { length: 3, width: 1, height: 0.6 },

  // Structural rule makes "clear every safe block" impossible: mines are
  // never removed, so each layer ends holding exactly its mines, and with 7
  // mines over 12 layers you ALWAYS finish with adjacent empty (Critical)
  // layers. Measured: 100% of towers. A DP over 2,000 towers puts the most
  // structurally-sound removals at 23 worst case / 25 average, so a goal of
  // 20 is always reachable with slack.
  CLEAR_GOAL: 20,

  START_HEARTS: 3,
  TILT_PER_HIT: 3,    // degrees of lean added per mine or collapse
  SHAKE_MS: 300,
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
  goal: CONFIG.CLEAR_GOAL,
  revivesUsed: 0,
  status: 'playing',   // 'playing' | 'won' | 'lost'
  hardMode: false,     // survives a restart, so it lives outside initGame()

  // --- structural integrity ---
  layerStability: [],        // per layer: 'stable' | 'critical'
  collapsedPairs: new Set(), // pairs already charged, so they can't re-fire
  damageTaken: 0,            // mines + collapses; drives the lean
  foundationIntegrity: 100,  // DERIVED from hearts - see updateHUD()
  lastFailure: null,         // 'mine' | 'collapse', picks the modal copy
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
        flagged: false,     // player's own "I think this is a mine" mark
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

/* ---------- 1.35 STRUCTURAL INTEGRITY ----------
   Deterministic Jenga, not simulated Jenga. A layer's fate is a rule the
   player can read off the tower, so a collapse is always something they
   could have seen coming - which is the whole difference between a second
   puzzle axis and a random tax on correct play.

   The Rule of Three, by what's LEFT standing (triggered mines still count -
   they're physically still in the tower, and they hold it up):
     3 blocks            -> stable
     2 blocks            -> stable  (incl. left+right, centre pulled)
     centre alone        -> stable  (balanced on the middle, real Jenga)
     one edge alone      -> CRITICAL
     nothing             -> CRITICAL  (extends the rule past what the
                                       brief spelled out)
   Two *adjacent* Critical layers bring the tower down. */

function evaluateLayer(layer) {
  const standing = state.grid[layer].filter((b) => !b.cleared);

  if (standing.length >= 2) return 'stable';
  if (standing.length === 1 && standing[0].slot === 1) return 'stable';
  return 'critical';
}

function updateStability() {
  for (let layer = 0; layer < CONFIG.LAYERS; layer++) {
    state.layerStability[layer] = evaluateLayer(layer);
  }
}

/* Returns the lowest adjacent Critical pair that hasn't already been
   charged. Pairs fire once: a collapse costs a heart, and without this the
   same weak spot would bill the player again on their very next tap. */
function findCollapse() {
  for (let layer = 0; layer < CONFIG.LAYERS - 1; layer++) {
    if (state.layerStability[layer] !== 'critical') continue;
    if (state.layerStability[layer + 1] !== 'critical') continue;

    const key = `${layer}-${layer + 1}`;
    if (state.collapsedPairs.has(key)) continue;
    return { key, layer };
  }
  return null;
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
  state.goal = Math.min(CONFIG.CLEAR_GOAL, state.safeTotal);
  state.revivesUsed = 0;
  state.status = 'playing';

  state.layerStability = new Array(CONFIG.LAYERS).fill('stable');
  state.collapsedPairs = new Set();
  state.damageTaken = 0;
  state.foundationIntegrity = 100;
  state.lastFailure = null;
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
  LABEL_SCALE: 0.5,       // fits inside the 0.6-tall gap a block leaves
  LABEL_INSET: 0.26,      // how far inside the gap mouth the number sits
  FLAG_SCALE: 0.34,
  FLAG_PROUD: 0.04,       // flags sit just OUTSIDE the block face
  LONG_PRESS: 480,        // ms held before a press becomes a flag
  SELECT_GROW: 1.28,      // how much the selected number swells
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
  tower: null,                    // everything that leans, lives in here
  cameraBase: null,               // orbit position before shake is added
  tiltTarget: 0, shakeUntil: 0,
  meshes: [], meshById: new Map(),
  labels: new Map(),              // block id -> number sprite
  flags: new Map(),               // block id -> flag marker sprite
  selectedId: null,               // number whose neighbours are lit up
  layerMaterials: null, mineMaterial: null, highlightMaterial: null,
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
  view.cameraBase = new THREE.Vector3();

  // Blocks, numbers and flags all live in one group so the buckling lean
  // moves them together. The floor stays outside it - the ground doesn't
  // tilt, only what's stacked on it.
  view.tower = new THREE.Group();
  view.scene.add(view.tower);

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

  // A leaning tower is a wider tower: it pivots at the base, so the top
  // swings out by height*sin(lean) and would otherwise clip off-screen.
  // Pulling back as the damage mounts also reads as flinching away from it.
  const lean = Math.abs(view.tiltTarget || 0);
  const width = Math.hypot(CONFIG.BLOCK.length, CONFIG.BLOCK.length)
    + height * Math.sin(lean);

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
  view.cameraBase.setFromSpherical(view.spherical).add(view.target);
  view.camera.position.copy(view.cameraBase);
  view.camera.lookAt(view.target);

  // Raycasting reads camera.matrixWorld, and the camera is not a child of
  // the scene, so scene.updateMatrixWorld() never reaches it. Refreshing it
  // here keeps picking correct even before the first frame has rendered.
  view.camera.updateMatrixWorld();

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

/* ---------- BUCKLING ----------
   Damage never slides individual blocks - that's the chaotic-simulation
   trap. The whole tower leans by a fixed step and the camera jolts, so the
   feedback is dramatic but completely deterministic. */

function damageTower() {
  state.damageTaken++;
  view.tiltTarget = THREE.MathUtils.degToRad(CONFIG.TILT_PER_HIT * state.damageTaken);
  fitCamera();
  view.shakeUntil = performance.now() + CONFIG.SHAKE_MS;
}

/* The ad literally straightens the tower back up - the reward is visible,
   not just a number going up. */
function relieveTower() {
  state.damageTaken = Math.max(0, state.damageTaken - 1);
  view.tiltTarget = THREE.MathUtils.degToRad(CONFIG.TILT_PER_HIT * state.damageTaken);
  fitCamera();
}

function animateTower() {
  const current = view.tower.rotation.z;
  if (Math.abs(view.tiltTarget - current) > 1e-4) {
    view.tower.rotation.z = current + (view.tiltTarget - current) * 0.12;
  }

  const now = performance.now();
  if (now >= view.shakeUntil) {
    if (view.shaking) {
      view.camera.position.copy(view.cameraBase);
      view.camera.lookAt(view.target);
      view.shaking = false;
    }
    return;
  }

  const falloff = (view.shakeUntil - now) / CONFIG.SHAKE_MS;   // 1 -> 0
  const amp = 0.17 * falloff;
  view.camera.position.set(
    view.cameraBase.x + (Math.random() * 2 - 1) * amp,
    view.cameraBase.y + (Math.random() * 2 - 1) * amp,
    view.cameraBase.z + (Math.random() * 2 - 1) * amp,
  );
  view.camera.lookAt(view.target);
  view.shaking = true;
}

function renderFrame() {
  syncSize();
  animateTower();
  positionMarkers();
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
    // Amber: reads instantly against every pastel in the ramp, and can't be
    // confused with the mine red.
    view.highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc978, emissive: 0x6b4310, emissiveIntensity: 0.32,
      roughness: 0.45, metalness: 0,
    });
  }

  for (const block of state.blocks) {
    const mesh = makeBlockMesh(block);
    view.tower.add(mesh);
    view.meshes.push(mesh);
    view.meshById.set(block.id, mesh);
  }

  // Raycasting reads matrixWorld, which is otherwise only refreshed during
  // render(). Until the next frame lands, every fresh mesh would still be
  // sitting at the origin as far as a tap is concerned.
  view.scene.updateMatrixWorld(true);
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
  let pressTimer = null, longFired = false;

  const cancelLongPress = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
  };

  el.addEventListener('pointerdown', (e) => {
    hideHint();          // they're interacting; the nudge has done its job
    dragging = true;
    moved = 0;
    longFired = false;
    startTime = performance.now();
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);

    // Hold still long enough and the press becomes a flag instead of a pull.
    const { clientX, clientY } = e;
    pressTimer = setTimeout(() => {
      longFired = true;
      dragging = false;        // also stops this gesture rotating the camera
      const hit = pick(clientX, clientY);
      if (hit && hit.kind === 'block') toggleFlag(hit.id);
    }, VIEW.LONG_PRESS);
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.hypot(dx, dy);

    if (moved >= VIEW.TAP_SLOP) cancelLongPress();

    view.spherical.theta -= dx * VIEW.DRAG_SPEED;
    view.spherical.phi -= dy * VIEW.DRAG_SPEED;
    updateCamera();
  });

  const end = (e) => {
    cancelLongPress();
    if (!dragging || longFired) return;
    dragging = false;
    const quick = performance.now() - startTime < VIEW.TAP_TIME;
    if (moved < VIEW.TAP_SLOP && quick) tapAt(e.clientX, e.clientY);
  };

  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => {
    cancelLongPress();
    dragging = false;
  });
}

/* Nearest hit across blocks and number chips, so a chip sitting in a gap
   can be tapped without the block behind it stealing the press. */
function pick(clientX, clientY) {
  const rect = view.renderer.domElement.getBoundingClientRect();
  view.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  view.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  view.raycaster.setFromCamera(view.pointer, view.camera);
  const targets = [...view.meshes, ...view.labels.values()];
  const hits = view.raycaster.intersectObjects(targets, false);
  if (!hits.length) return null;

  const object = hits[0].object;
  return { kind: object.isSprite ? 'label' : 'block', id: object.userData.id };
}

function tapAt(clientX, clientY) {
  const hit = pick(clientX, clientY);

  if (!hit) return clearSelection();
  if (hit.kind === 'label') return toggleSelection(hit.id);

  clearBlock(hit.id);
}

/* The single entry point for acting on a block, so all game rules live in
   one place. Returns the block record, or null if the tap did nothing. */
function clearBlock(id) {
  const block = state.blocks[id];
  if (!block || block.cleared || block.triggered) return null;
  if (state.status !== 'playing') return null;

  // A flag is a deliberate "don't touch this". Honouring it is the whole
  // point - otherwise one fat-fingered tap undoes a correct deduction.
  if (block.flagged) return null;

  clearSelection();
  logBlock(block);

  if (block.isMine) {
    // Mines are NOT removed. Minesweeper convention is that a tripped mine
    // stays visible - deleting it would erase the one piece of information
    // the player just paid a heart for.
    block.triggered = true;
    markMineMesh(id);
    navigator.vibrate?.(60);
    state.lastFailure = 'mine';
    damageTower();
    loseHeart();
    return block;
  }

  block.cleared = true;
  state.safeCleared++;
  removeMesh(id);
  addLabel(block);

  // Structure is re-evaluated on every pull, and a collapse is charged
  // before the win check - you don't sneak over the line on the same tap
  // that brings the tower down.
  updateStability();
  const collapse = findCollapse();
  if (collapse) triggerCollapse(collapse);

  updateHUD();

  if (state.status === 'playing' && state.safeCleared >= state.goal) endGame('won');
  return block;
}

function triggerCollapse({ key }) {
  state.collapsedPairs.add(key);
  state.lastFailure = 'collapse';

  navigator.vibrate?.([40, 60, 90]);
  damageTower();
  loseHeart();
}

/* Pulls a safe block out of the scene and frees its GPU buffers. */
function removeMesh(id) {
  const mesh = view.meshById.get(id);
  if (!mesh) return;

  view.tower.remove(mesh);
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

const spriteTextures = new Map();

function spriteTexture(key, draw) {
  if (spriteTextures.has(key)) return spriteTextures.get(key);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  spriteTextures.set(key, texture);
  return texture;
}

/* A solid chip, not a bare glyph. The old outlined digit sat in a shadowed
   recess and had to compete with whatever pastel was behind it; a filled
   card with its own shadow reads as a UI token floating in the gap and
   stays legible at arm's length on a phone. */
function drawChip(ctx, size, fill, stroke) {
  const pad = size * 0.1;

  ctx.shadowColor = 'rgba(74,59,73,0.32)';
  ctx.shadowBlur = size * 0.08;
  ctx.shadowOffsetY = size * 0.025;
  ctx.beginPath();
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, size * 0.26);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = size * 0.04;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function centredText(ctx, size, text, color) {
  ctx.fillStyle = color;
  ctx.font = `800 ${size * 0.46}px -apple-system, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size * 0.53);
}

function digitTexture(n) {
  return spriteTexture(`d${n}`, (ctx, size) => {
    drawChip(ctx, size, '#fffcfd', DIGIT_COLORS[n]);
    centredText(ctx, size, n, DIGIT_COLORS[n]);
  });
}

function flagTexture() {
  return spriteTexture('flag', (ctx, size) => {
    drawChip(ctx, size, '#ff6b8a', '#dd3f5e');
    centredText(ctx, size, '!', '#fffdfe');
  });
}

function makeSprite(map, scale) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,   // never punch a hole in what's behind it
  }));
  sprite.scale.setScalar(scale);
  return sprite;
}

function addLabel(block) {
  if (state.hardMode || view.labels.has(block.id)) return;

  const sprite = makeSprite(digitTexture(block.adjacent), VIEW.LABEL_SCALE);
  sprite.position.set(block.x, block.y, block.z);
  sprite.userData.id = block.id;   // tapping it lights up its neighbours

  view.tower.add(sprite);
  view.labels.set(block.id, sprite);
}

/* ---------- FLAGS ----------
   Somewhere to put a conclusion. Without them a deduction lives only in the
   player's head, and a single mis-tap on a block they'd correctly reasoned
   about costs a heart - so flagged blocks are also locked against tapping. */

function addFlag(block) {
  if (view.flags.has(block.id)) return;

  const sprite = makeSprite(flagTexture(), VIEW.FLAG_SCALE);
  sprite.position.set(block.x, block.y, block.z);
  sprite.raycast = () => {};   // markers must never swallow a tap

  view.tower.add(sprite);
  view.flags.set(block.id, sprite);
}

function removeFlag(id) {
  const sprite = view.flags.get(id);
  if (!sprite) return;

  view.tower.remove(sprite);
  sprite.material.dispose();
  view.flags.delete(id);
}

function toggleFlag(id) {
  const block = state.blocks[id];
  if (!block || block.cleared || block.triggered) return null;
  if (state.status !== 'playing') return null;

  block.flagged = !block.flagged;
  if (block.flagged) addFlag(block);
  else removeFlag(id);

  navigator.vibrate?.(15);
  return block;
}

/* ---------- CLUE SELECTION ----------
   The hard part of 3D Minesweeper isn't reading a number, it's working out
   which eight blocks it's talking about when three of them are buried under
   your viewing angle. Tapping a number lights its unresolved neighbours. */

function toggleSelection(id) {
  if (view.selectedId === id) return clearSelection();

  clearSelection();
  view.selectedId = id;

  for (const nid of state.blocks[id].neighbors) {
    const neighbour = state.blocks[nid];
    if (neighbour.cleared || neighbour.triggered) continue;  // already known
    const mesh = view.meshById.get(nid);
    if (mesh) mesh.material = view.highlightMaterial;
  }

  const sprite = view.labels.get(id);
  if (sprite) sprite.scale.setScalar(VIEW.LABEL_SCALE * VIEW.SELECT_GROW);
}

function clearSelection() {
  if (view.selectedId === null) return;

  for (const nid of state.blocks[view.selectedId].neighbors) {
    const mesh = view.meshById.get(nid);
    if (!mesh) continue;
    const neighbour = state.blocks[nid];
    mesh.material = neighbour.triggered
      ? view.mineMaterial
      : view.layerMaterials[neighbour.layer];
  }

  const sprite = view.labels.get(view.selectedId);
  if (sprite) sprite.scale.setScalar(VIEW.LABEL_SCALE);

  view.selectedId = null;
}

/* Slides every number to the mouth of whichever opening currently faces the
   camera, instead of leaving it stranded at the block's centre where the
   surrounding blocks slice it in half. The label rides the inset surface of
   the gap it belongs to, so it stays inside its own hole and gets correctly
   occluded when you orbit round to the far side. */
const markerDir = new THREE.Vector3();

function placeMarker(sprite, block, boundX, boundZ) {
  // localCam, not camera.position: block coords are tower-local, and the
  // tower leans once it takes damage.
  markerDir.set(localCam.x - block.x, 0, localCam.z - block.z);

  // Scale the direction until the first axis hits its bound - that axis is
  // the face the camera is looking through.
  const tx = Math.abs(markerDir.x) > 1e-6 ? boundX / Math.abs(markerDir.x) : Infinity;
  const tz = Math.abs(markerDir.z) > 1e-6 ? boundZ / Math.abs(markerDir.z) : Infinity;
  const t = Math.min(tx, tz);

  sprite.position.set(
    block.x + markerDir.x * t,
    block.y,
    block.z + markerDir.z * t,
  );
}

/* Flags ride the tower's outer silhouette, not their own block's face.
   Layers alternate, so the blocks above and below a given block stick out
   further than it does - a marker on its own face sits in a trench and gets
   sliced by its neighbours. Numbers don't have this problem: they're inside
   a gap, which is exactly where they belong. */
const FLAG_ENVELOPE = CONFIG.BLOCK.length / 2 + VIEW.FLAG_PROUD;
const localCam = new THREE.Vector3();

function positionMarkers() {
  if (!view.labels.size && !view.flags.size) return;

  view.tower.updateMatrixWorld();
  localCam.copy(view.camera.position);
  view.tower.worldToLocal(localCam);

  for (const [id, sprite] of view.labels) {
    const block = state.blocks[id];
    placeMarker(
      sprite, block,
      Math.max(block.size.x / 2 - VIEW.LABEL_INSET, 0.01),
      Math.max(block.size.z / 2 - VIEW.LABEL_INSET, 0.01),
    );
  }

  for (const [id, sprite] of view.flags) {
    placeMarker(sprite, state.blocks[id], FLAG_ENVELOPE, FLAG_ENVELOPE);
  }
}

function removeLabel(id) {
  const sprite = view.labels.get(id);
  if (!sprite) return;

  view.tower.remove(sprite);
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
  clearSelection();

  for (const mesh of view.meshById.values()) {
    view.tower.remove(mesh);
    mesh.geometry.dispose();
    for (const child of mesh.children) child.geometry.dispose();
  }
  view.meshById.clear();
  view.meshes.length = 0;

  for (const id of [...view.labels.keys()]) removeLabel(id);
  for (const id of [...view.flags.keys()]) removeFlag(id);
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
const SEEN_HELP_KEY = 'jenga.seenHelp';
const ui = {};

function initUI() {
  ui.hearts = document.getElementById('hearts');
  ui.safeCount = document.getElementById('safe-count');
  ui.fill = document.getElementById('progress-fill');
  ui.integrityFill = document.getElementById('integrity-fill');
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
  initHelp();
}

/* ---------- ONBOARDING ----------
   A first-timer otherwise gets a silent 3D object and no idea that the
   proximity numbers count the layers above and below - which is the one
   rule someone who knows classic Minesweeper will get wrong, because
   there it's a flat 3x3 ring. */

function initHelp() {
  ui.helpBtn = document.getElementById('btn-help');
  ui.helpScrim = document.getElementById('help-scrim');
  ui.helpClose = document.getElementById('btn-help-close');
  ui.helpGoal = document.getElementById('help-goal');
  ui.hint = document.getElementById('gesture-hint');

  ui.helpBtn.addEventListener('click', showHelp);
  ui.helpClose.addEventListener('click', hideHelp);

  // Tapping the backdrop dismisses, but only the backdrop itself - clicks
  // that bubble up from inside the card must not close it.
  ui.helpScrim.addEventListener('click', (e) => {
    if (e.target === ui.helpScrim) hideHelp();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ui.helpScrim.hidden) hideHelp();
  });

  if (localStorage.getItem(SEEN_HELP_KEY) === '1') showHint();
  else showHelp();
}

function showHelp() {
  ui.helpGoal.innerHTML =
    `Pull <b>${state.goal}</b> blocks without collapsing the tower. The bar up top counts down as you go.`;
  ui.helpScrim.hidden = false;
  hideHint();
}

function hideHelp() {
  ui.helpScrim.hidden = true;
  localStorage.setItem(SEEN_HELP_KEY, '1');
  showHint();
}

function showHint() {
  if (state.safeCleared > 0) return;   // they've clearly worked it out
  ui.hint.hidden = false;
  ui.hint.classList.remove('leaving');
  clearTimeout(ui.hintTimer);
  ui.hintTimer = setTimeout(hideHint, 6000);
}

function hideHint() {
  if (!ui.hint || ui.hint.hidden) return;
  clearTimeout(ui.hintTimer);
  ui.hint.classList.add('leaving');
  setTimeout(() => { ui.hint.hidden = true; }, 350);
}

/* ---------- 3.1 SAFE BLOCKS REMAINING ----------
   Bar width is driven straight off the data array: how many safe blocks
   are still standing, over how many there were to begin with. */

function updateHUD() {
  const remaining = Math.max(0, state.goal - state.safeCleared);

  ui.safeCount.textContent = remaining;
  ui.fill.style.width = `${(remaining / state.goal) * 100}%`;

  // Integrity is DERIVED from hearts rather than counted separately. Two
  // independent damage counters would drift the moment a revive granted a
  // heart, and both of them gate the same fail state.
  state.foundationIntegrity = Math.max(
    0, Math.round((state.hearts / CONFIG.START_HEARTS) * 100));

  ui.integrityFill.style.width = `${state.foundationIntegrity}%`;
  ui.integrityFill.style.background = integrityColor(state.foundationIntegrity);

  // A revive can push hearts past the starting count, so size to whichever
  // is larger rather than assuming three slots.
  const slots = Math.max(CONFIG.START_HEARTS, state.hearts);
  let markup = '';
  for (let i = 0; i < slots; i++) {
    markup += `<span class="heart${i < state.hearts ? '' : ' spent'}">&hearts;</span>`;
  }
  ui.hearts.innerHTML = markup;
}

/* Pastel mint at full integrity -> bright coral as the foundation goes. */
function integrityColor(pct) {
  const t = pct / 100;
  const mix = (from, to) => Math.round(from + (to - from) * t);
  return `rgb(${mix(255, 127)}, ${mix(107, 178)}, ${mix(138, 166)})`;
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
  const collapsed = state.lastFailure === 'collapse';
  const canRevive = !won && state.revivesUsed < CONFIG.MAX_REVIVES;

  if (won) {
    ui.emoji.textContent = '🏆';
    ui.title.textContent = 'Tower swept!';
    ui.body.textContent =
      `All ${state.goal} blocks pulled and the tower still stands.`;
  } else if (collapsed) {
    ui.emoji.textContent = '🧱';
    ui.title.textContent = 'Tower Collapsed!';
    ui.body.textContent =
      `Two neighbouring layers gave way at ${state.safeCleared} of ${state.goal} blocks.`;
  } else {
    ui.emoji.textContent = '💔';
    ui.title.textContent = 'Out of hearts';
    ui.body.textContent =
      `You pulled ${state.safeCleared} of ${state.goal} blocks.`;
  }

  ui.adBtn.hidden = !canRevive;
  resetAdButton(collapsed);
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

function resetAdButton(collapsed = state.lastFailure === 'collapse') {
  ui.adBtn.disabled = false;
  ui.adBtn.textContent = collapsed
    ? '▶  Watch ad  ·  Glue it back together'
    : '▶  Watch ad  ·  +1 heart';
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
  relieveTower();     // the tower visibly straightens back up
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
  view.tiltTarget = 0;
  view.tower.rotation.z = 0;
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
  toggleFlag, addFlag, removeFlag, toggleSelection, clearSelection, pick,
  evaluateLayer, updateStability, findCollapse, triggerCollapse,
  damageTower, relieveTower, integrityColor,
  ADS, initPWA, initAds, prepareRewardedAd, simulateAd,
  initHelp, showHelp, hideHelp, showHint, hideHint,
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
