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

export const PALETTE = ['#f7c3d5', '#dfc9f2', '#c3e5f1', '#c7efdf'];

const colours = new Map();

export function layerMaterial(y, maxY) {
  const t = maxY > 1 ? y / (maxY - 1) : 0;
  const cacheKey = t.toFixed(3);
  if (colours.has(cacheKey)) return colours.get(cacheKey);

  const i = Math.min(Math.floor(t * (PALETTE.length - 1)), PALETTE.length - 2);
  const colour = new THREE.Color(PALETTE[i])
    .lerp(new THREE.Color(PALETTE[i + 1]), t * (PALETTE.length - 1) - i);
  const made = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.62 });
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
