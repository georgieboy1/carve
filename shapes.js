/* ============================================================
   CARVE — level data
   KG Studio
   ------------------------------------------------------------
   Pure data plus the two functions that make sense of it. No renderer, no
   three.js, so this file can be linted, unit-tested and validated headlessly
   in CI — a level library only stays trustworthy if a machine checks it.

   AUTHORING FORMAT: a shape is a stack of text maps, bottom layer first.
   '#' is stone, '.' is air. Rows run along Z, characters along X. A level is
   a dozen short strings, so a designer draws one in minutes without opening
   the engine.
   ============================================================ */

const S = (name, category, layers) => ({ name, category, layers });

/* A standing glyph. Rows are written TOP-DOWN the way you'd draw them and
   extruded `depth` deep, which saves writing every letter out twice.

   The catch worth knowing: a glyph has to be 4-connected in the X-Y plane.
   Diagonals are not support, so a classic pointed V or a bitmap X floats
   apart and the validator rejects it. Strokes are stepped with a shared
   cell at every corner instead. */
/* Glyphs are drawn flat and extruded. The shell is added here rather than in
   every literal: one blank column each side, one blank slice front and back,
   and a blank layer on top. Never underneath — the sculpture has to keep
   touching the ground or it floats the moment the layer below is carved. */
const G = (name, category, depth, rows) => {
  const wide = rows.map((row) => `.${row}.`);
  const empty = '.'.repeat(wide[0].length);
  /* A blank SLICE front and back, not a deeper extrusion. Increasing depth
     would repeat the glyph into the new slices and add sculpture, which is
     the opposite of the point — the shell has to be stone to carve away. */
  const layers = [...wide].reverse().map((row) => [empty, ...Array(depth).fill(row), empty]);
  const blank = Array(depth + 2).fill(empty);
  return S(name, category, [...layers, blank]);
};


