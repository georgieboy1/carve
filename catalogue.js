/* ============================================================
   CARVE — level catalogue
   KG Studio
   ------------------------------------------------------------
   Answers "how many levels could we make, and how would they look?"

   The important part isn't the render, it's the AUTHORING FORMAT in
   shapes.js. Every shape is a stack of text maps, bottom layer first:
   '#' is stone, '.' is air, '-' is outside the starting mass. A level is a
   dozen short strings, so a designer draws one in minutes without touching
   code, and the validator checks it stands before it ever reaches a player.
   ============================================================ */

import { LEVELS, parse, validate } from './shapes.js';
import { thumbnail, layerMaterial } from './thumbs.js';
import { themeForShape } from './themes.js';

const grid = document.getElementById('grid');

/* Play order, grouped by pack — the same order the game and the shelf use,
   so a sculpture sits in the same place in all three. (This was briefly
   sorted to float the newest collections to the top for review, which
   silently moved every other sculpture.) */
const rows = LEVELS.map((shape) => {
  const { cells, grid: g } = parse(shape);
  const report = validate(shape);
  const theme = themeForShape(shape.name);
  const url = thumbnail(cells.values(), g, (y) => layerMaterial(theme, y, g.y));
  return { shape, report, g, kept: cells.size, url };
});

grid.innerHTML = rows.map((r) => `
  <figure class="tile">
    <img src="${r.url}" alt="${r.shape.name} sculpture" width="300" height="276">
    <figcaption>
      <b>${r.shape.name}</b>
      <span>${r.shape.category}</span>
      <i>${r.g.x}×${r.g.y}×${r.g.z} &middot; ${r.kept} kept &middot; ${r.report.carve} to carve</i>
    </figcaption>
  </figure>`).join('');

const carves = rows.map((r) => r.report.carve);
document.getElementById('summary').textContent =
  `${rows.length} sculptures · all validated standing · `
  + `${Math.min(...carves)}–${Math.max(...carves)} blocks to carve`;

console.table(rows.map((r) => ({
  name: r.shape.name,
  category: r.shape.category,
  grid: r.report.grid,
  kept: r.kept,
  carve: r.report.carve,
  stands: r.report.stands,
})));

window.Catalogue = { LEVELS, rows };
