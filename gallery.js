/* ============================================================
   CARVE — collection
   KG Studio
   ------------------------------------------------------------
   The shelf, the level select and the shop, on one screen.

   It is the monetization surface, not a nicety: people buy the Garden pack
   because their shelf has a gap in it. Revealed sculptures stand in colour;
   everything else shows the UNCARVED MASS rather than a grey copy of the
   sculpture, because showing the silhouette would hand over the answer to a
   puzzle the player has not played yet.

   Thumbnails render to images rather than into one tall canvas. With ten
   packs that canvas ran past the browser's size ceiling and every row below
   the fold came out blank.
   ============================================================ */

import { PACKS, byName, parse } from './shapes.js?v=1785541867';
import { thumbnail, layerMaterial, blankMaterial } from './thumbs.js?v=1785541867';
import { themeFor } from './themes.js?v=1785541867';

const SAVE_KEY = 'carve.save';

function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return { best: {}, owned: PACKS.filter((p) => p.free).map((p) => p.id), ...data };
  } catch {
    return { best: {}, owned: PACKS.filter((p) => p.free).map((p) => p.id) };
  }
}

const save = readSave();
save.best = save.best || {};
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

/* ---------- build ---------- */

const shelf = document.getElementById('shelf');
let levelIndex = 0;
let carved = 0;

// Zen rides along with any pack, so say so where the money is actually
// asked for rather than only in a sheet the player may never open.
const carriesZen = !save.zenUnlocked
  && !PACKS.some((p) => !p.free && save.owned.includes(p.id));

for (const pack of PACKS) {
  const unlocked = owns(pack);
  const theme = themeFor(pack.id);
  const done = pack.shapes.filter((n) => save.best[n]).length;

  const section = document.createElement('section');
  section.className = 'pack';
  // Each shelf row sits on a whisper of its own pack's sky.
  section.style.background =
    `linear-gradient(180deg, ${theme.bg[0]} 0%, ${theme.bg[2]} 100%)`;

  const head = document.createElement('div');
  head.className = 'pack-head';
  head.innerHTML = `<b>${pack.name}</b>`;

  if (unlocked) {
    head.insertAdjacentHTML('beforeend',
      `<span class="tally">${done}/${pack.shapes.length}</span>`);
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'unlock';
    button.textContent = carriesZen ? 'Unlock — with Zen' : 'Unlock pack';
    button.addEventListener('click', () => {
      save.owned.push(pack.id);
      writeSave();
      location.reload();
    });
    head.appendChild(button);
  }

  section.appendChild(head);

  const row = document.createElement('div');
  row.className = 'row';

  for (const name of pack.shapes) {
    const index = levelIndex++;
    const shape = byName.get(name);
    const { cells, mass, grid } = parse(shape);
    const best = save.best[name];
    const isDone = !!best;
    if (isDone) carved++;

    const shown = isDone
      ? [...cells.values()]
      : [...mass].map((k) => {
        const [x, y, z] = k.split(',').map(Number);
        return { x, y, z };
      });

    const url = thumbnail(shown, grid,
      isDone ? (y) => layerMaterial(theme, y, grid.y) : () => blankMaterial);

    const stars = best?.stars ?? 0;
    const label = isDone
      ? `<b>${name}</b><span class="score">${
        best.mode === 'zen' && !stars ? '<i class="zen">zen</i>' : starMarkup(stars)
      }</span>`
      : `<b class="dim">${unlocked ? name : '&#8226; &#8226; &#8226;'}</b>
         <span class="todo">${unlocked ? 'not carved' : 'locked'}</span>`;

    /* This screen IS the level select. Anything in an owned pack is
       playable, carved or not, so a player picks from the set rather than
       being handed whichever level the counter landed on. */
    const tile = document.createElement(unlocked ? 'button' : 'div');
    tile.className = `tile${unlocked ? ' playable' : ''}`;
    if (unlocked) tile.type = 'button';
    tile.innerHTML = `<img src="${url}" alt="${name}" width="300" height="276">
      <figcaption>${label}</figcaption>`;

    if (unlocked) {
      tile.setAttribute('aria-label',
        `${name}, ${isDone ? 'carved' : 'not carved'} — play`);
      tile.addEventListener('click', () => { location.href = `./?level=${index}`; });
    }

    row.appendChild(tile);
  }

  section.appendChild(row);
  shelf.appendChild(section);
}

document.getElementById('tally').textContent = `${carved} / ${levelIndex} carved`;

window.Gallery = { save, PACKS, carved, total: levelIndex };