export const SHAPES = [
  /* ---------- Starters (kept from the first pass) ---------- */
  S('Pillar', 'architecture', [
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....']
  ]),

  S('Arch', 'architecture', [
    ['.......', '.#...#.', '.#...#.', '.#...#.', '.......'],
    ['.......', '.#...#.', '.#...#.', '.#...#.', '.......'],
    ['.......', '.#...#.', '.#...#.', '.#...#.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......']
  ]),

  S('Steps', 'architecture', [
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..####.', '..####.', '..####.', '.......'],
    ['.......', '...###.', '...###.', '...###.', '.......'],
    ['.......', '....##.', '....##.', '....##.', '.......'],
    ['.......', '.....#.', '.....#.', '.....#.', '.......']
  ]),

  S('Gateway', 'architecture', [
    ['.......', '.#...#.', '.#...#.', '.#...#.', '.......'],
    ['.......', '.#...#.', '.#...#.', '.#...#.', '.......'],
    ['.......', '.#...#.', '.#...#.', '.#...#.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.#.#.#.', '.#####.', '.#.#.#.', '.......']
  ]),

  S('Keep', 'architecture', [
    ['......', '.####.', '.####.', '.####.', '.####.', '......'],
    ['......', '.####.', '.####.', '.####.', '.####.', '......'],
    ['......', '.####.', '.#..#.', '.#..#.', '.####.', '......'],
    ['......', '.####.', '.#..#.', '.#..#.', '.####.', '......'],
    ['......', '.####.', '.#..#.', '.#..#.', '.####.', '......'],
    ['......', '.#..#.', '......', '......', '.#..#.', '......']
  ]),

  /* ---------- Architecture & structures ---------- */
  S('Lighthouse', 'architecture', [
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....']
  ]),

  S('Obelisk', 'architecture', [
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....']
  ]),

  S('Pyramid', 'architecture', [
    ['.......', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......'],
    ['.......', '.......', '.......', '...#...', '.......', '.......', '.......']
  ]),

  S('Ziggurat', 'architecture', [
    ['.......', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......'],
    ['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......']
  ]),

  S('Bridge', 'architecture', [
    ['.........', '.##...##.', '.##...##.', '.##...##.', '.........'],
    ['.........', '.#.....#.', '.#.....#.', '.#.....#.', '.........'],
    ['.........', '.#######.', '.#######.', '.#######.', '.........'],
    ['.........', '.#######.', '.........', '.#######.', '.........']
  ]),

  S('Aqueduct', 'architecture', [
    ['.........', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '.........'],
    ['.........', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '.........'],
    ['.........', '.#######.', '.#######.', '.#######.', '.........'],
    ['.........', '.#######.', '.#.....#.', '.#######.', '.........']
  ]),

  S('Windmill', 'architecture', [
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '...#...', '.#####.', '...#...', '.......'],
    ['.......', '.......', '...#...', '.......', '.......']
  ]),

  S('Clocktower', 'architecture', [
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '...#...', '..###..', '...#...', '.......']
  ]),

  S('Well', 'architecture', [
    ['.......', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.#####.', '.#...#.', '.#...#.', '.#...#.', '.#####.', '.......'],
    ['.......', '.#...#.', '.#...#.', '.#...#.', '.#...#.', '.#...#.', '.......'],
    ['.......', '.#####.', '.#...#.', '.#...#.', '.#...#.', '.#####.', '.......']
  ]),

  /* ---------- Animals & creatures ---------- */
  S('Turtle', 'creatures', [
    ['.......', '.##.##.', '.#####.', '.#####.', '.#####.', '.##.##.', '.......'],
    ['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......'],
    ['.......', '.......', '...#...', '..###..', '...#...', '.......', '.......']
  ]),

  S('Frog', 'creatures', [
    ['.......', '.##.##.', '.#####.', '.#####.', '.#####.', '.##.##.', '.......'],
    ['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......'],
    ['.......', '.......', '..#.#..', '.......', '.......', '.......', '.......']
  ]),

  S('Snail', 'creatures', [
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '...#...', '..###..', '...#...', '.......']
  ]),

  S('Bear', 'creatures', [
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..#.#..', '.......', '..#.#..', '.......']
  ]),

  S('Dragon', 'creatures', [
    ['.........', '...###...', '..#####..', '...###...', '.........'],
    ['.........', '.#######.', '..#####..', '.#######.', '.........'],
    ['.........', '.....#...', '...###...', '.....#...', '.........'],
    ['.........', '.....##..', '....###..', '.....##..', '.........']
  ]),

  S('Butterfly', 'creatures', [
    ['.......', '.##.##.', '.##.##.', '...#...', '.##.##.', '.##.##.', '.......'],
    ['.......', '.......', '...#...', '...#...', '...#...', '.......', '.......']
  ]),

  S('Whale', 'creatures', [
    ['.........', '...####..', '.#######.', '...####..', '.........'],
    ['.........', '.#.####..', '.#######.', '.#.####..', '.........'],
    ['.........', '.....#...', '....##...', '.....#...', '.........']
  ]),

  S('Bird', 'creatures', [
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '...#...', '...##..', '...#...', '.......']
  ]),

  S('Fish', 'creatures', [
    ['.........', '...###...', '..#####..', '...###...', '.........'],
    ['.........', '.#######.', '.#######.', '.#######.', '.........'],
    ['.........', '...###.#.', '..######.', '...###.#.', '.........']
  ]),

  /* ---------- Nature & botanicals ---------- */
  S('Pine tree', 'nature', [
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '..###..', '.#####.', '..###..', '.......'],
    ['.......', '...#...', '..###..', '...#...', '.......'],
    ['.......', '.......', '...#...', '.......', '.......']
  ]),

  S('Cactus', 'nature', [
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '..#..', '.#.#.', '..#..', '.....'],
    ['.....', '.....', '.#.#.', '.....', '.....']
  ]),

  S('Mushroom', 'nature', [
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....']
  ]),

  S('Flower', 'nature', [
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.....', '..#..', '.....', '.....']
  ]),

  S('Acorn', 'nature', [
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....']
  ]),

  S('Pinecone', 'nature', [
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.....', '..#..', '.....', '.....']
  ]),

  /* ---------- Objects & artifacts ---------- */
  S('Sword', 'objects', [
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....']
  ]),

  S('Crown', 'objects', [
    ['.......', '.#####.', '.#...#.', '.#...#.', '.#...#.', '.#####.', '.......'],
    ['.......', '.#####.', '.#...#.', '.#...#.', '.#...#.', '.#####.', '.......'],
    ['.......', '.#.#.#.', '.......', '.#...#.', '.......', '.#.#.#.', '.......']
  ]),

  S('Key', 'objects', [
    ['.....', '.....', '.###.', '.....', '.....'],
    ['.....', '.....', '.###.', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '.###.', '.....', '.....'],
    ['.....', '.....', '.#.#.', '.....', '.....'],
    ['.....', '.....', '.###.', '.....', '.....']
  ]),

  S('Treasure chest', 'objects', [
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '.#####.', '..###..', '.......'],
    ['.......', '.......', '..###..', '.......', '.......']
  ]),

  S('Anvil', 'objects', [
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......']
  ]),

  S('Vase', 'objects', [
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......']
  ]),

  S('Lantern', 'objects', [
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '.......', '...#...', '.......', '.......']
  ]),

  S('Anchor', 'objects', [
    ['.......', '.#...#.', '.#...#.', '.#...#.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '...#...', '..###..', '...#...', '.......']
  ]),

  S('Bench', 'objects', [
    ['.......', '.#...#.', '.......', '.#...#.', '.......'],
    ['.......', '.#...#.', '.......', '.#...#.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.#####.', '.......', '.......', '.......']
  ]),

  /* ---------- Geometric shapes & symbols ---------- */
  S('Diamond', 'symbols', [
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.....', '..#..', '.....', '.....']
  ]),

  S('Crescent moon', 'symbols', [
    ['.......', '...##..', '...##..', '.......'],
    ['.......', '..##...', '..##...', '.......'],
    ['.......', '..#....', '..#....', '.......'],
    ['.......', '..##...', '..##...', '.......'],
    ['.......', '...##..', '...##..', '.......']
  ]),

  S('Cross', 'symbols', [
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '...#...', '...#...', '...#...', '.......']
  ]),

  S('Monolith', 'symbols', [
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....']
  ]),

  S('Heart', 'symbols', [
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.##.##.', '.##.##.', '.##.##.', '.......']
  ]),

  S('Star', 'symbols', [
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '..#.#..', '..#.#..', '..#.#..', '.......']
  ]),

  /* ---------- Vehicles & transport ---------- */
  S('Galleon', 'vehicles', [
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '.#####.', '.#...#.', '.#####.', '.......'],
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '...#...', '...#...', '...#...', '.......']
  ]),

  S('Locomotive', 'vehicles', [
    ['.........', '.#.#.#.#.', '.........', '.#.#.#.#.', '.........'],
    ['.........', '.#######.', '.#######.', '.#######.', '.........'],
    ['.........', '..#####..', '..#####..', '..#####..', '.........'],
    ['.........', '..#..##..', '..#.###..', '..#..##..', '.........']
  ]),

  S('Rocketship', 'vehicles', [
    ['.....', '.#.#.', '..#..', '.#.#.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.....', '..#..', '.....', '.....']
  ]),

  S('Hot air balloon', 'vehicles', [
    ['.......', '..###..', '..###..', '..###..', '.......'],
    ['.......', '...#...', '...#...', '...#...', '.......'],
    ['.......', '..###..', '.#####.', '..###..', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '.#####.', '.#####.', '.#####.', '.......'],
    ['.......', '..###..', '..###..', '..###..', '.......']
  ]),

  S('Submarine', 'vehicles', [
    ['.........', '..#####..', '.#######.', '..#####..', '.........'],
    ['.........', '..#####..', '.#######.', '..#####..', '.........'],
    ['.........', '....#....', '...###...', '....#....', '.........']
  ]),

  S('Spire in stone', 'architecture', [
    ['.......', '.-###-.', '.#####.', '.#####.', '.#####.', '.-###-.', '.......'],
    ['.......', '.-###-.', '.#####.', '.#####.', '.#####.', '.-###-.', '.......'],
    ['.......', '.-...-.', '...#...', '..###..', '...#...', '.-...-.', '.......'],
    ['.......', '.-...-.', '.......', '...#...', '.......', '.-...-.', '.......']
  ]),
  /* ---------- Numerals ---------- */
  G('One', 'numerals', 2, [
    '.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###',
  ]),

  G('Two', 'numerals', 2, [
    '.####', '##..#', '....#', '..###', '.##..', '##...', '#####',
  ]),

  G('Three', 'numerals', 2, [
    '#####', '#...#', '....#', '.####', '....#', '#...#', '#####',
  ]),

  G('Four', 'numerals', 2, [
    '...#.', '..##.', '##.#.', '#..#.', '#####', '...#.', '...#.',
  ]),

  G('Five', 'numerals', 2, [
    '#####', '#....', '#####', '....#', '....#', '##..#', '.####',
  ]),

  /* ---------- Alphabet: the packs spells CARVE ---------- */
  G('Letter C', 'letters', 2, [
    '.###.', '##.##', '#....', '#....', '#....', '##.##', '.###.',
  ]),

  G('Letter A', 'letters', 2, [
    '.###.', '##.##', '#...#', '#####', '#...#', '#...#', '#...#',
  ]),

  G('Letter R', 'letters', 2, [
    '####.', '#...#', '#..##', '####.', '#..#.', '#..#.', '#..#.',
  ]),

  G('Letter V', 'letters', 2, [
    '#...#', '#...#', '#...#', '#...#', '##.##', '.###.', '..#..',
  ]),

  G('Letter E', 'letters', 2, [
    '#####', '#....', '#....', '####.', '#....', '#....', '#####',
  ]),
];

