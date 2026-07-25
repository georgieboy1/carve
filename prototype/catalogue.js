/* ============================================================
   CARVE — level catalogue
   KG Studio
   ------------------------------------------------------------
   Answers "how many levels could we make, and how would they look?"

   The important part isn't the render, it's the AUTHORING FORMAT below.
   Every shape is a stack of text maps, bottom layer first: '#' is stone,
   '.' is air. A level is a dozen short strings, so a designer draws one in
   minutes without touching code, and the validator checks it stands before
   it ever reaches a player.
   ============================================================ */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SHAPES, parse, validate } from './shapes.js';

const PALETTE = ['#f7c3d5', '#dfc9f2', '#c3e5f1', '#c7efdf'];
const COLS = 4;

/* ---------- scene ---------- */

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xfff4fa, 0xd8c6d4, 1.15));
const key1 = new THREE.DirectionalLight(0xfff6f2, 1.45);
key1.position.set(6, 11, 8);
scene.add(key1);
const fill = new THREE.DirectionalLight(0xe8f0ff, 0.5);
fill.position.set(-7, 4, -5);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const geometry = new RoundedBoxGeometry(0.93, 0.93, 0.93, 4, 0.1);

const materials = [];
function materialFor(y, maxY) {
  const t = maxY > 1 ? y / (maxY - 1) : 0;
  const i = Math.min(Math.floor(t * (PALETTE.length - 1)), PALETTE.length - 2);
  const colour = new THREE.Color(PALETTE[i])
    .lerp(new THREE.Color(PALETTE[i + 1]), t * (PALETTE.length - 1) - i);
  const found = materials.find((m) => m.color.equals(colour));
  if (found) return found;
  const made = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.62 });
  materials.push(made);
  return made;
}

const entries = SHAPES.map((shape) => {
  const parsed = parse(shape);
  const report = validate(shape);
  const group = new THREE.Group();

  for (const cell of parsed.cells.values()) {
    const mesh = new THREE.Mesh(geometry, materialFor(cell.y, parsed.grid.y));
    mesh.position.set(
      cell.x - (parsed.grid.x - 1) / 2,
      cell.y - (parsed.grid.y - 1) / 2,
      cell.z - (parsed.grid.z - 1) / 2);
    group.add(mesh);
  }

  scene.add(group);
  const g = parsed.grid;
  return {
    shape, group, report, grid: g,
    blocks: parsed.cells.size,
    box: g.x * g.y * g.z,
    radius: 0.5 * Math.hypot(g.x, g.y, g.z),
  };
});

/* ---------- labels + layout ---------- */

const rows = Math.ceil(entries.length / COLS);
const labels = document.getElementById('labels');
labels.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
labels.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
labels.innerHTML = entries.map((e) => `
  <div class="cell">
    <b>${e.shape.name}</b>
    <span>${e.shape.category}</span>
    <i>${e.grid.x}×${e.grid.y}×${e.grid.z} &middot; ${e.blocks} kept &middot; ${e.box - e.blocks} to carve</i>
  </div>`).join('');

function draw() {
  const width = canvas.clientWidth;
  const cellW = width / COLS;
  const cellH = cellW * 0.92;
  const height = cellH * rows;

  canvas.style.height = `${height}px`;
  renderer.setSize(width, height, false);
  labels.style.height = `${height}px`;

  renderer.setScissorTest(true);
  camera.aspect = cellW / cellH;
  camera.updateProjectionMatrix();

  const tanV = Math.tan((camera.fov * Math.PI) / 180 / 2);
  const tanH = tanV * camera.aspect;

  entries.forEach((entry, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * cellW;
    const y = height - (row + 1) * cellH;

    renderer.setViewport(x, y, cellW, cellH);
    renderer.setScissor(x, y, cellW, cellH);

    // Bounding sphere is fine here: thumbnails want consistent margins more
    // than they want every last pixel of size.
    const dist = (entry.radius * 1.35) / Math.min(tanV, tanH);
    camera.position.set(dist * 0.62, dist * 0.52, dist * 0.62)
      .setLength(dist);
    camera.position.y += 0.35;
    camera.lookAt(0, 0, 0);

    entries.forEach((other, j) => { other.group.visible = i === j; });
    renderer.render(scene, camera);
  });

  renderer.setScissorTest(false);
}

new ResizeObserver(draw).observe(canvas.parentElement);
draw();

console.table(entries.map((e) => ({
  name: e.shape.name,
  category: e.shape.category,
  grid: `${e.grid.x}x${e.grid.y}x${e.grid.z}`,
  kept: e.blocks,
  carve: e.box - e.blocks,
  stands: e.report.stands,
})));

window.Catalogue = { SHAPES, entries, draw };
