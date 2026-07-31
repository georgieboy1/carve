/* ============================================================
   CARVE — sculpture thumbnails
   KG Studio
   ------------------------------------------------------------
   Renders one small picture per sculpture and hands back a data URL.

   The catalogue and the gallery used to be a single tall canvas with one
   scissor viewport per tile. That works for a dozen levels and silently
   breaks at fifty: the canvas reached 3528px tall, doubled again by the
   device pixel ratio, and everything past the browser's canvas area cap
   came out blank. Pages of <img> have no such ceiling, scroll properly,
   and cost one small WebGL surface between them however long the library
   gets.
   ============================================================ */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { finishOf, woodGrainCanvas } from './themes.js?v=1785541867';

const W = 300;
const H = 276;

const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(2);
renderer.setSize(W, H, false);

const scene = new THREE.Scene();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xfff4fa, 0xd8c6d4, 1.15));
const key = new THREE.DirectionalLight(0xfff6f2, 1.45);
key.position.set(6, 11, 8);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8f0ff, 0.5);
fill.position.set(-7, 4, -5);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);
const geometry = new RoundedBoxGeometry(0.93, 0.93, 0.93, 4, 0.1);

/* This renderer has its own WebGL context, so it needs its own texture
   object — but the grain image itself comes from themes.js, so the wood in
   a thumbnail is pixel-for-pixel the wood in the game. */
let grain = null;

function woodTexture() {
  if (!grain) {
    grain = new THREE.CanvasTexture(woodGrainCanvas());
    grain.colorSpace = THREE.SRGBColorSpace;
    grain.anisotropy = 4;
  }
  return grain;
}

/* The theme is passed in, not owned here: the game, the shelf and the
   catalogue all colour a sculpture from its pack's theme, so a sculpture
   looks the same wherever it appears. That now covers the material finish
   as well as the ramp — a wooden pack must not turn back into stone the
   moment it appears in the Collection. */
const colours = new Map();

export function layerMaterial(theme, y, maxY) {
  const { ramp } = theme;
  const finish = finishOf(theme);
  const t = maxY > 1 ? y / (maxY - 1) : 0;
  const cacheKey = `${ramp.join('')}|${theme.material || 'stone'}|${t.toFixed(3)}`;
  if (colours.has(cacheKey)) return colours.get(cacheKey);

  const scaled = t * (ramp.length - 1);
  const i = Math.min(Math.floor(scaled), ramp.length - 2);
  const colour = new THREE.Color(ramp[i])
    .lerp(new THREE.Color(ramp[i + 1]), scaled - i);

  // Gain first: the grain multiplies this back down to the ramp on average.
  if (finish) colour.multiplyScalar(finish.gain);

  const made = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: finish ? finish.roughness : 0.62,
    map: finish ? woodTexture() : null,
  });
  colours.set(cacheKey, made);
  return made;
}

export const blankMaterial = new THREE.MeshStandardMaterial(
  { color: 0xded2da, roughness: 0.8 });

/* cells: iterable of {x,y,z}. materialFor(y) picks the look. */
export function thumbnail(cells, grid, materialFor) {
  const group = new THREE.Group();

  for (const cell of cells) {
    const mesh = new THREE.Mesh(geometry, materialFor(cell.y));
    mesh.position.set(
      cell.x - (grid.x - 1) / 2,
      cell.y - (grid.y - 1) / 2,
      cell.z - (grid.z - 1) / 2);
    group.add(mesh);
  }
  scene.add(group);

  // Bounding sphere: thumbnails want consistent margins across a grid far
  // more than they want every last pixel of size.
  const radius = 0.5 * Math.hypot(grid.x, grid.y, grid.z);
  const tanV = Math.tan((camera.fov * Math.PI) / 180 / 2);
  const dist = (radius * 1.35) / Math.min(tanV, tanV * camera.aspect);

  camera.position.set(0.62, 0.52, 0.62).setLength(dist);
  camera.position.y += 0.35;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/png');

  scene.remove(group);
  return url;
}