/* ---------- parse ---------- */

export const key = (x, y, z) => `${x},${y},${z}`;

export const OFFSETS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/* Three states per character, so the starting MASS is authored in the same
   map as the sculpture:
     '#'  sculpture — must survive
     '.'  stone     — carve it away
     '-'  air       — never there to begin with, lets a level start as a
                      rough boulder rather than a perfect box */
export function parse(shape) {
  const cells = new Map();
  const mass = new Set();
  const grid = {
    x: shape.layers[0][0].length,
    y: shape.layers.length,
    z: shape.layers[0].length,
  };

  shape.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      [...row].forEach((ch, x) => {
        if (ch === '-' || ch === ' ') return;
        const k = key(x, y, z);
        mass.add(k);
        if (ch === '#') cells.set(k, { x, y, z });
      });
    });
  });

  return { cells, mass, grid };
}

/* ---------- validate ----------
   The authoring constraint the player never sees. Every block must reach
   the ground through other blocks: permits arches, spans and overhangs,
   rejects floating islands. Also catches ragged text maps, which is the
   most likely authoring slip by far. */

export function validate(shape) {
  const { cells, mass, grid } = parse(shape);
  const problems = [];

  const widths = new Set();
  const depths = new Set();
  shape.layers.forEach((layer) => {
    depths.add(layer.length);
    layer.forEach((row) => widths.add(row.length));
  });
  if (widths.size > 1) problems.push('rows are not all the same width');
  if (depths.size > 1) problems.push('layers are not all the same depth');
  if (!cells.size) problems.push('no blocks at all');

  const grounded = new Set();
  const queue = [...cells.values()].filter((c) => c.y === 0);
  queue.forEach((c) => grounded.add(key(c.x, c.y, c.z)));

  while (queue.length) {
    const cell = queue.shift();
    for (const [dx, dy, dz] of OFFSETS) {
      const k = key(cell.x + dx, cell.y + dy, cell.z + dz);
      if (!cells.has(k) || grounded.has(k)) continue;
      grounded.add(k);
      queue.push(cells.get(k));
    }
  }

  const floating = cells.size - grounded.size;
  if (floating) problems.push(`${floating} block(s) float free of the ground`);

  /* REACHABILITY — can the player physically finish this level?

     You can only tap a block that is exposed, and the sculpture is never
     removed. So a waste cell walled in by keepers can never become exposed,
     can never be carved, and `wasteLeft` can never reach zero. The level is
     unwinnable by anyone.

     This shipped three times (Snail, Clocktower, Lantern) as an innocent
     "hollow interior" - a lantern with a cavity, a snail with a hollow
     shell. It looks right in the text map and is invisible in play, because
     the trapped cell is buried inside the shape. Nothing caught it: the
     level stands, the carve count is sane, and it renders correctly. It just
     cannot be completed.

     Flood the empty space around the block and inward through waste only. */
  const outside = new Set();
  const seed = key(-1, -1, -1);
  const pending = [[-1, -1, -1]];
  outside.add(seed);
  while (pending.length) {
    const [x, y, z] = pending.shift();
    for (const [dx, dy, dz] of OFFSETS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < -1 || ny < -1 || nz < -1
        || nx > grid.x || ny > grid.y || nz > grid.z) continue;
      const k = key(nx, ny, nz);
      if (outside.has(k) || cells.has(k)) continue;   // sculpture blocks forever
      outside.add(k);
      pending.push([nx, ny, nz]);
    }
  }
  const sealed = [...mass].filter((k) => !cells.has(k) && !outside.has(k));
  if (sealed.length) {
    problems.push(`${sealed.length} waste cell(s) sealed inside the sculpture `
      + `- UNWINNABLE, they can never be exposed to tap`);
  }

  const carve = mass.size - cells.size;

  /* Session length. The old band was 14–45, chosen before anyone measured
     whether a level could be REASONED out, and it turned out to be the thing
     forcing levels to be unfair.

     Carve count and fairness are the same variable seen twice. carve = box −
     sculpture, and density = sculpture / box, so for a sculpture of a fixed
     size, choosing one fixes the other. Holding carve under 45 held density
     near 53%, and at 53% most clues read 3 or 4 out of 6 neighbours, which is
     close to no information at all. Minesweeper ships around 16%.

     Measured across the library: at 53% only 3 of 60 levels could be finished
     without a blind guess, and 580 guesses were needed in total. Widening the
     block to roughly 22% took that to 33 of 60 and 111 guesses — a fivefold
     improvement from one change.

     So the band moved to 60–200. At about 1.7 seconds a carve that is two to
     five minutes, which is longer than before and squarely on the three
     minutes web portals look for in a retention test. The old band produced
     one-minute sessions that were both too short to retain anyone and too
     dense to be fair. */
  if (carve < 60) problems.push(`only ${carve} to carve — too short`);
  if (carve > 200) problems.push(`${carve} to carve — too long a session`);

  return {
    name: shape.name,
    category: shape.category,
    grid: `${grid.x}x${grid.y}x${grid.z}`,
    box: mass.size,
    kept: cells.size,
    carve,
    stands: floating === 0,
    problems,
  };
}

