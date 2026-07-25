/* ============================================================
   CARVE — collection
   KG Studio
   ------------------------------------------------------------
   The shelf. This is the monetization surface, not a nicety: people buy the
   Garden pack because their shelf has a gap in it. Every sculpture the
   player has revealed stands in colour; everything else is a grey blank, so
   the gap is visible and specific rather than abstract.

   One row per pack, which falls out for free because packs hold four and
   the grid is four wide.
   ============================================================ */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PACKS, byName, parse } from './shapes.js';

const PALETTE = ['#f7c3d5', '#dfc9f2', '#c3e5f1', '#c7efdf'];
const COLS = 4;
const HEAD = 26;          // px of header space reserved at the top of a row

/* ---------- save (read-only mirror of the game's record) ---------- */

const SAVE_KEY = 'carve.save';

function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return {
      best: data.best || {},
      owned: data.owned || PACKS.filter((p) => p.free).map((p) => p.id),
      ...data,
    };
  } catch {
    return { best: {}, owned: PACKS.filter((p) => p.free).map((p) => p.id) };
  }
}

const save = readSave();
save.owned = save.owned || [];

function writeSave() {
  try {
    const existing = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...existing, owned: save.owned }));
  } catch { /* nothing we can do, and nothing that should break the page */ }
}

const owns = (pack) => pack.free || save.owned.includes(pack.id);

function starMarkup(stars) {
  let out = '';
  for (let i = 1; i <= 3; i++) {
    const cls = stars >= i ? 'star full' : stars >= i - 0.5 ? 'star half' : 'star';
    out += `<span class="${cls}">&#9733;</span>`;
  }
  return out;
}

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
const key = new THREE.DirectionalLight(0xfff6f2, 1.4);
key.position.set(6, 11, 8);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8f0ff, 0.5);
fill.position.set(-7, 4, -5);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const geometry = new RoundedBoxGeometry(0.93, 0.93, 0.93, 4, 0.1);

/* A revealed sculpture keeps its colours. An unrevealed one is a blank —
   present enough to show the silhouette is missing, blank enough that it
   isn't a spoiler. */
const blankMaterial = new THREE.MeshStandardMaterial(
  { color: 0xded2da, roughness: 0.8 });

const colourCache = new Map();
function colourFor(y, maxY) {
  const t = maxY > 1 ? y / (maxY - 1) : 0;
  const cacheKey = t.toFixed(3);
  if (colourCache.has(cacheKey)) return colourCache.get(cacheKey);

  const i = Math.min(Math.floor(t * (PALETTE.length - 1)), PALETTE.length - 2);
  const colour = new THREE.Color(PALETTE[i])
    .lerp(new THREE.Color(PALETTE[i + 1]), t * (PALETTE.length - 1) - i);
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.62 });
  colourCache.set(cacheKey, material);
  return material;
}

const tiles = [];
PACKS.forEach((pack, row) => {
  pack.shapes.forEach((name, col) => {
    const shape = byName.get(name);
    const { cells, mass, grid } = parse(shape);
    const done = !!save.best[name];
    const group = new THREE.Group();

    /* Revealed: the sculpture in its colours. Not yet revealed: the UNCARVED
       MASS, not a grey copy of the sculpture. Showing the silhouette would
       hand over the answer to a puzzle they haven't played — and a block of
       raw stone is the honest picture of where that level stands. */
    const shown = done
      ? [...cells.values()]
      : [...mass].map((k) => {
        const [x, y, z] = k.split(',').map(Number);
        return { x, y, z };
      });

    for (const cell of shown) {
      const mesh = new THREE.Mesh(
        geometry, done ? colourFor(cell.y, grid.y) : blankMaterial);
      mesh.position.set(
        cell.x - (grid.x - 1) / 2,
        cell.y - (grid.y - 1) / 2,
        cell.z - (grid.z - 1) / 2);
      group.add(mesh);
    }

    scene.add(group);
    tiles.push({
      name, pack, row, col, group, done,
      best: save.best[name],
      radius: 0.5 * Math.hypot(grid.x, grid.y, grid.z),
      // Index into the game's play order, so a tile can hand it straight back.
      levelIndex: PACKS.slice(0, row).reduce((n, p) => n + p.shapes.length, 0) + col,
    });
  });
});

/* ---------- overlay ---------- */

