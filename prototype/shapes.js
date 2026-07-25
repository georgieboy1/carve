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
    ['#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#'],
    ['#####', '#####', '#####'],
    ['#.#.#', '#####', '#.#.#'],
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
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
  ]),

  /* The deck's side rails run the full span. An earlier version put four
     isolated blocks up there and they read as noise, not railings. */
  S('Bridge', 'architecture', [
    ['##...##', '##...##', '##...##'],
    ['#.....#', '#.....#', '#.....#'],
    ['#######', '#######', '#######'],
    ['#######', '.......', '#######'],
  ]),

  S('Steps', 'architecture', [
    ['#####', '#####', '#####'],
    ['.####', '.####', '.####'],
    ['..###', '..###', '..###'],
    ['...##', '...##', '...##'],
    ['....#', '....#', '....#'],
  ]),

  /* Open at the top. Sealing it made a hollow that nobody could see, which
     is a sculpture whose whole point is invisible — the same reason a
     closed cup doesn't work at this resolution. */
  S('Well', 'architecture', [
    ['#####', '#####', '#####', '#####', '#####'],
    ['#####', '#...#', '#...#', '#...#', '#####'],
    ['#...#', '#...#', '#...#', '#...#', '#...#'],
    ['#####', '#...#', '#...#', '#...#', '#####'],
  ]),

  /* ---------- Nature ---------- */
  /* Nature subjects are spindly, and a spindly shape in a big box is nearly
     all air — the old Tree asked for 106 carves. Same silhouettes, drawn in
     tight boxes. */
  S('Tree', 'nature', [
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['.#.', '###', '.#.'],
    ['###', '###', '###'],
    ['...', '.#.', '...'],
  ]),

  S('Cactus', 'nature', [
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['.#.', '#.#', '.#.'],
    ['...', '#.#', '...'],
  ]),

  S('Mushroom', 'nature', [
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['###', '###', '###'],
    ['.#.', '###', '.#.'],
  ]),

  S('Flower', 'nature', [
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
  ]),

  /* ---------- Objects ---------- */
  /* Replaced the Cup: a vessel's defining feature is its hollow, and at this
     resolution the hollow is never visible from outside. A Boat carries the
     same idea with the opening on the silhouette. */
  S('Boat', 'objects', [
    ['.###.', '.###.', '.###.'],
    ['#####', '#...#', '#####'],
    ['..#..', '..#..', '..#..'],
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
    ['#.#', '.#.', '#.#'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
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

  const carve = mass.size - cells.size;

  // Session length is the whole reason this is checked: too few carves and
  // the level is over before it starts, too many and it becomes a chore.
  if (carve < 14) problems.push(`only ${carve} to carve — too short`);
  if (carve > 45) problems.push(`${carve} to carve — too long a session`);

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
  { id: 'first-cuts', name: 'First cuts', free: true,
    shapes: ['Pillar', 'Fish', 'Heart', 'Star'] },
  { id: 'stonework', name: 'Stonework', free: true,
    shapes: ['Arch', 'Steps', 'Gateway', 'Keep'] },
  { id: 'landmarks', name: 'Landmarks', free: false,
    shapes: ['Bridge', 'Ziggurat', 'Well', 'Anchor'] },
  { id: 'garden', name: 'Garden', free: false,
    shapes: ['Tree', 'Cactus', 'Mushroom', 'Flower'] },
  { id: 'workshop', name: 'Workshop', free: false,
    shapes: ['Boat', 'Bench', 'Rocket', 'Bird'] },
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