/* ---------- PACKS ----------
   The shipping unit, and the monetization unit. Two free packs to prove the
   game is worth buying into, then themed sets. */

export const PACKS = [
  /* FIRST CUTS is the tutorial, and it teaches without a word of text. Every
     level here clears the deducibility gate, and they are ordered by keeper
     density — 11%, 33%, 47%, 55%, 60% — because density is what decides how
     informative a clue can be. A sparse box gives up 0s and 1s and cascades
     on its own; a full one makes you chain. So the curve is a real ramp in
     the only variable that governs difficulty, and each level introduces one
     idea by making it the only thing that works:

       Monolith  a hair-thin column in a big box. Almost everything cascades
                 from the opening cut. Teaches what a tap does, that numbers
                 appear on cut faces, and that a 0 means "all clear".
       Pillar    the sculpture now sits exactly where a sweeping player taps.
                 The first slip usually happens here, at full stars, which is
                 how the fail state introduces itself — survivably. Marking
                 is the obvious defence and needs no prompting.
       Pyramid   stepped, so the clue values change layer by layer. Reading
                 a 1 against a 2 is the only way through.
       Arch      the first level with a hole THROUGH it. Teaches that the
                 silhouette, not the surface, is the thing being found.
       Steps     densest of the five, and the first that needs a chain of two
                 deductions rather than one clue read in isolation. */
  { id: 'first-cuts', name: 'First cuts', free: true,
    shapes: ['Monolith', 'Pillar', 'Pyramid', 'Arch', 'Steps'] },

  /* The displaced starters land here and in Landmarks/Workshop below. A
     carved stone acorn is a real finial, and a cut diamond is stonework, so
     the theme survives the reshuffle. */
  { id: 'stonework', name: 'Stonework', free: true,
    shapes: ['Gateway', 'Keep', 'Well', 'Diamond', 'Acorn'] },
  { id: 'landmarks', name: 'Landmarks', free: false,
    shapes: ['Lighthouse', 'Obelisk', 'Ziggurat', 'Clocktower', 'Cross'] },
  { id: 'great-works', name: 'Great works', free: false,
    shapes: ['Bridge', 'Aqueduct', 'Windmill', 'Spire in stone', 'Anvil'] },
  { id: 'menagerie', name: 'Menagerie', free: false,
    shapes: ['Turtle', 'Frog', 'Snail', 'Bear', 'Bird'] },
  { id: 'wild-things', name: 'Wild things', free: false,
    shapes: ['Dragon', 'Butterfly', 'Whale', 'Fish', 'Star'] },
  { id: 'garden', name: 'Garden', free: false,
    shapes: ['Pine tree', 'Cactus', 'Mushroom', 'Flower', 'Pinecone'] },
  { id: 'relics', name: 'Relics', free: false,
    shapes: ['Sword', 'Crown', 'Key', 'Treasure chest', 'Lantern'] },
  { id: 'workshop', name: 'Workshop', free: false,
    shapes: ['Vase', 'Bench', 'Anchor', 'Crescent moon', 'Heart'] },
  { id: 'voyage', name: 'Voyage', free: false,
    shapes: ['Galleon', 'Locomotive', 'Rocketship', 'Hot air balloon', 'Submarine'] },
  { id: 'numerals', name: 'Numerals', free: false,
    shapes: ['One', 'Two', 'Three', 'Four', 'Five'] },
  { id: 'alphabet', name: 'Alphabet', free: false,
    shapes: ['Letter C', 'Letter A', 'Letter R', 'Letter V', 'Letter E'] },
];

export const byName = new Map(SHAPES.map((s) => [s.name, s]));

/* Play order: pack by pack, in the order each pack lists them. */
export const LEVELS = PACKS.flatMap((pack) =>
  pack.shapes.map((name) => ({ ...byName.get(name), pack: pack.id })));

/* Catches the two ways a pack list rots: naming a shape that doesn't exist,
   and leaving a shape stranded in no pack at all. */
export function validatePacks() {
  const problems = [];
  const seen = new Set();

  for (const pack of PACKS) {
    for (const name of pack.shapes) {
      if (!byName.has(name)) problems.push(`${pack.id} lists unknown shape "${name}"`);
      if (seen.has(name)) problems.push(`"${name}" appears in more than one pack`);
      seen.add(name);
    }
  }

  for (const shape of SHAPES) {
    if (!seen.has(shape.name)) problems.push(`"${shape.name}" is in no pack`);
  }

  return problems;
}