const overlay = document.getElementById('overlay');

function buildOverlay(cellW, cellH) {
  overlay.innerHTML = '';

  PACKS.forEach((pack, row) => {
    const head = document.createElement('div');
    head.className = 'pack-head';
    head.style.top = `${row * cellH + 4}px`;

    const unlocked = owns(pack);
    head.innerHTML = `<b>${pack.name}</b>`;

    if (!unlocked) {
      const button = document.createElement('button');
      button.type = 'button';
      // Zen rides along with any pack, so say so where the money is asked
      // for rather than only in the Zen sheet the player may never open.
      const carriesZen = !save.zenUnlocked
        && !PACKS.some((p) => !p.free && save.owned.includes(p.id));
      button.textContent = carriesZen ? 'Unlock — with Zen' : 'Unlock pack';
      button.style.pointerEvents = 'auto';
      button.addEventListener('click', () => {
        save.owned.push(pack.id);
        writeSave();
        location.reload();
      });
      head.appendChild(button);
    } else {
      const done = pack.shapes.filter((n) => save.best[n]).length;
      const span = document.createElement('span');
      span.className = 'lock';
      span.textContent = `${done}/${pack.shapes.length}`;
      head.appendChild(span);
    }

    overlay.appendChild(head);
  });

  tiles.forEach((tile) => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.left = `${tile.col * cellW}px`;
    el.style.top = `${tile.row * cellH}px`;
    el.style.width = `${cellW}px`;
    el.style.height = `${cellH}px`;

    const locked = !owns(tile.pack);
    const stars = tile.best?.stars ?? 0;

    /* A Zen finish shows the sculpture but no stars, so the shelf stays an
       honest record and there is still a reason to come back to it. */
    el.innerHTML = tile.done
      ? `<b>${tile.name}</b><span class="score">${
        tile.best.mode === 'zen' && !stars ? '<i class="zen">zen</i>' : starMarkup(stars)
      }</span>`
      : `<b style="color:#c2b0bd">${locked ? '&#8226; &#8226; &#8226;' : tile.name}</b>
         <span class="todo">${locked ? 'locked' : 'not carved'}</span>`;

    /* This screen IS the level select. Anything in an owned pack is
       playable — carved or not — so a player picks from the four rather
       than being handed whichever level the counter landed on. */
    if (!locked) {
      el.classList.add('playable');
      el.style.pointerEvents = 'auto';
      el.setAttribute('role', 'link');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label',
        `${tile.name}, ${tile.done ? 'carved' : 'not carved'} — play`);

      const open = () => { location.href = `./?level=${tile.levelIndex}`; };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    }

    overlay.appendChild(el);
  });
}

/* ---------- draw ---------- */

function draw() {
  const width = canvas.clientWidth;
  if (!width) return;

  const cellW = width / COLS;
  const cellH = cellW * 1.16 + HEAD;
  const height = cellH * PACKS.length;

  canvas.style.height = `${height}px`;
  renderer.setSize(width, height, false);
  overlay.style.height = `${height}px`;
  buildOverlay(cellW, cellH);

  renderer.setScissorTest(true);
  camera.aspect = cellW / (cellH - HEAD);
  camera.updateProjectionMatrix();

  const tanV = Math.tan((camera.fov * Math.PI) / 180 / 2);
  const tanH = tanV * camera.aspect;

  tiles.forEach((tile) => {
    const x = tile.col * cellW;
    // Viewport origin is bottom-left; the header sits above each row.
    const y = height - (tile.row + 1) * cellH;
    const h = cellH - HEAD;

    renderer.setViewport(x, y + 14, cellW, h);
    renderer.setScissor(x, y + 14, cellW, h);

    const dist = (tile.radius * 1.5) / Math.min(tanV, tanH);
    camera.position.set(0.62, 0.5, 0.62).setLength(dist);
    camera.lookAt(0, 0, 0);

    tiles.forEach((other) => { other.group.visible = other === tile; });
    renderer.render(scene, camera);
  });

  renderer.setScissorTest(false);
}

const doneCount = tiles.filter((t) => t.done).length;
document.getElementById('tally').textContent = `${doneCount} / ${tiles.length} carved`;

new ResizeObserver(draw).observe(document.getElementById('wrap'));
draw();

window.Gallery = { tiles, save, draw };
