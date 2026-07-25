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

export const SHAPES = [
  /* ---------- Architecture ---------- */
  S('Pillar', 'architecture', [
    ['###', '###', '###'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
  ]),

  S('Arch', 'architecture', [
    ['#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#'],
    ['#####', '#####', '#####'],
  ]),

  S('Gateway', 'architecture', [
    ['##.##', '##.##', '##.##'],
    ['##.##', '##.##', '##.##'],
    ['##.##', '##.##', '##.##'],
    ['#####', '#####', '#####'],
    ['#####', '#####', '#####'],
  ]),

  S('Keep', 'architecture', [
    ['####', '####', '####', '####'],
    ['####', '####', '####', '####'],
    ['####', '#..#', '#..#', '####'],
    ['####', '#..#', '#..#', '####'],
    ['####', '#..#', '#..#', '####'],
    ['#..#', '....', '....', '#..#'],
  ]),

  S('Ziggurat', 'architecture', [
    ['#####', '#####', '#####', '#####', '#####'],
    ['.###.', '.###.', '.###.', '.###.', '.###.'],
    ['..#..', '.###.', '.###.', '.###.', '..#..'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
  ]),

  S('Bridge', 'architecture', [
    ['##...##', '##...##', '##...##'],
    ['#.....#', '#.....#', '#.....#'],
    ['#######', '#######', '#######'],
    ['#.....#', '.......', '#.....#'],
  ]),

  S('Steps', 'architecture', [
    ['#####', '#####', '#####'],
    ['.####', '.####', '.####'],
    ['..###', '..###', '..###'],
    ['...##', '...##', '...##'],
    ['....#', '....#', '....#'],
  ]),

  S('Well', 'architecture', [
    ['#####', '#####', '#####', '#####', '#####'],
    ['#####', '#...#', '#...#', '#...#', '#####'],
    ['#...#', '#...#', '#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#', '#...#', '#...#'],
    ['#####', '#####', '#####', '#####', '#####'],
  ]),

  /* ---------- Nature ---------- */
  S('Tree', 'nature', [
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.###.', '#####', '#####', '#####', '.###.'],
    ['.....', '.###.', '#####', '.###.', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
  ]),

  S('Cactus', 'nature', [
    ['.....', '..#..', '.....'],
    ['.....', '..#..', '.....'],
    ['.....', '#####', '.....'],
    ['.....', '#.#.#', '.....'],
    ['.....', '#.#.#', '.....'],
    ['.....', '..#..', '.....'],
  ]),

  S('Mushroom', 'nature', [
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.###.', '#####', '#####', '#####', '.###.'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
  ]),

  S('Flower', 'nature', [
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
  ]),

  /* ---------- Objects ---------- */
  S('Cup', 'objects', [
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.###.', '.#.#.', '.###.', '.....'],
    ['.###.', '.###.', '.#.#.', '.###.', '.....'],
    ['.###.', '.###.', '.#.#.', '.###.', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
  ]),

  S('Anchor', 'objects', [
    ['#...#', '#...#', '#...#'],
    ['#####', '#####', '#####'],
    ['..#..', '..#..', '..#..'],
    ['#####', '#####', '#####'],
    ['..#..', '.###.', '..#..'],
  ]),

  S('Bench', 'objects', [
    ['#...#', '.....', '#...#'],
    ['#...#', '.....', '#...#'],
    ['#####', '#####', '#####'],
    ['#####', '.....', '.....'],
  ]),

  S('Rocket', 'objects', [
    ['#...#', '.###.', '#...#'],
    ['.###.', '.###.', '.###.'],
    ['.###.', '.###.', '.###.'],
    ['.###.', '.###.', '.###.'],
    ['..#..', '.###.', '..#..'],
    ['.....', '..#..', '.....'],
  ]),

  /* ---------- Symbols ---------- */
  S('Heart', 'symbols', [
    ['..#..', '..#..', '..#..'],
    ['.###.', '.###.', '.###.'],
    ['#####', '#####', '#####'],
    ['##.##', '##.##', '##.##'],
  ]),

  S('Star', 'symbols', [
    ['..#..', '..#..', '..#..'],
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
    ['.#.#.', '.#.#.', '.#.#.'],
  ]),

  /* ---------- Creatures ---------- */
  S('Bird', 'creatures', [
    ['..#..', '..#..', '..#..'],
    ['.###.', '.###.', '.###.'],
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
    ['..#..', '..##.', '..#..'],
  ]),

  S('Fish', 'creatures', [
    ['..###..', '.#####.', '..###..'],
    ['#######', '#######', '#######'],
    ['..###.#', '.######', '..###.#'],
  ]),
];

/* ---------- parse ---------- */

export const key = (x, y, z) => `${x},${y},${z}`;

export const OFFSETS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export function parse(shape) {
  const cells = new Map();
  const grid = {
    x: shape.layers[0][0].length,
    y: shape.layers.length,
    z: shape.layers[0].length,
  };

  shape.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      [...row].forEach((ch, x) => {
        if (ch === '#') cells.set(key(x, y, z), { x, y, z });
      });
    });
  });

  return { cells, grid };
}

/* ---------- validate ----------
   The authoring constraint the player never sees. Every block must reach
   the ground through other blocks: permits arches, spans and overhangs,
   rejects floating islands. Also catches ragged text maps, which is the
   most likely authoring slip by far. */

export function validate(shape) {
  const { cells, grid } = parse(shape);
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

  const box = grid.x * grid.y * grid.z;
  return {
    name: shape.name,
    category: shape.category,
    grid: `${grid.x}x${grid.y}x${grid.z}`,
    box,
    kept: cells.size,
    carve: box - cells.size,
    stands: floating === 0,
    problems,
  };
}
